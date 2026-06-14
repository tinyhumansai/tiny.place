import type { IdentityListing } from "./types/index.js";

/**
 * Compares two base-unit amount strings. Returns -1 if a < b, 0 if equal, 1 if
 * a > b. Mirrors the backend's store.CompareAmount.
 */
export function compareAmount(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Returns `amount` increased by 5%, rounded up, in base units — the backend's
 * minimum bid increment (store.FivePercentIncrement: (amount*105 + 99) / 100).
 */
export function fivePercentIncrement(amount: string): string {
  let value: bigint;
  try {
    value = BigInt(amount);
  } catch {
    return amount;
  }
  return ((value * 105n + 99n) / 100n).toString();
}

/**
 * The minimum acceptable next bid for an identity auction listing, in base
 * units — the start price (or reserve, whichever is higher), then 5% above the
 * standing high bid. Matches the backend's CreateIdentityBid validation so the
 * UI can enforce it before submitting.
 */
export function minimumIdentityBid(listing: IdentityListing): string {
  let minimum = listing.price.amount;
  if (
    listing.reservePrice &&
    compareAmount(listing.reservePrice.amount, minimum) > 0
  ) {
    minimum = listing.reservePrice.amount;
  }
  if (listing.highestBid) {
    minimum = fivePercentIncrement(listing.highestBid.price.amount);
  }
  return minimum;
}
