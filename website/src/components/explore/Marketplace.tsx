"use client";

import { useMemo, useState } from "react";

import type {
	DeliveryMethod,
	Product,
	ProductCategory,
	TinyVerseError,
} from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	firstActiveIdentity,
	useBuyProduct,
	useCreateProduct,
	useOwnedIdentities,
	useProducts,
} from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";

const PRODUCT_CATEGORIES: Array<ProductCategory> = [
	"dataset",
	"model",
	"api-key",
	"report",
	"template",
	"tool",
	"other",
];

const DELIVERY_METHODS: Array<DeliveryMethod> = [
	"download",
	"a2a-task",
	"encrypted-message",
];

function textToBase64(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function slugify(value: string): string {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "product";
}

function paymentChallengeMessage(error: Error | null): string | undefined {
	if (!error || error.name !== "TinyVerseError") {
		return undefined;
	}
	const typed = error as TinyVerseError;
	if (typed.status !== 402) {
		return undefined;
	}
	const body = typed.body as {
		error?: string;
		payment?: { amount?: string; asset?: string; network?: string };
	};
	const payment = body.payment;
	if (!payment) {
		return body.error ?? "Payment required";
	}
	return `${body.error ?? "Payment required"}: ${payment.amount ?? ""} ${payment.asset ?? ""} on ${payment.network ?? ""}`.trim();
}

type MarketplaceProperties = {
	isDark: boolean;
};

const CreateProductForm = ({
	agentId,
	isDark,
	isIdentityLoading,
	sellerHandle,
}: {
	agentId: string;
	isDark: boolean;
	isIdentityLoading: boolean;
	sellerHandle: string | undefined;
}): FunctionComponent => {
	const createProduct = useCreateProduct();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [category, setCategory] = useState<ProductCategory>("tool");
	const [amount, setAmount] = useState("");
	const [deliveryMethod, setDeliveryMethod] =
		useState<DeliveryMethod>("download");
	const [downloadContent, setDownloadContent] = useState("");
	const [tagsInput, setTagsInput] = useState("");

	const handleSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		if (!sellerHandle) {
			return;
		}
		const tags = tagsInput
			.split(",")
			.map((tag) => tag.trim())
			.filter(Boolean);
		const deliveryDetails =
			deliveryMethod === "download"
				? {
						contentBase64: textToBase64(downloadContent),
						downloadTtlSeconds: 86_400,
						filename: `${slugify(name)}.txt`,
						mimeType: "text/plain",
					}
				: undefined;
		createProduct.mutate(
			{
				name,
				description,
				category,
				seller: sellerHandle,
				sellerCryptoId: agentId,
				price: {
					amount,
					asset: "USDC",
					network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
				},
				deliveryMethod,
				deliveryDetails,
				tags: tags.length > 0 ? tags : undefined,
			},
			{
				onSuccess: (): void => {
					setName("");
					setDescription("");
					setCategory("tool");
					setAmount("");
					setDeliveryMethod("download");
					setDownloadContent("");
					setTagsInput("");
				},
			}
		);
	};

	const inputClass = `w-full rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;

	const selectClass = `w-full rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white"
			: "border-neutral-300 bg-white text-black"
	}`;

	const labelClass = `text-xs font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`;

	return (
		<form
			className={`rounded-lg border p-4 ${
				isDark
					? "border-neutral-800 bg-neutral-950"
					: "border-neutral-200 bg-neutral-50"
			}`}
			onSubmit={handleSubmit}
		>
			<h3
				className={`mb-3 text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
			>
				List a Product
			</h3>
			<p
				className={`mb-3 text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
			>
				{isIdentityLoading
					? "Checking registered handles..."
					: sellerHandle
						? `Selling as ${sellerHandle}`
						: "Register a handle before listing products."}
			</p>

			<div className="grid grid-cols-2 gap-3">
				<div className="col-span-2">
					<label className={labelClass}>Name</label>
					<input
						required
						className={inputClass}
						placeholder="My awesome dataset"
						type="text"
						value={name}
						onChange={(event): void => {
							setName(event.target.value);
						}}
					/>
				</div>

				<div className="col-span-2">
					<label className={labelClass}>Description</label>
					<textarea
						required
						className={`${inputClass} min-h-[60px] resize-none`}
						placeholder="Describe your product..."
						rows={2}
						value={description}
						onChange={(event): void => {
							setDescription(event.target.value);
						}}
					/>
				</div>

				<div>
					<label className={labelClass}>Category</label>
					<select
						className={selectClass}
						value={category}
						onChange={(event): void => {
							setCategory(event.target.value as ProductCategory);
						}}
					>
						{PRODUCT_CATEGORIES.map(
							(option): React.ReactElement => (
								<option key={option} value={option}>
									{option}
								</option>
							)
						)}
					</select>
				</div>

				<div>
					<label className={labelClass}>Price (USDC)</label>
					<input
						required
						className={inputClass}
						min="0"
						placeholder="10.00"
						step="0.01"
						type="number"
						value={amount}
						onChange={(event): void => {
							setAmount(event.target.value);
						}}
					/>
				</div>

				<div>
					<label className={labelClass}>Delivery</label>
					<select
						className={selectClass}
						value={deliveryMethod}
						onChange={(event): void => {
							setDeliveryMethod(event.target.value as DeliveryMethod);
						}}
					>
						{DELIVERY_METHODS.map(
							(method): React.ReactElement => (
								<option key={method} value={method}>
									{method}
								</option>
							)
						)}
					</select>
				</div>

				<div>
					<label className={labelClass}>Tags (comma-separated)</label>
					<input
						className={inputClass}
						placeholder="ai, data, nlp"
						type="text"
						value={tagsInput}
						onChange={(event): void => {
							setTagsInput(event.target.value);
						}}
					/>
				</div>

				{deliveryMethod === "download" && (
					<div className="col-span-2">
						<label className={labelClass}>Download content</label>
						<textarea
							required
							className={`${inputClass} min-h-[72px] resize-none`}
							placeholder="Paste the file content buyers receive after payment"
							rows={3}
							value={downloadContent}
							onChange={(event): void => {
								setDownloadContent(event.target.value);
							}}
						/>
					</div>
				)}
			</div>

			{createProduct.isError && (
				<p className="mt-2 text-xs text-red-500">
					{createProduct.error instanceof Error
						? createProduct.error.message
						: "Failed to create product"}
				</p>
			)}

			{createProduct.isSuccess && (
				<p className="mt-2 text-xs text-green-500">Product listed!</p>
			)}

			<button
				className="mt-3 w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
				type="submit"
				disabled={
					createProduct.isPending ||
					!sellerHandle ||
					!name ||
					!description ||
					!amount ||
					(deliveryMethod === "download" && !downloadContent)
				}
			>
				{createProduct.isPending ? "Listing..." : "List Product"}
			</button>
		</form>
	);
};

export const Marketplace = ({
	isDark,
}: MarketplaceProperties): FunctionComponent => {
	const { data, isLoading, isError, error } = useProducts();
	const [activeCategory, setActiveCategory] = useState<string>("All");
	const agentId = useAuthStore((state) => state.agentId);
	const ownedIdentities = useOwnedIdentities(agentId);
	const sellerIdentity = firstActiveIdentity(ownedIdentities.data?.identities);
	const buyProduct = useBuyProduct();
	const buyPaymentChallenge = paymentChallengeMessage(buyProduct.error);

	const products = data?.products ?? [];

	const categories = useMemo((): Array<string> => {
		const unique = new Set(
			products.map((product: Product): string => product.category)
		);
		return ["All", ...Array.from(unique).sort()];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.products]);

	const filtered =
		activeCategory === "All"
			? products
			: products.filter(
					(product: Product): boolean => product.category === activeCategory
				);

	return (
		<div className="flex flex-col gap-4">
			{agentId && (
				<CreateProductForm
					agentId={agentId}
					isDark={isDark}
					isIdentityLoading={ownedIdentities.isLoading}
					sellerHandle={sellerIdentity?.username}
				/>
			)}

			{isLoading && (
				<div className="flex items-center justify-center py-12">
					<span
						className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
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
					<span
						className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						No products yet
						{agentId ? " — be the first to list one!" : ""}
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

					<div className="flex gap-1">
						{categories.map(
							(category: string): React.ReactElement => (
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
							)
						)}
					</div>
					<div className="grid grid-cols-2 gap-3">
						{filtered.map(
							(product: Product): React.ReactElement => (
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
											{product.rating > 0 && (
												<span className="text-xs text-amber-500">
													★ {product.rating}
												</span>
											)}
										</div>
										<span
											className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
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
											!sellerIdentity ||
											product.seller === sellerIdentity.username
										}
										onClick={(): void => {
											if (!agentId || !sellerIdentity) {
												return;
											}
											buyProduct.mutate({
												buyer: sellerIdentity.username,
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
				</>
			)}
		</div>
	);
};
