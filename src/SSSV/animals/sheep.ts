import type { AnimalModelRecipe, AnimalPartAttachment } from "../animal_contracts.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 0x04, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x13000 }, mirror, orientationMode: 0 };
}

export const SHEEP_STATIC_RECIPE: AnimalModelRecipe = {
    eyes: "standard",
    animalId: 33,
    species: "SHEEP",
    pose: {
        sample: {
            jointPositions: {
                0: { x: 0, z: 0, y: 831 },
                1: { x: 0, z: 178, y: 831 }, 2: { x: 0, z: -178, y: 831 },
                3: { x: -118, z: 178, y: 831 }, 4: { x: 118, z: 178, y: 831 },
                5: { x: -118, z: -178, y: 831 }, 6: { x: 118, z: -178, y: 831 },
                7: { x: -118, z: 178, y: 0 }, 10: { x: 118, z: 178, y: 0 },
                13: { x: -118, z: -178, y: 0 }, 16: { x: 118, z: -178, y: 0 },
                26: { x: 0, z: 0, y: 1424 }, 27: { x: 0, z: 0, y: 238 },
            },
            scaleInputs: {
                outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000],
            },
            eyeFrame: 0,
        },
    },
    parts: [
        part(0, "body", 0x04002D90, 26, 27, 0),
        part(1, "head", 0x040036B0, 26, 27),
        part(2, "rear left leg", 0x04003580, 3, 7),
        part(3, "front left leg", 0x04003580, 5, 13, 0),
        part(5, "rear right leg", 0x04003580, 4, 10, 1),
        part(6, "front right leg", 0x04003580, 6, 16, 1),
        part(8, "left eye", 0x040037A0, 26, 27),
        part(10, "right eye", 0x040037C0, 26, 27),
    ],
    stateChanges: [
        { order: 4, kind: "set-cull-mode", mode: "front" },
        { order: 7, kind: "load-eye-palette-frame", paletteAddress: 0x01000CC0, textureAddress: 0x01000620 },
        { order: 9, kind: "load-eye-palette-frame", paletteAddress: 0x01000CC0, textureAddress: 0x01000620 },
    ],
};

export const SPRINGY_STATIC_RECIPE: AnimalModelRecipe = {
    ...SHEEP_STATIC_RECIPE,
    animalId: 35, species: "SPRINGY_THINGY",
    pose: {
        ...SHEEP_STATIC_RECIPE.pose,
        sample: {
            ...SHEEP_STATIC_RECIPE.pose.sample,
            jointPositions: {
                0: { x: 0, z: 0, y: 1602 },
                1: { x: 0, z: 0, y: 2195 },
                2: { x: 0, z: 0, y: 1009 },
                14: { x: 0, z: 0, y: 0 },
                15: { x: 0, z: 0, y: 0 },
            },
        },
    },
    parts: [
        part(0, "spring", 0x040039E0, 2, 14, 0),
        part(1, "body", 0x04002D90, 1, 2, 0),
        part(2, "head", 0x040036B0, 1, 2),
        part(4, "left eye", 0x040037A0, 1, 2),
        part(6, "right eye", 0x040037C0, 1, 2),
    ],
    stateChanges: SHEEP_STATIC_RECIPE.stateChanges.filter(change => change.kind === "load-eye-palette-frame")
        .map((change, i) => ({ ...change, order: 3 + i * 2 })),
};

export const SPRINGY_DEACTIVATED_RECIPE: AnimalModelRecipe = {
    ...SPRINGY_STATIC_RECIPE,
    pose: {
        ...SPRINGY_STATIC_RECIPE.pose,
        sample: {
            ...SPRINGY_STATIC_RECIPE.pose.sample,
            jointPositions: {
                0: { x: 0, z: -80, y: 570 },
                1: { x: 0, z: -654, y: 711 },
                2: { x: 0, z: 475, y: 369 },
                14: { x: 0, z: 1420, y: 27 },
            },
            eyeFrame: 12,
        },
    },
    parts: SPRINGY_STATIC_RECIPE.parts.map(p => p.name === "body" ? { ...p, address: 0x040032E8 } : p),
    stateChanges: SPRINGY_STATIC_RECIPE.stateChanges.map(change => change.kind === "load-eye-palette-frame"
        ? { ...change, textureAddress: change.textureAddress + 12 * 128 }
        : change),
};

function ramRecipe(base: AnimalModelRecipe, animalId: 34 | 36, species: "RAM" | "SPRINGY_RAM"): AnimalModelRecipe {
    return {
        ...base, animalId, species,
        parts: base.parts.filter(p => !p.name.endsWith("eye")).map(p => p.name === "head" ? { ...p, address: 0x04003DE0 } : p),
        stateChanges: base.stateChanges.filter(c => c.kind !== "load-eye-palette-frame"),
    };
}

export const RAM_STATIC_RECIPE = ramRecipe(SHEEP_STATIC_RECIPE, 34, "RAM");
export const SPRINGY_RAM_STATIC_RECIPE = ramRecipe(SPRINGY_STATIC_RECIPE, 36, "SPRINGY_RAM");
