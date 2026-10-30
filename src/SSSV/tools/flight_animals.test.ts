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
import { buildStaticAnimalModels } from "../animal_renderer.js";
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
    return { output, builds: buildStaticAnimalModels(output, segments, placements, map, dat) };
}

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
