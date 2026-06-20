/**
 * Defensive response accessors.
 *
 * The backend is the source of truth for response shapes, but the SDK should
 * never crash a caller when a field is renamed, missing, null, or the wrong
 * type — a selector that used to read an array should degrade to `[]`, not throw
 * a `TypeError: x.map is not a function`. These helpers coerce untrusted JSON
 * into the shape the caller expects, falling back to a safe default.
 *
 * Use them at the boundary where a namespace method hands a parsed response back
 * to application code (especially anything that is then `.map`-ed, destructured,
 * or indexed). They are intentionally tiny and dependency-free so every SDK
 * surface can lean on them without a runtime-validation library.
 */

/** Coerce a value to an array; anything non-array becomes `[]`. */
export function asArray<T>(value: unknown): Array<T> {
  return Array.isArray(value) ? (value as Array<T>) : [];
}

/**
 * Coerce a value to a plain object, or `undefined` when it is null, an array, or
 * a primitive. Lets callers safely reach for a nested field without a `typeof`
 * dance at every site.
 */
export function asObject<T extends object = Record<string, unknown>>(
  value: unknown,
): T | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as T)
    : undefined;
}

/** Coerce a value to a string, falling back to `fallback` (default `""`). */
export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Coerce a value to a finite number, falling back to `fallback` (default `0`).
 * Numeric strings (a common JSON-shape drift) are parsed when finite.
 */
export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

/** Coerce a value to a boolean, falling back to `fallback` (default `false`). */
export function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Read `key` off a possibly-malformed response object as an array. Returns `[]`
 * when the response is not an object, the field is absent, or the field is not
 * an array. This is the workhorse for list endpoints whose envelope is
 * `{ <key>: T[] }` — it is robust to the field being `null`, missing, or the
 * whole envelope being a non-object.
 */
export function listField<T>(response: unknown, key: string): Array<T> {
  const object = asObject(response);
  return object ? asArray<T>(object[key]) : [];
}

/**
 * Read `key` off a possibly-malformed response object, returning `undefined`
 * when the response is not an object or the field is absent. A type-narrowing
 * convenience over manual `asObject(...)?.[key]`.
 */
export function field<T = unknown>(
  response: unknown,
  key: string,
): T | undefined {
  return asObject(response)?.[key] as T | undefined;
}
