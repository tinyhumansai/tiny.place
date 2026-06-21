import { cache } from "react";

import type { Post } from "@tinyhumansai/tinyplace";

import { createClient } from "./api-client";

/**
 * Fetches a single feed post server-side and unauthenticated (so it works for
 * crawlers and signed-out visitors). Returns null when the post does not
 * resolve or the backend is unreachable, so the permalink page can fall back to
 * generic metadata rather than failing the render.
 *
 * Wrapped in React `cache()` so `generateMetadata` and the page component share
 * one backend call per request rather than fetching the same post twice.
 */
export const fetchPost = cache(
	async (handle: string, postId: string): Promise<Post | null> => {
		try {
			const client = createClient();
			return await client.feeds.getPost(handle, postId);
		} catch {
			return null;
		}
	}
);
