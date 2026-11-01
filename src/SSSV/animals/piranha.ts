import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x10000 }, mirror: 0, orientationMode: 0 };
}

export const PIRANHA_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 30, species: "PIRANHA", biomeSegment: 3, eyes: "standard",
    pose: {
        sample: {
            // 302E50(10,1000,500), zero swim controls/pitch; footHeight 18.
            jointPositions: {
                0: { x: 0, z: 507, y: 576 }, 1: { x: 0, z: 498, y: 576 },
                2: { x: 0, z: -498, y: 576 }, 3: { x: 0, z: -996, y: 576 },
            },
            scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] },
            eyeFrame: 0,
        },
    },
    parts: [
        {
            ...part(1, "head", 0x0400BD00, 1, 2),
            // Source breathing displacement at tick 0, sp76 = 4; restored before the eyes.
            jointOverrides: { from: { x: 0, z: 498, y: 583 }, to: { x: 0, z: -498, y: 571 } },
        },
        {
            ...part(2, "jaw", 0x0400C010, 1, 2),
            jointOverrides: { from: { x: 0, z: 513, y: 499 }, to: { x: 0, z: -483, y: 637 } },
        },
        part(4, "tail", 0x0400C170, 2, 3),
        part(6, "left eye", 0x0400C240, 1, 2),
        part(8, "right eye", 0x0400C260, 1, 2),
    ],
    stateChanges: [
        { order: 0, kind: "load-two-tiles", paletteAddresses: [0x0400C480, 0x0400C6A0], textureAddress: 0x0400C280 },
        { order: 3, kind: "load-tile", paletteAddress: 0x0400C8C0, textureAddress: 0x0400C6C0 },
        { order: 5, kind: "load-eye-palette-frame", paletteAddress: 0x01000CC0, textureAddress: 0x01000620 },
        { order: 7, kind: "load-eye-palette-frame", paletteAddress: 0x01000CC0, textureAddress: 0x01000620 },
    ],
};
