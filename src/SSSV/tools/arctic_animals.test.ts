import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";
import { buildStaticAnimalModels } from "../animals/animal_renderer.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseMap } from "../core/level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

function build(id: number) {
    const payloads = parseLevelContainer(read("data/SSSV/levels/SNOW_JOKE.bin"));
    const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const placement = { ...parseAnimals(findPayload(payloads, LevelPayloadType.Can)!)[2], id, health: 127 };
    const segments: ArrayBufferSlice[] = [];
    segments[1] = read("data/SSSV/segments/segment1.bin"); segments[4] = read("data/SSSV/segments/ice_biome.bin");
    const output = new RSPSharedOutput();
    const models = buildStaticAnimalModels(output, segments, [placement], map, dat);
    equal(models.length, 1);
    equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, [placement], map, { ...dat, segment: 0 }).length, 0);
    return { model: models[0], output };
}

test("arctic variants retain distinct source support and head samples", () => {
    for (const id of [38,39,41,42]) {
        equal(getStaticAnimalRecipe({ id, health: 0 }), null);
        equal(getStaticAnimalRecipe({ id, health: -1 }), null);
    }
    // /tmp/sssv-arctic-ref.c evaluates the original rigid-leg, support, head and tail helpers.
    const ski = getStaticAnimalRecipe({ id: 42, health: 127 })!.pose.sample.jointPositions;
    deepEqual(ski[26], { x: 0, z: -492, y: 1011 });
    equal(ski[3].y - ski[8].y, 765);
    const crazy = getStaticAnimalRecipe({ id: 41, health: 127 })!;
    deepEqual(crazy.pose.sample.jointPositions[26], { x: 0, z: -460, y: 1042 });
    equal(crazy.pose.sample.jointPositions[20].y, 745);
    equal(crazy.parts.find(p => p.name === "skull")!.jointOverrides!.to!.y, 736);
    const bear = getStaticAnimalRecipe({ id: 38, health: 127 })!.pose.sample.jointPositions;
    equal(bear[3].y - bear[7].y, 836); equal(bear[7].y, -47);
    const tank = getStaticAnimalRecipe({ id: 39, health: 127 })!.pose.sample.jointPositions;
    equal(tank[3].x, -537); equal(tank[8].y, 0); equal(tank[19].z, 597);
});

for (const [id, species, parts] of [[42,"SKI_HUSKY",16],[41,"CRAZY_HUSKY",17],[38,"POLAR_BEAR",8],[39,"POLAR_TANK",8]] as const) {
    test(`${species} assembles source meshes, materials, eye frames and bank selection`, () => {
        const { model, output } = build(id);
        equal(model.recipe.species, species); equal(model.partMatrices.length, parts);
        ok(model.partMatrices.every(p => p.triangles > 0));
        const textures = model.textureIds.map(id => output.textureCache.textures[id]);
        const eyes = model.drawCalls.filter(d => d.animalEyeAnimation !== null);
        equal(eyes.length, 2);
        for (const draw of eyes) {
            const eye = draw.animalEyeAnimation!; ok(eye.kind === "texture"); equal(eye.textureIndices.length, 9);
            for (const index of eye.textureIndices) equal(output.textureCache.textures[index].dramPalAddr, id >= 40 ? 0x01000CC0 : 0x01000CA0);
        }
        if (id >= 40) {
            equal(model.tail!.vertexCount, 18);
            equal(model.tail!.simulation.kind, id === 41 ? "crazy-husky" : "husky");
            deepEqual(model.drawCalls.slice(-3).map(d => d.indexCount), [24,24,24]);
        } else equal(model.tail, null);
        if (id === 39) {
            for (const [address, palette, width, height] of [[0x0103AA20,0x0103AC20,32,32],[0x0103AC40,0x0103B440,64,32],[0x0103B040,0x0103B440,64,32]])
                ok(textures.some(t => t.dramAddr === address && t.dramPalAddr === palette && t.width === width && t.height === height), `missing tank tile ${address.toString(16)}`);
        }
    });
}
