import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x10000 }, mirror: 0, orientationMode: 0 };
}

export const FLYING_DOG_STATIC_RECIPE: AnimalModelRecipe = {
    eyes: "standard-tlut4",
    animalId: 5, species: "FLYING_DOG",
    pose: {
        sample: {
            // BAA38(300,150), C4A70(556,443,0), BB70(300,700): zero pitch/bank,
            // aligned head yaw, no action, ambient displacement or collision correction.
            jointPositions: {
                0: { x: 0, z: 0, y: 896 },
                1: { x: 0, z: 300, y: 896 }, 2: { x: 0, z: -300, y: 896 },
                19: { x: 0, z: 488, y: 1417 }, 20: { x: 0, z: 931, y: 1417 },
                23: { x: 1000, z: 0, y: 896 }, 25: { x: -1000, z: 0, y: 896 },
            },
            scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] },
            eyeFrame: 0,
        },
    },
    parts: [
        part(1, "body", 0x040001A0, 2, 1),
        part(2, "head", 0x04000DD0, 19, 20),
        part(4, "neck", 0x04001220, 1, 19),
        // The source uses 0x34 displacement while paused instead of its random sample.
        { ...part(5, "neck detail", 0x04001320, 1, 19), jointOverrides: { from: { x: 0, z: 300, y: 844 } } },
        part(7, "left wing", 0x040018B0, 0, 23),
        part(8, "right wing", 0x040018B0, 0, 25),
        part(10, "left eye", 0x04001A20, 19, 20),
        part(12, "right eye", 0x04001A40, 19, 20),
    ],
    stateChanges: [
        { order: 0, kind: "load-tile", paletteAddress: 0x04001C60, textureAddress: 0x04001A60 },
        { order: 3, kind: "set-primitive-color", rgba: [255, 255, 0, 255] },
        { order: 6, kind: "load-wing-tiles", paletteAddresses: [0x040024B0, 0x040024D0], textureAddress: 0x04001EB0 },
        { order: 9, kind: "load-eye-palette-frame", paletteAddress: 0x01000D00, textureAddress: 0x01000620 },
        { order: 11, kind: "load-eye-palette-frame", paletteAddress: 0x01000D00, textureAddress: 0x01000620 },
    ],
};
