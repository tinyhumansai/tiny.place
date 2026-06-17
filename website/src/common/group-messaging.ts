import {
	GroupKeyManager,
	buildGroupEnvelope,
	decodeGroupBody,
	encodeGroupKeyDistribution,
	isBackendHintEnvelope,
	parseSenderKeyId,
	type DecryptedGroupMessage,
	type SignalSession,
	type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

import { resolveEncryptionAddress } from "@src/common/encryption-discovery";
import type { SignalIdentity } from "@src/common/signal-identity";
import { sendDirectMessage } from "@src/common/signal-messaging";

// The sender-key codecs, GroupKeyManager, and types now live in the SDK so the
// browser app and the CLI share one implementation. Re-exported here to keep the
// website's import paths (and unit tests) stable.
export {
	GroupKeyManager,
	buildGroupEnvelope,
	decodeGroupBody,
	encodeGroupBody,
	encodeGroupKeyDistribution,
	groupSenderKeyId,
	isBackendHintEnvelope,
	parseGroupKeyDistribution,
	parseSenderKeyId,
} from "@tinyhumansai/tinyplace";
export type {
	DecryptedGroupMessage,
	GroupKeyDistributionPayload,
	ParsedSenderKeyId,
} from "@tinyhumansai/tinyplace";

/** Process-wide group key material for the active identity. */
export const groupKeyManager = new GroupKeyManager();

let groupMessageCounter = 0;

function nextGroupMessageId(): string {
	groupMessageCounter += 1;
	return `grp_${new Date().getTime()}_${groupMessageCounter}`;
}

/**
 * Encrypts and fans out a group message. Before sending, it hands this client's
 * current sender key to any active members who don't yet have it, over the
 * end-to-end encrypted 1:1 DM channel (so the relay never sees the key).
 *
 * @returns The plaintext echoed back for optimistic local display.
 */
export async function sendGroupMessage(options: {
	walletClient: TinyPlaceClient;
	encClient: TinyPlaceClient;
	session: SignalSession;
	identity: SignalIdentity;
	groupId: string;
	epoch: number;
	sender: string;
	members: Array<string>;
	text: string;
}): Promise<DecryptedGroupMessage> {
	const {
		walletClient,
		encClient,
		session,
		identity,
		groupId,
		epoch,
		sender,
		members,
		text,
	} = options;

	const senderKey = groupKeyManager.ensureOwn(groupId, epoch);
	const pending = groupKeyManager.pendingDistribution(
		groupId,
		epoch,
		members,
		sender
	);
	const distribution = senderKey.distribution();
	const body = encodeGroupKeyDistribution(groupId, sender, epoch, distribution);

	for (const member of pending) {
		try {
			// eslint-disable-next-line no-await-in-loop
			const card = await walletClient.directory.getAgent(member);
			// eslint-disable-next-line no-await-in-loop
			await sendDirectMessage(
				encClient,
				session,
				identity,
				resolveEncryptionAddress(card),
				body
			);
			groupKeyManager.markDistributed(groupId, member);
		} catch (error) {
			// A member without a published key bundle (no DM encryption enabled)
			// can't receive the key yet; skip them rather than failing the send.
			console.warn(`Group key handoff to ${member} failed:`, error);
		}
	}

	const encrypted = await senderKey.encrypt(new TextEncoder().encode(text));
	const envelope = buildGroupEnvelope(
		nextGroupMessageId(),
		groupId,
		sender,
		epoch,
		encrypted
	);
	await walletClient.groups.fanoutMessage(groupId, envelope);

	return {
		id: envelope.id,
		groupId,
		from: sender,
		text,
		at: envelope.timestamp,
	};
}

/**
 * Fetches the wallet-addressed relay inbox, decrypting any group messages this
 * client has the sender key for. Backend hint placeholders and undecryptable
 * envelopes are skipped (the latter usually means the key handoff hasn't arrived
 * yet). Every consumed envelope is acknowledged so the relay can drop it.
 */
export async function fetchGroupInbox(
	walletClient: TinyPlaceClient,
	actor: string
): Promise<Array<DecryptedGroupMessage>> {
	const { messages } = await walletClient.messages.list(actor);
	const decrypted: Array<DecryptedGroupMessage> = [];

	for (const envelope of messages) {
		const senderKeyId = envelope.signal?.senderKeyId;
		const iteration = envelope.signal?.senderKeyIteration;
		if (
			!senderKeyId ||
			iteration === undefined ||
			isBackendHintEnvelope(envelope)
		) {
			continue;
		}
		const parsed = parseSenderKeyId(senderKeyId);
		if (!parsed) {
			continue;
		}
		const receiver = groupKeyManager.getReceiver(
			parsed.groupId,
			parsed.sender,
			parsed.epoch
		);
		const message = decodeGroupBody(envelope.body, iteration);
		if (!receiver || !message) {
			// No key yet (or malformed) — leave it in the inbox for a later poll
			// once the sender's key handoff has been processed.
			continue;
		}
		try {
			// eslint-disable-next-line no-await-in-loop
			const plaintext = await receiver.decrypt(message);
			decrypted.push({
				id: envelope.id,
				groupId: parsed.groupId,
				from: parsed.sender,
				text: new TextDecoder().decode(plaintext),
				at: envelope.timestamp,
			});
		} catch (error) {
			console.warn(`Failed to decrypt group message ${envelope.id}:`, error);
			continue;
		}
		try {
			// eslint-disable-next-line no-await-in-loop
			await walletClient.messages.acknowledge(envelope.id, actor);
		} catch (error) {
			console.warn(
				`Failed to acknowledge group message ${envelope.id}:`,
				error
			);
		}
	}

	return decrypted;
}
