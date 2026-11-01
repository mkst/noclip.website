import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { mat4 } from "gl-matrix";
import { advanceAnimalTail, animalTailMatrix, createAnimalTail } from "../animals/animal_tails.js";
import { LEVEL_Z_MIRROR } from "../core/level.js";

const placement = { id: 18, x: 700, z: 900, y: 80, rotation: 0, health: 127, unkC: 0, unkE: 0 };
const origin = { x: 0, z: 0, y: 0 };

test("tail curves and 120 simulation ticks match the original C routines", () => {
    // Unmodified DD244/DD548 in /tmp/sssv-tail-ref.c; FNV over all point/velocity words, ticks 0..120.
    const expected = [3218170307, 3981010792, 3226500033, 1901638277, 967059013, 1548603810,
        5712665, 2152415106, 754474738, 910363087, 355990279, 243758346];
    let fixture = 0;
    for (const dead of [false, true]) for (const size of [1, 2]) for (const rotation of [0, 43, 192]) {
        const tail = createAnimalTail({ ...placement, id: size === 2 ? 13 : 18, rotation, health: dead ? 0 : 127 }, 80, origin)!;
        // Rat anchoring has a source-only rearward offset; isolate solver inputs here.
        const offset = tail.anchor.map((v, axis) => v - [700, 900, 80][axis] * 65536);
        tail.anchor = [700 * 65536, 900 * 65536, 80 * 65536];
        for (const p of tail.points) for (let axis = 0; axis < 3; axis++) p[axis] -= offset[axis];
        let hash = 2166136261;
        for (let tick = 0; tick <= 120; tick++) {
            advanceAnimalTail(tail, tick);
            for (let i = 0; i < 6; i++) for (const v of [...tail.points[i], ...tail.velocities[i]]) hash = Math.imul(hash ^ v, 16777619) >>> 0;
        }
        equal(hash, expected[fixture++], `dead=${dead}, size=${size}, heading=${rotation}`);
    }
});

test("animal-specific anchors preserve source arithmetic and deactivated curves", () => {
    equal(createAnimalTail({ ...placement, id: 31 }, 80, origin), null);
    const mouse = createAnimalTail(placement, 80, { x: 0, z: -125, y: 234 })!;
    deepEqual(mouse.anchor, [700 * 65536, 900 * 65536 + Math.trunc(-125 * 32767 / 32), 80 * 65536 + 234 * 2048]);
    const king = createAnimalTail({ ...placement, id: 13 }, 80, { x: 0, z: -203, y: 365 })!;
    deepEqual(king.anchor, [700 * 65536, 900 * 65536 + Math.trunc(-812 * 32767 / 16), 80 * 65536 + 730 * 2048]);
    equal(king.segmentLength, mouse.segmentLength * 2);
    const dead = createAnimalTail({ ...placement, health: 0 }, 80, origin)!;
    ok(dead.points[5][2] < mouse.points[5][2]);
    ok(dead.points[3][0] > dead.anchor[0]);
});

test("tail sampling replays exactly after backward and forward seeks", () => {
    const tail = createAnimalTail({ ...placement, rotation: 43 }, 80, origin)!;
    advanceAnimalTail(tail, 120);
    const points = tail.points.map(p => [...p]);
    const velocities = tail.velocities.map(p => [...p]);
    equal(advanceAnimalTail(tail, 120), false);
    advanceAnimalTail(tail, 10); advanceAnimalTail(tail, 120);
    deepEqual(tail.points, points); deepEqual(tail.velocities, velocities);
    advanceAnimalTail(tail, 0);
    deepEqual(tail.points, createAnimalTail({ ...placement, rotation: 43 }, 80, origin)!.points);
});

test("tail matrices retain source midpoint, taper, source axes and viewer Z conversion", () => {
    const tail = createAnimalTail(placement, 80, origin)!;
    tail.points[0] = [700 * 65536, 900 * 65536, 80 * 65536];
    tail.points[1] = [700 * 65536, 896 * 65536, 80 * 65536];
    const m = animalTailMatrix(tail, 0);
    deepEqual(Array.from(m), [0, 0, 0.5, 0, 0.75, 0, -0, 0, 0, 0.75, -0, 0, 700, 80, LEVEL_Z_MIRROR - 898, 1]);
    ok(mat4.determinant(m) > 0);
    for (const link of [1, 2, 3, 4]) {
        const matrix = animalTailMatrix(tail, link);
        ok(Array.from(matrix).every(Number.isFinite));
        ok(mat4.determinant(matrix) > 0);
    }
});
