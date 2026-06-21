"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { DeliveryMethod, ProductCategory } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useCreateProduct } from "@src/hooks/use-marketplace";

import {
	inputClass,
	labelClass,
	primaryButtonClass,
	selectClass,
	slugify,
	SOLANA_NETWORK,
	textToBase64,
} from "./shared";

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

export const CreateProductForm = ({
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
	const { t } = useTranslation();
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
					network: SOLANA_NETWORK,
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
				{t("marketplace.createProduct.title")}
			</h3>
			<p
				className={`mb-3 text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
			>
				{isIdentityLoading
					? t("marketplace.createProduct.checkingHandles")
					: sellerHandle
						? t("marketplace.createProduct.sellingAs", { handle: sellerHandle })
						: t("marketplace.createProduct.connectPrompt")}
			</p>

			<div className="grid grid-cols-2 gap-3">
				<div className="col-span-2">
					<label className={labelClass(isDark)}>
						{t("marketplace.createProduct.name")}
					</label>
					<input
						required
						className={inputClass(isDark)}
						placeholder={t("marketplace.createProduct.namePlaceholder")}
						type="text"
						value={name}
						onChange={(event): void => {
							setName(event.target.value);
						}}
					/>
				</div>

				<div className="col-span-2">
					<label className={labelClass(isDark)}>
						{t("marketplace.createProduct.description")}
					</label>
					<textarea
						required
						className={`${inputClass(isDark)} min-h-[60px] resize-none`}
						placeholder={t("marketplace.createProduct.descriptionPlaceholder")}
						rows={2}
						value={description}
						onChange={(event): void => {
							setDescription(event.target.value);
						}}
					/>
				</div>

				<div>
					<label className={labelClass(isDark)}>
						{t("marketplace.createProduct.category")}
					</label>
					<select
						className={selectClass(isDark)}
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
					<label className={labelClass(isDark)}>
						{t("marketplace.createProduct.price")}
					</label>
					<input
						required
						className={inputClass(isDark)}
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
					<label className={labelClass(isDark)}>
						{t("marketplace.createProduct.delivery")}
					</label>
					<select
						className={selectClass(isDark)}
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
					<label className={labelClass(isDark)}>
						{t("marketplace.createProduct.tags")}
					</label>
					<input
						className={inputClass(isDark)}
						placeholder={t("marketplace.createProduct.tagsPlaceholder")}
						type="text"
						value={tagsInput}
						onChange={(event): void => {
							setTagsInput(event.target.value);
						}}
					/>
				</div>

				{deliveryMethod === "download" && (
					<div className="col-span-2">
						<label className={labelClass(isDark)}>
							{t("marketplace.createProduct.downloadContent")}
						</label>
						<textarea
							required
							className={`${inputClass(isDark)} min-h-[72px] resize-none`}
							rows={3}
							value={downloadContent}
							placeholder={t(
								"marketplace.createProduct.downloadContentPlaceholder"
							)}
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
						: t("marketplace.createProduct.error")}
				</p>
			)}

			{createProduct.isSuccess && (
				<p className="mt-2 text-xs text-green-500">
					{t("marketplace.createProduct.success")}
				</p>
			)}

			<button
				className={`mt-3 w-full ${primaryButtonClass()}`}
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
				{createProduct.isPending
					? t("marketplace.createProduct.listing")
					: t("marketplace.createProduct.submit")}
			</button>
		</form>
	);
};
