import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { getStaticAnimalRecipe } from "../animal_contracts.js";
import { RACING_MOUSE_STATIC_RECIPE, RACING_MOUSE_DEACTIVATED_RECIPE } from "../animals/mouse.js";

test("RACING_MOUSE retains fixed wheel supports and the body-before-head displacement", () => {
    const r = RACING_MOUSE_STATIC_RECIPE, j = r.pose.sample.jointPositions;
    equal(getStaticAnimalRecipe({ id: 18, health: 127 }), r);
    deepEqual(j[0], { x: 0, z: 0, y: 234 });
    deepEqual(j[7], { x: -70, z: 125, y: 156 });
    deepEqual(j[8], { x: -70, z: 125, y: 0 });
    deepEqual(j[1], { x: 0, z: 187, y: 234 });
    deepEqual(j[20], { x: 0, z: 405, y: 421 });
    deepEqual(j[22], { x: -187, z: 187, y: 608 });
    deepEqual(r.parts[0].joints, { from: 2, to: 1 });
    deepEqual(r.parts[0].jointOverrides, { to: { x: 0, z: 125, y: 234 } });
    ok(r.parts.slice(1).every(p => p.jointOverrides === undefined));
    ok(r.parts.every(p => p.scale.kind === "unit-16.16" && p.scale.value === 0x2800));
});

test("RACING_MOUSE mirrors only its right ear and uses its source eye atlas", () => {
    const r = RACING_MOUSE_STATIC_RECIPE;
    equal(r.parts.length, 10);
    const wheels = r.parts.filter(p => p.name.endsWith("wheel"));
    deepEqual(wheels.map(p => [p.joints.from, p.joints.to]), [[7, 8], [10, 11], [13, 14], [16, 17]]);
    ok(wheels.every(p => p.address === 0x04005CA0 && p.mirror === 0));
    deepEqual(r.parts.filter(p => p.mirror !== 0).map(p => p.name), ["right ear"]);
    r.stateChanges.forEach(c => {
        ok(c.kind === "load-eye-palette-frame");
        equal(c.textureAddress, 0x01002100); equal(c.paletteAddress, 0x01000CA0);
    });
});

test("deactivated RACING_MOUSE retains ROM-backed pose arithmetic and eyes5 closed frame 4", () => {
    const r = RACING_MOUSE_DEACTIVATED_RECIPE, j = r.pose.sample.jointPositions;
    for (const health of [0, -1]) equal(getStaticAnimalRecipe({ id: 18, health }), r);
    // Host C DB670/DB494 fixture; the render-only +62 z shift follows pose construction.
    deepEqual(j[0], { x: 0, z: 0, y: 330 });
    deepEqual(j[1], { x: 0, z: 187, y: 330 });
    deepEqual(j[7], { x: -194, z: 107, y: 295 });
    deepEqual(j[11], { x: 292, z: 198, y: 183 });
    deepEqual(j[20], { x: 0, z: 201, y: 300 });
    deepEqual(j[22], { x: -345, z: 210, y: 378 });
    deepEqual(j[23], { x: 287, z: 187, y: 277 });
    deepEqual(r.parts[0].jointOverrides?.to, { x: 0, z: 125, y: 330 });
    equal(r.pose.sample.eyeFrame, 4);
    r.stateChanges.forEach(c => { ok(c.kind === "load-eye-palette-frame"); equal(c.textureAddress, 0x01002300); });
});
