/**
 * The commerce layer: the agent's view of the tiny.place marketplace, the
 * settlement ledger, and read-only payment infrastructure.
 *
 * Built on the flagship TypeScript SDK (`@tinyhumansai/tinyplace`). Each
 * function returns plain JSON-serialisable data so the CLI can print it and an
 * OpenClaw tool/skill can reason over it. Buying a product follows the same
 * custodial x402 "402 challenge → signed payment map → retry" flow as
 * registering a handle (see `agent.ts#buyDomain`).
 */
import {
  type LedgerListParams,
  type LedgerType,
  type LocalSigner,
  type ProductBuyRequest,
  type ProductCreateRequest,
  type ProductQueryParams,
  type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

import {
  challengeOf,
  type PaymentChallenge,
  payFromChallenge,
} from "./shared.js";

// ---------------------------------------------------------------------------
// Marketplace — products.
// ---------------------------------------------------------------------------

export interface ProductSummary {
  productId: string;
  name: string;
  category: string;
  price: string;
  asset: string;
  network: string;
  seller: string;
  status: string;
}

/**
 * Lists / searches marketplace products. Filter by free-text `q`, `category`,
 * or limit the page size. Lets an agent browse goods it might buy or compare
 * against its own listings.
 */
export async function listProducts(
  client: TinyPlaceClient,
  options: { q?: string; category?: string; limit?: number } = {},
): Promise<Array<ProductSummary>> {
  const params: ProductQueryParams = {
    type: "products",
    ...(options.q ? { q: options.q } : {}),
    ...(options.category ? { category: options.category } : {}),
    limit: options.limit ?? 20,
  };
  const response = await client.marketplace.listProducts(params);
  return (response.products ?? []).map((product) => ({
    productId: product.productId,
    name: product.name,
    category: product.category,
    price: product.price.amount,
    asset: product.price.asset,
    network: product.price.network,
    seller: product.seller,
    status: product.status,
  }));
}

export interface ProductDetail {
  productId: string;
  name: string;
  description: string;
  category: string;
  price: string;
  asset: string;
  network: string;
  seller: string;
  deliveryMethod: string;
  status: string;
  stock?: number | null;
  salesCount: number;
  rating: number;
}

/** Reads the full detail of a single product. */
export async function getProduct(
  client: TinyPlaceClient,
  productId: string,
): Promise<ProductDetail> {
  const product = await client.marketplace.getProduct(productId);
  return {
    productId: product.productId,
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price.amount,
    asset: product.price.asset,
    network: product.price.network,
    seller: product.seller,
    deliveryMethod: product.deliveryMethod,
    status: product.status,
    stock: product.stock,
    salesCount: product.salesCount,
    rating: product.rating,
  };
}

export interface CreateProductInput {
  name: string;
  description: string;
  category: ProductCreateRequest["category"];
  price: { amount: string; asset: string; network: string };
  deliveryMethod: ProductCreateRequest["deliveryMethod"];
  tags?: Array<string>;
  stock?: number;
}

/**
 * Lists a new product for sale. The seller is the signing agent; the SDK signs
 * the canonical `marketplace.product` payload with the wallet key.
 */
export async function createProduct(
  client: TinyPlaceClient,
  signer: LocalSigner,
  input: CreateProductInput,
): Promise<ProductDetail> {
  const request: ProductCreateRequest = {
    seller: signer.agentId,
    sellerCryptoId: signer.agentId,
    name: input.name,
    description: input.description,
    category: input.category,
    price: {
      amount: input.price.amount,
      asset: input.price.asset,
      network: input.price.network,
    },
    deliveryMethod: input.deliveryMethod,
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.stock !== undefined ? { stock: input.stock } : {}),
  };
  const product = await client.marketplace.createProduct(request);
  return {
    productId: product.productId,
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price.amount,
    asset: product.price.asset,
    network: product.price.network,
    seller: product.seller,
    deliveryMethod: product.deliveryMethod,
    status: product.status,
    stock: product.stock,
    salesCount: product.salesCount,
    rating: product.rating,
  };
}

export interface BuyProductResult {
  productId: string;
  purchaseId: string;
  status: string;
  seller: string;
  ledgerTxId?: string;
  paidAmount?: string;
  paidAsset?: string;
}

/**
 * Buys a marketplace product. Uses the platform's custodial x402 settlement:
 * attempt the purchase without payment, catch the 402, sign a payment
 * authorization map against the returned challenge, then retry with `payment`.
 * The buyer is the signing agent. On local stacks the facilitator must be
 * provisioned with the fake USDC fixture (or use a native-SOL priced product).
 */
export async function buyProduct(
  client: TinyPlaceClient,
  signer: LocalSigner,
  productId: string,
  options: { delivery?: Record<string, unknown> } = {},
): Promise<BuyProductResult> {
  const request: ProductBuyRequest = {
    buyer: signer.agentId,
    buyerCryptoId: signer.agentId,
    ...(options.delivery ? { delivery: options.delivery } : {}),
  };

  let challenge: PaymentChallenge | undefined;
  try {
    const purchase = await client.marketplace.buyProduct(productId, request);
    // Free / no-payment purchase path.
    return {
      productId: purchase.productId,
      purchaseId: purchase.purchaseId,
      status: purchase.ledgerTxId ? "settled" : "completed",
      seller: purchase.seller,
      ...(purchase.ledgerTxId ? { ledgerTxId: purchase.ledgerTxId } : {}),
    };
  } catch (error) {
    challenge = challengeOf(error);
    if (!challenge) throw error;
  }

  const payment = await payFromChallenge(signer, challenge, {
    purpose: "marketplace",
    productId,
  });
  const purchase = await client.marketplace.buyProduct(productId, {
    ...request,
    payment,
  });
  return {
    productId: purchase.productId,
    purchaseId: purchase.purchaseId,
    status: purchase.ledgerTxId ? "settled" : "completed",
    seller: purchase.seller,
    ...(purchase.ledgerTxId ? { ledgerTxId: purchase.ledgerTxId } : {}),
    paidAmount: challenge.amount,
    paidAsset: challenge.asset,
  };
}

// ---------------------------------------------------------------------------
// Ledger — settlement history.
// ---------------------------------------------------------------------------

export interface LedgerEntry {
  txId: string;
  type: LedgerType;
  status: string;
  amount?: string | null;
  asset?: string | null;
  network: string;
  from?: string | null;
  to?: string | null;
  timestamp: string;
  onChainTx: string;
}

/**
 * Lists settlement-ledger transactions. Filter by `agent` (either side of a
 * transaction), ledger `type` (e.g. `SALE`, `PAYMENT`, `REGISTRATION`), or
 * limit the page size. Lets an agent audit its own economic activity.
 */
export async function listLedger(
  client: TinyPlaceClient,
  options: { agent?: string; type?: LedgerType; limit?: number } = {},
): Promise<Array<LedgerEntry>> {
  const params: LedgerListParams = {
    ...(options.agent ? { agent: options.agent } : {}),
    ...(options.type ? { type: options.type } : {}),
    limit: options.limit ?? 20,
  };
  const response = await client.ledger.list(params);
  return (response.transactions ?? []).map((transaction) => ({
    txId: transaction.txId,
    type: transaction.type,
    status: transaction.status,
    amount: transaction.amount,
    asset: transaction.asset,
    network: transaction.network,
    from: transaction.from,
    to: transaction.to,
    timestamp: transaction.timestamp,
    onChainTx: transaction.onChainTx,
  }));
}

/** Reads a single ledger transaction by its id. */
export async function getLedgerTransaction(
  client: TinyPlaceClient,
  txId: string,
): Promise<LedgerEntry> {
  const transaction = await client.ledger.get(txId);
  return {
    txId: transaction.txId,
    type: transaction.type,
    status: transaction.status,
    amount: transaction.amount,
    asset: transaction.asset,
    network: transaction.network,
    from: transaction.from,
    to: transaction.to,
    timestamp: transaction.timestamp,
    onChainTx: transaction.onChainTx,
  };
}

// ---------------------------------------------------------------------------
// Payments — read-only infrastructure info (no signing).
// ---------------------------------------------------------------------------

export interface FacilitatorInfo {
  address: string;
  network: string;
}

/**
 * Reads the custodial facilitator's account + network. An agent building a
 * delegated transfer sets this address as the fee payer.
 */
export async function facilitatorInfo(
  client: TinyPlaceClient,
): Promise<FacilitatorInfo> {
  const info = await client.payments.facilitator();
  return { address: info.address, network: info.network };
}

export interface SupportedChainInfo {
  network: string;
  name: string;
  kind: string;
  nativeAsset: string;
  assets: Array<string>;
}

/** Lists the payment chains + assets the platform can settle on. */
export async function supportedChains(
  client: TinyPlaceClient,
): Promise<Array<SupportedChainInfo>> {
  const response = await client.payments.supported();
  return (response.chains ?? []).map((chain) => ({
    network: chain.network,
    name: chain.name,
    kind: chain.kind,
    nativeAsset: chain.nativeAsset,
    assets: (chain.assets ?? []).map((asset) => asset.symbol),
  }));
}
