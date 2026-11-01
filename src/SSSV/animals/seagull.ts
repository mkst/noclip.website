import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x14000 }, mirror, orientationMode: 0 };
}

export const SEAGULL_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 0, species: "SEAGULL", biomeSegment: 1, eyes: "standard-tlut1",
    pose: { sample: {
        // Normal helpers at tick 0, aligned head, no gestures, carrying, attack or blend.
        jointPositions: {
            0: { x: 0, z: 0, y: 812 },
            1: { x: 0, z: 312, y: 812 }, 2: { x: 0, z: -312, y: 812 },
            3: { x: -250, z: 0, y: 0 }, 4: { x: 250, z: 0, y: 0 },
            5: { x: 0, z: 0, y: 0 }, 27: { x: 0, z: 0, y: 0 },
            7: { x: -464, z: 214, y: 0 }, 8: { x: -250, z: 312, y: 0 }, 9: { x: -36, z: 214, y: 0 },
            10: { x: 36, z: 214, y: 0 }, 11: { x: 250, z: 312, y: 0 }, 12: { x: 464, z: 214, y: 0 },
            13: { x: -250, z: -312, y: 0 }, 14: { x: 250, z: -312, y: 0 },
            19: { x: 0, z: 48, y: 1371 }, 20: { x: 0, z: 423, y: 1371 },
            22: { x: 1125, z: 0, y: 812 }, 24: { x: -1125, z: 0, y: 812 },
            26: { x: 0, z: -1015, y: 1066 },
        },
        scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] }, eyeFrame: 0,
    } },
    parts: [
        part(0, "body", 0x04001D70, 1, 2),
        part(2, "head", 0x04001F80, 19, 20), part(3, "tail", 0x040021C0, 2, 26),
        part(4, "left wing", 0x04002320, 0, 22), part(5, "right wing", 0x04002320, 0, 24, 1),
        part(7, "left rear toe", 0x040025D0, 3, 13),
        part(8, "left outer toe", 0x04002410, 3, 7), part(9, "left middle toe", 0x04002410, 3, 8), part(10, "left inner toe", 0x04002410, 3, 9),
        part(11, "right rear toe", 0x040025D0, 4, 14),
        part(12, "right inner toe", 0x04002410, 4, 10), part(13, "right middle toe", 0x04002410, 4, 11), part(14, "right outer toe", 0x04002410, 4, 12),
        part(15, "left webbing", 0x04002090, 3, 5), part(16, "right webbing", 0x04002090, 4, 27),
        part(18, "left eye", 0x040024F0, 19, 20), part(20, "right eye", 0x04002510, 19, 20),
    ],
    stateChanges: [
        { order: 1, kind: "set-primitive-color", rgba: [125, 51, 255, 255] },
        { order: 6, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
        { order: 17, kind: "load-eye-palette-frame", paletteAddress: 0x01000CA0, textureAddress: 0x01000620 },
        { order: 19, kind: "load-eye-palette-frame", paletteAddress: 0x01000CA0, textureAddress: 0x01000620 },
    ],
};
