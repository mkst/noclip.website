import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { mat4, vec3 } from "gl-matrix";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import type { LevelObjectPlacement, LevelPath } from "../core/level.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLinks, parseObjects, parsePaths } from "../core/level.js";
import { computeObjectPathMatrix, computeObjectPathPosition, readObjectPathPilot } from "../objects/object_path.js";
import type { ObjectPathTransform } from "../objects/object_path.js";
import { analyzePathUses, parseCommands } from "../commands/paths.js";

const placement: LevelObjectPlacement = { id: 94, x: 0, z: 0, y: 0, angle: 0, zRotation: 0, scale: 0x800, unkC: 0, commandReferenceIdx: 1, commandsLength: 0, unk12: 0, unk15: 0 };
const paths: LevelPath[] = [{ index: 0, waypoints: [{ x: 0, z: 0, y: 0 }, { x: 10, z: 0, y: 0 }, { x: 10, z: 10, y: 0 }, { x: 0, z: 10, y: 0 }] }];

function script(records: string[]) {
    const bytes = new Uint8Array(2 + records.length * 10);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    records.forEach((raw, index) => {
        for (let i = 0; i < 10; i++)
            bytes[2 + index * 10 + i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    });
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}

function readPilot(placement: LevelObjectPlacement, commands: ReturnType<typeof parseCommands>, paths: LevelPath[]) {
    return readObjectPathPilot(placement, 0, commands, analyzePathUses(paths, commands, [placement], []));
}

const follow0 = "00340000000300010000";
const follow1 = "003400000002ffff0000";
const follow9 = "00340009000500010101";

test("reads a path-follow pilot from a traced initial self-targeted command", () => {
    deepEqual(readPilot(placement, script([follow0]), paths), { commandIndex: 0, path: paths[0], speedPerTick: 3, direction: 1, loop: true });
    deepEqual(readPilot(placement, script([follow1]), paths), { commandIndex: 0, path: paths[0], speedPerTick: 2, direction: -1, loop: true });
    equal(readPilot(placement, script(["00350000000000000000"]), paths), null);
    equal(readPilot(placement, script(["00340001000300010000"]), [{ index: 1, waypoints: [] }]), null);
});

test("one-way paths clamp at the final waypoint", () => {
    const many = Array.from({ length: 10 }, (_, index): LevelPath => ({ index, waypoints: index === 0 ? paths[0].waypoints : [] }));
    many[9] = { index: 9, waypoints: paths[0].waypoints };
    const pilot = readPilot(placement, script([follow9]), many)!;
    equal(pilot.loop, false);
    const a = computeObjectPathPosition(pilot, 500);
    const b = computeObjectPathPosition(pilot, 5000);
    deepEqual(a, b);
});

test("path sampling is periodic and direction-sensitive", () => {
    const forward = readPilot(placement, script([follow0]), paths)!;
    const reverse = readPilot(placement, script([follow1]), paths)!;
    const start = computeObjectPathPosition(forward, 0);
    const cycle = paths[0].waypoints.length * 128 / forward.speedPerTick;
    const wrapped = computeObjectPathPosition(forward, cycle);
    ok(Math.abs(start[0] - wrapped[0]) < 1e-6 && Math.abs(start[1] - wrapped[1]) < 1e-6 && Math.abs(start[2] - wrapped[2]) < 1e-6);
    const a = computeObjectPathPosition(forward, 20);
    const b = computeObjectPathPosition(reverse, 20);
    ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1);
});

test("path model matrices remain finite and move the platform pivot", () => {
    const pilot = readPilot(placement, script([follow0]), paths)!;
    const state: ObjectPathTransform = { pilot, placement, scale: 1, originY: 0, localMatrix: null };
    const matrix = mat4.create();
    computeObjectPathMatrix(matrix, state, 0);
    const p0 = vec3.transformMat4(vec3.create(), [0, 0, 0], matrix);
    computeObjectPathMatrix(matrix, state, 30);
    const p1 = vec3.transformMat4(vec3.create(), [0, 0, 0], matrix);
    ok(p0.every(Number.isFinite) && p1.every(Number.isFinite));
    ok(Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]) > 0);
});


test("path motion cannot cross a stop into another entity's assigned script", () => {
    const commands = script(["00090000000000000000", follow0, "00090000000000000000"]);
    const analysis = analyzePathUses(paths, commands, [placement], [{ id: 33, unkC: 2, unkE: 0 }]);
    equal(readObjectPathPilot(placement, 0, commands, analysis), null);
    deepEqual(analysis.paths[0].roles, ["animal"]);
});

test("an object's script selecting a linked object does not animate either as an initial self-targeted pilot", () => {
    const commands = script(["00140001000000000000", follow0, "00090000000000000000"]);
    const linked = { ...placement, commandReferenceIdx: 0 };
    const analysis = analyzePathUses(paths, commands, [placement, linked], [], [{ parent: 0, child: 1, referenceIdx: 0 }]);
    equal(analysis.paths[0].uses[0].target?.index, 1);
    equal(readObjectPathPilot(placement, 0, commands, analysis), null);
    equal(readObjectPathPilot(linked, 1, commands, analysis), null);
});

test("event-only ownership and missing evidence do not activate a path animation", () => {
    const commands = script([follow0, "00090000000000000000"]);
    const event = { ...placement, commandReferenceIdx: 0, unk12: 1 };
    const analysis = analyzePathUses(paths, commands, [event], []);
    equal(analysis.paths[0].uses[0].source?.activation, "event");
    equal(readObjectPathPilot(event, 0, commands, analysis), null);
    equal(readObjectPathPilot(placement, 0, commands, null), null);
});

test("movement parameter validation preserves full object path IDs and rejects expression speeds or unsupported modes", () => {
    for (const raw of ["001d0100000300010000", "001d00007f8000010000", "00340000000300010200"])
        equal(readPilot(placement, script([raw, "00090000000000000000"]), paths), null);
});

test("proven ownership outside the bounded initial pilot does not broaden automatic animation", () => {
    const commands = script([...Array<string>(16).fill("00000000000000000000"), follow0, "00090000000000000000"]);
    const analysis = analyzePathUses(paths, commands, [placement], []);
    equal(analysis.paths[0].uses[0].commandIndex, 16);
    equal(readObjectPathPilot(placement, 0, commands, analysis), null);
});

for (const level of ["SMASHING_START", "SNOW_JOKE"]) {
    const filename = `data/SSSV/levels/${level}.bin`;
    test(`${level} selects only the intended original path-motion pilots`, { skip: !existsSync(filename) }, () => {
        const payloads = parseLevelContainer(ArrayBufferSlice.fromView(readFileSync(filename)));
        const commands = parseCommands(findPayload(payloads, LevelPayloadType.Cmd));
        const paths = parsePaths(findPayload(payloads, LevelPayloadType.Paf));
        const objects = parseObjects(findPayload(payloads, LevelPayloadType.Cob)!);
        const animals = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!);
        const links = parseLinks(findPayload(payloads, LevelPayloadType.Joi)!);
        const analysis = analyzePathUses(paths, commands, objects, animals, links);
        if (level === "SMASHING_START") {
            equal(readObjectPathPilot(objects[14], 14, commands, analysis), null);
            equal(readObjectPathPilot(objects[15], 15, commands, analysis), null);
        } else {
            for (const [index, commandIndex, pathId, speedPerTick, direction, loop] of [
                [8, 32, 0, 2, 1, true], [2, 53, 1, 3, -1, true], [3, 372, 9, 5, 1, false],
            ] as const) {
                deepEqual(readObjectPathPilot(objects[index], index, commands, analysis), {
                    commandIndex, path: paths[pathId], speedPerTick, direction, loop,
                });
            }
        }
    });
}
