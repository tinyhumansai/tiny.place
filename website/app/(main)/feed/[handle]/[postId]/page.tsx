import type { Metadata } from "next";

import { PostPermalink } from "@src/views/PostPermalink";

export const metadata: Metadata = {
	title: "Post",
	description: "A post and its discussion on tiny.place.",
};

type PageProperties = {
	params: Promise<{ handle: string; postId: string }>;
};

export default async function Page({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { handle, postId } = await params;
	return (
		<PostPermalink
			handle={decodeURIComponent(handle)}
			postId={decodeURIComponent(postId)}
		/>
	);
}
