import { deepStrictEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { mat4, vec3 } from "gl-matrix";
import {
    animalMatrixFlipsWinding,
    computeAnimalLimbMatrix,
    computeAnimalPlacementMatrix,
    multiplyAnimalMatrices,
    transformAnimalNormal,
    writeAnimalLimbMatrix,
} from "../animals/animal_matrix.js";
import type { AnimalJoint, AnimalLimbMatrixParameters } from "../animals/animal_matrix.js";
import { mirrorZ } from "../core/level.js";

const unitLimb: AnimalLimbMatrixParameters = {
    scaleX: 0x10000,
    scaleZ: 0x10000,
    scaleY: 0x10000,
    centerScale: 0,
    roll: 0,
    mirror: 0,
    orientationMode: 0,
};

function joint(x: number, z: number, y: number): AnimalJoint {
    return { x, z, y };
}

test("DOG standing body limb output matches the host C reference fixture", () => {
    const result = computeAnimalLimbMatrix(joint(0, -300, 974), joint(0, 300, 974), unitLimb);
    ok(result);
    deepStrictEqual(result.direction, [0, 65536, 0]);
    deepStrictEqual(result.side, [65536, 0, 0]);
    deepStrictEqual(result.up, [0, 0, -65536]);
    deepStrictEqual(result.translation, [0, 0, 7979008]);
});

test("asymmetric limb preserves signed midpoint truncation, nonuniform scales, center scale, and mirror bits", () => {
    const result = computeAnimalLimbMatrix(joint(-11, 5, 3), joint(8, -4, 14), {
        scaleX: 57344, scaleZ: 73728, scaleY: 49152,
        centerScale: 7, roll: 0, mirror: 3, orientationMode: 0,
    });
    ok(result);
    deepStrictEqual(result.direction, [47371, -28850, 23507]);
    deepStrictEqual(result.side, [-24576, -66706, 0]);
    deepStrictEqual(result.up, [0, 0, -49152]);
    deepStrictEqual(result.translation, [-23552, 0, 122880]);
});

test("all four source mirror values flip only their assigned basis axes", () => {
    const a = joint(-11, 5, 3), b = joint(8, -4, 14);
    const base = computeAnimalLimbMatrix(a, b, unitLimb);
    const mirror1 = computeAnimalLimbMatrix(a, b, { ...unitLimb, mirror: 1 });
    const mirror2 = computeAnimalLimbMatrix(a, b, { ...unitLimb, mirror: 2 });
    const mirror3 = computeAnimalLimbMatrix(a, b, { ...unitLimb, mirror: 3 });
    ok(base); ok(mirror1); ok(mirror2); ok(mirror3);
    const flipped = (values: number[]) => values.map((v) => v === 0 ? 0 : -v);
    deepStrictEqual(mirror1.side, flipped(base.side));
    deepStrictEqual(mirror1.up, base.up);
    deepStrictEqual(mirror2.side, base.side);
    deepStrictEqual(mirror2.up, flipped(base.up));
    deepStrictEqual(mirror3.side, flipped(base.side));
    deepStrictEqual(mirror3.up, flipped(base.up));
});

test("vertical limb orientation modes use the distinct source fallback bases", () => {
    const a = computeAnimalLimbMatrix(joint(0, 0, 0), joint(0, 0, 20), unitLimb);
    const b = computeAnimalLimbMatrix(joint(0, 0, 0), joint(0, 0, 20), { ...unitLimb, orientationMode: 1 });
    ok(a); ok(b);
    deepStrictEqual([a.direction, a.side, a.up], [[0, 0, 65536], [65536, 0, 0], [0, -65536, 0]]);
    deepStrictEqual([b.direction, b.side, b.up], [[0, 0, 65536], [0, 65536, 0], [65536, 0, 0]]);
});

test("horizontal joints retain the source perpendicular side and up axes", () => {
    const result = computeAnimalLimbMatrix(joint(-4, 3, 8), joint(12, 3, 8), unitLimb);
    ok(result);
    deepStrictEqual(result.direction, [65536, 0, 0]);
    deepStrictEqual(result.side, [0, -65536, 0]);
    deepStrictEqual(result.up, [0, 0, -65536]);
    deepStrictEqual(result.translation, [32768, 24576, 65536]);
});

test("single-axis mirror and odd positive midpoint match the host C reference", () => {
    const result = computeAnimalLimbMatrix(joint(0, 0, 0), joint(0, 15, 20), { ...unitLimb, mirror: 2 });
    ok(result);
    deepStrictEqual(result.direction, [0, 39321, 52428]);
    deepStrictEqual(result.side, [65536, 0, 0]);
    deepStrictEqual(result.up, [0, -65536, 0]);
    deepStrictEqual(result.translation, [0, 57344, 81920]);
});

test("limb roll uses the source 256-entry sine table and signed shifts", () => {
    const result = computeAnimalLimbMatrix(joint(0, 0, 0), joint(0, 0, 20), { ...unitLimb, roll: 64 });
    ok(result);
    deepStrictEqual(result.direction, [0, 0, 65536]);
    deepStrictEqual(result.side, [0, -65280, 0]);
    deepStrictEqual(result.up, [-65280, 0, 0]);
});

test("coincident joints are rejected; unsupported fixed-point input ranges fail explicitly", () => {
    equal(computeAnimalLimbMatrix(joint(10, -20, 30), joint(10, -20, 30), unitLimb), null);
    let failed = false;
    try {
        computeAnimalLimbMatrix(joint(0x8000, 0, 0), joint(0, 0, 0), unitLimb);
    } catch (e) {
        failed = e instanceof RangeError;
    }
    ok(failed);
});

test("the viewer matrix maps source x/z/y and composes limb, source-scale root, and world Z mirror once", () => {
    const basis = computeAnimalLimbMatrix(joint(0, -300, 974), joint(0, 300, 974), unitLimb);
    ok(basis);
    const limb = mat4.create();
    writeAnimalLimbMatrix(limb, basis);
    deepStrictEqual(Array.from(limb.slice(12, 15)), [0, 121.75, 0]);
    equal(limb[2], 1);
    equal(limb[4], 1);
    equal(limb[9], -1);
    equal(limb[10], 0);

    const placement = mat4.create();
    computeAnimalPlacementMatrix(placement, {
        x: 100, z: 300, y: 200, heading: 0,
        scaleX: 0x4000, scaleZ: 0x4000, scaleY: 0x4000,
        roll: 0, rollScale: 0,
    });
    const world = mat4.create();
    multiplyAnimalMatrices(world, placement, limb);
    const center = vec3.transformMat4(vec3.create(), [0, 0, 0], world);
    deepStrictEqual(Array.from(center), [100, 230.4375, mirrorZ(300)]);
    equal(animalMatrixFlipsWinding(limb), true);
    equal(animalMatrixFlipsWinding(placement), true);
    equal(animalMatrixFlipsWinding(world), false);

    const viewerAxes = mat4.create();
    writeAnimalLimbMatrix(viewerAxes, basis, false);
    equal(animalMatrixFlipsWinding(viewerAxes), false);
});

test("placement heading and nonuniform source scales retain fixed-table quantization", () => {
    const placement = mat4.create();
    computeAnimalPlacementMatrix(placement, {
        x: 0, z: 0, y: 0, heading: 64,
        scaleX: 0x8000, scaleZ: 0xC000, scaleY: 0x4000,
        roll: 0, rollScale: 0,
    });
    equal(placement[0], 0);
    equal(placement[2], 0.5);
    equal(placement[5], 0.25);
    equal(placement[8], 0.75);
    equal(placement[10], 0);
});

test("normals follow the N64 model-view linear transform and are normalized", () => {
    const basis = computeAnimalLimbMatrix(joint(0, 0, 0), joint(0, 0, 20), {
        ...unitLimb, scaleX: 0x20000, scaleZ: 0x10000, scaleY: 0x8000,
    });
    ok(basis);
    const limb = mat4.create();
    writeAnimalLimbMatrix(limb, basis);
    const transformed = vec3.create();
    ok(transformAnimalNormal(transformed, [1, 1, 1], limb));
    const expected = vec3.normalize(vec3.create(), [2, 0.5, -1]);
    ok(vec3.distance(transformed, expected) < 1e-6);
    equal(transformAnimalNormal(vec3.create(), [1, 0, 0], mat4.fromScaling(mat4.create(), [1, 0, 1])), false);
});
