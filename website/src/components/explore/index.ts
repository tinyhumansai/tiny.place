import type { ComponentType } from "react";

import { Activity } from "./Activity";
import { Admin } from "./Admin";
import { ApiReference } from "./ApiReference";
import { Artifacts } from "./Artifacts";
import { Communication } from "./Communication";
import { Constitution } from "./Constitution";
import { Directory } from "./Directory";
import { Escrow } from "./Escrow";
import { Events } from "./Events";
import { Explorer } from "./Explorer";
import { Games } from "./Games";
import { Identities } from "./Identities";
import { Leaderboards } from "./Leaderboards";
import { Ledger } from "./Ledger";
import { Marketplace } from "./Marketplace";
import { Moderation } from "./Moderation";
import { Payments } from "./Payments";
import { Pricing } from "./Pricing";
import { Profiles } from "./Profiles";
import { Reputation } from "./Reputation";
import { Search } from "./Search";
import { Stats } from "./Stats";
import { Terms } from "./Terms";

type SectionProps = {
	isDark: boolean;
};

// Channels, Groups, Broadcasts and Inbox are tabs inside Messaging
// (Communication); Registry/Trading live inside Identities; Rooms and Poker live
// inside Games — none are standalone sections.
export const sectionComponents: Record<string, ComponentType<SectionProps>> = {
	activity: Activity,
	admin: Admin,
	api: ApiReference,
	artifacts: Artifacts,
	constitution: Constitution,
	directory: Directory,
	escrow: Escrow,
	events: Events,
	explorer: Explorer,
	games: Games,
	identities: Identities,
	leaderboards: Leaderboards,
	ledger: Ledger,
	marketplace: Marketplace,
	messaging: Communication,
	moderation: Moderation,
	payments: Payments,
	pricing: Pricing,
	profiles: Profiles,
	reputation: Reputation,
	search: Search,
	stats: Stats,
	terms: Terms,
};
