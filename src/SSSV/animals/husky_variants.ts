import type { AnimalModelRecipe } from "../animal_contracts.js";
import { HUSKY_STATIC_RECIPE, huskyPart as part } from "./husky.js";

export const SKI_HUSKY_STATIC_RECIPE: AnimalModelRecipe = {
    ...HUSKY_STATIC_RECIPE, animalId: 42, species: "SKI_HUSKY",
    pose: { sample: { ...HUSKY_STATIC_RECIPE.pose.sample, jointPositions: {
        // Standing B9130(246,164,765,0), rigid legs, C4A70(32,218,6), BB938(246).
        0: { x: 0, z: 0, y: 765 },
        1: { x: 0, z: 246, y: 765 }, 2: { x: 0, z: -246, y: 765 },
        3: { x: -164, z: 246, y: 765 }, 4: { x: 164, z: 246, y: 765 },
        5: { x: -164, z: -246, y: 765 }, 6: { x: 164, z: -246, y: 765 },
        7: { x: -164, z: 246, y: 0 }, 8: { x: -164, z: 246, y: 0 },
        10: { x: 164, z: 246, y: 0 }, 11: { x: 164, z: 246, y: 0 },
        13: { x: -164, z: -246, y: 0 }, 14: { x: -164, z: -246, y: 0 },
        16: { x: 164, z: -246, y: 0 }, 17: { x: 164, z: -246, y: 0 },
        19: { x: 0, z: 246, y: 797 }, 20: { x: 0, z: 464, y: 797 },
        26: { x: 0, z: -492, y: 1011 },
    } } },
    parts: [
        part(1, "body", 0x04004AE0, 2, 1), part(2, "head", 0x04004E60, 19, 20),
        // Fully replenished missiles (missileScaleLeft/Right = 8).
        part(3, "left missile", 0x04005830, 2, 1), part(4, "right missile", 0x04005830, 2, 1, 1),
        part(5, "left lower body", 0x04005120, 8, 14), part(6, "right lower body", 0x04005120, 11, 17),
        part(8, "front left ski rear", 0x04003D50, 3, 8), part(9, "front left ski front", 0x04005220, 3, 8),
        part(10, "rear left ski rear", 0x04003D50, 5, 14), part(11, "rear left ski front", 0x04005220, 5, 14),
        part(13, "front right ski rear", 0x04003D50, 4, 11, 1), part(14, "front right ski front", 0x04005220, 4, 11, 1),
        part(15, "rear right ski rear", 0x04003D50, 6, 17, 1), part(16, "rear right ski front", 0x04005220, 6, 17, 1),
        part(18, "left eye", 0x04005500, 19, 20), part(20, "right eye", 0x04005520, 19, 20),
    ],
    stateChanges: [
        HUSKY_STATIC_RECIPE.stateChanges[0],
        { order: 7, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
        { order: 12, kind: "set-cull-mode", mode: "front" },
        { order: 17, kind: "load-eye-palette-frame", textureAddress: 0x01002100, paletteAddress: 0x01000CC0 },
        { order: 19, kind: "load-eye-palette-frame", textureAddress: 0x01002100, paletteAddress: 0x01000CC0 },
    ],
};

export const CRAZY_HUSKY_STATIC_RECIPE: AnimalModelRecipe = {
    ...HUSKY_STATIC_RECIPE, animalId: 41, species: "CRAZY_HUSKY",
    pose: { sample: { ...HUSKY_STATIC_RECIPE.pose.sample, jointPositions: {
        ...HUSKY_STATIC_RECIPE.pose.sample.jointPositions,
        // Tick-zero standing jaw displacement is 6; eyes follow the final head position.
        20: { x: 0, z: 464, y: 745 }, 26: { x: 0, z: -460, y: 1042 },
    } } },
    parts: [
        part(1, "body", 0x04003F70, 2, 1),
        { ...part(2, "skull", 0x04004850, 19, 20), jointOverrides: { to: { x: 0, z: 464, y: 736 } } },
        part(3, "head", 0x04004560, 19, 20),
        ...HUSKY_STATIC_RECIPE.parts.slice(2).map(p => ({ ...p, order: p.order + 1 })),
    ],
    stateChanges: HUSKY_STATIC_RECIPE.stateChanges.map(change => ({ ...change, order: change.order >= 3 ? change.order + 1 : change.order })),
};
