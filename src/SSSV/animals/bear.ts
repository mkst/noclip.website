import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x29800 }, mirror, orientationMode: 0 };
}

export const BEAR_STATIC_RECIPE: AnimalModelRecipe = {
    eyes: "eyes6",
    animalId: 22, species: "BEAR",
    pose: {
        sample: {
            // bear.c, state 2, level support, no action/blend or ambient limb/head gestures:
            // B9A5C(1296), C23F8(1556), update_limbs_bear(1037,2334), C652C(129,778).
            jointPositions: {
                0: { x: 0, z: 0, y: 1296 },
                1: { x: 0, z: 0, y: 2592 }, 2: { x: 0, z: 0, y: 0 },
                7: { x: 1037, z: 0, y: 2592 }, 8: { x: 1037, z: 0, y: 258 },
                10: { x: -1037, z: 0, y: 2592 }, 11: { x: -1037, z: 0, y: 258 },
                15: { x: -656, z: 1410, y: 0 }, 18: { x: 656, z: 1410, y: 0 },
                19: { x: 0, z: 43, y: 2712 }, 20: { x: 0, z: 821, y: 2712 },
            },
            scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] },
            eyeFrame: 0,
        },
    },
    parts: [
        part(0, "body", 0x040082C0, 1, 2),
        part(2, "head", 0x04007BC0, 1, 20),
        part(4, "front left leg", 0x04007EC0, 2, 15),
        part(6, "front right leg", 0x04007EC0, 2, 18, 1),
        part(8, "rear left leg", 0x040077C0, 7, 8),
        part(11, "rear right leg", 0x040077C0, 10, 11, 1),
        part(14, "left eye", 0x04008490, 1, 20),
        part(16, "right eye", 0x040084A8, 1, 20),
    ],
    stateChanges: [
        { order: 1, kind: "load-tile", paletteAddress: 0x010226B0, textureAddress: 0x010224B0 },
        { order: 3, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
        { order: 5, kind: "set-cull-mode", mode: "front" },
        { order: 7, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
        { order: 9, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
        { order: 10, kind: "set-cull-mode", mode: "front" },
        { order: 12, kind: "load-eye-palette-frame", paletteAddress: 0x01002C40, textureAddress: 0x010025A0 },
        { order: 13, kind: "apply-state-display-list", address: 0x010037F0, segment: 1 },
        { order: 15, kind: "load-eye-palette-frame", paletteAddress: 0x01002C40, textureAddress: 0x010025A0 },
        { order: 17, kind: "apply-state-display-list", address: 0x01003840, segment: 1 },
    ],
};

export const CRAZY_BEAR_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 23, species: "CRAZY_BEAR",
    pose: {
        sample: {
            // State 2, flat support, no blend/limb gestures; arms and split jaw held at tick 0.
            jointPositions: {
                0: { x: 0, z: 0, y: 1296 },
                1: { x: 0, z: 0, y: 2592 }, 2: { x: 0, z: 0, y: 0 },
                7: { x: 1037, z: 0, y: 2592 }, 8: { x: 1037, z: 54, y: 4916 },
                10: { x: -1037, z: 0, y: 2592 }, 11: { x: -1037, z: 0, y: 258 },
                15: { x: -656, z: 1410, y: 0 }, 18: { x: 656, z: 1410, y: 0 },
                19: { x: 0, z: 43, y: 2712 }, 20: { x: 0, z: 821, y: 2664 },
                27: { x: 0, z: 821, y: 2760 },
            },
            scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] },
            eyeFrame: 0,
        },
    },
    parts: [
        part(0, "body", 0x040082C0, 1, 2),
        part(2, "head", 0x04008A20, 1, 20),
        part(3, "jaw", 0x04008E30, 1, 27),
        part(4, "front left leg", 0x04007EC0, 2, 15),
        part(6, "front right leg", 0x04007EC0, 2, 18, 1),
        part(7, "rear left leg", 0x040077C0, 7, 8),
        part(9, "rear right leg", 0x040077C0, 10, 11, 1),
    ],
    stateChanges: [
        { order: 1, kind: "load-tile", paletteAddress: 0x010226B0, textureAddress: 0x010224B0 },
        { order: 5, kind: "set-cull-mode", mode: "front" },
        { order: 8, kind: "set-cull-mode", mode: "front" },
    ],
};

export const MYSTERY_BEAR_STATIC_RECIPE: AnimalModelRecipe = {
    eyes: "eyes6",
    animalId: 24, species: "MYSTERY_BEAR",
    pose: {
        sample: {
            // bear.c normal state-2 path at global tick 0, zero velocity/wobble,
            // flat support and aligned head; the initial sample for tick animation.
            jointPositions: {
                0: { x: 0, z: 0, y: 2722 },
                1: { x: 0, z: 0, y: 4018 }, 2: { x: 0, z: 0, y: 1426 },
                7: { x: 1037, z: 0, y: 4018 }, 8: { x: 1037, z: 1932, y: 2714 },
                10: { x: -1037, z: 0, y: 4018 }, 11: { x: -1037, z: 2324, y: 4018 },
                19: { x: 0, z: 43, y: 4138 }, 20: { x: 0, z: 821, y: 4138 },
                26: { x: 0, z: 0, y: 0 }, 27: { x: 0, z: 0, y: 1426 },
            },
            scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] },
            eyeFrame: 0,
        },
    },
    parts: [
        part(0, "body", 0x040082C0, 1, 2),
        part(2, "head", 0x04007BC0, 1, 20),
        part(3, "rear left leg", 0x040077C0, 7, 8),
        part(5, "rear right leg", 0x040077C0, 10, 11, 1),
        part(6, "wheel", 0x04009540, 27, 26),
        part(9, "left eye", 0x04008490, 1, 20),
        part(11, "right eye", 0x040084A8, 1, 20),
    ],
    stateChanges: [
        { order: 1, kind: "load-tile", paletteAddress: 0x010226B0, textureAddress: 0x010224B0 },
        { order: 4, kind: "set-cull-mode", mode: "front" },
        { order: 7, kind: "load-eye-palette-frame", paletteAddress: 0x01002C40, textureAddress: 0x010025A0 },
        { order: 8, kind: "apply-state-display-list", address: 0x010037F0, segment: 1 },
        { order: 10, kind: "load-eye-palette-frame", paletteAddress: 0x01002C40, textureAddress: 0x010025A0 },
        { order: 12, kind: "apply-state-display-list", address: 0x01003840, segment: 1 },
    ],
};
