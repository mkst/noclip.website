import type { AnimalModelRecipe, AnimalPartAttachment } from "../animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 0x04, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0xE800 }, mirror, orientationMode: 0 };
}

export const FOX_STATIC_RECIPE: AnimalModelRecipe = {
    eyes: "eyes5",
    animalId: 6, species: "FOX",
    pose: {
        sample: {
            jointPositions: {
                0: { x: 0, z: 0, y: 400 },
                1: { x: 0, z: 390, y: 400 }, 2: { x: 0, z: -390, y: 400 },
                3: { x: -150, z: 390, y: 400 }, 4: { x: 150, z: 390, y: 400 },
                5: { x: -150, z: -390, y: 400 }, 6: { x: 150, z: -390, y: 400 },
                7: { x: -150, z: 390, y: -100 }, 10: { x: 150, z: 390, y: -100 },
                13: { x: -150, z: -390, y: -100 }, 16: { x: 150, z: -390, y: -100 },
                19: { x: 0, z: 593, y: 962 }, 20: { x: 0, z: 993, y: 962 },
                26: { x: 12, z: -1253, y: 400 },
            },
            scaleInputs: {
                outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000],
            },
            eyeFrame: 0,
        },
    },
    parts: [
        part(0, "head", 0x04004D10, 1, 20),
        part(1, "body", 0x04004090, 1, 2),
        part(2, "tail", 0x04004200, 2, 26),
        part(3, "front left leg", 0x04004330, 3, 7),
        part(4, "rear left leg", 0x04004330, 5, 13),
        part(6, "front right leg", 0x04004330, 4, 10, 1),
        part(7, "rear right leg", 0x04004330, 6, 16, 1),
        part(10, "left eye", 0x040046D0, 1, 20),
        part(12, "right eye", 0x040046F0, 1, 20),
    ],
    stateChanges: [
        { order: 5, kind: "set-cull-mode", mode: "front" },
        { order: 8, kind: "load-eye-palette-frame", paletteAddress: 0x01000CA0, textureAddress: 0x01002100 },
        { order: 9, kind: "apply-state-display-list", address: 0x010037F0, segment: 0x01 },
        { order: 11, kind: "load-eye-palette-frame", paletteAddress: 0x01000CA0, textureAddress: 0x01002100 },
        { order: 13, kind: "apply-state-display-list", address: 0x01003840, segment: 0x01 },
    ],
};

export const RACING_FOX_STATIC_RECIPE: AnimalModelRecipe = {
    ...FOX_STATIC_RECIPE,
    animalId: 26, species: "RACING_FOX",
    pose: {
        ...FOX_STATIC_RECIPE.pose,
        sample: {
            ...FOX_STATIC_RECIPE.pose.sample,
            jointPositions: {
                0: { x: 0, z: 0, y: 500 },
                1: { x: 0, z: 390, y: 500 }, 2: { x: 0, z: -390, y: 500 },
                3: { x: -150, z: 390, y: 500 }, 4: { x: 150, z: 390, y: 500 },
                5: { x: -150, z: -390, y: 500 }, 6: { x: 150, z: -390, y: 500 },
                7: { x: -150, z: 390, y: 400 }, 8: { x: -150, z: 390, y: 0 }, 9: { x: -150, z: 390, y: 0 },
                10: { x: 150, z: 390, y: 400 }, 11: { x: 150, z: 390, y: 0 }, 12: { x: 150, z: 390, y: 0 },
                13: { x: -150, z: -390, y: 400 }, 14: { x: -150, z: -390, y: 0 }, 15: { x: -150, z: -390, y: 0 },
                16: { x: 150, z: -390, y: 400 }, 17: { x: 150, z: -390, y: 0 }, 18: { x: 150, z: -390, y: 0 },
                19: { x: 0, z: 593, y: 1062 }, 20: { x: 0, z: 993, y: 1062 },
                26: { x: 12, z: -1253, y: 500 },
            },
        },
    },
    parts: [
        ...FOX_STATIC_RECIPE.parts.slice(0, 3),
        part(3, "front left wheel", 0x04004590, 7, 8),
        part(4, "front right wheel", 0x04004590, 10, 11),
        part(5, "rear left wheel", 0x04004590, 13, 14),
        part(6, "rear right wheel", 0x04004590, 16, 17),
        ...FOX_STATIC_RECIPE.parts.slice(-2),
    ],
    stateChanges: FOX_STATIC_RECIPE.stateChanges.filter(change => change.kind !== "set-cull-mode"),
};

export const RACING_FOX_DEACTIVATED_RECIPE: AnimalModelRecipe = {
    ...RACING_FOX_STATIC_RECIPE,
    pose: {
        ...RACING_FOX_STATIC_RECIPE.pose,
        sample: {
            ...RACING_FOX_STATIC_RECIPE.pose.sample,
            // Held full-strength ANIM_BLEND_DEACTIVATE: fox.c's racing-fox
            // D_803A466C/4680/4694 skeleton and D_803A46B8 target (DB670, strength 32).
            jointPositions: {
                0: { x: 0, z: 0, y: 490 },
                1: { x: 0, z: 390, y: 490 }, 2: { x: 0, z: -390, y: 490 },
                3: { x: -139, z: 366, y: 536 }, 4: { x: 119, z: 410, y: 577 },
                5: { x: -142, z: -414, y: 525 }, 6: { x: 149, z: -390, y: 499 },
                7: { x: -233, z: 392, y: 519 }, 8: { x: -560, z: 580, y: 396 },
                10: { x: 197, z: 459, y: 544 }, 11: { x: 540, z: 656, y: 532 },
                13: { x: -234, z: -430, y: 495 }, 14: { x: -529, z: -695, y: 521 },
                16: { x: 236, z: -351, y: 472 }, 17: { x: 172, z: -720, y: 607 },
                19: { x: 327, z: 809, y: 761 }, 20: { x: 393, z: 1124, y: 995 },
                26: { x: -86, z: -1239, y: 341 },
            },
            eyeFrame: 4,
        },
    },
    stateChanges: RACING_FOX_STATIC_RECIPE.stateChanges.map(change => change.kind === "load-eye-palette-frame"
        ? { ...change, textureAddress: change.textureAddress + 4 * 128 } : change),
};
