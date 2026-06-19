"use client";

import Link from "next/link";
import type { ReactElement } from "react";

import { ProfileEntityLink } from "@src/components/profile/EntityLink";
import { useHandleAvailability } from "@src/hooks/use-registry";
import { useAppStore } from "@src/store/app";

function normalizeHandle(value: string): string {
	const stripped = value.trim().replace(/^@+/, "");
	return stripped ? `@${stripped}` : "";
}

function formatDate(value: string | undefined): string {
	if (!value) {
		return "—";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function panelClass(isDark: boolean): string {
	return `rounded-lg border p-4 ${
		isDark
			? "border-neutral-800 bg-neutral-950"
			: "border-neutral-200 bg-neutral-50"
	}`;
}

function buttonClass(isDark: boolean): string {
	return `rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
		isDark
			? "border-neutral-700 text-neutral-200 hover:bg-neutral-900"
			: "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
	}`;
}

function statusClass(isDark: boolean): string {
	return isDark
		? "bg-neutral-900 text-neutral-300"
		: "bg-neutral-100 text-neutral-600";
}

export function HandleDetail({ handle }: { handle: string }): ReactElement {
	const isDark = useAppStore((state) => state.theme === "dark");
	const normalized = normalizeHandle(handle);
	const availability = useHandleAvailability(normalized);

	const identity = availability.data?.identity;
	const owner = identity?.cryptoId;
	const isAvailable = availability.data?.available === true;
	const headingClass = isDark ? "text-white" : "text-black";
	const mutedClass = isDark ? "text-neutral-500" : "text-neutral-500";
	const bodyClass = isDark ? "text-neutral-300" : "text-neutral-700";

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
			<section className={panelClass(isDark)}>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h1
								className={`truncate text-base font-semibold ${headingClass}`}
							>
								{normalized}
							</h1>
							<span
								className={`rounded-md px-2 py-1 text-xs ${statusClass(isDark)}`}
							>
								{isAvailable ? "available" : (identity?.status ?? "unknown")}
							</span>
							{identity?.primary && (
								<span className="rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-500">
									primary
								</span>
							)}
						</div>
						<p className={`mt-2 text-sm ${bodyClass}`}>
							Handle ownership record.
						</p>
					</div>
					<Link className={buttonClass(isDark)} href="/identities">
						Find handles
					</Link>
				</div>

				<div className="mt-4 grid gap-3 sm:grid-cols-3">
					<div>
						<p className={`text-xs ${mutedClass}`}>Owner</p>
						<p className={`mt-1 truncate text-sm font-medium ${headingClass}`}>
							{owner ? (
								<ProfileEntityLink className="hover:underline" value={owner}>
									{owner}
								</ProfileEntityLink>
							) : (
								"Unowned"
							)}
						</p>
					</div>
					<div>
						<p className={`text-xs ${mutedClass}`}>Registered</p>
						<p className={`mt-1 text-sm ${headingClass}`}>
							{formatDate(identity?.registeredAt)}
						</p>
					</div>
					<div>
						<p className={`text-xs ${mutedClass}`}>Expires</p>
						<p className={`mt-1 text-sm ${headingClass}`}>
							{formatDate(identity?.expiresAt)}
						</p>
					</div>
				</div>
			</section>
		</div>
	);
}
