"use client";

import { useMemo, useState } from "react";

import type { Product } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import {
	firstActiveIdentity,
	useBuyProduct,
	useOwnedIdentities,
	useProducts,
} from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";

import {
	cardClass,
	inputClass,
	mutedClass,
	paymentChallengeMessage,
	strongClass,
} from "./shared";

function matchesQuery(product: Product, query: string): boolean {
	if (!query) {
		return true;
	}
	const haystack = [
		product.name,
		product.description,
		product.seller,
		...(product.tags ?? []),
	]
		.join(" ")
		.toLowerCase();
	return haystack.includes(query);
}

export const Search = ({ isDark }: { isDark: boolean }): FunctionComponent => {
	const { data, isLoading, isError, error } = useProducts();
	const [activeCategory, setActiveCategory] = useState<string>("All");
	const [query, setQuery] = useState("");
	const agentId = useAuthStore((state) => state.agentId);
	const ownedIdentities = useOwnedIdentities(agentId);
	const sellerIdentity = firstActiveIdentity(ownedIdentities.data?.identities);
	const buyProduct = useBuyProduct();
	const buyPaymentChallenge = paymentChallengeMessage(buyProduct.error);
	const me = sellerIdentity?.username ?? agentId;

	const products = data?.products ?? [];

	const categories = useMemo((): Array<string> => {
		const unique = new Set(
			products.map((product: Product): string => product.category)
		);
		return ["All", ...Array.from(unique).sort()];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.products]);

	const normalizedQuery = query.trim().toLowerCase();
	const filtered = products.filter(
		(product: Product): boolean =>
			(activeCategory === "All" || product.category === activeCategory) &&
			matchesQuery(product, normalizedQuery)
	);

	return (
		<div className="flex flex-col gap-4">
			<input
				className={inputClass(isDark)}
				placeholder="Search products by name, description, tag, or seller..."
				type="search"
				value={query}
				onChange={(event): void => {
					setQuery(event.target.value);
				}}
			/>

			{isLoading && (
				<div className="flex items-center justify-center py-12">
					<span className={`text-sm ${mutedClass(isDark)}`}>
						Loading products...
					</span>
				</div>
			)}

			{isError && (
				<div className="flex items-center justify-center py-12">
					<span className="text-sm text-red-500">
						Failed to load products
						{error instanceof Error ? `: ${error.message}` : ""}
					</span>
				</div>
			)}

			{!isLoading && !isError && products.length === 0 && (
				<div className="flex items-center justify-center py-12">
					<span className={`text-sm ${mutedClass(isDark)}`}>
						No products yet
						{agentId ? " — list one from the Post tab." : ""}
					</span>
				</div>
			)}

			{!isLoading && !isError && products.length > 0 && (
				<>
					{buyProduct.isError && (
						<p className="text-xs text-red-500">
							{buyPaymentChallenge ??
								(buyProduct.error instanceof Error
									? buyProduct.error.message
									: "Failed to buy product")}
						</p>
					)}

					{buyProduct.isSuccess && (
						<p className="text-xs text-green-500">Purchase recorded.</p>
					)}

					<div className="flex flex-wrap gap-1">
						{categories.map(
							(category: string): React.ReactElement => (
								<Chip
									key={category}
									active={activeCategory === category}
									isDark={isDark}
									onClick={(): void => {
										setActiveCategory(category);
									}}
								>
									{category}
								</Chip>
							)
						)}
					</div>

					{filtered.length === 0 ? (
						<p className={`text-xs ${mutedClass(isDark)}`}>
							No products match your search.
						</p>
					) : (
						<div className="grid grid-cols-2 gap-3">
							{filtered.map(
								(product: Product): React.ReactElement => (
									<div key={product.productId} className={cardClass(isDark)}>
										<div className="flex items-start justify-between">
											<span
												className={`text-sm font-medium ${strongClass(isDark)}`}
											>
												{product.name}
											</span>
											<span
												className={`rounded-full px-1.5 py-0.5 text-xs ${
													isDark
														? "bg-neutral-800 text-neutral-400"
														: "bg-neutral-200 text-neutral-500"
												}`}
											>
												{product.category}
											</span>
										</div>
										<p
											className={`mt-1 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
										>
											{product.description}
										</p>
										<div className="mt-2 flex items-center justify-between">
											<div className="flex items-center gap-2">
												<span
													className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
												>
													{product.seller}
												</span>
												{product.rating > 0 && (
													<span className="text-xs text-amber-500">
														★ {product.rating}
													</span>
												)}
											</div>
											<span
												className={`text-xs font-medium ${strongClass(isDark)}`}
											>
												{product.price.amount} {product.price.asset}
											</span>
										</div>
										{product.tags && product.tags.length > 0 && (
											<div className="mt-2 flex flex-wrap gap-1">
												{product.tags.map(
													(tag): React.ReactElement => (
														<span
															key={tag}
															className={`rounded-full px-1.5 py-0.5 text-[10px] ${
																isDark
																	? "bg-neutral-800 text-neutral-500"
																	: "bg-neutral-200 text-neutral-400"
															}`}
														>
															{tag}
														</span>
													)
												)}
											</div>
										)}
										<button
											className="mt-3 w-full rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
											type="button"
											disabled={
												buyProduct.isPending ||
												!agentId ||
												product.seller === me
											}
											onClick={(): void => {
												if (!agentId) {
													return;
												}
												// A handle is optional for buyers — fall back to the
												// connected wallet as the buyer identifier.
												buyProduct.mutate({
													buyer: sellerIdentity?.username ?? agentId,
													buyerCryptoId: agentId,
													productId: product.productId,
												});
											}}
										>
											{buyProduct.isPending ? "Buying..." : "Buy"}
										</button>
									</div>
								)
							)}
						</div>
					)}
				</>
			)}
		</div>
	);
};
