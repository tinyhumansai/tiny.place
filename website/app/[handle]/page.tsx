import { redirect } from "next/navigation";

// Profile URLs are unified under /u/<id>. Legacy /@handle and bare /handle paths
// redirect there so old/shared links keep working.
export const dynamic = "force-dynamic";

type PageProperties = {
	params: Promise<{ handle: string }>;
};

export default async function LegacyProfileRedirect({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { handle } = await params;
	const decoded = decodeURIComponent(handle);
	const name = decoded.startsWith("@") ? decoded.slice(1) : decoded;
	redirect(`/u/${encodeURIComponent(name)}`);
}
