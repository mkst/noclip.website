import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSP_Geometry, RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { PENGUIN_STATIC_RECIPE, KING_PENGUIN_STATIC_RECIPE, KING_PENGUIN_DEACTIVATED_RECIPE } from "../animals/penguin.js";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";
import { buildStaticAnimalModels } from "../animals/animal_renderer.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseLevelDat, parseMap, parseAnimals } from "../core/level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

function fixture() {
    const payloads = parseLevelContainer(read("data/SSSV/levels/SNOW_JOKE.bin"));
    const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const placement = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!).find(p => p.id === 37)!;
    const segments: ArrayBufferSlice[] = [];
    segments[1] = read("data/SSSV/segments/segment1.bin");
    segments[4] = read("data/SSSV/segments/ice_biome.bin");
    return { dat, map, placement, segments };
}

test("PENGUIN neutral joints match the standing C helpers and retain its own bank", () => {
    // /tmp/sssv-penguin-ref.c: unmodified B975C(150,1) and C287C(125,+/-25),
    // state 2, zero terrain deltas, no attack offset or ambient limb gestures.
    deepEqual(PENGUIN_STATIC_RECIPE.pose.sample.jointPositions, {
        0: { x: 0, z: 0, y: 150 },
        1: { x: 0, z: 0, y: 300 }, 2: { x: 0, z: 0, y: 0 },
        15: { x: -52, z: 113, y: 0 }, 18: { x: 52, z: 113, y: 0 },
    });
    equal(getStaticAnimalRecipe({ id: 37, health: 127 }), PENGUIN_STATIC_RECIPE);
    equal(PENGUIN_STATIC_RECIPE.biomeSegment, 1);
    for (const health of [0, -1]) equal(getStaticAnimalRecipe({ id: 37, health }), null);
    equal(getStaticAnimalRecipe({ id: 64, health: 127 }), KING_PENGUIN_STATIC_RECIPE);
    deepEqual(PENGUIN_STATIC_RECIPE.parts.map(p => [p.joints.from, p.joints.to, p.mirror, p.orientationMode]), [
        [1, 2, 0, 1], [1, 2, 0, 1], [2, 15, 0, 0], [2, 18, 1, 0],
    ]);
});

test("PENGUIN replays both source texture regions and lit yellow beak/feet", () => {
    const { dat, map, placement, segments } = fixture();
    const output = new RSPSharedOutput();
    const [build] = buildStaticAnimalModels(output, segments, [placement], map, dat);
    equal(build.partMatrices.length, 4);
    ok(build.partMatrices.every(p => p.triangles > 0));
    const textures = build.textureIds.map(id => output.textureCache.textures[id]);
    deepEqual(textures.map(t => [t.dramAddr, t.dramPalAddr, t.width, t.height]), [
        [0x04001330, 0x04001730, 32, 32], [0x04001530, 0x04001750, 32, 32],
    ]);
    ok(build.drawCalls.every(d => (d.SP_GeometryMode & RSP_Geometry.G_LIGHTING) !== 0 && d.animalEyeAnimation === null));
    let offset = 0;
    for (const part of build.partMatrices) {
        const draws = build.drawCalls.slice(offset, offset + part.drawCalls); offset += part.drawCalls;
        if (part.name === "body") ok(draws.every(d => d.SP_TextureState.s === 0.5 && d.SP_TextureState.t === 0.5));
        else ok(draws.every(d => d.DP_PrimColor[0] === 1 && d.DP_PrimColor[1] === 1 && d.DP_PrimColor[2] === 0));
        equal(part.flipsWinding, part.name === "right foot");
    }
    ok(output.vertices.every(v => [v.x, v.y, v.z, v.c0, v.c1, v.c2].every(Number.isFinite)));
});

test("animal recipes cannot interpret segment 4 geometry from the wrong biome", () => {
    const { dat, map, placement, segments } = fixture();
    equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, [placement], map, { ...dat, segment: 0 }).length, 0);
    equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, [{ ...placement, id: 31 }], map, dat).length, 0);
});

test("KING_PENGUIN uses source scale-2 joint spacing, outer scale and crown state", () => {
    // /tmp/sssv-king-penguin-ref.c: B975C(300,1), C287C(203,+/-25), state 2.
    deepEqual(KING_PENGUIN_STATIC_RECIPE.pose.sample.jointPositions, {
        0: { x: 0, z: 0, y: 300 },
        1: { x: 0, z: 0, y: 600 }, 2: { x: 0, z: 0, y: 0 },
        15: { x: -85, z: 183, y: 0 }, 18: { x: 85, z: 183, y: 0 },
    });
    deepEqual(KING_PENGUIN_STATIC_RECIPE.pose.sample.scaleInputs.outerMatrixAxis16_16, [0x8000, 0x8000, 0x8000]);
    for (const health of [0,-1]) equal(getStaticAnimalRecipe({ id: 64, health }), KING_PENGUIN_DEACTIVATED_RECIPE);
    const { segments } = fixture();
    const payloads = parseLevelContainer(read("data/SSSV/levels/PINBALL_BLIZZARD.bin"));
    const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!).filter(p => p.id === 64);
    const output = new RSPSharedOutput(), models = buildStaticAnimalModels(output, segments, placements, map, dat);
    equal(models.length, 1);
    const build = models[0]; equal(build.partMatrices.length, 5);
    equal(build.tail, null); equal(build.wool, null);
    deepEqual(build.recipe.parts.map(p => p.name), ["body","beak","crown","left foot","right foot"]);
    let offset = 0;
    for (const p of build.partMatrices) {
        const draws = build.drawCalls.slice(offset, offset + p.drawCalls); offset += p.drawCalls;
        equal(p.flipsWinding, p.name === "right foot");
        if (p.name === "crown") {
            equal(p.triangles, 18);
            ok(draws.every(d => (d.SP_GeometryMode & RSP_Geometry.G_LIGHTING) !== 0 && (d.SP_GeometryMode & (RSP_Geometry.G_CULL_BACK | RSP_Geometry.G_CULL_FRONT)) === 0));
            ok(draws.every(d => d.DP_PrimColor[0] === 1 && d.DP_PrimColor[1] === 1 && d.DP_PrimColor[2] === 0));
        } else ok(draws.every(d => (d.SP_GeometryMode & RSP_Geometry.G_LIGHTING) !== 0));
    }
    deepEqual(build.textureIds.map(id => {const t=output.textureCache.textures[id];return [t.dramAddr,t.dramPalAddr];}), [[0x04001330,0x04001730],[0x04001530,0x04001750]]);
    equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, placements, map, { ...dat, segment: 0 }).length, 0);
});


test("deactivated KING_PENGUIN uses the full source pose at HOPPA_CHOPPA's zero-health placement", () => {
    // /tmp/sssv-king-penguin-deactivated-ref.c: DB670/DB494, blend mode 1, weight 32.
    const recipe = KING_PENGUIN_DEACTIVATED_RECIPE;
    deepEqual(recipe.pose.sample.jointPositions, {
        0: { x: 0, z: 0, y: 90 },
        1: { x: -143, z: 25, y: 59 }, 2: { x: 148, z: 0, y: 105 },
        15: { x: 83, z: 230, y: 37 }, 18: { x: 247, z: 13, y: 332 },
    });
    equal(recipe.parts, KING_PENGUIN_STATIC_RECIPE.parts);
    equal(recipe.stateChanges, KING_PENGUIN_STATIC_RECIPE.stateChanges);
    deepEqual(recipe.pose.sample.scaleInputs.outerMatrixAxis16_16, [0x8000,0x8000,0x8000]);
    const { segments } = fixture();
    const payloads = parseLevelContainer(read("data/SSSV/levels/HOPPA_CHOPPA.bin"));
    const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const placement = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!)[0];
    equal(placement.id, 64); equal(placement.health, 0);
    const output = new RSPSharedOutput(), models = buildStaticAnimalModels(output, segments, [placement], map, dat);
    equal(models.length, 1);
    const model = models[0]; equal(model.recipe, recipe); equal(model.placementIndex, 0);
    equal(model.partMatrices.length, 5);
    ok(model.partMatrices.every(p => p.triangles > 0 && p.flipsWinding === (p.name === "right foot")));
    ok(model.drawCalls.every(d => d.animalEyeAnimation === null));
    deepEqual(model.textureIds.map(id => { const t=output.textureCache.textures[id]; return [t.dramAddr,t.dramPalAddr]; }), [[0x04001330,0x04001730],[0x04001530,0x04001750]]);
    ok(output.vertices.every(v => [v.x,v.y,v.z,v.c0,v.c1,v.c2].every(Number.isFinite)));
    const negative = buildStaticAnimalModels(new RSPSharedOutput(), segments, [{ ...placement, health: -1 }], map, dat);
    equal(negative[0].recipe, recipe);
});
