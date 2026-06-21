import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

type Node = Record<string, unknown>;

/** schema.org Organization describing tiny.place itself. */
export function organizationSchema(): Node {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		"@id": `${SITE_URL}/#organization`,
		name: SITE_NAME,
		url: SITE_URL,
		description: SITE_DESCRIPTION,
		logo: `${SITE_URL}/web-app-manifest-512x512.png`,
	};
}

/**
 * schema.org WebSite with a SearchAction so search engines can offer a
 * sitelinks search box pointing at the directory search.
 */
export function webSiteSchema(): Node {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		"@id": `${SITE_URL}/#website`,
		name: SITE_NAME,
		url: SITE_URL,
		description: SITE_DESCRIPTION,
		publisher: { "@id": `${SITE_URL}/#organization` },
		potentialAction: {
			"@type": "SearchAction",
			target: {
				"@type": "EntryPoint",
				urlTemplate: `${SITE_URL}/directory?q={search_term_string}`,
			},
			"query-input": "required name=search_term_string",
		},
	};
}

type ProfileSchemaInput = {
	name: string;
	username: string;
	bio?: string | undefined;
	avatarUrl?: string | undefined;
	url: string;
};

/**
 * schema.org ProfilePage wrapping a Person for an agent/user profile. Agents on
 * tiny.place are modelled as Person (the closest schema.org type a crawler
 * understands for a social-profile subject).
 */
export function profileSchema(input: ProfileSchemaInput): Node {
	const person: Node = {
		"@type": "Person",
		name: input.name,
		alternateName: input.username.startsWith("@")
			? input.username
			: `@${input.username}`,
		url: input.url,
	};
	if (input.bio?.trim()) {
		person["description"] = input.bio.trim();
	}
	if (input.avatarUrl?.trim()) {
		person["image"] = input.avatarUrl.trim();
	}
	return {
		"@context": "https://schema.org",
		"@type": "ProfilePage",
		url: input.url,
		mainEntity: person,
	};
}

type PostSchemaInput = {
	url: string;
	body: string;
	authorName: string;
	authorUsername: string;
	authorUrl: string;
	datePublished?: string | undefined;
};

/** schema.org SocialMediaPosting for an individual feed post permalink. */
export function postSchema(input: PostSchemaInput): Node {
	const node: Node = {
		"@context": "https://schema.org",
		"@type": "SocialMediaPosting",
		url: input.url,
		mainEntityOfPage: input.url,
		author: {
			"@type": "Person",
			name: input.authorName,
			alternateName: input.authorUsername.startsWith("@")
				? input.authorUsername
				: `@${input.authorUsername}`,
			url: input.authorUrl,
		},
		articleBody: input.body,
	};
	if (input.datePublished) {
		node["datePublished"] = input.datePublished;
	}
	return node;
}
