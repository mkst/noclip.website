import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { getStaticAnimalRecipe, RACING_DOG_STATIC_RECIPE, RACING_DOG_DEACTIVATED_RECIPE } from "../animal_contracts.js";

test("RACING_DOG uses zero-boost supports, neutral head and fully charged mirrored pods", () => {
    const r = RACING_DOG_STATIC_RECIPE, j = r.pose.sample.jointPositions;
    equal(getStaticAnimalRecipe({ id: 4, health: 70 }), r);
    deepEqual(j[0], { x: 0, z: 0, y: 900 });
    deepEqual(j[7], { x: -150, z: 300, y: 600 }); deepEqual(j[8], { x: -150, z: 300, y: 0 });
    deepEqual(j[19], { x: 0, z: 488, y: 1421 }); deepEqual(j[20], { x: 0, z: 931, y: 1421 });
    equal(r.parts.length, 12);
    deepEqual(r.parts.filter(p => p.mirror).map(p => p.name), ["right missile pod", "front right wheel", "rear right wheel"]);
    ok(r.parts.every(p => p.scale.kind === "unit-16.16" && p.scale.value === 0x10000));
    deepEqual(r.parts.filter(p => p.name.includes("wheel")).map(p => [p.joints.from, p.joints.to]), [[7, 8], [10, 11], [13, 14], [16, 17]]);
});

test("deactivated RACING_DOG retains ROM-backed joint fixtures and closed eyes", () => {
    const r = RACING_DOG_DEACTIVATED_RECIPE, j = r.pose.sample.jointPositions;
    equal(getStaticAnimalRecipe({ id: 4, health: 0 }), r);
    equal(getStaticAnimalRecipe({ id: 4, health: -1 }), r);
    deepEqual(j[1], { x: 0, z: 298, y: 321 }); deepEqual(j[8], { x: -893, z: 622, y: 32 });
    deepEqual(j[20], { x: 75, z: 1184, y: 408 });
    r.stateChanges.filter(c => c.kind === "load-eye-palette-frame").forEach(c => equal(c.textureAddress, 0x01000C20));
});
