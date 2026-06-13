function darkenHex(hex: string, factor: number): string {
	const r = Math.max(
		0,
		Math.round(Number.parseInt(hex.slice(1, 3), 16) * factor)
	);
	const g = Math.max(
		0,
		Math.round(Number.parseInt(hex.slice(3, 5), 16) * factor)
	);
	const b = Math.max(
		0,
		Math.round(Number.parseInt(hex.slice(5, 7), 16) * factor)
	);
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

interface IsoDiamond {
	tl: { x: number; y: number };
	topRight: { x: number; y: number };
	br: { x: number; y: number };
	bl: { x: number; y: number };
}

function isoDiamond(
	cx: number,
	topY: number,
	diamondWidth: number
): IsoDiamond {
	const halfW = diamondWidth / 2;
	return {
		tl: { x: cx, y: topY },
		topRight: { x: cx + halfW, y: topY + halfW / 2 },
		br: { x: cx, y: topY + halfW },
		bl: { x: cx - halfW, y: topY + halfW / 2 },
	};
}

function diamondPoints(diamond: IsoDiamond): string {
	return `${diamond.tl.x},${diamond.tl.y} ${diamond.topRight.x},${diamond.topRight.y} ${diamond.br.x},${diamond.br.y} ${diamond.bl.x},${diamond.bl.y}`;
}

export function generatePokerTableSvg(): string {
	const diamondW = 180;
	const depth = 12;
	const topY = 10;
	const halfW = diamondW / 2;
	const diamondH = halfW;
	const w = diamondW + 20;
	const h = topY + diamondH + depth + 20;
	const cx = w / 2;
	const rimW = 8;

	const outer = isoDiamond(cx, topY, diamondW);

	const parts: Array<string> = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
	);

	parts.push(`<defs><radialGradient id="feltGrad" cx="50%" cy="50%" r="60%">`);
	parts.push(`<stop offset="0%" stop-color="#2d8a5f" stop-opacity="0.3"/>`);
	parts.push(`<stop offset="100%" stop-color="#0a3020" stop-opacity="0.4"/>`);
	parts.push(`</radialGradient></defs>`);

	const legW = 5;
	const legH = 18;
	const legColor = "#3d2517";
	parts.push(
		`<rect x="${outer.bl.x + 15}" y="${outer.bl.y + depth - 2}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`
	);
	parts.push(
		`<rect x="${outer.br.x - 10}" y="${outer.br.y + depth - 2}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`
	);
	parts.push(
		`<rect x="${outer.topRight.x - 20}" y="${outer.topRight.y + depth - 2}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`
	);

	parts.push(
		`<polygon points="${outer.bl.x},${outer.bl.y} ${outer.bl.x},${outer.bl.y + depth} ${outer.br.x},${outer.br.y + depth} ${outer.br.x},${outer.br.y}" fill="#3d2517"/>`
	);
	parts.push(
		`<polygon points="${outer.br.x},${outer.br.y} ${outer.br.x},${outer.br.y + depth} ${outer.topRight.x},${outer.topRight.y + depth} ${outer.topRight.x},${outer.topRight.y}" fill="#2e1a0f"/>`
	);

	parts.push(
		`<polygon points="${diamondPoints(outer)}" fill="#5c3a22" stroke="#4a2e1a" stroke-width="1"/>`
	);

	const inner = isoDiamond(cx, topY + rimW / 2, diamondW - rimW * 2);
	parts.push(`<polygon points="${diamondPoints(inner)}" fill="#1a5c3a"/>`);
	parts.push(
		`<polygon points="${diamondPoints(inner)}" fill="url(#feltGrad)"/>`
	);

	const mcy = topY + diamondH / 2;
	parts.push(
		`<ellipse cx="${cx}" cy="${mcy}" rx="20" ry="10" fill="none" stroke="#1a4a30" stroke-width="1.5" opacity="0.5"/>`
	);

	parts.push("</svg>");
	return parts.join("");
}

export function generateChairSvg(color: string = "#5c3a22"): string {
	const seatDiamondW = 26;
	const halfW = seatDiamondW / 2;
	const seatDepth = 4;
	const legH = 14;
	const backH = 14;
	const topY = backH + 2;
	const w = seatDiamondW + 12;
	const h = topY + halfW + seatDepth + legH + 2;
	const cx = w / 2;
	const darker = darkenHex(color, 0.7);

	const seat = isoDiamond(cx, topY, seatDiamondW);

	const parts: Array<string> = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
	);

	const legW = 3;
	parts.push(
		`<rect x="${seat.bl.x + 2}" y="${seat.bl.y + seatDepth}" width="${legW}" height="${legH}" rx="1" fill="${darker}"/>`
	);
	parts.push(
		`<rect x="${seat.br.x - 2}" y="${seat.br.y + seatDepth}" width="${legW}" height="${legH}" rx="1" fill="${darker}"/>`
	);
	parts.push(
		`<rect x="${seat.topRight.x - 4}" y="${seat.topRight.y + seatDepth}" width="${legW}" height="${legH}" rx="1" fill="${darker}"/>`
	);
	parts.push(
		`<rect x="${seat.tl.x - 2}" y="${seat.tl.y + seatDepth - 2}" width="${legW}" height="${legH}" rx="1" fill="${darker}"/>`
	);

	parts.push(
		`<polygon points="${seat.bl.x},${seat.bl.y} ${seat.bl.x},${seat.bl.y + seatDepth} ${seat.br.x},${seat.br.y + seatDepth} ${seat.br.x},${seat.br.y}" fill="${darker}"/>`
	);
	parts.push(
		`<polygon points="${seat.br.x},${seat.br.y} ${seat.br.x},${seat.br.y + seatDepth} ${seat.topRight.x},${seat.topRight.y + seatDepth} ${seat.topRight.x},${seat.topRight.y}" fill="${darkenHex(color, 0.6)}"/>`
	);

	parts.push(`<polygon points="${diamondPoints(seat)}" fill="${color}"/>`);

	const padInset = 3;
	const pad = isoDiamond(cx, topY + padInset / 2, seatDiamondW - padInset * 2);
	parts.push(
		`<polygon points="${diamondPoints(pad)}" fill="#8b4444" opacity="0.6"/>`
	);

	const backW = seatDiamondW - 4;
	const backY = topY - backH;
	const btl = { x: cx, y: backY };
	const bTopRight = { x: cx + backW / 2, y: backY + backW / 4 };
	const bbr = { x: cx + backW / 2 - 1, y: topY + 1 };
	const bbl = { x: cx - backW / 2 + 1, y: topY - 2 };

	parts.push(
		`<polygon points="${bbl.x},${bbl.y} ${bbl.x},${bbl.y + seatDepth} ${btl.x - 1},${btl.y + seatDepth} ${btl.x - 1},${btl.y}" fill="${darker}" opacity="0.4"/>`
	);
	parts.push(
		`<polygon points="${btl.x},${btl.y} ${bTopRight.x},${bTopRight.y} ${bbr.x},${bbr.y} ${bbl.x},${bbl.y}" fill="${color}" stroke="${darker}" stroke-width="0.5"/>`
	);

	parts.push("</svg>");
	return parts.join("");
}

export function generateChipStackSvg(color: string, count: number = 4): string {
	const w = 28;
	const h = 36;
	const cx = w / 2;
	const chipRx = 10;
	const chipRy = 5;
	const chipH = 3;
	const baseY = h - 8;

	const darker = darkenHex(color, 0.7);

	const parts: Array<string> = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
	);

	for (let index = 0; index < count; index++) {
		const y = baseY - index * (chipH + 1);
		parts.push(
			`<rect x="${cx - chipRx}" y="${y}" width="${chipRx * 2}" height="${chipH}" fill="${darker}" rx="1"/>`
		);
		parts.push(
			`<ellipse cx="${cx}" cy="${y}" rx="${chipRx}" ry="${chipRy}" fill="${color}" stroke="${darker}" stroke-width="0.5"/>`
		);
		parts.push(
			`<ellipse cx="${cx}" cy="${y}" rx="${chipRx - 3}" ry="${chipRy - 1.5}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>`
		);
	}

	parts.push("</svg>");
	return parts.join("");
}

export function generateCardFaceDownSvg(): string {
	const w = 22;
	const h = 30;
	const skew = 4;

	const parts: Array<string> = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
	);

	parts.push(
		`<polygon points="${skew},2 ${w - 2},0 ${w - skew},${h - 2} 2,${h}" fill="#f8f4e8" stroke="#aaa" stroke-width="0.8"/>`
	);
	parts.push(
		`<polygon points="${skew + 2},4 ${w - 4},2 ${w - skew - 2},${h - 4} 4,${h - 2}" fill="#1a3a6b"/>`
	);

	for (let y = 6; y < h - 6; y += 4) {
		parts.push(
			`<line x1="${skew + 4}" y1="${y}" x2="${w - skew - 4}" y2="${y - 1}" stroke="#2a4a7b" stroke-width="0.5" opacity="0.6"/>`
		);
	}
	for (let x = 6; x < w - 4; x += 4) {
		parts.push(
			`<line x1="${x}" y1="5" x2="${x - 1}" y2="${h - 5}" stroke="#2a4a7b" stroke-width="0.5" opacity="0.6"/>`
		);
	}

	parts.push("</svg>");
	return parts.join("");
}

export function generateJudgeBenchSvg(): string {
	const diamondW = 160;
	const halfW = diamondW / 2;
	const depth = 20;
	const topY = 10;
	const w = diamondW + 20;
	const h = topY + halfW + depth + 10;
	const cx = w / 2;

	const outer = isoDiamond(cx, topY, diamondW);

	const parts: Array<string> = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
	);

	parts.push(
		`<polygon points="${outer.bl.x},${outer.bl.y} ${outer.bl.x},${outer.bl.y + depth} ${outer.br.x},${outer.br.y + depth} ${outer.br.x},${outer.br.y}" fill="#4a3020"/>`
	);
	parts.push(
		`<polygon points="${outer.br.x},${outer.br.y} ${outer.br.x},${outer.br.y + depth} ${outer.topRight.x},${outer.topRight.y + depth} ${outer.topRight.x},${outer.topRight.y}" fill="#3a2418"/>`
	);

	parts.push(
		`<polygon points="${diamondPoints(outer)}" fill="#5c3a22" stroke="#4a2e1a" stroke-width="1"/>`
	);

	const inner = isoDiamond(cx, topY + 6, diamondW - 24);
	parts.push(
		`<polygon points="${diamondPoints(inner)}" fill="#6b4530" stroke="#5a3828" stroke-width="0.5"/>`
	);

	const emblemY = topY + halfW / 2;
	parts.push(
		`<ellipse cx="${cx}" cy="${emblemY}" rx="10" ry="5" fill="#c9a84c" opacity="0.6"/>`
	);

	parts.push("</svg>");
	return parts.join("");
}

export function generateWitnessStandSvg(): string {
	const diamondW = 56;
	const halfW = diamondW / 2;
	const depth = 16;
	const topY = 12;
	const w = diamondW + 16;
	const h = topY + halfW + depth + 8;
	const cx = w / 2;

	const outer = isoDiamond(cx, topY, diamondW);

	const parts: Array<string> = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
	);

	parts.push(
		`<polygon points="${outer.bl.x},${outer.bl.y} ${outer.bl.x},${outer.bl.y + depth} ${outer.br.x},${outer.br.y + depth} ${outer.br.x},${outer.br.y}" fill="#4a3020"/>`
	);
	parts.push(
		`<polygon points="${outer.br.x},${outer.br.y} ${outer.br.x},${outer.br.y + depth} ${outer.topRight.x},${outer.topRight.y + depth} ${outer.topRight.x},${outer.topRight.y}" fill="#3a2418"/>`
	);

	parts.push(
		`<polygon points="${diamondPoints(outer)}" fill="#5c3a22" stroke="#4a2e1a" stroke-width="1"/>`
	);

	const railH = 8;
	const railY = topY - railH;
	parts.push(
		`<polygon points="${cx},${railY} ${cx + diamondW / 2 - 4},${railY + diamondW / 4 - 2} ${cx + diamondW / 2 - 4},${railY + diamondW / 4 - 2 + railH} ${cx},${railY + railH}" fill="#6b4530" stroke="#5a3828" stroke-width="0.5"/>`
	);

	parts.push("</svg>");
	return parts.join("");
}

export function generateCourtTableSvg(): string {
	const diamondW = 100;
	const halfW = diamondW / 2;
	const depth = 10;
	const topY = 10;
	const w = diamondW + 16;
	const h = topY + halfW + depth + 18;
	const cx = w / 2;

	const outer = isoDiamond(cx, topY, diamondW);

	const parts: Array<string> = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
	);

	const legW = 4;
	const legH = 16;
	const legColor = "#3d2517";
	parts.push(
		`<rect x="${outer.bl.x + 8}" y="${outer.bl.y + depth - 2}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`
	);
	parts.push(
		`<rect x="${outer.br.x - 6}" y="${outer.br.y + depth - 2}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`
	);
	parts.push(
		`<rect x="${outer.topRight.x - 12}" y="${outer.topRight.y + depth - 2}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`
	);

	parts.push(
		`<polygon points="${outer.bl.x},${outer.bl.y} ${outer.bl.x},${outer.bl.y + depth} ${outer.br.x},${outer.br.y + depth} ${outer.br.x},${outer.br.y}" fill="#4a3020"/>`
	);
	parts.push(
		`<polygon points="${outer.br.x},${outer.br.y} ${outer.br.x},${outer.br.y + depth} ${outer.topRight.x},${outer.topRight.y + depth} ${outer.topRight.x},${outer.topRight.y}" fill="#3a2418"/>`
	);

	parts.push(
		`<polygon points="${diamondPoints(outer)}" fill="#5c3a22" stroke="#4a2e1a" stroke-width="1"/>`
	);

	parts.push("</svg>");
	return parts.join("");
}

export function generateGalleryBenchSvg(): string {
	const diamondW = 90;
	const halfW = diamondW / 2;
	const depth = 5;
	const topY = 6;
	const w = diamondW + 12;
	const h = topY + halfW + depth + 14;
	const cx = w / 2;

	const outer = isoDiamond(cx, topY, diamondW);

	const parts: Array<string> = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
	);

	const legW = 3;
	const legH = 12;
	const legColor = "#3d2517";
	parts.push(
		`<rect x="${outer.bl.x + 6}" y="${outer.bl.y + depth}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`
	);
	parts.push(
		`<rect x="${outer.br.x - 4}" y="${outer.br.y + depth}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`
	);
	parts.push(
		`<rect x="${outer.topRight.x - 10}" y="${outer.topRight.y + depth}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`
	);
	parts.push(
		`<rect x="${outer.tl.x - 2}" y="${outer.tl.y + depth - 2}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`
	);

	parts.push(
		`<polygon points="${outer.bl.x},${outer.bl.y} ${outer.bl.x},${outer.bl.y + depth} ${outer.br.x},${outer.br.y + depth} ${outer.br.x},${outer.br.y}" fill="#4a3020"/>`
	);
	parts.push(
		`<polygon points="${outer.br.x},${outer.br.y} ${outer.br.x},${outer.br.y + depth} ${outer.topRight.x},${outer.topRight.y + depth} ${outer.topRight.x},${outer.topRight.y}" fill="#3a2418"/>`
	);

	parts.push(
		`<polygon points="${diamondPoints(outer)}" fill="#6b4530" stroke="#5a3828" stroke-width="0.5"/>`
	);

	parts.push("</svg>");
	return parts.join("");
}

export function generateGavelSvg(): string {
	const w = 32;
	const h = 24;

	const parts: Array<string> = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
	);

	parts.push(
		`<line x1="8" y1="16" x2="24" y2="8" stroke="#5c3a22" stroke-width="2.5" stroke-linecap="round"/>`
	);
	parts.push(
		`<rect x="4" y="12" width="10" height="6" rx="2" fill="#3d2517" transform="rotate(-25, 9, 15)"/>`
	);
	parts.push(
		`<ellipse cx="20" cy="18" rx="6" ry="3" fill="#4a3020" opacity="0.6"/>`
	);

	parts.push("</svg>");
	return parts.join("");
}

export function generateDealerChipSvg(): string {
	const w = 24;
	const h = 18;
	const cx = w / 2;
	const cy = h / 2;

	const parts: Array<string> = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
	);

	parts.push(`<ellipse cx="${cx}" cy="${cy + 2}" rx="10" ry="5" fill="#333"/>`);
	parts.push(
		`<ellipse cx="${cx}" cy="${cy}" rx="10" ry="5" fill="#f0f0f0" stroke="#333" stroke-width="0.8"/>`
	);
	parts.push(
		`<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="8" font-weight="bold" fill="#333" font-family="sans-serif">D</text>`
	);

	parts.push("</svg>");
	return parts.join("");
}
