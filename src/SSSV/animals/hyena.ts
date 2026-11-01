import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x13000 }, mirror, orientationMode: 0 };
}

export const HYENA_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 57, species: "HYENA", biomeSegment: 3, eyes: "eyes6",
    pose: { sample: {
        // Standing B9130(475,296,1128,296), BD40C, B964C, C4A70(712,475,0), C56D0(40).
        jointPositions: {
            0: { x: 0, z: 0, y: 832 },
            1: { x: 0, z: 475, y: 1127 }, 2: { x: 0, z: -475, y: 1127 },
            3: { x: -296, z: 475, y: 1127 }, 4: { x: 296, z: 475, y: 1127 },
            5: { x: -296, z: -475, y: 1127 }, 6: { x: 296, z: -475, y: 1127 },
            7: { x: -296, z: 475, y: 593 }, 8: { x: -296, z: 475, y: 237 }, 9: { x: -296, z: 475, y: 0 },
            10: { x: 296, z: 475, y: 593 }, 11: { x: 296, z: 475, y: 237 }, 12: { x: 296, z: 475, y: 0 },
            13: { x: -296, z: -475, y: 474 }, 14: { x: -296, z: -475, y: 237 }, 15: { x: -296, z: -475, y: 0 },
            16: { x: 296, z: -475, y: 474 }, 17: { x: 296, z: -475, y: 237 }, 18: { x: 296, z: -475, y: 0 },
            19: { x: 0, z: 1161, y: 1297 }, 20: { x: 0, z: 1636, y: 1297 },
        },
        scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] }, eyeFrame: 0,
    } },
    parts: [
        part(1, "front body", 0x04006C50, 0, 1), part(2, "head", 0x040071C0, 19, 20),
        part(3, "rear body", 0x04006D70, 0, 2),
        // Tick-zero jaw offset is -44; subsequent attachments use the unmodified head.
        { ...part(4, "jaw", 0x040073C0, 19, 20), jointOverrides: { to: { x: 0, z: 1636, y: 1253 } } },
        part(5, "back", 0x040076E0, 2, 1), part(6, "neck", 0x040074B0, 1, 19),
        part(7, "front left upper leg", 0x04006EE0, 3, 7), part(8, "rear left upper leg", 0x04006AC0, 5, 13),
        part(9, "front left lower leg", 0x04006E30, 7, 8), part(10, "rear left lower leg", 0x040069D0, 13, 14),
        part(12, "front right upper leg", 0x04006EE0, 4, 10, 1), part(13, "rear right upper leg", 0x04006AC0, 6, 16, 1),
        part(14, "front right lower leg", 0x04006E30, 10, 11, 1), part(15, "rear right lower leg", 0x040069D0, 16, 17, 1),
        part(16, "front left foot", 0x04008650, 8, 9), part(17, "rear left foot", 0x040068F0, 14, 15),
        part(18, "front right foot", 0x04008650, 11, 12, 1), part(19, "rear right foot", 0x040068F0, 17, 18, 1),
        part(21, "left eye", 0x04007A20, 19, 20), part(23, "right eye", 0x04007A40, 19, 20),
    ],
    stateChanges: [
        { order: 0, kind: "load-tile", textureAddress: 0x04007780, paletteAddress: 0x04007980 },
        { order: 11, kind: "set-cull-mode", mode: "front" },
        { order: 20, kind: "load-eye-palette-frame", textureAddress: 0x010025A0, paletteAddress: 0x01002C40 },
        { order: 22, kind: "load-eye-palette-frame", textureAddress: 0x010025A0, paletteAddress: 0x01002C40 },
    ],
};
