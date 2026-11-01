import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { HYENA_STATIC_RECIPE } from "../animals/hyena.js";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";
import { buildStaticAnimalModels } from "../animals/animal_renderer.js";
import { buildAnimalMarkers, createAnimalMarkers, createPlayerPlacement } from "../animals/animals.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseMap, parseObjects } from "../core/level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

test("HYENA standing joints follow its unequal leg lengths, integer support and pitched head", () => {
    // /tmp/sssv-hyena-ref.c executes BEAB0, B964C, C4A70 and C56D0 at state 2.
    const j = HYENA_STATIC_RECIPE.pose.sample.jointPositions;
    equal(getStaticAnimalRecipe({ id: 57, health: 127 }), HYENA_STATIC_RECIPE);
    for (const health of [0,-1]) equal(getStaticAnimalRecipe({ id: 57, health }), null);
    deepEqual(j[0], { x: 0, z: 0, y: 832 });
    deepEqual(j[1], { x: 0, z: 475, y: 1127 }); deepEqual(j[2], { x: 0, z: -475, y: 1127 });
    for (const [hip, knee, ankle, foot, x, z, kneeY] of [[3,7,8,9,-296,475,593],[4,10,11,12,296,475,593],[5,13,14,15,-296,-475,474],[6,16,17,18,296,-475,474]]) {
        deepEqual(j[hip], { x, z, y: 1127 }); deepEqual(j[knee], { x, z, y: kneeY });
        deepEqual(j[ankle], { x, z, y: 237 }); deepEqual(j[foot], { x, z, y: 0 });
    }
    deepEqual(j[19], { x: 0, z: 1161, y: 1297 }); deepEqual(j[20], { x: 0, z: 1636, y: 1297 });
    deepEqual(HYENA_STATIC_RECIPE.parts.find(p => p.name === "jaw")!.jointOverrides!.to, { x: 0, z: 1636, y: 1253 });
    ok(HYENA_STATIC_RECIPE.parts.every(p => p.scale.kind === "unit-16.16" && p.scale.value === 0x13000));
});

for (const [level, count, hasPlayer] of [["JUNGLE_JAPES",2,false],["SWAMP_OF_ETERNAL_STENCH",2,false],["WEIGHT_FOR_IT",2,false],["JUNGLE_DOLDRUMS",0,true]] as const) {
    test(`${level} builds HYENA placements/player using the jungle bank and source eye palette`, () => {
        const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
        const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
        const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
        const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!).filter(p => p.id === 57);
        const candidate = createPlayerPlacement(dat, parseObjects(findPayload(payloads, LevelPayloadType.Cob)!));
        const player = candidate?.id === 57 ? candidate : null;
        const segments: ArrayBufferSlice[] = [];
        segments[1] = read("data/SSSV/segments/segment1.bin"); segments[4] = read("data/SSSV/segments/jungle_biome.bin");
        const output = new RSPSharedOutput(), builds = buildStaticAnimalModels(output, segments, placements, map, dat, player);
        equal(player !== null, hasPlayer);
        equal(builds.length, count + (hasPlayer ? 1 : 0));
        for (const b of builds) {
            equal(b.partMatrices.length, 20); equal(b.tail, null); equal(b.wool, null);
            ok(b.partMatrices.every(p => p.triangles > 0 && p.flipsWinding === (p.name.includes("right") && !p.name.endsWith("eye"))));
            const texture = b.textureIds.map(id => output.textureCache.textures[id]).find(t => t.dramAddr === 0x04007780)!;
            ok(texture); equal(texture.dramPalAddr, 0x04007980); equal(texture.width, 32); equal(texture.height, 32);
            const eyes = b.drawCalls.filter(d => d.animalEyeAnimation !== null); equal(eyes.length, 2);
            for (const draw of eyes) {
                const eye = draw.animalEyeAnimation!; ok(eye.kind === "texture"); equal(eye.family, "eyes6"); equal(eye.textureIndices.length, 13);
                eye.textureIndices.forEach((id, frame) => { const t = output.textureCache.textures[id]; equal(t.dramAddr, 0x010025A0 + frame * 128); equal(t.dramPalAddr, 0x01002C40); });
            }
        }
        const markers = createAnimalMarkers(placements, player);
        buildAnimalMarkers(output, markers, new Set(builds.map(b => b.placementIndex)));
        ok(markers.every(m => m.hasModel));
        for (const segment of [0,1,2]) equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, placements, map, { ...dat, segment }).length, 0);
    });
}
