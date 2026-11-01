import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSP_Geometry, RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { SEAGULL_STATIC_RECIPE } from "../animals/seagull.js";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";
import { buildStaticAnimalModels } from "../animals/animal_renderer.js";
import { buildAnimalMarkers, createAnimalMarkers } from "../animals/animals.js";
import { ANIMAL_EYE_ATLASES, sampleAnimalEyeFrame } from "../animals/animal_eyes.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseMap } from "../core/level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

test("SEAGULL neutral joints match the original C helpers and active default foot assembly", () => {
    equal(getStaticAnimalRecipe({ id: 0, health: 127 }), SEAGULL_STATIC_RECIPE);
    for (const health of [0,-1]) equal(getStaticAnimalRecipe({ id: 0, health }), null);
    equal(getStaticAnimalRecipe({ id: 25, health: 127 }), null);
    // Original BAD60, C5F34, BB1F0, BC1F4 and C44E8, no gestures, tick 0.
    const j = SEAGULL_STATIC_RECIPE.pose.sample.jointPositions;
    deepEqual(j[0], { x: 0, z: 0, y: 812 });
    deepEqual(j[1], { x: 0, z: 312, y: 812 }); deepEqual(j[2], { x: 0, z: -312, y: 812 });
    deepEqual(j[19], { x: 0, z: 48, y: 1371 }); deepEqual(j[20], { x: 0, z: 423, y: 1371 });
    deepEqual(j[22], { x: 1125, z: 0, y: 812 }); deepEqual(j[24], { x: -1125, z: 0, y: 812 });
    deepEqual(j[26], { x: 0, z: -1015, y: 1066 });
    deepEqual([3,5,7,8,9,13].map(i => j[i]), [
        { x:-250,z:0,y:0 }, { x:0,z:0,y:0 }, { x:-464,z:214,y:0 },
        { x:-250,z:312,y:0 }, { x:-36,z:214,y:0 }, { x:-250,z:-312,y:0 },
    ]);
    deepEqual([4,27,10,11,12,14].map(i => j[i]), [
        { x:250,z:0,y:0 }, { x:0,z:0,y:0 }, { x:36,z:214,y:0 },
        { x:250,z:312,y:0 }, { x:464,z:214,y:0 }, { x:250,z:-312,y:0 },
    ]);
    ok(SEAGULL_STATIC_RECIPE.parts.every(p => p.scale.kind === "unit-16.16" && p.scale.value === 0x14000));
});

test("SEAGULL standard atlas uses TLUT1 with the original eye-side mappings", () => {
    deepEqual(ANIMAL_EYE_ATLASES["standard-tlut1"], { base: 0x01000620, palette: 0x01000CA0, frames: 13 });
    for (let tick=0; tick<4096; tick++) for (const side of ["left","right"] as const)
        equal(sampleAnimalEyeFrame(tick, "standard-tlut1", side), sampleAnimalEyeFrame(tick, "standard", side));
});

test("Penguin Playpen SEAGULL builds all seventeen parts, source culling and blinking eyes", () => {
    const payloads = parseLevelContainer(read("data/SSSV/levels/PENGUIN_PLAYPEN.bin"));
    const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!).filter(p => p.id === 0);
    equal(placements.length, 1);
    const segments: ArrayBufferSlice[] = [];
    segments[1] = read("data/SSSV/segments/segment1.bin"); segments[4] = read("data/SSSV/segments/ice_biome.bin");
    const output = new RSPSharedOutput();
    const builds = buildStaticAnimalModels(output, segments, placements, map, dat);
    equal(builds.length, 1);
    const b = builds[0];
    equal(b.partMatrices.length, 17);
    ok(b.partMatrices.every(p => p.triangles > 0 && p.flipsWinding === (p.name === "right wing")));
    const cullMask = RSP_Geometry.G_CULL_FRONT | RSP_Geometry.G_CULL_BACK;
    for (const p of b.partMatrices) {
        if (p.name.endsWith("wing")) ok(p.geometryModes.every(mode => (mode & cullMask) === 0));
        if (p.name.endsWith("toe") || p.name.endsWith("webbing")) ok(p.geometryModes.every(mode => (mode & cullMask) === RSP_Geometry.G_CULL_BACK));
    }
    const eyes = b.drawCalls.filter(d => d.animalEyeAnimation !== null);
    equal(eyes.length, 2);
    for (const d of eyes) {
        const e = d.animalEyeAnimation!; ok(e.kind === "texture"); equal(e.family, "standard-tlut1"); equal(e.textureIndices.length, 13);
        for (const [frame,id] of e.textureIndices.entries()) {
            const t = output.textureCache.textures[id]; equal(t.dramAddr, 0x01000620 + frame * 128); equal(t.dramPalAddr, 0x01000CA0);
        }
    }
    const markers = createAnimalMarkers(placements, null);
    buildAnimalMarkers(output, markers, new Set(builds.map(b => b.placementIndex)));
    equal(markers[0].hasModel, true);
    for (const segment of [0,2,3,5]) equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, placements, map, { ...dat, segment }).length, 0);
});
