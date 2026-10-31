import { deepEqual, equal } from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { sampleMysteryBearBalls, sampleMysteryBearJoints } from "../mystery_bear.js";
import { MYSTERY_BEAR_STATIC_RECIPE } from "../animals/bear.js";
import { mirrorZ } from "../level.js";

const placement = { id: 24, x: 2592, z: 4371, y: 528, rotation: 128, health: 127, unkC: 61, unkE: 0 };

test("Mystery Bear matches the source C joints and fixed-point ball trajectories over their full period", () => {
    // Reference: bear.c normal state-2 path, original mtx.h lookup tables,
    // update_limbs_mystery_bear and C652C; zero velocity and flat support.
    let samples = "";
    for (let tick = 0; tick < 256; tick++) {
        const joints = sampleMysteryBearJoints(tick);
        for (const id of [0, 1, 2, 7, 8, 10, 11, 19, 20, 26, 27]) {
            const p = joints[id];
            samples += `${p.x},${p.z},${p.y};`;
        }
        for (const [x, y, z] of sampleMysteryBearBalls(placement, placement.y, tick))
            samples += `${x * 65536},${y * 65536},${mirrorZ(z) * 65536};`;
        samples += "\n";
    }
    equal(createHash("sha256").update(samples).digest("hex"), "a7dfa0d76c80a88193bae6c51b1fc3c6a01c08a7eabb39df3ccaeeb979a27ed8");
    deepEqual(sampleMysteryBearJoints(0), MYSTERY_BEAR_STATIC_RECIPE.pose.sample.jointPositions);
});

test("Mystery Bear samples repeat across long and backward seeks", () => {
    for (const tick of [1000009, 32, 0, 58, 64, 255, 256]) {
        deepEqual(sampleMysteryBearJoints(tick), sampleMysteryBearJoints(tick % 256));
        deepEqual(sampleMysteryBearBalls(placement, placement.y, tick), sampleMysteryBearBalls(placement, placement.y, tick % 256));
    }
});

test("Mystery Bear balls rotate their source heading offsets around the placement", () => {
    const offsets = [0, 64, 128, 192].map(rotation => {
        const [x, , z] = sampleMysteryBearBalls({ ...placement, rotation }, placement.y, 0)[0];
        return [x - placement.x, mirrorZ(z) - placement.z];
    });
    deepEqual(offsets, [[0, 51.67236328125], [51.875, 0], [0, -51.875], [-51.67236328125, 0]]);
});
