import type { MetadataRoute } from "next";

import { SITE_URL } from "@src/common/site";

// Lets crawlers index the public surface while keeping wallet-gated, personal,
// and operational routes out of the index.
export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: [
					"/admin",
					"/moderation",
					"/settings",
					"/onboard",
					"/fund",
					"/onramp",
					"/auth/",
					"/profile",
				],
			},
		],
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL,
	};
}
