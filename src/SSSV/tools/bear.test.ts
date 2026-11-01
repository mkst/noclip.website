import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { BEAR_STATIC_RECIPE, CRAZY_BEAR_STATIC_RECIPE, MYSTERY_BEAR_STATIC_RECIPE } from "../animals/bear.js";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";
import { ANIMAL_EYE_ATLASES, sampleAnimalEyeFrame } from "../animals/animal_eyes.js";

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

    deepEqual(BEAR_STATIC_RECIPE.pose.sample.scaleInputs.outerMatrixAxis16_16, [0x4000, 0x4000, 0x4000]);
});

test("MYSTERY_BEAR holds the source tick-zero floating pose and its distinct attachments", () => {
    equal(getStaticAnimalRecipe({ id: 24, health: 127 }), MYSTERY_BEAR_STATIC_RECIPE);
    equal(getStaticAnimalRecipe({ id: 24, health: -1 }), null);
    // Decompiled B9A5C, update_limbs_mystery_bear and C652C executed with
    // original mtx.h lookup tables, state 2, flat support and global tick 0.
    deepEqual(Object.entries(MYSTERY_BEAR_STATIC_RECIPE.pose.sample.jointPositions).map(([id, p]) => [Number(id), p.x, p.z, p.y]), [
        [0, 0, 0, 2722], [1, 0, 0, 4018], [2, 0, 0, 1426],
        [7, 1037, 0, 4018], [8, 1037, 1932, 2714],
        [10, -1037, 0, 4018], [11, -1037, 2324, 4018],
        [19, 0, 43, 4138], [20, 0, 821, 4138], [26, 0, 0, 0], [27, 0, 0, 1426],
    ]);
    deepEqual(MYSTERY_BEAR_STATIC_RECIPE.parts.map(p => [p.address, p.joints.from, p.joints.to, p.mirror]), [
        [0x040082C0, 1, 2, 0], [0x04007BC0, 1, 20, 0],
        [0x040077C0, 7, 8, 0], [0x040077C0, 10, 11, 1], [0x04009540, 27, 26, 0],
        [0x04008490, 1, 20, 0], [0x040084A8, 1, 20, 0],
    ]);
    equal(MYSTERY_BEAR_STATIC_RECIPE.eyes, "eyes6");
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

test("CRAZY_BEAR holds source tick-zero arms and split head without eye overlays", () => {
    equal(getStaticAnimalRecipe({ id: 23, health: 127 }), CRAZY_BEAR_STATIC_RECIPE);
    equal(getStaticAnimalRecipe({ id: 23, health: -1 }), null);
    const j = CRAZY_BEAR_STATIC_RECIPE.pose.sample.jointPositions;
    // update_limbs_crazy_bear: SIN(1)>>7 = 6, COS(1)>>7 = 255;
    // opposite arm uses SIN(128) = 0, COS(128)>>7 = -256.
    deepEqual(j[8], { x: 1037, z: (6 * 2334) >> 8, y: 2592 + ((255 * 2334) >> 8) });
    deepEqual(j[11], { x: -1037, z: 0, y: 258 });
    // C5824(129, 778, 20), then update_crazy_bear's +/- ((256*778)>>12).
    deepEqual(j[19], { x: 0, z: 43, y: 2712 });
    deepEqual(j[20], { x: 0, z: 821, y: 2664 });
    deepEqual(j[27], { x: 0, z: 821, y: 2760 });
    for (const id of [0, 1, 2, 7, 10, 15, 18]) deepEqual(j[id], BEAR_STATIC_RECIPE.pose.sample.jointPositions[id]);
    equal(CRAZY_BEAR_STATIC_RECIPE.eyes, undefined);
    deepEqual(CRAZY_BEAR_STATIC_RECIPE.parts.map(p => [p.address, p.joints.from, p.joints.to, p.mirror]), [
        [0x040082C0, 1, 2, 0], [0x04008A20, 1, 20, 0], [0x04008E30, 1, 27, 0],
        [0x04007EC0, 2, 15, 0], [0x04007EC0, 2, 18, 1],
        [0x040077C0, 7, 8, 0], [0x040077C0, 10, 11, 1],
    ]);
});
