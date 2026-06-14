"use client";

import { Signers } from "@src/components/explore/Signers";
import type { FunctionComponent } from "@src/common/types";

/**
 * The wallet's active sessions (approved signers) shown as a section of the
 * profile page. Wraps the {@link Signers} manager — previously a standalone
 * /explore tab — so session management lives alongside the profile it belongs
 * to. Rendered light to match the (always-light) profile page.
 */
export const ProfileSessions = (): FunctionComponent => {
	return (
		<section className="mx-auto mt-8 w-full max-w-3xl">
			<h2 className="mb-3 text-sm font-semibold text-neutral-800">Sessions</h2>
			<Signers isDark={false} />
		</section>
	);
};
