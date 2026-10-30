import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { BoulderEventSimulation, jungleLaunchVelocity, readBoulderEvent } from "../level_events.js";
import type { BoulderEventConfig } from "../level_events.js";
import { findPayload, LevelPayloadType, MAP_X_POINTS, MAP_Z_POINTS, parseLevelContainer, parseMap, parseObjects } from "../level.js";
import { LEVEL_EVENT_PARTICLE_IDS, parseParticleDefinition } from "../particle_assets.js";
import { parseCommands } from "../paths.js";

const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));
const available = existsSync("data/SSSV/levels/JUNGLE_DOLDRUMS.bin");
function fixture() {
    const payloads = parseLevelContainer(read("data/SSSV/levels/JUNGLE_DOLDRUMS.bin"));
    const commands = parseCommands(findPayload(payloads, LevelPayloadType.Cmd));
    const placements = parseObjects(findPayload(payloads, LevelPayloadType.Cob)!);
    const config = readBoulderEvent(placements, commands, null)!;
    const definitions = new Map(LEVEL_EVENT_PARTICLE_IDS.map(id => [id, parseParticleDefinition(read(`data/SSSV/particles/${id}.bin`))]));
    const terrain = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    return { payloads, commands, placements, config, definitions, terrain };
}
const flat = Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({ unk0: 0, unk1: 0, unk2: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0, unk7: 0 }));

test("relative Jungle launches retain source degree-table values and fixed-point rounding", () => {
    deepEqual(jungleLaunchVelocity(84, 0, 70), [0, 465920, 4551680]);
    deepEqual(jungleLaunchVelocity(78, 270, 51), [-691968, 0, 3264000]);
    deepEqual(jungleLaunchVelocity(81, 270, 51), [-522240, 0, 3290112]);
    deepEqual(jungleLaunchVelocity(0, 90, 10), [655360, 0, 0]);
});

test("the current bank resolves three timed launchers and six literal fixed-delay roots", { skip: !available }, () => {
    const { config, placements } = fixture();
    equal(config.kind, "jungle"); equal(config.region, null);
    deepEqual(config.spawners.map(s => s.placementIndex), [9, 10, 11, 17, 18, 48, 49, 50, 51]);
    deepEqual(config.spawners.map(s => s.interval), [undefined, undefined, undefined, 95, 80, 100, 100, 90, 89]);
    deepEqual(config.spawners.map(s => s.placement), [9, 10, 11, 17, 18, 48, 49, 50, 51].map(i => placements[i]));
});

test("script mutation, startup cursor and event-only assignment cannot accidentally activate a launcher", { skip: !available }, () => {
    const { commands, placements } = fixture();
    equal(readBoulderEvent(placements.map(p => ({ ...p, commandsLength: 1 })), commands, null), null);
    equal(readBoulderEvent(placements.map(p => ({ ...p, unk12: p.commandReferenceIdx, commandReferenceIdx: 0 })), commands, null), null);
    commands[19].raw.createDataView().setUint8(4, 4);
    equal(readBoulderEvent(placements, commands, null)?.spawners.length, 6);
    commands[246].raw.createDataView().setUint8(9, 0x71);
    equal(readBoulderEvent(placements, commands, null), null);
});

test("autonomous launchers run without camera entry, use random scale/lifetime, rotate headings and expire in the air", { skip: !available }, () => {
    const { config, definitions } = fixture();
    const selected: BoulderEventConfig = { ...config, spawners: config.spawners.filter(s => s.interval === undefined) };
    const sim = new BoulderEventSimulation(selected, flat, definitions, 64, 32, 0x82C9);
    sim.advanceTo(0, 0, 0); equal(sim.spawnCount, 0);
    sim.setEnabled(true);
    const births: { tick: number; source: number; heading: number }[] = [];
    for (let tick = 0; tick <= 600; tick++) {
        sim.advanceTo(tick, 0, 0);
        for (const b of sim.boulders) if (b.age === 0) {
            ok(b.scale >= 1024 && b.scale <= 4050); ok(b.expiresAfter! >= 20 && b.expiresAfter! <= 39);
            equal(b.pitch, 84); ok(b.vy > 69 * 65536);
            births.push({ tick, source: b.sourceIndex, heading: b.heading });
        }
        ok(sim.particles.every(p => p.id === 1));
        ok(sim.boulders.every(b => b.age < b.expiresAfter!));
    }
    ok(sim.spawnCount > 9); ok(sim.expirationCount > 6); equal(sim.impactCount, 0);
    for (let source = 0; source < selected.spawners.length; source++) {
        const entries = births.filter(b => b.source === source);
        for (let i = 1; i < entries.length; i++) {
            const elapsed = entries[i].tick - entries[i - 1].tick;
            ok(elapsed >= 50 && elapsed <= 149);
            equal(entries[i].heading, (entries[i - 1].heading + elapsed * 4) % 360);
        }
    }
});

test("six fixed-delay launchers preserve phase, tilt and literal scale 4096 rather than randomising the math form", { skip: !available }, () => {
    const { config, definitions, terrain } = fixture();
    const selected = { ...config, spawners: config.spawners.filter(s => s.interval !== undefined) };
    const sim = new BoulderEventSimulation(selected, terrain, definitions, 64, 32, 0x82C9);
    sim.setEnabled(true);
    const births = selected.spawners.map(() => [] as number[]);
    for (let tick = 0; tick <= 400; tick++) {
        sim.advanceTo(tick, 0, 0);
        for (const b of sim.boulders) if (b.age === 0) {
            births[b.sourceIndex].push(tick);
            equal(b.scale, 4096); equal(b.expiresAfter, undefined);
            equal(b.pitch, (selected.spawners[b.sourceIndex].placement.zRotation + 78) % 360);
            equal(b.heading, selected.spawners[b.sourceIndex].placement.angle);
        }
    }
    births.forEach((ticks, i) => {
        equal(ticks[0], selected.spawners[i].interval! + 1);
        for (let j = 1; j < ticks.length; j++) equal(ticks[j] - ticks[j - 1], selected.spawners[i].interval);
    });
    ok(sim.impactCount > 6); equal(sim.expirationCount, 0);
    ok(sim.particles.some(p => p.id === 40 || p.id === 20));
    ok(sim.impacts.every(impact => impact.size === 100));
});

test("combined Jungle state resets cleanly and remains deterministic under different frame spacing", { skip: !available }, () => {
    const { config, definitions, terrain } = fixture();
    const a = new BoulderEventSimulation(config, terrain, definitions, 64, 32, 0x82C9);
    const b = new BoulderEventSimulation(config, terrain, definitions, 64, 32, 0x82C9);
    a.setEnabled(true); b.setEnabled(true);
    for (let tick = 0; tick <= 600; tick++) a.advanceTo(tick, 0, 0);
    b.advanceTo(0, 0, 0); b.advanceTo(600, 0, 0);
    deepEqual([a.boulders, a.particles, a.impacts, a.expirationCount], [b.boulders, b.particles, b.impacts, b.expirationCount]);
    ok(a.boulders.length <= 20); ok(a.particles.length <= 255);
    a.setEnabled(false); deepEqual([a.boulders.length, a.particles.length, a.impacts.length, a.spawnCount, a.expirationCount], [0, 0, 0, 0, 0]);
});
