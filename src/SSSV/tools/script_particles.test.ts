import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { MAP_X_POINTS, MAP_Z_POINTS } from "../level.js";
import type { LevelMapEntry, LevelObjectPlacement } from "../level.js";
import type { SSSVObjectData } from "../objects.js";
import { parseCommands } from "../paths.js";
import { packParticleColor, persistentEmissionCount, readPersistentEmitters } from "../particle_emitters.js";
import { parseParticleDefinition, parseScriptParticleTextures, SCRIPT_PARTICLE_TEXTURE_OFFSETS } from "../particle_assets.js";
import { ScriptParticleSimulation, spawnScriptParticle } from "../script_particles.js";

const rawDefinitions: [number, string][] = [
    [19, "00000100005a00000000001401067bff7bff000000000000"],
    [24, "009c040000c80000000000010006ce7ef7be000000000000"],
    [25, "00561000002600000000000a040428c48c1e000000000000"],
    [26, "005610000016000000000006040428c48c1e000000000000"],
    [37, "005c080000c80000000000010004fffeb5ac000000000000"],
    [58, "00021400000c0000000000030406a53ece7e000000000000"],
];
const definitions = new Map(rawDefinitions.map(([id, hex]) => [id, parseParticleDefinition(ArrayBufferSlice.fromView(Buffer.from(hex, "hex")))]));
const placement: LevelObjectPlacement = { id: 64, x: 2000, z: 2000, y: 200, zRotation: 0, angle: 0, scale: 2048, commandReferenceIdx: 1, commandsLength: 0, unkC: 0, unk12: 0, unk15: 0 };
const table = new Map([[64, { id: 64, collideHeight: 64, scaleOverride: 0 } as SSSVObjectData]]);
const map = (): LevelMapEntry[] => Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({ unk0: 0, unk1: 0, unk2: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0, unk7: 0 }));
const dat = { waterPrimColor: [200, 160, 80, 255] as [number, number, number, number], waterEnvColor: [100, 80, 40, 255] as [number, number, number, number] };
const script = (rows: string[]) => { const bytes = Buffer.from(rows.join(""), "hex"), result = Buffer.alloc(bytes.length + 2); result.writeUInt16BE(result.length); bytes.copy(result, 2); return parseCommands(ArrayBufferSlice.fromView(result)); };
const japes = ["00150000004040080000", "001700097a161f000000", "00090000000000000000"];
const sands = ["00150000000a910f0000", "00162a3f080a15030000", "001700e9181809000000", "00090000000000000000"];
const emitters = (rows = japes, placements = [placement]) => readPersistentEmitters(placements, table, script(rows));

test("complete setup/stop forms retain self-target provenance and source defaults", () => {
    const a = emitters(); equal(a.emitters.length, 1);
    deepEqual(a.provenance[0], { placementIndex: 0, initialEntry: 0, target: { kind: "object", index: 0 }, commandIndices: [0, 1, 2], unsupportedReason: null });
    const c = a.emitters[0].initial;
    deepEqual(c.offset, [0, 0, 0]); deepEqual(c.spread, [64, 64, 8]);
    deepEqual(c.direction, [0, 0, 0]); equal(c.primaryColor, 0); equal(c.frequency, 2); equal(c.size, 31);
    equal(emitters(sands).emitters[0].initial.particleId, 24);
    equal(emitters([japes[0], japes[1], "00460b96ff7f7f01ffff", japes[2]]).emitters.length, 1);
});

test("conditions, retargeting, duration, trails, unsupported audio and incomplete scripts reject the whole emitter", () => {
    for (const rows of [japes.slice(0, 2), [japes[0], "00050000000000000000", japes[1], japes[2]], [japes[0], "001800097a161f000000", japes[2]], [japes[0], "001700197a161f000001", japes[2]], [japes[0], japes[1], "00460000000000000000", japes[2]], [japes[0], japes[1], "000e0000000000000000", japes[2]]]) {
        const a = emitters(rows); equal(a.emitters.length, 0); ok(a.provenance[0].unsupportedReason);
    }
    equal(emitters(japes, [{ ...placement, id: 50 }]).emitters.length, 0);
    equal(emitters([japes[0], "001700e97a1601000000", japes[2]], [{ ...placement, scale: 1 }]).emitters.length, 0);
});

test("frequency decoding wraps the stored signed byte and scheduling reproduces the counter loop", () => {
    equal(emitters([japes[0], "001700097a801f000000", japes[2]]).emitters[0].initial.frequency, 108);
    for (const q of [-20, -4, -2, -1, 0, 2, 5, 108]) {
        let counter = 0;
        for (let tick = 1; tick < 300; tick++) {
            let count = 0;
            if (counter > 0) counter--;
            else { count = counter < 0 ? -counter : 1; counter = q; for (let i = 0; i < count; i++) if (counter < 0) counter++; }
            equal(persistentEmissionCount({ flags: 9, frequency: q }, tick), count);
        }
    }
    deepEqual([1, 2, 3, 4].map(t => persistentEmissionCount({ flags: 9, frequency: -4 }, t)), [1, 3, 1, 3]);
});

test("colour setup preserves zero/default sentinels; wrapper replaces colours and velocities", () => {
    equal(packParticleColor(0, 0, 0), 0); equal(packParticleColor(248, 248, 248), 0xFFFF);
    const a = emitters([japes[0], "0064f8000000f8000000", japes[1], japes[2]]).emitters[0];
    equal(a.initial.primaryColor, 0xF801); equal(a.initial.environmentColor, 0x7C1);
    for (let seed = 1; seed <= 64; seed++) {
        const p = spawnScriptParticle(a, 0, definitions, map(), seed).particle;
        ok(p.id === 25 || p.id === 26); equal(p.primaryColor, 0xFFFF); equal(p.environmentColor, 0xFFFF);
        ok(p.vx >= -40000 && p.vx <= 25535); ok(p.vz >= -40000 && p.vz <= 25535); ok(p.vy >= 0 && p.vy < 16384);
        ok(p.targetSize >= 41 && p.targetSize < 72); ok(p.size > 0 && p.size <= 16);
        ok(p.x / 65536 >= placement.x - 64 && p.x / 65536 < placement.x + 64);
    }
});

test("local offsets and sizes rotate/scale before the collision-centred emitter origin", () => {
    const a = emitters(sands, [{ ...placement, scale: 4096, angle: 90 }]).emitters[0];
    a.initial.offset = [10, 0, 0]; a.initial.spread = [0, 0, 0]; a.initial.direction = [0, 0, 0]; a.initial.directionSpread = [0, 0, 0];
    const p = spawnScriptParticle(a, 0, definitions, map(), 1).particle;
    equal(p.x / 65536, 2000); equal(p.z / 65536, 1980); equal(p.y / 65536, 264); equal(p.size, 18);
});

test("puff updates draw the pre-growth size, preserve lifetime boundaries and seek deterministically", () => {
    const e = emitters().emitters, sim = new ScriptParticleSimulation(e, definitions, map(), dat);
    const seed = (Math.imul(1, 0x9E3779B1) ^ Math.imul(1, 0x85EBCA6B) ^ Math.imul(1, 0xC2B2AE35)) >>> 0;
    const born = spawnScriptParticle(e[0], 0, definitions, map(), seed).particle;
    sim.advanceTo(0); equal(sim.particles.length, 0); sim.advanceTo(1); equal(sim.particles[0].size, born.size); equal(sim.particles[0].remaining, born.remaining - 1);
    sim.advanceTo(120); const expected = JSON.stringify(sim.particles);
    sim.advanceTo(120); equal(JSON.stringify(sim.particles), expected);
    sim.advanceTo(1000000000); ok(sim.particles.length <= 255);
    sim.advanceTo(1); sim.advanceTo(120); equal(JSON.stringify(sim.particles), expected);
});

test("grain gravity and impacts use the separate impact atlas and bounded child lifetime", () => {
    const e = emitters(sands).emitters; e[0].initial.spread = [0, 0, 0]; e[0].initial.directionSpread = [0, 0, 0]; e[0].initial.direction = [192, 0, 20];
    const ground = map(); ground.forEach(p => p.unk0 = 10);
    const sim = new ScriptParticleSimulation(e, definitions, ground, dat);
    sim.advanceTo(1); ok(sim.particles[0].vy < -20 * 65536 + 512); equal(sim.particles[0].texture0, 734);
    let impacts = 0;
    for (let tick = 2; tick < 50; tick++) { sim.advanceTo(tick); impacts += sim.particles.filter(p => p.id === 58).length; }
    ok(impacts > 0);
    ok(sim.particles.every(p => p.id !== 58 || p.texture0 >= 735 && p.texture1 <= 740));
});

test("script atlases use source group/tile offsets and linear I4 rows", () => {
    const bytes = new Uint8Array(0x24550);
    SCRIPT_PARTICLE_TEXTURE_OFFSETS.forEach((offset, i) => bytes[offset] = ((i & 15) << 4) | ((i + 1) & 15));
    const textures = parseScriptParticleTextures(ArrayBufferSlice.fromView(bytes));
    deepEqual(textures.map(t => t.dramAddr), [0x23AD0, 0x23B50, 0x23BD0, 0x23C50, 0x23CD0, 0x23D50, 0x21930, 0x20DB0, 0x20E30, 0x20EB0, 0x20F30, 0x20FB0, 0x21030, 0x21630, 0x216B0, 0x23550]);
    textures.forEach((t, i) => { equal(t.pixels[0], (i & 15) * 17); equal(t.pixels[4], ((i + 1) & 15) * 17); });
});

test("water contacts emit a camera-flattened ripple and script particle allocation remains bounded", () => {
    const e = emitters(sands).emitters; e[0].initial.spread = [0, 0, 0]; e[0].initial.directionSpread = [0, 0, 0]; e[0].initial.direction = [192, 0, 20];
    const sim = new ScriptParticleSimulation(e, definitions, map(), dat);
    let ripples = 0;
    for (let tick = 1; tick < 40; tick++) { sim.advanceTo(tick); ripples += sim.particles.filter(p => p.id === 19 && p.surfaceAligned && p.texture0 === 741 && p.texture1 === 742).length; }
    ok(ripples > 0);
    const crowded = emitters(japes, Array.from({ length: 10 }, () => ({ ...placement }))).emitters;
    crowded.forEach(e => e.initial.frequency = -20);
    const full = new ScriptParticleSimulation(crowded, definitions, map(), dat); full.advanceTo(38);
    equal(full.particles.length, 255);
});

const swampScript = [
    "0015a600fb0303030000", "006467884d0000000000", "001600bf030400010000", "00170009251621000000",
    "0006000b000000000000", "00480153000000000000", "000115007fd204b00003", "00460b6d6dcaca01000b",
    "00080003000000000000", "00090000000000000000",
];
const swampHelper = [
    "00000000000000000000", "00140009000000000000", "003d7f85006400005300", "003d7f86006400005400",
    "00140000000000000000", "003d7fd27f8500005320", "003d7fd37f8600005420", "00000000000000000000",
    "006553007fd200000000", "006554007fd300000000", "003d7fd27fd300005310", "00490000000000000000",
];
const swampRows = () => [...swampScript, ...Array(339 - swampScript.length).fill("00000000000000000000"), ...swampHelper];
const swampPlacement = { ...placement, id: 106, x: 3667, z: 2992, y: 680, scale: 16384, angle: 90, zRotation: 6 };
const swampTable = new Map([[106, { id: 106, collideHeight: 3, scaleOverride: 0 } as SSSVObjectData]]);

test("Swamp loop validates its complete distance helper and keeps emission independent of sound", () => {
    const a = readPersistentEmitters([swampPlacement], swampTable, script(swampRows()));
    equal(a.emitters.length, 1); const e = a.emitters[0];
    equal(e.initial.particleId, 37); equal(e.initial.flags, 9); equal(e.initial.frequency, 2); equal(e.height, 24);
    equal(e.initial.primaryColor, 0x6453); equal(e.initial.environmentColor, 0);
    deepEqual(e.provenance.commandIndices, [...Array.from({ length: 10 }, (_, i) => i), ...Array.from({ length: 12 }, (_, i) => 339 + i)]);
    // Cursor 3 jumps advance to cursor 4 (the delay), skipping emitter setup.
    equal(persistentEmissionCount(e.initial, 12), 0); equal(persistentEmissionCount(e.initial, 13), 1);
    const born = spawnScriptParticle(e, 0, definitions, map(), 12345).particle;
    equal(born.size, 33); equal(born.environmentColor, 0xB5AC);
    ok(born.x / 65536 >= 3574 && born.x / 65536 <= 3579);
    ok(born.y / 65536 >= 684 && born.y / 65536 <= 689);
    const sim = new ScriptParticleSimulation([e], definitions, map(), dat, a.provenance);
    sim.advanceTo(1); equal(sim.particles.length, 1);
    equal(sim.particles[0].texture0, 743); equal(sim.particles[0].texture1, 743);
    equal(sim.particles[0].primaryAlpha, 255); equal(sim.particles[0].environmentAlpha, 255);
    equal(sim.particles[0].remaining, 199); ok(sim.particles[0].vy < born.vy);
    sim.advanceTo(120); const state = JSON.stringify(sim.particles);
    sim.advanceTo(1000000); sim.advanceTo(7); sim.advanceTo(120); equal(JSON.stringify(sim.particles), state);
});

test("Swamp recognition rejects changes to control flow, setup and helper targeting", () => {
    for (const [index, replacement] of [[8, "00080000000000000000"], [3, "00170009231621000000"], [343, "00140009000000000000"], [350, "00180000000000000000"]] as const) {
        const rows = swampRows(); rows[index] = replacement;
        const a = readPersistentEmitters([swampPlacement], swampTable, script(rows));
        equal(a.emitters.length, 0); ok(a.provenance[0].unsupportedReason);
    }
    equal(readPersistentEmitters([{ ...swampPlacement, commandsLength: 1 }], swampTable, script(swampRows())).emitters.length, 0);
});
