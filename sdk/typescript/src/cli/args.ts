import type { Flags, JsonObject, ParsedArgs } from "./types.js";

export function parseArgs(argv: Array<string>): ParsedArgs {
  const positionals: Array<string> = [];
  const flags: Flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      const value = next === undefined || next.startsWith("--") ? true : next;
      const existing = flags[key];
      if (existing === undefined) {
        flags[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(String(value));
      } else {
        flags[key] = [String(existing), String(value)];
      }
      if (value !== true) {
        index += 1;
      }
    } else {
      positionals.push(token);
    }
  }
  return {
    command: positionals[0],
    positionals: positionals.slice(1),
    flags,
  };
}

export function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return undefined;
}

export function numberFlag(flags: Flags, name: string): number | undefined {
  const value = stringFlag(flags, name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function boolFlag(flags: Flags, name: string): boolean {
  const value = flags[name];
  return value === true || value === "true";
}

export function listFlag(flags: Flags, name: string): Array<string> | undefined {
  const value = flags[name];
  if (value === undefined) {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : [String(value)];
  const out = raw.flatMap((entry) => String(entry).split(",")).map((entry) => entry.trim()).filter(Boolean);
  return out.length ? out : undefined;
}

export function requiredFlag(flags: Flags, name: string): string {
  return required(stringFlag(flags, name), `--${name}`);
}

export function required<T>(value: T | undefined, usage: string): T {
  if (value === undefined || value === null || value === "") {
    throw new Error(`usage: ${usage}`);
  }
  return value;
}

export function bodyFlag(flags: Flags): JsonObject {
  const body = stringFlag(flags, "data");
  if (!body) {
    return {};
  }
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--data must be a JSON object");
  }
  return parsed as JsonObject;
}

export function typedBody<T>(flags: Flags): T {
  return bodyFlag(flags) as T;
}

export function queryFlags(flags: Flags, names: Array<string>): JsonObject {
  const query: JsonObject = {};
  for (const name of names) {
    const value = stringFlag(flags, name);
    if (value !== undefined) {
      query[name] = name === "limit" || name === "offset" ? Number(value) : value;
    }
  }
  return query;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

export function hexToBytes(value: string): Uint8Array {
  const normalized = value.trim().replace(/^0x/i, "");
  if (normalized.length % 2 !== 0) {
    throw new Error("TINYPLACE_SECRET_KEY must be an even-length hex string");
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}
