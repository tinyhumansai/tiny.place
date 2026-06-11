"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import type { FunctionComponent } from "@src/common/types";

const emptySubscribe = (): (() => void) => (): void => {};
const returnTrue = (): boolean => true;
const returnFalse = (): boolean => false;

type ClientOnlyProperties = {
	children: ReactNode;
};

export const ClientOnly = ({
	children,
}: ClientOnlyProperties): FunctionComponent => {
	const mounted = useSyncExternalStore(emptySubscribe, returnTrue, returnFalse);

	if (!mounted) return null;

	return <>{children}</>;
};
