import { describe, expect, it } from "vitest";
import {
  classifyError,
  ERROR_CODE_GUIDE,
  errorCode,
  TINYPLACE_ERROR_CODES,
  type TinyPlaceErrorCode,
} from "../src/errors.js";
import { TinyPlaceError } from "../src/http.js";
import { TinyPlaceValidationError } from "../src/validation.js";

/**
 * The error taxonomy is the recovery contract an agent branches on, so it is
 * pinned with a table mapping representative errors to their stable code. The
 * classifier accepts `unknown` (real `TinyPlaceError`s, the duck-typed
 * `{ status, body }` the CLI passes around, and plain `Error`s alike).
 */
const cases: Array<{ name: string; error: unknown; code: TinyPlaceErrorCode }> = [
  {
    name: "402 status → payment_required",
    error: new TinyPlaceError(402, { payment: { amount: "1000" } }),
    code: "payment_required",
  },
  {
    name: "paymentRequired present at any status → payment_required",
    error: { status: 500, paymentRequired: { payment: { amount: "1" } } },
    code: "payment_required",
  },
  {
    name: "401 → auth_invalid",
    error: new TinyPlaceError(401, { error: "invalid signature" }),
    code: "auth_invalid",
  },
  { name: "403 → auth_invalid", error: { status: 403 }, code: "auth_invalid" },
  {
    name: "409 handle clash → handle_taken",
    error: new TinyPlaceError(409, { error: "handle already taken" }),
    code: "handle_taken",
  },
  {
    name: "409 without handle text → validation",
    error: new TinyPlaceError(409, { error: "version conflict" }),
    code: "validation",
  },
  { name: "404 → not_found", error: { status: 404 }, code: "not_found" },
  { name: "429 → rate_limited", error: { status: 429 }, code: "rate_limited" },
  {
    name: "400 → validation",
    error: new TinyPlaceError(400, { error: "bad field" }),
    code: "validation",
  },
  { name: "422 → validation", error: { status: 422 }, code: "validation" },
  {
    name: "TinyPlaceValidationError → validation",
    error: new TinyPlaceValidationError("name is required"),
    code: "validation",
  },
  {
    name: "transport error (status 0) → transient",
    error: new TinyPlaceError(0, "ECONNREFUSED"),
    code: "transient",
  },
  { name: "503 → transient", error: { status: 503 }, code: "transient" },
  { name: "408 → transient", error: { status: 408 }, code: "transient" },
  { name: "500 → server", error: { status: 500 }, code: "server" },
  {
    name: "GraphQL 200 envelope with errors → graphql",
    error: new TinyPlaceError(200, { data: null, errors: [{ message: "boom" }] }),
    code: "graphql",
  },
  {
    name: "signer-required Error → no_signer",
    error: new Error("registerWithSolanaPayment requires a signing key"),
    code: "no_signer",
  },
  {
    name: "plain unknown Error → unknown",
    error: new Error("something odd happened"),
    code: "unknown",
  },
  { name: "non-error value → unknown", error: "boom", code: "unknown" },
];

describe("classifyError", () => {
  for (const { name, error, code } of cases) {
    it(name, () => {
      expect(errorCode(error)).toBe(code);
      const classified = classifyError(error);
      expect(classified.code).toBe(code);
      expect(classified.hint.length).toBeGreaterThan(0);
      expect(typeof classified.retryable).toBe("boolean");
    });
  }

  it("echoes the HTTP status when present, omits it otherwise", () => {
    expect(classifyError({ status: 404 }).status).toBe(404);
    expect(classifyError(new Error("local")).status).toBeUndefined();
  });

  it("only the transient/server/rate_limited codes are retryable", () => {
    const retryable = TINYPLACE_ERROR_CODES.filter(
      (code) => classifyError(forCode(code)).retryable,
    );
    expect(new Set(retryable)).toEqual(
      new Set<TinyPlaceErrorCode>(["transient", "server", "rate_limited"]),
    );
  });
});

describe("ERROR_CODE_GUIDE", () => {
  it("documents every code exactly once, in order", () => {
    expect(ERROR_CODE_GUIDE.map((row) => row.code)).toEqual([
      ...TINYPLACE_ERROR_CODES,
    ]);
    for (const row of ERROR_CODE_GUIDE) {
      expect(row.when.length).toBeGreaterThan(0);
      expect(row.hint.length).toBeGreaterThan(0);
    }
  });
});

/** A representative error that classifies to each code (for the retryable check). */
function forCode(code: TinyPlaceErrorCode): unknown {
  switch (code) {
    case "payment_required":
      return { status: 402 };
    case "auth_invalid":
      return { status: 401 };
    case "handle_taken":
      return { status: 409, body: { error: "handle taken" } };
    case "not_found":
      return { status: 404 };
    case "rate_limited":
      return { status: 429 };
    case "validation":
      return { status: 400 };
    case "no_signer":
      return new Error("requires a signing key");
    case "transient":
      return { status: 0 };
    case "server":
      return { status: 500 };
    case "graphql":
      return { status: 200, body: { errors: [{ message: "x" }] } };
    case "unknown":
      return new Error("???");
  }
}
