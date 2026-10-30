import type { AnimalModelRecipe, AnimalPartAttachment } from "../animal_contracts.js";
import { HYENA_STATIC_RECIPE } from "./hyena.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x13000 }, mirror, orientationMode: 0 };
}

export const HYENA_BIKER_STATIC_RECIPE: AnimalModelRecipe = {
    ...HYENA_STATIC_RECIPE, animalId: 58, species: "HYENA_BIKER",
    pose: { sample: {
        ...HYENA_STATIC_RECIPE.pose.sample,
        // B9130/C1830(1543), B964C, shared head chain; wheel pairs collapse to X=0, root -=148.
        jointPositions: {
            0: { x: 0, z: 0, y: 1395 },
            1: { x: 0, z: 475, y: 1543 }, 2: { x: 0, z: -475, y: 1543 },
            7: { x: 0, z: 475, y: 1543 }, 8: { x: 0, z: 475, y: 0 },
            13: { x: 0, z: -475, y: 1543 }, 14: { x: 0, z: -475, y: 0 },
            19: { x: 0, z: 1161, y: 1713 }, 20: { x: 0, z: 1636, y: 1713 },
        },
    } },
    parts: [
        ...HYENA_STATIC_RECIPE.parts.slice(0, 3),
        // Fully replenished missile counters (8); zero suspension/velocity and unit exhaust pulses.
        part(4, "left missile", 0x040088F0, 2, 1), part(5, "right missile", 0x040088F0, 2, 1, 1),
        { ...part(6, "jaw", 0x040073C0, 19, 20), jointOverrides: { to: { x: 0, z: 1636, y: 1669 } } },
        part(7, "back", 0x040076E0, 2, 1), part(8, "neck", 0x040074B0, 1, 19),
        part(12, "front wheel", 0x04007CE0, 7, 8), part(13, "rear wheel", 0x04007B60, 13, 14),
        part(15, "front fork", 0x040080A0, 7, 8),
        part(16, "left exhaust", 0x04007EA0, 2, 1), part(17, "right exhaust", 0x04007EA0, 2, 1, 1),
        part(19, "left eye", 0x04007A20, 19, 20), part(21, "right eye", 0x04007A40, 19, 20),
    ],
    stateChanges: [
        HYENA_STATIC_RECIPE.stateChanges[0],
        { order: 9, kind: "set-primitive-color", rgba: [25, 25, 25, 255] },
        { order: 10, kind: "load-tile", textureAddress: 0x04008340, paletteAddress: 0x04008540 },
        { order: 11, kind: "apply-state-display-list", address: 0x010034C0, segment: 1 },
        { order: 14, kind: "load-tile", textureAddress: 0x04008120, paletteAddress: 0x04008320 },
        { order: 18, kind: "load-eye-palette-frame", textureAddress: 0x010025A0, paletteAddress: 0x01002C40 },
        { order: 20, kind: "load-eye-palette-frame", textureAddress: 0x010025A0, paletteAddress: 0x01002C40 },
    ],
};
