import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSP_Geometry, RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { decodeCombineParams } from "../../Common/N64/RDP.js";
import type { CombineParams } from "../../Common/N64/RDP.js";
import { parseLevelDat } from "../core/level.js";
import type { GeometryFace } from "../core/level.js";
import { buildTerrain, COMBINE_TEXTURED, COMBINE_TRANSLUCENT_VERTEX_ALPHA, FAN_TEXTURE_ID_BASE, WATER_TEXTURE_ID } from "../render/terrain.js";
import { parseI8Texture } from "../core/texture.js";

const dat = parseLevelDat(new ArrayBufferSlice(new ArrayBuffer(0xA0)));

function face(flags: number, texture: number, alpha: number): GeometryFace {
    return {
        index: 0, cellX: 0, cellZ: 0, flags, texture, variant: 0, lit: false,
        vertices: [[0, 0, 0], [64, 0, 0], [0, 0, 64]].map(([x, y, z]) => ({
            position: [x, y, z], local: [x, y, z], uv: [0, 0], color: [255, 255, 255, alpha], normal: null,
        })),
    };
}

function output(): RSPSharedOutput {
    const shared = new RSPSharedOutput();
    const texture = parseI8Texture(ArrayBufferSlice.fromView(new Uint8Array(1024).fill(255)), 32, 32, "test");
    for (const id of [0, 1, 23, 24, 41, WATER_TEXTURE_ID, FAN_TEXTURE_ID_BASE])
        shared.textureCache.textures[id] = texture;
    return shared;
}

function alpha(combine: CombineParams, shade: number, texel: number): number {
    const cycle = (pass: CombineParams["a0"], combined: number): number => {
        const values = [combined, texel, texel, 1, shade, 1, 1, 0];
        return (values[pass.a] - values[pass.b]) * values[pass.c] + values[pass.d];
    };
    return cycle(combine.a1, cycle(combine.a0, 0));
}

test("textured translucent decals use vertex opacity even with an opaque texture", () => {
    for (const sourceAlpha of [76, 89, 102, 114]) {
        const shared = output();
        const [draw] = buildTerrain(shared, { faces: [face(0x4021, 23, sourceAlpha)], trailingBytes: 0 }, dat);
        ok(draw.translucent);
        equal(shared.vertices[0].a, sourceAlpha / 255);
        equal(alpha(draw.DP_Combine, shared.vertices[0].a, 1), sourceAlpha / 255);
    }
});

test("INTRO stage texture zero selects shade-only coloring and disables fog", () => {
    for (const flags of [0x20, 0x22, 0x4020]) {
        const shared = output();
        const [draw] = buildTerrain(shared, { faces: [face(flags, 0, 254)], trailingBytes: 0 }, dat);
        equal(draw.translucent, true);
        deepEqual(draw.textureIndices, []);
        equal(draw.SP_GeometryMode & RSP_Geometry.G_FOG, 0);
        deepEqual(draw.DP_Combine, decodeCombineParams(0xFFFFFF, 0xFFFE7838));
        equal(shared.vertices[0].a, 254 / 255);
        equal(alpha(draw.DP_Combine, 254 / 255, 0), 254 / 255);
    }
});

test("texture zero stays valid outside the ordinary translucent branch", () => {
    for (const flags of [0, 0x40, 0x8000, 0x120]) {
        const [draw] = buildTerrain(output(), { faces: [face(flags, 0, 255)], trailingBytes: 0 }, dat);
        deepEqual(draw.textureIndices, [0]);
        equal(draw.DP_Combine, flags === 0x120 ? COMBINE_TRANSLUCENT_VERTEX_ALPHA : COMBINE_TEXTURED);
        ok(draw.SP_GeometryMode & RSP_Geometry.G_FOG);
    }
    for (const flags of [0x30, 0x220]) {
        const [draw] = buildTerrain(output(), { faces: [face(flags, 0, 255)], trailingBytes: 0 }, dat);
        deepEqual(draw.textureIndices, [WATER_TEXTURE_ID]);
        equal(draw.DP_Combine, COMBINE_TEXTURED);
    }
});

test("shade-only faces batch separately from missing textures and special materials", () => {
    const faces = [face(0x20, 0, 254), face(0x22, 0, 254), face(0x20, 31, 89), face(0x120, 0, 89)];
    const draws = buildTerrain(output(), { faces, trailingBytes: 0 }, dat);
    equal(draws.length, 3);
    const stage = draws.find(draw => draw.indexCount === 6);
    ok(stage);
    equal(stage.indexCount, 6);
    deepEqual(stage.textureIndices, []);
    equal(stage.SP_GeometryMode & RSP_Geometry.G_FOG, 0);
});

test("ordinary translucent terrain below texture 32 disables fog without affecting other material branches", () => {
    for (const texture of [0, 1, 23, 31]) {
        for (const flags of [0x20, 0x22, 0x4021]) {
            const [draw] = buildTerrain(output(), { faces: [face(flags, texture, 89)], trailingBytes: 0 }, dat);
            equal(draw.SP_GeometryMode & RSP_Geometry.G_FOG, 0, `texture ${texture}, flags ${flags}`);
        }
    }
    for (const [flags, texture] of [[0, 1], [0x40, 1], [0x8000, 1], [0x120, 1], [0x30, 1], [0x220, 1], [0x20, 32], [0x20, 40], [0x20, 41]]) {
        const [draw] = buildTerrain(output(), { faces: [face(flags, texture, 89)], trailingBytes: 0 }, dat);
        ok(draw.SP_GeometryMode & RSP_Geometry.G_FOG, `texture ${texture}, flags ${flags}`);
    }
});

test("missing-texture fallbacks with different fog eligibility cannot share a terrain batch", () => {
    for (const textures of [[31, 32], [32, 31]]) {
        const draws = buildTerrain(output(), { faces: textures.map(t => face(0x20, t, 89)), trailingBytes: 0 }, dat);
        equal(draws.length, 2);
        equal(draws.filter(d => (d.SP_GeometryMode & RSP_Geometry.G_FOG) === 0).length, 1);
        ok(draws.every(d => d.textureIndices.length === 0 && d.indexCount === 3));
    }
});

test("opaque terrain remains opaque and untextured translucent terrain retains shade alpha", () => {
    const shared = output();
    const [opaque] = buildTerrain(shared, { faces: [face(1, 1, 0)], trailingBytes: 0 }, dat);
    equal(opaque.translucent, false);
    equal(alpha(opaque.DP_Combine, shared.vertices[0].a, 1), 1);
    const [untextured] = buildTerrain(shared, { faces: [face(0x21, 31, 89)], trailingBytes: 0 }, dat);
    equal(untextured.textureIndices.length, 0);
    equal(alpha(untextured.DP_Combine, 89 / 255, 1), 89 / 255);
});

test("water and animated texture material overrides are preserved", () => {
    for (const [flags, texture] of [[0x11, 1], [0x21, 41]]) {
        const [draw] = buildTerrain(output(), { faces: [face(flags, texture, 89)], trailingBytes: 0 }, dat);
        equal(draw.DP_Combine, COMBINE_TEXTURED);
        equal(draw.textureIndices[0], texture === 41 ? FAN_TEXTURE_ID_BASE : WATER_TEXTURE_ID);
    }
});

test("opaque lava uses its nonzero scroll slot without changing its opaque material", () => {
    const lava = { ...face(0, 24, 255), variant: 3 };
    const stationary = { ...lava, variant: 0 };
    const scroll = [{ s: 512, t: 512 }, { s: 0, t: 0 }, { s: 0, t: 0 }, { s: 2048, t: 0 }];
    const draws = buildTerrain(output(), { faces: [lava, stationary], trailingBytes: 0 }, dat, scroll);
    equal(draws.length, 2);
    const moving = draws.find(draw => draw.scrollStepS === 2048);
    ok(moving);
    equal(moving.scrollStepT, 0);
    equal(moving.translucent, false);
    equal(moving.DP_Combine, COMBINE_TEXTURED);
    equal(draws.filter(draw => draw.scrollStepS === 0 && draw.scrollStepT === 0).length, 1);
});

test("opaque special-combiner, cutout and animated faces do not inherit ordinary UV scrolling", () => {
    const table = [{ s: 0, t: 0 }, { s: 2048, t: -1024 }];
    for (const [flags, texture] of [[0x8, 24], [0x40, 24], [0x2000, 24], [0, 41]]) {
        const [draw] = buildTerrain(output(), { faces: [{ ...face(flags, texture, 255), variant: 1 }], trailingBytes: 0 }, dat, table);
        equal(draw.scrollStepS, 0);
        equal(draw.scrollStepT, 0);
    }
});


test("opaque fan slots survive a missing ordinary texture so the script host can bind I8 frames", () => {
    const shared = output(); delete shared.textureCache.textures[41];
    const [draw] = buildTerrain(shared, { faces: [{ ...face(2, 41, 255), variant: 1 }], trailingBytes: 0 }, dat);
    equal(draw.fanAnimation?.slot, 1); equal(draw.fanAnimation?.kind, 8);
    equal(draw.translucent, false); equal(draw.animationTextureIndices, null);
});
