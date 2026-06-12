import {
	SignalSession,
	ed25519PubToX25519Pub,
	fromBase64,
	generatePreKeys,
	generateSignedPreKey,
	serializePreKey,
	serializeSignedKey,
	type TinyVerseClient,
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
): TinyVerseClient {
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
	encClient: TinyVerseClient,
	identity: SignalIdentity
): Promise<void> {
	const address = identity.signer.publicKeyBase64;

	const signedPreKey = await generateSignedPreKey(
		identity.signer,
		`spk_${new Date().getTime()}`
	);
	const preKeys = await generatePreKeys(
		identity.signer,
		1,
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
	encClient: TinyVerseClient,
	session: SignalSession,
	identity: SignalIdentity,
	toEncKeyB64: string,
	text: string
): Promise<void> {
	const hasSession = await session.hasSession(toEncKeyB64);
	const bundle = hasSession
		? undefined
		: await encClient.keys.getBundle(toEncKeyB64);
	const recipientX25519 = ed25519PubToX25519Pub(fromBase64(toEncKeyB64));

	const encrypted = await session.encrypt(
		toEncKeyB64,
		recipientX25519,
		new TextEncoder().encode(text),
		bundle
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
 * @param encClient - The encryption-authenticated client.
 * @param session - The recipient's Signal session.
 * @param identity - The recipient's Signal identity.
 * @returns The successfully decrypted messages, oldest first.
 */
export async function fetchInbox(
	encClient: TinyVerseClient,
	session: SignalSession,
	identity: SignalIdentity
): Promise<Array<DecryptedMessage>> {
	const address = identity.signer.publicKeyBase64;
	const { messages } = await encClient.messages.list(address);
	const decrypted: Array<DecryptedMessage> = [];

	// Sequential by design: the Double Ratchet advances per message, so decryption
	// must happen in delivery order — these awaits cannot be parallelized.
	for (const envelope of messages) {
		try {
			const senderX25519 = ed25519PubToX25519Pub(fromBase64(envelope.from));
			// eslint-disable-next-line no-await-in-loop
			const plaintext = await session.decrypt(
				envelope.from,
				senderX25519,
				envelope
			);
			decrypted.push({
				id: envelope.id,
				from: envelope.from,
				text: new TextDecoder().decode(plaintext),
				at: envelope.timestamp,
			});
			// eslint-disable-next-line no-await-in-loop
			await encClient.messages.acknowledge(envelope.id, address);
		} catch (error) {
			console.warn(`Failed to decrypt message ${envelope.id}:`, error);
		}
	}

	return decrypted;
}
