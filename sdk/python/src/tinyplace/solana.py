from __future__ import annotations

import asyncio
import base64
import re
from typing import Any, Awaitable, Callable

import aiohttp
from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from solders.transaction import Transaction

from .crypto import decode_base58
from .signer import Signer
from .x402 import build_x402_payment_map

SOLANA_MAINNET_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
SOLANA_NATIVE_ASSET = "SOL"
# Mainnet USDC SPL mint (6 decimals). Devnet / custom deployments pass an
# explicit mint instead.
SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
SOLANA_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
# The ComputeBudget program (sets the compute unit limit + price).
SOLANA_COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111"
USDC_DECIMALS = 6
SOLANA_NATIVE_DECIMALS = 9
# Default compute unit limit for the facilitator transfer (matches the web app).
FACILITATOR_COMPUTE_UNIT_LIMIT = 40_000
# Default compute unit price in microlamports/CU (well under the 5,000,000 cap).
FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = "1"
# Mainnet wrapped-SOL (WSOL) SPL mint.
SOLANA_WSOL_MINT = "So11111111111111111111111111111111111111112"

_BASE58_MINT_PATTERN = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")

# Hardcoded asset table: symbol -> (mint, decimals). The x402 challenge now
# advertises the on-chain SPL *mint address* in `asset` (per the exact-scheme
# spec), not a symbol like "USDC", so clients resolve the mint they echo back to
# the server from this table. A `/solana`-backed resolver can replace it later;
# these mints are stable. CASH has no fixed mainnet mint (resolved per
# environment), so it is intentionally absent here.
_SOLANA_ASSETS: dict[str, tuple[str, int]] = {
    "SOL": ("", SOLANA_NATIVE_DECIMALS),
    "USDC": (SOLANA_USDC_MINT, USDC_DECIMALS),
    "WSOL": (SOLANA_WSOL_MINT, SOLANA_NATIVE_DECIMALS),
}


def is_likely_mint_address(value: str) -> bool:
    """Return True when value looks like a base58 SPL mint address (not a symbol)."""
    return bool(_BASE58_MINT_PATTERN.match(value.strip()))


def resolve_solana_asset(value: str | None) -> tuple[str, int] | None:
    """Resolve an x402 ``asset`` to ``(mint, decimals)``.

    The value may be a symbol ("USDC") or — as the 402 challenge now advertises —
    an on-chain SPL mint address, matched case-insensitively. The mint is "" for
    native SOL. An unknown but base58-shaped value is treated as a bare mint with
    6 decimals so a payment can still settle. Returns ``None`` for an empty value
    or an unknown non-address symbol.
    """
    raw = (value or "").strip()
    if raw == "":
        return None
    upper = raw.upper()
    if upper in _SOLANA_ASSETS:
        return _SOLANA_ASSETS[upper]
    for mint, decimals in _SOLANA_ASSETS.values():
        if mint and mint.lower() == raw.lower():
            return (mint, decimals)
    if is_likely_mint_address(raw):
        return (raw, USDC_DECIMALS)
    return None


def solana_asset_symbol(value: str | None) -> str:
    """Friendly display symbol for an x402 ``asset`` (symbol or mint address).

    Echoes the trimmed input back when it matches no known asset.
    """
    raw = (value or "").strip()
    upper = raw.upper()
    if upper in _SOLANA_ASSETS:
        return upper
    for symbol, (mint, _decimals) in _SOLANA_ASSETS.items():
        if mint and mint.lower() == raw.lower():
            return symbol
    return raw


RpcRequest = Callable[[str, list[Any]], Awaitable[Any]]


async def execute_solana_payment(
    *,
    rpc_url: str,
    secret_key: str | bytes,
    payment: dict[str, Any],
    network: str | None = None,
    native_asset: str = SOLANA_NATIVE_ASSET,
    mint: str | None = None,
    decimals: int | None = None,
    source_token_account: str | None = None,
    destination_token_account: str | None = None,
    commitment: str = "confirmed",
    confirmation_polls: int = 20,
    rpc_request: RpcRequest | None = None,
) -> dict[str, str]:
    if network is not None and payment["network"] != network:
        raise ValueError(f"Unexpected Solana network: {payment['network']} (expected {network})")
    if network is None and not str(payment["network"]).startswith("solana:"):
        raise ValueError(f"Unsupported Solana network: {payment['network']}")

    asset = str(payment["asset"])
    is_native = asset.upper() == native_asset.upper()
    # The x402 challenge advertises the SPL mint address in `asset` now; resolve
    # the mint + decimals from it. Explicit `mint`/`decimals` arguments still win.
    resolved = None if is_native else resolve_solana_asset(asset)
    if mint is None and resolved is not None and resolved[0]:
        mint = resolved[0]
    if decimals is None:
        decimals = resolved[1] if resolved is not None else USDC_DECIMALS
    if not is_native and mint is None:
        raise ValueError(
            f'Unsupported Solana asset: {asset} '
            f'(provide a mint, or use the native "{native_asset}" asset)'
        )

    keypair = _keypair_from_secret(secret_key)
    payer = str(keypair.pubkey())
    amount = str(payment["amount"])
    to = str(payment["to"])
    request = rpc_request or _aiohttp_rpc_request(rpc_url)

    # Native SOL: a System-program lamport transfer, payer -> recipient wallet.
    if is_native:
        latest = await request("getLatestBlockhash", [{"commitment": commitment}])
        tx = _native_transfer_transaction(
            keypair=keypair,
            to=to,
            amount=int(amount),
            blockhash=latest["value"]["blockhash"],
        )
        signature = await _send_transaction(request, tx, commitment)
        await _confirm_signature(request, signature, commitment, confirmation_polls)
        return {
            "signature": signature,
            "from": payer,
            "to": to,
            "mint": native_asset,
            "amount": amount,
            "sourceTokenAccount": payer,
            "destinationTokenAccount": to,
        }

    # SPL token (e.g. USDC) via TransferChecked. Token-account lookups happen
    # before the blockhash fetch to match the TS SDK's RPC ordering.
    resolved_mint = mint or SOLANA_USDC_MINT
    source = source_token_account or await _find_token_account(
        request, owner=payer, mint=resolved_mint, minimum_amount=amount
    )
    destination = destination_token_account or await _find_token_account(
        request, owner=to, mint=resolved_mint
    )
    latest = await request("getLatestBlockhash", [{"commitment": commitment}])
    tx = _token_transfer_checked_transaction(
        keypair=keypair,
        source=source,
        destination=destination,
        mint=resolved_mint,
        amount=int(amount),
        decimals=decimals,
        blockhash=latest["value"]["blockhash"],
    )
    signature = await _send_transaction(request, tx, commitment)
    await _confirm_signature(request, signature, commitment, confirmation_polls)
    return {
        "signature": signature,
        "from": payer,
        "to": to,
        "mint": resolved_mint,
        "amount": amount,
        "sourceTokenAccount": source,
        "destinationTokenAccount": destination,
    }


async def execute_solana_x402_payment(
    *,
    signer: Signer,
    rpc_url: str,
    secret_key: str | bytes,
    payment: dict[str, Any],
    mint: str | None = None,
    decimals: int | None = None,
    source_token_account: str | None = None,
    destination_token_account: str | None = None,
    commitment: str = "confirmed",
    confirmation_polls: int = 20,
    rpc_request: RpcRequest | None = None,
) -> dict[str, Any]:
    execution = await execute_solana_payment(
        rpc_url=rpc_url,
        secret_key=secret_key,
        payment=payment,
        mint=mint,
        decimals=decimals,
        source_token_account=source_token_account,
        destination_token_account=destination_token_account,
        commitment=commitment,
        confirmation_polls=confirmation_polls,
        rpc_request=rpc_request,
    )
    payment_map = await build_x402_payment_map(
        signer,
        {
            **payment,
            "onChainTx": execution["signature"],
            "tx": execution["signature"],
            "transaction": execution["signature"],
        },
    )
    return {**execution, "payment": payment_map}


async def build_payer_signed_delegated_tx(
    *,
    rpc_url: str,
    fee_payer: str,
    payee: str,
    amount: str,
    mint: str,
    decimals: int,
    secret_key: str | bytes,
    source_token_account: str | None = None,
    destination_token_account: str | None = None,
    compute_unit_limit: int = FACILITATOR_COMPUTE_UNIT_LIMIT,
    compute_unit_price_micro_lamports: str = FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
    rpc_request: RpcRequest | None = None,
) -> str:
    """Build the gasless (facilitator fee-paid) x402 "exact" Solana transfer and
    partially sign it with the agent's keypair.

    The transaction is ``[SetComputeUnitLimit, SetComputeUnitPrice,
    TransferChecked]`` with the facilitator (``fee_payer``) as account 0 (the fee
    payer) and the agent as the transfer authority (a read-only second signer).
    Only the agent signature is filled; the fee-payer signature slot is left zeroed
    for the facilitator to co-sign and broadcast at settle time. Returns the base64
    wire transaction to attach as the x402 payment's ``metadata.delegatedTx``.

    The payee's destination token account must already exist — the exact scheme
    forbids ATA creation in the payment transaction. Mirrors the TS SDK's
    ``buildPayerSignedDelegatedTx``.
    """
    keypair = _keypair_from_secret(secret_key)
    payer = str(keypair.pubkey())
    normalized_amount = _normalized_amount(amount)
    request = rpc_request or _aiohttp_rpc_request(rpc_url)

    source = source_token_account or await _find_token_account(
        request, owner=payer, mint=mint, minimum_amount=normalized_amount
    )
    destination = destination_token_account or await _find_token_account(
        request, owner=payee, mint=mint
    )
    latest = await request("getLatestBlockhash", [{"commitment": "confirmed"}])

    message = _two_signer_facilitator_message(
        fee_payer=fee_payer,
        authority=payer,
        source_token_account=source,
        destination_token_account=destination,
        mint=mint,
        amount=normalized_amount,
        decimals=decimals,
        compute_unit_limit=compute_unit_limit,
        compute_unit_price_micro_lamports=compute_unit_price_micro_lamports,
        blockhash=latest["value"]["blockhash"],
    )
    # Sign as the authority (signer index 1). The fee-payer slot (index 0) is left
    # empty for the facilitator to fill at settle time.
    authority_signature = bytes(keypair.sign_message(message))
    empty_fee_payer_signature = b"\x00" * 64
    wire = _short_vec(2) + empty_fee_payer_signature + authority_signature + message
    return base64.b64encode(wire).decode("ascii")


async def build_delegated_x402_payment_map(
    *,
    signer: Signer,
    rpc_url: str,
    fee_payer: str,
    payment: dict[str, Any],
    mint: str,
    decimals: int,
    secret_key: str | bytes,
    from_address: str | None = None,
    source_token_account: str | None = None,
    destination_token_account: str | None = None,
    compute_unit_limit: int = FACILITATOR_COMPUTE_UNIT_LIMIT,
    compute_unit_price_micro_lamports: str = FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
    rpc_request: RpcRequest | None = None,
) -> dict[str, str]:
    """Build the agent-signed facilitator transfer and fold it into a complete
    x402 payment map (with the wire transaction under ``metadata.delegatedTx``),
    ready to resubmit to the paid endpoint. The backend routes any payment carrying
    ``metadata.delegatedTx`` to the facilitator. Mirrors the TS SDK's
    ``buildDelegatedX402PaymentMap``.
    """
    wire = await build_payer_signed_delegated_tx(
        rpc_url=rpc_url,
        fee_payer=fee_payer,
        payee=str(payment["to"]),
        amount=str(payment["amount"]),
        mint=mint,
        decimals=decimals,
        secret_key=secret_key,
        source_token_account=source_token_account,
        destination_token_account=destination_token_account,
        compute_unit_limit=compute_unit_limit,
        compute_unit_price_micro_lamports=compute_unit_price_micro_lamports,
        rpc_request=rpc_request,
    )
    return await build_x402_payment_map(
        signer,
        {
            "network": payment["network"],
            "asset": payment["asset"],
            "amount": payment["amount"],
            "to": payment["to"],
            "from": from_address,
            "metadata": {
                **(payment.get("metadata") or {}),
                "delegatedTx": wire,
            },
        },
    )


def _two_signer_facilitator_message(
    *,
    fee_payer: str,
    authority: str,
    source_token_account: str,
    destination_token_account: str,
    mint: str,
    amount: str,
    decimals: int,
    compute_unit_limit: int,
    compute_unit_price_micro_lamports: str,
    blockhash: str,
) -> bytes:
    """Serialize a two-signer legacy message for the facilitator transfer.

    Account ordering follows Solana's rules: writable signers, then read-only
    signers, then writable non-signers, then read-only non-signers. The fee payer
    must be account 0; the transfer authority is a read-only signer at index 1.
    Mirrors the TS SDK's ``twoSignerFacilitatorMessage``.
    """
    # 0: feePayer (writable signer), 1: authority (read-only signer),
    # 2: source, 3: destination (writable non-signers),
    # 4: mint, 5: token program, 6: compute budget program (read-only non-signers).
    account_keys = [
        fee_payer,
        authority,
        source_token_account,
        destination_token_account,
        mint,
        SOLANA_TOKEN_PROGRAM_ID,
        SOLANA_COMPUTE_BUDGET_PROGRAM_ID,
    ]
    header = bytes([2, 1, 3])

    # SetComputeUnitLimit: u8 discriminant (2) + u32 LE limit.
    compute_limit_data = bytes([2]) + int(compute_unit_limit).to_bytes(4, "little")
    # SetComputeUnitPrice: u8 discriminant (3) + u64 LE microlamports.
    compute_price_data = bytes([3]) + int(compute_unit_price_micro_lamports).to_bytes(8, "little")
    # TransferChecked: u8 discriminant (12) + u64 LE amount + u8 decimals.
    transfer_data = bytes([12]) + int(amount).to_bytes(8, "little") + bytes([decimals & 0xFF])

    parts = [
        header,
        _short_vec(len(account_keys)),
        *[decode_base58(key) for key in account_keys],
        decode_base58(blockhash),
        # Three instructions.
        _short_vec(3),
        # ComputeBudget SetComputeUnitLimit (program index 6, no accounts).
        bytes([6]),
        _short_vec(0),
        _short_vec(len(compute_limit_data)),
        compute_limit_data,
        # ComputeBudget SetComputeUnitPrice (program index 6, no accounts).
        bytes([6]),
        _short_vec(0),
        _short_vec(len(compute_price_data)),
        compute_price_data,
        # Token TransferChecked (program index 5): source, mint, dest, authority.
        bytes([5]),
        _short_vec(4),
        bytes([2, 4, 3, 1]),
        _short_vec(len(transfer_data)),
        transfer_data,
    ]
    return b"".join(parts)


def _short_vec(value: int) -> bytes:
    """Encode an unsigned integer as a Solana compact-u16 (shortvec) length."""
    out = bytearray()
    current = value
    while True:
        byte = current & 0x7F
        current >>= 7
        if current > 0:
            byte |= 0x80
        out.append(byte)
        if current == 0:
            break
    return bytes(out)


def _normalized_amount(amount: str) -> str:
    trimmed = str(amount).strip()
    if not trimmed.isdigit() or int(trimmed) <= 0:
        raise ValueError(f"Solana payment amount must be a positive integer: {amount}")
    return trimmed


async def _send_transaction(rpc_request: RpcRequest, tx: Transaction, commitment: str) -> str:
    signature = await rpc_request(
        "sendTransaction",
        [
            base64.b64encode(bytes(tx)).decode("ascii"),
            {
                "encoding": "base64",
                "preflightCommitment": "processed" if commitment == "processed" else "confirmed",
            },
        ],
    )
    return str(signature)


def _native_transfer_transaction(
    *,
    keypair: Keypair,
    to: str,
    amount: int,
    blockhash: str,
) -> Transaction:
    instruction = transfer(
        TransferParams(
            from_pubkey=keypair.pubkey(),
            to_pubkey=Pubkey.from_string(to),
            lamports=amount,
        )
    )
    recent_blockhash = Hash.from_string(blockhash)
    message = Message.new_with_blockhash([instruction], keypair.pubkey(), recent_blockhash)
    return Transaction([keypair], message, recent_blockhash)


def _token_transfer_checked_transaction(
    *,
    keypair: Keypair,
    source: str,
    destination: str,
    mint: str,
    amount: int,
    decimals: int,
    blockhash: str,
) -> Transaction:
    # SPL Token TransferChecked: u8 discriminant (12) + u64 LE amount + u8 decimals.
    # Accounts (in program order): source, mint, destination, owner/authority.
    data = bytes([12]) + int(amount).to_bytes(8, "little") + bytes([decimals & 0xFF])
    accounts = [
        AccountMeta(pubkey=Pubkey.from_string(source), is_signer=False, is_writable=True),
        AccountMeta(pubkey=Pubkey.from_string(mint), is_signer=False, is_writable=False),
        AccountMeta(pubkey=Pubkey.from_string(destination), is_signer=False, is_writable=True),
        AccountMeta(pubkey=keypair.pubkey(), is_signer=True, is_writable=False),
    ]
    instruction = Instruction(Pubkey.from_string(SOLANA_TOKEN_PROGRAM_ID), data, accounts)
    recent_blockhash = Hash.from_string(blockhash)
    message = Message.new_with_blockhash([instruction], keypair.pubkey(), recent_blockhash)
    return Transaction([keypair], message, recent_blockhash)


async def _find_token_account(
    rpc_request: RpcRequest,
    *,
    owner: str,
    mint: str,
    minimum_amount: str | None = None,
) -> str:
    """Resolve ``owner``'s token account for ``mint`` (the one holding enough funds)."""
    response = await rpc_request(
        "getTokenAccountsByOwner",
        [owner, {"mint": mint}, {"encoding": "jsonParsed", "commitment": "confirmed"}],
    )
    minimum = int(minimum_amount) if minimum_amount is not None else None
    for account in (response.get("value") or []) if isinstance(response, dict) else []:
        info = (((account.get("account") or {}).get("data") or {}).get("parsed") or {}).get("info") or {}
        amount_value = (info.get("tokenAmount") or {}).get("amount") or "0"
        if minimum is None or int(amount_value) >= minimum:
            return str(account["pubkey"])
    raise RuntimeError(f"No token account found for {owner} (mint {mint})")


async def _confirm_signature(
    rpc_request: RpcRequest,
    signature: str,
    commitment: str,
    polls: int,
) -> None:
    for _ in range(polls):
        result = await rpc_request(
            "getSignatureStatuses",
            [[signature], {"searchTransactionHistory": True}],
        )
        status = (result.get("value") or [None])[0]
        if status and status.get("err") is not None:
            raise RuntimeError(f"Solana transaction failed: {status['err']}")
        if status and _commitment_satisfied(str(status.get("confirmationStatus") or ""), commitment):
            return
        await asyncio.sleep(0.5)
    raise TimeoutError(f"Timed out waiting for Solana transaction {signature}")


def _commitment_satisfied(actual: str, expected: str) -> bool:
    ranks = {"processed": 0, "confirmed": 1, "finalized": 2}
    return ranks.get(actual, -1) >= ranks.get(expected, 1)


def _keypair_from_secret(secret_key: str | bytes) -> Keypair:
    secret = decode_base58(secret_key) if isinstance(secret_key, str) else secret_key
    if len(secret) == 32:
        return Keypair.from_seed(secret)
    if len(secret) == 64:
        return Keypair.from_bytes(secret)
    raise ValueError(f"Solana secret key must be 32 or 64 bytes, got {len(secret)}")


def _aiohttp_rpc_request(rpc_url: str) -> RpcRequest:
    async def request(method: str, params: list[Any]) -> Any:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                rpc_url,
                json={"jsonrpc": "2.0", "id": method, "method": method, "params": params},
            ) as response:
                payload = await response.json()
        if "error" in payload:
            raise RuntimeError(payload["error"].get("message", payload["error"]))
        return payload.get("result")

    return request
