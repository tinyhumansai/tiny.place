import assert from "node:assert/strict";
import test from "node:test";

import type { LocalSigner, TinyPlaceClient } from "@tinyhumansai/tinyplace";

import { assertSupportedDeliveryMethod, createProduct } from "./market.js";

const SIGNER = {
  agentId: "57mjBDibe6f6Vqv9uvhB6nckcz6cKwSCqt4Lio1DawJh",
  publicKeyBase64: "WM8smAepeXnyL8+36sM0I3a/dfE5RkxJ66w3eXIrOSM=",
} as unknown as LocalSigner;

const PRODUCT_FIXTURE = {
  productId: "prod_1",
  name: "Sample",
  description: "A sample product",
  category: "tool",
  price: { amount: "1000000", asset: "USDC", network: "solana" },
  seller: SIGNER.agentId,
  deliveryMethod: "download",
  status: "active",
  stock: null,
  salesCount: 0,
  rating: 0,
};

function clientThatExpects(expectedDeliveryMethod: string): TinyPlaceClient {
  return {
    marketplace: {
      createProduct: (request: {
        deliveryMethod: string;
      }): Promise<unknown> => {
        assert.equal(request.deliveryMethod, expectedDeliveryMethod);
        return Promise.resolve({
          ...PRODUCT_FIXTURE,
          deliveryMethod: request.deliveryMethod,
        });
      },
    },
  } as unknown as TinyPlaceClient;
}

const clientThatMustNotBeCalled = {
  marketplace: {
    createProduct: (): never => {
      throw new Error("createProduct must not be called for an invalid method");
    },
  },
} as unknown as TinyPlaceClient;

function input(deliveryMethod: string): Parameters<typeof createProduct>[2] {
  return {
    name: "Sample",
    description: "A sample product",
    category: "tool" as never,
    price: { amount: "1000000", asset: "USDC", network: "solana" },
    deliveryMethod: deliveryMethod as never,
  };
}

test("assertSupportedDeliveryMethod accepts download", () => {
  assert.equal(assertSupportedDeliveryMethod("download"), "download");
});

test("assertSupportedDeliveryMethod accepts a2a-task", () => {
  assert.equal(assertSupportedDeliveryMethod("a2a-task"), "a2a-task");
});

test("assertSupportedDeliveryMethod rejects encrypted-message with an actionable error", () => {
  assert.throws(
    () => assertSupportedDeliveryMethod("encrypted-message"),
    (error: Error) => {
      assert.match(error.message, /encrypted-message/);
      assert.match(error.message, /not supported via the CLI/);
      // Names the supported alternatives so the seller can recover.
      assert.match(error.message, /download/);
      assert.match(error.message, /a2a-task/);
      return true;
    },
  );
});

test("assertSupportedDeliveryMethod rejects an unknown method", () => {
  assert.throws(
    () => assertSupportedDeliveryMethod("smoke-signal"),
    (error: Error) => {
      assert.match(error.message, /unknown delivery method "smoke-signal"/);
      assert.match(error.message, /download/);
      assert.match(error.message, /a2a-task/);
      return true;
    },
  );
});

test("createProduct rejects encrypted-message before the network call", async () => {
  await assert.rejects(
    createProduct(
      clientThatMustNotBeCalled,
      SIGNER,
      input("encrypted-message"),
    ),
    /not supported via the CLI/,
  );
});

test("createProduct rejects an unknown delivery method before the network call", async () => {
  await assert.rejects(
    createProduct(clientThatMustNotBeCalled, SIGNER, input("smoke-signal")),
    /unknown delivery method/,
  );
});

test("createProduct accepts download and lists the product", async () => {
  const result = await createProduct(
    clientThatExpects("download"),
    SIGNER,
    input("download"),
  );
  assert.equal(result.productId, "prod_1");
  assert.equal(result.deliveryMethod, "download");
});

test("createProduct accepts a2a-task and lists the product", async () => {
  const result = await createProduct(
    clientThatExpects("a2a-task"),
    SIGNER,
    input("a2a-task"),
  );
  assert.equal(result.productId, "prod_1");
  assert.equal(result.deliveryMethod, "a2a-task");
});
