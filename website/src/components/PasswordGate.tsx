import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

const STORAGE_KEY = "tiny-place-auth";
const PASSWORD = "atinyplace";

type PasswordGateProps = {
	children: React.ReactNode;
};

export const PasswordGate = ({
	children,
}: PasswordGateProps): FunctionComponent => {
	const [authenticated, setAuthenticated] = useState(
		() => localStorage.getItem(STORAGE_KEY) === "true"
	);
	const [value, setValue] = useState("");
	const [error, setError] = useState(false);

	if (authenticated) {
		return <>{children}</>;
	}

	const handleSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		if (value === PASSWORD) {
			localStorage.setItem(STORAGE_KEY, "true");
			setAuthenticated(true);
		} else {
			setError(true);
		}
	};

	return (
		<div className="bg-white min-h-screen w-full flex flex-col items-center justify-center px-4">
			<form
				className="flex flex-col items-center gap-4 max-w-xs w-full"
				onSubmit={handleSubmit}
			>
				<h1 className="font-heading text-2xl font-bold tracking-tight text-black">
					tiny.place
				</h1>
				<p className="text-sm text-neutral-500 text-center">
					Enter the password to continue
				</p>
				<input
					autoFocus
					className={`w-full px-4 py-2 rounded-lg border text-sm outline-none transition-colors ${error ? "border-red-400" : "border-neutral-300"} focus:border-black`}
					placeholder="Password"
					type="password"
					value={value}
					onChange={(event): void => {
						setValue(event.target.value);
						setError(false);
					}}
				/>
				{error && <p className="text-xs text-red-500">Incorrect password</p>}
				<button
					className="w-full px-4 py-2 rounded-lg bg-black text-white text-sm font-medium hover:bg-neutral-800 transition-colors"
					type="submit"
				>
					Enter
				</button>
			</form>
		</div>
	);
};
