// @vitest-environment node
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { SOLANA_TOKEN_PROGRAM_ID } from "@tinyhumansai/tinyplace";
import { describe, expect, it, vi } from "vitest";

// Stub the RPC so the builder stays a pure assembly test (no network).
vi.mock("./solana-rpc", () => ({
	createSolanaConnection: (): {
		getLatestBlockhash: () => Promise<{ blockhash: string }>;
	} => ({
		getLatestBlockhash: (): Promise<{ blockhash: string }> =>
			Promise.resolve({
				blockhash: new PublicKey(new Uint8Array(32).fill(1)).toBase58(),
			}),
	}),
	primarySolanaRpcUrl: (): string => "http://localhost:8899",
}));

import { buildDelegatedTransferTx } from "./delegated-payment";

const address = (): string => Keypair.generate().publicKey.toBase58();
const zeroSignature = (): Promise<Uint8Array> =>
	Promise.resolve(new Uint8Array(64));
const SESSION_KEY_BASE64 = Buffer.from(
	Keypair.generate().publicKey.toBytes()
).toString("base64");

const TOKEN_APPROVE_CHECKED = 13;
// Explicit mint keeps the test independent of NEXT_PUBLIC_SOLANA_USDC_MINT.
const MINT = address();

describe("buildDelegatedTransferTx", () => {
	it("builds an ATA-create + transfer with no approve by default", async () => {
		const wire = await buildDelegatedTransferTx({
			rpcUrl: "x",
			facilitator: address(),
			payer: address(),
			payee: address(),
			amount: "5000000",
			sessionPublicKeyBase64: SESSION_KEY_BASE64,
			signSession: zeroSignature,
			mint: MINT,
		});
		const tx = Transaction.from(Buffer.from(wire, "base64"));
		expect(tx.instructions).toHaveLength(2);
	});

	it("folds in a leading gasless owner-signed ApproveChecked when requested", async () => {
		const wire = await buildDelegatedTransferTx({
			rpcUrl: "x",
			facilitator: address(),
			payer: address(),
			payee: address(),
			amount: "5000000",
			sessionPublicKeyBase64: SESSION_KEY_BASE64,
			signSession: zeroSignature,
			mint: MINT,
			approve: { allowance: "100000000", signOwner: zeroSignature },
		});
		const tx = Transaction.from(Buffer.from(wire, "base64"));
		expect(tx.instructions).toHaveLength(3);
		const approve = tx.instructions[0];
		expect(approve).toBeDefined();
		expect(approve?.programId.toBase58()).toBe(SOLANA_TOKEN_PROGRAM_ID);
		expect(approve?.data[0]).toBe(TOKEN_APPROVE_CHECKED);
		// Owner (payer) is the third required signer for the gasless approve.
		expect(tx.signatures).toHaveLength(3);
	});
});
