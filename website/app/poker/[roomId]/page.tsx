import { redirect } from "next/navigation";

// Games (including Poker rooms) are hidden behind a coming-soon placeholder for now.
export default function PokerRoomDetailPage(): never {
	redirect("/games");
}
