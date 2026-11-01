import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x28000 }, mirror, orientationMode: 0 };
}

export const ELEPHANT_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 56, species: "ELEPHANT", biomeSegment: 3, eyes: "eyes5",
    pose: { sample: {
        // Flat state 2: B9130(625,562,2875,100), rigid limbs, C4A70(250,750,8), C56D0(55).
        jointPositions: {
            0: { x: 0, z: 0, y: 2775 }, 1: { x: 0, z: 625, y: 2775 }, 2: { x: 0, z: -625, y: 2775 },
            3: { x: -562, z: 625, y: 2775 }, 4: { x: 562, z: 625, y: 2775 },
            5: { x: -562, z: -625, y: 2775 }, 6: { x: 562, z: -625, y: 2775 },
            7: { x: -562, z: 625, y: -100 }, 10: { x: 562, z: 625, y: -100 },
            13: { x: -562, z: -625, y: -100 }, 16: { x: 562, z: -625, y: -100 },
            19: { x: 0, z: 868, y: 2829 }, 20: { x: 0, z: 1618, y: 2829 },
        },
        scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] }, eyeFrame: 0,
    } },
    parts: [
        part(0, "body", 0x040053F0, 2, 1), part(1, "head", 0x04005B10, 19, 20), part(2, "rear tail", 0x04006130, 2, 1),
        part(5, "front left leg", 0x04005FB0, 3, 7), part(6, "rear left leg", 0x04005FB0, 5, 13),
        part(8, "front right leg", 0x04005FB0, 4, 10, 1), part(9, "rear right leg", 0x04005FB0, 6, 16, 1),
        part(11, "left eye", 0x04006380, 19, 20), part(13, "right eye", 0x040063A0, 19, 20),
    ],
    stateChanges: [
        { order: 3, kind: "load-two-tiles", paletteAddresses: [0x040067C0, 0x040067E0], textureAddress: 0x040063C0 },
        { order: 4, kind: "apply-state-display-list", address: 0x010034C0, segment: 1 },
        { order: 7, kind: "set-cull-mode", mode: "front" },
        { order: 10, kind: "load-eye-palette-frame", textureAddress: 0x01002100, paletteAddress: 0x01000CA0 },
        { order: 12, kind: "load-eye-palette-frame", textureAddress: 0x01002100, paletteAddress: 0x01000CA0 },
    ],
};
