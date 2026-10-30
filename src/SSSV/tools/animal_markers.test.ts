import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { buildAnimalMarkers, createAnimalMarkers, isAnimalMarkerVisible } from "../animals.js";
import { buildStaticAnimalModels } from "../animal_renderer.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseLevelDat, parseMap } from "../level.js";
import type { LevelAnimalPlacement } from "../level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));
const placement = (id: number, health = 127): LevelAnimalPlacement => ({ id, health, x: 672, z: 656, y: 1000, rotation: 0, unkC: 0, unkE: 0 });

test("Auto hides modeled animals only while models are enabled; All and Off remain explicit", () => {
    for (const hasModel of [false,true]) for (const animalsEnabled of [false,true]) {
        equal(isAnimalMarkerVisible("auto", hasModel, animalsEnabled), !(hasModel && animalsEnabled));
        equal(isAnimalMarkerVisible("all", hasModel, animalsEnabled), true);
        equal(isAnimalMarkerVisible("off", hasModel, animalsEnabled), false);
    }
});

test("marker coverage follows successful builds, including health, unsupported species, ground failures and player", () => {
    const payloads = parseLevelContainer(read("data/SSSV/levels/SNOW_JOKE.bin"));
    const dat = { ...parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!), segment: 0 };
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const segments: ArrayBufferSlice[] = [];
    segments[1] = read("data/SSSV/segments/segment1.bin"); segments[4] = read("data/SSSV/segments/europe_biome.bin");
    const placements = [placement(33), placement(33,0), placement(2), { ...placement(31), x: 0, z: 0 }];
    const player = placement(31), output = new RSPSharedOutput();
    const models = buildStaticAnimalModels(output, segments, placements, map, dat, player);
    deepEqual(models.map(m => m.placementIndex), [0,-1]);
    const markers = createAnimalMarkers(placements, player);
    const draws = buildAnimalMarkers(output, markers, new Set(models.map(m => m.placementIndex)));
    deepEqual(markers.map(m => m.placementIndex), [0,1,2,3,-1]);
    deepEqual(markers.map(m => m.hasModel), [true,false,false,false,true]);
    equal(markers[4].label, "PLAYER (DOG)");
    equal(draws.length, 2);
    deepEqual(draws.map(d => d.animalMarkerHasModel), [false,true]);
    ok(draws.every(d => d.indexCount > 0));
    const wrongBank = buildStaticAnimalModels(new RSPSharedOutput(), segments, placements, map, { ...dat, segment: 1 }, player);
    equal(wrongBank.length, 0);
    const fallback = buildAnimalMarkers(new RSPSharedOutput(), markers, new Set(wrongBank.map(m => m.placementIndex)));
    equal(fallback.length, 1); equal(fallback[0].animalMarkerHasModel, false);
    ok(markers.every(m => !m.hasModel));
});

test("spawn marker offsets do not collide with authored animals or player coverage", () => {
    const markers = createAnimalMarkers([placement(2),placement(31)]);
    const draws = buildAnimalMarkers(new RSPSharedOutput(), markers, new Set([0,-1,5]), 4);
    deepEqual(markers.map(m => m.hasModel), [false,true]); equal(draws.length, 2);
    equal(buildAnimalMarkers(new RSPSharedOutput(), []).length, 0);
});
