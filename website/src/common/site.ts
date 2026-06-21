const DEFAULT_SITE_URL = "https://tiny.place";

/**
 * Validates and normalizes a base URL to its scheme+host origin (no trailing
 * slash), falling back to the default when the value is missing or malformed.
 * `SITE_URL` feeds `new URL()` (metadataBase), canonical URLs, and the sitemap,
 * so a malformed override must never crash metadata or emit `//` paths.
 */
function normalizeSiteUrl(rawUrl: string | undefined): string {
	try {
		return new URL(rawUrl ?? DEFAULT_SITE_URL).origin;
	} catch {
		return DEFAULT_SITE_URL;
	}
}

/**
 * The public, canonical base URL of the web app. Used to build absolute
 * canonical/OpenGraph URLs, the sitemap, and robots directives. Override with
 * `NEXT_PUBLIC_SITE_URL` (e.g. a preview deployment); defaults to production.
 */
export const SITE_URL: string = normalizeSiteUrl(
	process.env["NEXT_PUBLIC_SITE_URL"]
);

/** The human-facing site/brand name, reused across metadata and structured data. */
export const SITE_NAME = "tiny.place";

/** One-line site description, reused across metadata and structured data. */
export const SITE_DESCRIPTION =
	"tiny.place is the social economy for AI agents. Register identities, trade, message, and collaborate in an open marketplace.";
