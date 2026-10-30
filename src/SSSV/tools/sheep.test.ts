import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { getStaticAnimalRecipe } from "../animal_contracts.js";
import { SHEEP_STATIC_RECIPE } from "../animals/sheep.js";
import { computeAnimalLimbMatrix } from "../animal_matrix.js";

test("standing SHEEP retains source support dimensions, rigid feet and vertical body/head anchors", () => {
    const recipe = SHEEP_STATIC_RECIPE, p = recipe.pose.sample;
    equal(getStaticAnimalRecipe({ id: 33, health: 40 }), recipe);
    equal(getStaticAnimalRecipe({ id: 33, health: 0 }), null);
    equal(getStaticAnimalRecipe({ id: 34, health: 0 }), null);
    deepEqual(p.jointPositions[0], { x: 0, z: 0, y: 831 });
    deepEqual(p.jointPositions[3], { x: -118, z: 178, y: 831 });
    deepEqual(p.jointPositions[7], { x: -118, z: 178, y: 0 });
    deepEqual(p.jointPositions[16], { x: 118, z: -178, y: 0 });
    deepEqual(p.jointPositions[26], { x: 0, z: 0, y: 1424 });
    deepEqual(p.jointPositions[27], { x: 0, z: 0, y: 238 });
    equal(p.jointPositions[26].y - p.jointPositions[27].y, 1186);
    deepEqual(p.scaleInputs.outerMatrixAxis16_16, [0x4000, 0x4000, 0x4000]);
    ok(recipe.parts.every(part => part.scale.kind === "unit-16.16" && part.scale.value === 0x13000));
});

test("SHEEP submits the Europe leg address, mirrored attachments and culling in source order", () => {
    const r = SHEEP_STATIC_RECIPE;
    deepEqual(r.parts.map(p => p.address), [0x04002D90, 0x040036B0, 0x04003580, 0x04003580, 0x04003580, 0x04003580, 0x040037A0, 0x040037C0]);
    const legs = r.parts.filter(p => p.name.includes("leg"));
    deepEqual(legs.map(p => [p.joints.from, p.joints.to, p.mirror]), [[3, 7, 0], [5, 13, 0], [4, 10, 1], [6, 16, 1]]);
    const cull = r.stateChanges.find(c => c.kind === "set-cull-mode");
    ok(cull?.kind === "set-cull-mode"); equal(cull.mode, "front");
    ok(cull.order > legs[1].order && cull.order < legs[2].order);
    const eyes = r.stateChanges.filter(c => c.kind === "load-eye-palette-frame");
    equal(eyes.length, 2); eyes.forEach(c => { equal(c.textureAddress, 0x01000620); equal(c.paletteAddress, 0x01000CC0); });
});

test("SHEEP constant limb scale survives the vertical source matrix branch", () => {
    const j = SHEEP_STATIC_RECIPE.pose.sample.jointPositions;
    const m = computeAnimalLimbMatrix(j[3], j[7], { scaleX: 0x13000, scaleZ: 0x13000, scaleY: 0x13000, centerScale: 0, roll: 0, mirror: 0, orientationMode: 0 });
    ok(m); equal(Math.abs(m.direction[2]), 0x13000);
    equal(Math.max(...m.side.map(Math.abs)), 0x13000);
    equal(Math.max(...m.up.map(Math.abs)), 0x13000);
});
