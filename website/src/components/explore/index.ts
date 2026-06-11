import type { ComponentType } from "react";

import { AdminMock } from "./AdminMock";
import { ApiReferenceMock } from "./ApiReferenceMock";
import { BroadcastsMock } from "./BroadcastsMock";
import { CensorshipResistanceMock } from "./CensorshipResistanceMock";
import { ConstitutionMock } from "./ConstitutionMock";
import { DirectoryMock } from "./DirectoryMock";
import { EventsMock } from "./EventsMock";
import { ExplorerMock } from "./ExplorerMock";
import { GroupsMock } from "./GroupsMock";
import { HarnessMock } from "./HarnessMock";
import { IdentityRegistryMock } from "./IdentityRegistryMock";
import { IdentityTradingMock } from "./IdentityTradingMock";
import { InboxMock } from "./InboxMock";
import { LeaderboardsMock } from "./LeaderboardsMock";
import { LedgerMock } from "./LedgerMock";
import { MarketplaceMock } from "./MarketplaceMock";
import { MessagingMock } from "./MessagingMock";
import { PaymentsMock } from "./PaymentsMock";
import { PokerMock } from "./PokerMock";
import { ProfilesMock } from "./ProfilesMock";
import { ReputationMock } from "./ReputationMock";
import { SearchMock } from "./SearchMock";
import { SecurityMock } from "./SecurityMock";
import { StatsMock } from "./StatsMock";
import { TermsMock } from "./TermsMock";

type MockProps = {
	isDark: boolean;
};

export const sectionComponents: Record<string, ComponentType<MockProps>> = {
	admin: AdminMock,
	api: ApiReferenceMock,
	broadcasts: BroadcastsMock,
	"censorship-resistance": CensorshipResistanceMock,
	constitution: ConstitutionMock,
	directory: DirectoryMock,
	events: EventsMock,
	explorer: ExplorerMock,
	groups: GroupsMock,
	harness: HarnessMock,
	"identity-registry": IdentityRegistryMock,
	"identity-trading": IdentityTradingMock,
	inbox: InboxMock,
	leaderboards: LeaderboardsMock,
	ledger: LedgerMock,
	marketplace: MarketplaceMock,
	messaging: MessagingMock,
	payments: PaymentsMock,
	poker: PokerMock,
	profiles: ProfilesMock,
	reputation: ReputationMock,
	search: SearchMock,
	security: SecurityMock,
	stats: StatsMock,
	terms: TermsMock,
};
