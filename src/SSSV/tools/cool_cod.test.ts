import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { COOL_COD_STATIC_RECIPE } from "../animals/cool_cod.js";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";
import { buildStaticAnimalModels } from "../animals/animal_renderer.js";
import { buildAnimalMarkers, createAnimalMarkers, createPlayerPlacement } from "../animals/animals.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseMap, parseObjects } from "../core/level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

test("COOL_COD neutral swim sample retains integer cosine rounding and the source foot height", () => {
    equal(getStaticAnimalRecipe({ id: 66, health: 127 }), COOL_COD_STATIC_RECIPE);
    for (const health of [0,-1]) equal(getStaticAnimalRecipe({ id: 66, health }), null);
    deepEqual(COOL_COD_STATIC_RECIPE.pose.sample.jointPositions, {
        0: { x: 0, z: 747, y: 15 << 5 }, 1: { x: 0, z: 249, y: 15 << 5 },
        2: { x: 0, z: -249, y: 15 << 5 }, 3: { x: 0, z: -747, y: 15 << 5 },
    });
});

for (const [level, count] of [["PENGUIN_PLAYPEN",3],["SOMETHING_FISHY",21]] as const) {
    test(`${level} builds all COOL_COD sections, palettes and player without fallback markers`, () => {
        const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
        const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
        const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
        const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!).filter(p => p.id === 66);
        const candidate = createPlayerPlacement(dat, parseObjects(findPayload(payloads, LevelPayloadType.Cob)!));
        const player = candidate?.id === 66 ? candidate : null;
        const segments: ArrayBufferSlice[] = [];
        segments[1] = read("data/SSSV/segments/segment1.bin"); segments[4] = read("data/SSSV/segments/ice_biome.bin");
        const output = new RSPSharedOutput(), builds = buildStaticAnimalModels(output, segments, placements, map, dat, player);
        equal(builds.length, count + (level === "SOMETHING_FISHY" ? 1 : 0));
        for (const b of builds) {
            equal(b.partMatrices.length, 5); equal(b.tail, null); equal(b.wool, null);
            ok(b.partMatrices.every(p => p.triangles > 0 && !p.flipsWinding));
            const body = b.textureIds.map(id => output.textureCache.textures[id]).find(t => t.dramAddr === 0x04007BD0)!;
            ok(body); equal(body.dramPalAddr, 0x04007DD0); equal(body.width, 32); equal(body.height, 32);
            const eyes = b.drawCalls.filter(d => d.animalEyeAnimation !== null); equal(eyes.length, 2);
            for (const d of eyes) {
                const e = d.animalEyeAnimation!; ok(e.kind === "texture"); equal(e.family, "standard-tlut4"); equal(e.textureIndices.length, 13);
                e.textureIndices.forEach((id, frame) => { const t = output.textureCache.textures[id]; equal(t.dramAddr, 0x01000620 + frame * 128); equal(t.dramPalAddr, 0x01000D00); });
            }
        }
        const markers = createAnimalMarkers(placements, player);
        buildAnimalMarkers(output, markers, new Set(builds.map(b => b.placementIndex)));
        ok(markers.every(m => m.hasModel));
        equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, placements, map, { ...dat, segment: 0 }).length, 0);
    });
}
