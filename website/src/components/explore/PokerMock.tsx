"use client";

import type { FunctionComponent } from "@src/common/types";
import { PokerTable } from "@src/components/poker/PokerTable";

type PokerMockProperties = {
	isDark: boolean;
};

export const PokerMock = ({
	isDark,
}: PokerMockProperties): FunctionComponent => {
	return <PokerTable isDark={isDark} />;
};
