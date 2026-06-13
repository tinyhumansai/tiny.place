import { renderSvgToCanvas } from "../SvgAvatarRenderer";
import type { FurnitureItemDefinition } from "./types";
import {
	generatePokerTableSvg,
	generateChairSvg,
	generateChipStackSvg,
	generateCardFaceDownSvg,
	generateDealerChipSvg,
	generateJudgeBenchSvg,
	generateWitnessStandSvg,
	generateCourtTableSvg,
	generateGalleryBenchSvg,
	generateGavelSvg,
} from "./FurnitureSvgGenerator";

/* eslint-disable camelcase */
const ITEM_DEFINITIONS: Record<string, FurnitureItemDefinition> = {
	poker_table: {
		key: "poker_table",
		svgWidth: 200,
		svgHeight: 132,
		generateSvg: generatePokerTableSvg,
	},
	chair: {
		key: "chair",
		svgWidth: 38,
		svgHeight: 47,
		generateSvg: (): string => generateChairSvg(),
	},
	chip_stack_red: {
		key: "chip_stack_red",
		svgWidth: 28,
		svgHeight: 36,
		generateSvg: (): string => generateChipStackSvg("#e74c3c", 4),
	},
	chip_stack_blue: {
		key: "chip_stack_blue",
		svgWidth: 28,
		svgHeight: 36,
		generateSvg: (): string => generateChipStackSvg("#3498db", 3),
	},
	chip_stack_green: {
		key: "chip_stack_green",
		svgWidth: 28,
		svgHeight: 36,
		generateSvg: (): string => generateChipStackSvg("#2ecc71", 5),
	},
	chip_stack_black: {
		key: "chip_stack_black",
		svgWidth: 28,
		svgHeight: 36,
		generateSvg: (): string => generateChipStackSvg("#2c3e50", 3),
	},
	card_facedown: {
		key: "card_facedown",
		svgWidth: 22,
		svgHeight: 30,
		generateSvg: generateCardFaceDownSvg,
	},
	dealer_chip: {
		key: "dealer_chip",
		svgWidth: 24,
		svgHeight: 18,
		generateSvg: generateDealerChipSvg,
	},
	judge_bench: {
		key: "judge_bench",
		svgWidth: 180,
		svgHeight: 120,
		generateSvg: generateJudgeBenchSvg,
	},
	witness_stand: {
		key: "witness_stand",
		svgWidth: 72,
		svgHeight: 64,
		generateSvg: generateWitnessStandSvg,
	},
	court_table: {
		key: "court_table",
		svgWidth: 116,
		svgHeight: 78,
		generateSvg: generateCourtTableSvg,
	},
	gallery_bench: {
		key: "gallery_bench",
		svgWidth: 102,
		svgHeight: 70,
		generateSvg: generateGalleryBenchSvg,
	},
	gavel: {
		key: "gavel",
		svgWidth: 32,
		svgHeight: 24,
		generateSvg: generateGavelSvg,
	},
};
/* eslint-enable camelcase */

export default class FurnitureRenderer {
	public async initializeForRoom(
		scene: Phaser.Scene,
		itemTypes: Array<string>
	): Promise<void> {
		const promises: Array<Promise<void>> = [];

		for (const itemType of itemTypes) {
			const definition = ITEM_DEFINITIONS[itemType];
			if (!definition) continue;

			const textureKey = `furniture_${definition.key}`;
			if (scene.textures.exists(textureKey)) continue;

			const svg = definition.generateSvg();
			promises.push(
				renderSvgToCanvas(svg, definition.svgWidth, definition.svgHeight).then(
					(canvas) => {
						if (!scene.textures.exists(textureKey)) {
							scene.textures.addCanvas(textureKey, canvas);
						}
					}
				)
			);
		}

		await Promise.all(promises);
	}

	public getTextureKey(itemType: string): string {
		return `furniture_${itemType}`;
	}
}
