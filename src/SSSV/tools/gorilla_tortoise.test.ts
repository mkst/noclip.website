import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { GORILLA_STATIC_RECIPE } from "../animals/gorilla.js";
import { TORTOISE_TANK_STATIC_RECIPE } from "../animals/tortoise_tank.js";
import { getStaticAnimalRecipe } from "../animal_contracts.js";
import { buildStaticAnimalModels } from "../animal_renderer.js";
import { createPlayerPlacement } from "../animals.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseMap, parseObjects } from "../level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));
function fixture(level: string, id: number) {
    const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
    const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!).filter(p => p.id === id);
    const candidate = createPlayerPlacement(dat, parseObjects(findPayload(payloads, LevelPayloadType.Cob)!));
    const player = candidate?.id === id ? candidate : null;
    const segments: ArrayBufferSlice[] = [];
    segments[1] = read("data/SSSV/segments/segment1.bin"); segments[4] = read("data/SSSV/segments/jungle_biome.bin");
    return { dat, map, placements, player, segments };
}

test("GORILLA standing samples retain source foot correction, straight arms and mode-7 head", () => {
    // /tmp/sssv-gorilla-ref.c: B9D20, C3188, 321224, C4A70, flat state 2.
    const j = GORILLA_STATIC_RECIPE.pose.sample.jointPositions;
    deepEqual(j[0], { x: 0, z: 0, y: 1442 }); deepEqual(j[1], { x: 0, z: 0, y: 2344 });
    deepEqual(j[2], { x: 0, z: 0, y: 540 });
    for (const [shoulder, elbow, hand, hip, ankle, foot, sign] of [[3,7,8,5,13,14,-1],[4,10,11,6,16,17,1]]) {
        deepEqual(j[shoulder], { x: sign*902, z: 0, y: 2344 });
        deepEqual(j[elbow], { x: sign*902, z: 0, y: 1446 }); deepEqual(j[hand], { x: sign*902, z: 0, y: 548 });
        deepEqual(j[hip], { x: sign*481, z: 0, y: 718 }); deepEqual(j[ankle], { x: sign*481, z: 0, y: 0 }); deepEqual(j[foot], { x: sign*481, z: 718, y: 0 });
    }
    deepEqual(j[19], { x: 0, z: 0, y: 2464 }); deepEqual(j[20], { x: 0, z: 721, y: 2464 });
    ok(GORILLA_STATIC_RECIPE.parts.every(p => p.scale.kind === "unit-16.16" && p.scale.value === 0x26800));
});

test("TORTOISE_TANK preserves unrotated shell support and quantized head attachments", () => {
    const recipe = TORTOISE_TANK_STATIC_RECIPE, j = recipe.pose.sample.jointPositions;
    deepEqual(j[1], { x: 0, z: 453, y: 498 }); deepEqual(j[2], { x: 0, z: -453, y: 498 });
    // /tmp/sssv-tortoise-tank-ref.c: first 032DC(0) around temporarily raised pivot Y=781.
    deepEqual(j[26], { x: 0, z: 451, y: 499 }); deepEqual(j[27], { x: 0, z: -452, y: 499 });
    const neck = recipe.parts.find(p => p.name === "neck")!;
    deepEqual(neck.jointOverrides, { from: j[27], to: j[26] });
    for (const name of ["right tread","right track panels"]) equal(recipe.parts.find(p => p.name === name)!.mirror, 0);
    for (const id of [27,54]) for (const health of [0,-1]) equal(getStaticAnimalRecipe({ id, health }), null);
    for (const id of [29,65]) equal(getStaticAnimalRecipe({ id, health: 127 }), null);
});

for (const [level,count] of [["SWAMP_OF_ETERNAL_STENCH",2],["WEIGHT_FOR_IT",1],["JUNGLE_JUMPS",2]] as const) {
    test(`${level} builds its GORILLA models with all hand details and eyes6 frames`, () => {
        const { dat, map, placements, player, segments } = fixture(level,54);
        const output = new RSPSharedOutput(), models = buildStaticAnimalModels(output,segments,placements,map,dat,player);
        equal(models.filter(m => !m.isPlayer).length,count);
        for (const model of models) {
            equal(model.partMatrices.length,18); equal(model.tail,null); equal(model.wool,null);
            ok(model.partMatrices.every(p => p.triangles > 0 && p.flipsWinding === (p.name.startsWith("right") && !p.name.endsWith("eye"))));
            const eyes=model.drawCalls.filter(d=>d.animalEyeAnimation!==null);equal(eyes.length,2);
            for (const d of eyes) {const e=d.animalEyeAnimation!;ok(e.kind==="texture");equal(e.family,"eyes6");equal(e.textureIndices.length,13);}
            ok(model.textureIds.every(id=>{const t=output.textureCache.textures[id];return t.dramAddr>=0x010025A0&&t.dramAddr<0x01002C20&&t.dramPalAddr===0x01002C40;}));
        }
        equal(buildStaticAnimalModels(new RSPSharedOutput(),segments,placements,map,{...dat,segment:1}).length,0);
    });
}

for (const level of ["JUNGLE_DOLDRUMS", "JUNGLE_JAPES"]) test(`${level} TORTOISE_TANK builds nine parts and both track panel regions`, () => {
    const {dat,map,placements,player,segments}=fixture(level,27);
    const output=new RSPSharedOutput(),models=buildStaticAnimalModels(output,segments,placements,map,dat,player);
    equal(models.length,1);equal(models[0].recipe,TORTOISE_TANK_STATIC_RECIPE);
    equal(models[0].isPlayer,level==="JUNGLE_JAPES");
    const model=models[0];equal(model.partMatrices.length,9);ok(model.partMatrices.every(p=>p.triangles>0&&p.flipsWinding===(p.name==="right shell")));
    ok(model.drawCalls.every(d=>d.animalEyeAnimation===null));equal(model.tail,null);
    const textures=model.textureIds.map(id=>output.textureCache.textures[id]);
    for(const [address,palette,width,height] of [[0x04003850,0x04003A50,32,32],[0x0103AA20,0x0103AC20,32,32],[0x0103AC40,0x0103B440,64,32],[0x0103B040,0x0103B440,64,32]])
        ok(textures.some(t=>t.dramAddr===address&&t.dramPalAddr===palette&&t.width===width&&t.height===height),`missing tank texture ${address.toString(16)}`);
    equal(buildStaticAnimalModels(new RSPSharedOutput(),segments,placements,map,{...dat,segment:0}).length,0);
});
