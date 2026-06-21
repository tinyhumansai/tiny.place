"use client";

import { UserCircleIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { useTinyplaceWallet } from "@src/common/tinyplace-wallet";

/**
 * A round icon button — styled to match the theme/language pills — that opens
 * the signed-in wallet's profile page. Renders only when a wallet is connected
 * (it sits next to the connected address in the top-right cluster).
 */
export const ProfileButton = (): FunctionComponent => {
	const { t } = useTranslation();
	const { publicKey } = useTinyplaceWallet();

	if (!publicKey) return null;

	return (
		<Link
			aria-label={t("profileButton.label")}
			className="rounded-full border border-border-strong p-2 text-muted transition-colors hover:border-primary hover:text-front"
			href="/profile"
			title={t("profileButton.label")}
		>
			<UserCircleIcon className="h-4 w-4" />
		</Link>
	);
};
