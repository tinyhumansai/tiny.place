function darkenHex(hex: string, factor: number): string {
	const r = Math.max(0, Math.round(Number.parseInt(hex.slice(1, 3), 16) * factor));
	const g = Math.max(0, Math.round(Number.parseInt(hex.slice(3, 5), 16) * factor));
	const b = Math.max(0, Math.round(Number.parseInt(hex.slice(5, 7), 16) * factor));
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function generatePokerTableSvg(): string {
	const w = 256;
	const h = 140;
	const cx = w / 2;
	const cy = 60;
	const rimRx = 112;
	const rimRy = 56;
	const feltRx = 104;
	const feltRy = 52;
	const depth = 14;

	const parts: Array<string> = [];
	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`);

	parts.push(`<ellipse cx="${cx}" cy="${cy + depth}" rx="${rimRx}" ry="${rimRy}" fill="#3d2517"/>`);
	parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rimRx}" ry="${rimRy}" fill="#5c3a22"/>`);

	parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${feltRx}" ry="${feltRy}" fill="#1a5c3a"/>`);
	parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${feltRx}" ry="${feltRy}" fill="url(#feltGrad)" opacity="0.6"/>`);

	parts.push(`<defs><radialGradient id="feltGrad" cx="50%" cy="50%" r="50%">`);
	parts.push(`<stop offset="0%" stop-color="#2d8a5f" stop-opacity="0.4"/>`);
	parts.push(`<stop offset="100%" stop-color="#0a3020" stop-opacity="0.5"/>`);
	parts.push(`</radialGradient></defs>`);

	parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${feltRx - 12}" ry="${feltRy - 6}" fill="none" stroke="#1a4a30" stroke-width="1.5" opacity="0.5"/>`);
	parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${feltRx - 30}" ry="${feltRy - 15}" fill="none" stroke="#1a4a30" stroke-width="1" opacity="0.4"/>`);

	const legW = 6;
	const legH = 20;
	const legColor = "#3d2517";
	const legPositions = [
		{ x: cx - rimRx + 20, y: cy + rimRy - 10 },
		{ x: cx + rimRx - 26, y: cy + rimRy - 10 },
		{ x: cx - 3, y: cy + rimRy - 2 },
	];
	for (const leg of legPositions) {
		parts.push(`<rect x="${leg.x}" y="${leg.y}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`);
	}

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
	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`);

	for (let index = 0; index < count; index++) {
		const y = baseY - index * (chipH + 1);
		parts.push(`<rect x="${cx - chipRx}" y="${y}" width="${chipRx * 2}" height="${chipH}" fill="${darker}" rx="1"/>`);
		parts.push(`<ellipse cx="${cx}" cy="${y}" rx="${chipRx}" ry="${chipRy}" fill="${color}" stroke="${darker}" stroke-width="0.5"/>`);
		parts.push(`<ellipse cx="${cx}" cy="${y}" rx="${chipRx - 3}" ry="${chipRy - 1.5}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>`);
	}

	parts.push("</svg>");
	return parts.join("");
}

export function generateCardFaceDownSvg(): string {
	const w = 22;
	const h = 30;
	const skew = 4;

	const parts: Array<string> = [];
	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`);

	parts.push(`<polygon points="${skew},2 ${w - 2},0 ${w - skew},${h - 2} 2,${h}" fill="#f8f4e8" stroke="#aaa" stroke-width="0.8"/>`);
	parts.push(`<polygon points="${skew + 2},4 ${w - 4},2 ${w - skew - 2},${h - 4} 4,${h - 2}" fill="#1a3a6b"/>`);

	for (let y = 6; y < h - 6; y += 4) {
		parts.push(`<line x1="${skew + 4}" y1="${y}" x2="${w - skew - 4}" y2="${y - 1}" stroke="#2a4a7b" stroke-width="0.5" opacity="0.6"/>`);
	}
	for (let x = 6; x < w - 4; x += 4) {
		parts.push(`<line x1="${x}" y1="5" x2="${x - 1}" y2="${h - 5}" stroke="#2a4a7b" stroke-width="0.5" opacity="0.6"/>`);
	}

	parts.push("</svg>");
	return parts.join("");
}

export function generateDealerChipSvg(): string {
	const w = 24;
	const h = 18;
	const cx = w / 2;
	const cy = h / 2;

	const parts: Array<string> = [];
	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`);

	parts.push(`<ellipse cx="${cx}" cy="${cy + 2}" rx="10" ry="5" fill="#333"/>`);
	parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="10" ry="5" fill="#f0f0f0" stroke="#333" stroke-width="0.8"/>`);
	parts.push(`<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="8" font-weight="bold" fill="#333" font-family="sans-serif">D</text>`);

	parts.push("</svg>");
	return parts.join("");
}
