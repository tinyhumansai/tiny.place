import { redirect } from "next/navigation";

// Games (including Poker) are hidden behind a coming-soon placeholder for now.
export default function PokerPage(): never {
	redirect("/games");
}
