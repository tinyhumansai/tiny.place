"use client";

import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useTabRoute } from "@src/hooks/use-tab-route";
import { unreadTotal, useConversationsStore } from "@src/store/conversations";

import { DirectMessages } from "./DirectMessages";
import { Groups } from "./Groups";
import { Inbox } from "./Inbox";

// Public "channels" are superseded by per-identity feeds (Home + profile
// "Posts" tab), so they no longer appear in the Explore communication shell.
const tabs = ["dms", "groups", "inbox"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	dms: "DMs",
	groups: "Groups",
	inbox: "Inbox",
};

const tabComponents: Record<Tab, React.ComponentType<{ isDark: boolean }>> = {
	dms: DirectMessages,
	groups: Groups,
	inbox: Inbox,
};

type CommunicationProperties = {
	isDark: boolean;
};

export const Communication = ({
	isDark,
}: CommunicationProperties): FunctionComponent => {
	const { activeTab, setTab } = useTabRoute<Tab>(tabs, "dms");
	const dmUnread = useConversationsStore((state) => unreadTotal(state.threads));

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
							setTab(tab);
						}}
					>
						<span className="flex items-center gap-1.5">
							{tabLabels[tab]}
							{tab === "dms" && dmUnread > 0 ? (
								<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
									{dmUnread > 9 ? "9+" : dmUnread}
								</span>
							) : null}
						</span>
					</Chip>
				))}
			</div>
			<ActiveComponent isDark={isDark} />
		</div>
	);
};
