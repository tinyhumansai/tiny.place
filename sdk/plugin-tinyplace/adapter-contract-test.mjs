#!/usr/bin/env node
// Adapter contract test — the guardrail for adding a new harness.
//
// Every adapter registered in mcp/harness.mjs (the ADAPTERS map) is the ONLY
// per-harness surface the shared core reads. If a new adapter omits a field or
// gets a shape wrong, the core breaks in subtle ways (wrong data dir, no push
// gate, launcher crash). This test asserts the full contract structurally, for
// EVERY registered adapter, so a broken/incomplete adapter fails CI instead of
// shipping. Offline — no node_modules, no network, no harness spawn.
//
// Adding a harness? Read adapters/README.md, then make this test green.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ADAPTERS } from "./mcp/harness.mjs";

let failed = false;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra && !cond ? ` — ${extra}` : ""}`);
  if (!cond) failed = true;
};

const isNonEmptyString = (v) => typeof v === "string" && v.length > 0;
const isFn = (v) => typeof v === "function";

// A throwaway plugin root that has the two files codex's launch.prepare reads
// (mcp/server.mjs is only referenced by path; hooks/hooks.json is read). We point
// prepare() at THIS package's real dir so the read succeeds for any harness.
const REAL_PLUGIN_DIR = new URL(".", import.meta.url).pathname;

const providerKeys = Object.keys(ADAPTERS);
check("at least one adapter registered", providerKeys.length >= 1, `found ${providerKeys.length}`);

for (const key of providerKeys) {
  const a = ADAPTERS[key];
  const p = (label) => `[${key}] ${label}`;

  // ── identity ──────────────────────────────────────────────────────────────
  check(p("provider is a non-empty string"), isNonEmptyString(a.provider), a.provider);
  check(p("provider matches its ADAPTERS key"), a.provider === key, `provider=${a.provider} key=${key}`);

  // ── data dir ──────────────────────────────────────────────────────────────
  check(p("dataDirEnv is TINYPLACE_-prefixed"), isNonEmptyString(a.dataDirEnv) && a.dataDirEnv.startsWith("TINYPLACE_"), a.dataDirEnv);
  check(p("dataDirDefault is an absolute path"), isNonEmptyString(a.dataDirDefault) && a.dataDirDefault.startsWith("/"), a.dataDirDefault);
  check(p("sessionLabelPrefix is a non-empty string"), isNonEmptyString(a.sessionLabelPrefix), a.sessionLabelPrefix);

  // ── harness descriptor ──────────────────────────────────────────────────────
  check(p("harness.command is a non-empty string"), isNonEmptyString(a.harness?.command), a.harness?.command);
  check(p("harness.argv is an array"), Array.isArray(a.harness?.argv), typeof a.harness?.argv);

  // ── session + project scope resolvers ───────────────────────────────────────
  check(p("resolveHarnessSessionId is a function"), isFn(a.resolveHarnessSessionId));
  check(p("resolveHarnessSessionId returns a string"), isFn(a.resolveHarnessSessionId) && typeof a.resolveHarnessSessionId() === "string");
  check(p("projectDir is a function"), isFn(a.projectDir));
  check(p("projectDir returns a string"), isFn(a.projectDir) && typeof a.projectDir() === "string");

  // ── MCP server instructions ─────────────────────────────────────────────────
  check(p("serverInstructions is a non-empty string"), isNonEmptyString(a.serverInstructions));
  // The instructions MUST warn that inbound is untrusted — a prompt-injection guard
  // the core relies on. Cheap structural proxy: mention "UNTRUSTED".
  check(p("serverInstructions marks inbound UNTRUSTED"), /UNTRUSTED/.test(a.serverInstructions || ""));

  // ── inbound delivery contract ───────────────────────────────────────────────
  check(p("inbound is an object"), a.inbound && typeof a.inbound === "object");
  const push = a.inbound?.push;
  const pushValid = push === false || (push && typeof push === "object" && isNonEmptyString(push.capability) && isNonEmptyString(push.method));
  check(p("inbound.push is false or {capability,method}"), pushValid, JSON.stringify(push));
  check(p("inbound.pull is a boolean"), typeof a.inbound?.pull === "boolean", typeof a.inbound?.pull);
  check(p("inbound.foregroundInject is a boolean"), typeof a.inbound?.foregroundInject === "boolean", typeof a.inbound?.foregroundInject);
  // A harness must deliver inbound SOME way, else DMs silently vanish.
  const deliversInbound = !!push || a.inbound?.pull === true || a.inbound?.foregroundInject === true;
  check(p("inbound has at least one delivery path"), deliversInbound);

  // ── autoresponder ────────────────────────────────────────────────────────────
  check(p("responder.command is a non-empty string"), isNonEmptyString(a.responder?.command), a.responder?.command);
  check(p("responder.defaultModel is a non-empty string"), isNonEmptyString(a.responder?.defaultModel), a.responder?.defaultModel);
  check(p("responder.buildArgs is a function"), isFn(a.responder?.buildArgs));
  if (isFn(a.responder?.buildArgs)) {
    const args = a.responder.buildArgs("PROMPT_SENTINEL", "MODEL_SENTINEL", REAL_PLUGIN_DIR);
    check(p("responder.buildArgs returns an array"), Array.isArray(args), typeof args);
    check(p("responder.buildArgs threads the prompt"), Array.isArray(args) && args.includes("PROMPT_SENTINEL"));
    check(p("responder.buildArgs threads the model"), Array.isArray(args) && args.includes("MODEL_SENTINEL"));
  }

  // ── install shape ────────────────────────────────────────────────────────────
  check(p("install.kind is a non-empty string"), isNonEmptyString(a.install?.kind), a.install?.kind);

  // ── launcher recipe ──────────────────────────────────────────────────────────
  check(p("launch.displayHarness is a non-empty string"), isNonEmptyString(a.launch?.displayHarness), a.launch?.displayHarness);
  check(p("launch.binary is a non-empty string"), isNonEmptyString(a.launch?.binary), a.launch?.binary);
  check(p("launch.prepare is a function"), isFn(a.launch?.prepare));
  if (isFn(a.launch?.prepare)) {
    const dataDir = mkdtempSync(join(tmpdir(), `tp-contract-${key}-`));
    try {
      const plan = a.launch.prepare({
        pluginDir: REAL_PLUGIN_DIR.replace(/\/$/, ""),
        dataDir,
        apiUrl: "https://staging-api.tiny.place",
        walletName: "contract-test-wallet",
        forwardedArgs: ["--sentinel-forward"],
      });
      check(p("launch.prepare returns {command,args,env}"), plan && isNonEmptyString(plan.command) && Array.isArray(plan.args) && plan.env && typeof plan.env === "object", JSON.stringify(plan));
      check(p("launch.prepare command matches launch.binary"), plan?.command === a.launch.binary, `${plan?.command} vs ${a.launch.binary}`);
      check(p("launch.prepare forwards extra args"), Array.isArray(plan?.args) && plan.args.includes("--sentinel-forward"));
      check(p("launch.prepare pins the active wallet"), plan?.env?.TINYPLACE_ACTIVE_WALLET === "contract-test-wallet", JSON.stringify(plan?.env));
    } catch (e) {
      check(p("launch.prepare runs without throwing"), false, e.message);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }
}

// ── cross-adapter invariants ───────────────────────────────────────────────────
const providers = providerKeys.map((k) => ADAPTERS[k].provider);
check("all providers are unique", new Set(providers).size === providers.length, providers.join(","));
const dataDirs = providerKeys.map((k) => ADAPTERS[k].dataDirDefault);
check("all dataDirDefaults are distinct (harness isolation)", new Set(dataDirs).size === dataDirs.length, dataDirs.join(","));
const dataEnvs = providerKeys.map((k) => ADAPTERS[k].dataDirEnv);
check("all dataDirEnv vars are distinct", new Set(dataEnvs).size === dataEnvs.length, dataEnvs.join(","));

// Detection: every registered adapter must be reachable via TINYPLACE_HARNESS
// override (the escape hatch the launcher's --harness flag rides on).
const { detectHarness } = await import("./mcp/harness.mjs");
for (const key of providerKeys) {
  check(`[${key}] reachable via TINYPLACE_HARNESS override`, detectHarness({ TINYPLACE_HARNESS: key }) === key);
}

// Sanity: the shared hooks template exists and carries the plugin-root placeholder
// that codex-home install substitutes (a silent break here strands hook commands).
try {
  const tpl = readFileSync(join(REAL_PLUGIN_DIR, "hooks", "hooks.json"), "utf8");
  check("hooks.json template uses ${TINYPLACE_PLUGIN_ROOT}", tpl.includes("${TINYPLACE_PLUGIN_ROOT}"));
} catch (e) {
  check("hooks.json template readable", false, e.message);
}

console.log(failed ? "\nADAPTER CONTRACT FAILED ❌" : `\nADAPTER CONTRACT PASSED ✅ (${providerKeys.length} adapter(s))`);
process.exit(failed ? 1 : 0);
