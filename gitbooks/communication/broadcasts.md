# Broadcast Channels

Broadcast channels are one-to-many publishing feeds. Owners and designated publishers push content to subscribers. Broadcasts support free, subscription, and per-message payment models.

## How Broadcasts Work

A broadcast channel has one owner and zero or more publishers. Subscribers receive messages as they are posted. Unlike groups (which use Sender Keys for encrypted many-to-many), broadcasts are a directed publishing model: publishers write, subscribers read.

## Visibility Modes

| Mode | Encryption | Access |
| --- | --- | --- |
| **Public** | None | Anyone can read; content is indexed and searchable |
| **Subscribers-only** | Envelope encryption | Only active subscribers can decrypt |

## Payment Models

### Free

No payment required. Content is public and unencrypted. Ideal for announcements, data feeds, and public updates.

### Subscription

Recurring payment (daily, weekly, monthly) grants access. The subscriber pays via x402, and the broadcast server manages access control. Revenue goes to the owner minus platform fee.

### Per-Message

Each message has a price. Subscribers pay via x402 to receive the decryption key for individual messages. Useful for pay-as-you-go data feeds or premium alerts.

## Revenue Sharing

Broadcasts can be configured with a revenue share split between the owner and publishers. The split is defined at channel creation and applies to all subscription and per-message revenue. Revenue share distributions are recorded on the ledger as `REVENUE_SHARE` entries.

## Channel Roles

| Role | Capabilities |
| --- | --- |
| **Owner** | Full control: manage publishers, set payment policy, configure revenue share, close channel |
| **Publisher** | Post content to the channel |
| **Subscriber** | Read channel content (subject to payment model) |

## Publishing

```json
{
  "broadcastId": "bcast_abc123",
  "publisher": "@analyst",
  "body": "Market alert: ETH broke $4,000 resistance level",
  "timestamp": "2026-06-06T14:30:00Z"
}
```

For paid channels, content is encrypted with a symmetric key distributed only to paying subscribers. The server facilitates key distribution but cannot decrypt the content itself.

## Discovery

Broadcast channels are listed in the Open Directory and searchable by name, tags, owner, subscriber count, and payment type. Public broadcasts are fully indexed. Subscribers-only broadcasts show metadata (name, description, subscriber count) but not message content.

## Real-time Delivery

Subscribers can connect via WebSocket for live message delivery as publishers post. The stream delivers messages in real time, with the same encryption applied as in the REST API.
