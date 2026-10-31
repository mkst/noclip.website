import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import * as RDP from "../../Common/N64/RDP.js";
import { FLYING_DOG_STATIC_RECIPE } from "../animals/flying_dog.js";
import { FIRE_FOX_STATIC_RECIPE } from "../animals/fire_fox.js";
import { getStaticAnimalRecipe } from "../animal_contracts.js";
import { ANIMAL_EYE_ATLASES, sampleAnimalEyeFrame } from "../animal_eyes.js";
import { buildStaticAnimalModels, updateAnimalFlame } from "../animal_renderer.js";
import { FireFoxParticleSimulation, sampleFireFoxFlameScale, spawnFireFoxParticles } from "../fire_fox_effects.js";
import { particleDefinitionFile, parseParticleDefinition, SCRIPT_PARTICLE_IDS } from "../particle_assets.js";
import { findPayload, LevelPayloadType, MAP_X_POINTS, MAP_Z_POINTS, parseLevelContainer, parseLevelDat } from "../level.js";

(globalThis as any).window = { debug: false };

const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));
function buildFixtures() {
    const output = new RSPSharedOutput();
    const segments: ArrayBufferSlice[] = [];
    segments[1] = read("data/SSSV/segments/segment1.bin");
    segments[4] = read("data/SSSV/segments/europe_biome.bin");
    const map = Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({ unk0: 0, unk1: 0, unk2: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0, unk7: 0 }));
    const dat = parseLevelDat(findPayload(parseLevelContainer(read("data/SSSV/levels/HONEYMOON_LAGOON.bin")), LevelPayloadType.Dat)!);
    const placements = [5, 7].map(id => ({ id, x: 1000, z: 1000, y: 100, rotation: 0, health: 127, unkC: 0, unkE: 0 }));
    return { output, map, dat, builds: buildStaticAnimalModels(output, segments, placements, map, dat) };
}

test("FIRE_FOX flame samples the source scale range on independent axes", () => {
    const values = [0, 128, 255];
    deepEqual(sampleFireFoxFlameScale({ mask: () => values.shift()! }), [59392, 74240, 88972]);
});

test("FIRE_FOX flame updates only its own vertices and repeats after seeks", () => {
    const { output, builds: [dog, fox] } = buildFixtures();
    equal(dog.flame, null);
    const flame = fox.flame!;
    ok(flame !== null && flame.targets.length > 0 && flame.vertexCount === flame.targets.length);
    const data = new Float32Array(output.vertices.length * 10).fill(-999);
    ok(updateAnimalFlame(flame, data, 30));
    const frame = data.slice();
    equal(updateAnimalFlame(flame, data, 30), false);
    updateAnimalFlame(flame, data, 0);
    ok(data.some((value, i) => value !== frame[i]));
    updateAnimalFlame(flame, data, 30);
    deepEqual(data, frame);
    ok(data.every(Number.isFinite));
    for (let i = 0; i < output.vertices.length; i++)
        if (i < flame.firstVertex || i >= flame.firstVertex + flame.vertexCount)
            ok(data.subarray(i * 10, (i + 1) * 10).every(v => v === -999));
});

test("FIRE_FOX particle calls preserve source anchors, black colours and emission bounds", () => {
    const { map, builds: [, fox] } = buildFixtures();
    const definitions = new Map(SCRIPT_PARTICLE_IDS.map(id => [id, parseParticleDefinition(read(`data/SSSV/${particleDefinitionFile(id)}`))]));
    let extras = 0;
    for (let tick = 1; tick <= 120; tick++) {
        const births = spawnFireFoxParticles(fox, tick, definitions, map);
        ok(births.length === 1 || births.length === 2);
        extras += births.length - 1;
        for (const [index, { particle: p }] of births.entries()) {
            equal(p.x / 65536, 1000); equal(p.z / 65536, 974); equal(p.y / 65536, 108);
            ok(p.id === 25 || p.id === 26);
            equal(p.vy, 0); equal(p.primaryColor, 1); equal(p.environmentColor, 1);
            ok(p.size > 0 && p.size <= Math.max(15, definitions.get(p.id)!.defaultSize));
            ok(p.targetSize >= 25 && p.targetSize <= 56);
            ok([p.vx, p.vz].every(v => v >= (index ? 0 : -40000) && v <= (index ? 65534 : 25534)));
        }
    }
    ok(extras > 0 && extras < 120);
    const rotated = spawnFireFoxParticles({ ...fox, placement: { ...fox.placement, rotation: 64 } }, 1, definitions, map)[0].particle;
    equal(rotated.x / 65536, 973); equal(rotated.z / 65536, 1000);
});

test("FIRE_FOX particles replay bounded history and follow visibility at a paused tick", () => {
    const { map, dat, builds: [, fox] } = buildFixtures();
    const definitions = new Map(SCRIPT_PARTICLE_IDS.map(id => [id, parseParticleDefinition(read(`data/SSSV/${particleDefinitionFile(id)}`))]));
    const sim = new FireFoxParticleSimulation([fox], definitions, map, dat);
    sim.advanceTo(0); equal(sim.particles.length, 0);
    sim.advanceTo(120);
    const frame = structuredClone(sim.particles);
    ok(frame.length > 0 && frame.length < 76);
    sim.advanceTo(120); deepEqual(sim.particles, frame);
    sim.advanceTo(5); sim.advanceTo(120); deepEqual(sim.particles, frame);
    fox.drawCalls.forEach(d => d.visible = false);
    sim.advanceTo(120); equal(sim.particles.length, 0);
    fox.drawCalls.forEach(d => d.visible = true);
    sim.advanceTo(120); deepEqual(sim.particles, frame);
    sim.advanceTo(100000); ok(sim.particles.length > 0 && sim.particles.length < 76);
});

test("neutral flight joints match the original C helpers and species footHeight stats", () => {
    // /tmp/sssv-flight-ref.c executes BAA38, C4A70, BB70 and BBA10 with no pitch,
    // bank, head gestures or tail-heading lag. FIRE_FOX footHeight is 8, not traction=30.
    const dog = FLYING_DOG_STATIC_RECIPE.pose.sample.jointPositions;
    deepEqual(dog[0], { x: 0, z: 0, y: 896 });
    deepEqual(dog[1], { x: 0, z: 300, y: 896 }); deepEqual(dog[2], { x: 0, z: -300, y: 896 });
    deepEqual(dog[19], { x: 0, z: 488, y: 1417 }); deepEqual(dog[20], { x: 0, z: 931, y: 1417 });
    deepEqual(dog[23], { x: 1000, z: 0, y: 896 }); deepEqual(dog[25], { x: -1000, z: 0, y: 896 });
    const fox = FIRE_FOX_STATIC_RECIPE.pose.sample.jointPositions;
    deepEqual(fox[0], { x: 0, z: 0, y: 256 });
    deepEqual(fox[1], { x: 0, z: 390, y: 256 }); deepEqual(fox[2], { x: 0, z: -390, y: 256 });
    deepEqual(fox[19], { x: 0, z: 593, y: 818 }); deepEqual(fox[20], { x: 0, z: 993, y: 818 });
    deepEqual(fox[26], { x: 0, z: -1260, y: 256 });
    equal(getStaticAnimalRecipe({ id: 5, health: 127 }), FLYING_DOG_STATIC_RECIPE);
    equal(getStaticAnimalRecipe({ id: 7, health: 127 }), FIRE_FOX_STATIC_RECIPE);
    for (const id of [5, 7]) for (const health of [0, -1]) equal(getStaticAnimalRecipe({ id, health }), null);
});

test("FLYING_DOG retains both unmirrored wing surfaces and source TLUT4 eyes", () => {
    const { output, builds: [dog] } = buildFixtures();
    equal(dog.partMatrices.length, 8); ok(dog.partMatrices.every(p => !p.flipsWinding && p.triangles > 0));
    const texturedWings = dog.drawCalls.filter(draw => RDP.combineParamsUsesT0(draw.DP_Combine) && draw.SP_TextureState.s === 0.75);
    equal(texturedWings.length, 4);
    const wingTextures = texturedWings.map(draw => output.textureCache.textures[draw.textureIndices[0]]);
    deepEqual(wingTextures.map(t => [t.dramAddr, t.dramPalAddr, t.width, t.height]), [
        [0x040021B0, 0x040024D0, 48, 32], [0x04001EB0, 0x040024B0, 48, 32],
        [0x040021B0, 0x040024D0, 48, 32], [0x04001EB0, 0x040024B0, 48, 32],
    ]);
    ok(texturedWings.every(draw => draw.SP_TextureState.t === 0.5));
    const eyes = dog.drawCalls.filter(draw => draw.animalEyeAnimation !== null);
    equal(eyes.length, 2);
    for (const draw of eyes) {
        const eye = draw.animalEyeAnimation!; ok(eye.kind === "texture");
        equal(eye.family, "standard-tlut4"); equal(eye.textureIndices.length, 13);
        for (const id of eye.textureIndices) equal(output.textureCache.textures[id].dramPalAddr, 0x01000D00);
    }
    deepEqual(FLYING_DOG_STATIC_RECIPE.parts.find(p => p.name === "neck detail")?.jointOverrides?.from, { x: 0, z: 300, y: 844 });
});

test("FIRE_FOX submits the flight equipment and textured flame without FOX legs", () => {
    const { output, builds: [, fox] } = buildFixtures();
    equal(fox.partMatrices.length, 6); ok(fox.partMatrices.every(p => p.triangles > 0));
    ok(!fox.partMatrices.some(p => p.name.includes("leg")));
    let offset = 0;
    for (const part of fox.partMatrices) {
        const draws = fox.drawCalls.slice(offset, offset + part.drawCalls); offset += part.drawCalls;
        if (part.name === "flame tail") {
            ok(draws.every(draw => draw.SP_TextureState.s === 0.5 && draw.SP_TextureState.t === 0.5));
            ok(draws.every(draw => draw.textureIndices.some(id => {
                const t = output.textureCache.textures[id];
                return t.dramAddr === 0x040050D0 && t.dramPalAddr === 0x040052D0 && t.width === 32 && t.height === 32;
            })));
        }
        if (part.name.endsWith("eye")) ok(draws.every(draw => draw.animalEyeAnimation?.kind === "texture" && draw.animalEyeAnimation.family === "eyes5"));
    }
    for (const vertex of output.vertices) ok([vertex.x, vertex.y, vertex.z, vertex.c0, vertex.c1, vertex.c2].every(Number.isFinite));
});

test("TLUT4 changes eye colours while retaining standard blink timing and side mapping", () => {
    deepEqual(ANIMAL_EYE_ATLASES["standard-tlut4"], { base: 0x01000620, palette: 0x01000D00, frames: 13 });
    for (const tick of [0, 58, 64, 738, 971, 1001, 1130]) for (const side of ["left", "right"] as const)
        equal(sampleAnimalEyeFrame(tick, "standard-tlut4", side), sampleAnimalEyeFrame(tick, "standard", side));
});
