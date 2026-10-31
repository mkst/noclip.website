import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { ObjectCommandRuntime, readObjectPrograms } from '../object_commands.js';
import { CommandObjectWorld } from '../command_objects.js';
import { findPayload, LevelPayloadType as P, parseLevelContainer, parseObjects } from '../level.js';
import { LEVELS } from '../level_table.js';
import { parseCommands } from '../paths.js';
import { indexObjectTable, parseObjectTable } from '../objects.js';
import { SSSVDrawCall } from '../terrain.js';
import { readObjectTextureAnimation, textureAnimationFrame } from '../object_texture_animation.js';
const available = existsSync('data/SSSV/levels/PUNCHUP_PYRAMID.bin');
const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
function fixture(level = 'PUNCHUP_PYRAMID') {
    const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`)), placements = parseObjects(findPayload(payloads, P.Cob)!);
    const commands = parseCommands(findPayload(payloads, P.Cmd)), table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    const configs = readObjectPrograms(placements, commands, table);
    return { placements, commands, table, configs, runtime: new ObjectCommandRuntime(configs, commands, table, []) };
}
const material = (r: ObjectCommandRuntime, i: number) => r.world.objects.get(`object:${i}`)!.material;
function advance(r: ObjectCommandRuntime, to: number) { r.advanceTo(0); for (let i = 1; i <= to; i++) r.advanceTo(i); }

test('admission covers exactly the existing 18 material, 5 rotation and 1 Swamp pilots', { skip: !available }, () => {
    const found = LEVELS.flatMap(l => fixture(l.id).configs.map(c => [l.id, c.placementIndex, c.kind]));
    equal(found.filter(c => c[2] === 'material').length, 18);
    deepEqual(found.filter(c => c[2] !== 'material'), [
        ['SOMETHING_FISHY', 11, 'rotation'], ['SOMETHING_FISHY', 12, 'rotation'], ['SWAMP_OF_ETERNAL_STENCH', 84, 'motion'],
        ['EVOS_ESCAPE', 28, 'rotation'], ['BIG_CELEBRATION_PARADE', 19, 'rotation'], ['CREDITS', 19, 'rotation'],
    ]);
    const f = fixture(); f.commands[432].opcode = 0;
    equal(readObjectPrograms(f.placements, f.commands, f.table).filter(c => c.kind === 'material').length, 10);
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

test('rotation continues after VM stop with no renderer-time writer; yaw-only pivots are admitted', { skip: !available }, () => {
    for (const level of ['SOMETHING_FISHY', 'EVOS_ESCAPE', 'BIG_CELEBRATION_PARADE', 'CREDITS']) {
        const f = fixture(level), r = f.runtime; advance(r, 361);
        for (const c of f.configs) {
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
