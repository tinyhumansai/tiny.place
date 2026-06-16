import {
	SignalSession,
	ed25519PubToX25519Pub,
	generatePreKeys,
	generateSignedPreKey,
	serializePreKey,
	serializeSignedKey,
	type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

import { createClient } from "@src/common/api-client";
import type { SignalIdentity } from "@src/common/signal-identity";

/** Number of one-time pre-keys uploaded per publish. */
const ONE_TIME_PREKEY_COUNT = 10;

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

function decodeBase64(base64: string): Uint8Array {
	const binaryString = globalThis.atob(base64);

	return Uint8Array.from(binaryString, (character) => character.charCodeAt(0));
}

/**
 * Builds the dedicated messaging client, authenticated with the derived
 * encryption signer. This client owns all `/keys` and `/messages` traffic and is
 * addressed by the derived public key — distinct from the wallet client used for
 * directory and payments.
 *
 * @param identity - The resolved Signal identity.
 * @returns A client signing requests with the encryption identity.
 */
export function createEncryptionClient(
	identity: SignalIdentity
): TinyPlaceClient {
	return createClient(identity.signer);
}

/**
 * Generates and publishes the identity's Signal key bundle (signed pre-key plus a
 * batch of one-time pre-keys), persisting the private halves in the session store
 * so inbound X3DH messages can be answered across reloads.
 *
 * @param encClient - The encryption-authenticated client.
 * @param identity - The resolved Signal identity.
 */
export async function publishKeyBundle(
	encClient: TinyPlaceClient,
	identity: SignalIdentity
): Promise<void> {
	const address = identity.signer.publicKeyBase64;

	const signedPreKey = await generateSignedPreKey(
		identity.signer,
		`spk_${new Date().getTime()}`
	);
	// Use a unique start id (not a fixed 1) so prekey ids differ on every publish.
	// Re-publishing then ADDS fresh prekeys instead of colliding (relay 409) and
	// orphaning the relay's copy: the local store keeps a private for whatever
	// prekey the relay advertises, which is what X3DH on the sender side needs.
	const preKeys = await generatePreKeys(
		identity.signer,
		Date.now(),
		ONE_TIME_PREKEY_COUNT
	);

	await identity.store.storeSignedPreKey(signedPreKey);
	await Promise.all(
		preKeys.map((preKey) => identity.store.storePreKey(preKey))
	);

	await encClient.keys.rotateSignedPreKey(address, {
		identityKey: address,
		signedPreKey: serializeSignedKey(signedPreKey),
	});
	await encClient.keys.uploadPreKeys(address, {
		identityKey: address,
		preKeys: preKeys.map(serializePreKey),
	});
}

/**
 * Creates the long-lived Signal session bound to this identity's persistent store.
 *
 * @param identity - The resolved Signal identity.
 * @returns A session for encrypting and decrypting direct messages.
 */
export function createSession(identity: SignalIdentity): SignalSession {
	return new SignalSession(identity.store, identity.identityKeyPair.publicKey);
}

/**
 * Encrypts and sends a direct message to a recipient addressed by their encryption
 * public key. On the first message to a recipient, their key bundle is fetched to
 * bootstrap the X3DH handshake.
 *
 * @param encClient - The encryption-authenticated client.
 * @param session - The sender's Signal session.
 * @param identity - The sender's Signal identity.
 * @param toEncKeyB64 - The recipient's encryption public key (base64).
 * @param text - The plaintext message.
 */
export async function sendDirectMessage(
	encClient: TinyPlaceClient,
	session: SignalSession,
	identity: SignalIdentity,
	toEncKeyB64: string,
	text: string
): Promise<void> {
	const hasSession = await session.hasSession(toEncKeyB64);
	const bundle = hasSession
		? undefined
		: await encClient.keys.getBundle(toEncKeyB64);
	const recipientEd25519 = decodeBase64(toEncKeyB64);
	const recipientX25519 = ed25519PubToX25519Pub(recipientEd25519);

	const encrypted = await session.encrypt(
		toEncKeyB64,
		recipientX25519,
		new TextEncoder().encode(text),
		bundle,
		recipientEd25519
	);

	await encClient.messages.send({
		id: nextMessageId(),
		from: identity.signer.publicKeyBase64,
		to: toEncKeyB64,
		timestamp: new Date().toISOString(),
		deviceId: 1,
		type: encrypted.type,
		body: encrypted.body,
		signal: encrypted.signal,
	});
}

/**
 * Fetches, decrypts, and acknowledges all pending inbound messages. Each message
 * is decrypted independently so a single undecryptable envelope does not abort the
 * batch.
 *
 * Some decrypted DMs are not chat at all but control payloads (e.g. group
 * sender-key handoffs). The optional `onControlMessage` hook is given each
 * plaintext first; if it returns true the message is treated as consumed and
 * left out of the returned chat list (but still acknowledged).
 *
 * @param encClient - The encryption-authenticated client.
 * @param session - The recipient's Signal session.
 * @param identity - The recipient's Signal identity.
 * @param onControlMessage - Optional handler for non-chat control payloads.
 * @returns The successfully decrypted chat messages, oldest first.
 */
export async function fetchInbox(
	encClient: TinyPlaceClient,
	session: SignalSession,
	identity: SignalIdentity,
	onControlMessage?: (from: string, text: string) => boolean
): Promise<Array<DecryptedMessage>> {
	const address = identity.signer.publicKeyBase64;
	const { messages } = await encClient.messages.list(address);
	const decrypted: Array<DecryptedMessage> = [];

	// Sequential by design: the Double Ratchet advances per message, so decryption
	// must happen in delivery order — these awaits cannot be parallelized.
	for (const envelope of messages) {
		let plaintext: Uint8Array;
		try {
			const senderX25519 = ed25519PubToX25519Pub(decodeBase64(envelope.from));
			// eslint-disable-next-line no-await-in-loop
			plaintext = await session.decrypt(envelope.from, senderX25519, envelope);
		} catch (error) {
			console.warn(`Failed to decrypt message ${envelope.id}:`, error);
			// An envelope we can't decrypt is unreadable regardless, so acknowledge
			// it to drop it from the relay and avoid re-fetching it on every poll
			// (an unbounded retry loop). Trade-off: we discard a message we could
			// never have read.
			try {
				// eslint-disable-next-line no-await-in-loop
				await encClient.messages.acknowledge(envelope.id, address);
			} catch (ackError) {
				console.warn(
					`Failed to acknowledge undecryptable message ${envelope.id}:`,
					ackError
				);
			}
			continue;
		}

		const text = new TextDecoder().decode(plaintext);
		const consumed = onControlMessage?.(envelope.from, text) ?? false;
		if (!consumed) {
			decrypted.push({
				id: envelope.id,
				from: envelope.from,
				text,
				at: envelope.timestamp,
			});
		}

		// Acknowledge separately: the message is already decrypted (the ratchet has
		// advanced), so an ack failure must not be reported as a decrypt failure.
		try {
			// eslint-disable-next-line no-await-in-loop
			await encClient.messages.acknowledge(envelope.id, address);
		} catch (error) {
			console.warn(`Failed to acknowledge message ${envelope.id}:`, error);
		}
	}

	return decrypted;
}
