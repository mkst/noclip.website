import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { mat4, vec3 } from "gl-matrix";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { mirrorZ, parseLevelDat } from "../core/level.js";
import type { LevelObjectPlacement } from "../core/level.js";
import { buildObjects, parseObjectTable } from "../objects/objects.js";
import { computeObjectRotationMatrix, readObjectRotation } from "../objects/object_rotation.js";
import type { ObjectRotationTransform } from "../objects/object_rotation.js";
import { parseCommands } from "../commands/paths.js";

(globalThis as any).window = { debug: false };

const placement: LevelObjectPlacement = { id: 116, x: 2822, z: 2350, y: 861, angle: 90, zRotation: 0, scale: 14336, unkC: 0, commandReferenceIdx: 1, commandsLength: 0, unk12: 0, unk15: 0 };
const rotate = "00321001000100000000";
const stop = "00090000000000000000";

function script(records: string[] = [rotate, stop]) {
    const bytes = new Uint8Array(2 + records.length * 10);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    records.forEach((raw, index) => {
        for (let i = 0; i < 10; i++)
            bytes[2 + index * 10 + i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    });
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}

function close(a: ArrayLike<number>, b: ArrayLike<number>) {
    for (let i = 0; i < a.length; i++)
        ok(Math.abs(a[i] - b[i]) < 0.002, `${i}: ${a[i]} versus ${b[i]}`);
}

test("SOMETHING_FISHY wheels retain continuous rotation after their script stops", () => {
    deepEqual(readObjectRotation(placement, script()), { zPerTick: 1, yPerTick: 0 });
    deepEqual(readObjectRotation(placement, script(["00321008ffff00000002", stop])), { zPerTick: -1, yPerTick: 2 });
    deepEqual(readObjectRotation({ ...placement, commandReferenceIdx: 2, commandsLength: 1 }, script([stop, stop, rotate, stop])), { zPerTick: 1, yPerTick: 0 });
});

test("parade/credits flag setup and the speaker's rotate-stop script retain their source rates", () => {
    deepEqual(readObjectRotation(placement, script(["00570000000000000000", "003d0000000100001100", "00321002000000000001", stop])), { zPerTick: 0, yPerTick: 1 });
    deepEqual(readObjectRotation(placement, script(["00321001000000000002", stop])), { zPerTick: 0, yPerTick: 2 });
    for (const setup of ["003d0001000100001100", "003d7f7f000100001100", "003d0000000100001110"])
        equal(readObjectRotation(placement, script([setup, rotate, stop])), null);
});

test("unsupported commands, changing targets, expressions and later rotation changes are rejected", () => {
    for (const raw of ["00060001000000000000", "00030000000000000000", "00140001000000000000", "003210017f7f00000000", "00322001000100000000", "00321001000100010000", "003d0000000000001200"])
        equal(readObjectRotation(placement, script([raw, stop])), null, raw);
    equal(readObjectRotation(placement, script([rotate, rotate, stop])), null);
    equal(readObjectRotation(placement, script([rotate])), null);
    equal(readObjectRotation({ ...placement, commandReferenceIdx: 0, unk12: 1 }, script()), null);
    equal(readObjectRotation(placement, script([rotate, "00030000000000000000", stop])), null);
});

test("rotation uses signed degrees per 30 Hz tick with a fixed pivot and deterministic seeking", () => {
    const state: ObjectRotationTransform = { placement: { ...placement, angle: 0 }, rotation: { zPerTick: 1, yPerTick: 0 }, scale: 7, originY: 133, localMatrix: null };
    const matrix = mat4.create();
    computeObjectRotationMatrix(matrix, state, 0);
    close(vec3.transformMat4(vec3.create(), [0, 0, 0], matrix), [2822, 994, mirrorZ(2350)]);
    close(vec3.transformMat4(vec3.create(), [0, 0, 1], matrix), [2822, 1001, mirrorZ(2350)]);
    computeObjectRotationMatrix(matrix, state, 90);
    close(vec3.transformMat4(vec3.create(), [0, 0, 1], matrix), [2822, 994, mirrorZ(2350) + 7]);
    const quarterTurn = Array.from(matrix);
    computeObjectRotationMatrix(matrix, state, 360);
    close(vec3.transformMat4(vec3.create(), [0, 0, 1], matrix), [2822, 1001, mirrorZ(2350)]);
    computeObjectRotationMatrix(matrix, state, 90);
    deepEqual(Array.from(matrix), quarterTurn);
    state.rotation.zPerTick = -1;
    computeObjectRotationMatrix(matrix, state, 90);
    close(vec3.transformMat4(vec3.create(), [0, 0, 1], matrix), [2822, 994, mirrorZ(2350) - 7]);
});

test("object normals follow the same rotation as positions and preserve triangle winding", () => {
    const state: ObjectRotationTransform = { placement, rotation: { zPerTick: 1, yPerTick: 2 }, scale: 7, originY: 133, localMatrix: mat4.fromTranslation(mat4.create(), [10, 2, 4]) };
    const matrix = mat4.create();
    for (const tick of [0, 45, 90, 210]) {
        computeObjectRotationMatrix(matrix, state, tick);
        const p = [[0, 0, 0], [1, 0, 0], [0, 1, 0]].map(v => vec3.transformMat4(vec3.create(), v, matrix));
        const geometricNormal = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), vec3.sub(vec3.create(), p[1], p[0]), vec3.sub(vec3.create(), p[2], p[0])));
        const vertexNormal = vec3.normalize(vec3.create(), vec3.fromValues(matrix[8], matrix[9], matrix[10]));
        close(vertexNormal, geometricNormal);
        ok(mat4.determinant(matrix) > 0);
    }
});

test("animated object vertices match the existing static placement at time zero", () => {
    const table = new ArrayBuffer(0x9C), tv = new DataView(table);
    tv.setUint16(0, 116); tv.setUint8(3, 6); tv.setUint32(4, 0x01000010);
    tv.setUint8(0x15, 4); tv.setInt16(0x74, 19); tv.setUint16(0x7A, 38);
    const entry = parseObjectTable(new ArrayBufferSlice(table))[0];
    const buffer = new ArrayBuffer(0x80), v = new DataView(buffer);
    v.setUint32(0x10, 0x04000000 | (3 << 10)); v.setUint32(0x14, 0x01000040);
    v.setUint32(0x18, 0xBF000000); v.setUint32(0x1C, 0x00000204); v.setUint32(0x20, 0xB8000000);
    for (let i = 0; i < 3; i++) {
        v.setInt16(0x40 + i * 16, i === 1 ? 32 : 0);
        v.setInt16(0x42 + i * 16, i === 2 ? 32 : 0);
        v.setUint8(0x4E + i * 16, 127); v.setUint8(0x4F + i * 16, 255);
    }
    const dat = parseLevelDat(new ArrayBufferSlice(new ArrayBuffer(0xA0)));
    const staticOutput = new RSPSharedOutput(), animatedOutput = new RSPSharedOutput();
    const segments = [undefined, new ArrayBufferSlice(buffer)];
    const entries = new Map([[116, entry]]);
    const staticDraw = buildObjects(staticOutput, [placement], entries, segments, dat)[0];
    const animatedDraw = buildObjects(animatedOutput, [placement], entries, segments, dat, script())[0];
    ok(animatedDraw.objectRotation); ok(animatedDraw.modelMatrix);
    equal(staticDraw.modelMatrix, null);
    for (let i = 0; i < staticOutput.vertices.length; i++) {
        const a = animatedOutput.vertices[i], b = staticOutput.vertices[i];
        close(vec3.transformMat4(vec3.create(), [a.x, a.y, a.z], animatedDraw.modelMatrix), [b.x, b.y, b.z]);
    }
    close(vec3.transformMat4(vec3.create(), animatedDraw.center, animatedDraw.modelMatrix), staticDraw.center);
    entry.collideHeight = 40;
    equal(buildObjects(new RSPSharedOutput(), [placement], entries, segments, dat, script())[0].objectRotation, null);
    const yawDraw = buildObjects(new RSPSharedOutput(), [placement], entries, segments, dat, script(["00321002000000000001", stop]))[0];
    ok(yawDraw.objectRotation);
    for (const tick of [0, 45, 90, 180]) {
        computeObjectRotationMatrix(yawDraw.modelMatrix!, yawDraw.objectRotation, tick);
        close(vec3.transformMat4(vec3.create(), [0, 0, 0], yawDraw.modelMatrix!), [placement.x, placement.y + 140, mirrorZ(placement.z)]);
    }
    equal(buildObjects(new RSPSharedOutput(), [{ ...placement, zRotation: 90 }], entries, segments, dat, script(["00321002000000000001", stop]))[0].objectRotation, null);
});

test("all three speaker model parts share the rotating placement transform", () => {
    const table = new ArrayBuffer(0x9C), tv = new DataView(table);
    tv.setUint16(0, 141); tv.setUint8(3, 15); tv.setUint32(4, 0x01000010);
    tv.setUint8(0x15, 4); tv.setInt16(0x74, 20); tv.setUint16(0x7A, 42);
    const entry = parseObjectTable(new ArrayBufferSlice(table))[0];
    const buffer = new ArrayBuffer(0x11300), view = new DataView(buffer);
    entry.displayLists.forEach((address, part) => {
        const offset = address & 0xFFFFFF, vertexOffset = 0x11200 + part * 0x30;
        view.setUint32(offset, 0x04000000 | (3 << 10)); view.setUint32(offset + 4, 0x01000000 | vertexOffset);
        view.setUint32(offset + 8, 0xBF000000); view.setUint32(offset + 12, 0x00000204); view.setUint32(offset + 16, 0xB8000000);
        for (let i = 0; i < 3; i++) {
            view.setInt16(vertexOffset + i * 16, part * 20 + (i === 1 ? 10 : 0));
            view.setInt16(vertexOffset + i * 16 + 2, i === 2 ? 10 : 0);
            view.setUint8(vertexOffset + i * 16 + 14, 127); view.setUint8(vertexOffset + i * 16 + 15, 255);
        }
    });
    const p = { ...placement, id: 141, x: 800, y: 600, z: 1568, angle: 0, scale: 4096 };
    const output = new RSPSharedOutput();
    const draws = buildObjects(output, [p], new Map([[141, entry]]), [undefined, new ArrayBufferSlice(buffer)], parseLevelDat(new ArrayBufferSlice(new ArrayBuffer(0xA0))), script(["00321001000000000002", stop]));
    equal(draws.length, 3);
    for (const tick of [0, 45, 90, 180]) {
        for (const draw of draws) {
            ok(draw.objectRotation); ok(draw.modelMatrix);
            computeObjectRotationMatrix(draw.modelMatrix, draw.objectRotation, tick);
            close(draw.modelMatrix, draws[0].modelMatrix!);
            close(vec3.transformMat4(vec3.create(), [0, 0, 0], draw.modelMatrix), [800, 642, mirrorZ(1568)]);
        }
        const first = draws.map(draw => output.vertices[output.indices[draw.firstIndex]]).map(v => vec3.transformMat4(vec3.create(), [v.x, v.y, v.z], draws[0].modelMatrix!));
        ok(Math.abs(vec3.distance(first[0], first[1]) - 40) < 0.002);
        ok(Math.abs(vec3.distance(first[1], first[2]) - 40) < 0.002);
    }
});
