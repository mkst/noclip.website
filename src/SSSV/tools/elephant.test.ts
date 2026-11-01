import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { ELEPHANT_STATIC_RECIPE, ELEPHANT_DEACTIVATED_RECIPE } from "../animals/elephant.js";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";
import { buildAnimalMarkers, createAnimalMarkers } from "../animals/animals.js";
import { sampleAnimalEyeFrame } from "../animals/animal_eyes.js";
import { buildStaticAnimalModels, updateAnimalTail } from "../animals/animal_renderer.js";
import { advanceAnimalTail, createAnimalTail, animalTailMatrix } from "../animals/animal_tails.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseMap } from "../core/level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

test("ELEPHANT trunk matches source DD244/DD548 over 120 ticks at three headings", () => {
    // FNV over point/velocity words from the original C routines, idle curve D_803A39C0, damping 10.
    for (const [rotation, expected] of [[0, 2563023532], [43, 1251757357], [192, 1650718156]]) {
        const tail = createAnimalTail({ id: 56, x: 700, z: 900, y: 80, rotation, health: 127, unkC: 0, unkE: 0 }, 80, { x: 0, z: 0, y: 875 })!;
        let hash = 2166136261;
        for (let tick = 0; tick <= 120; tick++) {
            advanceAnimalTail(tail, tick);
            for (let i = 0; i < 5; i++) for (const v of [...tail.points[i], ...tail.velocities[i]]) hash = Math.imul(hash ^ v, 16777619) >>> 0;
        }
        equal(hash, expected, `heading=${rotation}`);
    }
});

test("ELEPHANT preserves the source standing head and trunk anchor, and deterministic trunk seeks", () => {
    const j = ELEPHANT_STATIC_RECIPE.pose.sample.jointPositions;
    deepEqual(j[19], { x: 0, z: 868, y: 2829 }); deepEqual(j[20], { x: 0, z: 1618, y: 2829 });
    for (const index of [7, 10, 13, 16]) equal(j[index].y, -100);
    const placement = { id: 56, x: 700, z: 900, y: 80, rotation: 0, health: 127, unkC: 0, unkE: 0 };
    const tail = createAnimalTail(placement, 80, j[20])!;
    deepEqual(tail.anchor, [700 * 65536, 900 * 65536 + Math.trunc(32767 * 1618 / 16), 80 * 65536 + 2829 * 2048 - 0x1B5800]);
    equal(tail.points.length, 5); equal(tail.segmentLength, 1075200);
    const initial = tail.points.map(p => [...p]); advanceAnimalTail(tail, 120); const later = tail.points.map(p => [...p]);
    ok(JSON.stringify(initial) !== JSON.stringify(later));
    for (let link = 0; link < 4; link++) ok(Array.from(animalTailMatrix(tail, link)).every(Number.isFinite));
    advanceAnimalTail(tail, 0); deepEqual(tail.points, initial); advanceAnimalTail(tail, 120); deepEqual(tail.points, later);
});

for (const [level, count] of [["JUNGLE_JAPES", 2], ["JUNGLE_DOLDRUMS", 3], ["JUNGLE_JUMPS", 2], ["WEIGHT_FOR_IT", 1]] as const) test(`${level} ELEPHANT coverage and materials`, () => {
    const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
    const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!).filter(p => p.id === 56);
    const segments: ArrayBufferSlice[] = [];
    segments[1] = read("data/SSSV/segments/segment1.bin"); segments[4] = read("data/SSSV/segments/jungle_biome.bin");
    const output = new RSPSharedOutput(), models = buildStaticAnimalModels(output, segments, placements, map, dat);
    equal(models.length, count);
    for (const model of models) {
        equal(model.partMatrices.length, 9); ok(model.partMatrices.every(p => p.triangles > 0));
        equal(model.tail!.simulation.kind, "elephant"); ok(model.tail!.targets.length > 0);
        const eyes = model.drawCalls.filter(d => d.animalEyeAnimation !== null); equal(eyes.length, 2);
        for (const d of eyes) { const e = d.animalEyeAnimation!; ok(e.kind === "texture"); equal(e.family, "eyes5"); equal(e.textureIndices.length, 9); }
        const textures = model.textureIds.map(id => output.textureCache.textures[id]);
        for (const palette of [0x040067C0, 0x040067E0]) ok(textures.some(t => t.dramPalAddr === palette));
    }
    const markers = createAnimalMarkers(placements, null);
    buildAnimalMarkers(output, markers, new Set(models.map(model => model.placementIndex)));
    ok(markers.every(marker => marker.hasModel));
    equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, placements, map, { ...dat, segment: 1 }).length, 0);
});

test("deactivated ELEPHANT uses the complete source blend target and closed eyes", () => {
    equal(getStaticAnimalRecipe({ id: 56, health: 1 }), ELEPHANT_STATIC_RECIPE);
    for (const health of [0, -1]) equal(getStaticAnimalRecipe({ id: 56, health }), ELEPHANT_DEACTIVATED_RECIPE);
    // Original DB494 C, D_803B5698/56A8/56B8 topology and D_803B56D0 target,
    // evaluated at full strength with core/mtx.h's integer degree table.
    deepEqual(Object.entries(ELEPHANT_DEACTIVATED_RECIPE.pose.sample.jointPositions).map(([id, p]) => [Number(id), p.x, p.z, p.y]), [
        [0,0,0,1500], [1,0,625,1500], [2,0,-625,1500],
        [3,-485,625,1222], [4,485,625,1222], [5,-485,-625,1222], [6,485,-625,1222],
        [7,-1219,1441,302], [10,1396,1387,420], [13,-1367,-1220,263], [16,1327,-1329,302],
        [19,0,874,1521], [20,0,1292,900],
    ]);
    deepEqual(ELEPHANT_DEACTIVATED_RECIPE.parts, ELEPHANT_STATIC_RECIPE.parts);
    equal(ELEPHANT_DEACTIVATED_RECIPE.pose.sample.eyeFrame, 4);
    for (const change of ELEPHANT_DEACTIVATED_RECIPE.stateChanges.filter(c => c.kind === "load-eye-palette-frame")) {
        ok(change.kind === "load-eye-palette-frame"); equal(change.textureAddress, 0x01002100 + 4 * 128);
    }
    for (const tick of [0,58,971,4096]) for (const side of ["left", "right"] as const)
        equal(sampleAnimalEyeFrame(tick, "eyes5", side, true), 4);
});

test("Weight for It deactivated trunk follows the lowered head and supports repeated frames and seeks", () => {
    const payloads = parseLevelContainer(read("data/SSSV/levels/WEIGHT_FOR_IT.bin"));
    const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!).filter(p => p.id === 56);
    const segments: ArrayBufferSlice[] = [];
    segments[1] = read("data/SSSV/segments/segment1.bin"); segments[4] = read("data/SSSV/segments/jungle_biome.bin");
    const output = new RSPSharedOutput();
    const [model] = buildStaticAnimalModels(output, segments, placements, map, dat);
    equal(model.recipe, ELEPHANT_DEACTIVATED_RECIPE);
    const animation = model.tail!;
    equal(animation.simulation.anchor[2], model.resolvedY * 65536 + 900 * 2048 - 0x1B5800);
    for (const draw of model.drawCalls.filter(d => d.animalEyeAnimation !== null)) {
        const eye = draw.animalEyeAnimation!; ok(eye.kind === "texture"); equal(eye.deactivated, true);
        equal(draw.textureIndices[0], eye.textureIndices[4]);
    }
    const vertices = new Float32Array(output.vertices.length * 10).fill(-999);
    ok(updateAnimalTail(animation, vertices, 120));
    const later = vertices.slice();
    equal(updateAnimalTail(animation, vertices, 120), false);
    updateAnimalTail(animation, vertices, 0); updateAnimalTail(animation, vertices, 120);
    deepEqual(vertices, later); ok(vertices.every(Number.isFinite));
});
