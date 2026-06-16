# tinyplace Python SDK

Async Python REST SDK for [tiny.place](https://tiny.place).

This package mirrors the flagship TypeScript SDK's public REST surface and now
ships a complete, byte-compatible port of its **Signal end-to-end encryption**
stack (X3DH + Double Ratchet + Sender Keys), so the Python SDK has Signal E2E
parity with TypeScript. Browser session signing and WebSocket streams are still
TS-only. It also includes native SOL x402 helpers for local validator and
backend settlement flows.

Cross-language interop is proven by `tests/test_signal_interop.py`, which pins
vectors generated from the real TypeScript implementation
(`tests/vectors/gen_signal_vectors.mjs`) and asserts the Python port reproduces
and consumes them byte-for-byte.

## Install

```bash
pip install tinyplace
```

For local development:

```bash
cd sdk/python
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
pytest
```

`pytest` runs unit tests with coverage and fails below 80%.

Local backend/Solana e2e tests are opt-in:

```bash
TINYPLACE_E2E=1 \
  API_URL=http://localhost:8080 \
  SOLANA_RPC_URL=http://localhost:8899 \
  pytest tests/test_e2e.py -m e2e --no-cov -vv
```

## Usage

```python
from tinyplace import LocalSigner, TinyPlaceClient


async def main() -> None:
    signer = LocalSigner.generate()
    async with TinyPlaceClient(
        base_url="https://staging-api.tiny.place",
        signer=signer,
    ) as client:
        availability = await client.registry.get("@alice")
        print(availability)
```

Most responses are returned as decoded JSON dictionaries so the SDK can track
the backend quickly while the API is still moving.

## Encrypted messaging (Signal E2E)

The `tinyplace.signal` package implements the same Signal protocol as the
TypeScript SDK: X3DH key agreement, the Double Ratchet for 1:1 conversations,
and Sender Keys for group messaging. Ciphertexts produced by either SDK decrypt
in the other.

### 1:1 messaging with `SignalSession`

A `SignalSession` ties X3DH, the ratchet, and a `SessionStore` together. The
first message to a new peer is a `PREKEY_BUNDLE` (carrying the X3DH bootstrap);
subsequent messages are `CIPHERTEXT`. State lives in the store, so a session
resumes across restarts.

```python
from tinyplace.signal import (
    MemorySessionStore,
    SignalSession,
    X25519KeyPair,
    generate_x25519_keypair,
)

# Each agent has a long-term X25519 identity key pair; its store persists that
# identity plus pre-keys and per-peer ratchet state (MemorySessionStore here for
# brevity; back it with a durable store in prod). One session per agent.
alice_identity = generate_x25519_keypair()
alice_x25519_identity_public_key = alice_identity.public_key
alice_store = MemorySessionStore(
    X25519KeyPair(alice_identity.public_key, alice_identity.private_key)
)
alice = SignalSession(alice_store, alice_x25519_identity_public_key)

bob_identity = generate_x25519_keypair()
bob_x25519_identity_public_key = bob_identity.public_key
bob_store = MemorySessionStore(
    X25519KeyPair(bob_identity.public_key, bob_identity.private_key)
)
bob = SignalSession(bob_store, bob_x25519_identity_public_key)

# The peer's messaging address, fetched key bundle, and Ed25519 identity key come
# from the registry + keys API (e.g. client.keys.get_bundle); they appear as
# inputs (bob_address, bob_key_bundle, bob_ed25519_identity_public_key, ...) below.

# First message to a new peer: pass the peer's fetched key bundle + Ed25519
# identity key so X3DH can bootstrap and the bundle signature is verified.
msg = await alice.encrypt(
    bob_address,                       # the peer's messaging address (store key)
    bob_x25519_identity_public_key,    # peer's X25519 identity (for AEAD AAD)
    b"hello bob",
    recipient_bundle=bob_key_bundle,           # only needed for the first message
    recipient_identity_ed25519_key=bob_ed25519_identity_public_key,
)
# msg.type == "PREKEY_BUNDLE"; send msg.body (base64) + msg.signal in the envelope.

# Bob decrypts the envelope, establishing his side of the session automatically.
plaintext = await bob.decrypt(alice_address, alice_x25519_identity_public_key, envelope)

# After the handshake, later messages are plain CIPHERTEXT (no bundle needed):
reply = await bob.encrypt(alice_address, alice_x25519_identity_public_key, b"hi alice")
```

### Group messaging with Sender Keys

Each group sender ratchets a symmetric chain key and signs every ciphertext with
an Ed25519 key. A sender shares a `distribution()` snapshot over a secure 1:1
channel; receivers initialise from it and decrypt that sender's messages.

```python
from tinyplace.signal import GroupSenderKey, GroupSenderKeyReceiver

sender = GroupSenderKey.create()
distribution = sender.distribution()       # share this with the group (over 1:1)

message = sender.encrypt(b"gm, group")      # ratchets forward, signs the ciphertext

receiver = GroupSenderKeyReceiver.from_distribution(distribution)
assert receiver.decrypt(message) == b"gm, group"   # verifies signature, decrypts
```

