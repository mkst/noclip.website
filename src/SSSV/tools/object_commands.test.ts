import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { ObjectCommandRuntime, readObjectPrograms } from '../objects/object_commands.js';
import { CommandObjectWorld } from '../commands/command_objects.js';
import { findPayload, LevelPayloadType as P, parseLevelContainer, parseObjects } from '../core/level.js';
import { LEVELS } from '../core/level_table.js';
import { parseCommands } from '../commands/paths.js';
import { buildObjects, indexObjectTable, parseObjectTable } from '../objects/objects.js';
import type { SSSVObjectData } from '../objects/objects.js';
import type { LevelObjectPlacement } from '../core/level.js';
import { parseLevelDat } from '../core/level.js';
import { RSPSharedOutput } from '../../BanjoKazooie/f3dex.js';
import { parseI8Texture } from '../core/texture.js';
import { SSSVDrawCall } from '../render/terrain.js';
import { readComputerIdleAnimation, readObjectTextureAnimation, textureAnimationFrame } from '../objects/object_texture_animation.js';
const available = existsSync('data/SSSV/levels/PUNCHUP_PYRAMID.bin');
(globalThis as any).window = { debug: false };
const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
function fixture(level = 'PUNCHUP_PYRAMID') {
    const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`)), placements = parseObjects(findPayload(payloads, P.Cob)!);
    const commands = parseCommands(findPayload(payloads, P.Cmd)), table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    const drawCalls = placements.flatMap((p, index) => {
        const animation = readComputerIdleAnimation(p, commands, table.get(p.id)!) ?? readObjectTextureAnimation(p, commands);
        const call = new SSSVDrawCall(); call.objectPlacementIndex = index; call.indexCount = 3;
        call.animationTextureIndices = animation?.textureIndices ?? null;
        return [call];
    });
    const configs = readObjectPrograms(placements, commands, table, drawCalls);
    return { placements, commands, table, drawCalls, configs, runtime: new ObjectCommandRuntime(configs, commands, table, []) };
}
const material = (r: ObjectCommandRuntime, i: number) => r.world.objects.get(`object:${i}`)!.material;
function advance(r: ObjectCommandRuntime, to: number) { r.advanceTo(0); for (let i = 1; i <= to; i++) r.advanceTo(i); }

test('admission preserves existing props and adds only the five autonomous movers', { skip: !available }, () => {
    const found = LEVELS.flatMap(l => fixture(l.id).configs.map(c => [l.id, c.placementIndex, c.kind]));
    equal(found.filter(c => c[2] === 'material').length, 29);
    deepEqual(found.filter(c => c[2] !== 'material'), [
        ['GIVE_A_DOG_A_BONUS', 37, 'autonomous-motion'],
        ['SOMETHING_FISHY', 11, 'rotation'], ['SOMETHING_FISHY', 12, 'rotation'], ['SWAMP_OF_ETERNAL_STENCH', 84, 'motion'],
        ['EVOS_ESCAPE', 28, 'rotation'], ['BIG_CELEBRATION_PARADE', 19, 'rotation'],
        ['BIG_CELEBRATION_PARADE', 100, 'autonomous-motion'], ['BIG_CELEBRATION_PARADE', 101, 'autonomous-motion'],
        ['BIG_CELEBRATION_PARADE', 105, 'autonomous-motion'], ['BIG_CELEBRATION_PARADE', 106, 'autonomous-motion'], ['CREDITS', 19, 'rotation'],
    ]);
    const f = fixture(); f.commands[432].opcode = 0;
    equal(readObjectPrograms(f.placements, f.commands, f.table, f.drawCalls).filter(c => c.kind === 'material').length, 10);
});

test('18 independent shared-bank VMs match source material holds over many loops and staggered starts', { skip: !available }, () => {
    const f = fixture(), r = f.runtime, bank = f.commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array)));
    r.advanceTo(0);
    for (let tick = 0; tick < 600; tick++) {
        r.advanceTo(tick);
        for (const c of f.configs) {
            const animation = readObjectTextureAnimation(c.placement, f.commands)!;
            const expected = animation.textureIndices[textureAnimationFrame(tick, animation.textureIndices.length, animation.loopStartFrame)];
            equal(material(r, c.placementIndex), expected, `object ${c.placementIndex}, tick ${tick}`);
        }
    }
    equal(r.entries.every(e => e.vm.status === 'waiting' && e.vm.diagnostic === null), true);
    deepEqual(f.commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array))), bank);
});

test('VM drives texture bindings and reset reuses draw calls/resources', { skip: !available }, () => {
    const f = fixture(), c = new SSSVDrawCall(); c.objectPlacementIndex = 21;
    c.animationTextureIndices = Array(30).fill(28);
    const r = new ObjectCommandRuntime(f.configs, f.commands, f.table, [c]);
    deepEqual(c.animationTextureIndices, [28, 29, 30, 31]); equal(c.commandTextureFrame, 0);
    r.advanceTo(0); r.advanceTo(10); equal(c.commandTextureFrame, 2);
    r.advanceTo(14); equal(c.commandTextureFrame, 3);
    r.reset(); equal(c.commandTextureFrame, 0); equal(r.entries.find(e => e.config.placementIndex === 21)!.calls[0], c);
});

test('computer idle admission rejects changed setup, hit watchers, timing, targets and object behavior', { skip: !available }, () => {
    const f = fixture('THE_ENGINE_ROOM');
    deepEqual(f.configs.map(c => c.placementIndex), [7, 8, 9, 11, 12, 13, 21, 22, 23, 34, 52]);
    for (let index = 337; index <= 346; index++) {
        const bytes = f.commands[index].payload.createTypedArray(Uint8Array), saved = bytes[0];
        bytes[0] ^= 1;
        equal(readObjectPrograms(f.placements, f.commands, f.table, f.drawCalls).length, 0, `mutated C${index}`);
        bytes[0] = saved;
    }
    const p = f.placements[7];
    for (const altered of [{ ...p, commandsLength: 1 }, { ...p, commandReferenceIdx: 0, unk12: 338 },
        { ...p, commandReferenceIdx: 339 }, { ...p, unkC: 21 }, { ...p, id: 88 }])
        equal(readObjectPrograms([altered], f.commands, f.table, f.drawCalls).length, 0);
    for (const altered of [{ behaviorFlags: 0x42 }, { updateCallback: 1 }, { shadowType: 1 }, { renderMode: 15 }, { scaleOverride: 2048 }]) {
        const table = new Map(f.table); table.set(107, { ...f.table.get(107)!, ...altered });
        equal(readObjectPrograms(f.placements, f.commands, table, f.drawCalls).length, 0);
    }
});

test('eleven computer VMs retain the source five-tick holds and deferred watch without executing destruction', { skip: !available }, () => {
    const f = fixture('THE_ENGINE_ROOM'), r = f.runtime;
    const bank = f.commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array)));
    r.advanceTo(0);
    for (let tick = 0; tick <= 600; tick++) {
        r.advanceTo(tick);
        for (const e of r.entries) {
            equal(material(r, e.config.placementIndex), [2, 24, 25][Math.floor((tick % 15) / 5)]);
            equal(e.vm.location.commandIndex, [341, 343, 345][Math.floor((tick % 15) / 5)]);
            equal(e.vm.diagnostic, null);
            ok(e.vm.trace.every(t => t.commandIndex >= 337 && t.commandIndex <= 346));
        }
    }
    equal(r.world.objects.size, 11); equal(r.world.globals[12], 0);
    deepEqual(f.commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array))), bank);
    const watch = f.commands[337].payload.createDataView();
    deepEqual(r.world.evaluateCondition('object:7', watch), { ok: true, value: false });
    equal(r.world.evaluateCondition('missing', watch).ok, false);
    const otherContact = new DataView(new ArrayBuffer(8)); otherContact.setUint32(0, 0x04004000); otherContact.setUint32(4, 0x13000009);
    equal(r.world.evaluateCondition('object:7', otherContact).ok, false);
});

test('computer material bindings survive repeated frames, hiding, reset and discontinuous seeks', { skip: !available }, () => {
    const f = fixture('THE_ENGINE_ROOM'), call = new SSSVDrawCall();
    call.objectPlacementIndex = 7; call.commandTextureFrame = 0;
    const r = new ObjectCommandRuntime(f.configs, f.commands, f.table, [call]);
    const sample = (tick: number, expected: number) => { r.advanceTo(tick); equal(call.commandTextureFrame, expected); };
    deepEqual(call.animationTextureIndices, [2, 24, 25]); equal(call.animationFrameRate, 0);
    sample(0, 0); sample(4, 0); sample(5, 1); sample(9, 1); sample(10, 2); sample(14, 2); sample(15, 0);
    const before = r.entries[0].tick; sample(15, 0); equal(r.entries[0].tick, before);
    call.visible = false; sample(20, 1); call.visible = true; sample(20, 1);
    sample(1, 0); sample(6, 1); sample(10000, 0);
    r.reset(); equal(call.commandTextureFrame, 0);
    equal(r.entries.find(e => e.config.placementIndex === 7)!.calls[0], call);
    equal(r.entries.every(e => e.vm.diagnostic === null), true);
});

test('rotation continues after VM stop with no renderer-time writer; yaw-only pivots are admitted', { skip: !available }, () => {
    for (const level of ['SOMETHING_FISHY', 'EVOS_ESCAPE', 'BIG_CELEBRATION_PARADE', 'CREDITS']) {
        const f = fixture(level), r = f.runtime; advance(r, 361);
        for (const c of f.configs.filter(c => c.kind === 'rotation')) {
            const o = r.world.objects.get(`object:${c.placementIndex}`)!;
            equal(r.entries.find(e => e.config === c)!.vm.status, 'stopped');
            equal(o.zRotation, (c.placement.zRotation + o.zPerTick * 362) % 360);
            equal(o.angle, (c.placement.angle + o.yPerTick * 362) % 360);
        }
    }
});

test('Swamp uses source integer mode-1 easing, completion order and repeated 88-tick cycles', { skip: !available }, () => {
    const f = fixture('SWAMP_OF_ETERNAL_STENCH'), r = f.runtime, o = r.world.objects.get('object:84')!;
    equal(o.fixedPosition[1] / 65536, 556); equal(o.physicsFlags & 12, 0);
    r.advanceTo(0); r.advanceTo(1); equal(o.fixedPosition[1] / 65536, 556.0271606445312);
    r.advanceTo(22); equal(o.fixedPosition[1] / 65536, 566.4904174804688);
    r.advanceTo(43); equal(o.fixedPosition[1] / 65536, 576); equal(o.movement, null);
    equal(r.entries[0].vm.location.commandIndex, 365);
    r.advanceTo(44); equal(o.fixedPosition[1] / 65536, 576); equal(r.entries[0].vm.location.commandIndex, 367);
    r.advanceTo(87); equal(o.fixedPosition[1] / 65536, 556);
    r.advanceTo(88); equal(r.entries[0].vm.location.commandIndex, 365);
    for (let t = 89; t < 1000; t++) r.advanceTo(t);
    equal(r.entries[0].vm.diagnostic, null); equal(r.world.objects.size, 1);
});

test('motion pause freezes VM and controllers while materials/rotation retain existing independent behavior', { skip: !available }, () => {
    const r = fixture('SWAMP_OF_ETERNAL_STENCH').runtime;
    r.advanceTo(0); r.advanceTo(20); const before = r.entries[0].tick, y = r.world.objects.get('object:84')!.fixedPosition[1];
    r.motionEnabled = false; r.advanceTo(200); equal(r.entries[0].tick, before); equal(r.world.objects.get('object:84')!.fixedPosition[1], y);
    r.motionEnabled = true; r.advanceTo(201); equal(r.entries[0].tick, before + 1);
    r.advanceTo(201); equal(r.entries[0].tick, before + 1);
    r.advanceTo(1); equal(r.entries[0].tick, 1); r.advanceTo(10000); equal(r.entries[0].tick, 1);
});

test('unsupported program faults are isolated to their owner and reset reconstructs all private instructions', { skip: !available }, () => {
    const f = fixture(), r = f.runtime;
    f.commands[421].opcode = 0xffff;
    r.advanceTo(0); r.advanceTo(10);
    ok(r.entries.find(e => e.config.placementIndex === 21)!.vm.diagnostic);
    equal(r.entries.find(e => e.config.placementIndex === 18)!.vm.diagnostic, null);
    f.commands[421].opcode = 0x33; r.reset(); equal(r.entries.every(e => e.vm.diagnostic === null), true);
});

test('physical setup flags cannot silently enable unsupported physics', { skip: !available }, () => {
    const f = fixture(), w = new CommandObjectWorld(f.table, () => null, 1);
    ok(w.createObject('eye', f.placements[18]).ok);
    const p = new DataView(new ArrayBuffer(8)); p.setUint16(0, 6);
    equal(w.executeObjectCommand('eye', 'eye', 0x57, p).ok, false);
    p.setUint16(0, 1); ok(w.executeObjectCommand('eye', 'eye', 0x57, p).ok);
    equal(w.objects.get('eye')!.physicsFlags & 0x1C, 0x10);
});

function materialFixture(id = 23, base = 7, duration = 3, first = 0, second = 5, cursor = 0) {
    const records = [0x0057, 0x003D, 0x0014, 0x0033, 0x0006, 0x0033, 0x0006, 0x0008];
    const bytes = new Uint8Array(2 + (base + cursor + records.length) * 10), view = new DataView(bytes.buffer);
    view.setUint16(0, bytes.length);
    records.forEach((op, i) => view.setUint16(2 + (base + cursor + i) * 10, op));
    const payload = (i: number) => 2 + (base + cursor + i) * 10 + 2;
    view.setUint16(payload(1) + 6, 0x1100);
    view.setUint16(payload(3), first); view.setUint16(payload(4), duration);
    view.setUint16(payload(5), second); view.setUint16(payload(6), duration + 1);
    view.setUint16(payload(7), cursor + 2);
    const commands = parseCommands(ArrayBufferSlice.fromView(bytes));
    const placement: LevelObjectPlacement = { id, x: 0, y: 0, z: 0, angle: 0, zRotation: 0, unkC: first,
        scale: 2048, commandReferenceIdx: base + 1, commandsLength: cursor, unk12: 0, unk15: 0 };
    const tableBytes = new Uint8Array(0x9C), tableView = new DataView(tableBytes.buffer);
    tableView.setUint16(0, id); tableView.setUint8(3, 6); tableView.setUint32(4, 0x01000010);
    tableView.setUint8(0x82, 0x42);
    const definition = parseObjectTable(ArrayBufferSlice.fromView(tableBytes))[0];
    const table = new Map([[id, definition]]), call = new SSSVDrawCall();
    call.objectPlacementIndex = 0; call.animationTextureIndices = [first, second];
    return { placement, commands, table, definition, call, draws: [call], base, cursor };
}

test('material admission uses structure, object capabilities and prepared textures rather than IDs or bank addresses', () => {
    for (const [id, base, duration, first, second, cursor] of [[23, 7, 3, 0, 5, 0], [212, 29, 17, 7, 19, 4], [94, 55, 1, 19, 7, 2]]) {
        const f = materialFixture(id, base, duration, first, second, cursor);
        const configs = readObjectPrograms([f.placement], f.commands, f.table, f.draws);
        equal(configs.length, 1); deepEqual(configs[0].materials, [first, second].sort((a, b) => a - b));
        const r = new ObjectCommandRuntime(configs, f.commands, f.table, f.draws);
        r.advanceTo(0);
        for (let tick = 0; tick < 200; tick++) {
            r.advanceTo(tick);
            const expected = tick % (duration * 2 + 1) < duration ? first : second;
            equal(material(r, 0), expected); equal(f.call.animationTextureIndices![f.call.commandTextureFrame!], expected);
            equal(r.entries[0].vm.diagnostic, null);
        }
        const before = r.entries[0].tick; r.advanceTo(199); equal(r.entries[0].tick, before);
        r.motionEnabled = false; r.advanceTo(200); equal(r.entries[0].tick, before + 1);
        f.call.visible = false; r.advanceTo(201); equal(f.call.visible, false);
        r.advanceTo(1); equal(material(r, 0), first); r.advanceTo(10000); equal(material(r, 0), first);
        r.reset(); equal(f.call.animationTextureIndices![f.call.commandTextureFrame!], first); equal(r.entries[0].calls[0], f.call);
    }
});

test('material admission rejects callbacks, physics, event scripts and incompatible object definitions', () => {
    const f = materialFixture();
    for (const change of [{ updateCallback: 1 }, { behaviorFlags: 0x46 }, { behaviorFlags: 0x4A },
        { behaviorFlags: 0xC2 }, { behaviorFlags: 2 }, { behaviorFlags: undefined },
        { renderMode: 15 }, { renderMode: 18 }, { shadowType: 1 }, { scaleOverride: 4096 }]) {
        const table = new Map([[f.placement.id, { ...f.definition, ...change } as SSSVObjectData]]);
        equal(readObjectPrograms([f.placement], f.commands, table, f.draws).length, 0, JSON.stringify(change));
    }
    equal(readObjectPrograms([{ ...f.placement, unk12: 1 }], f.commands, f.table, f.draws).length, 0);
});

test('material admission rejects unsupported instructions, targets, operands and malformed records', () => {
    for (const [offset, opcode, field, value] of [
        [0, 0x57, 0, 2], [0, 0x57, 0, 1], [1, 0x3D, 6, 0x4000], [1, 0x3D, 0, 1],
        [2, 0x14, 0, 1], [2, 0x14, 0, 9], [2, 0x14, 0, 10],
        [3, 0x33, 0, 32], [3, 0x33, 0, 40], [3, 0x33, 0, 0x7F7F], [3, 0x33, 2, 1],
        [4, 0x06, 0, 0x7F7F], [4, 0x06, 0, 0xFFFF], [4, 0x06, 2, 1],
        [7, 0x08, 0, 200], [7, 0x08, 0, 3], [7, 0x08, 2, 1],
        [0, 0x48, 0, 0], [0, 0x0E, 0, 0], [0, 0x0F, 0, 1], [0, 0x10, 0, 0],
        [0, 0x17, 0, 0], [0, 0x26, 0, 0], [0, 0x03, 0, 5], [0, 0xFFFF, 0, 0],
    ]) {
        const f = materialFixture(), command = f.commands[f.base + offset];
        command.opcode = opcode; command.payload.createDataView().setUint16(field, value);
        equal(readObjectPrograms([f.placement], f.commands, f.table, f.draws).length, 0, `${offset}/${opcode}/${field}/${value}`);
    }
    const f = materialFixture();
    f.commands[f.base].payload = ArrayBufferSlice.fromView(new Uint8Array(7));
    equal(readObjectPrograms([f.placement], f.commands, f.table, f.draws).length, 0);
    for (const change of [{ commandReferenceIdx: -1 }, { commandReferenceIdx: 999 }, { commandsLength: -1 },
        { commandsLength: 256 }, { commandsLength: 0.5 }, { unkC: 32 }])
        equal(readObjectPrograms([{ ...materialFixture().placement, ...change }], materialFixture().commands, f.table, f.draws).length, 0);
});

test('material admission validates every written material, including writes omitted by preview holds', () => {
    const f = materialFixture();
    f.commands[f.base + 3].payload.createDataView().setUint16(0, 9);
    f.commands[f.base + 4].payload.createDataView().setUint16(0, 0);
    const preview = readObjectTextureAnimation(f.placement, f.commands)!;
    ok(preview); equal(preview.textureIndices.includes(9), false);
    equal(readObjectPrograms([f.placement], f.commands, f.table, f.draws).length, 0);
    f.call.animationTextureIndices!.push(9);
    const configs = readObjectPrograms([f.placement], f.commands, f.table, f.draws);
    deepEqual(configs[0].materials, [0, 5, 9]);
    const r = new ObjectCommandRuntime(configs, f.commands, f.table, f.draws);
    const p = new DataView(new ArrayBuffer(8)); p.setUint16(0, 7);
    equal(r.world.executeObjectCommand('object:0', 'object:0', 0x33, p).ok, false);
    p.setUint16(0, 9); equal(r.world.executeObjectCommand('object:0', 'object:0', 0x33, p).ok, true);
});

test('preview-valid loops cannot exceed the live VM instruction budget or run across its byte cursor', () => {
    const f = materialFixture(23, 0), template = f.commands[0];
    const command = (opcode: number, value = 0) => {
        const payload = new Uint8Array(8); new DataView(payload.buffer).setUint16(0, value);
        return { ...template, opcode, payload: ArrayBufferSlice.fromView(payload) };
    };
    const makeLoop = (setupCount: number) => [command(0x14), command(0x33), command(0x06, 1),
        ...Array.from({ length: setupCount }, () => command(0x14)), command(0x08, 0)];
    const placement = { ...f.placement, commandsLength: 1 };
    const bounded = makeLoop(124);
    ok(readObjectTextureAnimation(placement, bounded));
    const configs = readObjectPrograms([placement], bounded, f.table, f.draws);
    equal(configs.length, 1);
    const runtime = new ObjectCommandRuntime(configs, bounded, f.table, f.draws);
    for (let tick = 0; tick < 5; tick++) runtime.advanceTo(tick);
    equal(runtime.entries[0].vm.diagnostic, null);
    // A 128-record loop with a single yield needs 129 instructions on its release tick.
    const oversized = makeLoop(125);
    ok(readObjectTextureAnimation(placement, oversized));
    equal(readObjectPrograms([placement], oversized, f.table, f.draws).length, 0);
    const wrapped = materialFixture(23, 0, 3, 0, 5, 250);
    equal(readObjectPrograms([wrapped.placement], wrapped.commands, wrapped.table, wrapped.draws).length, 0);
    const zero = materialFixture(); zero.commands[zero.base + 4].payload.createDataView().setUint16(0, 0);
    zero.commands[zero.base + 6].payload.createDataView().setUint16(0, 0);
    equal(readObjectPrograms([zero.placement], zero.commands, zero.table, zero.draws).length, 0);
});

test('material admission requires actual context-animation bindings and loaded textures', () => {
    const f = materialFixture(), segment = new Uint8Array(0x80), view = new DataView(segment.buffer);
    view.setUint32(0x10, 0x04000000 | (3 << 10)); view.setUint32(0x14, 0x01000040);
    view.setUint32(0x18, 0xBF000000); view.setUint32(0x1C, 0x00000204); view.setUint32(0x20, 0xB8000000);
    for (let i = 0; i < 3; i++) {
        view.setInt16(0x40 + i * 16, i === 1 ? 32 : 0); view.setInt16(0x42 + i * 16, i === 2 ? 32 : 0);
        view.setUint8(0x4E + i * 16, 127); view.setUint8(0x4F + i * 16, 255);
    }
    const build = (ids: number[]) => {
        const shared = new RSPSharedOutput(), texture = parseI8Texture(ArrayBufferSlice.fromView(new Uint8Array(1024)), 32, 32, 'material-test');
        for (const id of ids) shared.textureCache.textures[id] = texture;
        return buildObjects(shared, [f.placement], f.table, [undefined, ArrayBufferSlice.fromView(segment)],
            parseLevelDat(ArrayBufferSlice.fromView(new Uint8Array(0xA0))), f.commands);
    };
    equal(readObjectPrograms([f.placement], f.commands, f.table, []).length, 0);
    equal(readObjectPrograms([f.placement], f.commands, f.table, build([0])).length, 0);
    equal(readObjectPrograms([f.placement], f.commands, f.table, build([5])).length, 0);
    const calls = build([0, 5]);
    equal(readObjectPrograms([f.placement], f.commands, f.table, calls).length, 1);
    calls[0].objectPlacementIndex = 1;
    equal(readObjectPrograms([f.placement], f.commands, f.table, calls).length, 0);
});
