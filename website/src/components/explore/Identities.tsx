"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useTabRoute } from "@src/hooks/use-tab-route";

import { DomainRegistration } from "./DomainRegistration";
import { IdentityRegistry } from "./IdentityRegistry";
import { IdentityTrading } from "./IdentityTrading";
import { X402ConfirmProvider } from "./X402ConfirmDialog";

const tabs = ["register", "registry", "trading"] as const;

type Tab = (typeof tabs)[number];

const tabLabelKeys: Record<Tab, string> = {
	register: "identitiesSection.tabRegister",
	registry: "identitiesSection.tabRegistry",
	trading: "identitiesSection.tabTrading",
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
	const { t } = useTranslation();
	const { activeTab, setTab } = useTabRoute<Tab>(tabs, "register");

	const ActiveComponent = tabComponents[activeTab];

	return (
		<X402ConfirmProvider isDark={isDark}>
			<div className="space-y-3">
				<div className="flex gap-1">
					{tabs.map((tab) => (
						<Chip
							key={tab}
							active={activeTab === tab}
							isDark={isDark}
							onClick={(): void => {
								setTab(tab);
							}}
						>
							{t(tabLabelKeys[tab], { defaultValue: tabLabelKeys[tab] })}
						</Chip>
					))}
				</div>
				<ActiveComponent isDark={isDark} />
			</div>
		</X402ConfirmProvider>
	);
};
