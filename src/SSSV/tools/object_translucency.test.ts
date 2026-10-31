import { deepEqual, equal, ok } from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { RSP_Geometry, RSPSharedOutput } from '../../BanjoKazooie/f3dex.js';
import { ACMUX, decodeCombineParams } from '../../Common/N64/RDP.js';
import { findPayload, LevelPayloadType, parseLevelContainer, parseLevelDat, parseObjects } from '../level.js';
import { buildObjects, indexObjectTable, parseObjectTable, REFLECTION_TEXTURE_ID_BASE } from '../objects.js';
import { parseCommands } from '../paths.js';
import { COMBINE_TEXTURED, RENDER_ALPHA, RENDER_OPAQUE, RENDER_TRANSLUCENT } from '../terrain.js';
import { parseI8Texture, parseMipmapBank } from '../texture.js';

(globalThis as any).window = { debug: false };
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));

function synthetic(materials: number[], prefix: [number, number][] = []) {
    const table = new ArrayBuffer(0x9C), entry = new DataView(table);
    entry.setUint16(0, 12); entry.setUint8(3, 6); entry.setUint32(4, 0x01000010);
    const segment = new ArrayBuffer(0x140), view = new DataView(segment);
    const commands: [number, number][] = [...prefix, [0x04000000 | (3 << 10), 0x01000100], [0xBF000000, 0x00000204], [0xB8000000, 0]];
    commands.forEach(([a, b], i) => { view.setUint32(0x10 + i * 8, a); view.setUint32(0x14 + i * 8, b); });
    for (let i = 0; i < 3; i++) { view.setInt16(0x100 + i * 16, i * 32); view.setUint8(0x10F + i * 16, 255); }
    const shared = new RSPSharedOutput();
    const texture = parseI8Texture(ArrayBufferSlice.fromView(new Uint8Array(1024)), 32, 32, 'zero-alpha');
    shared.textureCache.textures[0] = texture;
    shared.textureCache.textures[REFLECTION_TEXTURE_ID_BASE] = texture;
    const placements = materials.map(unkC => ({ id: 12, x: 0, y: 0, z: 0, angle: 0, zRotation: 0, unkC, scale: 2048, commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 }));
    return buildObjects(shared, placements, indexObjectTable(parseObjectTable(new ArrayBufferSlice(table))), [undefined, new ArrayBufferSlice(segment)], parseLevelDat(new ArrayBufferSlice(new ArrayBuffer(0xA0))));
}

test('object material flags keep opaque, cutout, translucent and reflection states separate in the model cache', () => {
    const draws = synthetic([0, 0x80, 0x40, 0xC0, 0x80, 0]);
    equal(draws.length, 6);
    deepEqual(draws.map(d => d.DP_OtherModeL), [RENDER_OPAQUE, RENDER_TRANSLUCENT, RENDER_ALPHA, RENDER_OPAQUE, RENDER_TRANSLUCENT, RENDER_OPAQUE]);
    for (const i of [1, 4]) {
        const draw = draws[i];
        equal(draw.translucent, true);
        equal(draw.DP_PrimColor[3], Math.fround(128 / 255));
        equal(draw.DP_Combine.a0.d, ACMUX.PRIMITIVE);
        equal(draw.DP_Combine.a1.d, ACMUX.PRIMITIVE);
        equal(draw.SP_GeometryMode & RSP_Geometry.G_CULL_BACK, 0);
        deepEqual(draw.textureIndices, [0]);
    }
    for (const i of [0, 2, 5]) {
        equal(draws[i].DP_Combine, COMBINE_TEXTURED);
        ok(draws[i].SP_GeometryMode & RSP_Geometry.G_CULL_BACK);
        equal(draws[i].DP_PrimColor[3], 1);
    }
    equal(draws[3].textureGen, true);
    deepEqual(draws[3].textureIndices, [REFLECTION_TEXTURE_ID_BASE]);
});

test('model display lists can override inherited translucent render state, combiner, opacity and culling', () => {
    const [draw] = synthetic([0x80], [[0xB900031D, RENDER_OPAQUE], [0xFCFFFFFF, 0xFFFE793C], [0xFA000000, 0xFFFFFFFF], [0xB7000000, RSP_Geometry.G_CULL_BACK]]);
    equal(draw.DP_OtherModeL, RENDER_OPAQUE);
    equal(draw.translucent, false);
    deepEqual(draw.DP_Combine, decodeCombineParams(0xFFFFFF, 0xFFFE793C));
    equal(draw.DP_PrimColor[3], 1);
    ok(draw.SP_GeometryMode & RSP_Geometry.G_CULL_BACK);
});

for (const [level, indices, translucent] of [['PINBALL_BLIZZARD', [12, 13], true], ['PENGUIN_PLAYPEN', [23], false]] as const) {
    test(`${level}: authored cube materials select the source opacity`, { skip: !existsSync(`data/SSSV/levels/${level}.bin`) }, () => {
        const payload = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
        const objects = parseObjects(findPayload(payload, LevelPayloadType.Cob)!);
        const selected = indices.map(i => objects[i]);
        ok(selected.every(p => p.id === 12));
        const shared = new RSPSharedOutput();
        parseMipmapBank(read('data/SSSV/textures/ice.rgba16.bin'), 'rgba16', 'ice').forEach((t, i) => shared.textureCache.textures[i] = t);
        const draws = buildObjects(shared, selected, indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin'))), [undefined, read('data/SSSV/segments/segment1.bin')], parseLevelDat(findPayload(payload, LevelPayloadType.Dat)!), parseCommands(findPayload(payload, LevelPayloadType.Cmd)));
        equal(draws.length, indices.length);
        for (const draw of draws) {
            equal(draw.translucent, translucent);
            equal(draw.DP_OtherModeL, translucent ? RENDER_TRANSLUCENT : RENDER_OPAQUE);
            equal(draw.DP_PrimColor[3], translucent ? Math.fround(128 / 255) : 1);
            deepEqual(draw.textureIndices, [4]);
        }
    });
}
