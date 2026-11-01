import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";
import { SPRINGY_STATIC_RECIPE, SPRINGY_DEACTIVATED_RECIPE } from "../animals/sheep.js";

test("SPRINGY_THINGY uses the neutral spring support, without SHEEP's four-leg skeleton", () => {
    const r = SPRINGY_STATIC_RECIPE, j = r.pose.sample.jointPositions;
    equal(getStaticAnimalRecipe({ id: 35, health: 40 }), r);
    equal(getStaticAnimalRecipe({ id: 36, health: 0 }), null);
    deepEqual(j[0], { x: 0, z: 0, y: 1602 });
    deepEqual(j[1], { x: 0, z: 0, y: 2195 });
    deepEqual(j[2], { x: 0, z: 0, y: 1009 });
    deepEqual(j[14], { x: 0, z: 0, y: 0 });
    // C1A44's z-offset argument is zero; the secondary reference's 1009 is incorrect.
    deepEqual(j[15], j[14]);
    equal(j[1].y - j[2].y, 1186);
    equal(r.parts.length, 5);
    deepEqual(r.parts.map(p => [p.joints.from, p.joints.to]), [[2, 14], [1, 2], [1, 2], [1, 2], [1, 2]]);
    equal(r.parts[0].address, 0x040039E0);
    ok(r.parts.every(p => p.scale.kind === "unit-16.16" && p.scale.value === (76 * 0x10000 >> 6) && p.mirror === 0));
    ok(r.stateChanges.every(c => c.kind === "load-eye-palette-frame"));
});

test("deactivated SPRINGY_THINGY matches the ROM-backed DB670/DB494 reference and rest body", () => {
    const r = SPRINGY_DEACTIVATED_RECIPE;
    for (const health of [0, -1]) equal(getStaticAnimalRecipe({ id: 35, health }), r);
    // Host C reference using sheep.h's D_803B41B0_7C5860 and ROM integer sine tables.
    deepEqual(r.pose.sample.jointPositions, {
        0: { x: 0, z: -80, y: 570 }, 1: { x: 0, z: -654, y: 711 },
        2: { x: 0, z: 475, y: 369 }, 14: { x: 0, z: 1420, y: 27 },
    });
    equal(r.parts.find(p => p.name === "body")?.address, 0x040032E8);
    equal(SPRINGY_STATIC_RECIPE.parts.find(p => p.name === "body")?.address, 0x04002D90);
    equal(r.pose.sample.eyeFrame, 12);
    for (const recipe of [SPRINGY_STATIC_RECIPE, r]) {
        equal(recipe.stateChanges.length, 2);
        recipe.stateChanges.forEach(c => {
            ok(c.kind === "load-eye-palette-frame");
            equal(c.paletteAddress, 0x01000CC0);
            equal(c.textureAddress, 0x01000620 + recipe.pose.sample.eyeFrame * 128);
        });
    }
});
