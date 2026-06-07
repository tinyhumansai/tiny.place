import { create } from "zustand";

type Theme = "light" | "dark";

type AppState = {
	initialized: boolean;
	setInitialized: (value: boolean) => void;
	theme: Theme;
	toggleTheme: () => void;
};

export const useAppStore = create<AppState>()((set) => ({
	initialized: false,
	setInitialized: (value): void => {
		set({ initialized: value });
	},
	theme: "light",
	toggleTheme: (): void => {
		set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" }));
	},
}));
