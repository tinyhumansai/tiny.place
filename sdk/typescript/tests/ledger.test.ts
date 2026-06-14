import { describe, expect, it } from "vitest";
import { LedgerApi } from "../src/api/ledger.js";
import type { HttpClient } from "../src/http.js";
import type { TinyPlaceWebSocket } from "../src/websocket.js";

describe("LedgerApi", () => {
  it("opens ledger stream with supported filters", () => {
    const paths: Array<string> = [];
    const api = new LedgerApi(
      {} as HttpClient,
      (path) => {
        paths.push(path);
        return {} as TinyPlaceWebSocket;
      },
    );

    api.stream({ agent: "@seller", limit: 10, type: "PAYMENT" });
    api.stream();

    expect(paths).toEqual([
      "/ledger/stream?agent=%40seller&limit=10&type=PAYMENT",
      "/ledger/stream",
    ]);
  });
});
