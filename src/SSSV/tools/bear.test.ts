import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { BEAR_STATIC_RECIPE } from "../animals/bear.js";
import { getStaticAnimalRecipe } from "../animal_contracts.js";
import { ANIMAL_EYE_ATLASES, sampleAnimalEyeFrame } from "../animal_eyes.js";

test("BEAR uses the standing source branches rather than a frozen walk sample", () => {
    // /tmp/sssv-bear-ref.c runs B9A5C, C287C, C20828 and C652C from the decomp,
    // state 2, zero terrain delta, no limb gestures, head aligned with heading.
    deepEqual(BEAR_STATIC_RECIPE.pose.sample.jointPositions, {
        0: { x: 0, z: 0, y: 1296 },
        1: { x: 0, z: 0, y: 2592 }, 2: { x: 0, z: 0, y: 0 },
        7: { x: 1037, z: 0, y: 2592 }, 8: { x: 1037, z: 0, y: 258 },
        10: { x: -1037, z: 0, y: 2592 }, 11: { x: -1037, z: 0, y: 258 },
        15: { x: -656, z: 1410, y: 0 }, 18: { x: 656, z: 1410, y: 0 },
        19: { x: 0, z: 43, y: 2712 }, 20: { x: 0, z: 821, y: 2712 },
    });
    equal(getStaticAnimalRecipe({ id: 22, health: 1 }), BEAR_STATIC_RECIPE);
    for (const id of [22, 23, 24]) equal(getStaticAnimalRecipe({ id, health: 0 }), null);
    for (const id of [23, 24]) equal(getStaticAnimalRecipe({ id, health: 127 }), null);
    deepEqual(BEAR_STATIC_RECIPE.pose.sample.scaleInputs.outerMatrixAxis16_16, [0x4000, 0x4000, 0x4000]);
});

test("BEAR keeps its eight source attachments, part scales and mirrored limbs", () => {
    deepEqual(BEAR_STATIC_RECIPE.parts.map(p => [p.address, p.joints.from, p.joints.to, p.mirror]), [
        [0x040082C0, 1, 2, 0], [0x04007BC0, 1, 20, 0],
        [0x04007EC0, 2, 15, 0], [0x04007EC0, 2, 18, 1],
        [0x040077C0, 7, 8, 0], [0x040077C0, 10, 11, 1],
        [0x04008490, 1, 20, 0], [0x040084A8, 1, 20, 0],
    ]);
    for (const part of BEAR_STATIC_RECIPE.parts) deepEqual(part.scale, { kind: "unit-16.16", value: 0x29800 });
});

test("BEAR eyes6 uses its own atlas and palette with source standard side mappings", () => {
    equal(BEAR_STATIC_RECIPE.eyes, "eyes6");
    deepEqual(ANIMAL_EYE_ATLASES.eyes6, { base: 0x010025A0, palette: 0x01002C40, frames: 13 });
    for (let tick = 0; tick < 4096; tick++) for (const side of ["left", "right"] as const)
        equal(sampleAnimalEyeFrame(tick, "eyes6", side), sampleAnimalEyeFrame(tick, "standard", side));
    equal(sampleAnimalEyeFrame(58, "eyes6", "left"), 12);
    equal(sampleAnimalEyeFrame(971, "eyes6", "left"), 3);
    equal(sampleAnimalEyeFrame(971, "eyes6", "right"), 4);
});
