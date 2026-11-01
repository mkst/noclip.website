import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { MAP_X_POINTS, MAP_Z_POINTS } from "../core/level.js";
import type { LevelMapEntry, LevelObjectPlacement } from "../core/level.js";
import type { SSSVObjectData } from "../objects/objects.js";
import { parseParticleDefinition, TORCH_PARTICLE_ASSETS } from "../effects/particle_assets.js";
import { createParticleSpriteSource, createTorchEmitters, createTorchParticleSource, ParticleSimulation, particleProjectedHalfSize, sampleParticleSurfaces, TorchSimulation } from "../effects/particles.js";
import type { ParticleSprite } from "../effects/script_particles.js";

const definition = parseParticleDefinition(ArrayBufferSlice.fromView(Buffer.from("00d61400000b0100000000020604ff80f800000000000000", "hex")));
const placement: LevelObjectPlacement = { id: 50, x: 1291, z: 3230, y: 888, angle: 0, zRotation: 0, scale: 3072, unkC: 0, commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 };
const entry = { id: 50, scaleOverride: 0, collideHeight: 52 } as SSSVObjectData;
const zero: LevelMapEntry = { unk0: 0, unk1: 0, unk2: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0, unk7: 0 };
const flatMap = () => Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({ ...zero }));
const drift = () => Array.from({ length: 32 }, (): [number, number, number] => [0, 0, 0]);
const emitters = () => createTorchEmitters([placement], new Map([[50, entry]]));

const sprite = (x: number): ParticleSprite => ({ x, y: 0, z: 0, size: 1, lodFraction: 0, texture0: 1, texture1: 1, primaryColor: 0, environmentColor: 0, primaryAlpha: 255, environmentAlpha: 0 });

test("particle sources preserve update ownership, collection order and replaced sprite arrays", () => {
    const steps: number[] = [];
    const active = { particles: [sprite(1)], advanceTo(tick: number) { steps.push(tick); this.particles = [sprite(tick)]; } };
    const passive = { particles: [sprite(2)], advanceTo() { throw Error("Externally advanced source was stepped"); } };
    const simulation = new ParticleSimulation([
        createParticleSpriteSource(active, [1, 2], active.advanceTo.bind(active)),
        createParticleSpriteSource(passive, [2, 3]),
    ]);
    deepEqual(simulation.textureIds, [1, 2, 2, 3]);
    for (const tick of [5, 5, 0, 10000]) {
        simulation.advanceTo(tick);
        deepEqual(simulation.particles, [sprite(tick), sprite(2)]);
    }
    deepEqual(steps, [5, 5, 0, 10000]);
    passive.particles = [];
    simulation.advanceTo(10000);
    deepEqual(simulation.particles, [sprite(10000)]);
});

test("particle cap retains the last 255 sprites across sources without modifying their arrays", () => {
    const first = { particles: Array.from({ length: 200 }, (_, i) => sprite(i)) };
    const last = { particles: Array.from({ length: 100 }, (_, i) => sprite(i + 200)) };
    const simulation = new ParticleSimulation([createParticleSpriteSource(first, []), createParticleSpriteSource(last, [])]);
    simulation.advanceTo(0);
    deepEqual(simulation.particles.map(p => p.x), Array.from({ length: 255 }, (_, i) => i + 45));
    equal(first.particles.length, 200); equal(last.particles.length, 100);
    const empty = new ParticleSimulation([]); empty.advanceTo(0);
    deepEqual(empty.particles, []); deepEqual(empty.textureIds, []);
});

test("torch adapter preserves paired textures, source colours and seek behavior", () => {
    const torch = new TorchSimulation(emitters(), definition, drift(), flatMap());
    const simulation = new ParticleSimulation([createTorchParticleSource(torch, definition)]);
    const assets = TORCH_PARTICLE_ASSETS;
    deepEqual(simulation.textureIds, Array.from({ length: assets.textureCount }, (_, i) => assets.textureIdBase + i));
    simulation.advanceTo(5);
    equal(simulation.particles.length, 1);
    const p = simulation.particles[0];
    deepEqual([p.texture0, p.texture1, p.primaryColor, p.environmentColor, p.primaryAlpha, p.environmentAlpha],
        [assets.textureIdBase + 1, assets.textureIdBase + 2, definition.primaryColor, definition.environmentColor, 200, 0]);
    equal("texture0" in torch.particles[0], false);
    const snapshot = JSON.stringify(simulation.particles);
    simulation.advanceTo(5); equal(JSON.stringify(simulation.particles), snapshot);
    simulation.advanceTo(10000); simulation.advanceTo(5); equal(JSON.stringify(simulation.particles), snapshot);
    simulation.advanceTo(0); deepEqual(simulation.particles, []);
});

test("torch origin and size use scaled collision height with source integer rounding", () => {
    deepEqual(emitters(), [{ placementIndex: 0, x: 1291, z: 3230, y: 1005, size: 60 }]);
    const evo = createTorchEmitters([{ ...placement, y: 745, scale: 2252 }], new Map([[50, entry]]));
    equal(evo[0].y, 830); equal(evo[0].size, 43);
    equal(createTorchEmitters([{ ...placement, id: 49 }], new Map([[50, entry]])).length, 0);
});

test("four-tick emissions update immediately and retain the final zero-lifetime draw", () => {
    const simulation = new TorchSimulation(emitters(), definition, drift(), flatMap());
    simulation.advanceTo(3); equal(simulation.particles.length, 0);
    simulation.advanceTo(4);
    deepEqual(simulation.particles[0], { slot: 1, emitterIndex: 0, x: 1291 * 65536, z: 3230 * 65536, y: 1009 * 65536, size: 60, remaining: 10, frame: 0, lodFraction: 128 });
    simulation.advanceTo(5);
    equal(simulation.particles[0].remaining, 9); equal(simulation.particles[0].frame, 1); equal(simulation.particles[0].lodFraction, 0);
    simulation.advanceTo(14);
    equal(simulation.particles.length, 3);
    equal(simulation.particles[0].remaining, 0); equal(simulation.particles[0].frame, 5); equal(simulation.particles[0].lodFraction, 128);
    simulation.advanceTo(15); equal(simulation.particles.some(p => p.slot === 1), false);
});

test("pool-slot-indexed signed drift is applied before upward velocity", () => {
    const motion = drift(); motion[11] = [256, -256, 512];
    const simulation = new TorchSimulation(emitters(), definition, motion, flatMap());
    simulation.advanceTo(4);
    const p = simulation.particles[0];
    equal(p.x / 65536, 1292); equal(p.z / 65536, 3229); equal(p.y / 65536, 1011);
    simulation.advanceTo(1020);
    ok(simulation.particles.some(p => p.slot === 0));
});

test("seeking and repeated timestamps are deterministic with bounded long-jump work", () => {
    const simulation = new TorchSimulation(emitters(), definition, drift(), flatMap());
    simulation.advanceTo(400); const expected = JSON.stringify(simulation.particles);
    simulation.advanceTo(400); equal(JSON.stringify(simulation.particles), expected);
    simulation.advanceTo(1000000000); ok(simulation.particles.length <= 3);
    simulation.advanceTo(7); simulation.advanceTo(400); equal(JSON.stringify(simulation.particles), expected);
    const crowded = new TorchSimulation(Array(300).fill(emitters()[0]), definition, drift(), flatMap());
    crowded.advanceTo(100); equal(crowded.particles.length, 255);
});

test("surface interpolation follows each source triangle diagonal and preserves upper-height precision", () => {
    const map = flatMap();
    map[0] = { ...zero, unk3: 1 };
    map[1] = { ...zero, unk0: 8, unk1: 8 };
    map[MAP_Z_POINTS] = { ...zero, unk0: 16, unk1: 16 };
    map[MAP_Z_POINTS + 1] = { ...zero, unk0: 32, unk1: 32 };
    deepEqual(sampleParticleSurfaces(map, 272, 528), { ground: 48, upper: 48, water: 0 });
    map[0].unk4 = 3;
    deepEqual(sampleParticleSurfaces(map, 272, 528), { ground: 64, upper: 64, water: 0 });
    map[0].unk3 = 0;
    equal(sampleParticleSurfaces(map, 272, 528)!.upper, Infinity);
    equal(sampleParticleSurfaces(map, 0, 0), null);
    map[0] = { ...zero, unk3: 1 };
    map[MAP_Z_POINTS] = { ...zero, unk0: 1, unk1: 1 };
    deepEqual(sampleParticleSurfaces(map, 257, 512), { ground: 0, upper: 0.125, water: 0 });
});

test("surface-terminated particles draw once at death, then disappear", () => {
    const map = flatMap(); map.forEach(p => p.unk0 = 200);
    const simulation = new TorchSimulation(emitters(), definition, drift(), map);
    simulation.advanceTo(4); equal(simulation.particles.length, 1); equal(simulation.particles[0].remaining, 0);
    simulation.advanceTo(5); equal(simulation.particles.length, 0);
});

test("projected flame half-size follows source texrect dimensions and near-depth limit", () => {
    equal(particleProjectedHalfSize(60, 100, 65), 2495 * 15 / 61440);
    equal(particleProjectedHalfSize(60, 3, 65), 0);
    equal(particleProjectedHalfSize(60, 100, 0), 0);
    ok(Math.abs(particleProjectedHalfSize(60, 100, 65) / particleProjectedHalfSize(60, 200, 65) - 2) < 0.002);
});

test("static water follows source triangle interpolation and missing-corner repair", () => {
    const map = flatMap();
    map[0].unk6 = 5; map[1].unk6 = 10; map[MAP_Z_POINTS + 1].unk6 = 20; map[MAP_Z_POINTS].unk6 = 15;
    equal(sampleParticleSurfaces(map, 272, 544)!.water, 40);
    map[0].unk6 = 0;
    equal(sampleParticleSurfaces(map, 272, 544)!.water, 70);
});
