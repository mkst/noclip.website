import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { findPayload, LevelPayloadType as P, parseLevelContainer, parseObjects, parseLinks, parseLevelDat } from '../level.js';
import { createPlayerPlacement } from '../animals.js';
import { parseCommands } from '../paths.js';
import { indexObjectTable, parseObjectTable } from '../objects.js';
import { LEVELS } from '../level_table.js';
import { LagoonMachineRuntime, readLagoonMachine, MACHINE_ARMS, MACHINE_PADS, MACHINE_LEVERS } from '../lagoon_machine.js';
const available = existsSync('data/SSSV/levels/HONEYMOON_LAGOON.bin');
const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
function fixture(level = 'HONEYMOON_LAGOON') {
    const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`)), objects = parseObjects(findPayload(payloads, P.Cob)!);
    const commands = parseCommands(findPayload(payloads, P.Cmd)), linkData = findPayload(payloads, P.Joi), links = linkData ? parseLinks(linkData) : [];
    const player = createPlayerPlacement(parseLevelDat(findPayload(payloads, P.Dat)!), objects), ranges = findPayload(payloads, P.Rng);
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    return { objects, commands, table, links, ranges, player, config: readLagoonMachine(objects, commands, table, links, ranges, player) };
}
function runtime() { const f = fixture(); ok(f.config); const r = new LagoonMachineRuntime(f.config); r.setEnabled(true); return r; }
function advance(r: LagoonMachineRuntime, ticks: number) {
    for (let n = 0; n < ticks; n++) r.step();
    for (const vm of r.world.programs.values()) equal(vm.diagnostic, null, JSON.stringify(vm.diagnostic));
}
const y = (r: LagoonMachineRuntime, i: number) => r.world.objects.get(`object:${i}`)!.fixedPosition[1] / 65536;

test('admission requires the complete Lagoon script island, initial cursors, region and actual control links', { skip: !available }, () => {
    deepEqual(LEVELS.filter(l => fixture(l.id).config).map(l => l.id), ['HONEYMOON_LAGOON']);
    let f = fixture(); f.commands[94].opcode = 0xffff;
    equal(readLagoonMachine(f.objects, f.commands, f.table, f.links, f.ranges, f.player), null);
    f = fixture(); f.objects[54].commandsLength = 0;
    equal(readLagoonMachine(f.objects, f.commands, f.table, f.links, f.ranges, f.player), null);
    f = fixture(); f.links.find(l => l.parent === 30)!.child = 54;
    equal(readLagoonMachine(f.objects, f.commands, f.table, f.links, f.ranges, f.player), null);
    f = fixture(); f.ranges!.createDataView().setUint8(32, 1);
    equal(readLagoonMachine(f.objects, f.commands, f.table, f.links, f.ranges, f.player), null);
    f = fixture(); f.table.get(49)!.updateCallback = 1;
    equal(readLagoonMachine(f.objects, f.commands, f.table, f.links, f.ranges, f.player), null);
});

test('authored cursor phases delay arms 53/56/55 while arm 54 starts immediately', { skip: !available }, () => {
    const r = runtime(); equal(r.world.objects.size, 4); equal(r.world.programs.size, 14);
    equal(r.world.objects.get('object:54')!.movement?.speed, 6);
    for (const i of [53, 55, 56]) equal(r.world.objects.get(`object:${i}`)!.movement, null);
    advance(r, 30); ok(y(r, 54) > 840); equal(y(r, 55), 816); equal(y(r, 56), 816); equal(y(r, 53), 816);
    advance(r, 10); ok(y(r, 55) > 816); equal(y(r, 56), 816); equal(y(r, 53), 816);
    advance(r, 30); ok(y(r, 56) > 816); equal(y(r, 53), 816);
    advance(r, 30); ok(y(r, 53) > 816);
});

test('normal mode loops within the source 48-unit vertical stroke for all four arms', { skip: !available }, () => {
    const r = runtime(), low = new Set<number>(), high = new Set<number>();
    for (let n = 0; n < 1500; n++) {
        advance(r, 1);
        for (const i of MACHINE_ARMS) { ok(y(r, i) >= 816 && y(r, i) <= 864); if (y(r, i) === 816) low.add(i); if (y(r, i) === 864) high.add(i); }
    }
    equal(low.size, 4); equal(high.size, 4);
    ok(MACHINE_ARMS.every(i => r.world.programs.get(`object:${i}`)!.status !== 'stopped'));
});

test('a lever writes only its linked arm temporary, then the arm executes its slowdown handoff and stops', { skip: !available }, () => {
    const r = runtime(); equal(r.activate(30), false); advance(r, 40);
    ok(r.activate(30)); equal(r.activate(30), false); advance(r, 1);
    equal(r.world.globals[1], 1); equal(r.world.getEntity('object:55')!.temporaries[2], 1);
    for (const i of [53, 54, 56]) equal(r.world.getEntity(`object:${i}`)!.temporaries[2], 0);
    advance(r, 600); equal(r.world.programs.get('object:55')!.location.scriptBase, 74);
    equal(r.world.programs.get('object:55')!.status, 'stopped'); equal(y(r, 55), 816);
    equal(r.world.getEntity('object:55')!.temporaries[0], 2); equal(r.world.leverPhases.get(30), 0);
    equal(r.activate(30), false); equal(r.world.getEntity('object:30')!.state, 0);
    ok(r.world.programs.get('object:54')!.status !== 'stopped');
});

test('all four lever programs stop their own arms without starting the deferred completion controller', { skip: !available }, () => {
    const r = runtime(); advance(r, 40); for (const i of MACHINE_LEVERS) ok(r.activate(i));
    advance(r, 600); equal(r.world.globals[1], 4);
    for (const i of MACHINE_ARMS) { equal(r.world.programs.get(`object:${i}`)!.status, 'stopped'); equal(y(r, i), 816); }
    equal(r.world.programs.has('object:8'), false); equal(r.world.objects.size, 4);
});

test('a lone floor pad contributes only during its timed active period and can be retried', { skip: !available }, () => {
    const r = runtime(); equal(r.activate(26), false); advance(r, 40); ok(r.activate(26)); advance(r, 1);
    equal(r.world.globals[0], 1); equal(r.world.getEntity('object:26')!.state, 1); equal(r.activate(26), false);
    advance(r, 199); equal(r.world.globals[0], 1);
    advance(r, 3); equal(r.world.globals[0], 0); equal(r.world.getEntity('object:26')!.state, 0);
    advance(r, 35); ok(r.activate(26)); advance(r, 1); equal(r.world.globals[0], 1);
});

test('four pads active together latch the puzzle, update its task bit and turn off both fence posts after the source delay', { skip: !available }, () => {
    const r = runtime(); advance(r, 40); for (const i of MACHINE_PADS) ok(r.activate(i)); advance(r, 1);
    equal(r.world.globals[0], 4); equal(r.world.taskBits & 2, 2);
    equal(r.world.getEntity('object:13')!.state, 1); equal(r.world.getEntity('object:14')!.state, 1);
    advance(r, 16); equal(r.world.getEntity('object:13')!.state, 0); equal(r.world.getEntity('object:14')!.state, 0);
    advance(r, 250); equal(r.world.globals[0], 4); equal(r.world.noticeCount, 1);
    for (const i of MACHINE_PADS) { equal(r.world.getEntity(`object:${i}`)!.state, 1); equal(r.world.programs.get(`object:${i}`)!.status, 'stopped'); equal(r.activate(i), false); }
});

test('area predicates use the authored player snapshot and retain the finite smoke setup without rendering particles', { skip: !available }, () => {
    const r = runtime(); Object.assign(r.world.getEntity('player')!.position!, { x: 1728, y: 900, z: 2112 });
    advance(r, 60); const emitter = r.world.smokeRequests.get('object:54')!;
    equal(emitter.particleId, 123); equal(emitter.duration, 20); equal(emitter.flags, 0xF9);
    deepEqual(emitter.offset, [-10, 0, 15]);
});

test('native clock repeats, reset/disable and backwards or large seeks retain a bounded island', { skip: !available }, () => {
    const r = runtime(); r.advanceTo(0); r.advanceTo(40); ok(r.activate(26)); r.advanceTo(41);
    const vm = r.world.programs.get('object:26')!.location; r.advanceTo(41); deepEqual(r.world.programs.get('object:26')!.location, vm);
    r.advanceTo(0); equal(r.world.globals[0], 0); r.advanceTo(2000); equal(r.world.globals[0], 0);
    for (let i = 0; i < 10; i++) { r.reset(); equal(r.world.objects.size, 4); equal(r.world.programs.size, 14); }
    r.setEnabled(false); equal(r.activate(26), false); r.setEnabled(true); equal(r.world.globals[1], 0);
});

test('unknown commands report original bank locations while other admitted owners continue', { skip: !available }, () => {
    const f = fixture(); ok(f.config); const r = new LagoonMachineRuntime(f.config); f.commands[57].opcode = 0xffff;
    r.setEnabled(true); equal(r.world.programs.get('object:54')!.diagnostic?.commandIndex, 57);
    equal(r.world.programs.get('object:54')!.diagnostic?.scriptBase, 51);
    equal(r.world.programs.get('object:30')!.diagnostic, null);
});
