// Shared offset-pagination helpers for TanStack `useInfiniteQuery`, backed by the
// GraphQL gateway's (and REST list endpoints') `limit`/`offset` paging. Each page
// is the array of rows for one window; the next page's offset is the running
// total already loaded, until a short page signals the list is exhausted.

/** Default number of rows fetched per page across infinite lists. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * getNextOffset returns the `offset` for the next page, or `undefined` once the
 * last page came back short (fewer rows than `pageSize`) — i.e. there is nothing
 * more to load. Wire it straight into TanStack's `getNextPageParam`.
 */
export function getNextOffset<T>(
	lastPage: Array<T>,
	allPages: Array<Array<T>>,
	pageSize: number = DEFAULT_PAGE_SIZE
): number | undefined {
	if (lastPage.length < pageSize) {
		return undefined;
	}
	return allPages.reduce((total, page) => total + page.length, 0);
}

/** flattenPages concatenates every loaded page into a single row array. */
export function flattenPages<T>(pages: Array<Array<T>> | undefined): Array<T> {
	return (pages ?? []).flat();
}
