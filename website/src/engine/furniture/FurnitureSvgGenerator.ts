function darkenHex(hex: string, factor: number): string {
	const r = Math.max(0, Math.round(Number.parseInt(hex.slice(1, 3), 16) * factor));
	const g = Math.max(0, Math.round(Number.parseInt(hex.slice(3, 5), 16) * factor));
	const b = Math.max(0, Math.round(Number.parseInt(hex.slice(5, 7), 16) * factor));
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function generatePokerTableSvg(): string {
	const w = 260;
	const h = 150;
	const cx = w / 2;
	const tableW = 200;
	const tableH = 100;
	const depth = 12;
	const topY = 30;
	const rimW = 8;

	const tl = { x: cx, y: topY };
	const tr = { x: cx + tableW / 2, y: topY + tableH / 4 };
	const br = { x: cx, y: topY + tableH / 2 };
	const bl = { x: cx - tableW / 2, y: topY + tableH / 4 };

	const parts: Array<string> = [];
	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`);

	parts.push(`<defs><radialGradient id="feltGrad" cx="50%" cy="50%" r="60%">`);
	parts.push(`<stop offset="0%" stop-color="#2d8a5f" stop-opacity="0.3"/>`);
	parts.push(`<stop offset="100%" stop-color="#0a3020" stop-opacity="0.4"/>`);
	parts.push(`</radialGradient></defs>`);

	const legW = 5;
	const legH = 18;
	const legColor = "#3d2517";
	parts.push(`<rect x="${bl.x + 15}" y="${bl.y + depth - 2}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`);
	parts.push(`<rect x="${br.x - 10}" y="${br.y + depth - 2}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`);
	parts.push(`<rect x="${tr.x - 20}" y="${tr.y + depth - 2}" width="${legW}" height="${legH}" rx="1" fill="${legColor}"/>`);

	const depthLeft = `${bl.x},${bl.y} ${bl.x},${bl.y + depth} ${br.x},${br.y + depth} ${br.x},${br.y}`;
	parts.push(`<polygon points="${depthLeft}" fill="#3d2517"/>`);
	const depthRight = `${br.x},${br.y} ${br.x},${br.y + depth} ${tr.x},${tr.y + depth} ${tr.x},${tr.y}`;
	parts.push(`<polygon points="${depthRight}" fill="#2e1a0f"/>`);

	const rim = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
	parts.push(`<polygon points="${rim}" fill="#5c3a22" stroke="#4a2e1a" stroke-width="1"/>`);

	const itl = { x: cx, y: topY + rimW / 2 };
	const itr = { x: cx + tableW / 2 - rimW, y: topY + tableH / 4 };
	const ibr = { x: cx, y: topY + tableH / 2 - rimW / 2 };
	const ibl = { x: cx - tableW / 2 + rimW, y: topY + tableH / 4 };
	const felt = `${itl.x},${itl.y} ${itr.x},${itr.y} ${ibr.x},${ibr.y} ${ibl.x},${ibl.y}`;
	parts.push(`<polygon points="${felt}" fill="#1a5c3a"/>`);
	parts.push(`<polygon points="${felt}" fill="url(#feltGrad)"/>`);

	const mcx = cx;
	const mcy = topY + tableH / 4;
	parts.push(`<ellipse cx="${mcx}" cy="${mcy}" rx="25" ry="12" fill="none" stroke="#1a4a30" stroke-width="1.5" opacity="0.5"/>`);

	parts.push("</svg>");
	return parts.join("");
}

export function generateChairSvg(color: string = "#5c3a22"): string {
	const w = 36;
	const h = 48;
	const darker = darkenHex(color, 0.7);

	const parts: Array<string> = [];
	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`);

	const seatY = 22;
	const seatW = 28;
	const seatH = 14;
	const seatDepth = 4;
	const cx = w / 2;

	const stl = { x: cx, y: seatY };
	const sTopRight = { x: cx + seatW / 2, y: seatY + seatH / 4 };
	const sbr = { x: cx, y: seatY + seatH / 2 };
	const sbl = { x: cx - seatW / 2, y: seatY + seatH / 4 };

	const legW = 3;
	const legH = 14;
	parts.push(`<rect x="${sbl.x + 2}" y="${sbl.y + seatDepth}" width="${legW}" height="${legH}" rx="1" fill="${darker}"/>`);
	parts.push(`<rect x="${sbr.x - 2}" y="${sbr.y + seatDepth}" width="${legW}" height="${legH}" rx="1" fill="${darker}"/>`);
	parts.push(`<rect x="${sTopRight.x - 5}" y="${sTopRight.y + seatDepth}" width="${legW}" height="${legH}" rx="1" fill="${darker}"/>`);
	parts.push(`<rect x="${stl.x - 2}" y="${stl.y + seatDepth - 2}" width="${legW}" height="${legH}" rx="1" fill="${darker}"/>`);

	const dl = `${sbl.x},${sbl.y} ${sbl.x},${sbl.y + seatDepth} ${sbr.x},${sbr.y + seatDepth} ${sbr.x},${sbr.y}`;
	parts.push(`<polygon points="${dl}" fill="${darker}"/>`);
	const dr = `${sbr.x},${sbr.y} ${sbr.x},${sbr.y + seatDepth} ${sTopRight.x},${sTopRight.y + seatDepth} ${sTopRight.x},${sTopRight.y}`;
	parts.push(`<polygon points="${dr}" fill="${darkenHex(color, 0.6)}"/>`);

	const seat = `${stl.x},${stl.y} ${sTopRight.x},${sTopRight.y} ${sbr.x},${sbr.y} ${sbl.x},${sbl.y}`;
	parts.push(`<polygon points="${seat}" fill="${color}"/>`);

	const pad = `${stl.x},${stl.y + 1} ${sTopRight.x - 2},${sTopRight.y + 1} ${sbr.x},${sbr.y - 1} ${sbl.x + 2},${sbl.y - 1}`;
	parts.push(`<polygon points="${pad}" fill="#8b4444" opacity="0.6"/>`);

	const backH = 14;
	const backY = seatY - backH;
	const backW = seatW - 4;
	const btl = { x: cx, y: backY };
	const btr = { x: cx + backW / 2, y: backY + 3 };
	const bbr = { x: cx + backW / 2 - 1, y: seatY + 1 };
	const bbl = { x: cx - backW / 2 + 1, y: seatY - 2 };

	const backLeft = `${bbl.x},${bbl.y} ${bbl.x},${bbl.y + seatDepth} ${btl.x - 1},${btl.y + seatDepth} ${btl.x - 1},${btl.y}`;
	parts.push(`<polygon points="${backLeft}" fill="${darker}" opacity="0.4"/>`);

	const back = `${btl.x},${btl.y} ${btr.x},${btr.y} ${bbr.x},${bbr.y} ${bbl.x},${bbl.y}`;
	parts.push(`<polygon points="${back}" fill="${color}" stroke="${darker}" stroke-width="0.5"/>`);

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
