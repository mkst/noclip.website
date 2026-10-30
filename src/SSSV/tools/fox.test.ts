import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { getStaticAnimalRecipe } from "../animal_contracts.js";
import { FOX_STATIC_RECIPE, RACING_FOX_STATIC_RECIPE, RACING_FOX_DEACTIVATED_RECIPE } from "../animals/fox.js";

test("standard FOX selects a standing model without claiming desert variants or its deactivated pose", () => {
    equal(getStaticAnimalRecipe({ id: 6, health: 127 }), FOX_STATIC_RECIPE);
    for (const id of [51, 52, 55]) equal(getStaticAnimalRecipe({ id, health: 127 }), null);
    for (const health of [0, -1]) equal(getStaticAnimalRecipe({ id: 6, health }), null);
});

test("RACING_FOX selects separate living and deactivated chassis poses", () => {
    equal(getStaticAnimalRecipe({ id: 26, health: 100 }), RACING_FOX_STATIC_RECIPE);
    for (const health of [0, -1]) equal(getStaticAnimalRecipe({ id: 26, health }), RACING_FOX_DEACTIVATED_RECIPE);
    const j = RACING_FOX_STATIC_RECIPE.pose.sample.jointPositions;
    deepEqual(j[0], { x: 0, z: 0, y: 500 });
    for (const [src, dst] of [[3, 7], [4, 10], [5, 13], [6, 16]]) {
        deepEqual(j[dst], { ...j[src], y: 400 });
        deepEqual(j[dst + 1], { ...j[src], y: 0 });
        deepEqual(j[dst + 2], { ...j[src], y: 0 });
    }
    deepEqual(j[19], { x: 0, z: 593, y: 1062 });
    deepEqual(j[20], { x: 0, z: 993, y: 1062 });
    deepEqual(j[26], { x: 12, z: -1253, y: 500 });
});

test("RACING_FOX submits four unmirrored wheel supports and shares FOX eyes", () => {
    const r = RACING_FOX_STATIC_RECIPE, wheels = r.parts.filter(p => p.name.endsWith("wheel"));
    equal(r.parts.length, 9); equal(wheels.length, 4);
    deepEqual(wheels.map(p => [p.joints.from, p.joints.to]), [[7, 8], [10, 11], [13, 14], [16, 17]]);
    ok(wheels.every(p => p.address === 0x04004590));
    ok(r.parts.every(p => p.mirror === 0 && p.scale.kind === "unit-16.16" && p.scale.value === 0xE800));
    ok(r.stateChanges.every(c => c.kind !== "set-cull-mode"));
    deepEqual(r.parts.filter(p => p.name.endsWith("eye")), FOX_STATIC_RECIPE.parts.filter(p => p.name.endsWith("eye")));
    deepEqual(r.stateChanges.filter(c => c.kind === "load-eye-palette-frame"), FOX_STATIC_RECIPE.stateChanges.filter(c => c.kind === "load-eye-palette-frame"));
});

test("FOX standing support, neutral head and first-tick tail retain integer source arithmetic", () => {
    const p = FOX_STATIC_RECIPE.pose.sample, j = p.jointPositions;
    // B9130 subtracts 100 from the 500 support height; state 2 does not add it back.
    deepEqual(j[0], { x: 0, z: 0, y: 400 });
    deepEqual(j[3], { x: -150, z: 390, y: 400 });
    deepEqual(j[7], { x: -150, z: 390, y: -100 });
    deepEqual(j[16], { x: 150, z: -390, y: -100 });
    // ROM gSineTable at 20/110 degrees is 87/240, not rounded floating-point trig.
    deepEqual(j[19], { x: 0, z: 390 + Math.trunc(600 * 87 / 256), y: 400 + Math.trunc(600 * 240 / 256) });
    deepEqual(j[20], { x: 0, z: j[19].z + 400, y: j[19].y });
    // SIN(3)>>11 = 1 degree; SINB/COSB(1) are 4/255. The following
    // 803033D4 zero-angle rotation still uses COS(0)>>7=255, with signed shifts.
    deepEqual(j[26], { x: Math.trunc(870 * 4 / 256) * 255 >> 8, z: -390 + (-Math.trunc(870 * 255 / 256) * 255 >> 8), y: 400 });
    ok(FOX_STATIC_RECIPE.parts.every(part => part.scale.kind === "unit-16.16" && part.scale.value === (0x10000 * 58 >> 6)));
});

test("FOX submits source attachments, mirrored culling and the distinct eyes5/TLUT1 atlas", () => {
    const r = FOX_STATIC_RECIPE;
    deepEqual(r.parts.map(p => p.address), [0x04004D10, 0x04004090, 0x04004200, 0x04004330, 0x04004330, 0x04004330, 0x04004330, 0x040046D0, 0x040046F0]);
    deepEqual(r.parts.slice(0, 3).map(p => [p.joints.from, p.joints.to]), [[1, 20], [1, 2], [2, 26]]);
    const legs = r.parts.filter(p => p.name.includes("leg"));
    deepEqual(legs.map(p => [p.joints.from, p.joints.to, p.mirror]), [[3, 7, 0], [5, 13, 0], [4, 10, 1], [6, 16, 1]]);
    const cull = r.stateChanges.find(c => c.kind === "set-cull-mode");
    ok(cull?.kind === "set-cull-mode"); equal(cull.mode, "front");
    ok(cull.order > legs[1].order && cull.order < legs[2].order);
    const eyes = r.stateChanges.filter(c => c.kind === "load-eye-palette-frame");
    equal(eyes.length, 2);
    eyes.forEach(c => { equal(c.textureAddress, 0x01002100); equal(c.paletteAddress, 0x01000CA0); });
});


test("deactivated RACING_FOX matches the source full-strength target with closed eyes", () => {
    const recipe = RACING_FOX_DEACTIVATED_RECIPE;
    // ROM-backed host C fixture, DB494/DB670 strength 32 using the racing-fox tables.
    deepEqual(recipe.pose.sample.jointPositions, {
        0: { x: 0, z: 0, y: 490 },
        1: { x: 0, z: 390, y: 490 }, 2: { x: 0, z: -390, y: 490 },
        3: { x: -139, z: 366, y: 536 }, 4: { x: 119, z: 410, y: 577 },
        5: { x: -142, z: -414, y: 525 }, 6: { x: 149, z: -390, y: 499 },
        7: { x: -233, z: 392, y: 519 }, 8: { x: -560, z: 580, y: 396 },
        10: { x: 197, z: 459, y: 544 }, 11: { x: 540, z: 656, y: 532 },
        13: { x: -234, z: -430, y: 495 }, 14: { x: -529, z: -695, y: 521 },
        16: { x: 236, z: -351, y: 472 }, 17: { x: 172, z: -720, y: 607 },
        19: { x: 327, z: 809, y: 761 }, 20: { x: 393, z: 1124, y: 995 },
        26: { x: -86, z: -1239, y: 341 },
    });
    equal(recipe.parts, RACING_FOX_STATIC_RECIPE.parts);
    equal(recipe.pose.sample.eyeFrame, 4);
    deepEqual(recipe.pose.sample.scaleInputs, RACING_FOX_STATIC_RECIPE.pose.sample.scaleInputs);
    const eyes = recipe.stateChanges.filter(change => change.kind === "load-eye-palette-frame");
    equal(eyes.length, 2);
    for (const eye of eyes) equal(eye.textureAddress, 0x01002300);
});
