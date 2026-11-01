import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0, orientationMode: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x26800 }, mirror, orientationMode };
}

export const GORILLA_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 54, species: "GORILLA", biomeSegment: 3, eyes: "eyes6",
    pose: { sample: {
        // B9D20(902,721,902,481), C2D98(721,721), gorilla arms(902,902), C4A70(120,721,7).
        jointPositions: {
            0: { x: 0, z: 0, y: 1442 }, 1: { x: 0, z: 0, y: 2344 }, 2: { x: 0, z: 0, y: 540 },
            3: { x: -902, z: 0, y: 2344 }, 4: { x: 902, z: 0, y: 2344 },
            5: { x: -481, z: 0, y: 718 }, 6: { x: 481, z: 0, y: 718 },
            7: { x: -902, z: 0, y: 1446 }, 8: { x: -902, z: 0, y: 548 },
            10: { x: 902, z: 0, y: 1446 }, 11: { x: 902, z: 0, y: 548 },
            13: { x: -481, z: 0, y: 0 }, 14: { x: -481, z: 718, y: 0 },
            16: { x: 481, z: 0, y: 0 }, 17: { x: 481, z: 718, y: 0 },
            19: { x: 0, z: 0, y: 2464 }, 20: { x: 0, z: 721, y: 2464 },
        },
        scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] }, eyeFrame: 0,
    } },
    parts: [
        part(2, "head", 0x04004820, 19, 20), part(3, "body", 0x040044B0, 1, 2, 0, 1),
        part(5, "left upper arm", 0x04004F30, 3, 7), part(6, "left forearm", 0x04004DE0, 7, 8),
        part(7, "left upper leg", 0x04004FF0, 5, 13), part(8, "left foot", 0x04004A50, 13, 14),
        // At tick zero all three standing hand pulses evaluate to full size.
        part(9, "left hand detail A", 0x04004B20, 7, 8), part(10, "left hand detail B", 0x04004BB0, 7, 8), part(11, "left hand detail C", 0x04004C40, 7, 8),
        part(13, "right upper arm", 0x04004F30, 4, 10, 1), part(14, "right forearm", 0x04004DE0, 10, 11, 1),
        part(15, "right upper leg", 0x04004FF0, 6, 16, 1), part(16, "right foot", 0x04004A50, 16, 17, 1),
        part(17, "right hand detail A", 0x04004B20, 10, 11, 1), part(18, "right hand detail B", 0x04004BB0, 10, 11, 1), part(19, "right hand detail C", 0x04004C40, 10, 11, 1),
        part(22, "left eye", 0x04004CB0, 19, 20), part(24, "right eye", 0x04004D10, 19, 20),
    ],
    stateChanges: [
        { order: 0, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
        { order: 1, kind: "set-primitive-color", rgba: [230, 135, 176, 255] },
        { order: 4, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
        { order: 12, kind: "set-cull-mode", mode: "front" },
        { order: 20, kind: "load-eye-palette-frame", textureAddress: 0x010025A0, paletteAddress: 0x01002C40 },
        { order: 21, kind: "apply-state-display-list", address: 0x010037F0, segment: 1 },
        { order: 23, kind: "load-eye-palette-frame", textureAddress: 0x010025A0, paletteAddress: 0x01002C40 },
        { order: 25, kind: "apply-state-display-list", address: 0x01003840, segment: 1 },
    ],
};
