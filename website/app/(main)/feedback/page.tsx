import { SectionPage } from "@src/components/layout/SectionPage";

export const metadata = {
	title: "Feedback - tiny.place",
	description: "Browse the feedback section on tiny.place.",
};

export default function FeedbackPage(): React.ReactElement {
	return <SectionPage section="feedback" />;
}
