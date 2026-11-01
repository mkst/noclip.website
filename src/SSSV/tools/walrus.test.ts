import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSP_Geometry, RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { WALRUS_STATIC_RECIPE, WALRUS_DEACTIVATED_RECIPE, getWalrusStaticRecipe } from "../animals/walrus.js";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";
import { buildStaticAnimalModels } from "../animals/animal_renderer.js";
import { buildAnimalMarkers, createAnimalMarkers, createPlayerPlacement } from "../animals/animals.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseMap, parseObjects } from "../core/level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

test("WALRUS uses flat source support and the active assembly's relocated head", () => {
    equal(getStaticAnimalRecipe({ id: 44, health: 127 }), WALRUS_STATIC_RECIPE);

    const j = WALRUS_STATIC_RECIPE.pose.sample.jointPositions;
    // B9130(574,306,765,0), C1830(765), B964C, C4A70(918,612,6),
    // then active 786A38..786ACC head relocation and front support midpoint.
    deepEqual(j[0], { x: 0, z: 0, y: 765 });
    deepEqual(j[1], { x: 0, z: 574, y: 765 });
    deepEqual(j[2], { x: 0, z: -574, y: 765 });
    deepEqual(j[19], { x: 0, z: 574, y: 1626 });
    deepEqual(j[20], { x: 0, z: 1186, y: 1626 });
    deepEqual(j[26], { x: 0, z: 574, y: 0 });
    for (const [from, to, x] of [[5,14,-306], [6,17,306]]) {
        deepEqual(j[from], { x, z: -574, y: 765 });
        deepEqual(j[to], { x, z: -574, y: 0 });
    }
    equal(WALRUS_STATIC_RECIPE.eyes, undefined);
    ok(WALRUS_STATIC_RECIPE.parts.every(p => p.scale.kind === "unit-16.16" && p.scale.value === 0x18800));
});

for (const [level, count] of [["ICE_N_EASY_DOES_IT",3], ["PENGUIN_PLAYPEN",1], ["SOMETHING_FISHY",1], ["WALRACE_64",2]] as const) {
    test(`${level} builds WALRUS placements and its entrance player`, () => {
        const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
        const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
        const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
        // Preserve authored indices for source race-slot colours, including the dead walrus.
        const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!);
        const candidate = createPlayerPlacement(dat, parseObjects(findPayload(payloads, LevelPayloadType.Cob)!));
        const player = candidate?.id === 44 ? candidate : null;
        const segments: ArrayBufferSlice[] = [];
        segments[1] = read("data/SSSV/segments/segment1.bin");
        segments[4] = read("data/SSSV/segments/ice_biome.bin");
        const output = new RSPSharedOutput();
        const builds = buildStaticAnimalModels(output, segments, placements, map, dat, player).filter(b => b.placement.id === 44);
        equal(builds.filter(b => !b.isPlayer).length, count);
        equal(builds.filter(b => b.isPlayer).length, player === null ? 0 : 1);
        for (const b of builds) {
            equal(b.recipe, getWalrusStaticRecipe(dat.textureBank, b.placementIndex, b.placement.health));
            equal(b.partMatrices.length, 8);
            ok(b.partMatrices.every(p => p.triangles > 0 && p.flipsWinding === ["right missile", "right flipper"].includes(p.name)));
            for (const p of b.partMatrices.filter(p => p.name.endsWith("flipper"))) {
                const cull = p.name.startsWith("right") ? RSP_Geometry.G_CULL_FRONT : 0;
                ok(p.geometryModes.every(mode => (mode & (RSP_Geometry.G_CULL_FRONT | RSP_Geometry.G_CULL_BACK)) === cull));
            }
            const expected = level === "WALRACE_64" && !b.isPlayer ? (b.placementIndex === 0 ? [92,170,121,255] : [200,140,0,255]) : [92,92,215,255];
            ok(b.drawCalls[0].DP_PrimColor.every((v, i) => Math.abs(v - expected[i] / 255) < 1e-6));
            ok(b.drawCalls.every(d => d.animalEyeAnimation === null));
            const texture = b.textureIds.map(id => output.textureCache.textures[id]).find(t => t.dramAddr === 0x04006BD0);
            ok(texture); equal(texture.dramPalAddr, 0x04006DE0); equal(texture.width, 32); equal(texture.height, 32);
        }
        const walrusPlacements = placements.map((p, i) => p.id === 44 ? i : -1).filter(i => i >= 0);
        const markers = createAnimalMarkers(placements, player);
        buildAnimalMarkers(output, markers, new Set(builds.map(b => b.placementIndex)));
        ok(walrusPlacements.every(i => markers[i].hasModel));
        for (const segment of [0,2,3,5]) equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, placements.filter(p => p.id === 44), map, { ...dat, segment }, player).length, 0);
    });
}

test("race palette variants do not recolour the player or ordinary levels", () => {
    equal(getWalrusStaticRecipe(4, -1), WALRUS_STATIC_RECIPE);
    equal(getWalrusStaticRecipe(4, 2), WALRUS_STATIC_RECIPE);
    equal(getWalrusStaticRecipe(0, 0), WALRUS_STATIC_RECIPE);
});

test("deactivated WALRUS uses its complete source mode-1 target", () => {
    for (const health of [0, -1]) equal(getStaticAnimalRecipe({ id: 44, health }), WALRUS_DEACTIVATED_RECIPE);
    // Original DB494 C, D_803B5028/5034/5040 topology and D_803B5054 target,
    // evaluated at full strength with core/mtx.h's degree table.
    deepEqual(Object.entries(WALRUS_DEACTIVATED_RECIPE.pose.sample.jointPositions).map(([id, p]) => [Number(id), p.x, p.z, p.y]), [
        [0,0,0,320], [1,0,574,320], [2,0,-574,320],
        [5,27,-604,622], [6,-240,-574,133], [14,762,-732,464], [17,-840,-574,-336],
        [19,-606,922,908], [20,-915,1099,414], [26,498,1128,162],
    ]);
    deepEqual(WALRUS_DEACTIVATED_RECIPE.parts, WALRUS_STATIC_RECIPE.parts);
    deepEqual(WALRUS_DEACTIVATED_RECIPE.stateChanges, WALRUS_STATIC_RECIPE.stateChanges);
    equal(WALRUS_DEACTIVATED_RECIPE.eyes, undefined);
    for (const health of [0, -1]) {
        equal(getWalrusStaticRecipe(0, 2, health), WALRUS_DEACTIVATED_RECIPE);
        equal(getWalrusStaticRecipe(4, -1, health), WALRUS_DEACTIVATED_RECIPE);
        for (const slot of [0,1]) {
            const recipe = getWalrusStaticRecipe(4, slot, health);
            equal(recipe.pose, WALRUS_DEACTIVATED_RECIPE.pose);
            deepEqual(recipe.stateChanges, getWalrusStaticRecipe(4, slot, 127).stateChanges);
        }
    }
});
