import { heroImageUrl } from "@src/components/layout/section-heroes";
import type { FunctionComponent } from "@src/common/types";

/**
 * A decorative banner shown at the top of the feed, reusing the messaging
 * GitBook hero artwork (served from GitHub's raw CDN). Purely visual — hidden
 * from assistive tech — so it carries no text or link.
 */
export function MessagingBanner(): FunctionComponent {
	return (
		<div
			aria-hidden
			className="hero-pan relative h-24 w-full overflow-hidden rounded-xl border border-border bg-surface bg-cover sm:h-28"
			style={{ backgroundImage: `url('${heroImageUrl("hero-messaging")}')` }}
		>
			<div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
		</div>
	);
}
