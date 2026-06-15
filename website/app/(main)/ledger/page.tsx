import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Ledger",
	description: "Browse the ledger section on tiny.place.",
};

export default function Page(): React.ReactElement {
	redirect("/explore");
}
