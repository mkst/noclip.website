import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { RSP_Geometry } from "../../TopGearRally/f3dex.js";
import { buildObjects, parseObjectTable, REFLECTION_TEXTURE_ID_BASE } from "../objects.js";
import { parseLevelDat } from "../level.js";
import { parseI8Texture } from "../texture.js";
import { RENDER_ALPHA, RENDER_OPAQUE } from "../terrain.js";

(globalThis as any).window = { debug: false };

function render(mode: number, context: number, contexts: number[] = [context], overrideMode: number | null = null) {
    const table = new ArrayBuffer(0x9C);
    const tableView = new DataView(table);
    tableView.setUint16(0, 133);
    tableView.setUint8(3, mode);
    tableView.setUint32(4, 0x01000010);
    const entry = parseObjectTable(new ArrayBufferSlice(table))[0];

    const segment = new ArrayBuffer(0x80);
    const segmentView = new DataView(segment);
    segmentView.setUint32(0x10, 0x04000000 | (3 << 10));
    segmentView.setUint32(0x14, 0x01000040);
    segmentView.setUint32(0x18, 0xBF000000);
    segmentView.setUint32(0x1C, 0x00000204);
    segmentView.setUint32(0x20, 0xB8000000);
    if (overrideMode !== null) {
        segmentView.setUint32(0x18, 0xB900001D);
        segmentView.setUint32(0x1C, overrideMode);
        segmentView.setUint32(0x20, 0xBF000000);
        segmentView.setUint32(0x24, 0x00000204);
        segmentView.setUint32(0x28, 0xB8000000);
    }
    for (let i = 0; i < 3; i++) {
        segmentView.setInt16(0x40 + i * 16, i === 1 ? 32 : 0);
        segmentView.setInt16(0x42 + i * 16, i === 2 ? 32 : 0);
        segmentView.setUint8(0x4E + i * 16, 127);
        segmentView.setUint8(0x4F + i * 16, 255);
    }
    const shared = new RSPSharedOutput();
    const texture = parseI8Texture(ArrayBufferSlice.fromView(new Uint8Array(1024)), 32, 32, "test");
    for (let i = 1; i <= 3; i++) {
        shared.textureCache.textures[i] = texture;
        shared.textureCache.textures[REFLECTION_TEXTURE_ID_BASE + i] = texture;
    }
    return buildObjects(shared, contexts.map((material) => ({
        id: 133, x: 0, y: 0, z: 0, angle: 0, zRotation: 0, unkC: material,
        scale: 2048, commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0,
    })), new Map([[133, entry]]), [undefined, new ArrayBufferSlice(segment)],
    parseLevelDat(new ArrayBufferSlice(new ArrayBuffer(0xA0))))[contexts.length - 1];
}

test("mode-6 objects with both material flags use the reflection bank and generated UVs", () => {
    for (const material of [1, 2, 3]) {
        const draw = render(6, 0xC0 | material);
        ok(draw);
        deepEqual(draw.textureIndices, [REFLECTION_TEXTURE_ID_BASE + material]);
        equal(draw.textureGen, true);
        ok(draw.SP_GeometryMode & RSP_Geometry.G_TEXTURE_GEN);
    }
});

test("ordinary, cutout and translucent context flags do not select the reflection bank", () => {
    for (const flags of [0, 0x40, 0x80]) {
        const draw = render(6, flags | 3);
        deepEqual(draw.textureIndices, [3]);
        equal(draw.textureGen, false);
    }
});

test("mode-17 objects retain their unconditional reflection material", () => {
    const draw = render(17, 3);
    deepEqual(draw.textureIndices, [REFLECTION_TEXTURE_ID_BASE + 3]);
    equal(draw.textureGen, true);
});

test("mode-6 cutout placements inherit alpha testing without leaking through either model cache", () => {
    for (const materials of [[3, 0x43], [0x43, 3], [0xC3, 0x43], [0x43, 0xC3]]) {
        const draw = render(6, 3, materials);
        const cutout = materials[1] === 0x43;
        equal(draw.DP_OtherModeL, cutout ? RENDER_ALPHA : RENDER_OPAQUE);
        equal(draw.translucent, false);
        equal(draw.textureGen, materials[1] === 0xC3);
    }
});

test("explicit display-list material changes override inherited alpha testing", () => {
    const draw = render(6, 0x43, [0x43], RENDER_OPAQUE);
    equal(draw.DP_OtherModeL, RENDER_OPAQUE);
});
