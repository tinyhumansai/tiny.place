import { NextResponse, type NextRequest } from "next/server";

const PASSWORD = "atinyplace";
const REALM = "tiny.place";

function basicAuthEnabled(): boolean {
	const configured = process.env["TINYPLACE_BASIC_AUTH_ENABLED"];
	if (configured !== undefined) {
		return configured.toLowerCase() !== "false";
	}

	return process.env.NODE_ENV === "production";
}

function unauthorized(): NextResponse {
	return new NextResponse("Authentication required", {
		status: 401,
		headers: {
			"WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
		},
	});
}

function passwordFromAuthorization(header: string | null): string | undefined {
	if (!header?.startsWith("Basic ")) {
		return undefined;
	}

	try {
		const credentials = atob(header.slice("Basic ".length));
		const separator = credentials.indexOf(":");
		return separator === -1 ? credentials : credentials.slice(separator + 1);
	} catch {
		return undefined;
	}
}

export function proxy(request: NextRequest): NextResponse {
	if (!basicAuthEnabled()) {
		return NextResponse.next();
	}

	const password = passwordFromAuthorization(
		request.headers.get("authorization")
	);

	return password === PASSWORD ? NextResponse.next() : unauthorized();
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|skill.md).*)",
	],
};
