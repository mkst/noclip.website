import type { AnimalModelRecipe, AnimalPartAttachment } from "../animal_contracts.js";
import { TORTOISE_TANK_STATIC_RECIPE } from "./tortoise_tank.js";

function part(order: number, name: string, address: number, from: number, to: number, value: 0xE800 | 0x12200 = 0xE800): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value }, mirror: 0, orientationMode: 0 };
}

export const RACING_TORTOISE_STATIC_RECIPE: AnimalModelRecipe = {
    ...TORTOISE_TANK_STATIC_RECIPE, animalId: 28, species: "RACING_TORTOISE",
    pose: { sample: {
        ...TORTOISE_TANK_STATIC_RECIPE.pose.sample,
        // Rear support +271, root +135; C18FC(362,634), B964C, C5EF4(181,362), zero wheelie input.
        jointPositions: {
            0: { x: 0, z: 0, y: 633 },
            1: { x: 0, z: 453, y: 498 }, 2: { x: 0, z: -453, y: 769 },
            7: { x: -308, z: 453, y: 362 }, 8: { x: -308, z: 453, y: 0 },
            10: { x: 308, z: 453, y: 362 }, 11: { x: 308, z: 453, y: 0 },
            13: { x: -308, z: -453, y: 634 }, 14: { x: -308, z: -453, y: 0 },
            16: { x: 308, z: -453, y: 634 }, 17: { x: 308, z: -453, y: 0 },
            19: { x: 0, z: 453, y: 679 }, 20: { x: 0, z: 815, y: 679 },
        },
    } },
    parts: [
        ...TORTOISE_TANK_STATIC_RECIPE.parts.slice(0, 3),
        part(4, "head", 0x040033C0, 1, 20), part(6, "head detail", 0x04003530, 1, 20),
        part(9, "front left wheel", 0x04003650, 7, 8), part(10, "front right wheel", 0x04003650, 10, 11),
        part(11, "rear left wheel", 0x04003650, 13, 14, 0x12200), part(12, "rear right wheel", 0x04003650, 16, 17, 0x12200),
    ],
    stateChanges: [
        TORTOISE_TANK_STATIC_RECIPE.stateChanges[0],
        { order: 5, kind: "set-cull-mode", mode: "none" },
        { order: 7, kind: "load-tile", textureAddress: 0x04003E70, paletteAddress: 0x04004070, clamp: true },
        { order: 8, kind: "apply-state-display-list", address: 0x010034C0, segment: 1 },
    ],
};
