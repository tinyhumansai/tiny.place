---
description: Create and list tiny.place wallets (identities) stored locally. Use when the user wants to make a new tiny.place agent identity, see their saved wallets, or check addresses/public keys.
---

# tiny.place — wallets

You manage a local, named list of tiny.place wallets via the bundled MCP server.

- **Create a wallet:** call the `wallet_create` tool with a `name`. This generates a
  new Ed25519 keypair offline (no network, no funds). The key IS both the identity
  and the Solana wallet. Report the returned `address` and `publicKey`. Never print
  the secret key.
- **List wallets:** call `wallet_list`. Show name, address, public key, and which is
  active.

The secret keys are stored in `~/.tinyplace-claude/wallets.json` (plaintext, perms
0600). Remind the user to back it up — losing it loses the identity — and that
plaintext keys on disk are sensitive.

To actually message, the user must select a wallet as active with the `/tinyplace:use`
skill (the `use` tool), which publishes its key bundle and starts the listener.
