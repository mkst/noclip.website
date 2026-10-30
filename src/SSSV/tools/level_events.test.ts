import { deepEqual, equal, notStrictEqual, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { BoulderEventSimulation, cameraInEventRegion, readBoulderEvent } from "../level_events.js";
import type { BoulderEventConfig } from "../level_events.js";
import { buildBoulderEventVisuals } from "../level_event_renderer.js";
import { findPayload, LevelPayloadType, MAP_X_POINTS, MAP_Z_POINTS, parseLevelContainer, parseLevelDat, parseMap, parseObjects } from "../level.js";
import { LEVEL_EVENT_PARTICLE_IDS, LEVEL_EVENT_TEXTURE_BASE, parseLevelEventParticleTextures, parseParticleDefinition } from "../particle_assets.js";
import { parseCommands } from "../paths.js";
import { indexObjectTable, parseObjectTable } from "../objects.js";
import { parseMipmapBank } from "../texture.js";
import { ParticleSimulation, particleProjectedHalfSize } from "../particles.js";

(globalThis as any).window = { debug: false };

const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));
const map = Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({ unk0: 0, unk1: 0, unk2: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0, unk7: 0 }));
const config: BoulderEventConfig = { scriptBase: 163, region: { x0: 8, x1: 12, z0: 10, z1: 15, y0: 240, y1: 0 },
    spawners: [{ placementIndex: 28, placement: { id: 64, x: 640, z: 768, y: 400, zRotation: 0, angle: 90, unkC: 41, scale: 6963, commandReferenceIdx: 164, commandsLength: 0, unk12: 0, unk15: 0 } }] };
const definitions = new Map(LEVEL_EVENT_PARTICLE_IDS.map(id => [id, {
    raw: new Uint8Array(24), flags: id <= 4 ? 0x4E : 0xDE, defaultSize: 16, lifetime: id <= 4 ? 36 : 200,
    motionTable: 0, frameTicks: id <= 4 ? 4 : 3, maxFrame: id <= 4 ? 8 : 4, renderGroup: id <= 4 ? 3 : 2, primaryColor: 0xFE40, environmentColor: 0xF800,
}]));
const simulation = (terrain = map) => new BoulderEventSimulation(config, terrain, definitions, 64, 32, 0x82C9);
function run(sim: BoulderEventSimulation, end: number, x = 640, z = 768, start = 0) {
    for (let tick = start; tick <= end; tick++) sim.advanceTo(tick, x, z);
}

test("region entry follows inclusive source tile bounds with the camera as an explicit player proxy", () => {
    ok(cameraInEventRegion(config.region!, 8 * 64, 10 * 64));
    ok(cameraInEventRegion(config.region!, 13 * 64 - 1, 16 * 64 - 1));
    equal(cameraInEventRegion(config.region!, 13 * 64, 12 * 64), false);
    equal(cameraInEventRegion(config.region!, 9 * 64, 10 * 64 - 1), false);
});

test("events start disabled, wait for entry and use source delay bounds before creating a boulder", () => {
    const sim = simulation(); run(sim, 300);
    equal(sim.spawnCount, 0); equal(sim.particles.length, 0);
    sim.setEnabled(true); run(sim, 300, 0, 0);
    equal(sim.spawnCount, 0);
    for (let tick = 301; tick < 351; tick++) sim.advanceTo(tick, 640, 768);
    equal(sim.spawnCount, 0);
    for (let tick = 351; tick <= 390 && sim.spawnCount === 0; tick++) sim.advanceTo(tick, 640, 768);
    equal(sim.spawnCount, 1);
    const b = sim.boulders[0];
    deepEqual([b.x, b.z, b.y, b.scale, b.age, b.vx, b.vz], [640 * 65536, 768 * 65536, 400 * 65536, 1024, 0, 10 * 65536, 0]);
});

test("a delay already in progress completes after region exit without starting another cycle", () => {
    const sim = simulation(); sim.setEnabled(true);
    run(sim, 1); run(sim, 200, 0, 0, 2);
    equal(sim.spawnCount, 1); equal(sim.impactCount, 1);
});

test("falling boulders grow, accelerate and emit the final ID-4 setup, then produce debris and a sixteen-tick impact", () => {
    const sim = simulation(); sim.setEnabled(true); sim.advanceTo(0, 640, 768);
    let tick = 1;
    while (!sim.boulders.length) sim.advanceTo(tick++, 640, 768);
    sim.advanceTo(tick++, 0, 0);
    equal(sim.boulders[0].scale, 1104); equal(sim.boulders[0].vy, -0x20000);
    equal(sim.particles[0].id, 4); equal(sim.particles[0].textureSize, 32);
    while (!sim.impactCount) sim.advanceTo(tick++, 0, 0);
    equal(sim.boulders.length, 0);
    equal(sim.impacts[0].age, 0);
    ok(sim.particles.some(p => p.id >= 71 && p.id <= 76));
    ok(sim.particles.filter(p => p.id >= 71).every(p => p.primaryColor === 0x82C9));
    run(sim, tick + 14, 0, 0, tick); equal(sim.impacts.length, 1);
    sim.advanceTo(tick + 15, 0, 0); equal(sim.impacts.length, 0);
});

test("the first crossed upper-map surface triggers impact before base terrain", () => {
    const terrain = map.map(tile => ({ ...tile, unk1: 25, unk3: 1 }));
    const sim = simulation(terrain); sim.setEnabled(true);
    let tick = 0;
    while (!sim.impactCount && tick < 200) sim.advanceTo(tick++, 640, 768);
    equal(sim.impactCount, 1);
    ok(sim.impacts[0].y > 200 && sim.impacts[0].y < 240);
});

test("disable/re-enable and time seeks clear state and deterministic replay preserves the same cycle", () => {
    const sim = simulation(); sim.setEnabled(true); run(sim, 120);
    const snapshot = JSON.stringify([sim.boulders, sim.impacts, sim.particles, sim.spawnCount, sim.impactCount]);
    sim.setEnabled(false);
    deepEqual([sim.boulders.length, sim.particles.length, sim.impacts.length, sim.spawnCount], [0, 0, 0, 0]);
    sim.setEnabled(true); run(sim, 120);
    equal(JSON.stringify([sim.boulders, sim.impacts, sim.particles, sim.spawnCount, sim.impactCount]), snapshot);
    sim.advanceTo(5, 640, 768); equal(sim.spawnCount, 0);
    sim.advanceTo(2000, 640, 768); equal(sim.spawnCount, 0);
});

test("stationary-camera simulation is independent of rendering frequency and stays bounded", () => {
    const a = simulation(), b = simulation(); a.setEnabled(true); b.setEnabled(true);
    run(a, 600); b.advanceTo(0, 640, 768); b.advanceTo(600, 640, 768);
    deepEqual([a.boulders, a.impacts, a.particles], [b.boulders, b.impacts, b.particles]);
    ok(a.spawnCount > 5); ok(a.impactCount > 4); ok(a.boulders.length <= 20); ok(a.particles.length <= 255);
    const particles = new ParticleSimulation(null, null, null, a); particles.advanceTo(600);
    equal(particles.particles.length, a.particles.length);
    a.setEnabled(false); particles.advanceTo(600); equal(particles.particles.length, 0);
    equal(particleProjectedHalfSize(10, 100, 60, 32) / particleProjectedHalfSize(10, 100, 60), 31 / 15);
});

const available = existsSync("data/SSSV/levels/ROCKY_HARD_PLACE.bin");
function fixture() {
    const payloads = parseLevelContainer(read("data/SSSV/levels/ROCKY_HARD_PLACE.bin"));
    const commands = parseCommands(findPayload(payloads, LevelPayloadType.Cmd));
    const placements = parseObjects(findPayload(payloads, LevelPayloadType.Cob)!);
    const ranges = findPayload(payloads, LevelPayloadType.Rng);
    return { payloads, commands, placements, ranges };
}

test("the real bank resolves exactly five initial spawners and region 6 without changing source data", { skip: !available }, () => {
    const { placements, commands, ranges } = fixture();
    const before = JSON.stringify(placements);
    const result = readBoulderEvent(placements, commands, ranges)!;
    deepEqual(result.spawners.map(s => s.placementIndex), [28, 49, 58, 62, 66]);
    deepEqual(result.region, { x0: 32, z0: 55, y0: 240, x1: 67, z1: 101, y1: 26 });
    equal(result.scriptBase, 163); equal(JSON.stringify(placements), before);
    equal(readBoulderEvent(placements, commands.slice(0, 185), ranges), null);
    equal(readBoulderEvent(placements.map(p => ({ ...p, commandsLength: 1 })), commands, ranges), null);
    equal(readBoulderEvent(placements.map(p => ({ ...p, commandReferenceIdx: 0, unk12: 164 })), commands, ranges), null);
    equal(readBoulderEvent(placements, commands, null), null);
    commands[180].raw.createDataView().setUint8(4, 23);
    equal(readBoulderEvent(placements, commands, ranges), null);
});

test("real source particle assets and pooled display lists render the cycle with independent matrices", { skip: !available }, () => {
    const { payloads, placements, commands, ranges } = fixture();
    const config = readBoulderEvent(placements, commands, ranges)!;
    const table = indexObjectTable(parseObjectTable(read("data/SSSV/objects.bin")));
    const shared = new RSPSharedOutput();
    shared.textureCache.textures[20] = parseMipmapBank(read("data/SSSV/textures/ROCKY_HARD_PLACE.bin"), "rgba16", "ROCKY_HARD_PLACE")[0];
    const definitions = new Map(LEVEL_EVENT_PARTICLE_IDS.map(id => [id, parseParticleDefinition(read(`data/SSSV/particles/${id}.bin`))]));
    equal(definitions.get(4)?.maxFrame, 8);
    const segments = [undefined, read("data/SSSV/segments/segment1.bin")];
    const textures = parseLevelEventParticleTextures(segments[1]!);
    equal(textures.length, 36); equal(textures[0].width, 32); equal(textures[18].width, 16);
    const sim = new BoulderEventSimulation(config, parseMap(findPayload(payloads, LevelPayloadType.Map)!), definitions, 64, 32, 0x82C9);
    const visuals = buildBoulderEventVisuals(shared, table, segments, parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!), sim);
    ok(visuals.drawCalls.length > 0); ok(visuals.drawCalls.every(draw => !draw.visible && draw.modelMatrix !== null));
    notStrictEqual(visuals.drawCalls[0].modelMatrix, visuals.drawCalls[1].modelMatrix);
    visuals.setEnabled(true);
    let sawRock = false, sawImpact = false;
    for (let tick = 0; tick < 300; tick++) {
        visuals.update(tick, 3400, 5000);
        sawRock ||= sim.boulders.length > 0;
        sawImpact ||= sim.impacts.length > 0;
        ok(sim.particles.every(p => p.texture0 >= LEVEL_EVENT_TEXTURE_BASE && p.texture1 < LEVEL_EVENT_TEXTURE_BASE + textures.length));
        ok(visuals.drawCalls.every(draw => Array.from(draw.modelMatrix!).every(Number.isFinite)));
    }
    ok(sawRock); ok(sawImpact);
    visuals.setEnabled(false); ok(visuals.drawCalls.every(draw => !draw.visible)); equal(sim.particles.length, 0);
});
