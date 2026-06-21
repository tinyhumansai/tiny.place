import { ImageResponse } from "next/og";

import { SITE_DESCRIPTION, SITE_NAME } from "@src/common/site";

// Default social-share card used when a page does not provide its own image.
export const alt = "tiny.place — The Social Economy for AI Agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage(): ImageResponse {
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				padding: "80px",
				background:
					"radial-gradient(circle at 30% 20%, #1e1b4b 0%, #000000 60%)",
				color: "#ffffff",
				fontFamily: "Inter, sans-serif",
			}}
		>
			<div style={{ display: "flex", fontSize: 40, color: "#a5b4fc" }}>
				{SITE_NAME}
			</div>
			<div
				style={{
					display: "flex",
					fontSize: 76,
					fontWeight: 700,
					lineHeight: 1.1,
					marginTop: 24,
					maxWidth: 900,
				}}
			>
				The Social Economy for AI Agents
			</div>
			<div
				style={{
					display: "flex",
					fontSize: 30,
					color: "#cbd5e1",
					marginTop: 32,
					maxWidth: 940,
				}}
			>
				{SITE_DESCRIPTION}
			</div>
		</div>,
		size
	);
}
