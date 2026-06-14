import { describe, expect, it } from "vitest";

import type {
	MessageEnvelope,
	SenderKeyDistribution,
	SenderKeyMessage,
} from "@tinyhumansai/tinyplace";

import {
	buildGroupEnvelope,
	decodeGroupBody,
	encodeGroupBody,
	encodeGroupKeyDistribution,
	groupSenderKeyId,
	isBackendHintEnvelope,
	parseGroupKeyDistribution,
	parseSenderKeyId,
} from "./group-messaging";

const distribution: SenderKeyDistribution = {
	chainKey: "Y2hhaW4=",
	iteration: 3,
	signaturePublicKey: "c2ln",
};

function hintEnvelope(marker: string): MessageEnvelope {
	return {
		id: "x",
		from: "grp_1",
		to: "@bob",
		timestamp: "2026-01-01T00:00:00.000Z",
		deviceId: 1,
		type: "CIPHERTEXT",
		body: btoa(marker),
		signal: { senderKeyId: "grp_1:@alice:epoch:0", senderKeyIteration: 0 },
	};
}

describe("groupSenderKeyId / parseSenderKeyId", () => {
	it("builds the backend-required id shape", () => {
		expect(groupSenderKeyId("grp_1", "@alice", 2)).toBe("grp_1:@alice:epoch:2");
	});

	it("round-trips a parse", () => {
		expect(parseSenderKeyId("grp_1:@alice:epoch:2")).toEqual({
			groupId: "grp_1",
			sender: "@alice",
			epoch: 2,
		});
	});

	it("rejects malformed ids", () => {
		expect(parseSenderKeyId("nonsense")).toBeNull();
		expect(parseSenderKeyId("grp_1:epoch:2")).toBeNull();
		expect(parseSenderKeyId("grp_1:@alice:epoch:x")).toBeNull();
	});
});

describe("group key distribution payload", () => {
	it("encodes and parses a handoff", () => {
		const encoded = encodeGroupKeyDistribution(
			"grp_1",
			"@alice",
			2,
			distribution
		);
		const parsed = parseGroupKeyDistribution(encoded);
		expect(parsed).not.toBeNull();
		expect(parsed?.groupId).toBe("grp_1");
		expect(parsed?.sender).toBe("@alice");
		expect(parsed?.epoch).toBe(2);
		expect(parsed?.distribution).toEqual(distribution);
	});

	it("returns null for ordinary chat text", () => {
		expect(parseGroupKeyDistribution("hello there")).toBeNull();
		expect(parseGroupKeyDistribution('{"kind":"other"}')).toBeNull();
		expect(parseGroupKeyDistribution("{not json")).toBeNull();
	});
});

// ed25519 signatures are 64 bytes; the body codec splits at that fixed offset.
const SIG64 = btoa(
	String.fromCharCode(...Array.from({ length: 64 }, (): number => 7))
);

describe("group message body codec", () => {
	it("round-trips ciphertext + signature, taking iteration from metadata", () => {
		const message: SenderKeyMessage = {
			iteration: 7,
			ciphertext: "Y2lwaGVy",
			signature: SIG64,
		};
		const body = encodeGroupBody(message);
		// The body itself does not carry the iteration; the envelope's signal does.
		expect(decodeGroupBody(body, 7)).toEqual(message);
	});

	it("produces an opaque body that never looks like JSON (backend invariant)", () => {
		// The backend rejects bodies whose decoded bytes start with '{' or '['.
		const body = encodeGroupBody({
			iteration: 0,
			ciphertext: "Y2lwaGVy",
			signature: SIG64,
		});
		const firstByte = atob(body).charCodeAt(0);
		expect(firstByte).toBe(0x01);
		expect(firstByte).not.toBe("{".charCodeAt(0));
		expect(firstByte).not.toBe("[".charCodeAt(0));
	});

	it("returns null for non-group bodies", () => {
		expect(decodeGroupBody(btoa("not json"), 0)).toBeNull();
	});
});

describe("isBackendHintEnvelope", () => {
	it("detects distribution and rotation placeholders", () => {
		expect(
			isBackendHintEnvelope(hintEnvelope("sender-key-distribution-required"))
		).toBe(true);
		expect(
			isBackendHintEnvelope(hintEnvelope("sender-key-rotation-required"))
		).toBe(true);
	});

	it("does not flag a real ciphertext body", () => {
		const real = hintEnvelope("sender-key-distribution-required");
		real.body = encodeGroupBody({
			iteration: 0,
			ciphertext: "Y2lwaGVy",
			signature: "c2ln",
		});
		expect(isBackendHintEnvelope(real)).toBe(false);
	});
});

describe("buildGroupEnvelope", () => {
	it("produces an envelope the backend validates: to=group, correct senderKeyId + iteration", () => {
		const envelope = buildGroupEnvelope("mid", "grp_1", "@alice", 4, {
			iteration: 9,
			ciphertext: "Y2lwaGVy",
			signature: SIG64,
		});
		expect(envelope.to).toBe("grp_1");
		expect(envelope.from).toBe("@alice");
		expect(envelope.type).toBe("CIPHERTEXT");
		expect(envelope.signal?.senderKeyId).toBe("grp_1:@alice:epoch:4");
		expect(envelope.signal?.senderKeyIteration).toBe(9);
		expect(envelope.signal?.rotationEpoch).toBe(4);
		expect(decodeGroupBody(envelope.body, 9)).toEqual({
			iteration: 9,
			ciphertext: "Y2lwaGVy",
			signature: SIG64,
		});
	});
});
