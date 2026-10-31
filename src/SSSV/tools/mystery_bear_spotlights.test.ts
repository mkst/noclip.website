import { deepEqual, equal, ok } from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import * as RDP from "../../Common/N64/RDP.js";
import { MAP_X_POINTS, MAP_Z_POINTS } from "../level.js";
import type { LevelMapEntry } from "../level.js";
import { buildMysteryBearSpotlights, projectMysteryBearSpotlight, sampleMysteryBearSpotlights, SPOTLIGHT_VERTEX_CAPACITY, updateMysteryBearSpotlights } from "../mystery_bear_spotlights.js";
import { parseI4Texture } from "../texture.js";

const placement = { id: 24, x: 1024, z: 1536, y: 80, rotation: 0, health: 127, unkC: 0, unkE: 0 };
const spot = { x: placement.x, z: placement.z, height: 336, color: [1, 0, 1] as [number, number, number] };
function flatMap(): LevelMapEntry[] {
    return Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({ unk0: 10, unk1: 30, unk2: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0, unk7: 0 }));
}

test("spotlight centers retain signed source shifts, colours and the complete tick period", () => {
    let samples = "";
    for (let tick = 0; tick < 256; tick++) {
        const [pink, cyan] = sampleMysteryBearSpotlights(placement, placement.y, tick);
        samples += `${pink.x - placement.x},${pink.z - placement.z},${cyan.x - placement.x},${cyan.z - placement.z}\n`;
        equal(pink.height, 336);
        deepEqual(pink.color, [1, 0, 1]); deepEqual(cyan.color, [0, 1, 1]);
        deepEqual(sampleMysteryBearSpotlights(placement, placement.y, tick + 256), [pink, cyan]);
    }
    equal(createHash("sha256").update(samples).digest("hex"), "553a91be157baf9280055ea5507ac83f564d1b4da9cb44085655e36fcd70528e");
});

test("projection clips the source footprint to map cells and preserves height, alpha and half-scale UVs", () => {
    const vertices = projectMysteryBearSpotlight(flatMap(), spot, [1024, 400, 1536]);
    ok(vertices.length > 0 && vertices.length <= SPOTLIGHT_VERTEX_CAPACITY);
    equal(vertices.length % 3, 0);
    for (const v of vertices) {
        equal(v.y, 84); equal(v.alpha, 76);
        ok(v.x >= spot.x - 125 && v.x <= spot.x + 125);
        ok(v.z >= spot.z - 126 && v.z <= spot.z + 126);
        ok(v.u >= 0 && v.u <= 4032 && v.v >= 0 && v.v <= 4032);
    }
    let area = 0;
    for (let i = 0; i < vertices.length; i += 3) {
        const [a, b, c] = vertices.slice(i, i + 3);
        area += Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
    }
    ok(area > 62000 && area < 63000, `footprint area ${area}`);
});

test("projection follows both collision-map diagonals on nonplanar cells", () => {
    for (const diagonal of [0, 1]) {
        const map = flatMap();
        for (let x = 0; x < MAP_X_POINTS; x++) for (let z = 0; z < MAP_Z_POINTS; z++) {
            const e = map[x * MAP_Z_POINTS + z];
            e.unk0 += (x & 1) * (z & 1) * 4; e.unk4 = diagonal;
        }
        const vertices = projectMysteryBearSpotlight(map, spot, [1024, 400, 1536]);
        ok(vertices.some(v => v.y > 84));
        ok(vertices.every(v => v.y >= 84 && v.y <= 116));
        ok(vertices.every(v => Object.values(v).every(Number.isFinite)));
        for (let tick = 0; tick < 256; tick++) for (const movingSpot of sampleMysteryBearSpotlights(placement, placement.y, tick))
            ok(projectMysteryBearSpotlight(map, movingSpot, [1024, 400, 1536]).length <= SPOTLIGHT_VERTEX_CAPACITY);
    }
});

test("projection selects the source upper/lower surface and suppresses terrain too far above or too steep", () => {
    const map = flatMap();
    map.forEach(e => { e.unk3 = 1; });
    ok(projectMysteryBearSpotlight(map, spot, [1024, 400, 1536]).every(v => v.y > 240));
    ok(projectMysteryBearSpotlight(map, { ...spot, height: 200 }, [1024, 400, 1536]).every(v => v.y === 84));
    equal(projectMysteryBearSpotlight(map, { ...spot, height: 0 }, [1024, 400, 1536]).length, 0);
    for (let x = 0; x < MAP_X_POINTS; x++) for (let z = 0; z < MAP_Z_POINTS; z++) {
        map[x * MAP_Z_POINTS + z].unk0 = (x & 1) * 40;
        map[x * MAP_Z_POINTS + z].unk3 = 0;
    }
    equal(projectMysteryBearSpotlight(map, spot, [1024, 400, 1536]).length, 0);
});

test("NPC distance fade and controlled-animal exemption match the source policy", () => {
    const map = flatMap();
    const near = projectMysteryBearSpotlight(map, spot, [1024, 400, 1536]);
    const fading = projectMysteryBearSpotlight(map, spot, [2024, 400, 1536]);
    ok(fading.length > 0 && fading[0].alpha > 0 && fading[0].alpha < near[0].alpha);
    equal(projectMysteryBearSpotlight(map, spot, [2224, 400, 1536]).length, 0);
    equal(projectMysteryBearSpotlight(map, spot, [2224, 400, 1536], true)[0].alpha, near[0].alpha);
});

test("spotlight buffers are reused on seeks and camera movement while paused", () => {
    const output = new RSPSharedOutput();
    output.textureCache.textures[601] = parseI4Texture(new ArrayBufferSlice(new ArrayBuffer(2048)), 64, 64, "spotlight");
    const animation = buildMysteryBearSpotlights(output, flatMap(), placement, placement.y, false);
    const data = new Float32Array(output.vertices.length * 10);
    const counts = [output.vertices.length, output.indices.length, output.textureCache.textures.length];
    for (const draw of animation.draws) {
        equal((draw.DP_OtherModeH >>> RDP.OtherModeH_Layout.G_MDSFT_CYCLETYPE) & 3, 0);
        equal(draw.DP_OtherModeL, 0x00504B50);
        deepEqual(draw.textureIndices, [601]);
    }
    const camera = [1024, 400, 1536];
    equal(updateMysteryBearSpotlights(animation, data, 0, camera), true);
    const initial = data.slice();
    equal(updateMysteryBearSpotlights(animation, data, 0, camera), false);
    equal(updateMysteryBearSpotlights(animation, data, 64, camera), true);
    equal(updateMysteryBearSpotlights(animation, data, 0, camera), true);
    deepEqual(data, initial);
    equal(updateMysteryBearSpotlights(animation, data, 0, [placement.x + 2000, 400, placement.z]), true);
    ok(data.every(v => v === 0));
    equal(updateMysteryBearSpotlights(animation, data, 0, camera), true);
    deepEqual(data, initial);
    deepEqual([output.vertices.length, output.indices.length, output.textureCache.textures.length], counts);
});
