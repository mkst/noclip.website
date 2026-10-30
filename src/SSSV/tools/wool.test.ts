import { deepEqual, equal, notDeepEqual, ok } from "node:assert/strict";
import { test } from "node:test";
import { mat4 } from "gl-matrix";
import { sampleWoolVertex } from "../wool.js";
import { updateAnimalWool } from "../animal_renderer.js";
import type { AnimalWoolAnimation } from "../animal_renderer.js";

const rest = [
    { position: [33, -29, 7], normal: [106, -61, -20] },
    { position: [-12, -51, 7], normal: [-56, -111, 0] },
    { position: [37, 29, -15], normal: [106, 51, -39] },
] as const;

test("wool position and normal updates match host C fixtures with ROM sine tables", () => {
    const expected = [
        [{ position: [34, -31, 7], normal: [118, -6, -46] }, { position: [-13, -55, 7], normal: [5, -114, -57] }, { position: [38, 30, -16], normal: [109, 10, -63] }],
        [{ position: [35, -31, 7], normal: [106, -46, -51] }, { position: [-13, -52, 7], normal: [-31, -123, -8] }, { position: [36, 28, -15], normal: [121, -15, -34] }],
    ];
    [1, 7].forEach((tick, t) => rest.forEach((v, i) => deepEqual(sampleWoolVertex({ position: [...v.position], normal: [...v.normal] }, tick), expected[t][i])));
});

test("wool shares a 32-tick phase, preserves the pristine initial frame and has no accumulated drift", () => {
    const v = { position: [...rest[0].position], normal: [...rest[0].normal] } as Parameters<typeof sampleWoolVertex>[0];
    const original = structuredClone(v);
    deepEqual(sampleWoolVertex(v, 0), original);
    notDeepEqual(sampleWoolVertex(v, 32), original);
    deepEqual(sampleWoolVertex(v, 1), sampleWoolVertex(v, 33));
    sampleWoolVertex(v, 1000); sampleWoolVertex(v, 7);
    deepEqual(v, original);
});

test("wool updates only position/normal attributes in its mapped vertices and supports backwards seeks", () => {
    const animation: AnimalWoolAnimation = {
        rest: [{ position: [...rest[0].position], normal: [...rest[0].normal] }],
        matrix: mat4.fromTranslation(mat4.create(), [100, 200, 300]),
        targets: [{ vertexIndex: 1, woolIndex: 0 }], firstVertex: 1, vertexCount: 1, lastTick: 0,
    };
    const data = new Float32Array(30).fill(-9);
    ok(updateAnimalWool(animation, data, 1));
    deepEqual(Array.from(data.slice(10, 13)), [134, 169, 307]);
    for (let i = 0; i < data.length; i++) if (![10, 11, 12, 16, 17, 18].includes(i)) equal(data[i], -9);
    equal(updateAnimalWool(animation, data, 1), false);
    ok(updateAnimalWool(animation, data, 0));
    deepEqual(Array.from(data.slice(10, 13)), [133, 171, 307]);
});
