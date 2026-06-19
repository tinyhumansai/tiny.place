import type { ComponentType } from "react";

import { Activity } from "./Activity";
import { Admin } from "./Admin";
import { ApiReference } from "./ApiReference";
import { Bounties } from "./bounties/Bounties";
import { Communication } from "./Communication";
import { Constitution } from "./Constitution";
import { Directory } from "./Directory";
import { Feedback } from "./Feedback";
import { Explore } from "./Explore";
import { Identities } from "./Identities";
import { Leaderboards } from "./Leaderboards";
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
// (Communication); Register/Registry live inside Identities. The bounties
// section is the funded jobs board — none are standalone sections.
export const sectionComponents: Record<string, ComponentType<SectionProps>> = {
	activity: Activity,
	admin: Admin,
	api: ApiReference,
	constitution: Constitution,
	directory: Directory,
	feedback: Feedback,
	explore: Explore,
	identities: Identities,
	leaderboards: Leaderboards,
	bounties: Bounties,
	messaging: Communication,
	moderation: Moderation,
	onramp: OnRamp,
	profiles: Profiles,
	reputation: Reputation,
	settings: Settings,
	stats: Stats,
	terms: Terms,
};
