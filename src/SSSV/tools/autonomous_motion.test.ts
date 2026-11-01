import { deepEqual, equal, ok } from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { mat4, vec3 } from 'gl-matrix';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { RSPSharedOutput } from '../../BanjoKazooie/f3dex.js';
import { findPayload, LevelPayloadType as P, parseLevelContainer, parseLevelDat, parseObjects } from '../core/level.js';
import type { LevelObjectPlacement } from '../core/level.js';
import { BIOME_SEGMENTS, LEVELS, LEVEL_SEGMENT_ALIASES } from '../core/level_table.js';
import { parseCommands } from '../commands/paths.js';
import { buildObjects, indexObjectTable, parseObjectTable } from '../objects/objects.js';
import { ObjectCommandRuntime, readObjectPrograms } from '../objects/object_commands.js';
import { computeObjectMotionMatrix, readObjectMotion } from '../objects/object_motion.js';
import { SSSVDrawCall } from '../render/terrain.js';
import { parseMipmapBank } from '../core/texture.js';

(globalThis as any).window = { debug: false };
const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
const available = existsSync('data/SSSV/levels/GIVE_A_DOG_A_BONUS.bin');

function bank(records: string[], base = 0) {
    const bytes = new Uint8Array(2 + (base + records.length) * 10), v = new DataView(bytes.buffer);
    v.setUint16(0, bytes.length);
    records.forEach((record, i) => {
        for (let n = 0; n < 10; n++) bytes[2 + (base + i) * 10 + n] = parseInt(record.slice(n * 2, n * 2 + 2), 16);
    });
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}
const word = (v: number) => (v & 65535).toString(16).padStart(4, '0');
function fixture(axis = 0, delta = 200, speed = 2, cursor = 0, base = 0, id = 23) {
    const vector = [0, 0, 0]; vector[axis] = delta;
    const move = (sign: number) => `001b${vector.map(v => word(sign * v)).join('')}${word(speed)}`;
    const records = [...Array(cursor).fill('00090000000000000000'), move(1), '000305007fd30016ffff', move(-1), '0003050000000000ffff', `0008${word(cursor - 1)}000000000000`];
    const commands = bank(records, base);
    const placement: LevelObjectPlacement = { id, x: 1000, z: 2000, y: 300, angle: 30, zRotation: 0, unkC: 0,
        scale: 2048, commandReferenceIdx: base + 1, commandsLength: cursor, unk12: 0, unk15: 0 };
    const bytes = new Uint8Array(0x9C), v = new DataView(bytes.buffer);
    v.setUint16(0, id); v.setUint8(3, 6); v.setUint8(0x15, 4); v.setUint8(0x82, 0x42);
    v.setUint32(4, 0x01000010); v.setUint16(0x7A, 16);
    const definition = parseObjectTable(ArrayBufferSlice.fromView(bytes))[0], table = new Map([[id, definition]]);
    const segment = new Uint8Array(0x80), s = new DataView(segment.buffer);
    s.setUint32(0x10, 0x04000000 | (3 << 10)); s.setUint32(0x14, 0x01000040);
    s.setUint32(0x18, 0xBF000000); s.setUint32(0x1C, 0x00000204); s.setUint32(0x20, 0xB8000000);
    for (let i = 0; i < 3; i++) {
        s.setInt16(0x40 + i * 16, i === 1 ? 32 : 0); s.setInt16(0x42 + i * 16, i === 2 ? 32 : 0);
        s.setUint8(0x4E + i * 16, 127); s.setUint8(0x4F + i * 16, 255);
    }
    const output = new RSPSharedOutput();
    const calls = buildObjects(output, [placement], table, [undefined, ArrayBufferSlice.fromView(segment)],
        parseLevelDat(ArrayBufferSlice.fromView(new Uint8Array(0xA0))), commands);
    const configs = readObjectPrograms([placement], commands, table, calls);
    return { placement, commands, table, definition, output, calls, configs, start: base + cursor };
}

function realFixture(level: string, index: number) {
    const entry = LEVELS.find(l => l.id === level)!, payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
    const dat = parseLevelDat(findPayload(payloads, P.Dat)!), objects = parseObjects(findPayload(payloads, P.Cob)!);
    const commands = parseCommands(findPayload(payloads, P.Cmd)), table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    const biome = BIOME_SEGMENTS[dat.segment], output = new RSPSharedOutput();
    if (biome) parseMipmapBank(read(`data/SSSV/textures/${biome}.rgba16.bin`), 'rgba16', biome)
        .forEach((t, i) => output.textureCache.textures[i] = t);
    parseMipmapBank(read(`data/SSSV/textures/${entry.textureBank}.bin`), 'rgba16', entry.textureBank)
        .forEach((t, i) => output.textureCache.textures[20 + i] = t);
    const segments = [undefined, read('data/SSSV/segments/segment1.bin'), undefined, undefined,
        biome ? read(`data/SSSV/segments/${biome}_biome.bin`) : undefined,
        read(`data/SSSV/segments/${LEVEL_SEGMENT_ALIASES[level] ?? level}.bin`)];
    const calls = buildObjects(output, [objects[index]], table, segments, dat, commands);
    for (const call of calls) call.objectPlacementIndex = index;
    const configs = readObjectPrograms(objects, commands, table, calls).filter(c => c.kind === 'autonomous-motion');
    return { placement: objects[index], commands, table, output, calls, configs };
}

test('Dog Bonus #37 executes its original signed-jump loop on the previously static geometry', { skip: !available }, () => {
    const f = realFixture('GIVE_A_DOG_A_BONUS', 37);
    equal(f.configs.length, 1); equal(f.configs[0].placementIndex, 37);
    equal(readObjectMotion(f.placement, f.commands), null);
    ok(f.calls.length > 0); ok(f.calls.every(c => c.objectMotion === null && c.modelMatrix === null));
    const vertices = f.output.vertices.map(v => [v.x, v.y, v.z]), centers = f.calls.map(c => vec3.clone(c.center));
    const r = new ObjectCommandRuntime(f.configs, f.commands, f.table, f.calls), o = r.world.objects.get('object:37')!;
    r.advanceTo(0);
    for (const [tick, dx, command] of [[128, 500, 252], [129, 500, 254], [257, 0, 254], [258, 0, 252], [386, 500, 252]]) {
        r.advanceTo(tick);
        equal(o.fixedPosition[0] / 65536, f.placement.x + dx);
        equal(r.entries[0].vm.location.commandIndex, command); equal(r.entries[0].vm.diagnostic, null);
        f.calls.forEach((c, i) => {
            equal(c.modelMatrix![12], dx); equal(c.center[0], centers[i][0] + dx);
            equal(c.objectMotion, null); equal(c.objectRotation, null);
        });
    }
    for (let cycle = 2; cycle <= 12; cycle++) {
        r.advanceTo(258 * cycle);
        equal(o.fixedPosition[0] / 65536, f.placement.x); equal(r.entries[0].vm.diagnostic, null);
    }
    deepEqual(f.output.vertices.map(v => [v.x, v.y, v.z]), vertices);
    r.setAutonomousEnabled(false);
    f.calls.forEach((c, i) => { equal(c.modelMatrix, null); deepEqual(c.center, centers[i]); });
});

test('the same mechanism admits all four Parade objects and translates their translucent sort centres', { skip: !available }, () => {
    for (const index of [100, 101, 105, 106]) {
        const f = realFixture('BIG_CELEBRATION_PARADE', index), centers = f.calls.map(c => vec3.clone(c.center));
        equal(f.configs.length, 1); equal(f.configs[0].placementIndex, index); ok(f.calls.length > 0);
        const r = new ObjectCommandRuntime(f.configs, f.commands, f.table, f.calls);
        r.advanceTo(0); r.advanceTo(256);
        equal(r.world.objects.get(`object:${index}`)!.fixedPosition[1] / 65536, f.placement.y + 200);
        f.calls.forEach((c, i) => { equal(c.modelMatrix![13], 200); ok(Math.abs(c.center[1] - centers[i][1] - 200) < 0.001); });
        r.advanceTo(513); equal(r.world.objects.get(`object:${index}`)!.fixedPosition[1] / 65536, f.placement.y);
        for (let cycle = 2; cycle <= 6; cycle++) {
            r.advanceTo(514 * cycle);
            equal(r.world.objects.get(`object:${index}`)!.fixedPosition[1] / 65536, f.placement.y);
        }
        equal(r.entries[0].vm.diagnostic, null);
    }
});

test('movement admission is independent of object IDs, bank addresses, axes and preview recognition', () => {
    for (const [axis, delta, cursor, base, id] of [[0, 200, 0, 0, 23], [1, -100, 0, 19, 209], [2, 300, 2, 41, 84]]) {
        const f = fixture(axis, delta, 2, cursor, base, id);
        equal(f.configs.length, 1);
        const centers = f.calls.map(c => vec3.clone(c.center));
        const r = new ObjectCommandRuntime(f.configs, f.commands, f.table, f.calls), o = r.world.objects.get('object:0')!;
        const worldCenter = vec3.clone(f.calls[0].center);
        r.advanceTo(0); r.advanceTo(128);
        const xyz = [0, 2, 1][axis], viewerDelta = axis === 1 ? -delta : delta;
        equal(o.fixedPosition[xyz] / 65536, [f.placement.x, f.placement.z, f.placement.y][axis] + delta);
        ok(Math.abs(f.calls[0].center[xyz] - worldCenter[xyz] - viewerDelta) < 0.001);
        equal(r.entries[0].vm.diagnostic, null);
        r.setAutonomousEnabled(false);
        if (cursor === 0) {
            f.calls.forEach((c, i) => { equal(c.modelMatrix, null); deepEqual(c.center, centers[i]); });
        } else {
            ok(readObjectMotion(f.placement, f.commands));
        }
        r.setAutonomousEnabled(true); r.advanceTo(129); r.advanceTo(257);
        equal(o === r.world.objects.get('object:0'), false);
        equal(r.world.objects.get('object:0')!.fixedPosition[xyz] / 65536, [f.placement.x, f.placement.z, f.placement.y][axis] + delta);
    }
});

test('one binding selects the preview or live pose and never lets draw submission reapply either', () => {
    const f = fixture(0, 200, 2, 2), preview = f.calls[0].objectMotion!;
    ok(preview); const localCenter = vec3.clone(f.calls[0].center);
    const r = new ObjectCommandRuntime(f.configs, f.commands, f.table, f.calls), call = f.calls[0];
    r.advanceTo(0); r.advanceTo(40); r.setAutonomousEnabled(false);
    const expected = mat4.create(); computeObjectMotionMatrix(expected, preview, 40);
    deepEqual(call.modelMatrix, expected);
    deepEqual(call.center, vec3.transformMat4(vec3.create(), localCenter, expected));
    equal(call.objectMotion, null); equal(call.objectRotation, null);
    r.advanceTo(90); computeObjectMotionMatrix(expected, preview, 90); deepEqual(call.modelMatrix, expected);
    for (let n = 0; n < 4; n++) {
        r.setAutonomousEnabled(true); r.setAutonomousEnabled(false);
        deepEqual(call.modelMatrix, expected);
    }
    r.reset(); deepEqual(call.modelMatrix, expected);
});

test('all baked parts follow their placement while unrelated geometry and visibility remain independent', () => {
    const f = fixture(), part = Object.assign(new SSSVDrawCall(), f.calls[0]), unrelated = new SSSVDrawCall();
    part.center = vec3.add(vec3.create(), f.calls[0].center, [10, 20, 30]); part.visible = false;
    unrelated.objectPlacementIndex = 1; unrelated.indexCount = 3;
    const center = vec3.clone(part.center), calls = [...f.calls, part, unrelated];
    const configs = readObjectPrograms([f.placement], f.commands, f.table, calls);
    const r = new ObjectCommandRuntime(configs, f.commands, f.table, calls);
    r.advanceTo(0); r.advanceTo(128);
    equal(part.modelMatrix![12], 200); equal(part.visible, false);
    deepEqual(part.center, vec3.add(vec3.create(), center, [200, 0, 0]));
    equal(unrelated.modelMatrix, null); deepEqual(unrelated.center, vec3.create());
    r.setAutonomousEnabled(false); equal(part.modelMatrix, null); deepEqual(part.center, center);
    r.setAutonomousEnabled(true); r.advanceTo(129); r.advanceTo(257);
    equal(part.modelMatrix![12], 200); deepEqual(part.center, vec3.add(vec3.create(), center, [200, 0, 0]));
});

test('pause, repeated frames, disable/re-enable, reset and seeks preserve bounded VM and visual state', () => {
    const f = fixture(), r = new ObjectCommandRuntime(f.configs, f.commands, f.table, f.calls), call = f.calls[0];
    r.advanceTo(0); r.advanceTo(30); const before = mat4.clone(call.modelMatrix!), tick = r.entries[0].tick;
    r.advanceTo(30); equal(r.entries[0].tick, tick); deepEqual(call.modelMatrix, before);
    r.motionEnabled = false; r.advanceTo(200); equal(r.entries[0].tick, tick); deepEqual(call.modelMatrix, before);
    r.motionEnabled = true; r.advanceTo(201); equal(r.entries[0].tick, tick + 1);
    call.visible = false; r.advanceTo(202); equal(call.visible, false);
    r.setAutonomousEnabled(false); equal(call.modelMatrix, null); equal(r.entries[0].tick, 0);
    r.advanceTo(400); equal(r.entries[0].tick, 0);
    r.setAutonomousEnabled(true); r.advanceTo(400); equal(r.entries[0].tick, 1);
    r.advanceTo(401); equal(r.entries[0].tick, 2);
    r.advanceTo(1); equal(r.entries[0].tick, 1); equal(call.modelMatrix![12], 0);
    r.advanceTo(10000); equal(r.entries[0].tick, 1); equal(call.modelMatrix![12], 0);
    r.reset(); equal(r.world.objects.size, 1); equal(r.entries[0].tick, 1);
    r.advanceTo(10001); r.advanceTo(10002); equal(r.entries[0].vm.diagnostic, null);
    f.commands[f.start + 3].opcode = 0xFFFF; r.advanceTo(10200);
    ok(r.entries[0].vm.diagnostic); equal(call.modelMatrix, null);
    f.commands[f.start + 3].opcode = 3; r.reset(); equal(r.entries[0].vm.diagnostic, null);
});

test('unsupported object definitions, state dependencies, side effects and malformed loops stay unadmitted', () => {
    const f = fixture();
    for (const change of [{ updateCallback: 1 }, { behaviorFlags: 0x46 }, { behaviorFlags: 0x4A },
        { behaviorFlags: 0xC2 }, { behaviorFlags: 0x10 }, { behaviorFlags: undefined },
        { shadowType: 1 }, { renderMode: 15 }, { scaleOverride: 4096 }]) {
        const table = new Map([[f.placement.id, { ...f.definition, ...change }]]);
        equal(readObjectPrograms([f.placement], f.commands, table, f.calls).length, 0, JSON.stringify(change));
    }
    for (const change of [{ unk12: 1 }, { zRotation: 90 }, { commandReferenceIdx: -1 }, { commandsLength: 252 },
        { x: 32700 }, { x: 40000 }, { x: 0.5 }])
        equal(readObjectPrograms([{ ...f.placement, ...change }], f.commands, f.table, f.calls).length, 0);
    for (const [offset, opcode, field, value] of [[0, 0x1B, 0, 0x7F7F], [0, 0x1B, 6, 0], [0, 0x1B, 6, 257], [0, 0x1B, 6, 7],
        [1, 3, 0, 0x8500], [1, 3, 0, 0x4500], [1, 3, 0, 0x1300], [2, 0x1B, 0, 100],
        [4, 8, 0, 0], [4, 8, 2, 1], [0, 0x14, 0, 1], [0, 0x3D, 6, 0x4000],
        [0, 0x48, 0, 0], [0, 0x0E, 0, 0], [0, 0x57, 0, 0], [0, 0x10, 0, 0], [0, 0x1C, 0, 200]]) {
        const x = fixture(), c = x.commands[x.start + offset]; c.opcode = opcode; c.payload.createDataView().setUint16(field, value);
        equal(readObjectPrograms([x.placement], x.commands, x.table, x.calls).length, 0, `${offset}/${opcode}/${value}`);
    }
    equal(fixture(0, 201).configs.length, 0);
    equal(fixture(0, 0).configs.length, 0);
    equal(readObjectPrograms([f.placement], f.commands.slice(0, 4), f.table, f.calls).length, 0);
    f.commands[0].payload = ArrayBufferSlice.fromView(new Uint8Array(7));
    equal(readObjectPrograms([f.placement], f.commands, f.table, f.calls).length, 0);
});

test('visual readiness is checked by placement identity and rejects absent or competing transform owners', () => {
    const f = fixture();
    equal(readObjectPrograms([f.placement], f.commands, f.table, []).length, 0);
    f.calls[0].objectPlacementIndex = 1;
    equal(readObjectPrograms([f.placement], f.commands, f.table, f.calls).length, 0);
    f.calls[0].objectPlacementIndex = 0; f.calls[0].modelMatrix = mat4.create();
    equal(readObjectPrograms([f.placement], f.commands, f.table, f.calls).length, 0);
    f.calls[0].modelMatrix = null; f.calls[0].indexCount = 0;
    equal(readObjectPrograms([f.placement], f.commands, f.table, f.calls).length, 0);
    const x = fixture(0, 200, 2, 2), c = x.calls[0];
    c.objectRotation = { placement: x.placement, rotation: { zPerTick: 0, yPerTick: 1 }, scale: 1, originY: 0, localMatrix: null };
    equal(readObjectPrograms([x.placement], x.commands, x.table, x.calls).length, 0);
});
