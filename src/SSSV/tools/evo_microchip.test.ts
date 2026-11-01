import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSP_Geometry, RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { EVO_MICROCHIP_STATIC_RECIPE } from "../animals/evo_microchip.js";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";
import { buildStaticAnimalModels } from "../animals/animal_renderer.js";
import { findPayload, LevelPayloadType, MAP_X_POINTS, MAP_Z_POINTS, parseLevelContainer, parseLevelDat } from "../core/level.js";

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

test("EVO_MICROCHIP holds state-2 flat support with eight straight pins", () => {
    equal(getStaticAnimalRecipe({ id: 61, health: 127 }), EVO_MICROCHIP_STATIC_RECIPE);
    for (const health of [0, -1]) equal(getStaticAnimalRecipe({ id: 61, health }), null);
    for (const id of [62, 63, 67]) equal(getStaticAnimalRecipe({ id, health: 127 }), null);
    const j = EVO_MICROCHIP_STATIC_RECIPE.pose.sample.jointPositions;
    deepEqual(j[0], { x: 0, z: 0, y: 117 });
    deepEqual(j[1], { x: 0, z: 156, y: 117 });
    deepEqual(j[2], { x: 0, z: -156, y: 117 });
    // B9130(156,87,156,39), third-point interpolation, C13E4 at zero phase.
    for (const [from, to, x, z] of [[3,7,-87,156], [8,9,-87,52], [14,15,-87,-52], [5,13,-87,-156],
        [4,10,87,156], [11,12,87,52], [17,18,87,-52], [6,16,87,-156]]) {
        deepEqual(j[from], { x, z, y: 117 });
        deepEqual(j[to], { x, z, y: -39 });
    }
    ok(EVO_MICROCHIP_STATIC_RECIPE.parts.every(p => p.segment === 1 && p.scale.kind === "unit-16.16" && p.scale.value === 25 * 1024));
});

test("shared microchip builds in every bank with metallic body, mirrored pins and blinking eyes", () => {
    const segments: ArrayBufferSlice[] = [];
    segments[1] = read("data/SSSV/segments/segment1.bin");
    const map = Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({ unk0: 0, unk1: 0, unk2: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0, unk7: 0 }));
    const dat = parseLevelDat(findPayload(parseLevelContainer(read("data/SSSV/levels/HONEYMOON_LAGOON.bin")), LevelPayloadType.Dat)!);
    const placement = { id: 61, x: 1000, z: 1000, y: 100, rotation: 0, health: 127, unkC: 0, unkE: 0 };
    for (const [segment, bank] of ["europe", "ice", "desert", "jungle", "city", "city"].entries()) {
        // Only segment 1 is addressed; use a valid buffer for the renderer's biome input.
        segments[4] = segments[1];
        const output = new RSPSharedOutput();
        const builds = buildStaticAnimalModels(output, segments, [placement], map, { ...dat, segment });
        equal(builds.length, 1, bank);
        const build = builds[0];
        equal(build.partMatrices.length, 11);
        ok(build.partMatrices.every(p => p.triangles > 0 && p.flipsWinding === p.name.includes("right pin")));
        const body = build.drawCalls[0];
        equal(body.textureGen, true);
        ok((body.SP_GeometryMode & RSP_Geometry.G_TEXTURE_GEN) !== 0);
        const texture = output.textureCache.textures[body.textureIndices[0]];
        equal(texture.dramAddr, 0x01037290); equal(texture.width, 32); equal(texture.height, 32);
        ok(body.DP_PrimColor.every((v, i) => Math.abs(v - (i === 3 ? 1 : 20 / 255)) < 1e-6));
        ok(build.drawCalls.slice(1).every(d => !d.textureGen));
        const eyes = build.drawCalls.filter(d => d.animalEyeAnimation !== null);
        equal(eyes.length, 2);
        for (const eye of eyes) {
            const animation = eye.animalEyeAnimation!;
            ok(animation.kind === "texture"); equal(animation.family, "standard");
            equal(animation.textureIndices.length, 13);
            for (const [frame, id] of animation.textureIndices.entries()) {
                const t = output.textureCache.textures[id];
                equal(t.dramAddr, 0x01000620 + 128 * frame); equal(t.dramPalAddr, 0x01000CC0);
            }
        }
        // Ordinary biome-specific recipes must retain their bank gate.
        if (segment !== 0) equal(buildStaticAnimalModels(new RSPSharedOutput(), segments, [{ ...placement, id: 22 }], map, { ...dat, segment }).length, 0);
    }
});
