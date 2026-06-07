import { useTranslation } from "react-i18next";
import type { FunctionComponent } from "@src/common/types";

export const Home = (): FunctionComponent => {
	const { t, i18n } = useTranslation();

	const onTranslateButtonClick = async (): Promise<void> => {
		if (i18n.resolvedLanguage === "en") {
			await i18n.changeLanguage("es");
		} else {
			await i18n.changeLanguage("en");
		}
	};

	return (
		<div className="bg-gray-950 font-bold w-screen h-screen flex flex-col justify-center items-center gap-4">
			<h1 className="text-white text-7xl tracking-tight">
				{t("home.greeting")}
			</h1>
			<p className="text-purple-400 text-2xl font-medium">
				{t("home.tagline")}
			</p>
			<p className="text-gray-400 text-lg font-normal max-w-md text-center">
				{t("home.description")}
			</p>
			<button
				className="mt-4 px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-500 hover:cursor-pointer transition-colors"
				type="button"
				onClick={onTranslateButtonClick}
			>
				{i18n.resolvedLanguage === "en" ? "Español" : "English"}
			</button>
		</div>
	);
};
