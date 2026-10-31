import { equal, ok, deepEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { createPlayerPlacement } from '../animals.js';
import { findPayload, LevelPayloadType as P, parseLevelContainer, parseObjects, parseLevelDat, parseMap } from '../level.js';
import { parseCommands } from '../paths.js';
import { LEVELS } from '../level_table.js';
import { readLiveAnimalSpawns, LiveAnimalSpawnRuntime } from '../live_animal_spawns.js';
const available = existsSync('data/SSSV/levels/GIVE_A_DOG_A_BONUS.bin');
const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
function fixture(level = 'GIVE_A_DOG_A_BONUS') {
    const p = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`)), objects = parseObjects(findPayload(p, P.Cob)!);
    const commands = parseCommands(findPayload(p, P.Cmd)), map = parseMap(findPayload(p, P.Map)!);
    const dat = parseLevelDat(findPayload(p, P.Dat)!), player = createPlayerPlacement(dat, objects);
    return { objects, commands, map, player, config: readLiveAnimalSpawns(objects, commands, map, player) };
}
function runtime() { const f = fixture(); ok(f.config); const r = new LiveAnimalSpawnRuntime(f.config); r.setEnabled(true); return r; }
function advance(r: LiveAnimalSpawnRuntime, ticks: number) {
    for (let n = 0; n < ticks; n++) r.step();
    for (const vm of r.world.programs.values()) equal(vm.diagnostic, null, JSON.stringify(vm.diagnostic));
}

test('only the complete Dog Bonus parent programs and held behavior assignment are admitted', { skip: !available }, () => {
    deepEqual(LEVELS.filter(l => fixture(l.id).config).map(l => l.id), ['GIVE_A_DOG_A_BONUS']);
    const f = fixture(); f.commands[114].opcode = 0xffff;
    equal(readLiveAnimalSpawns(f.objects, f.commands, f.map, f.player), null);
});

test('nothing spawns until the explicit progression inputs satisfy the original predicates', { skip: !available }, () => {
    const r = runtime(); advance(r, 200); equal(r.world.animals.size, 0);
    r.setStage('foxes'); advance(r, 1); equal(r.world.animals.size, 3);
    equal(r.world.globals[4], 4); equal(r.world.globals[7], 0);
    const foxes = [...r.world.animals.values()];
    deepEqual(foxes.map(a => a.commandIndex).sort((a, b) => a - b), [258, 270, 283]);
    ok(foxes.every(a => a.placement.id === 7 && a.placement.rotation === 128 && a.navigation !== null));
    equal(foxes.find(a => a.commandIndex === 270)!.objectFlags, 4); equal(foxes.find(a => a.commandIndex === 283)!.objectFlags, 4);
    deepEqual(foxes.find(a => a.commandIndex === 258)!.placement, { id: 7, x: 2400, z: 5600, y: 2900, health: 127, rotation: 128, unkC: 0, unkE: 0 });
    const poses = foxes.map(a => ({ ...a.placement })); advance(r, 500);
    deepEqual(foxes.map(a => a.placement), poses); equal(r.world.animals.size, 3);
    ok([...r.world.programs.values()].filter(vm => vm.location.target?.startsWith('animal:')).every(vm => vm.status === 'waiting'));
});

test('dog waves execute message acknowledgement, original delays, reference/event assignments and sequence gate', { skip: !available }, () => {
    const r = runtime(); r.setStage('dogs'); advance(r, 1);
    equal(r.world.animals.size, 0); equal(r.world.message!.id, 8); equal(r.world.globals[7], 12);
    r.continueSequence(); advance(r, 1); equal(r.world.animals.size, 5);
    ok([...r.world.animals.values()].every(a => a.behaviorScript === 47 && a.eventScript === 58));
    const first = [...r.world.animals.values()].find(a => a.commandIndex === 92)!;
    equal(r.world.getEntity('object:47')!.references.get(1), first.id);
    equal(r.world.getEntity(first.id)!.references.has(1), false); // C94 writes the issuer's link, not the selected animal's.
    r.setStage('laterDogs'); advance(r, 119); equal(r.world.animals.size, 5); equal(r.world.cutsceneRequested, false);
    advance(r, 1); equal(r.world.cutsceneRequested, true); equal(r.world.animals.size, 5);
    r.continueSequence(); advance(r, 1); equal(r.world.animals.size, 8);
    equal(r.world.programs.get('object:47')!.status, 'stopped');
    advance(r, 600); equal(r.world.animals.size, 8);
});

test('stages can be supplied in either order without duplicate identities or mutation of bank records', { skip: !available }, () => {
    const r = runtime(), before = r.config.commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array)));
    r.setStage('dogs'); advance(r, 1); r.continueSequence(); advance(r, 121);
    r.continueSequence(); r.setStage('laterDogs'); advance(r, 1); equal(r.world.animals.size, 8);
    r.setStage('foxes'); advance(r, 1); equal(r.world.animals.size, 11);
    equal(new Set([...r.world.animals.keys()]).size, 11); equal(new Set([...r.world.animals.values()].map(a => a.commandIndex)).size, 11);
    for (let i = 0; i < 3; i++) { r.setStage('dogs'); r.setStage('foxes'); advance(r, 50); }
    equal(r.world.animals.size, 11);
    deepEqual(r.config.commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array))), before);
});

test('reset, disable, repeated frames and time seeks reconstruct the input snapshot and clear live instances', { skip: !available }, () => {
    const r = runtime(); r.setStage('foxes'); r.advanceTo(0); r.advanceTo(1); equal(r.world.animals.size, 3);
    const tick = r.world.programs.get('object:47')!.location.tick; r.advanceTo(1); equal(r.world.programs.get('object:47')!.location.tick, tick);
    r.reset(); equal(r.world.animals.size, 0); equal(r.world.globals[4], 0); equal(r.world.cameraRequests.length, 0);
    r.advanceTo(1); r.setStage('foxes'); r.advanceTo(2); equal(r.world.animals.size, 3);
    r.advanceTo(0); equal(r.world.animals.size, 0); r.advanceTo(10000); equal(r.world.animals.size, 0);
    r.setEnabled(false); r.setStage('foxes'); equal(r.world.globals[4], 0); r.setEnabled(true); equal(r.world.animals.size, 0);
});

test('unsupported live scripts retain a source location and cannot turn into raw-site previews', { skip: !available }, () => {
    const r = runtime(); r.config.commands[258].opcode = 0xffff;
    r.setStage('foxes'); r.step(); ok(r.world.programs.get('object:20')!.diagnostic);
    equal(r.world.programs.get('object:20')!.diagnostic!.commandIndex, 258); equal(r.world.animals.size, 2);
    r.config.commands[258].opcode = 0x60; r.reset(); r.setStage('foxes'); advance(r, 1); equal(r.world.animals.size, 3);
});
