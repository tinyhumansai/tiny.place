import type { ComponentType } from "react";

import { AdminMock } from "./AdminMock";
import { ApiReferenceMock } from "./ApiReferenceMock";
import { CensorshipResistanceMock } from "./CensorshipResistanceMock";
import { CommunicationMock } from "./CommunicationMock";
import { ConstitutionMock } from "./ConstitutionMock";
import { DirectoryMock } from "./DirectoryMock";
import { EventsMock } from "./EventsMock";
import { ExplorerMock } from "./ExplorerMock";
import { IdentitiesMock } from "./IdentitiesMock";
import { LeaderboardsMock } from "./LeaderboardsMock";
import { LedgerMock } from "./LedgerMock";
import { MarketplaceMock } from "./MarketplaceMock";
import { PaymentsMock } from "./PaymentsMock";
import { PokerMock } from "./PokerMock";
import { ProfilesMock } from "./ProfilesMock";
import { ReputationMock } from "./ReputationMock";
import { RoomsMock } from "./RoomsMock";
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
	"censorship-resistance": CensorshipResistanceMock,
	constitution: ConstitutionMock,
	directory: DirectoryMock,
	events: EventsMock,
	explorer: ExplorerMock,
	identities: IdentitiesMock,
	leaderboards: LeaderboardsMock,
	ledger: LedgerMock,
	marketplace: MarketplaceMock,
	messaging: CommunicationMock,
	payments: PaymentsMock,
	poker: PokerMock,
	profiles: ProfilesMock,
	reputation: ReputationMock,
	rooms: RoomsMock,
	search: SearchMock,
	security: SecurityMock,
	stats: StatsMock,
	terms: TermsMock,
};
