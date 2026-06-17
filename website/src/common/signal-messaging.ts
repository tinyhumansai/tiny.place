import { SignalSession, type TinyPlaceClient } from "@tinyhumansai/tinyplace";

import { createClient } from "@src/common/api-client";
import type { SignalIdentity } from "@src/common/signal-identity";

/** A decrypted inbound direct message. */
export interface DecryptedMessage {
	id: string;
	/** Sender messaging address (base64 encryption pubkey). */
	from: string;
	text: string;
	at: string;
}

let messageCounter = 0;

function nextMessageId(): string {
	messageCounter += 1;
	return `msg_${new Date().getTime()}_${messageCounter}`;
}

/**
 * Builds the dedicated messaging client, authenticated with the derived
 * encryption signer and wired for transparent Signal E2E: `messages.send`
 * encrypts and `messages.list` decrypts under the hood, backed by the identity's
 * persistent session store. This client owns all `/keys` and `/messages` traffic
 * and is addressed by the derived public key — distinct from the wallet client.
 */
export function createEncryptionClient(
	identity: SignalIdentity
): TinyPlaceClient {
	return createClient(identity.signer, undefined, { store: identity.store });
}

/**
 * Generates and publishes the identity's Signal key bundle (signed pre-key plus a
 * batch of one-time pre-keys), persisting the private halves in the session store
 * so inbound X3DH messages can be answered across reloads. Delegates to the SDK's
 * key-bundle publishing.
 *
 * @param encClient - The encryption-authenticated client (E2E configured).
 */
export async function publishKeyBundle(
	encClient: TinyPlaceClient
): Promise<void> {
	await encClient.enableEncryption();
}

/**
 * Confirms the identity's Signal key bundle is actually fetchable from the relay,
 * so a successful publish can't silently leave the agent unreachable for DMs. The
 * relay returns 404 (the SDK throws) when no bundle landed; a bundle missing its
 * signed pre-key is treated the same way.
 *
 * @param encClient - The encryption-authenticated client.
 * @param address - The identity's messaging address (base64 encryption pubkey).
 * @throws If the bundle cannot be fetched or has no usable signed pre-key.
 */
export async function verifyKeyBundlePublished(
	encClient: TinyPlaceClient,
	address: string
): Promise<void> {
	const bundle = await encClient.keys.getBundle(address);
	if (!bundle.signedPreKey?.publicKey) {
		throw new Error(
			`Key bundle for ${address} did not land on the relay (no signed pre-key)`
		);
	}
}

/**
 * Creates a Signal session bound to this identity's persistent store. The
 * encryption client now owns the live session used for crypto; this remains so
 * callers that gate readiness on a session keep a stable handle.
 *
 * @param identity - The resolved Signal identity.
 */
export function createSession(identity: SignalIdentity): SignalSession {
	return new SignalSession(identity.store, identity.identityKeyPair.publicKey);
}

/**
 * Encrypts and sends a direct message to a recipient addressed by their encryption
 * public key. The transparent client runs X3DH on first contact and the Double
 * Ratchet thereafter, so the plaintext never leaves the process.
 *
 * @param encClient - The encryption-authenticated client (E2E configured).
 * @param _session - Retained for signature stability; the client owns the session.
 * @param identity - The sender's Signal identity.
 * @param toEncKeyB64 - The recipient's encryption public key (base64).
 * @param text - The plaintext message.
 */
export async function sendDirectMessage(
	encClient: TinyPlaceClient,
	_session: SignalSession,
	identity: SignalIdentity,
	toEncKeyB64: string,
	text: string
): Promise<void> {
	await encClient.messages.send({
		id: nextMessageId(),
		from: identity.signer.publicKeyBase64,
		to: toEncKeyB64,
		timestamp: new Date().toISOString(),
		deviceId: 1,
		type: "CIPHERTEXT",
		body: text,
	});
}

/**
 * Fetches, decrypts, and acknowledges all pending inbound messages via the
 * transparent client (`messages.list` decrypts each envelope and acks it). Some
 * decrypted DMs are control payloads (e.g. group sender-key handoffs) rather than
 * chat: the optional `onControlMessage` hook is given each plaintext first; if it
 * returns true the message is treated as consumed and left out of the chat list.
 *
 * @param encClient - The encryption-authenticated client (E2E configured).
 * @param _session - Retained for signature stability; the client owns the session.
 * @param identity - The recipient's Signal identity.
 * @param onControlMessage - Optional handler for non-chat control payloads.
 * @returns The successfully decrypted chat messages, oldest first.
 */
export async function fetchInbox(
	encClient: TinyPlaceClient,
	_session: SignalSession,
	identity: SignalIdentity,
	onControlMessage?: (from: string, text: string) => boolean
): Promise<Array<DecryptedMessage>> {
	const address = identity.signer.publicKeyBase64;
	const { messages } = await encClient.messages.list(address);
	const decrypted: Array<DecryptedMessage> = [];

	for (const envelope of messages) {
		// Transparent list already decrypted the body to plaintext and acked it.
		const text = envelope.body;
		const consumed = onControlMessage?.(envelope.from, text) ?? false;
		if (!consumed) {
			decrypted.push({
				id: envelope.id,
				from: envelope.from,
				text,
				at: envelope.timestamp,
			});
		}
	}

	return decrypted;
}
