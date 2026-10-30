import { equal, ok } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import type { CombineParams } from "../../Common/N64/RDP.js";
import { parseLevelDat } from "../level.js";
import type { GeometryFace } from "../level.js";
import { buildTerrain, COMBINE_TEXTURED, FAN_TEXTURE_ID_BASE, WATER_TEXTURE_ID } from "../terrain.js";
import { parseI8Texture } from "../texture.js";

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
    for (const id of [1, 23, 24, 41, WATER_TEXTURE_ID, FAN_TEXTURE_ID_BASE])
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
