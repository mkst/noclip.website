import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 2 = 0, orientationMode: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 1, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x6400 }, mirror, orientationMode };
}

export const EVO_MICROCHIP_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 61, species: "EVO_MICROCHIP", biomeSegment: "shared", eyes: "standard",
    pose: {
        sample: {
            // State 2, flat support, zero gait phase and no limb gestures/blend.
            jointPositions: {
                0: { x: 0, z: 0, y: 117 },
                1: { x: 0, z: 156, y: 117 }, 2: { x: 0, z: -156, y: 117 },
                3: { x: -87, z: 156, y: 117 }, 4: { x: 87, z: 156, y: 117 },
                5: { x: -87, z: -156, y: 117 }, 6: { x: 87, z: -156, y: 117 },
                7: { x: -87, z: 156, y: -39 }, 10: { x: 87, z: 156, y: -39 },
                8: { x: -87, z: 52, y: 117 }, 11: { x: 87, z: 52, y: 117 },
                9: { x: -87, z: 52, y: -39 }, 12: { x: 87, z: 52, y: -39 },
                14: { x: -87, z: -52, y: 117 }, 17: { x: 87, z: -52, y: 117 },
                15: { x: -87, z: -52, y: -39 }, 18: { x: 87, z: -52, y: -39 },
                13: { x: -87, z: -156, y: -39 }, 16: { x: 87, z: -156, y: -39 },
            },
            scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] },
            eyeFrame: 0,
        },
    },
    parts: [
        part(1, "body", 0x01004D90, 1, 2),
        part(3, "front left pin", 0x01004CC0, 3, 7, 0, 1),
        part(4, "middle front left pin", 0x01004CC0, 8, 9, 0, 1),
        part(5, "middle rear left pin", 0x01004CC0, 14, 15, 0, 1),
        part(6, "rear left pin", 0x01004CC0, 5, 13, 0, 1),
        part(8, "front right pin", 0x01004CC0, 4, 10, 2, 1),
        part(9, "middle front right pin", 0x01004CC0, 11, 12, 2, 1),
        part(10, "middle rear right pin", 0x01004CC0, 17, 18, 2, 1),
        part(11, "rear right pin", 0x01004CC0, 6, 16, 2, 1),
        part(13, "left eye", 0x01004E60, 1, 2),
        part(15, "right eye", 0x01004E80, 1, 2),
    ],
    stateChanges: [
        { order: 0, kind: "load-hilite" },
        { order: 2, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
        { order: 7, kind: "set-cull-mode", mode: "front" },
        { order: 12, kind: "load-eye-palette-frame", paletteAddress: 0x01000CC0, textureAddress: 0x01000620 },
        { order: 14, kind: "load-eye-palette-frame", paletteAddress: 0x01000CC0, textureAddress: 0x01000620 },
    ],
};
