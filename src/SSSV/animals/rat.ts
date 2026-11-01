import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";
import { RACING_MOUSE_STATIC_RECIPE } from "./mouse.js";

function ratRecipe(animalId: 32 | 13, species: "RAT" | "KING_RAT", size: 1 | 2): AnimalModelRecipe {
    const part = (order: number, name: string, address: number, from: number, to: number): AnimalPartAttachment => ({
        order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to },
        scale: { kind: "unit-16.16", value: 0xD000 }, mirror: 0, orientationMode: 0,
    });
    return {
        eyes: "primitive",
        animalId, species,
        pose: {
            ...RACING_MOUSE_STATIC_RECIPE.pose,
            sample: {
                ...RACING_MOUSE_STATIC_RECIPE.pose.sample,
                jointPositions: {
                    0: { x: 0, z: 0, y: 365 }, 1: { x: 0, z: 203, y: 365 }, 2: { x: 0, z: -203, y: 365 },
                    3: { x: -162, z: 203, y: 365 }, 4: { x: 162, z: 203, y: 365 },
                    5: { x: -162, z: -203, y: 365 }, 6: { x: 162, z: -203, y: 365 },
                    7: { x: -162, z: 203, y: 284 }, 8: { x: -162, z: 203, y: 0 },
                    10: { x: 162, z: 203, y: 284 }, 11: { x: 162, z: 203, y: 0 },
                    13: { x: -162, z: -203, y: 284 }, 14: { x: -162, z: -203, y: 0 },
                    16: { x: 162, z: -203, y: 284 }, 17: { x: 162, z: -203, y: 0 },
                },
                scaleInputs: {
                    ...RACING_MOUSE_STATIC_RECIPE.pose.sample.scaleInputs,
                    outerMatrixAxis16_16: [size * 0x4000, size * 0x4000, size * 0x4000],
                },
            },
        },
        parts: [
            part(2, "body", 0x04007080, 2, 1),
            part(5, "front left wheel", 0x040072F0, 7, 8), part(6, "front right wheel", 0x040072F0, 10, 11),
            part(7, "rear left wheel", 0x040072F0, 13, 14), part(8, "rear right wheel", 0x040072F0, 16, 17),
            ...(size === 2 ? [part(9, "crown", 0x04007520, 2, 1)] : []),
            part(11, "left eye", 0x040073B0, 2, 1), part(12, "right eye", 0x040073D8, 2, 1),
        ],
        stateChanges: [
            { order: 0, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
            { order: 1, kind: "set-primitive-color", rgba: [255, 128, 128, 255] },
            { order: 3, kind: "apply-state-display-list", address: 0x01003618, segment: 1 },
            { order: 4, kind: "set-primitive-color", rgba: [20, 20, 20, 255] },
            { order: 10, kind: "set-primitive-color", rgba: [255, 0, 0, 255] },
        ],
    };
}

export const RAT_STATIC_RECIPE = ratRecipe(32, "RAT", 1);
export const KING_RAT_STATIC_RECIPE = ratRecipe(13, "KING_RAT", 2);
