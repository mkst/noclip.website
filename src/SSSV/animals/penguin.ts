import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0, orientationMode: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x10000 }, mirror, orientationMode };
}

export const PENGUIN_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 37, species: "PENGUIN", biomeSegment: 1,
    pose: {
        sample: {
            // B975C(150,1), C23F8(125): state 2, flat support, no attack offsets.
            jointPositions: {
                0: { x: 0, z: 0, y: 150 },
                1: { x: 0, z: 0, y: 300 }, 2: { x: 0, z: 0, y: 0 },
                15: { x: -52, z: 113, y: 0 }, 18: { x: 52, z: 113, y: 0 },
            },
            scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] },
            eyeFrame: 0,
        },
    },
    parts: [
        part(1, "body", 0x04001010, 1, 2, 0, 1),
        part(2, "beak", 0x04001220, 1, 2, 0, 1),
        part(3, "left foot", 0x040012E0, 2, 15),
        part(5, "right foot", 0x040012E0, 2, 18, 1),
    ],
    stateChanges: [
        { order: 0, kind: "load-two-tiles", paletteAddresses: [0x04001730, 0x04001750], textureAddress: 0x04001330 },
        { order: 4, kind: "set-cull-mode", mode: "front" },
    ],
};

export const KING_PENGUIN_STATIC_RECIPE: AnimalModelRecipe = {
    ...PENGUIN_STATIC_RECIPE, animalId: 64, species: "KING_PENGUIN",
    pose: { sample: {
        ...PENGUIN_STATIC_RECIPE.pose.sample,
        // Source scale=2 also changes B975C to 300 and C23F8 to 203.
        jointPositions: {
            0: { x: 0, z: 0, y: 300 },
            1: { x: 0, z: 0, y: 600 }, 2: { x: 0, z: 0, y: 0 },
            15: { x: -85, z: 183, y: 0 }, 18: { x: 85, z: 183, y: 0 },
        },
        scaleInputs: { outerMatrixAxis16_16: [0x8000, 0x8000, 0x8000] },
    } },
    parts: [
        part(1, "body", 0x04001010, 1, 2, 0, 1),
        part(2, "beak", 0x04001220, 1, 2, 0, 1),
        part(3, "crown", 0x04001890, 1, 2, 0, 1),
        part(4, "left foot", 0x040012E0, 2, 15),
        part(6, "right foot", 0x040012E0, 2, 18, 1),
    ],
    stateChanges: [
        PENGUIN_STATIC_RECIPE.stateChanges[0],
        { order: 5, kind: "set-cull-mode", mode: "front" },
    ],
};

export const KING_PENGUIN_DEACTIVATED_RECIPE: AnimalModelRecipe = {
    ...KING_PENGUIN_STATIC_RECIPE,
    pose: { sample: {
        ...KING_PENGUIN_STATIC_RECIPE.pose.sample,
        // Full-strength DB670 target D_803B4218; shared bone lengths, king outer scale.
        jointPositions: {
            0: { x: 0, z: 0, y: 90 },
            1: { x: -143, z: 25, y: 59 }, 2: { x: 148, z: 0, y: 105 },
            15: { x: 83, z: 230, y: 37 }, 18: { x: 247, z: 13, y: 332 },
        },
    } },
};
