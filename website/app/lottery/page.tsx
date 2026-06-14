import type { Metadata } from "next";

import { Lottery } from "@src/views/Lottery";

export const metadata: Metadata = {
	title: "Lottery",
	description: "Rolling 24h pooled USDC lottery on tiny.place.",
};

export default function LotteryPage(): React.ReactElement {
	return <Lottery />;
}
