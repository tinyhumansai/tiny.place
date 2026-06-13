"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

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
