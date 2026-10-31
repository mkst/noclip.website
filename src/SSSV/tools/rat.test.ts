import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { getStaticAnimalRecipe } from "../animal_contracts.js";
import { RAT_STATIC_RECIPE, KING_RAT_STATIC_RECIPE } from "../animals/rat.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { buildRatEyeGlows } from "../rat_eye_glows.js";
import { LEVEL_Z_MIRROR } from "../level.js";
import { sampleAnimalEyeIndices } from "../animal_eyes.js";

test("RAT preserves source fixed supports, primitive eyes and unmirrored wheels", () => {
    const r = RAT_STATIC_RECIPE, j = r.pose.sample.jointPositions;
    equal(getStaticAnimalRecipe({ id: 32, health: 50 }), r);
    equal(getStaticAnimalRecipe({ id: 32, health: 0 }), null);
    deepEqual(j[0], { x: 0, z: 0, y: 365 });
    deepEqual(j[1], { x: 0, z: 203, y: 365 });
    deepEqual(j[7], { x: -162, z: 203, y: 284 }); deepEqual(j[8], { x: -162, z: 203, y: 0 });
    equal(r.parts.length, 7);
    ok(r.parts.every(p => p.mirror === 0 && p.scale.kind === "unit-16.16" && p.scale.value === 0xD000));
    ok(r.stateChanges.every(c => c.kind !== "load-eye-palette-frame"));
    deepEqual(r.parts.filter(p => p.name.endsWith("eye")).map(p => p.address), [0x040073B0, 0x040073D8]);
    const red = r.stateChanges.find(c => c.kind === "set-primitive-color" && c.order === 10);
    ok(red?.kind === "set-primitive-color"); deepEqual(red.rgba, [255, 0, 0, 255]);
});

test("KING_RAT doubles the outer matrix rather than part scales and adds its crown", () => {
    const r = KING_RAT_STATIC_RECIPE;
    equal(getStaticAnimalRecipe({ id: 13, health: 127 }), r);
    equal(getStaticAnimalRecipe({ id: 13, health: -1 }), null);
    deepEqual(r.pose.sample.jointPositions, RAT_STATIC_RECIPE.pose.sample.jointPositions);
    deepEqual(r.pose.sample.scaleInputs.outerMatrixAxis16_16, [0x8000, 0x8000, 0x8000]);
    deepEqual(RAT_STATIC_RECIPE.pose.sample.scaleInputs.outerMatrixAxis16_16, [0x4000, 0x4000, 0x4000]);
    equal(r.parts.length, 8); equal(r.parts.find(p => p.name === "crown")?.address, 0x04007520);
});

test("rat glow anchors retain the source fixed-point offsets and king size", () => {
    const placement = { id: 32, x: 700, z: 900, y: 80, rotation: 0, health: 127, unkC: 0, unkE: 0 };
    for (const size of [1, 2]) {
        const output = new RSPSharedOutput();
        const glows = buildRatEyeGlows(output, { ...placement, id: size === 2 ? 13 : 32 }, 80, { x: 0, z: 203, y: 365 });
        equal(glows.length, 2);
        for (const [i, glow] of glows.entries()) {
            const expected = [700 + (i === 0 ? 1 : -1) * size * 195840 / 65536, 80 + size * 9.8125, LEVEL_Z_MIRROR - (900 + size * 900660 / 65536)];
            glow.center.forEach((v, axis) => ok(Math.abs(v - expected[axis]) < 0.001));
            deepEqual(glow.textureIndices, [563]);
            deepEqual(glow.projectedObjectSprite, { size: size * 6 });
            deepEqual(Array.from(glow.DP_PrimColor), [1, 0, 0, 1]);
            deepEqual(Array.from(glow.DP_EnvColor), [1, 0, 0, 0]);
            ok(glow.animalEyeGlow && glow.billboard && glow.translucent);
            equal(glow.indexCount, 6);
        }
        equal(output.vertices.length, 8);
        equal(output.indices.length, 12);
    }
    const output = new RSPSharedOutput();
    const glows = buildRatEyeGlows(output, { ...placement, rotation: 64 }, 80, { x: 0, z: 203, y: 365 });
    ok(Math.abs(glows[0].center[0] - (700 + 900660 / 65536)) < 0.001);
    ok(Math.abs(glows[0].center[2] - (LEVEL_Z_MIRROR - 900 + 195840 / 65536)) < 0.001);
    equal(buildRatEyeGlows(output, { ...placement, health: 0 }, 80, { x: 0, z: 203, y: 365 }).length, 0);
    equal(buildRatEyeGlows(output, { ...placement, id: 18 }, 80, { x: 0, z: 203, y: 365 }).length, 0);
});

test("rat glow admission uses the logical blink expression, including seeks", () => {
    deepEqual([0, 57, 58, 63, 64, 58, 64].map(tick => sampleAnimalEyeIndices(tick)[0] !== 5),
        [true, true, false, false, true, false, true]);
});
