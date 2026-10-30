import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSP_Geometry, RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { TexCM } from "../../Common/N64/Image.js";
import { RACING_TORTOISE_STATIC_RECIPE } from "../animals/racing_tortoise.js";
import { HYENA_BIKER_STATIC_RECIPE } from "../animals/hyena_biker.js";
import { getStaticAnimalRecipe } from "../animal_contracts.js";
import { buildStaticAnimalModels } from "../animal_renderer.js";
import { buildAnimalMarkers, createAnimalMarkers, createPlayerPlacement } from "../animals.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat, parseMap, parseObjects } from "../level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));
function fixture(level: string) {
    const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
    const dat = parseLevelDat(findPayload(payloads, LevelPayloadType.Dat)!);
    const map = parseMap(findPayload(payloads, LevelPayloadType.Map)!);
    const placements = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!);
    const player = createPlayerPlacement(dat, parseObjects(findPayload(payloads, LevelPayloadType.Cob)!));
    const segments: ArrayBufferSlice[] = [];
    segments[1] = read("data/SSSV/segments/segment1.bin"); segments[4] = read("data/SSSV/segments/jungle_biome.bin");
    return { dat, map, placements, player, segments };
}

test("wheeled variants retain their own source supports, raised rear wheels and centered bike wheels", () => {
    // /tmp/sssv-wheeled-variants-ref.c: C19CC/B964C plus the species head chains.
    const tort = RACING_TORTOISE_STATIC_RECIPE, bike = HYENA_BIKER_STATIC_RECIPE;
    equal(getStaticAnimalRecipe({id:28,health:127}),tort); equal(getStaticAnimalRecipe({id:58,health:127}),bike);
    for(const id of [28,58])for(const health of [0,-1])equal(getStaticAnimalRecipe({id,health}),null);
    const t=tort.pose.sample.jointPositions,b=bike.pose.sample.jointPositions;
    deepEqual(t[0],{x:0,z:0,y:633});deepEqual(t[1],{x:0,z:453,y:498});deepEqual(t[2],{x:0,z:-453,y:769});
    equal(t[7].y,362);equal(t[13].y,634);deepEqual(t[20],{x:0,z:815,y:679});
    deepEqual(b[0],{x:0,z:0,y:1395});deepEqual(b[19],{x:0,z:1161,y:1713});deepEqual(b[20],{x:0,z:1636,y:1713});
    for(const i of [7,8,13,14])equal(b[i].x,0);
    equal(b[7].y,1543);equal(b[8].y,0);equal(b[14].y,0);
    equal(bike.parts.find(p=>p.name==="jaw")!.jointOverrides!.to!.y,1669);
});

for(const level of ["SWAMP_OF_ETERNAL_STENCH","JUNGLE_JUMPS"])test(`${level} RACING_TORTOISE player has all meshes and clamped wheel faces`,()=>{
    const {dat,map,player,segments}=fixture(level);ok(player);equal(player.id,28);
    const output=new RSPSharedOutput(),models=buildStaticAnimalModels(output,segments,[],map,dat,player);
    equal(models.length,1);const model=models[0];ok(model.isPlayer);equal(model.partMatrices.length,9);
    ok(model.drawCalls.every(d=>d.animalEyeAnimation===null));
    const textures=model.textureIds.map(id=>output.textureCache.textures[id]);
    const wheel=textures.find(t=>t.dramAddr===0x04003E70)!;ok(wheel);equal(wheel.dramPalAddr,0x04004070);
    equal(wheel.tile.cms,TexCM.CLAMP);equal(wheel.tile.cmt,TexCM.CLAMP);
    const body=textures.find(t=>t.dramAddr===0x04003850)!;ok(body);equal(body.tile.cms,TexCM.WRAP);equal(body.tile.cmt,TexCM.WRAP);
    const detail=model.partMatrices.find(p=>p.name==="head detail")!;ok(detail.geometryModes.every(mode=>(mode&(RSP_Geometry.G_CULL_FRONT|RSP_Geometry.G_CULL_BACK))===0));
    for(const p of model.recipe.parts.filter(p=>p.name.startsWith("rear")&&p.name.endsWith("wheel")))deepEqual(p.scale,{kind:"unit-16.16",value:0x12200});
    const markers=createAnimalMarkers([],player);buildAnimalMarkers(output,markers,new Set([-1]));equal(markers[0].hasModel,true);
    equal(buildStaticAnimalModels(new RSPSharedOutput(),segments,[],map,{...dat,segment:1},player).length,0);
});

test("HYENA_BIKER preview assembles two wheels, fork, charged missiles, exhausts and blinking eyes",()=>{
    const {dat,map,placements,segments}=fixture("JUNGLE_JAPES");
    const source=placements.find(p=>p.id===57)!;ok(source);
    const output=new RSPSharedOutput(),models=buildStaticAnimalModels(output,segments,[{...source,id:58}],map,dat);
    equal(models.length,1);const model=models[0];equal(model.partMatrices.length,15);
    ok(model.partMatrices.every(p=>p.triangles>0&&p.flipsWinding===(p.name==="right missile"||p.name==="right exhaust")));
    const textures=model.textureIds.map(id=>output.textureCache.textures[id]);
    for(const [address,palette]of[[0x04007780,0x04007980],[0x04008340,0x04008540],[0x04008120,0x04008320]])ok(textures.some(t=>t.dramAddr===address&&t.dramPalAddr===palette));
    const eyes=model.drawCalls.filter(d=>d.animalEyeAnimation!==null);equal(eyes.length,2);
    for(const draw of eyes){const eye=draw.animalEyeAnimation!;ok(eye.kind==="texture");equal(eye.family,"eyes6");equal(eye.textureIndices.length,13);}
    equal(model.tail,null);equal(model.wool,null);
    equal(buildStaticAnimalModels(new RSPSharedOutput(),segments,[{...source,id:58}],map,{...dat,segment:0}).length,0);
});
