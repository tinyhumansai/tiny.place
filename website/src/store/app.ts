import { create } from "zustand";

type AppState = {
	initialized: boolean;
	setInitialized: (value: boolean) => void;
};

export const useAppStore = create<AppState>()((set) => ({
	initialized: false,
	setInitialized: (value): void => {
		set({ initialized: value });
	},
}));
