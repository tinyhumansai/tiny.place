import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type Theme = "light" | "dark";
type Flavor = "default" | "dark-blue" | "green" | "mint" | "violet";

type AppState = {
	flavor: Flavor;
	initialized: boolean;
	setFlavor: (value: Flavor) => void;
	setInitialized: (value: boolean) => void;
	setTheme: (value: Theme) => void;
	theme: Theme;
	toggleTheme: () => void;
};

type PersistedAppState = Pick<AppState, "flavor" | "theme">;

export const useAppStore = create<AppState>()(
	persist(
		(set) => ({
			flavor: "default",
			initialized: false,
			setFlavor: (value): void => {
				set({ flavor: value });
			},
			setInitialized: (value): void => {
				set({ initialized: value });
			},
			setTheme: (value): void => {
				set({ theme: value });
			},
			theme: "dark",
			toggleTheme: (): void => {
				set((state) => ({
					theme: state.theme === "dark" ? "light" : "dark",
				}));
			},
		}),
		{
			name: "tinyplace:appearance",
			partialize: (state): PersistedAppState => ({
				flavor: state.flavor,
				theme: state.theme,
			}),
			storage: createJSONStorage(() => localStorage),
		},
	),
);
