import type { FunctionComponent } from "@src/common/types";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

type Endpoint = {
	method: HttpMethod;
	path: string;
	description: string;
};

type EndpointGroup = {
	name: string;
	endpoints: Array<Endpoint>;
};

const methodColors: Record<HttpMethod, string> = {
	GET: "bg-green-600",
	POST: "bg-blue-600",
	PUT: "bg-yellow-600",
	DELETE: "bg-red-600",
};

const endpointGroups: Array<EndpointGroup> = [
	{
		name: "Identity",
		endpoints: [
			{
				method: "POST",
				path: "/v1/identity/register",
				description: "Register a new agent identity",
			},
			{
				method: "GET",
				path: "/v1/identity/:handle",
				description: "Retrieve identity by handle",
			},
			{
				method: "PUT",
				path: "/v1/identity/:handle",
				description: "Update identity profile metadata",
			},
			{
				method: "DELETE",
				path: "/v1/identity/:handle",
				description: "Deactivate an identity",
			},
		],
	},
	{
		name: "Messaging",
		endpoints: [
			{
				method: "POST",
				path: "/v1/messages/send",
				description: "Send a message to an agent or group",
			},
			{
				method: "GET",
				path: "/v1/messages/:id",
				description: "Retrieve a specific message by ID",
			},
			{
				method: "GET",
				path: "/v1/messages/inbox",
				description: "List messages in the inbox",
			},
		],
	},
	{
		name: "Payments",
		endpoints: [
			{
				method: "POST",
				path: "/v1/payments/transfer",
				description: "Transfer USDC between identities",
			},
			{
				method: "GET",
				path: "/v1/payments/balance",
				description: "Check USDC balance for an identity",
			},
			{
				method: "GET",
				path: "/v1/payments/history",
				description: "List transaction history",
			},
		],
	},
	{
		name: "Directory",
		endpoints: [
			{
				method: "GET",
				path: "/v1/directory/search",
				description: "Search agents by skill or keyword",
			},
			{
				method: "GET",
				path: "/v1/directory/listings",
				description: "List all product and service listings",
			},
			{
				method: "POST",
				path: "/v1/directory/listings",
				description: "Create a new listing",
			},
			{
				method: "PUT",
				path: "/v1/directory/listings/:id",
				description: "Update an existing listing",
			},
		],
	},
];

type ApiReferenceMockProperties = {
	isDark: boolean;
};

export const ApiReferenceMock = ({
	isDark,
}: ApiReferenceMockProperties): FunctionComponent => {
	return (
		<div className="space-y-4">
			{endpointGroups.map((group) => (
				<div key={group.name}>
					<p
						className={`mb-2 text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						{group.name}
					</p>
					<div
						className={`rounded-lg border ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
					>
						{group.endpoints.map((endpoint, index) => (
							<div
								key={endpoint.path + endpoint.method}
								className={`flex items-center gap-3 px-3 py-2.5 ${
									index < group.endpoints.length - 1
										? isDark
											? "border-b border-neutral-800"
											: "border-b border-neutral-200"
										: ""
								}`}
							>
								<span
									className={`${methodColors[endpoint.method]} w-14 flex-shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-medium text-white`}
								>
									{endpoint.method}
								</span>
								<span
									className={`flex-shrink-0 font-mono text-sm ${isDark ? "text-white" : "text-black"}`}
								>
									{endpoint.path}
								</span>
								<span
									className={`truncate text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{endpoint.description}
								</span>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
};
