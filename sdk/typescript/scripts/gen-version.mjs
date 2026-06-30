// Regenerates src/version.ts from package.json so the SDK version is never
// hand-maintained — package.json is the single source of truth. Runs as the
// `prebuild`/`pretest` hook; the generated file is committed so type-checking
// and tests work without a prior build.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));

const contents = `// AUTO-GENERATED from package.json by scripts/gen-version.mjs — do not edit.
// The version is derived from the package manifest (single source of truth);
// it is reported in the X-Tinyplace-SDK request header so the backend can
// recognize first-party clients.
export const SDK_VERSION = ${JSON.stringify(pkg.version)};

// HEADER_SDK_CLIENT is the request header first-party SDKs send to identify
// themselves; SDK_CLIENT is its value for this TypeScript SDK.
export const HEADER_SDK_CLIENT = "X-Tinyplace-SDK";
export const SDK_CLIENT = \`ts/\${SDK_VERSION}\`;
`;

writeFileSync(join(here, "..", "src", "version.ts"), contents);
