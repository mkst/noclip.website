import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0xE800 }, mirror, orientationMode: 0 };
}

export const TORTOISE_TANK_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 27, species: "TORTOISE_TANK", biomeSegment: 3,
    pose: { sample: {
        // Flat B9130(453,308,498,0), C1830(498), B964C; zero recoil/aim/track phase.
        jointPositions: {
            0: { x: 0, z: 0, y: 498 },
            1: { x: 0, z: 453, y: 498 }, 2: { x: 0, z: -453, y: 498 },
            8: { x: -308, z: 453, y: 0 }, 11: { x: 308, z: 453, y: 0 },
            14: { x: -308, z: -453, y: 0 }, 17: { x: 308, z: -453, y: 0 },
            // 032DC's zero-angle 255/256 cosine still rounds the head/neck attachments.
            26: { x: 0, z: 451, y: 499 }, 27: { x: 0, z: -452, y: 499 },
        },
        scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] }, eyeFrame: 0,
    } },
    parts: [
        part(1, "body", 0x04002D70, 2, 1),
        part(2, "left shell", 0x04003140, 2, 1), part(3, "right shell", 0x04003140, 2, 1, 1),
        { ...part(4, "neck", 0x04003030, 2, 1), jointOverrides: { from: { x: 0, z: -452, y: 499 }, to: { x: 0, z: 451, y: 499 } } },
        part(5, "head", 0x040041D0, 27, 26),
        part(7, "left tread", 0x040032B0, 8, 14), part(8, "right tread", 0x040032B0, 11, 17),
        part(10, "left track panels", 0x040037C0, 8, 14), part(11, "right track panels", 0x040037C0, 11, 17),
    ],
    stateChanges: [
        { order: 0, kind: "load-tile", textureAddress: 0x04003850, paletteAddress: 0x04003A50 },
        { order: 6, kind: "load-tile", textureAddress: 0x0103AA20, paletteAddress: 0x0103AC20 },
        { order: 9, kind: "load-track-panels", textureAddress: 0x0103AC40, paletteAddress: 0x0103B440 },
    ],
};
