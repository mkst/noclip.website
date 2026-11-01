import { deepStrictEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { DOG_DEACTIVATED_RECIPE, DOG_STATIC_RECIPE, classifyAnimalHealth, getDogStaticRecipe, getSpawnMovementMode, indexAnimalPlacements } from "../animals/animal_contracts.js";
import type { LevelAnimalPlacement } from "../core/level.js";

function placement(id: number, health: number): LevelAnimalPlacement {
    return { id, x: 10, z: 20, y: 30, rotation: 64, health, unkC: 0, unkE: 0 };
}

test("health classes retain spawn mode differences for authored .can records", () => {
    equal(classifyAnimalHealth(1), "positive");
    equal(classifyAnimalHealth(0), "zero");
    equal(classifyAnimalHealth(-1), "negative");
    equal(getSpawnMovementMode(1), "injured");
    equal(getSpawnMovementMode(0), "deactivated");
    equal(getSpawnMovementMode(-1), "deactivated");
});

test("deactivated DOG uses the full mode-1 target and mapped closed eye frame", () => {
    const recipe = DOG_DEACTIVATED_RECIPE, pose = recipe.pose.sample;
    equal(getDogStaticRecipe(0), recipe); equal(getDogStaticRecipe(-1), recipe);
    equal(getDogStaticRecipe(40), DOG_STATIC_RECIPE);
    equal(pose.eyeFrame, 12);
    // ROM-backed host C reference for func_802DB494/func_802DB670 at strength 32.
    deepStrictEqual(pose.jointPositions[0], { x: 0, z: 10, y: 240 });
    deepStrictEqual(pose.jointPositions[1], { x: 0, z: 268, y: 388 });
    deepStrictEqual(pose.jointPositions[7], { x: -213, z: 383, y: 854 });
    deepStrictEqual(pose.jointPositions[9], { x: -541, z: 582, y: 557 });
    deepStrictEqual(pose.jointPositions[18], { x: 233, z: -1073, y: 222 });
    deepStrictEqual(pose.jointPositions[20], { x: 0, z: 875, y: 153 });
    equal(Object.keys(pose.jointPositions).length, 21);
    equal(recipe.parts, DOG_STATIC_RECIPE.parts);
    const eyes = recipe.stateChanges.filter(change => change.kind === "load-eye-palette-frame");
    equal(eyes.length, 2);
    eyes.forEach(change => equal(change.textureAddress, 0x01000C20));
    const open = DOG_STATIC_RECIPE.stateChanges.filter(change => change.kind === "load-eye-palette-frame");
    open.forEach(change => equal(change.textureAddress, 0x01000620));
});

test("stable placement indices preserve raw record references", () => {
    const records = [placement(31, 100), placement(31, 0)];
    const indexed = indexAnimalPlacements(records);
    deepStrictEqual(indexed.map((entry) => entry.placementIndex), [0, 1]);
    equal(indexed[0].placement, records[0]);
    equal(indexed[1].placement, records[1]);
    equal(records[0].rotation, 64);
    equal(records[1].health, 0);
});

test("DOG recipe preserves standing joints and ordered assets", () => {
    equal(DOG_STATIC_RECIPE.pose.sample.jointPositions[0].y, 824);
    deepStrictEqual(DOG_STATIC_RECIPE.pose.sample.jointPositions[1], { x: 0, z: 300, y: 974 });
    deepStrictEqual(DOG_STATIC_RECIPE.pose.sample.jointPositions[4], { x: 150, z: 300, y: 974 });
    deepStrictEqual(DOG_STATIC_RECIPE.pose.sample.jointPositions[7], { x: -150, z: 300, y: 500 });
    deepStrictEqual(DOG_STATIC_RECIPE.pose.sample.jointPositions[12], { x: 150, z: 300, y: 0 });
    deepStrictEqual(DOG_STATIC_RECIPE.pose.sample.jointPositions[19], { x: 0, z: 488, y: 1495 });
    deepStrictEqual(DOG_STATIC_RECIPE.pose.sample.scaleInputs.outerMatrixAxis16_16, [0x4000, 0x4000, 0x4000]);
    deepStrictEqual(DOG_STATIC_RECIPE.pose.sample.jointPositions[3], { x: -150, z: 300, y: 974 });
    equal(DOG_STATIC_RECIPE.parts[0].address, 0x04000420);
    equal(DOG_STATIC_RECIPE.parts[0].joints.from, 2);
    equal(DOG_STATIC_RECIPE.parts[0].joints.to, 1);
    equal(DOG_STATIC_RECIPE.parts.at(-1)?.address, 0x04001A40);
    deepStrictEqual(DOG_STATIC_RECIPE.stateChanges.map((change) => change.order), [0, 4, 6, 19, 21]);
    equal(DOG_STATIC_RECIPE.stateChanges[2].kind, "apply-state-display-list");
});
