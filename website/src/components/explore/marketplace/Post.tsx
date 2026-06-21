"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";

import { CreateEscrowForm } from "./CreateEscrowForm";
import { CreateProductForm } from "./CreateProductForm";
import { cardClass, mutedClass } from "./shared";

export const Post = ({ isDark }: { isDark: boolean }): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const ownedIdentities = useOwnedIdentities(agentId);
	const sellerIdentity = firstActiveIdentity(ownedIdentities.data?.identities);

	if (!agentId) {
		return (
			<div className={`${cardClass(isDark)} p-6 text-center`}>
				<p className={`text-sm ${mutedClass(isDark)}`}>
					{t("marketplace.post.connectPrompt")}
				</p>
			</div>
		);
	}

	const handle = sellerIdentity?.username ?? agentId;

	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<CreateEscrowForm
				agentId={agentId}
				clientHandle={handle}
				isDark={isDark}
			/>
			<CreateProductForm
				agentId={agentId}
				isDark={isDark}
				isIdentityLoading={ownedIdentities.isLoading}
				sellerHandle={handle}
			/>
		</div>
	);
};
