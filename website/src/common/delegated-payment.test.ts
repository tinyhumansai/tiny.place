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

import { buildPayerSignedTransferTx } from "./delegated-payment";

const address = (): string => Keypair.generate().publicKey.toBase58();
// Explicit mint keeps the test independent of NEXT_PUBLIC_SOLANA_USDC_MINT.
const MINT = address();

const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";
const COMPUTE_SET_UNIT_LIMIT = 2;
const COMPUTE_SET_UNIT_PRICE = 3;
const TOKEN_TRANSFER_CHECKED = 12;

describe("buildPayerSignedTransferTx", () => {
	it("emits [computeLimit, computePrice, transferChecked] with the facilitator as fee payer and the payer as authority", async () => {
		const feePayer = address();
		const payer = address();
		const payee = address();

		const wire = await buildPayerSignedTransferTx({
			rpcUrl: "x",
			feePayer,
			payer,
			payee,
			amount: "1000000",
			mint: MINT,
			decimals: 6,
			// Standard x402 partial-sign: return the tx untouched (the payer's
			// signature is applied by the wallet; here we assert structure only).
			signTransaction: (transaction: Transaction): Promise<Transaction> =>
				Promise.resolve(transaction),
		});

		const tx = Transaction.from(Buffer.from(wire, "base64"));

		// Exactly the three exact-scheme instructions, in order.
		expect(tx.instructions).toHaveLength(3);
		expect(tx.instructions[0]?.programId.toBase58()).toBe(
			COMPUTE_BUDGET_PROGRAM_ID
		);
		expect(tx.instructions[0]?.data[0]).toBe(COMPUTE_SET_UNIT_LIMIT);
		expect(tx.instructions[1]?.programId.toBase58()).toBe(
			COMPUTE_BUDGET_PROGRAM_ID
		);
		expect(tx.instructions[1]?.data[0]).toBe(COMPUTE_SET_UNIT_PRICE);

		const transfer = tx.instructions[2];
		expect(transfer?.programId.toBase58()).toBe(SOLANA_TOKEN_PROGRAM_ID);
		expect(transfer?.data[0]).toBe(TOKEN_TRANSFER_CHECKED);

		// Fee payer is the facilitator (account 0); the transfer authority (last
		// key) is the payer, who signs directly — no session delegate.
		expect(tx.feePayer?.toBase58()).toBe(feePayer);
		const authority = transfer?.keys[(transfer?.keys.length ?? 0) - 1];
		expect(authority?.pubkey.toBase58()).toBe(payer);
		expect(authority?.isSigner).toBe(true);
	});
});
