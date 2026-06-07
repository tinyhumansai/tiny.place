import type { FunctionComponent } from "@src/common/types";

type Setting = {
	label: string;
	value: string;
};

type AdminAction = {
	timestamp: string;
	description: string;
	admin: string;
};

type HealthStatus = {
	service: string;
	status: "Online" | "Offline";
};

const settings: Array<Setting> = [
	{ label: "Registration Fee", value: "5 USDC" },
	{ label: "Transaction Fee", value: "0.5%" },
	{ label: "Minimum Identity Price", value: "1 USDC" },
	{ label: "Max Message Size", value: "64KB" },
];

const recentActions: Array<AdminAction> = [
	{
		timestamp: "2026-06-07 14:32",
		description: "Updated transaction fee from 1% to 0.5%",
		admin: "@governance",
	},
	{
		timestamp: "2026-06-06 09:15",
		description: "Increased max message size to 64KB",
		admin: "@council",
	},
	{
		timestamp: "2026-06-05 17:48",
		description: "Approved new relay node registration",
		admin: "@governance",
	},
	{
		timestamp: "2026-06-04 11:22",
		description: "Lowered minimum identity price to 1 USDC",
		admin: "@treasury",
	},
	{
		timestamp: "2026-06-03 08:01",
		description: "Enabled payment processor failover mode",
		admin: "@council",
	},
];

const healthStatuses: Array<HealthStatus> = [
	{ service: "Server", status: "Online" },
	{ service: "Relay", status: "Online" },
	{ service: "Payment Processor", status: "Online" },
];

type AdminMockProperties = {
	isDark: boolean;
};

export const AdminMock = ({
	isDark,
}: AdminMockProperties): FunctionComponent => {
	return (
		<div className="space-y-4">
			<div>
				<p
					className={`mb-2 text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Network Configuration
				</p>
				<div
					className={`rounded-lg border ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
				>
					{settings.map((setting, index) => (
						<div
							key={setting.label}
							className={`flex items-center justify-between px-3 py-2.5 ${
								index < settings.length - 1
									? isDark
										? "border-b border-neutral-800"
										: "border-b border-neutral-200"
									: ""
							}`}
						>
							<span
								className={`text-sm ${isDark ? "text-white" : "text-black"}`}
							>
								{setting.label}
							</span>
							<span
								className={`font-mono text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
							>
								{setting.value}
							</span>
						</div>
					))}
				</div>
			</div>

			<div>
				<p
					className={`mb-2 text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Recent Admin Actions
				</p>
				<div className="space-y-1.5">
					{recentActions.map((action) => (
						<div
							key={action.timestamp}
							className={`rounded-lg border p-2.5 ${
								isDark
									? "border-neutral-800 bg-neutral-950"
									: "border-neutral-200 bg-neutral-50"
							}`}
						>
							<div className="flex items-center justify-between">
								<span
									className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{action.timestamp}
								</span>
								<span
									className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{action.admin}
								</span>
							</div>
							<p
								className={`mt-0.5 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
							>
								{action.description}
							</p>
						</div>
					))}
				</div>
			</div>

			<div>
				<p
					className={`mb-2 text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Network Health
				</p>
				<div
					className={`rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
				>
					{healthStatuses.map((item, index) => (
						<div
							key={item.service}
							className={`flex items-center justify-between px-3 py-2.5 ${
								index < healthStatuses.length - 1
									? isDark
										? "border-b border-neutral-800"
										: "border-b border-neutral-200"
									: ""
							}`}
						>
							<span
								className={`text-sm ${isDark ? "text-white" : "text-black"}`}
							>
								{item.service}
							</span>
							<div className="flex items-center gap-1.5">
								<div className="h-2 w-2 rounded-full bg-green-500" />
								<span className="text-xs text-green-500">{item.status}</span>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
