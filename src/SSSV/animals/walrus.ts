import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x18800 }, mirror, orientationMode: 0 };
}

export const WALRUS_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 44, species: "WALRUS", biomeSegment: 1,
    pose: {
        sample: {
            // Flat state-2 support, aligned head, no ambient gestures; charged missiles and propeller roll 0.
            jointPositions: {
                0: { x: 0, z: 0, y: 765 },
                1: { x: 0, z: 574, y: 765 }, 2: { x: 0, z: -574, y: 765 },
                3: { x: -306, z: 574, y: 765 }, 4: { x: 306, z: 574, y: 765 },
                5: { x: -306, z: -574, y: 765 }, 6: { x: 306, z: -574, y: 765 },
                8: { x: -306, z: 574, y: 0 }, 11: { x: 306, z: 574, y: 0 },
                14: { x: -306, z: -574, y: 0 }, 17: { x: 306, z: -574, y: 0 },
                19: { x: 0, z: 574, y: 1626 }, 20: { x: 0, z: 1186, y: 1626 },
                26: { x: 0, z: 574, y: 0 },
            },
            scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] },
            eyeFrame: 0,
        },
    },
    parts: [
        part(1, "body", 0x04005E50, 1, 2),
        part(3, "head", 0x04006860, 19, 20),
        part(4, "left missile", 0x040070F0, 2, 1),
        part(5, "right missile", 0x040070F0, 2, 1, 1),
        part(6, "rear support", 0x040062D0, 1, 26),
        part(7, "left flipper", 0x04006170, 5, 14),
        part(9, "right flipper", 0x04006170, 6, 17, 1),
        part(10, "propeller", 0x04006B80, 1, 2),
    ],
    stateChanges: [
        { order: 0, kind: "set-primitive-color", rgba: [92, 92, 215, 255] },
        { order: 2, kind: "load-tile", paletteAddress: 0x04006DE0, textureAddress: 0x04006BD0 },
        { order: 8, kind: "set-cull-mode", mode: "front" },
    ],
};

const RACE_RECIPES = [[92, 170, 121, 255], [200, 140, 0, 255]].map((rgba): AnimalModelRecipe => ({
    ...WALRUS_STATIC_RECIPE,
    stateChanges: WALRUS_STATIC_RECIPE.stateChanges.map(change => change.kind === "set-primitive-color" ? { ...change, rgba: rgba as [number, number, number, number] } : change),
}));

export function getWalrusStaticRecipe(textureBank: number, placementIndex: number): AnimalModelRecipe {
    // The initial chip occupies slot 0; authored records 0/1 become race rivals in slots 1/2.
    return textureBank === 4 && placementIndex >= 0 && placementIndex < 2 ? RACE_RECIPES[placementIndex] : WALRUS_STATIC_RECIPE;
}
