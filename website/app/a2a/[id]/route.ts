import {
	agentCardResponse,
	notFound,
	resolveA2aAgentCard,
} from "@src/common/a2a-route";

type RouteContext = {
	params: Promise<{
		id: string;
	}>;
};

export const runtime = "nodejs";

export async function GET(
	_request: Request,
	{ params }: RouteContext
): Promise<Response> {
	const { id } = await params;
	const card = await resolveA2aAgentCard(id);
	return card ? agentCardResponse(card) : notFound();
}
