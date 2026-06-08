import { createFileRoute } from "@tanstack/react-router";
import { Room } from "@src/pages/Room";

export const Route = createFileRoute("/room")({
	component: Room,
});
