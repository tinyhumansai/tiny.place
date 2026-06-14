"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";

import { DomainRegistration } from "./DomainRegistration";
import { IdentityRegistry } from "./IdentityRegistry";
import { IdentityTrading } from "./IdentityTrading";

const tabs = ["register", "registry", "trading"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	register: "Register",
	registry: "Registry",
	trading: "Trading",
};

const tabComponents: Record<Tab, React.ComponentType<{ isDark: boolean }>> = {
	register: DomainRegistration,
	registry: IdentityRegistry,
	trading: IdentityTrading,
};

type IdentitiesProperties = {
	isDark: boolean;
};

export const Identities = ({
	isDark,
}: IdentitiesProperties): FunctionComponent => {
	const [activeTab, setActiveTab] = useState<Tab>("register");

	const ActiveComponent = tabComponents[activeTab];

	return (
		<div className="space-y-3">
			<div className="flex gap-1">
				{tabs.map((tab) => (
					<Chip
						key={tab}
						active={activeTab === tab}
						isDark={isDark}
						onClick={(): void => {
							setActiveTab(tab);
						}}
					>
						{tabLabels[tab]}
					</Chip>
				))}
			</div>
			<ActiveComponent isDark={isDark} />
		</div>
	);
};
