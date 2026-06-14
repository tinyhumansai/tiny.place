"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";

import { Broadcasts } from "./Broadcasts";
import { DirectMessages } from "./DirectMessages";
import { Groups } from "./Groups";
import { Inbox } from "./Inbox";
import { Messaging } from "./Messaging";

const tabs = ["dms", "channels", "groups", "broadcasts", "inbox"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	dms: "DMs",
	channels: "Channels",
	groups: "Groups",
	broadcasts: "Broadcasts",
	inbox: "Inbox",
};

const tabComponents: Record<Tab, React.ComponentType<{ isDark: boolean }>> = {
	dms: DirectMessages,
	channels: Messaging,
	groups: Groups,
	broadcasts: Broadcasts,
	inbox: Inbox,
};

type CommunicationProperties = {
	isDark: boolean;
};

export const Communication = ({
	isDark,
}: CommunicationProperties): FunctionComponent => {
	const [activeTab, setActiveTab] = useState<Tab>("dms");

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
