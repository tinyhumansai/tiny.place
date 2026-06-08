// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {Escrow, EscrowState} from "./Escrow.sol";

/// @notice x402 payment facilitator — verifies signed payment headers and routes
/// funds into the appropriate escrow. Supports both direct payments (instant settle)
/// and escrow-backed payments (held until delivery confirmation).
contract X402Payment {
    struct PaymentPayload {
        address token;
        uint256 amount;
        address payer;
        address payee;
        uint256 nonce;
        uint256 expiry;
    }

    event PaymentSettled(bytes32 indexed paymentId, address indexed payer, address indexed payee, uint256 amount);
    event PaymentEscrowed(bytes32 indexed paymentId, address indexed escrow);

    error Expired();
    error InvalidSignature();
    error NonceUsed();
    error TransferFailed();

    mapping(address => mapping(uint256 => bool)) public usedNonces;
    mapping(bytes32 => address) public paymentEscrows;

    /// @notice Settle a payment directly (no escrow). Payer must have approved this contract.
    function settle(
        PaymentPayload calldata payload,
        bytes calldata signature
    ) external returns (bytes32 paymentId) {
        paymentId = _verifyAndConsume(payload, signature);

        bool ok = IERC20(payload.token).transferFrom(payload.payer, payload.payee, payload.amount);
        if (!ok) revert TransferFailed();

        emit PaymentSettled(paymentId, payload.payer, payload.payee, payload.amount);
    }

    /// @notice Route a payment into an existing escrow contract, funding it.
    function settleToEscrow(
        PaymentPayload calldata payload,
        bytes calldata signature,
        address escrowAddress
    ) external returns (bytes32 paymentId) {
        paymentId = _verifyAndConsume(payload, signature);

        Escrow escrow = Escrow(payable(escrowAddress));
        (address client,,, address token, uint256 amount, EscrowState state,,) = escrow.details();
        require(client == payload.payer, "payer mismatch");
        require(token == payload.token, "token mismatch");
        require(amount == payload.amount, "amount mismatch");
        require(state == EscrowState.Open, "escrow not open");

        bool ok = IERC20(payload.token).transferFrom(payload.payer, escrowAddress, payload.amount);
        if (!ok) revert TransferFailed();

        paymentEscrows[paymentId] = escrowAddress;
        emit PaymentEscrowed(paymentId, escrowAddress);
    }

    /// @notice Verify the EIP-712 style signature and mark nonce used.
    function _verifyAndConsume(
        PaymentPayload calldata payload,
        bytes calldata signature
    ) internal returns (bytes32 paymentId) {
        if (block.timestamp > payload.expiry) revert Expired();
        if (usedNonces[payload.payer][payload.nonce]) revert NonceUsed();

        paymentId = keccak256(abi.encode(
            payload.token,
            payload.amount,
            payload.payer,
            payload.payee,
            payload.nonce,
            payload.expiry
        ));

        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", paymentId));
        address signer = _recover(ethHash, signature);
        if (signer != payload.payer) revert InvalidSignature();

        usedNonces[payload.payer][payload.nonce] = true;
    }

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(hash, v, r, s);
    }

    function getPaymentId(PaymentPayload calldata payload) external pure returns (bytes32) {
        return keccak256(abi.encode(
            payload.token,
            payload.amount,
            payload.payer,
            payload.payee,
            payload.nonce,
            payload.expiry
        ));
    }
}
