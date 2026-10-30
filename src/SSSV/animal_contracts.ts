import { ELEPHANT_STATIC_RECIPE } from "./animals/elephant.js";
import { RACING_TORTOISE_STATIC_RECIPE } from "./animals/racing_tortoise.js";
import { HYENA_BIKER_STATIC_RECIPE } from "./animals/hyena_biker.js";
import { TORTOISE_TANK_STATIC_RECIPE } from "./animals/tortoise_tank.js";
import { GORILLA_STATIC_RECIPE } from "./animals/gorilla.js";
import { HYENA_STATIC_RECIPE } from "./animals/hyena.js";
import { COOL_COD_STATIC_RECIPE } from "./animals/cool_cod.js";
import { RABBIT_STATIC_RECIPE, HELI_RABBIT_STATIC_RECIPE } from "./animals/rabbit.js";
import { SKI_HUSKY_STATIC_RECIPE, CRAZY_HUSKY_STATIC_RECIPE } from "./animals/husky_variants.js";
import { POLAR_BEAR_STATIC_RECIPE, POLAR_TANK_STATIC_RECIPE } from "./animals/polar_bear.js";
import { SHEEP_STATIC_RECIPE, SPRINGY_STATIC_RECIPE, SPRINGY_DEACTIVATED_RECIPE, RAM_STATIC_RECIPE, SPRINGY_RAM_STATIC_RECIPE } from "./animals/sheep.js";
import { FOX_STATIC_RECIPE, RACING_FOX_STATIC_RECIPE, RACING_FOX_DEACTIVATED_RECIPE } from "./animals/fox.js";
import { RACING_MOUSE_STATIC_RECIPE, RACING_MOUSE_DEACTIVATED_RECIPE } from "./animals/mouse.js";
import { createRacingDogRecipes } from "./animals/racing_dog.js";
import { RAT_STATIC_RECIPE, KING_RAT_STATIC_RECIPE } from "./animals/rat.js";
import { BEAR_STATIC_RECIPE } from "./animals/bear.js";
import { FLYING_DOG_STATIC_RECIPE } from "./animals/flying_dog.js";
import { FIRE_FOX_STATIC_RECIPE } from "./animals/fire_fox.js";
import { PENGUIN_STATIC_RECIPE, KING_PENGUIN_STATIC_RECIPE, KING_PENGUIN_DEACTIVATED_RECIPE } from "./animals/penguin.js";
import { HUSKY_STATIC_RECIPE } from "./animals/husky.js";
import type { AnimalEyeFamily } from "./animal_eyes.js";
import type { LevelAnimalPlacement } from "./level.js";
import type { AnimalJoint } from "./animal_matrix.js";

export type AnimalHealthClass = "positive" | "zero" | "negative";
export type AnimalSpawnMovementMode = "injured" | "deactivated";

export function classifyAnimalHealth(health: number): AnimalHealthClass {
    return health > 0 ? "positive" : health < 0 ? "negative" : "zero";
}

export function getSpawnMovementMode(health: number): AnimalSpawnMovementMode {
    return health > 0 ? "injured" : "deactivated";
}

export interface IndexedAnimalPlacement {
    placementIndex: number;
    placement: Readonly<LevelAnimalPlacement>;
}

export function indexAnimalPlacements(placements: readonly LevelAnimalPlacement[]): IndexedAnimalPlacement[] {
    return placements.map((placement, placementIndex) => ({ placementIndex, placement }));
}

export interface CanonicalAnimalPose {
    sample: {
        jointPositions: Readonly<Record<number, AnimalJoint>>;
        scaleInputs: {
            outerMatrixAxis16_16: [number, number, number];
        };
        eyeFrame: 0 | 4 | 12;
    };
}

export type AnimalSourceSegment = 0x01 | 0x04;

export type AnimalPartScale =
    | { kind: "shared-body-scale" }
    | { kind: "shared-head-scale" }
    | { kind: "unit-16.16"; value: 0x10000 | 0x13000 | 0xE800 | 0x2800 | 0xD000 | 0x29800 | 0x12200 | 0x11800 | 0x26400 | 0x26800 | 0x28000 };

export interface AnimalPartAttachment {
    order: number;
    name: string;
    address: number;
    segment: AnimalSourceSegment;
    sourceVertexAxes: true;
    joints: { from: number; to: number };
    jointOverrides?: { from?: AnimalJoint; to?: AnimalJoint };
    scale: AnimalPartScale;
    mirror: 0 | 1 | 2 | 3;
    orientationMode: 0 | 1;
}

export type AnimalRenderStateChange =
    | { order: number; kind: "load-track-panels"; paletteAddress: number; textureAddress: number }
    | { order: number; kind: "set-cull-mode"; mode: "front" | "back" | "none" }
    | { order: number; kind: "load-tile"; paletteAddress: number; textureAddress: number; clamp?: boolean }
    | { order: number; kind: "set-primitive-color"; rgba: [number, number, number, number] }
    | { order: number; kind: "apply-state-display-list"; address: number; segment: AnimalSourceSegment }
    | { order: number; kind: "load-wing-tiles" | "load-two-tiles"; paletteAddresses: [number, number]; textureAddress: number }
    | { order: number; kind: "load-eye-palette-frame"; paletteAddress: number; textureAddress: number };

export interface AnimalModelRecipe {
    eyes?: AnimalEyeFamily;
    animalId: number;
    species: string;
    // Existing recipes use Europe unless another segment-4 bank is specified.
    biomeSegment?: 0 | 1 | 3;
    pose: CanonicalAnimalPose;
    parts: AnimalPartAttachment[];
    stateChanges: AnimalRenderStateChange[];
}

const DOG_BODY_SCALE: AnimalPartScale = {
    kind: "shared-body-scale",
};
const DOG_PART_ADDRESSES: Readonly<Record<string, number>> = {
    dog_body: 0x04000420,
    dog_head: 0x04000870,
    dog_back_detail: 0x040013A0,
    dog_neck: 0x04001220,
    dog_upper_leg: 0x04000FB0,
    dog_lower_leg: 0x04001080,
    dog_foot: 0x04001150,
    dog_left_eye: 0x04001A20,
    dog_right_eye: 0x04001A40,
};
const DOG_HEAD_SCALE: AnimalPartScale = { kind: "shared-head-scale" };
const DOG_UNIT_SCALE: AnimalPartScale = { kind: "unit-16.16", value: 0x10000 };

function dogPart(
    order: number, name: string, displayList: string, joints: [number, number],
    scale: AnimalPartScale, mirror: 0 | 1,
): AnimalPartAttachment {
    return {
        order, name, address: DOG_PART_ADDRESSES[displayList], segment: 0x04, sourceVertexAxes: true,
        joints: { from: joints[0], to: joints[1] },
        scale, mirror,
        orientationMode: 0,
    };
}

function dogEye(order: number, name: string, displayList: string): AnimalPartAttachment {
    return dogPart(order, name, displayList, [19, 20], DOG_HEAD_SCALE, 0);
}

export const DOG_STATIC_RECIPE: AnimalModelRecipe = {
    eyes: "standard",
    animalId: 31,
    species: "DOG",
    pose: {
        sample: {
            jointPositions: {
                0: { x: 0, z: 0, y: 824 },
                1: { x: 0, z: 300, y: 974 },
                2: { x: 0, z: -300, y: 974 },
                3: { x: -150, z: 300, y: 974 },
                4: { x: 150, z: 300, y: 974 },
                5: { x: -150, z: -300, y: 974 },
                6: { x: 150, z: -300, y: 974 },
                7: { x: -150, z: 300, y: 500 },
                8: { x: -150, z: 300, y: 300 },
                9: { x: -150, z: 300, y: 0 },
                10: { x: 150, z: 300, y: 500 },
                11: { x: 150, z: 300, y: 300 },
                12: { x: 150, z: 300, y: 0 },
                13: { x: -150, z: -300, y: 500 },
                14: { x: -150, z: -300, y: 300 },
                15: { x: -150, z: -300, y: 0 },
                16: { x: 150, z: -300, y: 500 },
                17: { x: 150, z: -300, y: 300 },
                18: { x: 150, z: -300, y: 0 },
                19: { x: 0, z: 488, y: 1495 },
                20: { x: 0, z: 931, y: 1495 },
            },
            scaleInputs: {
                outerMatrixAxis16_16: [0x4000, 0x4000, 0x4000],
            },
            eyeFrame: 0,
        },
    },
    parts: [
        dogPart(1, "body", "dog_body", [2, 1], DOG_BODY_SCALE, 0),
        dogPart(2, "head", "dog_head", [19, 20], DOG_HEAD_SCALE, 0),
        dogPart(3, "back detail", "dog_back_detail", [2, 1], DOG_BODY_SCALE, 0),
        dogPart(5, "neck", "dog_neck", [1, 19], DOG_UNIT_SCALE, 0),
        dogPart(7, "front left upper leg", "dog_upper_leg", [3, 7], DOG_UNIT_SCALE, 0),
        dogPart(8, "front right upper leg", "dog_upper_leg", [4, 10], DOG_UNIT_SCALE, 0),
        dogPart(9, "rear left upper leg", "dog_upper_leg", [5, 13], DOG_UNIT_SCALE, 0),
        dogPart(10, "rear right upper leg", "dog_upper_leg", [6, 16], DOG_UNIT_SCALE, 0),
        dogPart(11, "front left lower leg", "dog_lower_leg", [7, 8], DOG_UNIT_SCALE, 0),
        dogPart(12, "front right lower leg", "dog_lower_leg", [10, 11], DOG_UNIT_SCALE, 0),
        dogPart(13, "rear left lower leg", "dog_lower_leg", [13, 14], DOG_UNIT_SCALE, 0),
        dogPart(14, "rear right lower leg", "dog_lower_leg", [16, 17], DOG_UNIT_SCALE, 0),
        dogPart(15, "front left foot", "dog_foot", [8, 9], DOG_UNIT_SCALE, 0),
        dogPart(16, "front right foot", "dog_foot", [11, 12], DOG_UNIT_SCALE, 0),
        dogPart(17, "rear left foot", "dog_foot", [14, 15], DOG_UNIT_SCALE, 0),
        dogPart(18, "rear right foot", "dog_foot", [17, 18], DOG_UNIT_SCALE, 0),
        dogEye(20, "left eye", "dog_left_eye"),
        dogEye(22, "right eye", "dog_right_eye"),
    ],
    stateChanges: [
        { order: 0, kind: "load-tile", paletteAddress: 0x04001E90, textureAddress: 0x04001C80 },
        { order: 4, kind: "set-primitive-color", rgba: [0x14, 0x14, 0x14, 0xFF] },
        { order: 6, kind: "apply-state-display-list", address: 0x01003548, segment: 0x01 },
        { order: 19, kind: "load-eye-palette-frame", paletteAddress: 0x01000CC0, textureAddress: 0x01000620 },
        { order: 21, kind: "load-eye-palette-frame", paletteAddress: 0x01000CC0, textureAddress: 0x01000620 },
    ],
};

// Full-strength func_802DB670 target from dog.h D_803A4D00_7B63B0.
// Evaluated with source integer sine values and truncating C division.
export const DOG_DEACTIVATED_RECIPE: AnimalModelRecipe = {
    ...DOG_STATIC_RECIPE,
    pose: {
        ...DOG_STATIC_RECIPE.pose,
        sample: {
            ...DOG_STATIC_RECIPE.pose.sample,
            jointPositions: {
                0: { x: 0, z: 10, y: 240 },
                1: { x: 0, z: 268, y: 388 },
                2: { x: 0, z: -225, y: 423 },
                3: { x: -137, z: 323, y: 392 },
                4: { x: 149, z: 268, y: 392 },
                5: { x: -149, z: -216, y: 423 },
                6: { x: 148, z: -234, y: 432 },
                7: { x: -213, z: 383, y: 854 },
                8: { x: -318, z: 443, y: 697 },
                9: { x: -541, z: 582, y: 557 },
                10: { x: 200, z: 330, y: 858 },
                11: { x: 320, z: 177, y: 824 },
                12: { x: 565, z: 317, y: 732 },
                13: { x: -569, z: -64, y: 277 },
                14: { x: -615, z: -252, y: 236 },
                15: { x: -725, z: -526, y: 266 },
                16: { x: 260, z: -691, y: 401 },
                17: { x: 156, z: -859, y: 414 },
                18: { x: 233, z: -1073, y: 222 },
                19: { x: 0, z: 784, y: 585 },
                20: { x: 0, z: 875, y: 153 },
            },
            eyeFrame: 12,
        },
    },
    stateChanges: DOG_STATIC_RECIPE.stateChanges.map(change => change.kind === "load-eye-palette-frame"
        ? { ...change, textureAddress: change.textureAddress + 12 * 128 }
        : change),
};

export const [RACING_DOG_STATIC_RECIPE, RACING_DOG_DEACTIVATED_RECIPE] = createRacingDogRecipes(DOG_STATIC_RECIPE);

export function getDogStaticRecipe(health: number): AnimalModelRecipe {
    return getSpawnMovementMode(health) === "deactivated" ? DOG_DEACTIVATED_RECIPE : DOG_STATIC_RECIPE;
}

export function getStaticAnimalRecipe(placement: Pick<LevelAnimalPlacement, "id" | "health">): AnimalModelRecipe | null {
    if (placement.id === DOG_STATIC_RECIPE.animalId) return getDogStaticRecipe(placement.health);
    if (placement.id === SHEEP_STATIC_RECIPE.animalId && placement.health > 0) return SHEEP_STATIC_RECIPE;
    if (placement.id === FOX_STATIC_RECIPE.animalId && placement.health > 0) return FOX_STATIC_RECIPE;
    if (placement.id === RACING_FOX_STATIC_RECIPE.animalId) return placement.health > 0 ? RACING_FOX_STATIC_RECIPE : RACING_FOX_DEACTIVATED_RECIPE;
    if (placement.id === SPRINGY_STATIC_RECIPE.animalId) return placement.health > 0 ? SPRINGY_STATIC_RECIPE : SPRINGY_DEACTIVATED_RECIPE;
    if (placement.id === RACING_MOUSE_STATIC_RECIPE.animalId) return placement.health > 0 ? RACING_MOUSE_STATIC_RECIPE : RACING_MOUSE_DEACTIVATED_RECIPE;
    if (placement.id === RACING_DOG_STATIC_RECIPE.animalId) return placement.health > 0 ? RACING_DOG_STATIC_RECIPE : RACING_DOG_DEACTIVATED_RECIPE;
    if (placement.id === RAM_STATIC_RECIPE.animalId && placement.health > 0) return RAM_STATIC_RECIPE;
    if (placement.id === SPRINGY_RAM_STATIC_RECIPE.animalId && placement.health > 0) return SPRINGY_RAM_STATIC_RECIPE;
    if (placement.id === RAT_STATIC_RECIPE.animalId && placement.health > 0) return RAT_STATIC_RECIPE;
    if (placement.id === KING_RAT_STATIC_RECIPE.animalId && placement.health > 0) return KING_RAT_STATIC_RECIPE;
    if (placement.id === BEAR_STATIC_RECIPE.animalId && placement.health > 0) return BEAR_STATIC_RECIPE;
    if (placement.id === FLYING_DOG_STATIC_RECIPE.animalId && placement.health > 0) return FLYING_DOG_STATIC_RECIPE;
    if (placement.id === FIRE_FOX_STATIC_RECIPE.animalId && placement.health > 0) return FIRE_FOX_STATIC_RECIPE;
    if (placement.id === KING_PENGUIN_STATIC_RECIPE.animalId) return placement.health > 0 ? KING_PENGUIN_STATIC_RECIPE : KING_PENGUIN_DEACTIVATED_RECIPE;
    if (placement.id === PENGUIN_STATIC_RECIPE.animalId && placement.health > 0) return PENGUIN_STATIC_RECIPE;
    if (placement.id === HUSKY_STATIC_RECIPE.animalId && placement.health > 0) return HUSKY_STATIC_RECIPE;
    if (placement.id === SKI_HUSKY_STATIC_RECIPE.animalId && placement.health > 0) return SKI_HUSKY_STATIC_RECIPE;
    if (placement.id === CRAZY_HUSKY_STATIC_RECIPE.animalId && placement.health > 0) return CRAZY_HUSKY_STATIC_RECIPE;
    if (placement.id === POLAR_BEAR_STATIC_RECIPE.animalId && placement.health > 0) return POLAR_BEAR_STATIC_RECIPE;
    if (placement.id === POLAR_TANK_STATIC_RECIPE.animalId && placement.health > 0) return POLAR_TANK_STATIC_RECIPE;
    if (placement.id === RABBIT_STATIC_RECIPE.animalId && placement.health > 0) return RABBIT_STATIC_RECIPE;
    if (placement.id === HELI_RABBIT_STATIC_RECIPE.animalId && placement.health > 0) return HELI_RABBIT_STATIC_RECIPE;
    if (placement.id === COOL_COD_STATIC_RECIPE.animalId && placement.health > 0) return COOL_COD_STATIC_RECIPE;
    if (placement.id === HYENA_STATIC_RECIPE.animalId && placement.health > 0) return HYENA_STATIC_RECIPE;
    if (placement.id === GORILLA_STATIC_RECIPE.animalId && placement.health > 0) return GORILLA_STATIC_RECIPE;
    if (placement.id === TORTOISE_TANK_STATIC_RECIPE.animalId && placement.health > 0) return TORTOISE_TANK_STATIC_RECIPE;
    if (placement.id === RACING_TORTOISE_STATIC_RECIPE.animalId && placement.health > 0) return RACING_TORTOISE_STATIC_RECIPE;
    if (placement.id === HYENA_BIKER_STATIC_RECIPE.animalId && placement.health > 0) return HYENA_BIKER_STATIC_RECIPE;
    if (placement.id === ELEPHANT_STATIC_RECIPE.animalId && placement.health > 0) return ELEPHANT_STATIC_RECIPE;
    return null;
}
