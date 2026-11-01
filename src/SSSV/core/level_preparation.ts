import type ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { assertExists } from '../../util.js';
import { readAbsoluteAnimalSpawns, createAnimalSpawnMarkers } from '../animals/animal_spawns.js';
import { createAnimalMarkers, createPlayerPlacement } from '../animals/animals.js';
import { readLiveAnimalSpawns } from '../animals/live_animal_spawns.js';
import { readStartupMusic } from '../audio/music_startup.js';
import { analyzePathUses, parseCommands } from '../commands/paths.js';
import { findArrivalEntrance } from '../effects/arrival.js';
import { readBoulderEvent } from '../effects/level_events.js';
import { readPersistentEmitters } from '../effects/particle_emitters.js';
import { createTorchEmitters } from '../effects/particles.js';
import { readRainButton } from '../objects/buttons.js';
import { readElevator } from '../objects/elevator.js';
import { readFenceSwitch } from '../objects/fence_switch.js';
import { resolveFenceSpans } from '../objects/fences.js';
import { readLagoonMachine } from '../objects/lagoon_machine.js';
import type { SSSVObjectData } from '../objects/objects.js';
import { readSnowPlatforms } from '../objects/snow_platforms.js';
import { readStartupLighting } from '../render/lighting.js';
import { findPayload, LevelPayloadType as P, parseAnimals, parseCameraSkyMode, parseGeometry, parseHangingObjects,
    parseLevelDat, parseLinks, parseMap, parseObjects, parsePaths, parseScrollingTable } from './level.js';
import type { LevelPayload } from './level.js';
import { BIOME_SEGMENTS, LEVEL_SEGMENT_ALIASES } from './level_table.js';

export interface PreparedLevel {
    dat: ReturnType<typeof parseLevelDat>;
    geometry: ReturnType<typeof parseGeometry>;
    scrollingTable: ReturnType<typeof parseScrollingTable> | null;
    skyMode: number;
    map: ReturnType<typeof parseMap>;
    objectPlacements: ReturnType<typeof parseObjects>;
    animalPlacements: ReturnType<typeof parseAnimals>;
    hangingPlacements: ReturnType<typeof parseHangingObjects>;
    links: ReturnType<typeof parseLinks>;
    paths: ReturnType<typeof parsePaths>;
    commands: ReturnType<typeof parseCommands>;
    ranges: ArrayBufferSlice | null;
    playerPlacement: ReturnType<typeof createPlayerPlacement>;
    animalMarkers: ReturnType<typeof createAnimalMarkers>;
    animalSpawns: ReturnType<typeof readAbsoluteAnimalSpawns>;
    animalSpawnMarkers: ReturnType<typeof createAnimalSpawnMarkers>;
    pathAnalysis: ReturnType<typeof analyzePathUses>;
    boulderEvent: ReturnType<typeof readBoulderEvent>;
    rainButton: ReturnType<typeof readRainButton>;
    arrivalEntrance: ReturnType<typeof findArrivalEntrance>;
    startupLighting: ReturnType<typeof readStartupLighting>;
    startupMusic: ReturnType<typeof readStartupMusic>;
    biome: string | null;
    levelSegmentName: string;
}

// No fetching or live state: optional payloads follow the production loader's defaults.
export function prepareLevel(payloads: LevelPayload[], levelId: string): PreparedLevel {
    const get = (type: P) => findPayload(payloads, type);
    const required = (type: P, name: string) => assertExists(get(type), `${levelId}: missing ${name}`);
    const dat = parseLevelDat(required(P.Dat, 'dat'));
    const geometry = parseGeometry(required(P.Geo, 'geo'), dat);
    const scrolling = get(P.Unknown14), camera = get(P.Cam), joints = get(P.Joi);
    const map = parseMap(required(P.Map, 'map'));
    const objectPlacements = parseObjects(required(P.Cob, 'objects'));
    const hanging = get(P.Cha), animals = get(P.Can);
    const hangingPlacements = hanging !== null ? parseHangingObjects(hanging) : [];
    const animalPlacements = animals !== null ? parseAnimals(animals) : [];
    const links = joints !== null ? parseLinks(joints) : [];
    const paths = parsePaths(get(P.Paf)), commands = parseCommands(get(P.Cmd)), ranges = get(P.Rng);
    const playerPlacement = createPlayerPlacement(dat, objectPlacements);
    const animalSpawns = readAbsoluteAnimalSpawns(commands);
    return {
        dat, geometry, map, objectPlacements, hangingPlacements, animalPlacements, links, paths, commands, ranges,
        scrollingTable: scrolling !== null ? parseScrollingTable(scrolling) : null,
        skyMode: camera !== null ? parseCameraSkyMode(camera) : 2,
        playerPlacement,
        animalMarkers: createAnimalMarkers(animalPlacements, playerPlacement),
        animalSpawns, animalSpawnMarkers: createAnimalSpawnMarkers(animalSpawns, map),
        pathAnalysis: analyzePathUses(paths, commands, objectPlacements, animalPlacements, links),
        boulderEvent: readBoulderEvent(objectPlacements, commands, ranges),
        rainButton: readRainButton(objectPlacements, commands),
        arrivalEntrance: findArrivalEntrance(objectPlacements),
        startupLighting: readStartupLighting(commands, objectPlacements, animalPlacements),
        startupMusic: readStartupMusic(commands, objectPlacements, animalPlacements),
        biome: BIOME_SEGMENTS[dat.segment] ?? null,
        levelSegmentName: LEVEL_SEGMENT_ALIASES[levelId] ?? levelId,
    };
}

// Definition-dependent discovery is separate so callers retain their resource-loading order.
// Prop admission still needs prepared meshes and remains with readObjectPrograms().
export function prepareLevelFeatures(level: PreparedLevel, objectTable: Map<number, SSSVObjectData>) {
    const { objectPlacements: objects, commands, links, ranges, map, paths, playerPlacement: player } = level;
    const fences = resolveFenceSpans(objects, objectTable, links);
    return {
        fences,
        fenceConfig: readFenceSwitch(objects, commands, links, ranges, fences),
        torchEmitters: createTorchEmitters(objects, objectTable),
        emitterAnalysis: readPersistentEmitters(objects, objectTable, commands),
        elevatorConfig: readElevator(objects, commands, objectTable, map),
        machineConfig: readLagoonMachine(objects, commands, objectTable, links, ranges, player),
        snowConfig: readSnowPlatforms(objects, commands, objectTable, paths, links),
        liveSpawnConfig: readLiveAnimalSpawns(objects, commands, map, player),
    };
}
