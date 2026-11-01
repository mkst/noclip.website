import { deepEqual, equal, notEqual, ok, throws } from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { prepareLevel, prepareLevelFeatures } from '../core/level_preparation.js';
import { findPayload, LevelPayloadType as P, parseAnimals, parseCameraSkyMode, parseGeometry, parseHangingObjects,
    parseLevelContainer, parseLevelDat, parseLinks, parseMap, parseObjects, parsePaths, parseScrollingTable } from '../core/level.js';
import type { LevelPayload } from '../core/level.js';
import { LEVELS } from '../core/level_table.js';
import { analyzePathUses, parseCommands } from '../commands/paths.js';
import { createAnimalMarkers, createPlayerPlacement } from '../animals/animals.js';
import { createAnimalSpawnMarkers, readAbsoluteAnimalSpawns } from '../animals/animal_spawns.js';
import { readLiveAnimalSpawns } from '../animals/live_animal_spawns.js';
import { readStartupMusic } from '../audio/music_startup.js';
import { findArrivalEntrance } from '../effects/arrival.js';
import { readBoulderEvent } from '../effects/level_events.js';
import { readPersistentEmitters } from '../effects/particle_emitters.js';
import { createTorchEmitters } from '../effects/particles.js';
import { readRainButton } from '../objects/buttons.js';
import { readElevator } from '../objects/elevator.js';
import { readFenceSwitch } from '../objects/fence_switch.js';
import { resolveFenceSpans } from '../objects/fences.js';
import { readLagoonMachine } from '../objects/lagoon_machine.js';
import { indexObjectTable, parseObjectTable } from '../objects/objects.js';
import { readSnowPlatforms } from '../objects/snow_platforms.js';
import { readStartupLighting } from '../render/lighting.js';

const slice = (bytes: Uint8Array) => ArrayBufferSlice.fromView(bytes);
function minimal(): LevelPayload[] {
    const geo = new Uint8Array(24 * 0x34), view = new DataView(geo.buffer);
    for (let i = 0; i < 24; i++) view.setUint16(i * 0x34, 2);
    return [
        { type: P.Dat, data: slice(new Uint8Array(0x9C)) },
        { type: P.Geo, data: slice(geo) },
        { type: P.Map, data: slice(new Uint8Array(65 * 97 * 8)) },
        { type: P.Cob, data: slice(new Uint8Array(2)) },
    ];
}
const read = (path: string) => slice(readFileSync(path));

test('preparation uses production defaults for absent optional payloads, without browser or graphics state', () => {
    const level = prepareLevel(minimal(), 'EMPTY');
    equal(level.skyMode, 2); equal(level.scrollingTable, null); equal(level.ranges, null);
    for (const values of [level.objectPlacements, level.animalPlacements, level.hangingPlacements,
        level.commands, level.paths, level.links, level.animalMarkers, level.animalSpawns, level.animalSpawnMarkers])
        deepEqual(values, []);
    equal(level.playerPlacement, null); equal(level.arrivalEntrance, null);
    equal(level.boulderEvent, null); equal(level.rainButton, null);
    const features = prepareLevelFeatures(level, new Map());
    deepEqual(features.fences, []); deepEqual(features.torchEmitters, []);
    deepEqual(features.emitterAnalysis, { emitters: [], provenance: [] });
    for (const key of ['fenceConfig', 'elevatorConfig', 'machineConfig', 'snowConfig', 'liveSpawnConfig'] as const)
        equal(features[key], null);
});

test('missing required payload diagnostics identify the level and requirement', () => {
    for (const [type, name] of [[P.Dat, 'dat'], [P.Geo, 'geo'], [P.Map, 'map'], [P.Cob, 'objects']] as const)
        throws(() => prepareLevel(minimal().filter(p => p.type !== type), 'TEST_LEVEL'), new RegExp(`TEST_LEVEL: missing ${name}`));
});

test('present malformed payloads fail rather than being treated as absent', () => {
    for (const type of [P.Dat, P.Geo, P.Map, P.Cob, P.Can, P.Cha, P.Joi, P.Cmd, P.Paf]) {
        const payloads = minimal().filter(p => p.type !== type);
        payloads.push({ type, data: slice(new Uint8Array()) });
        throws(() => prepareLevel(payloads, 'MALFORMED'));
    }
    const camera = minimal(); camera.push({ type: P.Cam, data: slice(new Uint8Array(1)) });
    equal(prepareLevel(camera, 'SHORT_CAMERA').skyMode, 2);
    throws(() => parseLevelContainer(slice(new Uint8Array([P.Dat, 0, 0, 0]))), /not RNC-compressed/);
});

test('preparation retains command/range views and creates independent caller-owned results', () => {
    const payloads = minimal(), bytes = new Uint8Array(12), view = new DataView(bytes.buffer);
    view.setUint16(0, 12); view.setUint16(2, 9);
    const command = slice(bytes), ranges = slice(new Uint8Array(2));
    payloads.push({ type: P.Cmd, data: command }, { type: P.Rng, data: ranges });
    const before = payloads.map(p => Array.from(p.data.createTypedArray(Uint8Array)));
    const first = prepareLevel(payloads, 'TEST'), second = prepareLevel(payloads, 'TEST');
    deepEqual(first, second); notEqual(first, second); notEqual(first.map, second.map);
    equal(first.ranges, ranges); equal(first.commands[0].payload.arrayBuffer, command.arrayBuffer);
    const a = prepareLevelFeatures(first, new Map()), b = prepareLevelFeatures(first, new Map());
    deepEqual(a, b); notEqual(a.fences, b.fences);
    first.map[0].unk0 = 17;
    equal(second.map[0].unk0, 0);
    deepEqual(payloads.map(p => Array.from(p.data.createTypedArray(Uint8Array))), before);
});

test('object, animal, player, command, path and link identities survive preparation', () => {
    const payloads = minimal(), object = new Uint8Array(24), o = new DataView(object.buffer);
    o.setUint16(0, 1); o.setUint16(2, 55); o.setInt16(4, 100); o.setInt16(6, 200); o.setInt16(8, 300); o.setInt16(18, 1);
    payloads.find(p => p.type === P.Cob)!.data = slice(object);
    const animal = new Uint8Array(18), a = new DataView(animal.buffer);
    a.setInt16(0, 1); a.setInt16(2, 7); a.setInt16(4, -40); a.setInt16(14, 1);
    const commands = new Uint8Array(22), c = new DataView(commands.buffer);
    c.setUint16(0, 22); c.setUint16(2, 0x1D); c.setUint16(12, 9);
    payloads.push({ type: P.Can, data: slice(animal) }, { type: P.Cmd, data: slice(commands) },
        { type: P.Paf, data: slice(new Uint8Array([0, 1, 1, 2, 3, 4])) },
        { type: P.Joi, data: slice(new Uint8Array([0, 1, 0, 0, 3, 232, 0, 0])) },
        { type: P.Cam, data: slice(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 192])) });
    const level = prepareLevel(payloads, 'TEST');
    equal(level.objectPlacements[0].id, 55); equal(level.objectPlacements[0].commandReferenceIdx, 1);
    equal(level.animalPlacements[0].id, 7); equal(level.animalPlacements[0].x, -40);
    equal(level.playerPlacement!.y, 308); equal(level.animalMarkers.length, 2); equal(level.skyMode, 3);
    deepEqual(level.links, [{ parent: 0, child: 1000, referenceIdx: 0 }]);
    deepEqual(level.paths[0].waypoints, [{ x: 2, z: 3, y: 4 }]);
    equal(level.pathAnalysis.paths[0].path, level.paths[0]);
    const roles = level.pathAnalysis.paths[0].roles;
    ok(roles.includes('object')); ok(roles.includes('animal'));
    equal(level.arrivalEntrance!.placement, level.objectPlacements[0]);
});

// This is an independent parser/reader oracle, not a second production preparation path.
// Keep the assertions so moving orchestration cannot silently change its inputs or defaults.
test('shared preparation agrees with existing parsers and feature readers on all 36 levels',
    { skip: !existsSync('data/SSSV/objects.bin') }, () => {
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    for (const entry of LEVELS) {
        const data = read(`data/SSSV/levels/${entry.id}.bin`), payloads = parseLevelContainer(data);
        const get = (type: P) => findPayload(payloads, type);
        const level = prepareLevel(payloads, entry.id), features = prepareLevelFeatures(level, table);
        deepEqual(prepareLevel(payloads, entry.id), level, `${entry.id}: deterministic preparation`);
        const dat = parseLevelDat(get(P.Dat)!), objects = parseObjects(get(P.Cob)!), map = parseMap(get(P.Map)!);
        const animals = get(P.Can) ? parseAnimals(get(P.Can)!) : [], commands = parseCommands(get(P.Cmd));
        const links = get(P.Joi) ? parseLinks(get(P.Joi)!) : [], paths = parsePaths(get(P.Paf));
        const player = createPlayerPlacement(dat, objects), spawns = readAbsoluteAnimalSpawns(commands);
        deepEqual(level.dat, dat); deepEqual(level.geometry, parseGeometry(get(P.Geo)!, dat)); deepEqual(level.map, map);
        deepEqual(level.objectPlacements, objects); deepEqual(level.animalPlacements, animals);
        deepEqual(level.hangingPlacements, get(P.Cha) ? parseHangingObjects(get(P.Cha)!) : []);
        deepEqual(level.scrollingTable, get(P.Unknown14) ? parseScrollingTable(get(P.Unknown14)!) : null);
        equal(level.skyMode, get(P.Cam) ? parseCameraSkyMode(get(P.Cam)!) : 2);
        deepEqual(level.commands, commands); deepEqual(level.links, links); deepEqual(level.paths, paths);
        deepEqual(level.pathAnalysis, analyzePathUses(paths, commands, objects, animals, links));
        deepEqual(level.playerPlacement, player); deepEqual(level.animalMarkers, createAnimalMarkers(animals, player));
        deepEqual(level.animalSpawns, spawns); deepEqual(level.animalSpawnMarkers, createAnimalSpawnMarkers(spawns, map));
        deepEqual(level.boulderEvent, readBoulderEvent(objects, commands, get(P.Rng)));
        deepEqual(level.rainButton, readRainButton(objects, commands)); deepEqual(level.arrivalEntrance, findArrivalEntrance(objects));
        deepEqual(level.startupLighting, readStartupLighting(commands, objects, animals));
        deepEqual(level.startupMusic, readStartupMusic(commands, objects, animals));
        const fences = resolveFenceSpans(objects, table, links);
        deepEqual(features.fences, fences);
        deepEqual(features.fenceConfig, readFenceSwitch(objects, commands, links, get(P.Rng), fences));
        if (features.fenceConfig) ok(features.fences.includes(features.fenceConfig.fence));
        deepEqual(features.torchEmitters, createTorchEmitters(objects, table));
        deepEqual(features.emitterAnalysis, readPersistentEmitters(objects, table, commands));
        deepEqual(features.elevatorConfig, readElevator(objects, commands, table, map));
        deepEqual(features.snowConfig, readSnowPlatforms(objects, commands, table, paths, links));
        deepEqual(features.machineConfig, readLagoonMachine(objects, commands, table, links, get(P.Rng), player));
        deepEqual(features.liveSpawnConfig, readLiveAnimalSpawns(objects, commands, map, player));
    }
});
