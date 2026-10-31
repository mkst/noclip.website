import { FloorButtonVisuals } from '../floor_buttons.js';
import { readLagoonMachine, LagoonMachineRuntime, MACHINE_ARMS, MACHINE_PADS, MACHINE_LEVERS } from '../lagoon_machine.js';
import { LagoonMachineVisuals } from '../lagoon_machine_renderer.js';
import { readSnowPlatforms, SnowPlatformRuntime } from "../snow_platforms.js";
import { SnowPlatformVisuals } from "../snow_platform_renderer.js";
import { readLiveAnimalSpawns, LiveAnimalSpawnRuntime } from "../live_animal_spawns.js";
import { LiveAnimalSpawnVisuals } from "../live_animal_renderer.js";
import { EmitterCommandRuntime } from "../emitter_commands.js";
import { ObjectCommandRuntime, readObjectPrograms } from "../object_commands.js";
import { readElevator } from "../elevator.js";
import { buildElevatorVisuals } from "../elevator_renderer.js";
import { buildArrivalVisuals, EntranceArrival, findArrivalEntrance } from "../arrival.js";
import { existsSync, readFileSync } from "fs";

(globalThis as any).window = { debug: false };

import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { assert, assertExists } from "../../util.js";
import { RSP_Geometry, RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { BIOME_REGULAR_TEXTURES, BIOME_SEGMENTS, getLevelRegularTextureBank, LEVEL_OBJECT_TEXTURES, LEVEL_SEGMENT_ALIASES, LEVELS, WATER_TEXTURE } from "../level_table.js";
import { findPayload, LevelPayloadType, mirrorZ, parseAnimals, parseGeometry, parseHangingObjects, parseLevelContainer, parseLevelDat, parseLinks, parseMap, parseObjects, parsePaths, parseScrollingTable } from "../level.js";
import { parseI8Texture, parseMipmapBank, parseRegularBank } from "../texture.js";
import { buildMap, buildTerrain, buildWater, installTerrainAnimationTextures, SSSVLayer } from "../terrain.js";
import { BIOME_REGULAR_TEXTURE_ID_BASE, buildBillboards, buildObjects, indexObjectTable, installDynamicBillboardTextures, installReflectionTextures, installShadowTextures, installTeleporterTextures, LEVEL_REGULAR_TEXTURE_ID_BASE, parseObjectTable, parseObjectTextureBank } from "../objects.js";
import type { SSSVBillboard } from "../objects.js";
import { resolveFenceSpans } from "../fences.js";
import { analyzePathUses, parseCommands } from "../paths.js";
import { readObjectVisibility, readObjectStartupAppearance } from "../object_startup.js";
import { applyStartupLighting, readStartupLighting } from "../lighting.js";
import { createTorchEmitters, sampleParticleSurfaces, TorchSimulation } from "../particles.js";
import { parseParticleDefinition, parseTorchDriftTable, parseTorchParticleTextures, TORCH_PARTICLE_ASSETS } from "../particle_assets.js";
import { particleDefinitionFile, parseScriptParticleTextures, SCRIPT_PARTICLE_IDS, SCRIPT_PARTICLE_TEXTURE_BASE, SCRIPT_PARTICLE_TEXTURE_OFFSETS } from "../particle_assets.js";
import { readPersistentEmitters } from "../particle_emitters.js";
import { ScriptParticleSimulation } from "../script_particles.js";
import { buildHangingRibbons, HangingSimulation, resolveHangingObject } from "../hanging.js";
import { buildAnimalMarkers, createAnimalMarkers, createPlayerPlacement } from "../animals.js";
import { createAnimalSpawnMarkers, readAbsoluteAnimalSpawns } from "../animal_spawns.js";
import { BoulderEventSimulation, readBoulderEvent } from "../level_events.js";
import { buildBoulderEventVisuals } from "../level_event_renderer.js";
import { LEVEL_EVENT_PARTICLE_IDS, LEVEL_EVENT_TEXTURE_BASE, parseLevelEventParticleTextures } from "../particle_assets.js";
import { DOG_STATIC_RECIPE, getDogStaticRecipe, getStaticAnimalRecipe } from "../animal_contracts.js";
import { buildStaticAnimalModels } from "../animal_renderer.js";
import { buildLampGlows, buildLeverLights, buildSwitchBalls } from "../switch_visuals.js";
import { sampleWoolVertex } from "../wool.js";
import { ANIMAL_EYE_ATLASES, sampleAnimalEyeFrame } from "../animal_eyes.js";

function read(path: string): ArrayBufferSlice {
    return ArrayBufferSlice.fromView(readFileSync(path));
}

function installTextures(sharedOutput: RSPSharedOutput, biome: string | null, textureBank: string, segment: number, textureSlot: number): void {
    const levelTextures = parseMipmapBank(read(`data/SSSV/textures/${textureBank}.bin`), "rgba16", textureBank);
    let biomeRgba = [];
    let biomeIa = [];

    if (biome !== null) {
        biomeRgba = parseMipmapBank(read(`data/SSSV/textures/${biome}.rgba16.bin`), "rgba16", biome);
        biomeIa = parseMipmapBank(read(`data/SSSV/textures/${biome}.ia16.bin`), "ia16", biome);
    }

    const cache = sharedOutput.textureCache;
    for (let i = 0; i < biomeRgba.length; i++)
        cache.textures[i] = biomeRgba[i];
    for (let i = 0; i < levelTextures.length; i++)
        cache.textures[20 + i] = levelTextures[i];
    for (let i = 0; i < biomeIa.length; i++)
        cache.textures[32 + i] = biomeIa[i];
    cache.textures[300] = parseI8Texture(read(`data/SSSV/textures/${WATER_TEXTURE.name}.${WATER_TEXTURE.format}.bin`), WATER_TEXTURE.width, WATER_TEXTURE.height, WATER_TEXTURE.name);

    const biomeRegularKey = biome === "city" ? "europe" : biome;
    const biomeRegular = biomeRegularKey !== null ? BIOME_REGULAR_TEXTURES[biomeRegularKey] : undefined;
    if (biomeRegular !== undefined) {
        const path = `data/SSSV/textures/${biomeRegular.name}.regular.bin`;
        if (existsSync(path)) {
            const textures = parseRegularBank(read(path), biomeRegular.name);
            for (let i = 0; i < textures.length; i++)
                cache.textures[BIOME_REGULAR_TEXTURE_ID_BASE + i] = textures[i];
        }
    }
    const levelRegular = getLevelRegularTextureBank(segment, textureSlot);
    if (levelRegular !== undefined) {
        const path = `data/SSSV/textures/${levelRegular.name}.regular.bin`;
        if (existsSync(path)) {
            const textures = parseRegularBank(read(path), levelRegular.name);
            for (let i = 0; i < textures.length; i++)
                cache.textures[LEVEL_REGULAR_TEXTURE_ID_BASE + i] = textures[i];
        }
    }

    if (biomeRgba.length === 0) {
        for (let i = 0; i < levelTextures.length; i++)
            cache.textures[i] = levelTextures[i];
    }
}

function verifyLevel(levelId: string): void {
    const entry = LEVELS.find((entry) => entry.id === levelId);
    assert(entry !== undefined, `Unknown level ${levelId}`);

    const payloads = parseLevelContainer(read(`data/SSSV/levels/${entry.id}.bin`));
    const datData = findPayload(payloads, LevelPayloadType.Dat);
    const geoData = findPayload(payloads, LevelPayloadType.Geo);
    assert(datData !== null, `${entry.id}: missing dat`);
    assert(geoData !== null, `${entry.id}: missing geo`);

    const dat = parseLevelDat(datData);
    const geometry = parseGeometry(geoData, dat);
    const scrollingData = findPayload(payloads, LevelPayloadType.Unknown14);
    const scrollingTable = scrollingData !== null ? parseScrollingTable(scrollingData) : null;
    const map = parseMap(assertExists(findPayload(payloads, LevelPayloadType.Map), `${entry.id}: map`));
    const objects = parseObjects(assertExists(findPayload(payloads, LevelPayloadType.Cob), `${entry.id}: cob`));
    const animals = parseAnimals(assertExists(findPayload(payloads, LevelPayloadType.Can), `${entry.id}: can`));
    const player = createPlayerPlacement(dat, objects);
    const hangingData = findPayload(payloads, LevelPayloadType.Cha);
    const hanging = hangingData !== null ? parseHangingObjects(hangingData) : [];
    for (const placement of hanging) {
        for (const index of [placement.anchorObjectIndex, placement.endObjectIndex])
            assert(index === -1 || resolveHangingObject(objects, index) !== null, `${entry.id}: hanging type ${placement.type} has invalid object reference ${index}`);
    }
    const hangingRibbons = buildHangingRibbons(hanging, objects, map);
    for (const ribbon of hangingRibbons) {
        assert(ribbon.points.length === ribbon.descriptor.pointCount * 3, `${entry.id}: hanging type ${ribbon.descriptor.type} point count mismatch`);
        for (const value of ribbon.points)
            assert(Number.isFinite(value), `${entry.id}: hanging type ${ribbon.descriptor.type} has invalid point`);
    }

    const simulation = new HangingSimulation(hangingRibbons);
    simulation.advance(120);
    const firstState = hangingRibbons.map((ribbon) => Float32Array.from(ribbon.points));
    for (let r = 0; r < hangingRibbons.length; r++) {
        const ribbon = hangingRibbons[r];
        const points = ribbon.points;
        for (let i = 1; i < ribbon.descriptor.pointCount; i++) {
            const dx = points[i * 3 + 0] - points[(i - 1) * 3 + 0];
            const dy = points[i * 3 + 1] - points[(i - 1) * 3 + 1];
            const dz = points[i * 3 + 2] - points[(i - 1) * 3 + 2];
            assert(Math.abs(Math.hypot(dx, dy, dz) - ribbon.spacing) < 0.01, `${entry.id}: hanging type ${ribbon.descriptor.type} segment length drifted`);
        }
    }
    simulation.reset();
    simulation.advance(120);
    for (let r = 0; r < hangingRibbons.length; r++) {
        for (let i = 0; i < firstState[r].length; i++)
            assert(firstState[r][i] === hangingRibbons[r].points[i], `${entry.id}: hanging simulation is not deterministic`);
    }
    const biome = BIOME_SEGMENTS[dat.segment] ?? null;
    const levelSegmentName = LEVEL_SEGMENT_ALIASES[entry.id] ?? entry.id;
    const sharedOutput = new RSPSharedOutput();
    installTextures(sharedOutput, biome, entry.textureBank, dat.segment, dat.textureBank);

    const objectTable = indexObjectTable(parseObjectTable(read(`data/SSSV/objects.bin`)));
    const commands = parseCommands(findPayload(payloads, LevelPayloadType.Cmd));
    const animalSpawns = readAbsoluteAnimalSpawns(commands);
    const expectedSpawns: Record<string, number> = { SMASHING_START: 1, RAT_O_MATIC: 1, GIVE_A_DOG_A_BONUS: 11, EVOS_ESCAPE: 3, PUNCHUP_PYRAMID: 3, BIG_CELEBRATION_PARADE: 10, INTRO: 13 };
    assert(animalSpawns.length === (expectedSpawns[entry.id] ?? 0), `${entry.id}: unexpected absolute animal spawn coverage`);
    const spawnMarkers = createAnimalSpawnMarkers(animalSpawns, map);
    assert(spawnMarkers.length === animalSpawns.length && spawnMarkers.every(marker => marker.label.startsWith("SPAWN PREVIEW:")), `${entry.id}: missing spawn preview markers`);
    const torches = createTorchEmitters(objects, objectTable);
    const emitterAnalysis = readPersistentEmitters(objects, objectTable, commands);
    const expectedEmitters: Record<string, number[]> = { JUNGLE_JAPES: [10, 11, 12], JUNGLE_DOLDRUMS: [22, 23, 24, 25], SHIFTING_SANDS: [11, 13, 14, 15, 16, 17], SWAMP_OF_ETERNAL_STENCH: [80] };
    assert(JSON.stringify(emitterAnalysis.emitters.map(e => e.placementIndex)) === JSON.stringify(expectedEmitters[entry.id] ?? []), `${entry.id}: unexpected persistent emitter coverage`);
    if (emitterAnalysis.emitters.length !== 0) {
        const definitions = new Map(SCRIPT_PARTICLE_IDS.map(id => {
            const data = read(`data/SSSV/${particleDefinitionFile(id)}`);
            return [id, parseParticleDefinition(data)] as const;
        }));
        const emitterPrograms = new EmitterCommandRuntime(emitterAnalysis.emitters, commands, player);
        assert(JSON.stringify(emitterPrograms.emitters.map(e => e.initial)) === JSON.stringify(emitterAnalysis.emitters.map(e => e.initial)), `${entry.id}: emitter VM configuration mismatch`);
        const simulation = new ScriptParticleSimulation(emitterPrograms.emitters, definitions, map, dat, emitterAnalysis.provenance, emitterPrograms);
        for (const tick of [0, 1, 2, 4, 38, 120, 240, 1000000, 7, 120]) {
            simulation.advanceTo(tick);
            assert(emitterPrograms.programs.every(p => p.vm.diagnostic === null), `${entry.id}: emitter program fault`);
            assert(simulation.particles.length <= 255, `${entry.id}: excessive script particles`);
            for (const p of simulation.particles) {
                assert(Number.isFinite(p.x + p.y + p.z + p.size), `${entry.id}: invalid script particle`);
                assert(p.texture0 >= SCRIPT_PARTICLE_TEXTURE_BASE && p.texture1 < SCRIPT_PARTICLE_TEXTURE_BASE + SCRIPT_PARTICLE_TEXTURE_OFFSETS.length, `${entry.id}: invalid particle frame pair`);
            }
        }
        const state = JSON.stringify(simulation.particles);
        simulation.advanceTo(7); simulation.advanceTo(120);
        assert(JSON.stringify(simulation.particles) === state, `${entry.id}: script particles are not deterministic`);
        assert(parseScriptParticleTextures(read("data/SSSV/segments/segment1.bin")).length === SCRIPT_PARTICLE_TEXTURE_OFFSETS.length, `${entry.id}: missing script particle textures`);
    }
    if (torches.length !== 0) {
        const a = TORCH_PARTICLE_ASSETS;
        const simulation = new TorchSimulation(torches, parseParticleDefinition(read(`data/SSSV/${a.definitionFile}`)), parseTorchDriftTable(read(`data/SSSV/${a.driftFile}`)), map);
        for (const tick of [...Array.from({ length: 1036 }, (_, i) => i), 1000000, 7]) {
            simulation.advanceTo(tick);
            assert(simulation.particles.length <= torches.length * 3, `${entry.id}: excessive torch particles`);
            for (const particle of simulation.particles) {
                assert(Number.isFinite(particle.x + particle.y + particle.z), `${entry.id}: invalid torch particle position`);
                assert(particle.frame + 1 < a.textureCount, `${entry.id}: invalid torch frame pair`);
                const surface = sampleParticleSurfaces(map, particle.x / 65536, particle.z / 65536);
                assert(surface !== null && surface.water === 0, `${entry.id}: torch requires animated water collision support`);
            }
        }
        assert(parseTorchParticleTextures(read(`data/SSSV/segments/segment1.bin`)).length === a.textureCount, `${entry.id}: missing torch textures`);
    }
    const linkData = findPayload(payloads, LevelPayloadType.Joi);
    const links = linkData !== null ? parseLinks(linkData) : [];
    const fences = resolveFenceSpans(objects, objectTable, links);
    const levelSegment = read(`data/SSSV/segments/${levelSegmentName}.bin`);
    const objectTextures = parseObjectTextureBank(levelSegment, LEVEL_OBJECT_TEXTURES[levelSegmentName] ?? []);
    for (let i = 0; i < objectTextures.length; i++)
        sharedOutput.textureCache.textures[40 + i] = objectTextures[i];
    const segmentBuffers: (ArrayBufferSlice | undefined)[] = [];
    segmentBuffers[0x01] = read(`data/SSSV/segments/segment1.bin`);
    if (biome !== null)
        segmentBuffers[0x04] = read(`data/SSSV/segments/${biome}_biome.bin`);
    segmentBuffers[0x05] = levelSegment;
    installDynamicBillboardTextures(sharedOutput, segmentBuffers[0x01]!);
    installShadowTextures(sharedOutput, segmentBuffers[0x01]!);
    installTeleporterTextures(sharedOutput, segmentBuffers[0x01]!);
    installReflectionTextures(sharedOutput, segmentBuffers[0x01]!);
    installTerrainAnimationTextures(sharedOutput, segmentBuffers[0x01]!);

    const drawCalls = buildTerrain(sharedOutput, geometry, dat, scrollingTable);
    const markers = createAnimalMarkers(animals, player);
    assert(markers.length === animals.length + (player !== null ? 1 : 0), `${entry.id}: missing player marker`);
    if (player !== null) assert(markers[markers.length - 1].label.startsWith("PLAYER ("), `${entry.id}: player label is missing`);
    const water = buildWater(sharedOutput, map, dat, 300);
    if (water !== null)
        drawCalls.push(water);
    const mapLayer = buildMap(sharedOutput, map, dat, SSSVLayer.Map);
    if (mapLayer !== null)
        drawCalls.push(mapLayer);
    const upperLayer = buildMap(sharedOutput, map, dat, SSSVLayer.Upper);
    if (upperLayer !== null)
        drawCalls.push(upperLayer);
    const paths = parsePaths(findPayload(payloads, LevelPayloadType.Paf));
    const pathAnalysis = analyzePathUses(paths, commands, objects, animals, links);
    const startupHidden = objects.filter((placement) => {
        const mode = objectTable.get(placement.id)?.renderMode;
        if (mode !== 6 && mode !== 12) return false;
        const material = readObjectStartupAppearance(placement, commands)?.material;
        return material !== null && material !== undefined && (material & 0x3F) === 40;
    }).length;
    const expectedStartupHidden: Record<string, number> = { PENGUIN_PLAYPEN: 2, WALRACE_64: 1 };
    assert(startupHidden === (expectedStartupHidden[entry.id] ?? 0), `${entry.id}: unexpected startup-hidden object coverage`);
    const objectDrawCalls = buildObjects(sharedOutput, objects, objectTable, segmentBuffers, dat, commands, pathAnalysis);
    const hiddenObjectIndices = new Set(objects.flatMap((placement, index) => readObjectVisibility(placement, commands).hidden ? [index] : []));
    assert(objectDrawCalls.every(draw => draw.objectPlacementIndex === null || !hiddenObjectIndices.has(draw.objectPlacementIndex)), `${entry.id}: hidden object submitted a mesh`);
    const teleporterFans = objectDrawCalls.filter(draw => draw.teleporter?.part === "fan");
    assert(new Set(teleporterFans.map(draw => draw.objectPlacementIndex)).size === objects.filter(p => objectTable.get(p.id)?.renderMode === 7).length, `${entry.id}: teleporter fan coverage`);
    assert(teleporterFans.every(draw => draw.visible === (draw.teleporter!.state === 1) && draw.textureIndices[0] === 613), `${entry.id}: teleporter startup fan state/texture`);
    const leverHandles = new Set(objectDrawCalls.flatMap(draw => draw.leverHandle !== null ? [draw.objectPlacementIndex] : []));
    assert(leverHandles.size === objects.filter((p, i) => objectTable.get(p.id)?.renderMode === 12 && !hiddenObjectIndices.has(i)).length, `${entry.id}: lever handle coverage`);
    const animatedPathObjects = new Set(objectDrawCalls.flatMap((draw) => draw.objectPathMotion !== null ? [draw.objectPathMotion.placement] : []));
    assert(animatedPathObjects.size === (entry.id === "SNOW_JOKE" ? 3 : 0), `${entry.id}: unexpected path-motion selection`);
    drawCalls.push(...objectDrawCalls);
    const billboardSets = JSON.parse(readFileSync("data/SSSV/billboards.json", "utf8")) as SSSVBillboard[][];
    const billboardDrawCalls = buildBillboards(sharedOutput, objects, objectTable, billboardSets, dat, commands);
    assert(billboardDrawCalls.every(draw => draw.objectPlacementIndex === null || !hiddenObjectIndices.has(draw.objectPlacementIndex)), `${entry.id}: hidden object submitted a billboard`);
    const expectedTallSprites: Record<string, number> = { HONEYMOON_LAGOON: 18, FAT_BEAR_MOUNTAIN: 9, ROCKY_HARD_PLACE: 16, JUNGLE_DOLDRUMS: 8, WEIGHT_FOR_IT: 8 };
    assert(billboardDrawCalls.filter(draw => draw.projectedObjectSprite !== null).length === (expectedTallSprites[entry.id] ?? 0), `${entry.id}: tall billboard coverage`);
    drawCalls.push(...billboardDrawCalls);
    const switchBalls = buildSwitchBalls(sharedOutput, objects, objectTable, dat, commands);
    const expectedSwitchIndices = objects.flatMap((p, i) => [4, 13].includes(objectTable.get(p.id)?.renderMode ?? -1) && !hiddenObjectIndices.has(i) ? [i] : []);
    assert(switchBalls.length === expectedSwitchIndices.length && switchBalls.every((draw, i) => draw.objectPlacementIndex === expectedSwitchIndices[i]), `${entry.id}: switch ball coverage/identity`);
    drawCalls.push(...switchBalls);
    const leverLights = buildLeverLights(sharedOutput, objects, objectTable, dat, commands);
    assert(leverLights.length === objects.filter((p, i) => objectTable.get(p.id)?.renderMode === 12 && !hiddenObjectIndices.has(i)).length, `${entry.id}: lever light coverage`);
    drawCalls.push(...leverLights);
    const lampGlows = buildLampGlows(sharedOutput, objects, objectTable, dat, commands);
    assert(lampGlows.length === (entry.id === "GIVE_A_DOG_A_BONUS" ? 3 : 0), `${entry.id}: unexpected lamp glow coverage`);
    drawCalls.push(...lampGlows);
    const expectedDogs = biome === "europe" ? animals.filter((animal) => animal.id === DOG_STATIC_RECIPE.animalId).length : 0;
    const allAnimalBuilds = (biome === "europe" || biome === "ice" || biome === "jungle") ? buildStaticAnimalModels(sharedOutput, segmentBuffers, [...animals, ...animalSpawns.map(spawn => spawn.placement)], map, dat, player) : [];
    const modeledAnimalPlacements = new Set(allAnimalBuilds.map(build => build.placementIndex));
    const markerDraws = buildAnimalMarkers(sharedOutput, markers, modeledAnimalPlacements);
    drawCalls.push(...markerDraws);
    const spawnMarkerDraws = buildAnimalMarkers(sharedOutput, spawnMarkers, modeledAnimalPlacements, animals.length);
    for (const draw of spawnMarkerDraws) {
        draw.layer = SSSVLayer.AnimalSpawnMarkers;
        drawCalls.push(draw);
    }
    assert(markerDraws.length <= 2 && spawnMarkerDraws.length <= 2, `${entry.id}: animal markers lost batching`);
    for (const marker of markers)
        assert(marker.hasModel === modeledAnimalPlacements.has(marker.placementIndex), `${entry.id}: incorrect animal marker coverage`);
    for (const marker of spawnMarkers)
        assert(marker.hasModel === modeledAnimalPlacements.has(marker.placementIndex + animals.length), `${entry.id}: incorrect spawn marker coverage`);
    const animalBuilds = allAnimalBuilds.filter(build => build.placementIndex < animals.length);
    for (const build of allAnimalBuilds) {
        assert((build.flame !== null) === (build.recipe.species === "FIRE_FOX"), `${entry.id}: incorrect animated flame eligibility`);
        if (build.flame !== null)
            assert(build.flame.targets.length > 0 && build.flame.vertexCount === build.flame.targets.length, `${entry.id}: incomplete animated flame mesh`);
    }
    const spawnBuilds = allAnimalBuilds.filter(build => build.placementIndex >= animals.length);
    for (const build of spawnBuilds) {
        build.spawnCommandIndex = animalSpawns[build.placementIndex - animals.length].commandIndex;
        assert(!build.isPlayer && build.drawCalls.length > 0, `${entry.id}: incomplete spawn preview model`);
        for (const draw of build.drawCalls) {
            draw.layer = SSSVLayer.AnimalSpawnPreview;
            drawCalls.push(draw);
        }
    }
    if (entry.id === "GIVE_A_DOG_A_BONUS")
        assert(spawnBuilds.length === 11, "GIVE_A_DOG_A_BONUS: missing flying dog/fire fox preview models");
    const placedBuilds = animalBuilds.filter(build => !build.isPlayer);
    for (const build of animalBuilds) {
        let offset = 0;
        for (const part of build.partMatrices) {
            const draws = build.drawCalls.slice(offset, offset + part.drawCalls); offset += part.drawCalls;
            for (const draw of draws) {
                const eye = draw.animalEyeAnimation;
                assert((eye !== null) === part.name.endsWith("eye"), `${entry.id}: incorrect animated eye assignment`);
                if (eye === null) continue;
                assert(eye.side === (part.name.startsWith("left") ? "left" : "right") && eye.deactivated === (build.placement.health <= 0), `${entry.id}: incorrect eye side/health state`);
                if (eye.kind === "primitive") {
                    assert(build.recipe.eyes === "primitive" && draw.textureIndices.length === 0, `${entry.id}: rat eyes acquired a texture`);
                    continue;
                }
                assert(eye.family === build.recipe.eyes && eye.textureIndices.length === ANIMAL_EYE_ATLASES[eye.family].frames, `${entry.id}: incomplete animated eye atlas`);
                const { base, palette } = ANIMAL_EYE_ATLASES[eye.family];
                eye.textureIndices.forEach((id, frame) => {
                    const texture = sharedOutput.textureCache.textures[id];
                    assert(texture !== undefined && texture.dramAddr === base + frame * 128 && texture.dramPalAddr === palette && texture.width === 16 && texture.height === 16, `${entry.id}: bad animated eye texture frame`);
                });
                const initial = sampleAnimalEyeFrame(0, eye.family, eye.side, eye.deactivated);
                assert(draw.textureIndices[0] === eye.textureIndices[initial], `${entry.id}: animated eyes do not match the initial source frame`);
                const peer = animalBuilds.flatMap(b => b.drawCalls).find(d => d.animalEyeAnimation?.kind === "texture" && d.animalEyeAnimation.family === eye.family)?.animalEyeAnimation;
                assert(peer?.kind === "texture" && JSON.stringify(peer.textureIndices) === JSON.stringify(eye.textureIndices), `${entry.id}: animated eye frames are not shared`);
            }
        }
    }
    const players = animalBuilds.filter(build => build.isPlayer);
    const playerRecipe = player !== null ? getStaticAnimalRecipe(player) : null;
    const expectedPlayer = playerRecipe !== null && (playerRecipe.biomeSegment ?? 0) === dat.segment;
    assert(players.length === (expectedPlayer ? 1 : 0), `${entry.id}: missing supported player model`);
    for (const build of players) {
        assert(build.placementIndex === -1 && build.placement === player, `${entry.id}: player model changed authored indices`);
        assert(build.partMatrices.length === build.recipe.parts.length && build.partMatrices.every(part => part.triangles > 0), `${entry.id}: incomplete player model`);
        drawCalls.push(...build.drawCalls);
    }
    const dogs = placedBuilds.filter(build => build.recipe.species === "DOG");
    for (const build of animalBuilds) {
        const expectedWool = build.placement.health > 0 && ["SHEEP", "RAM", "SPRINGY_THINGY", "SPRINGY_RAM"].includes(build.recipe.species);
        assert((build.wool !== null) === expectedWool, `${entry.id}: wrong animal wool animation eligibility`);
        if (build.wool !== null)
            assert(new Set(build.wool.targets.map(target => target.woolIndex)).size === 52, `${entry.id}: incomplete animated wool mapping`);
    }
    const wool = animalBuilds.find(build => build.wool !== null)?.wool;
    if (wool) {
        // Host C reference of func_803622DC, hashing x/y/z s16 bytes then three normal bytes.
        for (const [tick, expected] of [[1, 1251312871], [7, 656738119], [16, 765603087], [31, 1261119379], [32, 3582849744]]) {
            let hash = 2166136261;
            const byte = (v: number) => { hash = Math.imul(hash ^ (v & 255), 16777619) >>> 0; };
            for (const rest of wool.rest) {
                const sample = sampleWoolVertex(rest, tick);
                for (const v of sample.position) { byte(v >> 8); byte(v); }
                for (const v of sample.normal) byte(v);
            }
            assert(hash === expected, `${entry.id}: wool tick ${tick} diverges from source C`);
        }
    }
    const sheep = placedBuilds.filter(build => build.recipe.species === "SHEEP");
    const rams = placedBuilds.filter(build => build.recipe.species === "RAM" || build.recipe.species === "SPRINGY_RAM");
    const expectedRams: Record<string, number> = { THE_BATTERY_FARM: 1, FAT_BEAR_MOUNTAIN: 1, ROCKY_HARD_PLACE: 1 };
    assert(rams.length === (expectedRams[entry.id] ?? 0), `${entry.id}: missing RAM/SPRINGY_RAM model`);
    const springies = placedBuilds.filter(build => build.recipe.species === "SPRINGY_THINGY");
    const expectedSpringies: Record<string, number> = { HONEYMOON_LAGOON: 1, ROCKY_HARD_PLACE: 2 };
    assert(springies.length === (expectedSpringies[entry.id] ?? 0), `${entry.id}: unexpected SPRINGY_THINGY coverage`);
    const foxes = placedBuilds.filter(build => build.recipe.species === "FOX");
    const racingFoxes = placedBuilds.filter(build => build.recipe.species === "RACING_FOX");
    const placedMice = placedBuilds.filter(build => build.recipe.species === "RACING_MOUSE");
    const expectedMice: Record<string, number> = { HAVE_A_NICE_DAY: 1, RAT_O_MATIC: 6 };
    assert(placedMice.length === (expectedMice[entry.id] ?? 0), `${entry.id}: unexpected RACING_MOUSE placement coverage`);
    assert(foxes.length === (entry.id === "HONEYMOON_LAGOON" ? 2 : 0), `${entry.id}: unexpected FOX model coverage`);
    const expectedRacingFoxes: Record<string, number> = { THE_BATTERY_FARM: 2, STINKY_SEWERS: 1, RAT_O_MATIC: 3, ROCKY_HARD_PLACE: 1 };
    assert(racingFoxes.length === (expectedRacingFoxes[entry.id] ?? 0), `${entry.id}: unexpected RACING_FOX model coverage`);
    assert(placedBuilds.length === animals.filter(animal => { const recipe = getStaticAnimalRecipe(animal); return recipe !== null && (recipe.biomeSegment ?? 0) === dat.segment; }).length, `${entry.id}: missing supported animal model`);
    const expectedSheep: Record<string, number> = { SMASHING_START: 4, HAVE_A_NICE_DAY: 4, HONEYMOON_LAGOON: 3, THE_BATTERY_FARM: 6, THE_ENGINE_ROOM: 1, FAT_BEAR_MOUNTAIN: 3, ROCKY_HARD_PLACE: 3, INTRO: 3 };
    assert(sheep.length === (expectedSheep[entry.id] ?? 0), `${entry.id}: unexpected SHEEP model coverage`);
    assert(dogs.length === expectedDogs, `${entry.id}: missing supported DOG model placement`);
    for (const dog of dogs) {
        const samePose = assertExists(dogs.find(other => other.recipe === dog.recipe));
        assert(JSON.stringify(dog.textureIds) === JSON.stringify(samePose.textureIds), `${entry.id}: repeated DOG poses do not share decoded textures`);
        assert(dog.recipe === getDogStaticRecipe(dog.placement.health), `${entry.id}: incorrect DOG health pose`);
    }
    if (entry.id === "HAVE_A_NICE_DAY")
        assert(dogs.some((dog) => dog.placementIndex === 4), `${entry.id}: missing positive-health DOG pilot placement`);
    for (const dog of dogs) {
        assert(dog.partMatrices.length === DOG_STATIC_RECIPE.parts.length, `${entry.id}[${dog.placementIndex}]: incomplete DOG part transforms`);
        const bodyPart = assertExists(dog.partMatrices.find((part) => part.name === "body"), `${entry.id}: missing DOG body`);
        const firstBody = assertExists(dogs[0].partMatrices.find(part => part.name === "body"));
        assert(JSON.stringify(bodyPart.textureIndices) === JSON.stringify(firstBody.textureIndices), `${entry.id}: DOG poses do not share body textures`);
        assert(bodyPart.textureIndices.length !== 0, `${entry.id}: DOG body did not inherit its source texture state`);
        assert(bodyPart.geometryModes.some((mode) => (mode & RSP_Geometry.G_LIGHTING) !== 0), `${entry.id}: DOG body lost inherited lighting state`);
        assert(bodyPart.otherModesL.length !== 0, `${entry.id}: DOG body has no render state`);
        for (const name of ["left eye", "right eye"]) {
            const part = assertExists(dog.partMatrices.find((part) => part.name === name), `${entry.id}: missing DOG ${name}`);
            assert(part.textureIndices.length !== 0, `${entry.id}: DOG ${name} did not inherit its source texture state`);
            const eyeAddress = 0x01000620 + dog.recipe.pose.sample.eyeFrame * 128;
            assert(part.textureIndices.some(id => sharedOutput.textureCache.textures[id].dramAddr === eyeAddress), `${entry.id}: DOG ${name} uses the wrong eye frame`);
            assert(part.geometryModes.some((mode) => (mode & RSP_Geometry.G_LIGHTING) === 0), `${entry.id}: DOG ${name} lost its unlit eye state`);
            assert(part.otherModesL.length !== 0, `${entry.id}: DOG ${name} has no render state`);
        }
        for (const part of dog.partMatrices.filter((part) => !part.name.endsWith("eye")))
            assert(part.geometryModes.some((mode) => (mode & RSP_Geometry.G_LIGHTING) !== 0), `${entry.id}: DOG ${part.name} lost inherited lighting`);
        assert(dog.drawCalls.some((drawCall) => Math.abs(drawCall.DP_PrimColor[0] - (0x14 / 0xFF)) < 1e-6
            && Math.abs(drawCall.DP_PrimColor[1] - (0x14 / 0xFF)) < 1e-6
            && Math.abs(drawCall.DP_PrimColor[2] - (0x14 / 0xFF)) < 1e-6), `${entry.id}: DOG inherited primitive color did not reach later parts`);
        assert(dog.partMatrices.every((part) => part.drawCalls > 0 && part.triangles > 0), `${entry.id}: DOG part without source geometry`);
        drawCalls.push(...dog.drawCalls);
    }
    for (const build of [...sheep, ...springies, ...rams]) {
        assert(build.recipe === getStaticAnimalRecipe(build.placement), `${entry.id}: incorrect SHEEP pose`);
        const springy = build.recipe.species.startsWith("SPRINGY_");
        const ram = build.recipe.species.endsWith("RAM");
        assert(build.partMatrices.length === (springy ? 5 : 8) - (ram ? 2 : 0), `${entry.id}: incomplete SHEEP/RAM parts`);
        assert(build.partMatrices.every(part => part.drawCalls > 0 && part.triangles > 0), `${entry.id}: empty SHEEP part`);
        const samePose = assertExists(animalBuilds.find(other => other.recipe === build.recipe));
        assert(JSON.stringify(build.textureIds) === JSON.stringify(samePose.textureIds), `${entry.id}: SHEEP/SPRINGY_THINGY placements do not share textures`);
        let offset = 0;
        for (const part of build.partMatrices) {
            const draws = build.drawCalls.slice(offset, offset + part.drawCalls); offset += part.drawCalls;
            const hasGrey = (v: number) => draws.some(draw => draw.DP_PrimColor.slice(0, 3).every(c => Math.abs(c - v / 255) < 1e-6));
            if (part.name === "body") assert(hasGrey(255), `${entry.id}: SHEEP wool lost white material`);
            if (part.name === "head") {
                assert(hasGrey(ram ? 30 : 20), `${entry.id}: SHEEP/RAM head lost dark material`);
                if (ram) assert(draws.some(draw => draw.DP_PrimColor[0] === 1 && draw.DP_PrimColor[1] === 1 && draw.DP_PrimColor[2] === 0), `${entry.id}: RAM horns lost yellow material`);
            }
            if (part.name === "spring") {
                assert(draws.every(draw => Math.abs(draw.DP_PrimColor[0] - 1) < 1e-6 && Math.abs(draw.DP_PrimColor[1] - 1) < 1e-6 && draw.DP_PrimColor[2] === 0), `${entry.id}: SPRINGY_THINGY spring lost yellow material`);
                assert(part.geometryModes.every(mode => !!(mode & RSP_Geometry.G_LIGHTING) && !(mode & (RSP_Geometry.G_CULL_BACK | RSP_Geometry.G_CULL_FRONT))), `${entry.id}: SPRINGY_THINGY spring has incorrect lighting/culling`);
                assert(part.textureIndices.length === 0, `${entry.id}: SPRINGY_THINGY spring inherited a texture`);
            }
            if (part.name.includes("leg")) {
                assert(hasGrey(30), `${entry.id}: SHEEP leg uses the wrong bank/material`);
                const reflected = part.name.includes("right");
                assert(part.flipsWinding === reflected, `${entry.id}: SHEEP leg mirror is incorrect`);
                if (reflected) assert(draws.every(draw => !!(draw.SP_GeometryMode & RSP_Geometry.G_CULL_FRONT) && !(draw.SP_GeometryMode & RSP_Geometry.G_CULL_BACK)), `${entry.id}: mirrored SHEEP leg has incorrect culling`);
            }
            if (part.name.endsWith("eye")) {
                assert(part.textureIndices.some(id => sharedOutput.textureCache.textures[id].dramAddr === 0x01000620 + build.recipe.pose.sample.eyeFrame * 128), `${entry.id}: SHEEP/SPRINGY_THINGY eye texture is incorrect`);
                assert(part.geometryModes.every(mode => !(mode & RSP_Geometry.G_LIGHTING)), `${entry.id}: SHEEP eye retained lighting`);
            }
        }
        drawCalls.push(...build.drawCalls);
    }
    for (const build of [...foxes, ...racingFoxes]) {
        const deactivated = build.placement.health <= 0;
        assert(build.recipe === getStaticAnimalRecipe(build.placement), `${entry.id}: incorrect FOX health pose`);
        if (deactivated) {
            assert(entry.id === "ROCKY_HARD_PLACE" && build.placementIndex === 6, `${entry.id}: unexpected deactivated RACING_FOX`);
            assert(build.recipe.pose.sample.eyeFrame === 4, `${entry.id}: deactivated RACING_FOX lost closed eyes`);
        }
        if (build.recipe.species === "FOX")
            assert(build.placementIndex === 4 || build.placementIndex === 5, `${entry.id}: unexpected FOX placement`);
        assert(build.partMatrices.length === 9, `${entry.id}: incomplete FOX parts`);
        assert(JSON.stringify(build.textureIds) === JSON.stringify([...foxes, ...racingFoxes][0].textureIds), `${entry.id}: FOX placements do not share textures`);
        if (build.recipe.species === "RACING_FOX")
            assert(build.partMatrices.filter(part => part.name.endsWith("wheel")).length === 4, `${entry.id}: RACING_FOX lost its wheels`);
        let offset = 0;
        for (const part of build.partMatrices) {
            const draws = build.drawCalls.slice(offset, offset + part.drawCalls); offset += part.drawCalls;
            assert(part.triangles > 0 && draws.length > 0, `${entry.id}: empty FOX ${part.name}`);
            const eye = part.name.endsWith("eye");
            assert(part.geometryModes.every(mode => !!(mode & RSP_Geometry.G_LIGHTING) !== eye), `${entry.id}: incorrect FOX ${part.name} lighting`);
            if (eye) {
                assert(part.textureIndices.some(id => {
                    const texture = sharedOutput.textureCache.textures[id];
                    return texture.dramAddr === 0x01002100 + (deactivated ? 4 * 128 : 0) && texture.dramPalAddr === 0x01000CA0;
                }), `${entry.id}: FOX ${part.name} lost its eyes5/TLUT1 texture`);
                assert(part.geometryModes.every(mode => !!(mode & RSP_Geometry.G_CULL_BACK) && !(mode & RSP_Geometry.G_CULL_FRONT)), `${entry.id}: FOX eye did not restore back culling`);
            } else {
                assert(part.textureIndices.length === 0, `${entry.id}: FOX ${part.name} inherited a spurious texture`);
                if (part.name.endsWith("wheel")) {
                    assert(draws.every(draw => draw.DP_PrimColor.slice(0, 3).every(c => Math.abs(c - 25 / 255) < 1e-6)), `${entry.id}: RACING_FOX wheel lost its dark material`);
                    assert(!part.flipsWinding, `${entry.id}: RACING_FOX wheel was incorrectly mirrored`);
                    assert(part.geometryModes.every(mode => (mode & (RSP_Geometry.G_CULL_FRONT | RSP_Geometry.G_CULL_BACK)) === RSP_Geometry.G_CULL_BACK), `${entry.id}: RACING_FOX wheel lost back culling`);
                } else {
                    assert(draws.some(draw => Math.abs(draw.DP_PrimColor[0] - 1) < 1e-6 && Math.abs(draw.DP_PrimColor[1] - 32 / 255) < 1e-6 && draw.DP_PrimColor[2] === 0), `${entry.id}: FOX ${part.name} lost its orange material`);
                }
                if (part.name.includes("leg")) {
                    const mirrored = part.name.includes("right");
                    assert(part.flipsWinding === mirrored, `${entry.id}: incorrect FOX leg mirror`);
                    const cull = mirrored ? RSP_Geometry.G_CULL_FRONT : RSP_Geometry.G_CULL_BACK;
                    assert(part.geometryModes.every(mode => (mode & (RSP_Geometry.G_CULL_FRONT | RSP_Geometry.G_CULL_BACK)) === cull), `${entry.id}: incorrect FOX leg culling`);
                }
            }
        }
        drawCalls.push(...build.drawCalls);
    }
    const mice = animalBuilds.filter(build => build.recipe.species === "RACING_MOUSE");
    for (const build of mice) {
        assert(build.partMatrices.length === 10, `${entry.id}: incomplete RACING_MOUSE parts`);
        assert(build.recipe === getStaticAnimalRecipe(build.placement), `${entry.id}: incorrect RACING_MOUSE health pose`);
        const samePose = assertExists(mice.find(other => other.recipe === build.recipe));
        assert(JSON.stringify(build.textureIds) === JSON.stringify(samePose.textureIds), `${entry.id}: RACING_MOUSE textures are not shared`);
        const body = assertExists(build.partMatrices.find(p => p.name === "body"));
        assert(Math.abs(body.matrix[12] - build.placement.x) < 1e-4 && Math.abs(body.matrix[14] - mirrorZ(build.placement.z)) < 1e-4, `${entry.id}: RACING_MOUSE body incorrectly uses the shifted head joint`);
        assert(Math.abs(body.matrix[13] - (build.resolvedY + (build.placement.health > 0 ? 234 : 330) / 32)) < 1e-4, `${entry.id}: RACING_MOUSE body height is incorrect`);
        let offset = 0;
        for (const part of build.partMatrices) {
            const draws = build.drawCalls.slice(offset, offset + part.drawCalls); offset += part.drawCalls;
            assert(part.triangles > 0 && draws.length > 0, `${entry.id}: empty RACING_MOUSE ${part.name}`);
            assert(part.flipsWinding === (part.name === "right ear"), `${entry.id}: incorrect RACING_MOUSE mirror`);
            const eye = part.name.endsWith("eye");
            assert(part.geometryModes.every(mode => !!(mode & RSP_Geometry.G_LIGHTING) !== eye), `${entry.id}: incorrect RACING_MOUSE lighting`);
            if (eye) {
                assert(part.textureIndices.some(id => {
                    const texture = sharedOutput.textureCache.textures[id];
                    return texture.dramAddr === 0x01002100 + build.recipe.pose.sample.eyeFrame * 128 && texture.dramPalAddr === 0x01000CA0;
                }), `${entry.id}: incorrect RACING_MOUSE eye atlas/frame/palette`);
            } else {
                assert(part.textureIndices.length === 0, `${entry.id}: RACING_MOUSE solid part inherited a texture`);
                const color = part.name.endsWith("wheel") ? [20, 20, 20] : [102, 130, 255];
                assert(draws.some(draw => color.every((c, i) => Math.abs(draw.DP_PrimColor[i] - c / 255) < 1e-6)), `${entry.id}: RACING_MOUSE ${part.name} lost its material`);
                if (part.name.endsWith("ear") || part.name.endsWith("wheel"))
                    assert(part.geometryModes.every(mode => !(mode & (RSP_Geometry.G_CULL_FRONT | RSP_Geometry.G_CULL_BACK))), `${entry.id}: RACING_MOUSE ear/wheel lost two-sided rendering`);
            }
        }
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    const racingDogs = animalBuilds.filter(build => build.recipe.species === "RACING_DOG");
    const expectedRacingDogs: Record<string, number> = { HAVE_A_NICE_DAY: 1, THE_BATTERY_FARM: 1, THE_ENGINE_ROOM: 1, FAT_BEAR_MOUNTAIN: 1, STINKY_SEWERS: 1 };
    assert(racingDogs.filter(build => !build.isPlayer).length === (expectedRacingDogs[entry.id] ?? 0), `${entry.id}: missing RACING_DOG placements`);
    for (const build of racingDogs) {
        assert(build.partMatrices.length === 12 && build.partMatrices.every(p => p.triangles > 0), `${entry.id}: incomplete RACING_DOG`);
        for (const part of build.partMatrices) {
            const eye = part.name.endsWith("eye");
            assert(part.geometryModes.every(mode => !!(mode & RSP_Geometry.G_LIGHTING) !== eye), `${entry.id}: incorrect RACING_DOG lighting`);
            assert(part.flipsWinding === ["right missile pod", "front right wheel", "rear right wheel"].includes(part.name), `${entry.id}: incorrect RACING_DOG mirror`);
            if (eye) assert(part.textureIndices.some(id => sharedOutput.textureCache.textures[id].dramAddr === 0x01000620 + build.recipe.pose.sample.eyeFrame * 128), `${entry.id}: incorrect RACING_DOG eye frame`);
            if (part.name === "body") assert(part.textureIndices.length > 0, `${entry.id}: missing RACING_DOG body texture`);
            if (part.name.includes("wheel") || part.name.includes("missile")) assert(part.geometryModes.every(mode => !(mode & (RSP_Geometry.G_CULL_FRONT | RSP_Geometry.G_CULL_BACK))), `${entry.id}: RACING_DOG wheel/pod lost two-sided state`);
        }
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    const rats = animalBuilds.filter(build => build.recipe.species === "RAT" || build.recipe.species === "KING_RAT");
    const expectedRats: Record<string, number> = { THE_ENGINE_ROOM: 4, STINKY_SEWERS: 19, RAT_O_MATIC: 5 };
    assert(rats.filter(build => !build.isPlayer).length === (expectedRats[entry.id] ?? 0), `${entry.id}: missing RAT/KING_RAT placements`);
    for (const build of rats) {
        const king = build.recipe.species === "KING_RAT";
        assert(build.partMatrices.length === (king ? 8 : 7) && build.partMatrices.every(p => p.triangles > 0), `${entry.id}: incomplete RAT/KING_RAT`);
        assert(build.textureIds.length === 1 && build.textureIds[0] === 563, `${entry.id}: RAT/KING_RAT glow texture`);
        const glows = build.drawCalls.filter(draw => draw.animalEyeGlow);
        assert(glows.length === 2 && glows.every(draw => draw.translucent && draw.billboard && draw.projectedObjectSprite?.size === (king ? 12 : 6)), `${entry.id}: RAT/KING_RAT eye glows`);
        const body = assertExists(build.partMatrices.find(p => p.name === "body"));
        assert(Math.abs(body.matrix[13] - (build.resolvedY + 365 * (king ? 2 : 1) / 32)) < 1e-4, `${entry.id}: RAT/KING_RAT outer scale or height is incorrect`);
        let offset = 0;
        for (const part of build.partMatrices) {
            const draws = build.drawCalls.slice(offset, offset + part.drawCalls); offset += part.drawCalls;
            assert(!part.flipsWinding, `${entry.id}: RAT part was incorrectly mirrored`);
            const eye = part.name.endsWith("eye");
            assert(part.geometryModes.every(mode => !!(mode & RSP_Geometry.G_LIGHTING) !== eye), `${entry.id}: RAT part has incorrect lighting`);
            if (eye) assert(draws.every(draw => draw.DP_PrimColor[0] === 1 && draw.DP_PrimColor[1] === 0 && draw.DP_PrimColor[2] === 0), `${entry.id}: RAT eyes lost red primitive color`);
            if (part.name.endsWith("wheel")) assert(draws.every(draw => draw.DP_PrimColor.slice(0, 3).every(c => Math.abs(c - 20 / 255) < 1e-6)), `${entry.id}: RAT wheel lost inherited dark material`);
            if (part.name === "crown") assert(draws.some(draw => draw.DP_PrimColor[0] === 1 && draw.DP_PrimColor[1] === 1 && Math.abs(draw.DP_PrimColor[2] - 92 / 255) < 1e-6), `${entry.id}: KING_RAT crown material is incorrect`);
        }
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    for (const build of animalBuilds) {
        const expected = [18, 32, 13, 40, 41, 42, 56].includes(build.placement.id);
        assert((build.tail !== null) === expected, `${entry.id}: incorrect tail eligibility`);
        if (build.tail === null) continue;
        const tail = build.tail;
        const elephant = tail.simulation.kind === "elephant";
        const husky = tail.simulation.kind === "husky" || tail.simulation.kind === "crazy-husky";
        const links = elephant ? 4 : husky ? 3 : 5, vertices = elephant ? 32 : husky ? 18 : 40;
        assert(tail.targets.length === vertices && tail.vertexCount === vertices, `${entry.id}: incomplete tail mesh`);
        const draws = build.drawCalls.filter(draw => !draw.animalEyeGlow).slice(-links);
        assert(draws.length === links && draws.every(draw => draw.indexCount === (husky ? 24 : 36) && draw.layer === SSSVLayer.Animals), `${entry.id}: incomplete tail draw calls`);
        assert(draws.every(draw => draw.textureIndices.length === 0 && (draw.SP_GeometryMode & RSP_Geometry.G_LIGHTING) !== 0), `${entry.id}: tail inherited an incorrect material`);
        assert(draws.every((draw, link) => draw.DP_PrimColor.every((v, i) => Math.abs(v - (elephant ? [148 / 255, 148 / 255, 148 / 255, 1] : husky ? [(tail.simulation.kind === "crazy-husky" ? [128, 183, 73] : [190, 212, 255])[link] / 255, 1, 1, 1] : [1, 0.6, 0.6, 1])[i]) < 1e-6)), `${entry.id}: tail lost source primitive color`);
    }
    const bears = animalBuilds.filter(build => build.recipe.species === "BEAR" || build.recipe.species === "MYSTERY_BEAR");
    assert(bears.filter(build => !build.isPlayer && build.placement.id === 22).length === (["THE_ENGINE_ROOM", "FAT_BEAR_MOUNTAIN"].includes(entry.id) ? 1 : 0), `${entry.id}: missing BEAR placement`);
    assert(bears.filter(build => !build.isPlayer && build.placement.id === 24).length === (entry.id === "THE_ENGINE_ROOM" ? 1 : 0), `${entry.id}: missing MYSTERY_BEAR placement`);
    for (const build of bears) {
        assert(build.partMatrices.length === (build.placement.id === 24 ? 7 : 8) && build.partMatrices.every(part => part.triangles > 0), `${entry.id}: incomplete BEAR`);
        assert((build.mysteryBear !== null) === (build.placement.id === 24), `${entry.id}: incorrect Mystery Bear animation eligibility`);
        if (build.mysteryBear !== null) {
            const motion = build.mysteryBear;
            assert(motion.targets.length === motion.vertexCount && motion.vertexCount > 0, `${entry.id}: incomplete Mystery Bear animated mesh`);
            assert(motion.balls.length === 3 && motion.balls.every((ball, i) => ball.textureIndices[0] === BIOME_REGULAR_TEXTURE_ID_BASE + 3 + i && ball.projectedObjectSprite?.size === 612 * 3 / 256 && ball.layer === SSSVLayer.Animals), `${entry.id}: incorrect Mystery Bear juggling billboards`);
            assert(motion.spotlights?.draws.length === 2 && motion.spotlights.draws.every(draw => draw.textureIndices[0] === 601 && draw.layer === SSSVLayer.Animals && draw.translucent), `${entry.id}: missing Mystery Bear spotlights`);
        }
        const textures = build.textureIds.filter(id => !build.mysteryBear || ![...build.mysteryBear.balls, ...build.mysteryBear.spotlights!.draws].some(draw => draw.textureIndices.includes(id))).map(id => sharedOutput.textureCache.textures[id]);
        assert(textures.every(t => t.dramAddr >= 0x010025A0 && t.dramAddr < 0x01002C20 && t.dramPalAddr === 0x01002C40), `${entry.id}: BEAR acquired a non-eye texture`);
        for (const part of build.partMatrices) {
            const mirrored = part.name === "front right leg" || part.name === "rear right leg";
            assert(part.flipsWinding === mirrored, `${entry.id}: incorrect BEAR winding`);
            assert(part.geometryModes.every(mode => (mode & (RSP_Geometry.G_CULL_FRONT | RSP_Geometry.G_CULL_BACK)) === 0 || (mode & (mirrored ? RSP_Geometry.G_CULL_FRONT : RSP_Geometry.G_CULL_BACK)) !== 0), `${entry.id}: incorrect BEAR culling ${part.name}`);
        }
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    const huskies = animalBuilds.filter(build => build.recipe.species === "HUSKY");
    assert(huskies.filter(build => !build.isPlayer).length === (entry.id === "SNOW_JOKE" ? 2 : 0), `${entry.id}: missing HUSKY placements`);
    for (const build of huskies) {
        assert(build.partMatrices.length === 16 && build.partMatrices.every(p => p.triangles > 0), `${entry.id}: incomplete HUSKY`);
        assert(build.tail?.simulation.kind === "husky", `${entry.id}: missing HUSKY tail`);
        assert(build.textureIds.some(id => { const t = sharedOutput.textureCache.textures[id]; return t.dramAddr === 0x04005260 && t.dramPalAddr === 0x04005460; }), `${entry.id}: missing HUSKY body texture`);
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    for (const id of [38, 39, 41, 42]) {
        const expected = dat.segment === 1 ? animals.filter(a => a.id === id && a.health > 0).length : 0;
        assert(placedBuilds.filter(build => build.placement.id === id).length === expected, `${entry.id}: missing arctic variant ${id}`);
    }
    for (const build of animalBuilds.filter(build => [38, 39, 41, 42].includes(build.placement.id))) {
        const expectedParts = build.placement.id === 41 ? 17 : build.placement.id === 42 ? 16 : 8;
        assert(build.partMatrices.length === expectedParts && build.partMatrices.every(p => p.triangles > 0), `${entry.id}: incomplete ${build.recipe.species}`);
        assert(build.drawCalls.filter(draw => draw.animalEyeAnimation !== null).length === 2, `${entry.id}: missing arctic eye animation`);
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    for (const id of [10, 11]) {
        const expected = dat.segment === 1 ? animals.filter(a => a.id === id && a.health > 0).length : 0;
        assert(placedBuilds.filter(build => build.placement.id === id).length === expected, `${entry.id}: missing rabbit variant ${id}`);
    }
    for (const build of animalBuilds.filter(build => build.placement.id === 10 || build.placement.id === 11)) {
        assert(build.partMatrices.length === (build.placement.id === 10 ? 9 : 8) && build.partMatrices.every(p => p.triangles > 0), `${entry.id}: incomplete ${build.recipe.species}`);
        assert(build.tail === null && build.wool === null, `${entry.id}: rabbit acquired an unrelated animation`);
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    for (const build of animalBuilds.filter(build => build.placement.id === 28 || build.placement.id === 58)) {
        assert(build.partMatrices.length === (build.placement.id === 28 ? 9 : 15) && build.partMatrices.every(p => p.triangles > 0), `${entry.id}: incomplete wheeled animal variant`);
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    const tortoiseTanks = animalBuilds.filter(build => build.placement.id === 27);
    assert(tortoiseTanks.filter(build => !build.isPlayer).length === (entry.id === "JUNGLE_DOLDRUMS" ? 1 : 0), `${entry.id}: missing TORTOISE_TANK placement`);
    for (const build of tortoiseTanks) {
        assert(build.partMatrices.length === 9 && build.partMatrices.every(p => p.triangles > 0), `${entry.id}: incomplete TORTOISE_TANK`);
        assert(build.drawCalls.every(draw => draw.animalEyeAnimation === null), `${entry.id}: invented TORTOISE_TANK eye animation`);
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    const elephants = animalBuilds.filter(build => build.placement.id === 56);
    const expectedElephants: Record<string, number> = { JUNGLE_JAPES: 2, JUNGLE_DOLDRUMS: 3, JUNGLE_JUMPS: 2 };
    assert(elephants.filter(build => !build.isPlayer).length === (expectedElephants[entry.id] ?? 0), `${entry.id}: missing ELEPHANT placements`);
    for (const build of elephants) {
        assert(build.partMatrices.length === 9 && build.partMatrices.every(p => p.triangles > 0), `${entry.id}: incomplete ELEPHANT`);
        assert(build.tail?.simulation.kind === "elephant", `${entry.id}: missing ELEPHANT trunk`);
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    const gorillas = animalBuilds.filter(build => build.placement.id === 54);
    const expectedGorillas: Record<string, number> = { SWAMP_OF_ETERNAL_STENCH: 2, WEIGHT_FOR_IT: 1, JUNGLE_JUMPS: 2 };
    assert(gorillas.filter(build => !build.isPlayer).length === (expectedGorillas[entry.id] ?? 0), `${entry.id}: missing GORILLA placements`);
    for (const build of gorillas) {
        assert(build.partMatrices.length === 18 && build.partMatrices.every(p => p.triangles > 0), `${entry.id}: incomplete GORILLA`);
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    const hyenas = animalBuilds.filter(build => build.placement.id === 57);
    assert(hyenas.filter(build => !build.isPlayer).length === (["JUNGLE_JAPES", "SWAMP_OF_ETERNAL_STENCH", "WEIGHT_FOR_IT"].includes(entry.id) ? 2 : 0), `${entry.id}: missing HYENA placements`);
    for (const build of hyenas) {
        assert(build.partMatrices.length === 20 && build.partMatrices.every(p => p.triangles > 0), `${entry.id}: incomplete HYENA`);
        assert(build.drawCalls.filter(draw => draw.animalEyeAnimation !== null).length === 2, `${entry.id}: missing HYENA eyes`);
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    const coolCod = animalBuilds.filter(build => build.placement.id === 66);
    const expectedCoolCod: Record<string, number> = { PENGUIN_PLAYPEN: 3, SOMETHING_FISHY: 21 };
    assert(coolCod.filter(build => !build.isPlayer).length === (expectedCoolCod[entry.id] ?? 0), `${entry.id}: missing COOL_COD placements`);
    for (const build of coolCod) {
        assert(build.partMatrices.length === 5 && build.partMatrices.every(p => p.triangles > 0), `${entry.id}: incomplete COOL_COD`);
        assert(build.drawCalls.filter(draw => draw.animalEyeAnimation !== null).length === 2, `${entry.id}: missing COOL_COD eyes`);
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    const penguins = animalBuilds.filter(build => build.placement.id === 37 || build.placement.id === 64);
    const expectedPenguins: Record<string, number> = { SNOW_JOKE: 5, PENGUIN_PLAYPEN: 3, PINBALL_BLIZZARD: 11, HOPPA_CHOPPA: 2 };
    assert(penguins.filter(build => !build.isPlayer && build.placement.id === 37).length === (expectedPenguins[entry.id] ?? 0), `${entry.id}: missing PENGUIN placements`);
    assert(penguins.filter(build => !build.isPlayer && build.placement.id === 64).length === (["PINBALL_BLIZZARD", "HOPPA_CHOPPA"].includes(entry.id) ? 1 : 0), `${entry.id}: missing KING_PENGUIN placement`);
    for (const build of penguins) {
        assert(dat.segment === 1 && build.partMatrices.length === (build.placement.id === 64 ? 5 : 4), `${entry.id}: incorrect PENGUIN bank or parts`);
        const textures = build.textureIds.map(id => sharedOutput.textureCache.textures[id]);
        for (const [address, palette] of [[0x04001330, 0x04001730], [0x04001530, 0x04001750]])
            assert(textures.some(t => t.dramAddr === address && t.dramPalAddr === palette && t.width === 32 && t.height === 32), `${entry.id}: missing PENGUIN texture region`);
        assert(build.partMatrices.every(part => part.triangles > 0 && part.flipsWinding === (part.name === "right foot")), `${entry.id}: incomplete/mirrored PENGUIN parts`);
        assert(build.drawCalls.every(draw => draw.animalEyeAnimation === null), `${entry.id}: PENGUIN acquired invented eye animation`);
        if (!build.isPlayer) drawCalls.push(...build.drawCalls);
    }
    const boulderEvent = readBoulderEvent(objects, commands, findPayload(payloads, LevelPayloadType.Rng));
    const expectedBoulderEvents: Record<string, number> = { ROCKY_HARD_PLACE: 5, JUNGLE_DOLDRUMS: 9 };
    assert((boulderEvent?.spawners.length ?? 0) === (expectedBoulderEvents[entry.id] ?? 0), `${entry.id}: unexpected scripted boulder event coverage`);
    if (boulderEvent !== null) {
        const definitions = new Map(LEVEL_EVENT_PARTICLE_IDS.map(id => {
            const definition = parseParticleDefinition(read(`data/SSSV/${particleDefinitionFile(id)}`));
            return [id, definition] as const;
        }));
        const textures = parseLevelEventParticleTextures(segmentBuffers[1]!);
        textures.forEach((texture, i) => sharedOutput.textureCache.textures[LEVEL_EVENT_TEXTURE_BASE + i] = texture);
        const boulder = assertExists(objectTable.get(2));
        const debrisColor = read(`data/SSSV/textures/${entry.textureBank}.bin`).createDataView().getUint16(0xAB8 - 8);
        const simulation = new BoulderEventSimulation(boulderEvent, map, definitions, boulder.collideHeight, boulder.width, debrisColor);
        const visuals = buildBoulderEventVisuals(sharedOutput, objectTable, segmentBuffers, dat, simulation);
        assert(visuals.drawCalls.every(draw => !draw.visible), `${entry.id}: scripted events are not disabled by default`);
        visuals.setEnabled(true);
        for (let tick = 0; tick <= 300; tick++) visuals.update(tick, 3400, 5000);
        assert(simulation.commands.diagnostics.length === 0, `${entry.id}: boulder VM fault`);
        assert(simulation.spawnCount > 10 && simulation.impactCount > 5, `${entry.id}: boulder event did not cycle`);
        if (entry.id === "JUNGLE_DOLDRUMS")
            assert(simulation.expirationCount > 3, `${entry.id}: timed Jungle boulders did not expire independently of collision`);
        assert(simulation.particles.every(p => sharedOutput.textureCache.textures[p.texture0] !== undefined && sharedOutput.textureCache.textures[p.texture1] !== undefined), `${entry.id}: missing event particle frames`);
        visuals.setEnabled(false);
        assert(visuals.drawCalls.every(draw => !draw.visible) && simulation.particles.length === 0, `${entry.id}: disabling scripted events retained effects`);
        drawCalls.push(...visuals.drawCalls);
    }
    const entrance = findArrivalEntrance(objects);
    if (entrance !== null) {
        const simulation = new EntranceArrival(entrance.placement, entrance.index, parseParticleDefinition(read(`data/SSSV/${particleDefinitionFile(35)}`)), map);
        const arrival = buildArrivalVisuals(sharedOutput, simulation, segmentBuffers[1]!);
        assert(!simulation.enabled && !arrival.draw.visible, `${entry.id}: arrival enabled by default`);
        simulation.replay(0);
        simulation.advanceTo(119);
        assert(simulation.beamVisible && simulation.positions.every(Number.isFinite), `${entry.id}: invalid arrival beam`);
        assert(simulation.particles.every(p => sharedOutput.textureCache.textures[p.texture0] !== undefined), `${entry.id}: missing arrival sparks`);
        simulation.advanceTo(150);
        assert(simulation.finished && !simulation.beamVisible && simulation.entranceState === 0, `${entry.id}: arrival failed to finish`);
        simulation.setEnabled(false, 150);
        assert(simulation.entranceState === null && simulation.particles.length === 0, `${entry.id}: arrival failed to reset`);
        drawCalls.push(arrival.draw);
    }
    const elevatorConfig = readElevator(objects, commands, objectTable, map);
    assert((elevatorConfig !== null) === (entry.id === "HONEYMOON_LAGOON"), `${entry.id}: unexpected elevator admission`);
    if (elevatorConfig !== null) {
        const textures = [...sharedOutput.textureCache.textures];
        const elevator = buildElevatorVisuals(sharedOutput, elevatorConfig, segmentBuffers, dat, drawCalls);
        textures.forEach((texture, index) => assert(sharedOutput.textureCache.textures[index] === texture, `${entry.id}: elevator overwrote texture ${index}`));
        assert(elevator.drawCalls.length > 0 && elevator.drawCalls.every(c => !c.visible && c.modelMatrix !== null), `${entry.id}: elevator default visibility`);
        const counts = [sharedOutput.vertices.length, sharedOutput.indices.length, sharedOutput.textureCache.textures.length];
        const runtime = elevator.runtime;
        runtime.setEnabled(true); runtime.advanceTo(0);
        for (let tick = 1; tick <= 354 * 3; tick++) { runtime.advanceTo(tick); elevator.update(true); }
        assert(runtime.error === null && runtime.world.objects.size === 2 && elevator.drawCalls.every(c => c.visible), `${entry.id}: elevator cycle`);
        assert(elevator.drawCalls.every(c => c.modelMatrix!.every(Number.isFinite) && c.center.every(Number.isFinite)), `${entry.id}: elevator matrix`);
        assert(counts.every((n, i) => n === [sharedOutput.vertices.length, sharedOutput.indices.length, sharedOutput.textureCache.textures.length][i]), `${entry.id}: elevator allocated during updates`);
        runtime.setEnabled(false); elevator.update(true);
        assert(elevator.drawCalls.every(c => !c.visible) && runtime.world.objects.size === 1, `${entry.id}: elevator disable`);
        drawCalls.push(...elevator.drawCalls);
    }
    const objectPrograms = readObjectPrograms(objects, commands, objectTable);
    const expectedObjectPrograms: Record<string, number> = { PUNCHUP_PYRAMID: 18, SOMETHING_FISHY: 2, EVOS_ESCAPE: 1, BIG_CELEBRATION_PARADE: 1, CREDITS: 1, SWAMP_OF_ETERNAL_STENCH: 1 };
    assert(objectPrograms.length === (expectedObjectPrograms[entry.id] ?? 0), `${entry.id}: unexpected object program admission`);
    if (objectPrograms.length) {
        const counts = [sharedOutput.vertices.length, sharedOutput.indices.length, sharedOutput.textureCache.textures.length];
        const runtime = new ObjectCommandRuntime(objectPrograms, commands, objectTable, drawCalls);
        runtime.advanceTo(0);
        for (let tick = 1; tick <= 300; tick++) runtime.advanceTo(tick);
        assert(runtime.entries.every(e => e.vm.diagnostic === null && e.calls.length > 0), `${entry.id}: object program/binding fault`);
        for (const e of runtime.entries) for (const call of e.calls) {
            if (e.config.kind === "material") assert(call.commandTextureFrame !== null && call.commandTextureFrame >= 0 && call.commandTextureFrame < 4, `${entry.id}: invalid command texture frame`);
            else assert(call.objectMotion === null && call.objectRotation?.rotation.yPerTick === 0 && call.objectRotation.rotation.zPerTick === 0, `${entry.id}: duplicate animation writer`);
        }
        runtime.reset();
        assert(counts.every((n, i) => n === [sharedOutput.vertices.length, sharedOutput.indices.length, sharedOutput.textureCache.textures.length][i]), `${entry.id}: object program resource growth`);
    }
    const floorButtons = new FloorButtonVisuals(drawCalls);
    floorButtons.update(true);
    assert(floorButtons.calls.length === objects.filter(p => p.id === 42).length * 3, `${entry.id}: floor-button parts`);
    assert(floorButtons.calls.filter(c => c.floorButton!.part === 'glow').every(c => !c.visible), `${entry.id}: inactive floor glow`);
    const machineConfig = readLagoonMachine(objects, commands, objectTable, links, findPayload(payloads, LevelPayloadType.Rng), player);
    assert((machineConfig !== null) === (entry.id === 'HONEYMOON_LAGOON'), `${entry.id}: machine admission`);
    if (machineConfig) {
        const runtime = new LagoonMachineRuntime(machineConfig), visual = new LagoonMachineVisuals(runtime, drawCalls, fences);
        const counts = [sharedOutput.vertices.length, sharedOutput.indices.length, sharedOutput.textureCache.textures.length, drawCalls.length];
        const initialFences = fences.map(f => f.enabled);
        runtime.setEnabled(true); runtime.advanceTo(0); runtime.advanceTo(40);
        for (const index of MACHINE_PADS) assert(runtime.activate(index), `${entry.id}: pad input`);
        for (const index of MACHINE_LEVERS) assert(runtime.activate(index), `${entry.id}: lever input`);
        runtime.advanceTo(650); visual.update(true);
        floorButtons.update(true, i => runtime.world.getEntity(`object:${i}`)?.state ?? null);
        assert(floorButtons.calls.filter(c => c.floorButton!.part === 'glow').length === 4 && floorButtons.calls.filter(c => c.floorButton!.part === 'glow').every(c => c.visible), `${entry.id}: active floor glow`);
        assert(floorButtons.calls.filter(c => c.floorButton!.part === 'cap').every(c => c.DP_PrimColor[0] === 1), `${entry.id}: active floor cap`);
        assert([...runtime.world.programs.values()].every(vm => vm.diagnostic === null), `${entry.id}: machine fault`);
        assert(runtime.world.globals[0] === 4 && runtime.world.globals[1] === 4, `${entry.id}: machine inputs lost`);
        assert(MACHINE_ARMS.every(i => runtime.world.programs.get(`object:${i}`)!.status === 'stopped'), `${entry.id}: arm did not stop`);
        assert(fences.filter(f => [13, 14].includes(f.sourceIndex)).length === 2 && fences.filter(f => [13, 14].includes(f.sourceIndex)).every(f => !f.enabled), `${entry.id}: pad gate not unlocked`);
        const arms = drawCalls.filter(c => (MACHINE_ARMS as readonly number[]).includes(c.objectPlacementIndex!));
        assert(new Set(arms.map(c => c.objectPlacementIndex)).size === 4 && arms.every(c => c.visible && c.modelMatrix !== null && [...c.modelMatrix, ...c.center].every(Number.isFinite)), `${entry.id}: arm transforms`);
        visual.update(false); assert(arms.every(c => !c.visible), `${entry.id}: machine object visibility`);
        runtime.setEnabled(false); visual.update(true);
        assert(fences.every((f, i) => f.enabled === initialFences[i]), `${entry.id}: fence state not restored`);
        floorButtons.update(true);
        assert(floorButtons.calls.filter(c => c.floorButton!.part === 'glow').every(c => !c.visible), `${entry.id}: floor glow did not reset`);
        for (let i = 0; i < 3; i++) { runtime.setEnabled(true); runtime.reset(); visual.update(true); runtime.setEnabled(false); visual.update(true); }
        assert(counts.every((n, i) => n === [sharedOutput.vertices.length, sharedOutput.indices.length, sharedOutput.textureCache.textures.length, drawCalls.length][i]), `${entry.id}: machine resource growth`);
    }
    const snowConfig = readSnowPlatforms(objects, commands, objectTable, paths, links);
    assert((snowConfig !== null) === (entry.id === "SNOW_JOKE"), `${entry.id}: platform VM admission`);
    if (snowConfig) {
        const runtime = new SnowPlatformRuntime(snowConfig), visual = new SnowPlatformVisuals(runtime, drawCalls);
        const counts = [sharedOutput.vertices.length, sharedOutput.indices.length];
        runtime.setEnabled(true); runtime.advanceTo(0);
        for (let tick = 1; tick <= 500; tick++) { if (tick === 200) runtime.activateSwitch(5); runtime.advanceTo(tick); visual.update(true); }
        assert([...runtime.world.programs.values()].every(vm => vm.diagnostic === null) && runtime.world.objects.size === 6, `${entry.id}: platform VM execution`);
        assert(new Set(drawCalls.filter(c => c.objectRotation && snowConfig.indices.includes(c.objectPlacementIndex!)).map(c => c.objectPlacementIndex)).size === 3, `${entry.id}: missing platform bindings`);
        assert(drawCalls.filter(c => c.objectPlacementIndex === 3).every(c => !c.visible), `${entry.id}: invisible platform drawn without preview`);
        visual.revealInvisible = true; visual.update(true);
        assert(drawCalls.filter(c => c.objectPlacementIndex === 3 && c.objectRotation).some(c => c.visible), `${entry.id}: invisible platform reveal failed`);
        assert(runtime.activateSwitch(4), `${entry.id}: visibility switch unavailable`);
        for (let n = 0; n < 21; n++) runtime.step();
        visual.update(true);
        assert(runtime.world.objects.get('object:3')!.material === 157 && drawCalls.some(c => c.objectPlacementIndex === 3 && c.visible && c.textureIndices[0] === 29), `${entry.id}: live visibility material`);
        assert([1, 2].every(slot => drawCalls.some(c => c.fanAnimation?.slot === slot && c.animationTextureIndices !== null)), `${entry.id}: missing fan surface`);
        assert(drawCalls.filter(c => c.fanAnimation).every(c => c.commandTextureFrame !== null && c.commandTextureFrame >= 0 && c.commandTextureFrame < c.animationTextureIndices!.length), `${entry.id}: fan frame binding`);
        runtime.setEnabled(false); visual.update(true);
        assert(drawCalls.filter(c => c.objectPathMotion).length === 3, `${entry.id}: platform preview restoration`);
        assert(counts[0] === sharedOutput.vertices.length && counts[1] === sharedOutput.indices.length, `${entry.id}: platform resource growth`);
    }
    const liveConfig = readLiveAnimalSpawns(objects, commands, map, player);
    assert((liveConfig !== null) === (entry.id === "GIVE_A_DOG_A_BONUS"), `${entry.id}: live spawn admission`);
    if (liveConfig) {
        const runtime = new LiveAnimalSpawnRuntime(liveConfig), visual = new LiveAnimalSpawnVisuals(runtime, sharedOutput, allAnimalBuilds);
        drawCalls.push(...visual.drawCalls);
        const counts = [sharedOutput.vertices.length, sharedOutput.indices.length, sharedOutput.textureCache.textures.length];
        assert(visual.drawCalls.every(c => !c.visible), `${entry.id}: live spawns enabled by default`);
        runtime.setEnabled(true); runtime.setStage("foxes"); runtime.step(); visual.update(true, "auto");
        assert(runtime.world.animals.size === 3 && visual.drawCalls.some(c => c.visible), `${entry.id}: live fox spawn`);
        runtime.setStage("dogs"); runtime.step(); runtime.continueSequence(); runtime.step();
        for (let tick = 0; tick < 120; tick++) runtime.step();
        runtime.continueSequence(); runtime.setStage("laterDogs"); runtime.step(); visual.update(true, "all");
        assert(runtime.world.animals.size === 11 && visual.activeMarkers.length === 11, `${entry.id}: complete live spawn waves`);
        assert([...runtime.world.programs.values()].every(vm => !vm.diagnostic), `${entry.id}: live spawn VM fault`);
        assert(visual.drawCalls.every(c => c.center.every(Number.isFinite) && c.modelMatrix!.every(Number.isFinite)), `${entry.id}: live spawn transform`);
        runtime.reset(); visual.update(true, "all");
        assert(visual.drawCalls.every(c => !c.visible), `${entry.id}: live spawn reset retained draw calls`);
        assert(counts.every((n, i) => n === [sharedOutput.vertices.length, sharedOutput.indices.length, sharedOutput.textureCache.textures.length][i]), `${entry.id}: live spawn resource growth`);
    }
    applyStartupLighting(drawCalls, readStartupLighting(commands, objects, animals));
    const referencedIndices = new Set<number>();
    for (const drawCall of drawCalls) {
        assert(drawCall.firstIndex + drawCall.indexCount <= sharedOutput.indices.length, `${entry.id}: draw call index range out of bounds`);
        for (let i = 0; i < drawCall.indexCount; i++)
            referencedIndices.add(drawCall.firstIndex + i);
    }
    assert(referencedIndices.size === sharedOutput.indices.length, `${entry.id}: unreferenced indices`);
    assert(sharedOutput.vertices.length !== 0, `${entry.id}: no vertices`);

    for (const index of sharedOutput.indices)
        assert(index < sharedOutput.vertices.length, `${entry.id}: index out of range`);

    for (const vertex of sharedOutput.vertices) {
        assert(Number.isFinite(vertex.x) && Number.isFinite(vertex.y) && Number.isFinite(vertex.z), `${entry.id}: invalid position`);
        assert(Number.isFinite(vertex.tx) && Number.isFinite(vertex.ty), `${entry.id}: invalid texture coordinate`);
        assert(Number.isFinite(vertex.c0) && Number.isFinite(vertex.c1) && Number.isFinite(vertex.c2) && Number.isFinite(vertex.a), `${entry.id}: invalid vertex color`);
    }

    for (const drawCall of drawCalls) {
        for (const textureIndex of drawCall.textureIndices)
            assert(sharedOutput.textureCache.textures[textureIndex] !== undefined, `${entry.id}: missing texture ${textureIndex}`);
        assert(Number.isFinite(drawCall.fogNear) && Number.isFinite(drawCall.fogFar), `${entry.id}: invalid fog`);
    }

    const translucentCount = drawCalls.filter((drawCall) => drawCall.translucent).length;
    console.log(`${entry.id}: ${geometry.faces.length} faces, ${drawCalls.length} draw calls (${objectDrawCalls.length} object, ${billboardDrawCalls.length} billboard), ${sharedOutput.vertices.length} verts, ${sharedOutput.indices.length} indices, ${map.length} map entries, ${objects.length} objects, ${hangingRibbons.length}/${hanging.length} hanging, ${fences.length} fences, ${animals.length} animals, ${translucentCount} translucent, ${paths.length} paths (${pathAnalysis.unresolvedCommandCount} unresolved commands), ${startupHidden} startup-hidden objects, ${hiddenObjectIndices.size} resolved hidden placements`);
}

const args = process.argv.slice(2);
if (args.includes("--all")) {
    for (const entry of LEVELS)
        verifyLevel(entry.id);
} else {
    verifyLevel(args[0] ?? "SMASHING_START");
}
