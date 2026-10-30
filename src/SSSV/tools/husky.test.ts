import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { HUSKY_STATIC_RECIPE } from "../animals/husky.js";
import { getStaticAnimalRecipe } from "../animal_contracts.js";
import { buildStaticAnimalModels } from "../animal_renderer.js";
import { advanceAnimalTail, createAnimalTail } from "../animal_tails.js";
import { sampleAnimalEyeFrame } from "../animal_eyes.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseMap } from "../level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

test("HUSKY standing pose follows its three-link support, mode-6 head and tail anchor", () => {
    const recipe = HUSKY_STATIC_RECIPE, j = recipe.pose.sample.jointPositions;
    equal(getStaticAnimalRecipe({ id: 40, health: 65 }), recipe);
    for (const id of [40, 41, 42]) equal(getStaticAnimalRecipe({ id, health: 0 }), null);
    // /tmp/sssv-husky-ref.c runs the source BEAB0 support helper with state 2,
    // zero terrain/gestures, then B964C, C4A70(32,218,6), BB938(246).
    deepEqual(j[0], { x: 0, z: 0, y: 601 });
    deepEqual(j[1], { x: 0, z: 246, y: 710 }); deepEqual(j[2], { x: 0, z: -246, y: 710 });
    for (const [src, mid, low, foot, x, z] of [[3,7,8,9,-92,246], [4,10,11,12,92,246], [5,13,14,15,-92,-246], [6,16,17,18,92,-246]]) {
        deepEqual(j[src], { x, z, y: 710 }); deepEqual(j[mid], { x, z, y: 437 });
        deepEqual(j[low], { x, z, y: 164 }); deepEqual(j[foot], { x, z, y: 0 });
    }
    deepEqual(j[19], { x: 0, z: 246, y: 742 }); deepEqual(j[20], { x: 0, z: 464, y: 742 });
    deepEqual(j[26], { x: 0, z: -438, y: 1010 });
    equal(recipe.biomeSegment, 1); equal(recipe.parts.length, 16);
    ok(recipe.parts.every(p => p.scale.kind === "unit-16.16" && p.scale.value === 0x11800));
});

test("four-point HUSKY tail matches source DD244/DD548 over 120 ticks and seeks", () => {
    // Source C hashes from /tmp/sssv-husky-tail-ref.c: all point/velocity words at ticks 0..120.
    for (const [rotation, expected] of [[0, 1834641407], [43, 4135088939], [192, 74720871]]) {
        const tail = createAnimalTail({ id: 40, x: 700, z: 900, y: 80, rotation, health: 65, unkC: 0, unkE: 0 }, 80, { x: 0, z: 0, y: 0 })!;
        equal(tail.kind, "husky"); equal(tail.points.length, 4); equal(tail.segmentLength, 450560);
        let hash = 2166136261;
        for (let tick = 0; tick <= 120; tick++) {
            advanceAnimalTail(tail, tick);
            for (let i = 0; i < 4; i++) for (const v of [...tail.points[i], ...tail.velocities[i]]) hash = Math.imul(hash ^ v, 16777619) >>> 0;
        }
        equal(hash, expected);
        const points = tail.points.map(p => [...p]);
        advanceAnimalTail(tail, 0); advanceAnimalTail(tail, 120); deepEqual(tail.points, points);
    }
});

test("HUSKY builds all sixteen parts, its two palettes and three source tail links", () => {
    const payloads = parseLevelContainer(read("data/SSSV/levels/SNOW_JOKE.bin"));
    const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!);
    const segments: ArrayBufferSlice[] = [];
    segments[1] = read("data/SSSV/segments/segment1.bin"); segments[4] = read("data/SSSV/segments/ice_biome.bin");
    const output = new RSPSharedOutput();
    const builds = buildStaticAnimalModels(output, segments, placements.filter(p => p.id === 40), map, dat);
    equal(builds.length, 2);
    for (const build of builds) {
        equal(build.partMatrices.length, 16);
        for (const part of build.partMatrices) equal(part.flipsWinding, part.name.includes("right") && !part.name.endsWith("eye"));
        const textures = build.textureIds.map(id => output.textureCache.textures[id]);
        ok(textures.some(t => t.dramAddr === 0x04005260 && t.dramPalAddr === 0x04005460));
        const eyes = build.drawCalls.filter(d => d.animalEyeAnimation !== null);
        equal(eyes.length, 2);
        for (const draw of eyes) {
            const eye = draw.animalEyeAnimation!; ok(eye.kind === "texture"); equal(eye.family, "eyes5-tlut2");
            equal(eye.textureIndices.length, 9);
            for (const id of eye.textureIndices) equal(output.textureCache.textures[id].dramPalAddr, 0x01000CC0);
        }
        equal(build.tail?.vertexCount, 18);
        deepEqual(build.drawCalls.slice(-3).map(d => d.indexCount), [24,24,24]);
        for (const [i, draw] of build.drawCalls.slice(-3).entries()) deepEqual(Array.from(draw.DP_PrimColor).map(v => Math.round(v * 255)), [[190,255,255,255],[212,255,255,255],[255,255,255,255]][i]);
    }
    equal(sampleAnimalEyeFrame(58, "eyes5-tlut2", "left"), 4);
    equal(sampleAnimalEyeFrame(1130, "eyes5-tlut2", "right"), 3);
});
