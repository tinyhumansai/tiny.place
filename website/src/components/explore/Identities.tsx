"use client";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useTabRoute } from "@src/hooks/use-tab-route";

import { DomainRegistration } from "./DomainRegistration";
import { IdentityRegistry } from "./IdentityRegistry";
import { X402ConfirmProvider } from "./X402ConfirmDialog";

const tabs = ["register", "registry"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	register: "Register",
	registry: "Registry",
};

const tabComponents: Record<Tab, React.ComponentType<{ isDark: boolean }>> = {
	register: DomainRegistration,
	registry: IdentityRegistry,
};

type IdentitiesProperties = {
	isDark: boolean;
};

export const Identities = ({
	isDark,
}: IdentitiesProperties): FunctionComponent => {
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
							{tabLabels[tab]}
						</Chip>
					))}
				</div>
				<ActiveComponent isDark={isDark} />
			</div>
		</X402ConfirmProvider>
	);
};
