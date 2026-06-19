"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { sanitizeHandle } from "@src/components/explore/identity-management";
import { useHandleAvailability } from "@src/hooks/use-registry";

type IdentityRegistryProperties = {
	isDark: boolean;
};

export const IdentityRegistry = ({
	isDark,
}: IdentityRegistryProperties): FunctionComponent => {
	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-400";

	const [input, setInput] = useState<string>("");
	const [checked, setChecked] = useState<string>("");
	const { data, isFetching, isError, refetch } = useHandleAvailability(checked);

	return (
		<div className="space-y-3">
			<form
				className={`rounded-lg border p-3 ${cardClass}`}
				onSubmit={(event): void => {
					event.preventDefault();
					const next = input.trim();
					if (next === checked) {
						// Same handle as last check — re-run instead of no-op'ing.
						void refetch();
					} else {
						setChecked(next);
					}
				}}
			>
				<label
					className={`text-xs font-medium ${headingClass}`}
					htmlFor="handle-availability-input"
				>
					Check handle availability
				</label>
				<div className="mt-2 flex gap-2">
					<input
						id="handle-availability-input"
						placeholder="@yourhandle"
						value={input}
						className={`flex-1 rounded-md border px-2 py-1 text-xs ${
							isDark
								? "border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600"
								: "border-neutral-200 bg-white text-black placeholder:text-neutral-400"
						}`}
						onChange={(event): void => {
							setInput(sanitizeHandle(event.target.value));
						}}
					/>
					<button
						disabled={!input.trim()}
						type="submit"
						className={`rounded-md px-3 py-1 text-xs font-medium ${
							isDark ? "bg-white text-black" : "bg-black text-white"
						} ${input.trim() ? "" : "opacity-50"}`}
					>
						Check
					</button>
				</div>
				{checked && isFetching && (
					<p className={`mt-2 text-xs ${secondaryClass}`}>Checking…</p>
				)}
				{checked && isError && (
					<p className="mt-2 text-xs text-rose-500">Failed to check handle</p>
				)}
				{checked && !isFetching && !isError && data ? (
					<p
						className={`mt-2 text-xs font-medium ${
							data.available ? "text-green-500" : "text-rose-500"
						}`}
					>
						{data.name} is {data.available ? "available" : "taken"}
					</p>
				) : null}
			</form>
		</div>
	);
};
