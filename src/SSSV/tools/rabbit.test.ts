import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSP_Geometry, RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { getStaticAnimalRecipe } from "../animal_contracts.js";
import { ANIMAL_EYE_ATLASES, sampleAnimalEyeFrame } from "../animal_eyes.js";
import { buildStaticAnimalModels } from "../animal_renderer.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseMap } from "../level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

test("rabbit standing support and attached ears follow source helpers and active C6FF4 assembly", () => {
    const recipe = getStaticAnimalRecipe({ id: 10, health: 127 })!, j = recipe.pose.sample.jointPositions;
    deepEqual(j[0], { x: 0, z: 0, y: 375 });
    deepEqual(j[1], { x: 0, z: 0, y: 750 }); deepEqual(j[2], { x: 0, z: 0, y: 0 });
    deepEqual(j[15], { x: -280, z: 773, y: 0 }); deepEqual(j[18], { x: 280, z: 773, y: 0 });
    deepEqual(j[19], { x: 0, z: 0, y: 1200 }); deepEqual(j[20], { x: 0, z: 300, y: 1200 });
    for (const [base, tip, x] of [[26,27,-150],[28,29,150]]) {
        // The active ASM stores joint-19 Y at offsets D4/E4, before adding ear length.
        deepEqual(j[base], { x, z: 0, y: j[19].y });
        deepEqual(j[tip], { x, z: 16, y: j[19].y + 600 - 8 });
        equal(j[tip].y - j[base].y, 592);
    }
    const heli = getStaticAnimalRecipe({ id: 11, health: 127 })!;
    equal(heli.pose.sample.jointPositions[26], undefined);
    equal(heli.parts[0].name, "rotor"); equal(heli.parts[0].address, 0x04000840);
    ok(!heli.parts.some(p => p.name.endsWith("ear")));
    for (const id of [10,11]) for (const health of [0,-1]) equal(getStaticAnimalRecipe({ id, health }), null);
});

test("rabbit eyes2 frames use the TLUT4 palette and standard asymmetric expression maps", () => {
    deepEqual(ANIMAL_EYE_ATLASES["eyes2-tlut4"], { base: 0x01000D20, palette: 0x01000D00, frames: 13 });
    equal(sampleAnimalEyeFrame(58, "eyes2-tlut4", "left"), 12);
    equal(sampleAnimalEyeFrame(971, "eyes2-tlut4", "left"), 3);
    equal(sampleAnimalEyeFrame(971, "eyes2-tlut4", "right"), 4);
    equal(sampleAnimalEyeFrame(1001, "eyes2-tlut4", "left"), 4);
    equal(sampleAnimalEyeFrame(1001, "eyes2-tlut4", "right"), 3);
});

for (const [level, rabbits, helicopters] of [["SNOW_JOKE",1,0],["ICE_N_EASY_DOES_IT",3,1],["HOPPA_CHOPPA",7,2]] as const) {
    test(`${level} renders every authored rabbit with source eye atlases and unculled mirrored appendages`, () => {
        const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
        const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
        const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
        const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!).filter(p => p.id === 10 || p.id === 11);
        const segments: ArrayBufferSlice[] = [];
        segments[1] = read("data/SSSV/segments/segment1.bin"); segments[4] = read("data/SSSV/segments/ice_biome.bin");
        const output = new RSPSharedOutput(), models = buildStaticAnimalModels(output, segments, placements, map, dat);
        equal(models.filter(m => m.placement.id === 10).length, rabbits);
        equal(models.filter(m => m.placement.id === 11).length, helicopters);
        equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, placements, map, { ...dat, segment: 0 }).length, 0);
        for (const model of models) {
            equal(model.partMatrices.length, model.placement.id === 10 ? 9 : 8);
            equal(model.tail, null); equal(model.wool, null);
            for (const p of model.partMatrices) {
                ok(p.triangles > 0);
                equal(p.flipsWinding, p.name === "right foot" || p.name === "right ear" || p.name === "head" || p.name.endsWith("eye"));
                if (p.name.endsWith("foot") || p.name.endsWith("ear") || p.name === "rotor")
                    ok(p.geometryModes.every(mode => (mode & (RSP_Geometry.G_CULL_FRONT | RSP_Geometry.G_CULL_BACK)) === 0));
            }
            const eyes = model.drawCalls.filter(d => d.animalEyeAnimation !== null);
            equal(eyes.length, 2);
            for (const draw of eyes) {
                const eye = draw.animalEyeAnimation!; ok(eye.kind === "texture"); equal(eye.family, "eyes2-tlut4");
                equal(eye.textureIndices.length, 13);
                eye.textureIndices.forEach((id, frame) => {
                    const t = output.textureCache.textures[id];
                    equal(t.dramAddr, 0x01000D20 + frame * 128); equal(t.dramPalAddr, 0x01000D00);
                    equal(t.width, 16); equal(t.height, 16);
                });
            }
            ok(model.textureIds.every(id => { const t = output.textureCache.textures[id]; return t.dramAddr >= 0x01000D20 && t.dramAddr < 0x010013A0; }));
        }
    });
}
