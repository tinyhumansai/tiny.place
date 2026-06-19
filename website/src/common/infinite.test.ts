import { describe, expect, it } from "vitest";

import { DEFAULT_PAGE_SIZE, flattenPages, getNextOffset } from "./infinite";

describe("getNextOffset", () => {
	it("returns the running total when the last page is full", () => {
		const full = Array.from({ length: DEFAULT_PAGE_SIZE }, (_, index) => index);
		expect(getNextOffset(full, [full])).toBe(DEFAULT_PAGE_SIZE);
		expect(getNextOffset(full, [full, full])).toBe(DEFAULT_PAGE_SIZE * 2);
	});

	it("stops (undefined) when the last page comes back short", () => {
		const full = Array.from({ length: DEFAULT_PAGE_SIZE }, (_, index) => index);
		const short = [1, 2, 3];
		expect(getNextOffset(short, [short])).toBeUndefined();
		expect(getNextOffset(short, [full, short])).toBeUndefined();
	});

	it("stops on an empty trailing page", () => {
		expect(getNextOffset([], [[]])).toBeUndefined();
	});

	it("honors a custom page size", () => {
		const page = [1, 2, 3];
		expect(getNextOffset(page, [page], 3)).toBe(3);
		expect(getNextOffset(page, [page], 5)).toBeUndefined();
	});
});

describe("flattenPages", () => {
	it("concatenates all pages in order", () => {
		expect(
			flattenPages([
				[1, 2],
				[3, 4],
			])
		).toEqual([1, 2, 3, 4]);
	});

	it("treats undefined as empty", () => {
		expect(flattenPages(undefined)).toEqual([]);
	});
});
