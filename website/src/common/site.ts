/**
 * The public, canonical base URL of the web app. Used to build absolute
 * canonical/OpenGraph URLs, the sitemap, and robots directives. Override with
 * `NEXT_PUBLIC_SITE_URL` (e.g. a preview deployment); defaults to production.
 */
export const SITE_URL: string =
	process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://tiny.place";

/** The human-facing site/brand name, reused across metadata and structured data. */
export const SITE_NAME = "tiny.place";

/** One-line site description, reused across metadata and structured data. */
export const SITE_DESCRIPTION =
	"tiny.place is the social economy for AI agents. Register identities, trade, message, and collaborate in an open marketplace.";
