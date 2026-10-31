import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { findPayload, LevelPayloadType as P, parseLevelContainer, parseObjects, parseMap } from '../level.js';
import { parseCommands } from '../paths.js';
import { readBoulderEvent, BoulderEventSimulation } from '../level_events.js';
import { LEVEL_EVENT_PARTICLE_IDS, parseParticleDefinition } from '../particle_assets.js';
const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
const available = existsSync('data/SSSV/levels/JUNGLE_DOLDRUMS.bin');
function fixture(level = 'ROCKY_HARD_PLACE') {
    const p = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`)), objects = parseObjects(findPayload(p, P.Cob)!);
    const commands = parseCommands(findPayload(p, P.Cmd)), config = readBoulderEvent(objects, commands, findPayload(p, P.Rng))!;
    const definitions = new Map(LEVEL_EVENT_PARTICLE_IDS.map(id => [id, parseParticleDefinition(read(`data/SSSV/particles/${id}.bin`))]));
    const sim = new BoulderEventSimulation(config, parseMap(findPayload(p, P.Map)!), definitions, 64, 32, 0x82C9);
    const camera = config.region ? [(config.region.x0 + config.region.x1) * 32, (config.region.z0 + config.region.z1) * 32] : [0, 0];
    sim.setEnabled(true);
    const advance = (t: number) => sim.advanceTo(t, camera[0], camera[1]);
    advance(0); return { commands, config, sim, advance };
}

test('parent creates and configures the child once; its script starts on the next update', { skip: !available }, () => {
    const { sim, advance } = fixture(); let tick = 0;
    while (!sim.boulders.length && tick < 100) advance(++tick);
    const b = sim.boulders[0]; ok(b);
    const program = sim.commands.programs.get(b.commandId!)!;
    equal(b.age, 0); equal(b.scale, 1024); equal(program.vm!.location.tick, null); equal(program.emitter.flags, 0);
    advance(++tick); equal(b.age, 1); equal(b.scale, 1024); equal(program.rotation, 20);
    deepEqual([program.emitter.particleId, program.emitter.flags, program.emitter.size], [4, 0x89, 25]);
    equal(program.vm!.location.opcode, 6);
    advance(++tick); equal(b.scale, 1104);
});

test('all admitted event programs run with bounded identity, contact deletion and immutable source bytes', { skip: !available }, () => {
    for (const level of ['ROCKY_HARD_PLACE', 'JUNGLE_DOLDRUMS']) {
        const { commands, config, sim, advance } = fixture(level), bank = commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array)));
        for (let t = 1; t <= 1800; t++) {
            advance(t); equal(sim.commands.diagnostics.length, 0, `${level} tick ${t}`);
            equal(sim.commands.programs.size, config.spawners.length + sim.boulders.length);
            ok(sim.commands.programs.size <= config.spawners.length + 20);
            ok(sim.particles.length <= 255);
        }
        ok(sim.spawnCount > 20); ok(sim.impactCount > 5);
        if (level === 'JUNGLE_DOLDRUMS') ok(sim.expirationCount > 5);
        deepEqual(commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array))), bank);
    }
});

test('Jungle distance helper dependency is preflighted instead of executing an unaudited routine', { skip: !available }, () => {
    const { config, commands } = fixture('JUNGLE_DOLDRUMS');
    const objects = config.spawners.map(s => s.placement);
    commands[669].raw.createDataView().setUint8(2, 0x54);
    const next = readBoulderEvent(objects, commands, null)!;
    equal(next.spawners.length, 6); ok(next.spawners.every(s => s.interval !== undefined));
});

test('faults remain inspectable and disable/re-enable drops child identities and reconstructs programs', { skip: !available }, () => {
    const { commands, config, sim, advance } = fixture();
    commands[config.scriptBase + 1].opcode = 0xffff; advance(1);
    equal(sim.commands.diagnostics.length, 5); ok(sim.commands.diagnostics.every(d => d.commandIndex === config.scriptBase + 1));
    advance(2); equal(sim.commands.diagnostics.length, 5);
    commands[config.scriptBase + 1].opcode = 0x3d;
    sim.setEnabled(false); equal(sim.boulders.length, 0); equal(sim.commands.diagnostics.length, 0);
    sim.setEnabled(true); advance(0); for (let t = 1; t <= 100; t++) advance(t);
    ok(sim.spawnCount > 0); equal(sim.commands.diagnostics.length, 0);
});
