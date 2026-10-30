import type { AnimalModelRecipe, AnimalPartAttachment } from "../animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x10000 }, mirror: 0, orientationMode: 0 };
}

export const COOL_COD_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 66, species: "COOL_COD", biomeSegment: 1, eyes: "standard-tlut4",
    pose: { sample: {
        // 302E50(500,500,500), zero swim controls/pitch; stats.footHeight=15.
        jointPositions: {
            0: { x: 0, z: 747, y: 480 }, 1: { x: 0, z: 249, y: 480 },
            2: { x: 0, z: -249, y: 480 }, 3: { x: 0, z: -747, y: 480 },
        },
        scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] }, eyeFrame: 0,
    } },
    parts: [
        part(1, "head", 0x04007500, 0, 1), part(2, "body", 0x040077E0, 1, 2),
        part(3, "tail", 0x04007AE0, 2, 3),
        part(5, "left eye", 0x04007E70, 1, 0), part(7, "right eye", 0x04007E90, 1, 0),
    ],
    stateChanges: [
        { order: 0, kind: "load-tile", textureAddress: 0x04007BD0, paletteAddress: 0x04007DD0 },
        { order: 4, kind: "load-eye-palette-frame", textureAddress: 0x01000620, paletteAddress: 0x01000D00 },
        { order: 6, kind: "load-eye-palette-frame", textureAddress: 0x01000620, paletteAddress: 0x01000D00 },
    ],
};
