import { assert } from "chai";
import { approve } from "@solana/spl-token";
import {
	Keypair,
	PublicKey,
	Transaction,
	TransactionInstruction,
} from "@solana/web3.js";
import {
	escrowProgram,
	jobProgram,
	payer,
	connection,
	newMint,
	ata,
	fundTokens,
	fundSol,
	tokenBalance,
	createVault,
	initNonce,
	noncePda,
	TOKEN_PROGRAM_ID,
} from "./setup";

// Raw escrow `deposit_for` (mirrors the website builder + backend validator):
// Anchor discriminator + Borsh PaymentPayload(amount,payer,payee,nonce,expiry),
// accounts [vault, nonce_tracker, authority, payer_token, vault_token, token_program].
const DEPOSIT_FOR_DISCRIMINATOR = Buffer.from([
	193, 39, 228, 88, 160, 254, 92, 53,
]);
function u64le(value: bigint): Buffer {
	const buffer = Buffer.alloc(8);
	buffer.writeBigUInt64LE(value);
	return buffer;
}

// End-to-end with MOCK browser wallets (no Phantom): a payer wallet, a browser
// session delegate, and a server facilitator — all local keypairs.
describe("escrow deposit_for e2e (delegate deposits payer funds, gasless)", () => {
	it("the delegate moves the payer's USDC into the vault; payer never signs, server fee-pays", async () => {
		const mint = await newMint();
		const feeAccount = await ata(mint, payer.publicKey);
		const { vault, vaultToken } = await createVault(
			jobProgram.programId,
			mint,
			feeAccount,
			"e2e-deposit-for",
		);

		const owner = Keypair.generate(); // payer's wallet
		const session = Keypair.generate(); // browser session delegate
		const facilitator = Keypair.generate(); // server fee payer
		await fundSol(owner.publicKey);
		await fundSol(facilitator.publicKey);
		const ownerToken = await fundTokens(mint, owner.publicKey, 5_000_000);
		await initNonce(owner);

		// One-time: the wallet approves the session delegate (the only wallet sig).
		await approve(connection, payer, ownerToken, session.publicKey, owner, 3_000_000);

		const data = Buffer.concat([
			DEPOSIT_FOR_DISCRIMINATOR,
			u64le(1_000_000n),
			owner.publicKey.toBuffer(),
			owner.publicKey.toBuffer(),
			u64le(1n),
			u64le(BigInt(Math.floor(Date.now() / 1000) + 3600)),
		]);
		const instruction = new TransactionInstruction({
			programId: escrowProgram.programId,
			keys: [
				{ pubkey: vault, isSigner: false, isWritable: true },
				{ pubkey: noncePda(owner.publicKey), isSigner: false, isWritable: true },
				{ pubkey: session.publicKey, isSigner: true, isWritable: false },
				{ pubkey: ownerToken, isSigner: false, isWritable: true },
				{ pubkey: vaultToken, isSigner: false, isWritable: true },
				{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
			],
			data,
		});

		const transaction = new Transaction();
		transaction.feePayer = facilitator.publicKey;
		transaction.recentBlockhash = (
			await connection.getLatestBlockhash("confirmed")
		).blockhash;
		transaction.add(instruction);
		transaction.partialSign(session); // delegate authorizes the spend
		transaction.partialSign(facilitator); // server pays the gas

		const signature = await connection.sendRawTransaction(transaction.serialize());
		await connection.confirmTransaction(signature, "confirmed");

		const vaultAccount = await escrowProgram.account.vault.fetch(vault);
		assert.equal(vaultAccount.deposited.toNumber(), 1_000_000);
		assert.equal(await tokenBalance(vaultToken), 1_000_000n);
		assert.equal(await tokenBalance(ownerToken), 4_000_000n);
	});

	it("rejects a delegated deposit above the approved amount", async () => {
		const mint = await newMint();
		const feeAccount = await ata(mint, payer.publicKey);
		const { vault, vaultToken } = await createVault(
			jobProgram.programId,
			mint,
			feeAccount,
			"e2e-deposit-for-cap",
		);
		const owner = Keypair.generate();
		const session = Keypair.generate();
		const facilitator = Keypair.generate();
		await fundSol(owner.publicKey);
		await fundSol(facilitator.publicKey);
		const ownerToken = await fundTokens(mint, owner.publicKey, 5_000_000);
		await initNonce(owner);
		await approve(connection, payer, ownerToken, session.publicKey, owner, 500_000);

		const data = Buffer.concat([
			DEPOSIT_FOR_DISCRIMINATOR,
			u64le(1_000_000n),
			owner.publicKey.toBuffer(),
			owner.publicKey.toBuffer(),
			u64le(1n),
			u64le(BigInt(Math.floor(Date.now() / 1000) + 3600)),
		]);
		const instruction = new TransactionInstruction({
			programId: escrowProgram.programId,
			keys: [
				{ pubkey: vault, isSigner: false, isWritable: true },
				{ pubkey: noncePda(owner.publicKey), isSigner: false, isWritable: true },
				{ pubkey: session.publicKey, isSigner: true, isWritable: false },
				{ pubkey: ownerToken, isSigner: false, isWritable: true },
				{ pubkey: vaultToken, isSigner: false, isWritable: true },
				{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
			],
			data,
		});
		const transaction = new Transaction();
		transaction.feePayer = facilitator.publicKey;
		transaction.recentBlockhash = (
			await connection.getLatestBlockhash("confirmed")
		).blockhash;
		transaction.add(instruction);
		transaction.partialSign(session);
		transaction.partialSign(facilitator);

		let rejected = false;
		try {
			const signature = await connection.sendRawTransaction(
				transaction.serialize(),
			);
			await connection.confirmTransaction(signature, "confirmed");
		} catch {
			rejected = true;
		}
		assert.equal(rejected, true, "over-cap delegated deposit must be rejected");
	});
});
