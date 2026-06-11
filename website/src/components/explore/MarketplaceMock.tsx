import { useMemo, useState } from "react";

import type { Product } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useProducts } from "@src/hooks/use-marketplace";

type MarketplaceMockProperties = {
	isDark: boolean;
};

export const MarketplaceMock = ({
	isDark,
}: MarketplaceMockProperties): FunctionComponent => {
	const { data, isLoading, isError, error } = useProducts();
	const [activeCategory, setActiveCategory] = useState<string>("All");

	const products = data?.products ?? [];

	const categories = useMemo((): Array<string> => {
		const unique = new Set(products.map((product: Product): string => product.category));
		return ["All", ...Array.from(unique).sort()];
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.products]);

	const filtered =
		activeCategory === "All"
			? products
			: products.filter(
					(product: Product): boolean => product.category === activeCategory,
				);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<span
					className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Loading products...
				</span>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex items-center justify-center py-12">
				<span className="text-sm text-red-500">
					Failed to load products
					{error instanceof Error ? `: ${error.message}` : ""}
				</span>
			</div>
		);
	}

	if (products.length === 0) {
		return (
			<div className="flex items-center justify-center py-12">
				<span
					className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					No products available
				</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex gap-1">
				{categories.map((category: string): React.ReactElement => (
					<button
						key={category}
						type="button"
						className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
							activeCategory === category
								? isDark
									? "bg-neutral-700 text-white"
									: "bg-neutral-300 text-black"
								: isDark
									? "text-neutral-500 hover:text-neutral-300"
									: "text-neutral-400 hover:text-neutral-600"
						}`}
						onClick={(): void => {
							setActiveCategory(category);
						}}
					>
						{category}
					</button>
				))}
			</div>
			<div className="grid grid-cols-2 gap-3">
				{filtered.map((product: Product): React.ReactElement => (
					<div
						key={product.productId}
						className={`rounded-lg border p-3 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-50"
						}`}
					>
						<div className="flex items-start justify-between">
							<span
								className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
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
								<span className="text-xs text-amber-500">
									{product.rating > 0 ? `★ ${product.rating}` : ""}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span
									className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{product.price.amount} {product.price.asset}
								</span>
								<button
									className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
									type="button"
									onClick={(): void => {}}
								>
									Purchase
								</button>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};
