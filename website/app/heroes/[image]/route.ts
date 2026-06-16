import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const repositoryRoot =
	basename(process.cwd()) === "website" ? join(process.cwd(), "..") : process.cwd();
const heroAssetsRoot = join(repositoryRoot, "gitbooks/.gitbook/assets");
const imageNamePattern = /^[a-z0-9-]+\.png$/;

type RouteContext = {
	params: Promise<{
		image: string;
	}>;
};

export const runtime = "nodejs";

export async function GET(
	_request: Request,
	{ params }: RouteContext
): Promise<Response> {
	const { image } = await params;

	if (!imageNamePattern.test(image)) {
		return new Response("Not found", { status: 404 });
	}

	try {
		const body = await readFile(join(heroAssetsRoot, image));
		return new Response(body, {
			headers: {
				"Cache-Control": "public, max-age=31536000, immutable",
				"Content-Type": "image/png",
			},
		});
	} catch {
		return new Response("Not found", { status: 404 });
	}
}
