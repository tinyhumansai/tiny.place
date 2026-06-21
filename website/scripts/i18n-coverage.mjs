#!/usr/bin/env node
/**
 * i18n coverage check — verifies every locale's translation file is in parity
 * with the English source of truth, and that count-based (plural) strings carry
 * the CLDR plural categories each language actually needs.
 *
 * Inspired by the openhuman-1 `i18n-coverage` script, adapted to tiny.place's
 * nested-JSON / i18next layout. English (`en`) is the reference.
 *
 * Two checks per locale:
 *   1. Key parity — every "logical" key in en must exist in the locale and vice
 *      versa. A plural key (`foo_one`/`foo_other` in en) collapses to its base
 *      `foo` for this comparison, so locales may carry extra CLDR categories
 *      (`foo_few`, `foo_many`, …) without being flagged as "extra".
 *   2. Plural completeness — for each en plural base, the locale must define a
 *      key for every plural category its language selects on integer counts
 *      (via Intl.PluralRules). This is what stops e.g. Arabic/Russian counts of
 *      3 from falling through to the English `_other` form.
 *
 * Untranslated (value byte-identical to English) is reported as info only —
 * many are legitimately identical (brand/currency names) — unless
 * --strict-untranslated is passed.
 *
 * Usage:
 *   node scripts/i18n-coverage.mjs                 # human report
 *   node scripts/i18n-coverage.mjs --json          # machine-readable summary
 *   node scripts/i18n-coverage.mjs --strict-untranslated
 *
 * Exit code 1 on any parity/plural failure (or untranslated under the strict
 * flag). Wired into CI via `pnpm i18n:check`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const websiteDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = join(websiteDir, "src/assets/locales");
const REFERENCE = "en";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const strictUntranslated = args.includes("--strict-untranslated");

const CLDR_CATEGORIES = ["zero", "one", "two", "few", "many", "other"];

function loadLocale(code) {
	const file = join(localesDir, code, "translations.json");
	return JSON.parse(readFileSync(file, "utf8"));
}

/** Flatten a nested object to dot-path -> string-value pairs. */
function flatten(object, prefix = "", out = {}) {
	for (const [key, value] of Object.entries(object)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === "object" && !Array.isArray(value)) {
			flatten(value, path, out);
		} else {
			out[path] = value;
		}
	}
	return out;
}

/** The plural categories a language selects across integer counts 0..200. */
function requiredCategories(locale) {
	try {
		const rules = new Intl.PluralRules(locale);
		const cats = new Set();
		for (let n = 0; n <= 200; n += 1) cats.add(rules.select(n));
		return cats;
	} catch {
		return new Set(["other"]);
	}
}

const locales = readdirSync(localesDir)
	.filter((entry) => statSync(join(localesDir, entry)).isDirectory())
	.sort();

if (!locales.includes(REFERENCE)) {
	console.error(`i18n-coverage: reference locale '${REFERENCE}' not found`);
	process.exit(1);
}

const en = flatten(loadLocale(REFERENCE));
const enKeySet = new Set(Object.keys(en));
// en plural bases: keys present as both `<base>_one` and `<base>_other`.
const pluralBases = new Set();
for (const key of enKeySet) {
	const match = key.match(/^(.*)_one$/);
	if (match && enKeySet.has(`${match[1]}_other`)) pluralBases.add(match[1]);
}

/** Collapse a plural-category key to its base; leave other keys as-is. */
function logicalKey(key) {
	for (const cat of CLDR_CATEGORIES) {
		if (key.endsWith(`_${cat}`)) {
			const base = key.slice(0, -(cat.length + 1));
			if (pluralBases.has(base)) return base;
		}
	}
	return key;
}

const enLogical = new Set([...enKeySet].map(logicalKey));

const report = [];
let failed = false;

for (const code of locales) {
	if (code === REFERENCE) continue;
	let flat;
	try {
		flat = flatten(loadLocale(code));
	} catch (error) {
		report.push({ code, parseError: String(error) });
		failed = true;
		continue;
	}
	const keySet = new Set(Object.keys(flat));
	const localeLogical = new Set([...keySet].map(logicalKey));
	const missing = [...enLogical].filter((key) => !localeLogical.has(key));
	const extra = [...localeLogical].filter((key) => !enLogical.has(key));

	// Plural completeness: every required category for every plural base.
	const reqCats = requiredCategories(code);
	const pluralMissing = [];
	for (const base of pluralBases) {
		for (const cat of reqCats) {
			if (!keySet.has(`${base}_${cat}`)) pluralMissing.push(`${base}_${cat}`);
		}
	}

	const untranslated = [...enKeySet].filter(
		(key) => keySet.has(key) && flat[key] === en[key]
	);

	const localeFailed =
		missing.length > 0 ||
		extra.length > 0 ||
		pluralMissing.length > 0 ||
		(strictUntranslated && untranslated.length > 0);
	if (localeFailed) failed = true;
	report.push({
		code,
		total: keySet.size,
		missing,
		extra,
		pluralMissing,
		untranslated,
		ok: !localeFailed,
	});
}

if (asJson) {
	console.log(
		JSON.stringify(
			{
				reference: REFERENCE,
				referenceKeys: enKeySet.size,
				pluralBases: pluralBases.size,
				locales: report,
				ok: !failed,
			},
			null,
			2
		)
	);
	process.exit(failed ? 1 : 0);
}

const sample = (list) =>
	list.slice(0, 12).join(", ") + (list.length > 12 ? ` … (+${list.length - 12})` : "");

console.log(
	`i18n coverage — reference '${REFERENCE}' has ${enKeySet.size} keys (${pluralBases.size} plural)\n`
);
for (const entry of report) {
	if (entry.parseError) {
		console.log(`[FAIL] ${entry.code}: could not parse — ${entry.parseError}`);
		continue;
	}
	const status = entry.ok ? "ok  " : "FAIL";
	console.log(
		`[${status}] ${entry.code}: ${entry.total} keys | missing ${entry.missing.length} | extra ${entry.extra.length} | plural-gaps ${entry.pluralMissing.length} | untranslated ${entry.untranslated.length}`
	);
	if (entry.missing.length) console.log(`        missing: ${sample(entry.missing)}`);
	if (entry.extra.length) console.log(`        extra:   ${sample(entry.extra)}`);
	if (entry.pluralMissing.length)
		console.log(`        plural:  ${sample(entry.pluralMissing)}`);
}

console.log(
	failed
		? "\n✗ i18n coverage failed"
		: "\n✓ i18n coverage passed — all locales in parity with en"
);
process.exit(failed ? 1 : 0);
