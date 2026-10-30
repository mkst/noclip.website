import type { AnimalModelRecipe, AnimalPartAttachment } from "../animal_contracts.js";

export function createRacingDogRecipes(dog: AnimalModelRecipe): [AnimalModelRecipe, AnimalModelRecipe] {
    const part = (order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment => ({
        order, name, address, segment: 4, sourceVertexAxes: true,
        joints: { from, to }, scale: { kind: "unit-16.16", value: 0x10000 }, mirror, orientationMode: 0,
    });
    const standing: AnimalModelRecipe = {
        ...dog, animalId: 4, species: "RACING_DOG",
        pose: {
            ...dog.pose,
            sample: {
                ...dog.pose.sample,
                jointPositions: {
                    0: { x: 0, z: 0, y: 900 }, 1: { x: 0, z: 300, y: 900 }, 2: { x: 0, z: -300, y: 900 },
                    3: { x: -150, z: 300, y: 900 }, 4: { x: 150, z: 300, y: 900 },
                    5: { x: -150, z: -300, y: 900 }, 6: { x: 150, z: -300, y: 900 },
                    7: { x: -150, z: 300, y: 600 }, 8: { x: -150, z: 300, y: 0 },
                    10: { x: 150, z: 300, y: 600 }, 11: { x: 150, z: 300, y: 0 },
                    13: { x: -150, z: -300, y: 600 }, 14: { x: -150, z: -300, y: 0 },
                    16: { x: 150, z: -300, y: 600 }, 17: { x: 150, z: -300, y: 0 },
                    19: { x: 0, z: 488, y: 1421 }, 20: { x: 0, z: 931, y: 1421 },
                },
            },
        },
        parts: [
            part(1, "body", 0x04000420, 2, 1),
            part(2, "left missile pod", 0x04002720, 2, 1), part(3, "right missile pod", 0x04002720, 2, 1, 1),
            part(4, "head", 0x04000870, 19, 20), part(5, "back detail", 0x040013A0, 2, 1), part(6, "neck", 0x04001220, 1, 19),
            part(7, "front left wheel", 0x040014F0, 7, 8), part(8, "front right wheel", 0x040014F0, 10, 11, 1),
            part(9, "rear left wheel", 0x040014F0, 13, 14), part(10, "rear right wheel", 0x040014F0, 16, 17, 1),
            part(12, "left eye", 0x04001A20, 19, 20), part(14, "right eye", 0x04001A40, 19, 20),
        ],
        stateChanges: [
            ...dog.stateChanges.filter(c => c.kind === "load-tile").map(c => ({ ...c, order: 0 })),
            ...dog.stateChanges.filter(c => c.kind === "load-eye-palette-frame").map((c, i) => ({ ...c, order: 11 + i * 2 })),
        ],
    };
    const deactivated: AnimalModelRecipe = {
        ...standing,
        pose: {
            ...standing.pose,
            sample: {
                ...standing.pose.sample, eyeFrame: 12,
                jointPositions: {
                    0: { x: 0, z: 0, y: 330 }, 1: { x: 0, z: 298, y: 321 }, 2: { x: 0, z: -300, y: 330 },
                    3: { x: -144, z: 273, y: 346 }, 4: { x: 122, z: 319, y: 404 },
                    5: { x: -144, z: -325, y: 355 }, 6: { x: 150, z: -300, y: 330 },
                    7: { x: -422, z: 352, y: 275 }, 8: { x: -893, z: 622, y: 32 },
                    10: { x: 353, z: 462, y: 283 }, 11: { x: 866, z: 757, y: 223 },
                    13: { x: -416, z: -372, y: 244 }, 14: { x: -861, z: -772, y: 244 },
                    16: { x: 405, z: -186, y: 229 }, 17: { x: 266, z: -752, y: 353 },
                    19: { x: 0, z: 827, y: 161 }, 20: { x: 75, z: 1184, y: 408 },
                },
            },
        },
        stateChanges: standing.stateChanges.map(c => c.kind === "load-eye-palette-frame" ? { ...c, textureAddress: c.textureAddress + 12 * 128 } : c),
    };
    return [standing, deactivated];
}
