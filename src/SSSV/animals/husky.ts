import type { AnimalModelRecipe, AnimalPartAttachment } from "../animal_contracts.js";

export function huskyPart(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x11800 }, mirror, orientationMode: 0 };
}

export const HUSKY_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 40, species: "HUSKY", biomeSegment: 1, eyes: "eyes5-tlut2",
    pose: {
        sample: {
            // B9130(246,92,710,109), BD40C with three-link lengths 273/273/164,
            // B964C, C4A70(32,218,6), BB938(246): settled state 2 on flat support.
            jointPositions: {
                0: { x: 0, z: 0, y: 601 },
                1: { x: 0, z: 246, y: 710 }, 2: { x: 0, z: -246, y: 710 },
                3: { x: -92, z: 246, y: 710 }, 4: { x: 92, z: 246, y: 710 },
                5: { x: -92, z: -246, y: 710 }, 6: { x: 92, z: -246, y: 710 },
                7: { x: -92, z: 246, y: 437 }, 8: { x: -92, z: 246, y: 164 }, 9: { x: -92, z: 246, y: 0 },
                10: { x: 92, z: 246, y: 437 }, 11: { x: 92, z: 246, y: 164 }, 12: { x: 92, z: 246, y: 0 },
                13: { x: -92, z: -246, y: 437 }, 14: { x: -92, z: -246, y: 164 }, 15: { x: -92, z: -246, y: 0 },
                16: { x: 92, z: -246, y: 437 }, 17: { x: 92, z: -246, y: 164 }, 18: { x: 92, z: -246, y: 0 },
                19: { x: 0, z: 246, y: 742 }, 20: { x: 0, z: 464, y: 742 },
                26: { x: 0, z: -438, y: 1010 },
            },
            scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] },
            eyeFrame: 0,
        },
    },
    parts: [
        huskyPart(1, "body", 0x04004AE0, 2, 1), huskyPart(2, "head", 0x04004E60, 19, 20),
        huskyPart(4, "front left upper leg", 0x04003C90, 3, 7), huskyPart(5, "rear left upper leg", 0x04003C90, 5, 13),
        huskyPart(6, "front left lower leg", 0x04003BD0, 7, 8), huskyPart(7, "rear left lower leg", 0x04003BD0, 13, 14),
        huskyPart(9, "front right upper leg", 0x04003C90, 4, 10, 1), huskyPart(10, "rear right upper leg", 0x04003C90, 6, 16, 1),
        huskyPart(11, "front right lower leg", 0x04003BD0, 10, 11, 1), huskyPart(12, "rear right lower leg", 0x04003BD0, 16, 17, 1),
        huskyPart(15, "front left foot", 0x04003AE0, 8, 9), huskyPart(16, "rear left foot", 0x04003AE0, 14, 15),
        huskyPart(18, "front right foot", 0x04003AE0, 11, 12, 1), huskyPart(19, "rear right foot", 0x04003AE0, 17, 18, 1),
        huskyPart(21, "left eye", 0x04005500, 19, 20), huskyPart(23, "right eye", 0x04005520, 19, 20),
    ],
    stateChanges: [
        { order: 0, kind: "load-tile", textureAddress: 0x04005260, paletteAddress: 0x04005460 },
        { order: 3, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
        { order: 8, kind: "set-cull-mode", mode: "front" },
        { order: 13, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
        { order: 14, kind: "set-primitive-color", rgba: [255, 255, 255, 255] },
        { order: 17, kind: "set-cull-mode", mode: "front" },
        { order: 20, kind: "load-eye-palette-frame", textureAddress: 0x01002100, paletteAddress: 0x01000CC0 },
        { order: 22, kind: "load-eye-palette-frame", textureAddress: 0x01002100, paletteAddress: 0x01000CC0 },
    ],
};
