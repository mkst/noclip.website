import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { FenceSwitchRuntime, inSwitchRegion, readFenceSwitch } from "../objects/fence_switch.js";
import { resolveFenceSpans } from "../objects/fences.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseLinks, parseObjects } from "../core/level.js";
import { LEVELS } from "../core/level_table.js";
import { indexObjectTable, parseObjectTable } from "../objects/objects.js";
import { parseCommands } from "../commands/paths.js";
import { buildSwitchBall } from "../objects/switch_visuals.js";
import { CommandVM } from "../commands/command_vm.js";

const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
const available = existsSync('data/SSSV/levels/HAVE_A_NICE_DAY.bin');
function fixture(level = 'HAVE_A_NICE_DAY') {
    const payload = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
    const objects = parseObjects(findPayload(payload, LevelPayloadType.Cob)!);
    const animalData = findPayload(payload, LevelPayloadType.Can);
    const animals = animalData !== null ? parseAnimals(animalData) : [];
    const commands = parseCommands(findPayload(payload, LevelPayloadType.Cmd));
    const links = parseLinks(findPayload(payload, LevelPayloadType.Joi) ?? new ArrayBufferSlice(new Uint8Array([0, 0]).buffer));
    const ranges = findPayload(payload, LevelPayloadType.Rng);
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    const fences = resolveFenceSpans(objects, table, links);
    const config = readFenceSwitch(objects, commands, links, ranges, fences);
    const dat = parseLevelDat(findPayload(payload, LevelPayloadType.Dat)!);
    return { objects, animals, commands, links, ranges, fences, config, dat, table };
}

function runtime() {
    const f = fixture(); return { ...f, r: new FenceSwitchRuntime(f.config!, f.objects, f.animals) };
}
function waitReady(r: FenceSwitchRuntime) {
    for (let i = 0; i < 100 && !r.ready && !r.messagePending; i++) r.step();
    equal(r.error, null); ok(r.ready || r.messagePending);
}

test('fence control resolves its initial assignment, source post link, span and complete shared dependency', { skip: !available }, () => {
    const f = fixture(), c = f.config!;
    ok(c); deepEqual([c.placementIndex, c.postIndex, c.fence.destinationIndex, c.scriptBase, c.sharedBase], [30, 17, 22, 82, 52]);
    deepEqual(c.region, [16, 9, 240, 26, 18, 12]);
    equal(readFenceSwitch(f.objects.map(p => ({ ...p, commandsLength: 1 })), f.commands, f.links, f.ranges, f.fences), null);
    equal(readFenceSwitch(f.objects.map(p => ({ ...p, commandReferenceIdx: 0, unk12: p.commandReferenceIdx })), f.commands, f.links, f.ranges, f.fences), null);
    equal(readFenceSwitch(f.objects, f.commands, [...f.links, { parent: 30, child: 999, referenceIdx: 0 }], f.ranges, f.fences), null);
    equal(readFenceSwitch(f.objects, f.commands, f.links, f.ranges, []), null);
    equal(readFenceSwitch(f.objects, f.commands, f.links, null, f.fences), null);
    // The successful helper's continuation is just as essential as its return.
    f.commands[81].raw.createDataView().setUint8(9, 1);
    equal(readFenceSwitch(f.objects, f.commands, f.links, f.ranges, f.fences), null);
});

test('authored snapshot starts fence off and supports repeat toggles, discarded busy clicks and 30-tick delay', { skip: !available }, () => {
    const { r, config } = runtime();
    equal(r.activate(), false); r.setEnabled(true);
    equal(r.state, 0); equal(r.ready, true); equal(config!.fence.enabled, false);
    for (let cycle = 0; cycle < 3; cycle++) {
        equal(r.activate(), true); equal(r.activate(), false); r.step();
        equal(r.state, 1); equal(config!.fence.enabled, true); equal(r.sheepCount, 0); equal(r.taskBits, 0);
        for (let i = 1; i < 30; i++) { r.step(); equal(r.ready, false); equal(r.activate(), false); }
        r.step(); equal(r.ready, true);
        r.activate(); r.step(); equal(r.state, 0); equal(config!.fence.enabled, false);
        waitReady(r);
    }
});

test('region membership uses inclusive tile coordinates and 240 ignores height', () => {
    const region = [16, 9, 240, 26, 18, 12];
    equal(inSwitchRegion({ x: 1024, z: 576, y: 0 }, region), true);
    equal(inSwitchRegion({ x: 1727, z: 1215, y: 5000 }, region), true);
    equal(inSwitchRegion({ x: 1728, z: 1215, y: 700 }, region), false);
    equal(inSwitchRegion({ x: 1024, z: 575, y: 700 }, region), false);
    equal(inSwitchRegion({ x: 1024, z: 576, y: 640 }, [16, 9, 10, 26, 18, 12]), true);
    equal(inSwitchRegion({ x: 1024, z: 576, y: 639 }, [16, 9, 10, 26, 18, 12]), false);
});

test('four sheep set a local task bit, yield for acknowledgement, then use the helper continuation for repeated toggles', { skip: !available }, () => {
    const f = fixture();
    const animals = f.animals.map(a => a.id === 33 ? { ...a, x: 1400, z: 900 } : a);
    const r = new FenceSwitchRuntime(f.config!, f.objects, animals);
    r.setEnabled(true); r.activate(); r.step();
    for (let i = 0; i < 20 && !r.messagePending; i++) r.step();
    equal(r.sheepCount, 4); equal(r.taskBits, 1); equal(r.messagePending, true);
    ok(r.vm instanceof CommandVM); equal(r.vm.location.scriptBase, 52); equal(r.vm.location.commandIndex, 64);
    equal(r.state, 1); equal(f.config!.fence.enabled, true); equal(r.ready, false);
    r.step(); equal(r.messagePending, true); equal(r.activate(), false);
    r.acknowledgeMessage(); r.step(); equal(r.messagePending, false); waitReady(r);
    for (let cycle = 0; cycle < 3; cycle++) {
        r.activate(); r.step(); equal(r.state, 0); equal(f.config!.fence.enabled, false); waitReady(r);
        r.activate(); r.step(); equal(r.state, 1); equal(f.config!.fence.enabled, true); waitReady(r);
        equal(r.sheepCount, 4); equal(r.messagePending, false);
    }
});

test('three sheep return from the shared VM helper without a notice or task bit', { skip: !available }, () => {
    const f = fixture(); let moved = 0;
    const animals = f.animals.map(a => a.id === 33 && moved++ < 3 ? { ...a, x: 1400, z: 900 } : a);
    const original = f.commands.map(c => Buffer.from(c.raw.copyToBuffer()).toString('hex'));
    const r = new FenceSwitchRuntime(f.config!, f.objects, animals);
    r.setEnabled(true); equal(r.vm.location.commandIndex, 86);
    r.activate(); r.step(); waitReady(r);
    equal(r.sheepCount, 3); equal(r.taskBits, 0); equal(r.messagePending, false);
    equal(r.vm.location.scriptBase, 82); ok(r.vm.trace.some(t => t.opcode === 0x49));
    equal(r.state, 1); equal(f.config!.fence.enabled, true);
    deepEqual(f.commands.map(c => Buffer.from(c.raw.copyToBuffer()).toString('hex')), original);
});

test('a fence VM fault retains command provenance and recovers through an explicit reset', { skip: !available }, () => {
    const { r, commands, config } = runtime();
    r.setEnabled(true); commands[52].opcode = 0xFFFF;
    r.activate(); r.step();
    equal(r.enabled, false); equal(r.ready, false); equal(r.state, 0); equal(config!.fence.enabled, false);
    equal(r.vm.status, 'unsupported'); equal(r.vm.diagnostic!.commandIndex, 52); ok(r.error!.includes('0xffff'));
    commands[52].opcode = 0x3D; r.setEnabled(true);
    equal(r.error, null); equal(r.ready, true); equal(r.vm.location.scriptBase, 82);
    r.activate(); r.step(); waitReady(r); equal(r.state, 1);
});

test('fence steps on its first scene frame, normalizes input and resumes immediately after a seek', { skip: !available }, () => {
    const { r } = runtime(); r.setEnabled(true);
    equal(r.vm.location.tick, 0);
    r.advanceTo(10000.9); equal(r.vm.location.tick, 1);
    r.advanceTo(10000.1); equal(r.vm.location.tick, 1);
    r.advanceTo(-1); equal(r.vm.location.tick, 0);
    r.advanceTo(1); equal(r.vm.location.tick, 1);
    r.setEnabled(false); r.advanceTo(10000);
    r.setEnabled(true); r.advanceTo(10000); equal(r.vm.location.tick, 1);
});

test('empty enumeration returns safely and reset/disable/seeks restore the declared fence policy', { skip: !available }, () => {
    const f = fixture(), region = [70, 120, 240, 71, 121, 0];
    const r = new FenceSwitchRuntime({ ...f.config!, region }, f.objects, []);
    r.setEnabled(true); r.advanceTo(0); r.activate(); r.advanceTo(1); waitReady(r);
    equal(r.sheepCount, 0); equal(r.state, 1); r.advanceTo(0); equal(r.state, 0); equal(r.ready, true);
    r.activate(); r.advanceTo(1); r.advanceTo(1000); equal(r.state, 0); equal(f.config!.fence.enabled, false);
    r.setEnabled(false); equal(f.config!.fence.enabled, true); equal(r.state, 1); equal(r.activate(), false);
    r.setEnabled(true); equal(f.config!.fence.enabled, false);
});

test('switch ball uses source red/blue categories, height, scale and stable placement identity', { skip: !available }, () => {
    const f = fixture(), output = new RSPSharedOutput(), c = f.config!;
    const ball = buildSwitchBall(output, c.placementIndex, c.placement, f.table.get(24)!, f.dat);
    deepEqual(ball.animationTextureIndices, [504, 505]); equal(ball.objectPlacementIndex, 30); equal(ball.switchBall!.state, 1);
    equal(ball.center[1], 816 + f.table.get(24)!.collideHeight / 2 + 55);
    equal(ball.switchBall!.size, 1228 * 3 / 256); equal(output.vertices.length, 4); equal(ball.indexCount, 6);
});

test('only HAVE_A_NICE_DAY admits the full switch program across all level banks', { skip: !available }, () => {
    const matches = LEVELS.filter(l => fixture(l.id).config !== null).map(l => l.id);
    deepEqual(matches, ['HAVE_A_NICE_DAY']);
});
