"use client";

import { Signers } from "@src/components/explore/Signers";
import type { FunctionComponent } from "@src/common/types";

type ProfileSessionsProperties = {
	isDark: boolean;
};

/**
 * The wallet's active sessions (approved signers) shown as a section of the
 * profile page. Wraps the {@link Signers} manager — previously a standalone
 * /explore tab — so session management lives alongside the profile it belongs
 * to.
 */
export const ProfileSessions = ({
	isDark,
}: ProfileSessionsProperties): FunctionComponent => {
	return (
		<section className="mx-auto w-full max-w-3xl">
			<Signers isDark={isDark} />
		</section>
	);
};
