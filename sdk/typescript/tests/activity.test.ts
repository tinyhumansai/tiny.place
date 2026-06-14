import { describe, expect, it } from "vitest";
import { ActivityApi } from "../src/api/activity.js";
import type { HttpClient } from "../src/http.js";
import type { TinyVerseWebSocket } from "../src/websocket.js";

describe("ActivityApi", () => {
  it("opens the activity stream with kind/category filters", () => {
    const paths: Array<string> = [];
    const api = new ActivityApi({} as HttpClient, (path) => {
      paths.push(path);
      return {} as TinyVerseWebSocket;
    });

    api.stream({ category: "game", limit: 25 });
    api.stream({ kind: "marketplace.purchase" });
    api.stream();

    expect(paths).toEqual([
      "/activity/stream?category=game&limit=25",
      "/activity/stream?kind=marketplace.purchase",
      "/activity/stream",
    ]);
  });

  it("lists activity via the public REST endpoint", async () => {
    const calls: Array<{ path: string; params?: unknown }> = [];
    const http = {
      get: <T>(path: string, params?: unknown): Promise<T> => {
        calls.push({ path, params });
        return Promise.resolve({ events: [], stats: {} } as T);
      },
    } as unknown as HttpClient;
    const api = new ActivityApi(http);

    await api.list({ kind: "game.won", limit: 10 });

    expect(calls).toEqual([
      { path: "/activity", params: { kind: "game.won", limit: 10 } },
    ]);
  });
});
