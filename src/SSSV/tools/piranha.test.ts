import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { PIRANHA_STATIC_RECIPE } from "../animals/piranha.js";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";
import { buildStaticAnimalModels } from "../animals/animal_renderer.js";
import { buildAnimalMarkers, createAnimalMarkers, createPlayerPlacement } from "../animals/animals.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseMap, parseObjects } from "../core/level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

test("PIRANHA retains its asymmetric source swim chain and tick-zero breathing offsets", () => {
    equal(getStaticAnimalRecipe({ id: 30, health: 127 }), PIRANHA_STATIC_RECIPE);
    for (const health of [0, -1]) equal(getStaticAnimalRecipe({ id: 30, health }), null);
    // Active 302E50 assembly: COS(0)>>7 = 255, footHeight = 18.
    deepEqual(PIRANHA_STATIC_RECIPE.pose.sample.jointPositions, {
        0: { x: 0, z: 507, y: 576 }, 1: { x: 0, z: 498, y: 576 },
        2: { x: 0, z: -498, y: 576 }, 3: { x: 0, z: -996, y: 576 },
    });
    const sp76 = 4, y = 18 << 5;
    deepEqual(PIRANHA_STATIC_RECIPE.parts[0].jointOverrides, {
        from: { x: 0, z: 498, y: y + ((sp76 * 1000) >> 9) + ((sp76 * 1000) >> 12) },
        to: { x: 0, z: -498, y: y - ((sp76 * 3000) >> 11) - ((sp76 * 1000) >> 12) },
    });
    deepEqual(PIRANHA_STATIC_RECIPE.parts[1].jointOverrides, {
        from: { x: 0, z: 498 + ((sp76 * 1000) >> 8), y: y - ((sp76 * 1000) >> 6) - ((sp76 * 1000) >> 8) },
        to: { x: 0, z: -498 + ((sp76 * 1000) >> 8), y: y + ((sp76 * 3000) >> 8) + ((sp76 * 1000) >> 8) },
    });
    ok(PIRANHA_STATIC_RECIPE.parts.slice(2).every(p => p.jointOverrides === undefined));
});

for (const level of ["JUNGLE_JAPES", "WEIGHT_FOR_IT"] as const) {
    test(`${level} builds three PIRANHA placements with both head palettes, tail and eyes`, () => {
        const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
        const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
        const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
        const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!).filter(p => p.id === 30);
        const candidate = createPlayerPlacement(dat, parseObjects(findPayload(payloads, LevelPayloadType.Cob)!));
        const player = candidate?.id === 30 ? candidate : null;
        const segments: ArrayBufferSlice[] = [];
        segments[1] = read("data/SSSV/segments/segment1.bin");
        segments[4] = read("data/SSSV/segments/jungle_biome.bin");
        const output = new RSPSharedOutput();
        const builds = buildStaticAnimalModels(output, segments, placements, map, dat, player);
        equal(builds.filter(b => !b.isPlayer).length, 3);
        for (const b of builds) {
            equal(b.partMatrices.length, 5);
            ok(b.partMatrices.every(p => p.triangles > 0 && !p.flipsWinding));
            const textures = b.textureIds.map(id => output.textureCache.textures[id]);
            for (const [image, palette] of [[0x0400C280,0x0400C480], [0x0400C480,0x0400C6A0], [0x0400C6C0,0x0400C8C0]]) {
                const t = textures.find(t => t.dramAddr === image && t.dramPalAddr === palette);
                ok(t, `${image.toString(16)}/${palette.toString(16)}`); equal(t.width, 32); equal(t.height, 32);
            }
            const eyes = b.drawCalls.filter(d => d.animalEyeAnimation !== null);
            equal(eyes.length, 2);
            for (const eye of eyes) {
                const animation = eye.animalEyeAnimation!;
                ok(animation.kind === "texture"); equal(animation.family, "standard");
                equal(animation.textureIndices.length, 13);
                for (const [frame, id] of animation.textureIndices.entries()) {
                    const t = output.textureCache.textures[id];
                    equal(t.dramAddr, 0x01000620 + frame * 128); equal(t.dramPalAddr, 0x01000CC0);
                }
            }
            ok(b.drawCalls.some(d => d.DP_PrimColor[0] > 0.78 && d.DP_PrimColor[1] === 0 && d.DP_PrimColor[2] === 0));
        }
        const markers = createAnimalMarkers(placements, player);
        buildAnimalMarkers(output, markers, new Set(builds.map(b => b.placementIndex)));
        ok(markers.every(m => m.hasModel));
        for (const segment of [0,1,2,5]) equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, placements, map, { ...dat, segment }, player).length, 0);
    });
}
