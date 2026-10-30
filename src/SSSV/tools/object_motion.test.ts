import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { mat4, vec3 } from "gl-matrix";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { parseLevelDat } from "../level.js";
import type { LevelObjectPlacement } from "../level.js";
import { readObjectMotion, computeObjectMotionMatrix, computeObjectMotionPosition } from "../object_motion.js";
import type { ObjectMotionTransform } from "../object_motion.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { buildObjects, parseObjectTable } from "../objects.js";
import { parseCommands } from "../paths.js";

(globalThis as any).window = { debug: false };

const placement: LevelObjectPlacement = { id: 200, x: 100, z: 200, y: 300, angle: 0, zRotation: 0, scale: 0x800, unkC: 0, commandReferenceIdx: 1, commandsLength: 0, unk12: 0, unk15: 0 };

function script(records: string[]) {
    const bytes = new Uint8Array(2 + records.length * 10);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    records.forEach((raw, index) => {
        for (let i = 0; i < 10; i++)
            bytes[2 + index * 10 + i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    });
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}

const setup57 = "00570002000000000000";
const moveTo = "001900c800e400f00004";
const waitFinished = "0003050000000000ffff";
const moveBy = "001b0010002000300004";
const jump = "00080000000000000000";
const stop = "00090000000000000000";

test("reads simple move-to/move-by loops and movement-finished waits", () => {
    const plan = readObjectMotion(placement, script([setup57, moveTo, waitFinished, moveBy, waitFinished, jump, stop]));
    ok(plan);
    equal(plan.loop, true);
    equal(plan.segments.length, 2);
    deepEqual(plan.segments[0].target, [200, 300, 228]);
    deepEqual(plan.segments[1].target, [216, 300, 260]);
    equal(plan.totalTicks, 130);
});

test("movement-finished wait is required and unsupported scripts are rejected", () => {
    equal(readObjectMotion(placement, script([moveTo, "0003000000000000ffff", jump])), null);
    equal(readObjectMotion(placement, script(["001b7f7f000000000004", waitFinished, jump])), null);
    equal(readObjectMotion(placement, script([moveTo, waitFinished, "00250000000000000000"])), null);
    ok(readObjectMotion(placement, script([moveTo, waitFinished, stop])));
});

test("positions use the runtime ease and repeat deterministically", () => {
    const plan = readObjectMotion(placement, script([setup57, moveTo, waitFinished, moveBy, waitFinished, jump]))!;
    const start = computeObjectMotionPosition(plan, 0);
    deepEqual(start, [100, 300, 200]);
    const mid = computeObjectMotionPosition(plan, 32);
    ok(mid[0] > 100 && mid[0] < 200);
    const end = computeObjectMotionPosition(plan, plan.segments[0].ticks);
    deepEqual(end, [200, 300, 228]);
    const cycle = computeObjectMotionPosition(plan, plan.totalTicks);
    deepEqual(cycle, start);
    equal(computeObjectMotionPosition(plan, 10)[1], placement.y);
});

test("model matrix moves the platform pivot and follows the game tick", () => {
    const plan = readObjectMotion(placement, script([setup57, moveTo, waitFinished, moveBy, waitFinished, jump]))!;
    const state: ObjectMotionTransform = { plan, placement, scale: 1, originY: 0, localMatrix: null };
    const matrix = mat4.create();
    computeObjectMotionMatrix(matrix, state, 0);
    const p0 = vec3.transformMat4(vec3.create(), [0, 0, 0], matrix);
    computeObjectMotionMatrix(matrix, state, 65);
    const p1 = vec3.transformMat4(vec3.create(), [0, 0, 0], matrix);
    ok(p1[0] > p0[0]);
    ok(Number.isFinite(p1[1]) && Number.isFinite(p1[2]));
});

test("buildObjects attaches motion to platform draw calls", () => {
    const table = new ArrayBuffer(0x9C), tv = new DataView(table);
    tv.setUint16(0, 200); tv.setUint8(3, 6); tv.setUint32(4, 0x01000010);
    tv.setUint16(0x70, 0x800); tv.setInt16(0x74, 64); tv.setUint16(0x7A, 64);
    const entry = parseObjectTable(new ArrayBufferSlice(table))[0];
    const buffer = new ArrayBuffer(0x11300), view = new DataView(buffer);
    const offset = entry.displayLists[0] & 0xFFFFFF, vertexOffset = 0x11200;
    view.setUint32(offset, 0x04000000 | (3 << 10)); view.setUint32(offset + 4, 0x01000000 | vertexOffset);
    view.setUint32(offset + 8, 0xBF000000); view.setUint32(offset + 12, 0x00000204); view.setUint32(offset + 16, 0xB8000000);
    for (let i = 0; i < 3; i++) { view.setInt16(vertexOffset + i * 16 + 2, i === 2 ? 10 : 0); view.setUint8(vertexOffset + i * 16 + 15, 255); }
    const output = new RSPSharedOutput();
    const draws = buildObjects(output, [placement], new Map([[200, entry]]), [undefined, new ArrayBufferSlice(buffer)], parseLevelDat(new ArrayBufferSlice(new ArrayBuffer(0xA0))), script([setup57, moveTo, waitFinished, moveBy, waitFinished, jump]));
    ok(draws.length > 0);
    ok(draws.every((draw) => draw.objectMotion !== null && draw.modelMatrix !== null));
});

test("boulders remain static even with a simple motion script", () => {
    const table = new ArrayBuffer(0x9C), tv = new DataView(table);
    tv.setUint16(0, 2); tv.setUint8(3, 6); tv.setUint32(4, 0x01000010);
    tv.setUint16(0x70, 0x800); tv.setInt16(0x74, 64); tv.setUint16(0x7A, 64);
    const entry = parseObjectTable(new ArrayBufferSlice(table))[0];
    const buffer = new ArrayBuffer(0x11300), view = new DataView(buffer);
    const offset = entry.displayLists[0] & 0xFFFFFF, vertexOffset = 0x11200;
    view.setUint32(offset, 0x04000000 | (3 << 10)); view.setUint32(offset + 4, 0x01000000 | vertexOffset);
    view.setUint32(offset + 8, 0xBF000000); view.setUint32(offset + 12, 0x00000204); view.setUint32(offset + 16, 0xB8000000);
    for (let i = 0; i < 3; i++) { view.setInt16(vertexOffset + i * 16 + 2, i === 2 ? 10 : 0); view.setUint8(vertexOffset + i * 16 + 15, 255); }
    const output = new RSPSharedOutput();
    const draws = buildObjects(output, [{ ...placement, id: 2 }], new Map([[2, entry]]), [undefined, new ArrayBufferSlice(buffer)], parseLevelDat(new ArrayBufferSlice(new ArrayBuffer(0xA0))), script([setup57, moveTo, waitFinished, moveBy, waitFinished, jump]));
    ok(draws.length > 0);
    ok(draws.every((draw) => draw.objectMotion === null && draw.modelMatrix === null));
});
