import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { CommandEmitterWorld, EmitterCommandRuntime } from '../emitter_commands.js';
import { CommandVM } from '../command_vm.js';
import { CommandWorld } from '../command_world.js';
import { createPlayerPlacement } from '../animals.js';
import { findPayload, LevelPayloadType as P, parseLevelContainer, parseObjects, parseMap, parseLevelDat } from '../level.js';
import { parseCommands } from '../paths.js';
import { parseObjectTable, indexObjectTable } from '../objects.js';
import { readPersistentEmitters } from '../particle_emitters.js';
import { parseParticleDefinition, particleDefinitionFile, SCRIPT_PARTICLE_IDS } from '../particle_assets.js';
import { ScriptParticleSimulation } from '../script_particles.js';
const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
const available = existsSync('data/SSSV/levels/SWAMP_OF_ETERNAL_STENCH.bin');
function fixture(level = 'SWAMP_OF_ETERNAL_STENCH') {
    const p = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`)), objects = parseObjects(findPayload(p, P.Cob)!);
    const commands = parseCommands(findPayload(p, P.Cmd)), dat = parseLevelDat(findPayload(p, P.Dat)!), map = parseMap(findPayload(p, P.Map)!);
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin'))), player = createPlayerPlacement(dat, objects);
    const analysis = readPersistentEmitters(objects, table, commands), runtime = new EmitterCommandRuntime(analysis.emitters, commands, player);
    return { commands, dat, map, player, analysis, runtime };
}

test('all 14 existing emitters get configurations by executing the original bank, not copied snapshots', { skip: !available }, () => {
    let count = 0;
    for (const level of ['JUNGLE_JAPES', 'JUNGLE_DOLDRUMS', 'SHIFTING_SANDS', 'SWAMP_OF_ETERNAL_STENCH']) {
        const f = fixture(level); count += f.runtime.emitters.length;
        deepEqual(f.runtime.emitters.map(e => e.initial), f.analysis.emitters.map(e => e.initial));
        f.runtime.advanceTo(0); for (let tick = 1; tick <= 300; tick++) f.runtime.advanceTo(tick);
        equal(f.runtime.programs.every(p => p.vm.diagnostic === null), true);
        deepEqual(f.runtime.emitters.map(e => e.initial), f.analysis.emitters.map(e => e.initial));
        if (level !== 'SWAMP_OF_ETERNAL_STENCH') equal(f.runtime.programs.every(p => p.vm.status === 'stopped'), true);
    }
    equal(count, 14);
});

test('Swamp actually executes its saved-call distance helper against the authored player snapshot', { skip: !available }, () => {
    const f = fixture(), r = f.runtime, e = r.emitters[0]; ok(f.player);
    r.advanceTo(0); r.advanceTo(11);
    equal(r.programs[0].vm.diagnostic, null);
    equal(r.world.globals[19], Math.abs(f.player.x - e.placement.x) + Math.abs(f.player.z - e.placement.z));
    ok(r.programs[0].vm.trace.some(t => t.opcode === 0x48)); ok(r.programs[0].vm.trace.some(t => t.opcode === 0x49));
    const tick = r.programs[0].vm.location.tick; r.advanceTo(11); equal(r.programs[0].vm.location.tick, tick);
    const initial = e.initial; r.advanceTo(0); equal(r.emitters[0].initial, initial); equal(r.world.globals[19], 0);
    r.advanceTo(10000); equal(r.programs[0].vm.diagnostic, null);
});

test('VM emitter configuration preserves the existing particle output through times and seeks', { skip: !available }, () => {
    const definitions = new Map(SCRIPT_PARTICLE_IDS.map(id => [id, parseParticleDefinition(read(`data/SSSV/${particleDefinitionFile(id)}`))]));
    for (const level of ['JUNGLE_JAPES', 'JUNGLE_DOLDRUMS', 'SHIFTING_SANDS', 'SWAMP_OF_ETERNAL_STENCH']) {
        const f = fixture(level), before = new ScriptParticleSimulation(f.analysis.emitters, definitions, f.map, f.dat);
        const after = new ScriptParticleSimulation(f.runtime.emitters, definitions, f.map, f.dat, f.analysis.provenance, f.runtime);
        for (const tick of [0, 1, 30, 100, 300, 300, 10, 2000]) {
            before.advanceTo(tick); after.advanceTo(tick);
            deepEqual(after.particles, before.particles, `${level} tick ${tick}`);
        }
    }
});

test('emitter faults stop that source and retain diagnostics; reset reconstructs configuration', { skip: !available }, () => {
    const f = fixture(), r = f.runtime, base = f.analysis.emitters[0].placement.commandReferenceIdx - 1;
    f.commands[base + 5].opcode = 0xffff;
    r.advanceTo(0); r.advanceTo(11);
    ok(r.programs[0].vm.diagnostic); equal(r.emitters[0].initial.flags, 0);
    f.commands[base + 5].opcode = 0x48; r.reset(); equal(r.programs[0].vm.diagnostic, null); equal(r.emitters[0].initial.flags, 9);
});

test('position reads, absolute-value writes and unsupported emitter capabilities are explicit', () => {
    const body = Buffer.from('006553007f850000000000090000000000000000', 'hex'), bytes = Buffer.alloc(body.length + 2);
    bytes.writeUInt16BE(bytes.length); body.copy(bytes, 2);
    const commands = parseCommands(ArrayBufferSlice.fromView(bytes)), w = new CommandWorld([{ id: 'owner', typeId: 64, position: { x: -5.25, y: 3, z: 4 } }]);
    const vm = new CommandVM({ owner: 'owner', commands, scriptBase: 0 }, w); vm.step(0);
    equal(vm.status, 'stopped'); equal(w.globals[19], 6);
    const p = new DataView(new ArrayBuffer(8));
    const emitterWorld = new CommandEmitterWorld([{ id: 'owner', typeId: 64 }], 'silent');
    equal(emitterWorld.executeEmitterCommand('owner', 0x17, p).ok, false);
    equal(new CommandWorld([{ id: 'owner', typeId: 64 }]).readOperand('owner', 0x7F85).ok, false);
});
