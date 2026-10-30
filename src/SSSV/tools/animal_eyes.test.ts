import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { sampleAnimalEyeIndices, sampleAnimalEyeFrame, sampleAnimalEyeRed } from "../animal_eyes.js";

test("idle eye timer matches the source C over its complete 4096-tick pattern", () => {
    // FNV-1a of logical left/right bytes from unmodified func_8031A150 in a host C harness.
    let hash = 2166136261;
    for (let tick = 0; tick < 4096; tick++)
        for (const eye of sampleAnimalEyeIndices(tick)) hash = Math.imul(hash ^ eye, 16777619) >>> 0;
    equal(hash, 1485004017);
});

test("blink, independent glances and later expression overrides retain source boundaries", () => {
    for (const tick of [0, 57, 64]) deepEqual(sampleAnimalEyeIndices(tick), [0, 0]);
    for (const tick of [58, 63]) deepEqual(sampleAnimalEyeIndices(tick), [5, 5]);
    deepEqual(sampleAnimalEyeIndices(738), [1, 0]);
    deepEqual(sampleAnimalEyeIndices(744), [0, 1]);
    deepEqual(sampleAnimalEyeIndices(751), [2, 0]);
    deepEqual(sampleAnimalEyeIndices(762), [0, 2]); // Overrides the regular blink at phase 58.
    deepEqual(sampleAnimalEyeIndices(970), [0, 0]);
    deepEqual(sampleAnimalEyeIndices(971), [3, 3]);
    deepEqual(sampleAnimalEyeIndices(985), [0, 0]);
    deepEqual(sampleAnimalEyeIndices(1001), [4, 4]);
    deepEqual(sampleAnimalEyeIndices(1015), [0, 0]);
    deepEqual(sampleAnimalEyeIndices(1130), [7, 7]);
});

test("species and eye sides map logical expressions to their own atlas frames", () => {
    equal(sampleAnimalEyeFrame(58, "standard", "left"), 12);
    equal(sampleAnimalEyeFrame(58, "eyes5", "left"), 4);
    equal(sampleAnimalEyeFrame(971, "standard", "left"), 3);
    equal(sampleAnimalEyeFrame(971, "standard", "right"), 4);
    equal(sampleAnimalEyeFrame(1001, "standard", "left"), 4);
    equal(sampleAnimalEyeFrame(1001, "standard", "right"), 3);
    equal(sampleAnimalEyeFrame(971, "eyes5", "left"), 0);
    equal(sampleAnimalEyeFrame(1130, "eyes5", "right"), 3);
    equal(sampleAnimalEyeFrame(738, "eyes5", "left"), 1);
    equal(sampleAnimalEyeFrame(738, "eyes5", "right"), 0);
});

test("global scene-clock samples repeat and seek backwards without state; deactivated eyes stay closed", () => {
    for (const tick of [0, 58, 738, 971, 1130, 3596, 65535]) {
        deepEqual(sampleAnimalEyeIndices(tick), sampleAnimalEyeIndices(tick + 4096));
        deepEqual(sampleAnimalEyeIndices(tick, true), [5, 5]);
        equal(sampleAnimalEyeFrame(tick, "standard", "right", true), 12);
        equal(sampleAnimalEyeFrame(tick, "eyes5", "right", true), 4);
    }
    sampleAnimalEyeIndices(10000);
    deepEqual(sampleAnimalEyeIndices(0), [0, 0]);
    equal(sampleAnimalEyeRed(57), 255); equal(sampleAnimalEyeRed(58), 155);
    equal(sampleAnimalEyeRed(64), 255); equal(sampleAnimalEyeRed(762), 255);
    equal(sampleAnimalEyeRed(0, true), 155);
});
