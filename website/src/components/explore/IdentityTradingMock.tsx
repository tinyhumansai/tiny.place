import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type Listing = {
	handle: string;
	askingPrice: string;
	seller: string;
	initials: string;
	color: string;
};

type Sale = {
	handle: string;
	price: string;
	buyer: string;
	date: string;
};

const listings: Array<Listing> = [
	{
		handle: "@quantum",
		askingPrice: "4,200 USDC",
		seller: "@atlas",
		initials: "QU",
		color: "bg-indigo-600",
	},
	{
		handle: "@nexus",
		askingPrice: "1,800 USDC",
		seller: "@cipher",
		initials: "NE",
		color: "bg-teal-600",
	},
	{
		handle: "@prism",
		askingPrice: "3,500 USDC",
		seller: "@drift",
		initials: "PR",
		color: "bg-orange-600",
	},
	{
		handle: "@helix",
		askingPrice: "2,100 USDC",
		seller: "@sage",
		initials: "HE",
		color: "bg-rose-600",
	},
];

const recentSales: Array<Sale> = [
	{
		handle: "@orbit",
		price: "3,800 USDC",
		buyer: "@meridian",
		date: "2025-06-14",
	},
	{
		handle: "@spark",
		price: "1,200 USDC",
		buyer: "@echo",
		date: "2025-06-12",
	},
	{
		handle: "@pulse",
		price: "5,600 USDC",
		buyer: "@flux",
		date: "2025-06-10",
	},
	{
		handle: "@arc",
		price: "900 USDC",
		buyer: "@nova",
		date: "2025-06-08",
	},
];

type IdentityTradingMockProperties = {
	isDark: boolean;
};

export const IdentityTradingMock = ({
	isDark,
}: IdentityTradingMockProperties): FunctionComponent => {
	const [selectedListing, setSelectedListing] = useState<string | null>(null);

	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const headerClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const rowEvenClass = isDark ? "bg-neutral-900/50" : "bg-neutral-100/50";

	return (
		<div className="space-y-4">
			<div>
				<h3 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${secondaryClass}`}>
					Listed for Sale
				</h3>
				<div className="grid grid-cols-2 gap-2">
					{listings.map((listing) => (
						<div
							key={listing.handle}
							className={`rounded-lg border p-3 transition-colors ${cardClass} ${
								selectedListing === listing.handle
									? "border-blue-500"
									: ""
							}`}
						>
							<div className="flex items-center gap-2">
								<div
									className={`${listing.color} flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white`}
								>
									{listing.initials}
								</div>
								<span className={`text-sm font-medium ${headingClass}`}>
									{listing.handle}
								</span>
							</div>
							<div className="mt-2 flex items-center justify-between">
								<div>
									<div className={`text-xs font-semibold ${headingClass}`}>
										{listing.askingPrice}
									</div>
									<div className={`text-xs ${secondaryClass}`}>
										by {listing.seller}
									</div>
								</div>
								<button
									type="button"
									className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
										selectedListing === listing.handle
											? "bg-blue-600 text-white"
											: isDark
												? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
												: "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
									}`}
									onClick={() =>
										{ setSelectedListing(
											selectedListing === listing.handle
												? null
												: listing.handle,
										); }
									}
								>
									Buy
								</button>
							</div>
						</div>
					))}
				</div>
			</div>

			<div>
				<h3 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${secondaryClass}`}>
					Recent Sales
				</h3>
				<div className={`overflow-hidden rounded-lg border ${cardClass}`}>
					<table className="w-full text-left text-xs">
						<thead>
							<tr
								className={`border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
							>
								<th className={`px-3 py-2 font-medium ${headerClass}`}>
									Handle
								</th>
								<th className={`px-3 py-2 font-medium ${headerClass}`}>
									Price
								</th>
								<th className={`px-3 py-2 font-medium ${headerClass}`}>
									Buyer
								</th>
								<th className={`px-3 py-2 text-right font-medium ${headerClass}`}>
									Date
								</th>
							</tr>
						</thead>
						<tbody>
							{recentSales.map((sale, index) => (
								<tr
									key={sale.handle}
									className={`border-b last:border-b-0 ${isDark ? "border-neutral-800" : "border-neutral-200"} ${
										index % 2 === 1 ? rowEvenClass : ""
									}`}
								>
									<td className={`px-3 py-2 font-medium ${headingClass}`}>
										{sale.handle}
									</td>
									<td className={`px-3 py-2 ${headingClass}`}>{sale.price}</td>
									<td className={`px-3 py-2 ${secondaryClass}`}>
										{sale.buyer}
									</td>
									<td className={`px-3 py-2 text-right ${secondaryClass}`}>
										{sale.date}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
};
