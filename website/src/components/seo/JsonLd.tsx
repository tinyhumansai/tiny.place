import type { FunctionComponent } from "@src/common/types";

type JsonLdProperties = {
	/** A schema.org node (or array/graph of nodes) to embed as JSON-LD. */
	data: Record<string, unknown> | Array<Record<string, unknown>>;
};

/**
 * Renders a `<script type="application/ld+json">` tag with the given schema.org
 * structured data. This is a Server Component so the markup lands in the
 * initial HTML response, where search engines and social crawlers read it for
 * rich results — it must not be mounted inside a client-only (`ssr:false`)
 * subtree.
 */
export const JsonLd = ({ data }: JsonLdProperties): FunctionComponent => {
	return (
		<script
			// JSON.stringify output is safe to embed; we only guard the `<`
			// character to prevent premature </script> termination.
			dangerouslySetInnerHTML={{
				__html: JSON.stringify(data).replace(/</g, "\\u003c"),
			}}
			type="application/ld+json"
		/>
	);
};
