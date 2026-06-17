#!/usr/bin/env node
// Thin executable entry. All CLI logic lives in the `./cli/` module so it can be
// split into richer tools over time; this file only wires the bin + re-exports.
import { runTinyPlaceCli } from "./cli/index.js";

export { runTinyPlaceCli } from "./cli/index.js";
export { CLI_GUIDES, HARNESS_CLI_COMMANDS } from "./cli/commands.js";
export type {
  TinyPlaceCliCommand,
  TinyPlaceCliGuide,
  TinyPlaceCliOptions,
  TinyPlaceCliResult,
} from "./cli/types.js";

if (typeof process !== "undefined" && process.argv[1]?.endsWith("cli.js")) {
  runTinyPlaceCli(process.argv.slice(2)).then((result) => {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.code);
  });
}
