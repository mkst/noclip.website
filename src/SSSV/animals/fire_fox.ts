import type { AnimalModelRecipe } from "../animal_contracts.js";
import { FOX_STATIC_RECIPE } from "./fox.js";

export const FIRE_FOX_STATIC_RECIPE: AnimalModelRecipe = {
    ...FOX_STATIC_RECIPE,
    animalId: 7, species: "FIRE_FOX",
    pose: {
        sample: {
            // BAA38(390,150) uses stats.footHeight=8; C4A70(600,400,0),
            // BBA10(870) with settled tail heading and no pitch/ambient/action offset.
            jointPositions: {
                0: { x: 0, z: 0, y: 256 },
                1: { x: 0, z: 390, y: 256 }, 2: { x: 0, z: -390, y: 256 },
                19: { x: 0, z: 593, y: 818 }, 20: { x: 0, z: 993, y: 818 },
                26: { x: 0, z: -1260, y: 256 },
            },
            scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] },
            eyeFrame: 0,
        },
    },
    parts: [
        ...FOX_STATIC_RECIPE.parts.slice(0, 2),
        // Settled missileScaleLeft=8 gives the normal 0xE800 equipment scale.
        { ...FOX_STATIC_RECIPE.parts[1], order: 2, name: "flame body detail", address: 0x04005030, joints: { from: 2, to: 1 } },
        // Source pause branch fixes the otherwise random flame scale at 1.1328125.
        { ...FOX_STATIC_RECIPE.parts[2], order: 4, name: "flame tail", address: 0x04004A20, scale: { kind: "unit-16.16", value: 0x12200 } },
        { ...FOX_STATIC_RECIPE.parts[7], order: 7 },
        { ...FOX_STATIC_RECIPE.parts[8], order: 9 },
    ],
    stateChanges: [
        { order: 3, kind: "load-tile", paletteAddress: 0x040052D0, textureAddress: 0x040050D0 },
        ...FOX_STATIC_RECIPE.stateChanges.filter(c => c.kind === "load-eye-palette-frame" || c.kind === "apply-state-display-list")
            .map((c, i) => ({ ...c, order: [5, 6, 8, 10][i] })),
    ],
};
