import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { ELEPHANT_STATIC_RECIPE } from "../animals/elephant.js";
import { buildStaticAnimalModels } from "../animals/animal_renderer.js";
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

for (const [level, count] of [["JUNGLE_JAPES", 2], ["JUNGLE_DOLDRUMS", 3], ["JUNGLE_JUMPS", 2], ["WEIGHT_FOR_IT", 0]] as const) test(`${level} ELEPHANT coverage and materials`, () => {
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
    equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, placements, map, { ...dat, segment: 1 }).length, 0);
});
