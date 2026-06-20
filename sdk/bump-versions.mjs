#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SDK_ROOT = dirname(fileURLToPath(import.meta.url));

const PACKAGES = [
  {
    name: "typescript",
    path: "typescript/package.json",
    readVersion: readPackageJsonVersion,
    writeVersion: writePackageJsonVersion,
  },
  {
    name: "python",
    path: "python/pyproject.toml",
    readVersion: (path) => readTomlVersion(path, "project"),
    writeVersion: (path, version) => writeTomlVersion(path, "project", version),
  },
  {
    name: "rust",
    path: "rust/Cargo.toml",
    readVersion: (path) => readTomlVersion(path, "package"),
    writeVersion: (path, version) => {
      writeTomlVersion(path, "package", version);
      writeCargoLockVersion(resolvePath("rust/Cargo.lock"), "tinyplace", version);
    },
  },
  {
    name: "website",
    path: "../website/package.json",
    readVersion: readPackageJsonVersion,
    writeVersion: writePackageJsonVersion,
  },
];

// The SDKs that are bumped when no explicit --only selection is given. The
// website is bumpable too, but only when named explicitly (it is released on
// its own cadence via the website-v* tag, not alongside an "all SDKs" bump).
const DEFAULT_TARGETS = ["typescript", "python", "rust"];

function usage(exitCode = 0) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`Usage: node sdk/bump-versions.mjs <patch|minor|major> [--only <list>] [--sync] [--dry-run]\n\n`);
  stream.write("Bumps package versions in one shot:\n");
  stream.write("  - sdk/typescript/package.json   (target: typescript)\n");
  stream.write("  - sdk/python/pyproject.toml     (target: python)\n");
  stream.write("  - sdk/rust/Cargo.toml + Cargo.lock (target: rust)\n");
  stream.write("  - website/package.json          (target: website)\n\n");
  stream.write("By default the three SDKs are bumped, each from its own current version.\n");
  stream.write("With --only typescript,website (comma/space separated), only the named targets are bumped.\n");
  stream.write("With --sync, the selected targets are set to the same next version, based on their highest current version.\n");
  stream.write("With --dry-run, planned changes are printed without writing files.\n");
  process.exit(exitCode);
}

// Parse the value(s) for --only. Accepts comma- or space-separated names and
// validates them against the known package names.
function parseOnly(args) {
  const index = args.indexOf("--only");
  if (index === -1) {
    return null;
  }

  const raw = args[index + 1];
  if (!raw || raw.startsWith("-")) {
    process.stderr.write("--only requires a comma-separated list of targets\n");
    usage(1);
  }

  const known = new Set(PACKAGES.map((pkg) => pkg.name));
  const selected = raw
    .split(/[\s,]+/)
    .map((name) => name.trim())
    .filter(Boolean);

  const unknown = selected.filter((name) => !known.has(name));
  if (selected.length === 0 || unknown.length > 0) {
    process.stderr.write(`unknown --only target(s): ${unknown.join(", ") || "(none given)"}\n`);
    process.stderr.write(`valid targets: ${[...known].join(", ")}\n`);
    usage(1);
  }

  return selected;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage(0);
  }

  const only = parseOnly(args);

  // Drop --only and its value before scanning for the positional bump arg so
  // the comma-separated target list isn't mistaken for the bump.
  const onlyIndex = args.indexOf("--only");
  const positional = args.filter((arg, index) => {
    if (onlyIndex !== -1 && (index === onlyIndex || index === onlyIndex + 1)) {
      return false;
    }
    return !arg.startsWith("-");
  });

  const bump = positional[0];
  const sync = args.includes("--sync");
  const dryRun = args.includes("--dry-run");
  const unknown = args.filter(
    (arg) => arg.startsWith("-") && !["--sync", "--dry-run", "--only"].includes(arg),
  );

  if (!["patch", "minor", "major"].includes(bump) || unknown.length > 0) {
    usage(1);
  }

  const targets = only ?? DEFAULT_TARGETS;
  const selectedPackages = PACKAGES.filter((pkg) => targets.includes(pkg.name));

  const current = selectedPackages.map((pkg) => {
    const absolutePath = resolvePath(pkg.path);
    return {
      ...pkg,
      absolutePath,
      currentVersion: pkg.readVersion(absolutePath),
    };
  });

  const baseVersion = sync ? highestVersion(current.map((pkg) => pkg.currentVersion)) : null;
  const nextVersion = baseVersion ? bumpVersion(baseVersion, bump) : null;

  for (const pkg of current) {
    const version = nextVersion ?? bumpVersion(pkg.currentVersion, bump);
    if (!dryRun) {
      pkg.writeVersion(pkg.absolutePath, version);
    }
    process.stdout.write(`${pkg.name}: ${pkg.currentVersion} -> ${version}\n`);
  }

  if (dryRun) {
    process.stdout.write("dry run: no files changed\n");
  }
}

function resolvePath(relativePath) {
  return resolve(SDK_ROOT, relativePath);
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version "${version}". Expected MAJOR.MINOR.PATCH.`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function bumpVersion(version, bump) {
  const parsed = parseVersion(version);

  if (bump === "major") {
    return formatVersion({ major: parsed.major + 1, minor: 0, patch: 0 });
  }

  if (bump === "minor") {
    return formatVersion({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
  }

  return formatVersion({ ...parsed, patch: parsed.patch + 1 });
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);

  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function highestVersion(versions) {
  return [...versions].sort(compareVersions).at(-1);
}

function readPackageJsonVersion(path) {
  return JSON.parse(readFileSync(path, "utf8")).version;
}

function writePackageJsonVersion(path, version) {
  // Replace the top-level "version" field in place rather than reserialising the
  // whole file, so existing indentation/formatting (tabs vs spaces, key order)
  // is preserved and the diff stays to a single line. package.json only carries
  // a literal `"version":` at the top level (dependency entries are name:range),
  // so the first match is the package version.
  const text = readFileSync(path, "utf8");
  let replaced = false;
  const updated = text.replace(/("version"\s*:\s*)"[^"]+"/, (match, prefix) => {
    replaced = true;
    return `${prefix}"${version}"`;
  });

  if (!replaced) {
    throw new Error(`Missing top-level "version" field in ${path}`);
  }

  writeFileSync(path, updated);
}

function sectionPattern(sectionName) {
  return new RegExp(`(^\\[${escapeRegExp(sectionName)}\\]\\n)([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, "m");
}

function readTomlVersion(path, sectionName) {
  const text = readFileSync(path, "utf8");
  const section = text.match(sectionPattern(sectionName));
  if (!section) {
    throw new Error(`Missing [${sectionName}] section in ${path}`);
  }

  const version = section[2].match(/^version\s*=\s*"([^"]+)"\s*$/m);
  if (!version) {
    throw new Error(`Missing version field in [${sectionName}] section of ${path}`);
  }

  return version[1];
}

function writeTomlVersion(path, sectionName, version) {
  const text = readFileSync(path, "utf8");
  const updated = text.replace(sectionPattern(sectionName), (_match, header, body) => {
    if (!/^version\s*=\s*"[^"]+"\s*$/m.test(body)) {
      throw new Error(`Missing version field in [${sectionName}] section of ${path}`);
    }

    return `${header}${body.replace(/^version\s*=\s*"[^"]+"\s*$/m, `version = "${version}"`)}`;
  });

  if (updated === text) {
    throw new Error(`Failed to update [${sectionName}] version in ${path}`);
  }

  writeFileSync(path, updated);
}

function writeCargoLockVersion(path, packageName, version) {
  const text = readFileSync(path, "utf8");
  const packagePattern = /(^\[\[package\]\]\n)([\s\S]*?)(?=^\[\[package\]\]|(?![\s\S]))/gm;
  let found = false;

  const updated = text.replace(packagePattern, (match, header, body) => {
    if (!new RegExp(`^name\\s*=\\s*"${escapeRegExp(packageName)}"\\s*$`, "m").test(body)) {
      return match;
    }

    found = true;
    return `${header}${body.replace(/^version\s*=\s*"[^"]+"\s*$/m, `version = "${version}"`)}`;
  });

  if (!found) {
    throw new Error(`Missing ${packageName} package entry in ${path}`);
  }

  writeFileSync(path, updated);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main();
