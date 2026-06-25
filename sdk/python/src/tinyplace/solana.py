from __future__ import annotations

import asyncio
import base64
import re
import secrets
from typing import Any, Awaitable, Callable

import aiohttp
from nacl.signing import SigningKey
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
USDC_DECIMALS = 6
SOLANA_NATIVE_DECIMALS = 9
# Mainnet wrapped-SOL (WSOL) SPL mint.
SOLANA_WSOL_MINT = "So11111111111111111111111111111111111111112"
# The ComputeBudget program (sets the compute unit limit + price).
SOLANA_COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111"
# The SPL Memo program — the exact-SVM scheme requires a Memo for tx uniqueness.
SOLANA_MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
# The SPL Associated Token Account program (derives a wallet's canonical ATA).
SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
# Default compute unit limit for the facilitator transfer (matches the TS SDK / web app).
FACILITATOR_COMPUTE_UNIT_LIMIT = 40_000
# Default compute unit price in microlamports/CU (well under the 5,000,000 cap).
FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = "1"

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


# ---------------------------------------------------------------------------
# Standard x402 v2 exact-SVM transport: ATA derivation + partially-signed
# TransferChecked transaction. Mirrors the TS SDK's ``solana.ts``.
# ---------------------------------------------------------------------------


def derive_associated_token_address(
    owner: str,
    mint: str,
    token_program: str = SOLANA_TOKEN_PROGRAM_ID,
) -> str:
    """Derive the canonical Associated Token Account address for ``owner``/``mint``.

    Matches the destination ATA the x402 exact-SVM facilitator derives from
    ``payTo``+``asset`` when verifying, so the client must transfer to exactly
    this account. Mirrors the TS ``deriveAssociatedTokenAddress`` and the Go
    facilitator: a PDA over ``[owner, tokenProgram, mint]`` under the SPL ATA
    program. ``solders.Pubkey.find_program_address`` runs Solana's exact
    off-curve (sha256 + curve25519 decompress) bump search.
    """
    address, _bump = Pubkey.find_program_address(
        [
            bytes(Pubkey.from_string(owner)),
            bytes(Pubkey.from_string(token_program)),
            bytes(Pubkey.from_string(mint)),
        ],
        Pubkey.from_string(SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID),
    )
    return str(address)


def _short_vec(value: int) -> bytes:
    """Encode ``value`` as a Solana compact-u16 (shortvec) length prefix."""
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


def _encode_instruction(
    program_id_index: int, account_indexes: list[int], data: bytes
) -> bytes:
    """Encode one compiled instruction: programIdIndex, account indexes, data."""
    return (
        bytes([program_id_index])
        + _short_vec(len(account_indexes))
        + bytes(account_indexes)
        + _short_vec(len(data))
        + data
    )


def _random_memo_nonce() -> str:
    """A random >=16-byte hex memo nonce (the exact-SVM uniqueness requirement)."""
    return secrets.token_hex(16)


def build_exact_svm_transfer_transaction(
    *,
    secret_key: str | bytes,
    fee_payer: str,
    pay_to: str,
    mint: str,
    amount: str,
    decimals: int,
    recent_blockhash: str,
    memo: str | None = None,
    source_token_account: str | None = None,
    compute_unit_limit: int = FACILITATOR_COMPUTE_UNIT_LIMIT,
    compute_unit_price_micro_lamports: str = FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
) -> dict[str, str]:
    """Build the x402 ``exact`` payment transaction for Solana (SVM).

    Per ``scheme_exact_svm.md``: a legacy transaction with the static fast-path
    instruction layout ``[SetComputeUnitLimit, SetComputeUnitPrice,
    TransferChecked, Memo]``, fee payer = the facilitator's ``extra.feePayer``
    (account index 0, left UNSIGNED for the facilitator to co-sign), the payer
    signing only as the transfer authority. The destination is the ATA derived
    from ``pay_to``+``mint``; the transfer amount equals the required amount
    exactly.

    Returns a dict with the base64 ``transaction`` (partially signed),
    ``from`` (authority), ``sourceTokenAccount``, ``destinationTokenAccount``,
    and the embedded ``memo``. The client does NOT broadcast it — the facilitator
    co-signs as fee payer and submits it. Mirrors the TS
    ``buildExactSvmTransferTransaction``.
    """
    amount_int = _validate_amount(amount)
    keypair = _keypair_from_secret(secret_key)
    seed_bytes = bytes(keypair.secret())
    authority = str(keypair.pubkey())

    if authority == fee_payer:
        # Fee-payer isolation: the sponsor must not be the transfer authority/source.
        raise ValueError("x402 exact-SVM: fee payer must differ from the paying authority")

    source = source_token_account or derive_associated_token_address(authority, mint)
    destination = derive_associated_token_address(pay_to, mint)
    memo_value = memo if (memo and memo.strip()) else _random_memo_nonce()

    # Account layout (signers first, then writable non-signers, then readonly
    # non-signers). The fee payer MUST be index 0; the authority is a readonly
    # signer; the token accounts are writable non-signers; mint + programs are
    # readonly non-signers.
    account_keys = [
        fee_payer,  # 0: writable signer (fee payer)
        authority,  # 1: readonly signer (transfer authority)
        source,  # 2: writable non-signer
        destination,  # 3: writable non-signer
        mint,  # 4: readonly non-signer
        SOLANA_TOKEN_PROGRAM_ID,  # 5: readonly non-signer
        SOLANA_COMPUTE_BUDGET_PROGRAM_ID,  # 6: readonly non-signer
        SOLANA_MEMO_PROGRAM_ID,  # 7: readonly non-signer
    ]
    # header: 2 required signatures, 1 readonly signed (authority), 4 readonly
    # unsigned (mint, token, compute-budget, memo programs).
    header = bytes([2, 1, 4])

    compute_limit_data = bytes([2]) + int(compute_unit_limit).to_bytes(4, "little")
    compute_price_data = bytes([3]) + int(compute_unit_price_micro_lamports).to_bytes(
        8, "little"
    )
    transfer_data = (
        bytes([12]) + amount_int.to_bytes(8, "little") + bytes([decimals & 0xFF])
    )
    memo_data = memo_value.encode("utf-8")

    message = (
        header
        + _short_vec(len(account_keys))
        + b"".join(decode_base58(key) for key in account_keys)
        + decode_base58(recent_blockhash)
        + _short_vec(4)
        # SetComputeUnitLimit (program 6, no accounts)
        + _encode_instruction(6, [], compute_limit_data)
        # SetComputeUnitPrice (program 6, no accounts)
        + _encode_instruction(6, [], compute_price_data)
        # TransferChecked (program 5): source, mint, destination, authority
        + _encode_instruction(5, [2, 4, 3, 1], transfer_data)
        # Memo (program 7, no accounts)
        + _encode_instruction(7, [], memo_data)
    )

    # Sign only as the authority (signatures[1]); leave the fee payer slot
    # (signatures[0]) zeroed for the facilitator to fill before broadcasting.
    authority_signature = bytes(SigningKey(seed_bytes).sign(message).signature)
    empty_fee_payer_signature = bytes(64)
    transaction = (
        _short_vec(2) + empty_fee_payer_signature + authority_signature + message
    )

    return {
        "transaction": base64.b64encode(transaction).decode("ascii"),
        "from": authority,
        "sourceTokenAccount": source,
        "destinationTokenAccount": destination,
        "memo": memo_value,
    }


async def get_recent_blockhash(
    rpc_url: str,
    *,
    commitment: str = "confirmed",
    rpc_request: RpcRequest | None = None,
) -> str:
    """Fetch a recent blockhash (base58) to anchor a transaction to.

    Used when building an x402 exact-SVM payment the facilitator (not the client)
    broadcasts. Mirrors the TS ``getRecentBlockhash``.
    """
    request = rpc_request or _aiohttp_rpc_request(rpc_url)
    latest = await request("getLatestBlockhash", [{"commitment": commitment}])
    return str(latest["value"]["blockhash"])


def _validate_amount(amount: str) -> int:
    trimmed = str(amount).strip()
    if not trimmed.isdigit() or int(trimmed) <= 0:
        raise ValueError(f"Solana payment amount must be a positive integer: {amount}")
    return int(trimmed)
