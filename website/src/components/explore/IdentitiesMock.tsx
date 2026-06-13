"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

import { DomainRegistration } from "./DomainRegistration";
import { IdentityRegistryMock } from "./IdentityRegistryMock";
import { IdentityTradingMock } from "./IdentityTradingMock";

const tabs = ["register", "registry", "trading"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	register: "Register",
	registry: "Registry",
	trading: "Trading",
};

const tabComponents: Record<Tab, React.ComponentType<{ isDark: boolean }>> = {
	register: DomainRegistration,
	registry: IdentityRegistryMock,
	trading: IdentityTradingMock,
};

type IdentitiesMockProperties = {
	isDark: boolean;
};

export const IdentitiesMock = ({
	isDark,
}: IdentitiesMockProperties): FunctionComponent => {
	const [activeTab, setActiveTab] = useState<Tab>("register");

	const ActiveComponent = tabComponents[activeTab];

	return (
		<div className="space-y-3">
			<div className="flex gap-1">
				{tabs.map((tab) => (
					<button
						key={tab}
						type="button"
						className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
							activeTab === tab
								? isDark
									? "bg-neutral-800 text-white"
									: "bg-neutral-200 text-black"
								: isDark
									? "text-neutral-500 hover:text-neutral-300"
									: "text-neutral-400 hover:text-neutral-600"
						}`}
						onClick={(): void => {
							setActiveTab(tab);
						}}
					>
						{tabLabels[tab]}
					</button>
				))}
			</div>
			<ActiveComponent isDark={isDark} />
		</div>
	);
};
