import {
	Signer,
	publicKeyToBase64,
	publicKeyToSolanaAddress,
	type X25519KeyPair,
} from "@tinyhumansai/tinyplace";

import {
	WalletSigner,
	type SignMessageFunction,
} from "@src/common/wallet-signer";

const SIWS_STORAGE_PREFIX = "tinyplace:siws:";
const SIWS_PROOF_VERSION = 1;
const SIWS_TIME_TO_LIVE_MS = 7 * 24 * 60 * 60 * 1000;
const SIWS_EXPIRY_SKEW_MS = 60 * 1000;
const SOLANA_NETWORK = process.env["NEXT_PUBLIC_SOLANA_NETWORK"] ?? "devnet";

export type SiwsProof = {
	address: string;
	expiresAt: string;
	issuedAt: string;
	message: string;
	publicKeyBase64: string;
	signature: string;
	version: number;
};

type SiwsProofSignerOptions = {
	forceNew?: boolean;
	now?: () => number;
	storage?: Storage;
};

function browserStorage(): Storage | undefined {
	if (typeof window === "undefined") {
		return undefined;
	}
	return window.localStorage;
}

function storageKey(address: string): string {
	return `${SIWS_STORAGE_PREFIX}${address}`;
}

export function clearSiwsProof(
	address: string,
	storage = browserStorage()
): void {
	storage?.removeItem(storageKey(address));
}

function randomNonce(): string {
	const webCrypto = globalThis.crypto;
	if (typeof webCrypto.randomUUID === "function") {
		return webCrypto.randomUUID();
	}
	const bytes = new Uint8Array(16);
	webCrypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		""
	);
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function toBase64Url(value: string): string {
	return btoa(value)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/u, "");
}

function proofIsFresh(proof: SiwsProof, now: number): boolean {
	return (
		proof.version === SIWS_PROOF_VERSION &&
		Date.parse(proof.expiresAt) - SIWS_EXPIRY_SKEW_MS > now
	);
}

function siwsChainId(): string {
	switch (SOLANA_NETWORK) {
		case "mainnet":
		case "mainnet-beta":
			return "solana:mainnet";
		case "testnet":
			return "solana:testnet";
		case "localnet":
			return "localnet";
		default:
			return "solana:devnet";
	}
}

function parseProof(value: string | null): SiwsProof | undefined {
	if (!value) {
		return undefined;
	}
	try {
		const proof = JSON.parse(value) as Partial<SiwsProof>;
		if (
			typeof proof.address !== "string" ||
			typeof proof.expiresAt !== "string" ||
			typeof proof.issuedAt !== "string" ||
			typeof proof.message !== "string" ||
			typeof proof.publicKeyBase64 !== "string" ||
			typeof proof.signature !== "string" ||
			proof.version !== SIWS_PROOF_VERSION
		) {
			return undefined;
		}
		return proof as SiwsProof;
	} catch {
		return undefined;
	}
}

export function buildSiwsMessage(input: {
	address: string;
	expiresAt: string;
	issuedAt: string;
	nonce: string;
	origin?: string;
}): string {
	const origin =
		input.origin ??
		(typeof window === "undefined"
			? "https://tiny.place"
			: window.location.origin);
	return [
		"tiny.place wants you to sign in with your Solana account:",
		input.address,
		"",
		"Authenticate website API requests. This does not authorize a transaction or payment.",
		"",
		`URI: ${origin}`,
		"Version: 1",
		`Chain ID: ${siwsChainId()}`,
		`Nonce: ${input.nonce}`,
		`Issued At: ${input.issuedAt}`,
		`Expiration Time: ${input.expiresAt}`,
	].join("\n");
}

export class SiwsProofSigner extends Signer {
	public readonly agentId: string;
	public readonly publicKeyBase64: string;
	public readonly walletSigner: WalletSigner;

	private readonly proof: SiwsProof;

	private constructor(walletSigner: WalletSigner, proof: SiwsProof) {
		super();
		this.agentId = walletSigner.agentId;
		this.publicKeyBase64 = walletSigner.publicKeyBase64;
		this.walletSigner = walletSigner;
		this.proof = proof;
	}

	public static async createOrRestore(
		publicKey: Uint8Array,
		signMessage: SignMessageFunction,
		options: SiwsProofSignerOptions = {}
	): Promise<SiwsProofSigner> {
		const walletSigner = new WalletSigner(publicKey, signMessage);
		const storage = options.storage ?? browserStorage();
		const now = options.now?.() ?? Date.now();
		const stored = parseProof(
			storage?.getItem(storageKey(walletSigner.agentId)) ?? null
		);
		if (
			stored &&
			!options.forceNew &&
			stored.address === walletSigner.agentId &&
			stored.publicKeyBase64 === walletSigner.publicKeyBase64 &&
			proofIsFresh(stored, now)
		) {
			return new SiwsProofSigner(walletSigner, stored);
		}

		const issuedAt = new Date(now).toISOString();
		const expiresAt = new Date(now + SIWS_TIME_TO_LIVE_MS).toISOString();
		const message = buildSiwsMessage({
			address: walletSigner.agentId,
			expiresAt,
			issuedAt,
			nonce: randomNonce(),
		});
		const signature = await signMessage(new TextEncoder().encode(message));
		const proof: SiwsProof = {
			address: walletSigner.agentId,
			expiresAt,
			issuedAt,
			message,
			publicKeyBase64: walletSigner.publicKeyBase64,
			signature: toBase64(signature),
			version: SIWS_PROOF_VERSION,
		};
		storage?.setItem(storageKey(walletSigner.agentId), JSON.stringify(proof));
		return new SiwsProofSigner(walletSigner, proof);
	}

	public sign(data: Uint8Array): Uint8Array {
		void data;
		return new TextEncoder().encode(this.siwsSignature());
	}

	public siwsSignature(): string {
		const token = {
			signedMessage: toBase64(new TextEncoder().encode(this.proof.message)),
			signature: this.proof.signature,
			signatureType: "ed25519",
		};
		return `siws:${toBase64Url(JSON.stringify(token))}`;
	}

	public getX25519KeyPair(): Promise<X25519KeyPair> {
		return this.walletSigner.getX25519KeyPair();
	}

	public x402PaymentMetadata(): Record<string, string> {
		return this.walletSigner.x402PaymentMetadata();
	}

	public get identityPublicKeyBase64(): string {
		return this.walletSigner.identityPublicKeyBase64;
	}
}

export function walletAddressFromPublicKey(publicKey: Uint8Array): string {
	return publicKeyToSolanaAddress(publicKey);
}

export function walletPublicKeyBase64(publicKey: Uint8Array): string {
	return publicKeyToBase64(publicKey);
}
