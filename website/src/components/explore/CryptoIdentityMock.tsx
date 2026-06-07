import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

type PreKey = {
	identifier: string;
	status: "active" | "used" | "pending";
};

type Session = {
	peerHandle: string;
	lastActive: string;
};

const preKeys: Array<PreKey> = [
	{ identifier: "PK-001", status: "active" },
	{ identifier: "PK-002", status: "used" },
	{ identifier: "PK-003", status: "pending" },
];

const sessions: Array<Session> = [
	{ peerHandle: "@cipher", lastActive: "3 min ago" },
	{ peerHandle: "@meridian", lastActive: "1 hour ago" },
	{ peerHandle: "@sage", lastActive: "4 hours ago" },
];

const preKeyStatusStyles: Record<PreKey["status"], string> = {
	active: "bg-green-500/10 text-green-500",
	used: "bg-neutral-500/10 text-neutral-400",
	pending: "bg-amber-500/10 text-amber-500",
};

type CryptoIdentityMockProperties = {
	isDark: boolean;
};

export const CryptoIdentityMock = ({
	isDark,
}: CryptoIdentityMockProperties): FunctionComponent => {
	const [isRotating, setIsRotating] = useState(false);

	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const tagClass = isDark
		? "bg-neutral-800 text-neutral-400"
		: "bg-neutral-200 text-neutral-500";

	const handleRotate = (): void => {
		setIsRotating(true);
		setTimeout(() => { setIsRotating(false); }, 1500);
	};

	return (
		<div className="space-y-3">
			<div className={`rounded-lg border p-3 ${cardClass}`}>
				<div className="flex items-center justify-between">
					<h3 className={`text-xs font-semibold uppercase tracking-wider ${secondaryClass}`}>
						Identity Keypair
					</h3>
					<span className={`rounded-full px-2 py-0.5 text-xs ${tagClass}`}>
						Ed25519
					</span>
				</div>
				<div className="mt-3 space-y-2">
					<div>
						<div className={`text-xs ${secondaryClass}`}>Public Key</div>
						<div className={`mt-0.5 font-mono text-xs ${headingClass}`}>
							0x7a3f8b2c…4d9e1f6a
						</div>
					</div>
					<div>
						<div className={`text-xs ${secondaryClass}`}>Private Key</div>
						<div className={`mt-0.5 font-mono text-xs ${secondaryClass}`}>
							••••••••••••••••
						</div>
					</div>
				</div>
			</div>

			<div className={`rounded-lg border p-3 ${cardClass}`}>
				<div className="flex items-center justify-between">
					<h3 className={`text-xs font-semibold uppercase tracking-wider ${secondaryClass}`}>
						Pre-Key Bundle
					</h3>
					<button
						disabled={isRotating}
						type="button"
						className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
							isRotating
								? "bg-amber-500/10 text-amber-500"
								: isDark
									? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
									: "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
						}`}
						onClick={handleRotate}
					>
						{isRotating ? "Rotating…" : "Rotate Keys"}
					</button>
				</div>
				<div className="mt-3 space-y-1.5">
					{preKeys.map((preKey) => (
						<div
							key={preKey.identifier}
							className="flex items-center justify-between"
						>
							<span className={`font-mono text-xs ${headingClass}`}>
								{preKey.identifier}
							</span>
							<span
								className={`rounded-full px-2 py-0.5 text-xs font-medium ${preKeyStatusStyles[preKey.status]}`}
							>
								{preKey.status}
							</span>
						</div>
					))}
				</div>
			</div>

			<div className={`rounded-lg border p-3 ${cardClass}`}>
				<h3 className={`text-xs font-semibold uppercase tracking-wider ${secondaryClass}`}>
					Active Sessions
				</h3>
				<div className={`mt-1 text-sm font-medium ${headingClass}`}>
					12 active sessions
				</div>
				<div className="mt-3 space-y-2">
					{sessions.map((session) => (
						<div
							key={session.peerHandle}
							className="flex items-center justify-between"
						>
							<div className="flex items-center gap-2">
								<div className="h-1.5 w-1.5 rounded-full bg-green-500" />
								<span className={`text-xs font-medium ${headingClass}`}>
									{session.peerHandle}
								</span>
							</div>
							<span className={`text-xs ${secondaryClass}`}>
								{session.lastActive}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
