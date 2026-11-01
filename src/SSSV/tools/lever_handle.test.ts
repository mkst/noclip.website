import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { mat4, vec3 } from "gl-matrix";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { RainButtonRuntime, readRainButton } from "../objects/buttons.js";
import { computeLeverHandleMatrix, leverHandleOffset, stepLeverPhase } from "../objects/lever_handle.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseLevelDat, parseObjects } from "../core/level.js";
import { buildObjects, indexObjectTable, parseObjectTable } from "../objects/objects.js";
import { parseCommands } from "../commands/paths.js";
import type { LevelObjectPlacement } from "../core/level.js";

(globalThis as any).window = { debug: false };
const p: LevelObjectPlacement = { id: 45, x: 100, y: 200, z: 300, angle: 0, zRotation: 0, unkC: 2, scale: 2048, commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 };

test('source COS shifts preserve asymmetric rounding, scale, tilt and heading', () => {
    deepEqual(leverHandleOffset(0, 2048, 0, 0), [0, 7.875, 0]);
    deepEqual(leverHandleOffset(128, 2048, 0, 0), [0, -8, 0]);
    deepEqual(leverHandleOffset(64, 2048, 0, 0), [0, 0, 0]);
    deepEqual(leverHandleOffset(0, 1024, 0, 0), [0, 3.875, 0]);
    deepEqual(leverHandleOffset(0, 2048, 90, 90), [-7.875, 0, 0]);
    deepEqual(leverHandleOffset(128, 2048, 90, 90), [8, 0, 0]);
});

test('local handle matrix applies offset once and mirrors source Z once', () => {
    const state = { placement: { ...p, angle: 90, zRotation: 90 }, scale: 2048, collideHeight: 42, phase: 0, initialPhase: 0 };
    const m = mat4.create(); computeLeverHandleMatrix(m, state);
    deepEqual(Array.from(vec3.transformMat4(vec3.create(), [0, 0, 0], m)), [92.125, 221, 6868]);
    state.phase = 128; computeLeverHandleMatrix(m, state);
    deepEqual(Array.from(vec3.transformMat4(vec3.create(), [0, 0, 0], m)), [108, 221, 6868]);
});

test('the callback reaches each endpoint in 16 ticks, clamps and can reverse mid-travel', () => {
    let phase = 0;
    for (let i = 0; i < 16; i++) phase = stepLeverPhase(phase, 1);
    equal(phase, 128); equal(stepLeverPhase(phase, 1), 128);
    for (let i = 0; i < 16; i++) phase = stepLeverPhase(phase, 0);
    equal(phase, 0); equal(stepLeverPhase(phase, 0), 0);
    equal(stepLeverPhase(stepLeverPhase(64, 1), 0), 64);
});

const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));
const available = existsSync('data/SSSV/objects.bin');
function fixture(level: string) {
    const payload = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
    return { objects: parseObjects(findPayload(payload, LevelPayloadType.Cob)!), commands: parseCommands(findPayload(payload, LevelPayloadType.Cmd)),
        dat: parseLevelDat(findPayload(payload, LevelPayloadType.Dat)!), table: indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin'))) };
}

test('Jungle command state changes follow the visual callback, and reset/disable clear travel', { skip: !available }, () => {
    const f = fixture('JUNGLE_DOLDRUMS'), r = new RainButtonRuntime(readRainButton(f.objects, f.commands)!);
    r.setEnabled(true); equal(r.leverPhase, 0); r.activate(); r.step();
    equal(r.state, 1); equal(r.leverPhase, 0);
    for (let i = 1; i <= 16; i++) { r.step(); equal(r.leverPhase, i * 8); }
    let budget = 400;
    while (r.state === 1 && budget-- > 0) r.step();
    equal(r.state, 0); equal(r.leverPhase, 128);
    for (let i = 1; i <= 16; i++) { r.step(); equal(r.leverPhase, 128 - i * 8); }
    r.reset(); equal(r.leverPhase, 0); r.setEnabled(false); equal(r.leverPhase, 0);
});

test('Lagoon handles use local geometry at known on endpoints and leave their bases static', { skip: !available }, () => {
    const f = fixture('HONEYMOON_LAGOON'), out = new RSPSharedOutput(), segments: (ArrayBufferSlice | undefined)[] = [];
    segments[1] = read('data/SSSV/segments/segment1.bin');
    const draws = buildObjects(out, f.objects.slice(30, 34), f.table, segments, f.dat, f.commands);
    const handles = draws.filter(c => c.leverHandle !== null);
    equal(new Set(handles.map(c => c.objectPlacementIndex)).size, 4);
    ok(handles.every(c => c.leverHandle!.phase === 128 && c.leverHandle!.initialPhase === 128 && c.modelMatrix !== null));
    ok(draws.some(c => c.leverHandle === null && c.modelMatrix === null));
    for (const c of handles) {
        const state = c.leverHandle!, original = Array.from(c.modelMatrix!);
        state.phase = 0; computeLeverHandleMatrix(c.modelMatrix!, state);
        ok(c.modelMatrix!.some((value, i) => Math.abs(value - original[i]) > 1));
    }
});
