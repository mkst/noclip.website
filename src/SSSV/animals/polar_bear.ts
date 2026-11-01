import type { AnimalModelRecipe, AnimalPartAttachment } from "./animal_contracts.js";
import type { AnimalJoint } from "./animal_matrix.js";

function part(order: number, name: string, address: number, from: number, to: number, mirror: 0 | 1 = 0): AnimalPartAttachment {
    return { order, name, address, segment: 4, sourceVertexAxes: true, joints: { from, to }, scale: { kind: "unit-16.16", value: 0x26400 }, mirror, orientationMode: 0 };
}

function pose(tank: boolean): AnimalModelRecipe["pose"] {
    const y = tank ? 836 : 789, width = tank ? 537 : 239;
    const jointPositions: Record<number, AnimalJoint> = {
        0: { x: 0, z: 0, y }, 1: { x: 0, z: 478, y }, 2: { x: 0, z: -478, y },
        3: { x: -width, z: 478, y }, 4: { x: width, z: 478, y },
        5: { x: -width, z: -478, y }, 6: { x: width, z: -478, y },
        7: { x: -width, z: 478, y: tank ? 717 : -47 },
        10: { x: width, z: 478, y: tank ? 717 : -47 },
        13: { x: -width, z: -478, y: tank ? 717 : -47 },
        16: { x: width, z: -478, y: tank ? 717 : -47 },
        19: { x: 0, z: 597, y }, 20: { x: 0, z: 1075, y },
    };
    if (tank) for (const [joint, x, z] of [[8, -width, 478], [11, width, 478], [14, -width, -478], [17, width, -478]])
        jointPositions[joint] = { x, z, y: 0 };
    // B9130, rigid bear legs / C1830 tank supports, B964C, C58E4(119,478).
    return { sample: { jointPositions, scaleInputs: { outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000] }, eyeFrame: 0 } };
}

export const POLAR_BEAR_STATIC_RECIPE: AnimalModelRecipe = {
    animalId: 38, species: "POLAR_BEAR", biomeSegment: 1, eyes: "eyes5",
    pose: pose(false),
    parts: [
        part(0, "body", 0x04002C30, 2, 1), part(1, "head", 0x04003250, 19, 20),
        part(4, "front left leg", 0x040034B0, 3, 7), part(5, "rear left leg", 0x040034B0, 5, 13),
        part(7, "front right leg", 0x040034B0, 4, 10, 1), part(8, "rear right leg", 0x040034B0, 6, 16, 1),
        part(10, "left eye", 0x04003740, 19, 20), part(12, "right eye", 0x04003760, 19, 20),
    ],
    stateChanges: [
        { order: 2, kind: "set-primitive-color", rgba: [20, 20, 20, 255] },
        { order: 3, kind: "apply-state-display-list", address: 0x01003548, segment: 1 },
        { order: 6, kind: "set-cull-mode", mode: "front" },
        { order: 9, kind: "load-eye-palette-frame", textureAddress: 0x01002100, paletteAddress: 0x01000CA0 },
        { order: 11, kind: "load-eye-palette-frame", textureAddress: 0x01002100, paletteAddress: 0x01000CA0 },
    ],
};

export const POLAR_TANK_STATIC_RECIPE: AnimalModelRecipe = {
    ...POLAR_BEAR_STATIC_RECIPE, animalId: 39, species: "POLAR_TANK", pose: pose(true),
    parts: [
        part(0, "body", 0x04002C30, 2, 1), part(1, "head", 0x04003250, 19, 20),
        part(3, "left tread", 0x04003880, 8, 14), part(4, "right tread", 0x04003880, 11, 17),
        part(6, "left track panels", 0x04003630, 8, 14), part(7, "right track panels", 0x04003630, 11, 17),
        part(9, "left eye", 0x04003740, 19, 20), part(11, "right eye", 0x04003760, 19, 20),
    ],
    stateChanges: [
        { order: 2, kind: "load-tile", textureAddress: 0x0103AA20, paletteAddress: 0x0103AC20 },
        { order: 5, kind: "load-track-panels", textureAddress: 0x0103AC40, paletteAddress: 0x0103B440 },
        { order: 8, kind: "load-eye-palette-frame", textureAddress: 0x01002100, paletteAddress: 0x01000CA0 },
        { order: 10, kind: "load-eye-palette-frame", textureAddress: 0x01002100, paletteAddress: 0x01000CA0 },
    ],
};
