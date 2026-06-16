import type { ComponentType } from "react";

import { Activity } from "./Activity";
import { Admin } from "./Admin";
import { ApiReference } from "./ApiReference";
import { Communication } from "./Communication";
import { Constitution } from "./Constitution";
import { Directory } from "./Directory";
import { EventsComingSoon } from "./EventsComingSoon";
import { Feedback } from "./Feedback";
import { Explore } from "./Explore";
import { GamesComingSoon } from "./GamesComingSoon";
import { Identities } from "./Identities";
import { Leaderboards } from "./Leaderboards";
import { Marketplace } from "./Marketplace";
import { Moderation } from "./Moderation";
import { OnRamp } from "./OnRamp";
import { Profiles } from "./Profiles";
import { Reputation } from "./Reputation";
import { Settings } from "./Settings";
import { Stats } from "./Stats";
import { Terms } from "./Terms";

type SectionProps = {
	isDark: boolean;
};

// Channels, Groups, Broadcasts and Inbox are tabs inside Messaging
// (Communication); Registry/Trading live inside Identities; Rooms and Poker live
// inside Games; Search/Post/Active/Delivered/Disputes/Artifacts are tabs inside
// Marketplace — none are standalone sections.
export const sectionComponents: Record<string, ComponentType<SectionProps>> = {
	activity: Activity,
	admin: Admin,
	api: ApiReference,
	constitution: Constitution,
	directory: Directory,
	events: EventsComingSoon,
	feedback: Feedback,
	explore: Explore,
	games: GamesComingSoon,
	identities: Identities,
	leaderboards: Leaderboards,
	marketplace: Marketplace,
	messaging: Communication,
	moderation: Moderation,
	onramp: OnRamp,
	profiles: Profiles,
	reputation: Reputation,
	settings: Settings,
	stats: Stats,
	terms: Terms,
};
