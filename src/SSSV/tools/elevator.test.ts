import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { CommandObjectWorld } from "../command_objects.js";
import { CommandVM } from "../command_vm.js";
import { CommandWorld } from "../command_world.js";
import { ElevatorRuntime, commandWaterHeight, readElevator } from "../elevator.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseMap, parseObjects } from "../level.js";
import { LEVELS } from "../level_table.js";
import { indexObjectTable, parseObjectTable } from "../objects.js";
import { parseCommands } from "../paths.js";

const available = existsSync('data/SSSV/levels/HONEYMOON_LAGOON.bin');
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));
function fixture(level = 'HONEYMOON_LAGOON') {
    const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
    const objects = parseObjects(findPayload(payloads, LevelPayloadType.Cob)!);
    const commands = parseCommands(findPayload(payloads, LevelPayloadType.Cmd));
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const catalog = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    return { objects, commands, map, catalog, config: readElevator(objects, commands, catalog, map) };
}
function runtime() { const f = fixture(); ok(f.config); const r = new ElevatorRuntime(f.config); r.setEnabled(true); return r; }
function companion(r: ElevatorRuntime) { return r.world.objects.get(r.world.getEntity(r.owner)!.references.get(7)!)!; }
function height(r: ElevatorRuntime, helper = false) { return r.world.objects.get(helper ? companion(r).id : r.owner)!.fixedPosition[1] / 65536; }
function advance(r: ElevatorRuntime, tick: number) { while (r.tick < tick && r.enabled) r.step(); equal(r.error, null); equal(r.tick, tick); }

test('only the complete authored Lagoon program and supported object metadata are admitted', { skip: !available }, () => {
    const matches = LEVELS.filter(l => fixture(l.id).config !== null).map(l => l.id);
    deepEqual(matches, ['HONEYMOON_LAGOON']);
    const f = fixture(); ok(f.config);
    deepEqual([f.config.placementIndex, f.config.scriptBase], [18, 262]);
    equal(f.catalog.get(23)!.behaviorFlags, 0x42); equal(f.catalog.get(116)!.behaviorFlags, 0x42);
    equal(readElevator(f.objects.map(p => ({ ...p, commandsLength: 1 })), f.commands, f.catalog, f.map), null);
    f.commands[290].raw.createDataView().setUint8(2, 1);
    equal(readElevator(f.objects, f.commands, f.catalog, f.map), null);
    const g = fixture(); g.catalog.get(116)!.updateCallback = 1;
    equal(readElevator(g.objects, g.commands, g.catalog, g.map), null);
});

test('water predicate uses the loaded byte and max corner, with strict below and inversion', { skip: !available }, () => {
    const f = fixture(); equal(commandWaterHeight(f.map, 3200, 5184), 240);
    const map = f.map.map(c => ({ ...c })); map[(51 - 4) * 97 + 82 - 8].unk6 = 35;
    equal(commandWaterHeight(map, 3200, 5184), 280);
    equal(commandWaterHeight(map, 0, 0), null);
    map[(51 - 4) * 97 + 82 - 8].unk6 = 255;
    equal(commandWaterHeight(map, 3200, 5184), 1016); // u8 doubling wraps
    const r = runtime(), payload = new DataView(new ArrayBuffer(8)); payload.setUint8(0, 1);
    r.world.getEntity(r.owner)!.position!.y = 240;
    deepEqual(r.world.evaluateCondition(r.owner, payload), { ok: true, value: false });
    r.world.getEntity(r.owner)!.position!.y = 239;
    deepEqual(r.world.evaluateCondition(r.owner, payload), { ok: true, value: true });
    payload.setUint8(0, 0x81);
    deepEqual(r.world.evaluateCondition(r.owner, payload), { ok: true, value: false });
});

test('spawn offsets, slot 7, flags, material and scale come from executing the setup', { skip: !available }, () => {
    const r = runtime(), o = companion(r);
    deepEqual(Array.from(o.fixedPosition, v => v / 65536), [3256, 1340, 5184]);
    deepEqual([o.typeId, o.angle, o.zRotation, o.scale, o.material, o.flags], [116, 90, 0, 4096, 1, 24]);
    equal(r.world.objects.get(r.owner)!.flags, 8);
    equal(r.vm.location.commandIndex, 275); equal(r.tick, 0);
    advance(r, 1);
    equal(height(r), 1416.765625); equal(height(r, true), 1340); equal(o.zRotation, 8);
    advance(r, 2); equal(height(r, true), 1324.765625);
});

test('source integration order preserves both water waits and completion/pause timing', { skip: !available }, () => {
    const r = runtime(); advance(r, 78); equal(r.vm.location.commandIndex, 275);
    advance(r, 79); equal(r.vm.location.commandIndex, 277);
    advance(r, 86); equal(height(r), 132); equal(r.vm.location.commandIndex, 277);
    equal(r.world.objects.get(r.owner)!.movement, null);
    advance(r, 87); equal(height(r, true), 40); equal(r.vm.location.commandIndex, 283);
    equal(companion(r).zRotation, 336); equal(companion(r).zPerTick, 0);
    advance(r, 176); equal(height(r), 132); equal(r.vm.location.commandIndex, 283);
    advance(r, 177); equal(height(r), 132); equal(r.vm.location.commandIndex, 290);
    advance(r, 184); equal(r.vm.location.commandIndex, 290);
    advance(r, 185); equal(r.vm.location.commandIndex, 292);
    advance(r, 263); equal(height(r), 1432); equal(r.vm.location.commandIndex, 292);
    advance(r, 264); equal(height(r, true), 1340); equal(r.vm.location.commandIndex, 297);
    advance(r, 353); equal(height(r), 1432); equal(r.vm.location.commandIndex, 297);
    advance(r, 354); equal(height(r), 1432); equal(r.vm.location.commandIndex, 275);
});

test('repeated cycles execute the jump without respawning or modifying command bytes', { skip: !available }, () => {
    const f = fixture(), before = f.commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array)));
    const r = new ElevatorRuntime(f.config!); r.setEnabled(true); const id = companion(r).id;
    for (let cycle = 0; cycle < 10; cycle++) {
        advance(r, cycle * 354 + 87); equal(height(r), 132); equal(height(r, true), 40);
        advance(r, cycle * 354 + 264); equal(height(r), 1432); equal(height(r, true), 1340);
        equal(r.world.objects.size, 2); equal(companion(r).id, id);
    }
    deepEqual(f.commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array))), before);
});

test('scene clock handles repeated frames, pause, reset, disable and seeks without catch-up or leaks', { skip: !available }, () => {
    const r = runtime(); r.advanceTo(1000); r.advanceTo(1070); equal(r.tick, 70);
    const y = height(r); r.advanceTo(1070); equal(r.tick, 70);
    r.motionEnabled = false; r.advanceTo(1200); equal(height(r), y); equal(r.tick, 70);
    r.motionEnabled = true; r.advanceTo(1201); equal(r.tick, 71);
    r.reset(); equal(r.tick, 0); equal(r.world.objects.size, 2);
    r.advanceTo(1201); r.advanceTo(0); equal(r.tick, 0);
    r.advanceTo(5000); equal(r.tick, 0); equal(r.world.objects.size, 2);
    r.setEnabled(false); equal(r.world.objects.size, 1); equal(height(r), 1432);
    r.advanceTo(5020); equal(r.world.objects.size, 1);
    r.setEnabled(true); equal(r.world.objects.size, 2); equal(height(r, true), 1340);
});

test('object host rejects physics, nonzero launch, unsupported rotation and spawn overflow', { skip: !available }, () => {
    const f = fixture(), w = new CommandObjectWorld(f.catalog, () => 240, 3), p = f.config!.placement;
    ok(w.createObject('issuer', p).ok); ok(w.createObject('selected', p).ok);
    const spawn = f.commands[262].payload.createDataView();
    ok(w.executeObjectCommand('issuer', 'selected', 0x10, spawn).ok);
    ok(w.getEntity('issuer')!.references.has(7)); equal(w.getEntity('selected')!.references.has(7), false);
    equal(w.executeObjectCommand('issuer', 'selected', 0x10, spawn).ok, false);
    const launch = new DataView(spawn.buffer.slice(spawn.byteOffset, spawn.byteOffset + 8)); launch.setUint8(6, 1);
    equal(w.executeObjectCommand('issuer', 'selected', 0x10, launch).ok, false);
    equal(w.executeObjectCommand('issuer', 'selected', 0x32, f.commands[270].payload.createDataView()).ok, false);
    f.catalog.get(23)!.behaviorFlags! |= 4;
    equal(new CommandObjectWorld(f.catalog, () => 240, 1).createObject('physics', p).ok, false);
});

test('fault retains command location and disables preview; reset can recover', { skip: !available }, () => {
    const r = runtime(); r.config.commands[276].opcode = 0xFFFF;
    advance(r, 78); r.step(); equal(r.enabled, false); ok(r.error?.includes('ffff')); equal(r.vm.location.commandIndex, 276);
    r.config.commands[276].opcode = 0x26; r.setEnabled(true); equal(r.error, null); equal(r.world.objects.size, 2);
});


test('movement state zero stops controller progress and velocity without satisfying completion', { skip: !available }, () => {
    const f = fixture(), w = new CommandObjectWorld(f.catalog, () => 240, 1);
    ok(w.createObject('root', f.config!.placement).ok);
    ok(w.executeObjectCommand('root', 'root', 0x1C, f.commands[273].payload.createDataView()).ok);
    w.setState('root', 0); w.advanceController('root');
    equal(w.objects.get('root')!.movement!.progress, 0);
    w.setState('root', 1); w.advanceController('root'); w.integrate('root');
    equal(w.objects.get('root')!.fixedPosition[1] / 65536, 1416.765625);
    w.setState('root', 0); w.advanceController('root'); w.integrate('root');
    equal(w.objects.get('root')!.fixedPosition[1] / 65536, 1416.765625);
    equal(w.objects.get('root')!.movement!.progress, 3);
    deepEqual(w.evaluateCondition('root', f.commands[277].payload.createDataView()), { ok: true, value: false });
});

test('scale is raw unsigned, material resolves unsigned operands and relative movement uses signed high words', { skip: !available }, () => {
    const f = fixture(), w = new CommandObjectWorld(f.catalog, () => 240, 1);
    const result = w.createObject('root', { ...f.config!.placement, y: 0 }); ok(result.ok);
    w.getEntity('root')!.temporaries[0] = 0x8000;
    const p = new DataView(new ArrayBuffer(8)); p.setUint16(0, 0x7F7F);
    ok(w.executeObjectCommand('root', 'root', 0x33, p).ok); equal(result.value.material, 0x8000);
    ok(w.executeObjectCommand('root', 'root', 0x36, p).ok); equal(result.value.scale, 0x7F7F);
    p.setUint16(0, 0); ok(w.executeObjectCommand('root', 'root', 0x36, p).ok); equal(result.value.scale, 2048);
    result.value.fixedPosition[1] = -16384; w.integrate('root');
    p.setInt16(4, -1); p.setInt16(6, 256);
    ok(w.executeObjectCommand('root', 'root', 0x1C, p).ok);
    w.advanceController('root'); equal(result.value.fixedPosition[1], -16384);
    w.integrate('root'); equal(result.value.fixedPosition[1], -2 * 65536);
    ok(result.value.movement); w.advanceController('root'); equal(result.value.movement, null);
});

test('shared VM explicitly suspends object commands when the host lacks that capability', { skip: !available }, () => {
    const f = fixture(), w = new CommandWorld([{ id: 'owner', typeId: 23 }]);
    const vm = new CommandVM({ owner: 'owner', commands: f.commands, scriptBase: 262 }, w);
    vm.step(0); equal(vm.status, 'unsupported'); equal(vm.diagnostic!.commandIndex, 262);
    ok(vm.diagnostic!.reason.includes('Object capability')); equal(w.getEntity('owner')!.references.size, 0);
});
