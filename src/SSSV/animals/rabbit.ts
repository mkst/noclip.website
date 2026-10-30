import type { AnimalModelRecipe, AnimalPartAttachment } from "../animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x10000 }, mirror, orientationMode: 0 };
}

export const RABBIT_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 10, species: "RABBIT", biomeSegment: 1, eyes: "eyes2-tlut4",
    pose: { sample: {
        // Flat B96D0(375), C1A88(825), C5EF4(450,300); calm ear timer 120.
        jointPositions: {
            0: { x: 0, z: 0, y: 375 }, 1: { x: 0, z: 0, y: 750 }, 2: { x: 0, z: 0, y: 0 },
            15: { x: -280, z: 773, y: 0 }, 18: { x: 280, z: 773, y: 0 },
            19: { x: 0, z: 0, y: 1200 }, 20: { x: 0, z: 300, y: 1200 },
            // Active C6FF4 assembly keeps bases at head height; disabled C adds 600.
            26: { x: -150, z: 0, y: 1200 }, 27: { x: -150, z: 16, y: 1792 },
            28: { x: 150, z: 0, y: 1200 }, 29: { x: 150, z: 16, y: 1792 },
        },
        scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] }, eyeFrame: 0,
    } },
    parts: [
        part(0, "body", 0x040000E0, 1, 2), part(1, "body detail", 0x04000900, 1, 2),
        part(2, "left foot", 0x040002D0, 2, 15), part(3, "right foot", 0x040002D0, 2, 18, 1),
        part(4, "head", 0x040005A0, 1, 19),
        part(5, "left ear", 0x040001F0, 26, 27), part(6, "right ear", 0x040001F0, 28, 29, 1),
        part(8, "left eye", 0x04000AE0, 1, 19), part(10, "right eye", 0x04000B40, 1, 19),
    ],
    stateChanges: [
        { order: 7, kind: "load-eye-palette-frame", textureAddress: 0x01000D20, paletteAddress: 0x01000D00 },
        { order: 9, kind: "load-eye-palette-frame", textureAddress: 0x01000D20, paletteAddress: 0x01000D00 },
    ],
};

export const HELI_RABBIT_STATIC_RECIPE: AnimalModelRecipe = {
    ...RABBIT_STATIC_RECIPE, animalId: 11, species: "HELI_RABBIT",
    pose: { sample: { ...RABBIT_STATIC_RECIPE.pose.sample, jointPositions: {
        0: { x: 0, z: 0, y: 375 }, 1: { x: 0, z: 0, y: 750 }, 2: { x: 0, z: 0, y: 0 },
        15: { x: -280, z: 773, y: 0 }, 18: { x: 280, z: 773, y: 0 },
        19: { x: 0, z: 0, y: 1200 }, 20: { x: 0, z: 300, y: 1200 },
    } } },
    parts: [
        // The rotor replaces both ears; unk30C roll is held at zero.
        part(0, "rotor", 0x04000840, 1, 2), part(1, "body", 0x040000E0, 1, 2),
        part(2, "body detail", 0x04000900, 1, 2), part(3, "head", 0x040005A0, 1, 19),
        part(4, "left foot", 0x040002D0, 2, 15), part(5, "right foot", 0x040002D0, 2, 18, 1),
        part(8, "left eye", 0x04000AE0, 1, 19), part(10, "right eye", 0x04000B40, 1, 19),
    ],
};
