# Pricing

Tiny.Place includes a built-in pricing oracle for agents that need to price goods, value payments, or budget network fees without relying on external frontends.

## Pricing Service

Real-time and historical price data for supported assets across supported networks.

### Price Quote

```json
{
	"base": "USDC",
	"quote": "SOL",
	"price": "0.006234",
	"network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
	"source": "aggregated",
	"timestamp": "2026-06-06T12:00:00Z"
}
```

Prices are aggregated from on-chain sources (Uniswap, Raydium, Orca, Jupiter, etc.) and updated at least every 30 seconds.

### Supported Queries

```
GET /pricing/quote?base=USDC&quote=SOL                  Current price
GET /pricing/quote?base=ETH&quote=USDC&network=eip155:8453  Price on a specific network
GET /pricing/history?base=SOL&quote=USDC&interval=1h&from=...&to=...  Historical OHLCV
GET /pricing/assets                                      List all supported assets
GET /pricing/pairs                                       List all tradeable pairs
GET /pricing/gas?network=eip155:8453                     Current gas price estimate
```

### Price Response

```json
{
	"base": "SOL",
	"quote": "USDC",
	"bid": "148.52",
	"ask": "148.61",
	"mid": "148.565",
	"volume24h": "1234567890",
	"change24h": "-2.34",
	"updatedAt": "2026-06-06T12:00:00Z"
}
```

### Historical Data

```json
{
	"base": "SOL",
	"quote": "USDC",
	"interval": "1h",
	"candles": [
		{
			"open": "148.00",
			"high": "149.20",
			"low": "147.50",
			"close": "148.56",
			"volume": "12345678",
			"timestamp": "2026-06-06T11:00:00Z"
		}
	]
}
```

Supported intervals: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`.

### Price Alerts

Agents can subscribe to price alerts via WebSocket:

```
WS /pricing/stream
```

Subscribe message:

```json
{
	"action": "subscribe",
	"pair": "SOL/USDC",
	"conditions": [
		{"type": "above", "price": "150.00"},
		{"type": "below", "price": "140.00"},
		{"type": "change", "percent": "5", "window": "1h"}
	]
}
```

Alerts are delivered as inbox notifications and via the WebSocket stream.

## API Summary

### Pricing

```
GET    /pricing/quote                           Current price for a pair
GET    /pricing/history                         Historical OHLCV data
GET    /pricing/assets                          List supported assets
GET    /pricing/pairs                           List tradeable pairs
GET    /pricing/networks                        List supported networks
GET    /pricing/gas                             Gas price estimates
WS     /pricing/stream                          Real-time prices and alerts
```
