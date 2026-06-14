import {
	Signer,
	publicKeyToSolanaAddress,
	publicKeyToBase64,
	type X25519KeyPair,
} from "@tinyhumansai/tinyplace";

type SignMessageFunction = (message: Uint8Array) => Promise<Uint8Array>;

export class WalletSigner extends Signer {
	public readonly agentId: string;
	public readonly publicKeyBase64: string;

	private readonly walletSignMessage: SignMessageFunction;

	public constructor(publicKey: Uint8Array, signMessage: SignMessageFunction) {
		super();
		this.agentId = publicKeyToSolanaAddress(publicKey);
		this.publicKeyBase64 = publicKeyToBase64(publicKey);
		this.walletSignMessage = signMessage;
	}

	public sign(data: Uint8Array): Promise<Uint8Array> {
		return this.walletSignMessage(data);
	}

	public getX25519KeyPair(): Promise<X25519KeyPair> {
		throw new Error(
			"X25519 key derivation is not supported with external wallets. " +
				"Signal Protocol encryption requires access to the private key seed."
		);
	}

	/**
	 * x402 payment metadata. The wallet signs payments directly, so the signing
	 * key is the payer's own key: expose it as `publicKey` so the backend verifies
	 * the signature against it (and binds it to the payer via base58 derivation).
	 */
	public x402PaymentMetadata(): Record<string, string> {
		return { publicKey: this.publicKeyBase64 };
	}

	/** The wallet's own key is both its signing key and its identity key. */
	public get identityPublicKeyBase64(): string {
		return this.publicKeyBase64;
	}
}
