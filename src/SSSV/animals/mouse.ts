import type { AnimalModelRecipe, AnimalPartAttachment } from "../animal_contracts.js";
import { RACING_FOX_STATIC_RECIPE } from "./fox.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 0x04, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x2800 }, mirror, orientationMode: 0 };
}

export const RACING_MOUSE_STATIC_RECIPE: AnimalModelRecipe = {
    eyes: "eyes5",
    animalId: 18, species: "RACING_MOUSE",
    pose: {
        ...RACING_FOX_STATIC_RECIPE.pose,
        sample: {
            ...RACING_FOX_STATIC_RECIPE.pose.sample,
            jointPositions: {
                0: { x: 0, z: 0, y: 234 },
                1: { x: 0, z: 187, y: 234 }, 2: { x: 0, z: -125, y: 234 },
                3: { x: -70, z: 125, y: 234 }, 4: { x: 70, z: 125, y: 234 },
                5: { x: -70, z: -125, y: 234 }, 6: { x: 70, z: -125, y: 234 },
                7: { x: -70, z: 125, y: 156 }, 8: { x: -70, z: 125, y: 0 },
                10: { x: 70, z: 125, y: 156 }, 11: { x: 70, z: 125, y: 0 },
                13: { x: -70, z: -125, y: 156 }, 14: { x: -70, z: -125, y: 0 },
                16: { x: 70, z: -125, y: 156 }, 17: { x: 70, z: -125, y: 0 },
                19: { x: 0, z: 187, y: 421 }, 20: { x: 0, z: 405, y: 421 },
                22: { x: -187, z: 187, y: 608 }, 23: { x: 187, z: 187, y: 608 },
            },
        },
    },
    parts: [
        { ...part(0, "body", 0x04006040, 2, 1), jointOverrides: { to: { x: 0, z: 125, y: 234 } } },
        part(1, "head", 0x04005A50, 1, 20),
        part(2, "front left wheel", 0x04005CA0, 7, 8, 0),
        part(3, "front right wheel", 0x04005CA0, 10, 11),
        part(4, "rear left wheel", 0x04005CA0, 13, 14),
        part(5, "rear right wheel", 0x04005CA0, 16, 17, 0),
        part(6, "left ear", 0x040053D0, 19, 22),
        part(7, "right ear", 0x040053D0, 19, 23, 1),
        part(9, "left eye", 0x04006B00, 1, 20, 0),
        part(11, "right eye", 0x04006B60, 1, 20, 0),
    ],
    stateChanges: RACING_FOX_STATIC_RECIPE.stateChanges.filter(c => c.kind === "load-eye-palette-frame")
        .map((c, i) => ({ ...c, order: 8 + i * 2 })),
};

export const RACING_MOUSE_DEACTIVATED_RECIPE: AnimalModelRecipe = {
    ...RACING_MOUSE_STATIC_RECIPE,
    pose: {
        ...RACING_MOUSE_STATIC_RECIPE.pose,
        sample: {
            ...RACING_MOUSE_STATIC_RECIPE.pose.sample,
            jointPositions: {
                0: { x: 0, z: 0, y: 330 },
                1: { x: 0, z: 187, y: 330 }, 2: { x: 0, z: -125, y: 330 },
                3: { x: -138, z: 125, y: 344 }, 4: { x: 140, z: 125, y: 330 },
                5: { x: -140, z: -125, y: 330 }, 6: { x: 139, z: -125, y: 334 },
                7: { x: -194, z: 107, y: 295 }, 8: { x: -194, z: 107, y: 139 },
                10: { x: 207, z: 149, y: 302 }, 11: { x: 292, z: 198, y: 183 },
                13: { x: -188, z: -169, y: 289 }, 14: { x: -96, z: -188, y: 167 },
                16: { x: 166, z: -194, y: 316 }, 17: { x: 166, z: -194, y: 160 },
                19: { x: 0, z: 187, y: 517 }, 20: { x: 0, z: 201, y: 300 },
                22: { x: -345, z: 210, y: 378 }, 23: { x: 287, z: 187, y: 277 },
            },
            eyeFrame: 4,
        },
    },
    parts: RACING_MOUSE_STATIC_RECIPE.parts.map(p => p.name === "body" ? { ...p, jointOverrides: { to: { x: 0, z: 125, y: 330 } } } : p),
    stateChanges: RACING_MOUSE_STATIC_RECIPE.stateChanges.map(c => c.kind === "load-eye-palette-frame"
        ? { ...c, textureAddress: c.textureAddress + 4 * 128 } : c),
};
