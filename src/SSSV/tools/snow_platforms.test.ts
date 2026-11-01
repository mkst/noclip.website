import { equal, ok, deepEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { findPayload, LevelPayloadType as P, parseLevelContainer, parseObjects, parsePaths, parseLinks } from '../core/level.js';
import { indexObjectTable, parseObjectTable } from '../objects/objects.js';
import { parseCommands } from '../commands/paths.js';
import { LEVELS } from '../core/level_table.js';
import { readSnowPlatforms, SnowPlatformRuntime } from '../objects/snow_platforms.js';
import { sampleCommandPath } from '../commands/command_path.js';
const available = existsSync('data/SSSV/levels/SNOW_JOKE.bin');
const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
function fixture(level = 'SNOW_JOKE') {
    const p = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`)), placements = parseObjects(findPayload(p, P.Cob)!);
    const links = parseLinks(findPayload(p, P.Joi)!);
    const commands = parseCommands(findPayload(p, P.Cmd)), paths = parsePaths(findPayload(p, P.Paf));
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin'))), config = readSnowPlatforms(placements, commands, table, paths, links);
    return { placements, commands, paths, table, links, config };
}
function runtime() { const f = fixture(); ok(f.config); const r = new SnowPlatformRuntime(f.config); r.setEnabled(true); return r; }
function advance(r: SnowPlatformRuntime, ticks: number) {
    for (let n = 0; n < ticks; n++) r.step();
    for (const vm of r.world.programs.values()) equal(vm.diagnostic, null, JSON.stringify(vm.diagnostic));
}
const y = (r: SnowPlatformRuntime, i: number) => r.world.objects.get(`object:${i}`)!.fixedPosition[1] / 65536;

test('only the complete Snow Joke parent/helper island is admitted', { skip: !available }, () => {
    deepEqual(LEVELS.filter(l => fixture(l.id).config).map(l => l.id), ['SNOW_JOKE']);
    const f = fixture(); f.commands[199].opcode = 0xffff;
    equal(readSnowPlatforms(f.placements, f.commands, f.table, f.paths, f.links), null);
});

test('source path sampler retains the leading interval and finite clamped/looping endpoints', { skip: !available }, () => {
    const { paths } = fixture();
    deepEqual(sampleCommandPath(paths[9], 0, false).map(v => v >> 16), [3296, 640, 4192]);
    deepEqual(sampleCommandPath(paths[9], (paths[9].waypoints.length + 1) * 128, false).map(v => v >> 16), [3936, 1216, 3104]);
    for (const id of [0, 1, 9]) for (let t = 0; t < 1400; t++) ok(sampleCommandPath(paths[id], t, id !== 9).every(Number.isFinite));
});

test('the shared capability does not widen Snow target, path or operand admission', { skip: !available }, () => {
    const r = runtime(), p = new DataView(new ArrayBuffer(8));
    const configure = (path: number, speed: number, direction: number, mode: number) => {
        p.setUint8(1, path); p.setUint8(3, speed); p.setInt8(5, direction); p.setUint8(6, mode);
    };
    configure(0, 1, 1, 0);
    const helper = [...r.world.objects.values()].find(o => o.typeId === 64)!;
    equal(r.world.executePathCommand(helper.id, 0x34, p).ok, false);
    equal(r.world.executePathCommand(null, 0x34, p).ok, false);
    for (const values of [[7, 1, 1, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 1, 1, 2]]) {
        configure(values[0], values[1], values[2], values[3]);
        equal(r.world.executePathCommand('object:8', 0x34, p).ok, false);
    }
    equal(r.world.paths.size, 0); equal(r.world.approaches.size, 0);
    configure(0, 1, 1, 0); ok(r.world.executePathCommand('object:8', 0x34, p).ok);
    equal(r.world.paths.get('object:8')!.path.index, 0);
});

test('the real initial helpers spawn once, wire references and execute their configuration/state programs', { skip: !available }, () => {
    const r = runtime(); equal(r.world.objects.size, 6); advance(r, 3);
    equal(r.world.programs.size, 9);
    for (const index of [8, 2, 3]) {
        const owner = `object:${index}`, helper = r.world.getEntity(owner)!.references.get(7)!;
        equal(r.world.getEntity(helper)!.references.get(1), owner); ok(r.world.programs.get(helper));
    }
    equal(r.world.emitters.size, 2);
    advance(r, 300); equal(r.world.objects.size, 6);
});

test('first two platforms lower before the switch, then raise and follow actual path commands', { skip: !available }, () => {
    const r = runtime(); advance(r, 300);
    equal(y(r, 8), 10); equal(y(r, 2), 10); equal(r.world.paths.size, 0);
    ok(r.activateSwitch(5)); advance(r, 300);
    ok(Math.abs(y(r, 8) - 320) < 0.001); ok(Math.abs(y(r, 2) - 320) < 0.001);
    equal(r.world.paths.get('object:8')!.path.index, 0); equal(r.world.paths.get('object:2')!.path.index, 1);
    ok(r.world.paths.get('object:8')!.active); equal(r.world.programs.get('object:8')!.location.opcode, 7);
    const before = Array.from(r.world.objects.get('object:8')!.fixedPosition); advance(r, 10);
    ok(before.some((v, i) => v !== r.world.objects.get('object:8')!.fixedPosition[i]));
    equal(r.world.globals[0], 1); equal(r.activateSwitch(5), false);
});

test('standing input triggers source dip/recovery and deferred exit instead of fabricating contact', { skip: !available }, () => {
    const r = runtime(); advance(r, 200); ok(r.activateSwitch(5)); advance(r, 200);
    r.setStanding(8); advance(r, 15); ok(y(r, 8) < 320);
    advance(r, 30); equal(y(r, 8), 320);
    r.setStanding(null); advance(r, 10); equal(r.world.programs.get('object:8')!.location.opcode, 7);
});

test('path-9 platform waits for standing/delay, approaches its start, traverses and reverses on release', { skip: !available }, () => {
    const r = runtime(); advance(r, 80); equal(r.world.paths.has('object:3'), false); equal(y(r, 3), 643);
    equal(r.world.objects.get('object:3')!.material, 40); // C388 reads material, not collision height.
    r.setStanding(3); advance(r, 30); equal(r.world.paths.has('object:3'), false);
    advance(r, 350); ok(y(r, 3) > 1000); ok(r.world.paths.get('object:3')!.parameter > 0);
    r.setStanding(null); advance(r, 350);
    ok(y(r, 3) <= 641); equal(r.world.paths.get('object:3')!.active, false);
    equal(r.world.objects.size, 6);
});

test('pause, repeated frames, reset/disable and seeks keep a single bounded island', { skip: !available }, () => {
    const r = runtime(); r.advanceTo(0); r.advanceTo(100); const a = y(r, 8);
    r.motionEnabled = false; r.advanceTo(200); equal(y(r, 8), a);
    r.motionEnabled = true; r.advanceTo(201); const tick = r.world.programs.get('object:8')!.location.tick;
    r.advanceTo(201); equal(r.world.programs.get('object:8')!.location.tick, tick);
    ok(r.activateSwitch(5)); r.setStanding(3); r.reset(); equal(r.world.globals[0], 0); equal(r.world.standingOn, null);
    equal(r.world.objects.size, 6); r.advanceTo(201); r.advanceTo(0); equal(r.world.objects.size, 6);
    r.advanceTo(2000); equal(r.world.objects.size, 6);
    r.setEnabled(false); equal(r.world.objects.size, 3); r.setEnabled(true); equal(r.world.objects.size, 6);
});


test('first frame anchors after startup and discontinuities still reset while motion is paused', { skip: !available }, () => {
    const r = runtime(), initial = r.world;
    const tick = () => r.world.programs.get('object:8')!.location.tick;
    equal(tick(), 0); r.advanceTo(10000); equal(tick(), 0);
    r.motionEnabled = false; r.advanceTo(10900); equal(r.world, initial); equal(tick(), 0);
    r.advanceTo(11801); ok(r.world !== initial); equal(tick(), 0);
    r.motionEnabled = true; r.advanceTo(11802); equal(tick(), 1);
});

test('visibility switch uses its authored link and delayed material writes independently of the fans', { skip: !available }, () => {
    const r = runtime(); equal(r.world.getEntity('object:4')!.references.get(1), 'object:3');
    ok(r.activateSwitch(4)); equal(r.activateSwitch(99), false);
    advance(r, 20); equal(r.world.objects.get('object:3')!.material, 40);
    advance(r, 1); equal(r.world.objects.get('object:3')!.material, 157); equal(r.world.leverPhases.get(4), 128);
    equal(r.world.globals[0], 0); equal(r.world.fanSlots.get(1)!.s, 0);
    equal(r.activateSwitch(4), false); advance(r, 31); ok(r.switchReady(4));
    ok(r.activateSwitch(4)); advance(r, 21); equal(r.world.objects.get('object:3')!.material, 40); equal(r.world.leverPhases.get(4), 0);
    const f = fixture(); f.links[0].child = 2;
    equal(readSnowPlatforms(f.placements, f.commands, f.table, f.paths, f.links), null);
});

test('bottom switch starts the first fan and platform gate once; fan frames follow the source cadence', { skip: !available }, () => {
    const r = runtime(); advance(r, 30); equal(r.world.fanSlots.get(1)!.frame, 0);
    ok(r.activateSwitch(5)); advance(r, 1);
    equal(r.world.globals[0], 1); equal(r.world.fanSlots.get(1)!.s, 1);
    const frames = new Set<number>();
    for (let n = 0; n < 8; n++) { advance(r, 1); frames.add(r.world.fanSlots.get(1)!.frame); }
    equal(frames.size, 4); advance(r, 40); equal(r.activateSwitch(5), false);
    equal(r.world.programs.get('object:5')!.status, 'stopped');
});

test('other fan switch executes both fades, delays and repeated on/off activations without camera changes', { skip: !available }, () => {
    const r = runtime(); equal(r.world.fanSlots.get(2)!.enabled, false);
    for (let cycle = 0; cycle < 2; cycle++) {
        ok(r.activateSwitch(27)); advance(r, 1); equal(r.world.fanSlots.get(2)!.enabled, true);
        equal(r.world.globals[4], 1); equal(r.activateSwitch(27), false);
        const frames = new Set<number>();
        for (let n = 0; n < 9; n++) { advance(r, 1); frames.add(r.world.fanSlots.get(2)!.frame); }
        deepEqual([...frames].sort(), [4, 5, 6]); advance(r, 500); ok(r.switchReady(27));
        ok(r.activateSwitch(27)); advance(r, 7); equal(r.world.fanSlots.get(2)!.enabled, false);
        equal(r.world.globals[4], 0); const frame = r.world.fanSlots.get(2)!.frame;
        advance(r, 35); equal(r.world.fanSlots.get(2)!.frame, frame); ok(r.switchReady(27));
    }
});

test('invisible-platform program repeats three return trips and waits for reboarding each time', { skip: !available }, () => {
    const r = runtime();
    for (let cycle = 0; cycle < 3; cycle++) {
        r.setStanding(3); advance(r, 400);
        ok(y(r, 3) > 1215); equal(r.world.paths.get('object:3')!.active, false);
        advance(r, 60); ok(y(r, 3) > 1215);
        r.setStanding(null); advance(r, 400);
        ok(y(r, 3) < 641); equal(r.world.paths.get('object:3')!.active, false);
        equal(r.world.programs.get('object:3')!.location.commandIndex, 369);
        advance(r, 60); ok(y(r, 3) < 641);
    }
    equal(r.world.objects.size, 6); equal(r.world.programs.size, 9);
});
