import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { getStaticAnimalRecipe } from "../animal_contracts.js";
import { RAT_STATIC_RECIPE, KING_RAT_STATIC_RECIPE } from "../animals/rat.js";

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
