import { LagoonMachineRuntime } from './objects/lagoon_machine.js';
import { LagoonMachineVisuals } from './objects/lagoon_machine_renderer.js';
import { LiveAnimalSpawnRuntime } from "./animals/live_animal_spawns.js";
import { LiveAnimalSpawnVisuals } from "./animals/live_animal_renderer.js";
import { MusicPlayer } from "./audio/music.js";
import { SnowPlatformRuntime } from "./objects/snow_platforms.js";
import { SnowPlatformVisuals } from "./objects/snow_platform_renderer.js";
import { EmitterCommandRuntime } from "./effects/emitter_commands.js";
import { ObjectCommandRuntime, readObjectPrograms } from "./objects/object_commands.js";
import { buildElevatorVisuals } from "./objects/elevator_renderer.js";
import { buildArrivalVisuals, EntranceArrival } from "./effects/arrival.js";
import { FenceSwitchRuntime } from "./objects/fence_switch.js";
import { buildLampGlows, buildLeverLights, buildSwitchBalls } from "./objects/switch_visuals.js";
import { buildObjectMarkers, createObjectMarkers } from "./objects/object_markers.js";
import { RainSimulation, RAIN_TEXTURE_ID } from "./effects/rain.js";
import { ScriptParticleSimulation } from "./effects/script_particles.js";
import * as Viewer from "../viewer.js";
import * as RDP from "../Common/N64/RDP.js";

import ArrayBufferSlice from "../ArrayBufferSlice.js";
import type { SceneContext } from "../SceneBase.js";
import type { GfxDevice } from "../gfx/platform/GfxPlatform.js";
import { RSPSharedOutput } from "../BanjoKazooie/f3dex.js";
import { assertExists } from "../util.js";
import { BIOME_REGULAR_TEXTURES, getLevelRegularTextureBank, LEVELS, LEVEL_OBJECT_TEXTURES, WATER_TEXTURE } from "./core/level_table.js";
import type { LevelEntry, RegularBankEntry } from "./core/level_table.js";
import { formatLevelName } from "./core/manifest.js";
import { mirrorZ, parseLevelContainer } from "./core/level.js";
import { prepareLevel, prepareLevelFeatures } from "./core/level_preparation.js";
import { parseI4Texture, parseI8Texture, parseMipmapBank, parseRegularBank } from "./core/texture.js";
import { buildMap, buildTerrain, buildWater, installTerrainAnimationTextures, makeFogNearFar, SSSVLayer } from "./render/terrain.js";
import { applyStartupFanAnimation } from "./effects/terrain_fans.js";
import { BIOME_REGULAR_TEXTURE_ID_BASE, buildBillboards, buildObjects, indexObjectTable, installDynamicBillboardTextures, installReflectionTextures, installShadowTextures, installTeleporterTextures, LEVEL_REGULAR_TEXTURE_ID_BASE, parseObjectTable, parseObjectTextureBank } from "./objects/objects.js";
import type { SSSVBillboard } from "./objects/objects.js";
import { SSSVRenderer } from "./render/render.js";
import { mat4 } from "gl-matrix";
import { colorNewFromRGBA, colorNewFromRGBA8 } from "../Color.js";
import { buildStarfield, installStarTexture } from "./render/stars.js";
import { installFenceTexture } from "./objects/fences.js";
import { buildAnimalMarkers } from "./animals/animals.js";
import { BoulderEventSimulation } from "./effects/level_events.js";
import { buildBoulderEventVisuals } from "./effects/level_event_renderer.js";
import type { BoulderEventVisuals } from "./effects/level_event_renderer.js";
import { LEVEL_EVENT_PARTICLE_IDS, LEVEL_EVENT_TEXTURE_BASE, parseLevelEventParticleTextures } from "./effects/particle_assets.js";
import { buildHangingRibbons, installHangingTextures } from "./objects/hanging.js";
import { PathOverlay } from "./ui/path_overlay.js";
import { applyStartupLighting } from "./render/lighting.js";
import type { ParticleSource } from "./effects/particles.js";
import { createParticleSpriteSource, createTorchParticleSource, ParticleSimulation, TorchSimulation } from "./effects/particles.js";
import { particleDefinitionFile, parseScriptParticleTextures, SCRIPT_PARTICLE_IDS, SCRIPT_PARTICLE_TEXTURE_BASE, SCRIPT_PARTICLE_TEXTURE_OFFSETS, parseParticleDefinition, parseTorchDriftTable, parseTorchParticleTextures, TORCH_PARTICLE_ASSETS } from "./effects/particle_assets.js";
import { buildStaticAnimalModels } from "./animals/animal_renderer.js";
import { FireFoxParticleSimulation } from "./animals/fire_fox_effects.js";
import type { StaticAnimalBuild } from "./animals/animal_renderer.js";

const pathBase = "SSSV";
const WATER_TEXTURE_ID = 300;
const OBJECT_TEXTURE_ID_BASE = 40;

function makeLookAtWorldMatrix(eye: number[], target: number[]): mat4 {
    const fx = target[0] - eye[0];
    const fy = target[1] - eye[1];
    const fz = target[2] - eye[2];
    const fl = Math.hypot(fx, fy, fz);
    const f = [fx / fl, fy / fl, fz / fl];
    const r = [-f[2], 0, f[0]];
    const rl = Math.hypot(r[0], r[1], r[2]);
    r[0] /= rl; r[1] /= rl; r[2] /= rl;
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const m = mat4.create();
    m[0] = r[0]; m[1] = r[1]; m[2] = r[2]; m[3] = 0;
    m[4] = u[0]; m[5] = u[1]; m[6] = u[2]; m[7] = 0;
    m[8] = -f[0]; m[9] = -f[1]; m[10] = -f[2]; m[11] = 0;
    m[12] = eye[0]; m[13] = eye[1]; m[14] = eye[2]; m[15] = 1;
    return m;
}

class TextureBanks {
    constructor(public biomeRgba: RDP.Texture[], public levelRgba: RDP.Texture[], public biomeIa: RDP.Texture[], public water: RDP.Texture, public biomeRegular: RDP.Texture[], public levelRegular: RDP.Texture[]) {
    }

    public destroy(device: GfxDevice): void {
    }
}

async function loadTextureBanks(context: SceneContext, biome: string | null, textureBank: string, levelRegular: RegularBankEntry | undefined): Promise<TextureBanks> {
    const key = `${pathBase}/Textures/${biome ?? "none"}/${textureBank}/${levelRegular?.name ?? "none"}`;
    return context.dataShare.ensureObject<TextureBanks>(key, async () => {
        const dataFetcher = context.dataFetcher;
        const biomeRegularKey = biome === "city" ? "europe" : biome;
        const biomeRegular = biomeRegularKey !== null ? BIOME_REGULAR_TEXTURES[biomeRegularKey] : undefined;

        const [levelData, biomeRgbaData, biomeIaData, waterData, biomeRegularData, levelRegularData] = await Promise.all([
            dataFetcher.fetchData(`${pathBase}/textures/${textureBank}.bin`),
            biome !== null ? dataFetcher.fetchData(`${pathBase}/textures/${biome}.rgba16.bin`) : Promise.resolve(null),
            biome !== null ? dataFetcher.fetchData(`${pathBase}/textures/${biome}.ia16.bin`) : Promise.resolve(null),
            dataFetcher.fetchData(`${pathBase}/textures/${WATER_TEXTURE.name}.${WATER_TEXTURE.format}.bin`),
            biomeRegular !== undefined ? dataFetcher.fetchData(`${pathBase}/textures/${biomeRegular.name}.regular.bin`) : Promise.resolve(null),
            levelRegular !== undefined ? dataFetcher.fetchData(`${pathBase}/textures/${levelRegular.name}.regular.bin`) : Promise.resolve(null),
        ]);

        return new TextureBanks(
            biomeRgbaData !== null ? parseMipmapBank(biomeRgbaData, "rgba16", biome!) : [],
            parseMipmapBank(levelData, "rgba16", textureBank),
            biomeIaData !== null ? parseMipmapBank(biomeIaData, "ia16", biome!) : [],
            parseI8Texture(waterData, WATER_TEXTURE.width, WATER_TEXTURE.height, WATER_TEXTURE.name),
            biomeRegularData !== null ? parseRegularBank(biomeRegularData, biomeRegular!.name) : [],
            levelRegularData !== null ? parseRegularBank(levelRegularData, levelRegular!.name) : [],
        );
    });
}

function installTextures(sharedOutput: RSPSharedOutput, banks: TextureBanks): void {
    const cache = sharedOutput.textureCache;
    for (let i = 0; i < banks.biomeRgba.length; i++)
        cache.textures[i] = banks.biomeRgba[i];
    for (let i = 0; i < banks.levelRgba.length; i++)
        cache.textures[20 + i] = banks.levelRgba[i];
    for (let i = 0; i < banks.biomeIa.length; i++)
        cache.textures[32 + i] = banks.biomeIa[i];
    cache.textures[WATER_TEXTURE_ID] = banks.water;
    for (let i = 0; i < banks.biomeRegular.length; i++)
        cache.textures[BIOME_REGULAR_TEXTURE_ID_BASE + i] = banks.biomeRegular[i];
    for (let i = 0; i < banks.levelRegular.length; i++)
        cache.textures[LEVEL_REGULAR_TEXTURE_ID_BASE + i] = banks.levelRegular[i];

    if (banks.biomeRgba.length === 0) {
        for (let i = 0; i < banks.levelRgba.length; i++)
            cache.textures[i] = banks.levelRgba[i];
    }
}

class SSSVSceneDesc implements Viewer.SceneDesc {
    constructor(public id: string, public name: string, private entry: LevelEntry) {
    }

    public async createScene(device: GfxDevice, context: SceneContext): Promise<Viewer.SceneGfx> {
        const dataFetcher = context.dataFetcher;
        const levelData = await dataFetcher.fetchData(`${pathBase}/levels/${this.id}.bin`);
        const payloads = parseLevelContainer(levelData);

        const level = prepareLevel(payloads, this.id);
        const { dat, geometry, scrollingTable, skyMode, map, objectPlacements, hangingPlacements,
            animalPlacements, playerPlacement, animalMarkers, commands, animalSpawns, animalSpawnMarkers,
            boulderEvent, pathAnalysis, biome, levelSegmentName, rainButton, arrivalEntrance,
            startupLighting, startupMusic } = level;

        const banks = await loadTextureBanks(context, biome, this.entry.textureBank, getLevelRegularTextureBank(dat.segment, dat.textureBank));
        const sharedOutput = new RSPSharedOutput();
        installTextures(sharedOutput, banks);

        const [objectTableData, billboardData, segment1, biomeSegment, levelSegment] = await Promise.all([
            dataFetcher.fetchData(`${pathBase}/objects.bin`),
            dataFetcher.fetchData(`${pathBase}/billboards.json`),
            dataFetcher.fetchData(`${pathBase}/segments/segment1.bin`),
            biome !== null ? dataFetcher.fetchData(`${pathBase}/segments/${biome}_biome.bin`) : Promise.resolve(undefined),
            dataFetcher.fetchData(`${pathBase}/segments/${levelSegmentName}.bin`),
        ]);
        const billboardSets = JSON.parse(new TextDecoder().decode(billboardData.createTypedArray(Uint8Array))) as SSSVBillboard[][];
        installDynamicBillboardTextures(sharedOutput, segment1);
        installShadowTextures(sharedOutput, segment1);
        installTeleporterTextures(sharedOutput, segment1);
        installReflectionTextures(sharedOutput, segment1);
        installStarTexture(sharedOutput, segment1);
        installTerrainAnimationTextures(sharedOutput, segment1);
        installFenceTexture(sharedOutput, segment1);
        if (hangingPlacements.length !== 0)
            installHangingTextures(sharedOutput, segment1);
        const objectTable = indexObjectTable(parseObjectTable(objectTableData));
        const { fences, fenceConfig, torchEmitters, emitterAnalysis, liveSpawnConfig,
            machineConfig, snowConfig, elevatorConfig } = prepareLevelFeatures(level, objectTable);
        const fenceSwitch = fenceConfig !== null ? new FenceSwitchRuntime(fenceConfig, objectPlacements, animalPlacements) : null;
        fenceSwitch?.setEnabled(true);
        const objectTextures = levelSegment !== undefined ? parseObjectTextureBank(levelSegment, LEVEL_OBJECT_TEXTURES[levelSegmentName] ?? []) : [];
        for (let i = 0; i < objectTextures.length; i++)
            sharedOutput.textureCache.textures[OBJECT_TEXTURE_ID_BASE + i] = objectTextures[i];

        const segmentBuffers: (ArrayBufferSlice | undefined)[] = [];
        segmentBuffers[0x01] = segment1;
        segmentBuffers[0x04] = biomeSegment;
        segmentBuffers[0x05] = levelSegment;

        const drawCalls = buildTerrain(sharedOutput, geometry, dat, scrollingTable);
        applyStartupFanAnimation(drawCalls, objectPlacements, commands);
        let animalStaticBuilds: StaticAnimalBuild[] = [];
        const water = buildWater(sharedOutput, map, dat, WATER_TEXTURE_ID);
        if (water !== null)
            drawCalls.push(water);
        const mapLayer = buildMap(sharedOutput, map, dat, SSSVLayer.Map);
        if (mapLayer !== null) {
            mapLayer.visible = false;
            drawCalls.push(mapLayer);
        }
        const upperLayer = buildMap(sharedOutput, map, dat, SSSVLayer.Upper);
        if (upperLayer !== null) {
            upperLayer.visible = false;
            drawCalls.push(upperLayer);
        }
        const objectDrawCalls = buildObjects(sharedOutput, objectPlacements, objectTable, segmentBuffers, dat, commands, pathAnalysis);
        drawCalls.push(...objectDrawCalls);
        const billboardDrawCalls = buildBillboards(sharedOutput, objectPlacements, objectTable, billboardSets, dat, commands);
        drawCalls.push(...billboardDrawCalls);
        const objectMarkers = createObjectMarkers(objectPlacements, objectTable, commands);
        drawCalls.push(...buildObjectMarkers(sharedOutput, objectMarkers));
        if (biome === "europe" || biome === "ice" || biome === "jungle") {
            animalStaticBuilds = buildStaticAnimalModels(sharedOutput, segmentBuffers, [...animalPlacements, ...animalSpawns.map(spawn => spawn.placement)], map, dat, playerPlacement);
            for (const build of animalStaticBuilds) {
                const spawn = animalSpawns[build.placementIndex - animalPlacements.length];
                if (spawn !== undefined)
                    build.spawnCommandIndex = spawn.commandIndex;
                for (const draw of build.drawCalls) {
                    if (spawn !== undefined)
                        draw.layer = SSSVLayer.AnimalSpawnPreview;
                    drawCalls.push(draw);
                }
            }
        }
        const modeledAnimalPlacements = new Set(animalStaticBuilds.map(build => build.placementIndex));
        drawCalls.push(...buildAnimalMarkers(sharedOutput, animalMarkers, modeledAnimalPlacements));
        for (const draw of buildAnimalMarkers(sharedOutput, animalSpawnMarkers, modeledAnimalPlacements, animalPlacements.length)) {
            draw.layer = SSSVLayer.AnimalSpawnMarkers;
            drawCalls.push(draw);
        }
        const hangingRibbons = buildHangingRibbons(hangingPlacements, objectPlacements, map);
        let torchSimulation: TorchSimulation | null = null;
        let torchDefinition = null;
        if (torchEmitters.length !== 0) {
            const a = TORCH_PARTICLE_ASSETS;
            const [definitionData, driftData] = await Promise.all([
                dataFetcher.fetchData(`${pathBase}/${a.definitionFile}`),
                dataFetcher.fetchData(`${pathBase}/${a.driftFile}`),
            ]);
            torchDefinition = parseParticleDefinition(definitionData);
            torchSimulation = new TorchSimulation(torchEmitters, torchDefinition, parseTorchDriftTable(driftData), map);
            const textures = parseTorchParticleTextures(segment1);
            for (let i = 0; i < textures.length; i++)
                sharedOutput.textureCache.textures[a.textureIdBase + i] = textures[i];
        }
        const fireFoxBuilds = animalStaticBuilds.filter(build => build.flame !== null);
        let fireFoxParticles: FireFoxParticleSimulation | null = null;
        let scriptSimulation: ScriptParticleSimulation | null = null;
        if (emitterAnalysis.emitters.length !== 0 || fireFoxBuilds.length !== 0) {
            const definitions = new Map(await Promise.all(SCRIPT_PARTICLE_IDS.map(async (id) =>
                [id, parseParticleDefinition(await dataFetcher.fetchData(`${pathBase}/${particleDefinitionFile(id)}`))] as const)));
            const emitterPrograms = new EmitterCommandRuntime(emitterAnalysis.emitters, commands, playerPlacement);
            if (emitterAnalysis.emitters.length !== 0)
                scriptSimulation = new ScriptParticleSimulation(emitterPrograms.emitters, definitions, map, dat, emitterAnalysis.provenance, emitterPrograms);
            if (fireFoxBuilds.length !== 0)
                fireFoxParticles = new FireFoxParticleSimulation(fireFoxBuilds, definitions, map, dat);
            for (const [i, texture] of parseScriptParticleTextures(segment1).entries())
                sharedOutput.textureCache.textures[SCRIPT_PARTICLE_TEXTURE_BASE + i] = texture;
        }
        let levelEvents: BoulderEventVisuals | null = null;
        if (boulderEvent !== null) {
            const definitions = new Map(await Promise.all(LEVEL_EVENT_PARTICLE_IDS.map(async id =>
                [id, parseParticleDefinition(await dataFetcher.fetchData(`${pathBase}/${particleDefinitionFile(id)}`))] as const)));
            for (const [i, texture] of parseLevelEventParticleTextures(segment1).entries())
                sharedOutput.textureCache.textures[LEVEL_EVENT_TEXTURE_BASE + i] = texture;
            const boulder = assertExists(objectTable.get(2));
            // Material 20 is the first level mipmap; the runtime samples its trailer colour.
            const mipmaps = await dataFetcher.fetchData(`${pathBase}/textures/${this.entry.textureBank}.bin`);
            const debrisColor = mipmaps.createDataView().getUint16(0xAB8 - 8);
            const simulation = new BoulderEventSimulation(boulderEvent, map, definitions, boulder.collideHeight, boulder.width, debrisColor);
            levelEvents = buildBoulderEventVisuals(sharedOutput, objectTable, segmentBuffers, dat, simulation);
            drawCalls.push(...levelEvents.drawCalls);
        }
        drawCalls.push(...buildSwitchBalls(sharedOutput, objectPlacements, objectTable, dat, commands));
        drawCalls.push(...buildLeverLights(sharedOutput, objectPlacements, objectTable, dat, commands));
        drawCalls.push(...buildLampGlows(sharedOutput, objectPlacements, objectTable, dat, commands));
        const rain = rainButton !== null ? new RainSimulation(rainButton, map, dat) : null;
        if (rain !== null) {
            rain.setEnabled(true);
            sharedOutput.textureCache.textures[RAIN_TEXTURE_ID] = parseI4Texture(segment1, 16, 16, "particle/rain", 0x215B0);
            for (const [i, texture] of parseScriptParticleTextures(segment1).entries())
                sharedOutput.textureCache.textures[SCRIPT_PARTICLE_TEXTURE_BASE + i] = texture;
        }
        const liveAnimalSpawns = liveSpawnConfig !== null ? new LiveAnimalSpawnVisuals(new LiveAnimalSpawnRuntime(liveSpawnConfig), sharedOutput, animalStaticBuilds) : null;
        if (liveAnimalSpawns !== null) drawCalls.push(...liveAnimalSpawns.drawCalls);
        const lagoonMachine = machineConfig !== null ? new LagoonMachineVisuals(new LagoonMachineRuntime(machineConfig), drawCalls, fences) : null;
        const snowPlatforms = snowConfig !== null ? new SnowPlatformVisuals(new SnowPlatformRuntime(snowConfig), drawCalls) : null;
        const objectPrograms = readObjectPrograms(objectPlacements, commands, objectTable, drawCalls);
        const objectCommands = objectPrograms.length ? new ObjectCommandRuntime(objectPrograms, commands, objectTable, drawCalls) : null;
        const elevator = elevatorConfig !== null ? buildElevatorVisuals(sharedOutput, elevatorConfig, segmentBuffers, dat, drawCalls) : null;
        if (elevator !== null) drawCalls.push(...elevator.drawCalls);
        const arrival = arrivalEntrance !== null ? buildArrivalVisuals(sharedOutput,
            new EntranceArrival(arrivalEntrance.placement, arrivalEntrance.index,
                parseParticleDefinition(await dataFetcher.fetchData(`${pathBase}/${particleDefinitionFile(35)}`)), map), segment1) : null;
        if (arrival !== null) drawCalls.push(arrival.draw);
        const particleSources = [
            torchSimulation !== null && torchDefinition !== null ? createTorchParticleSource(torchSimulation, torchDefinition) : null,
            scriptSimulation !== null ? createParticleSpriteSource(scriptSimulation,
                Array.from({ length: SCRIPT_PARTICLE_TEXTURE_OFFSETS.length }, (_, i) => SCRIPT_PARTICLE_TEXTURE_BASE + i), scriptSimulation.advanceTo.bind(scriptSimulation)) : null,
            levelEvents !== null ? createParticleSpriteSource(levelEvents.simulation, levelEvents.simulation.textureIds) : null,
            rain !== null ? createParticleSpriteSource(rain, rain.textureIds) : null,
            arrival !== null ? createParticleSpriteSource(arrival.simulation, arrival.simulation.textureIds) : null,
            fireFoxParticles !== null ? createParticleSpriteSource(fireFoxParticles, fireFoxParticles.textureIds, fireFoxParticles.advanceTo.bind(fireFoxParticles)) : null,
        ].filter((source): source is ParticleSource => source !== null);
        const particleSimulation = particleSources.length !== 0 ? new ParticleSimulation(particleSources) : null;
        if (skyMode === 0)
            drawCalls.push(...buildStarfield(sharedOutput, dat));
        applyStartupLighting(drawCalls, startupLighting);

        const entrance = objectPlacements.find((placement) => placement.id === 55) ?? objectPlacements[0];
        const levelCenter = [2304, 500, 3584];
        const eye = entrance !== undefined ? [entrance.x, entrance.y + 250, mirrorZ(entrance.z)] : [levelCenter[0], levelCenter[1] + 500, levelCenter[2] + 1000];
        const target = levelCenter;
        const initialWorldMatrix = makeLookAtWorldMatrix(eye, target);

        const clearColor = skyMode === 0 ? colorNewFromRGBA(0, 0, 0, 1) : colorNewFromRGBA(0.88, 0.88, 0.88, 1);
        const [fogNear, fogFar] = makeFogNearFar(dat);
        const fogColor = colorNewFromRGBA8((dat.fogColor[0] << 24) | (dat.fogColor[1] << 16) | (dat.fogColor[2] << 8) | 0xFF);
        const renderer = new SSSVRenderer(device, sharedOutput, drawCalls, fences, this.name, geometry.faces.length, initialWorldMatrix, clearColor, animalMarkers, hangingRibbons, fogNear, fogFar, fogColor, new PathOverlay(pathAnalysis, map), {
            particleSimulation, emitterPrograms: scriptSimulation?.programs, animalStaticBuilds, animalSpawnMarkers, levelEvents, rain, fenceSwitch, objectMarkers, arrival,
            elevator, objectCommands, snowPlatforms, liveAnimalSpawns, lagoonMachine,
        });
        renderer.installButtonInput(context.inputManager.toplevel, context.viewerInput.camera);
        renderer.music = new MusicPlayer(dataFetcher, startupMusic);
        void renderer.music.initialize();
        return renderer;
    }
}

const sceneDescs = LEVELS.map((entry) => new SSSVSceneDesc(entry.id, formatLevelName(entry.id), entry));

export const sceneGroup: Viewer.SceneGroup = {
    id: "sssv",
    name: "Space Station Silicon Valley",
    sceneDescs,
};
