import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseLevelDat, parseObjects } from "../level.js";
import type { LevelObjectPlacement } from "../level.js";
import { LEVELS } from "../level_table.js";
import { buildBillboards, indexObjectTable, parseObjectTable } from "../objects.js";
import { parseCommands } from "../paths.js";
import { parseI8Texture } from "../texture.js";

const dat = parseLevelDat(new ArrayBufferSlice(new ArrayBuffer(0xA0)));
const placement: LevelObjectPlacement = { id: 124, x: 100, y: 200, z: 300, angle: 0, zRotation: 0, unkC: 8, scale: 2048, commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 };
function table(mode = 22) {
    const bytes = new ArrayBuffer(0x9C), v = new DataView(bytes);
    v.setUint16(0, 124); v.setUint8(3, mode); v.setUint16(0x7A, 43);
    return indexObjectTable(parseObjectTable(new ArrayBufferSlice(bytes)));
}
function output() {
    const output = new RSPSharedOutput();
    const texture = parseI8Texture(ArrayBufferSlice.fromView(new Uint8Array(1024)), 32, 32, 'test');
    for (const id of [520, 521, 522, 523, 560]) output.textureCache.textures[id] = texture;
    return output;
}

test('flag-127 geometry uses source asymmetric extent and samples the complete image once', () => {
    const out = output(), [draw] = buildBillboards(out, [placement], table(), [], dat);
    const vertices = out.indices.slice(draw.firstIndex, draw.firstIndex + 6).map(i => out.vertices[i]);
    deepEqual([...new Set(vertices.map(v => v.x))], [-1, 1]);
    deepEqual([...new Set(vertices.map(v => v.y))], [-1, 3]);
    deepEqual(vertices.map(v => [v.tx, v.ty]), [[0, 1], [1, 1], [1, 0], [0, 1], [1, 0], [0, 0]]);
    deepEqual(Array.from(draw.center), [100, 221.5, 6868]);
    equal(draw.projectedObjectSprite!.size, 24); equal(draw.objectPlacementIndex, 0);
    equal(draw.modelMatrix![0], 1); equal(draw.billboard, true); equal(draw.translucent, true);
});

test('ordinary mode-18 and intensity-effect sprites retain their existing square geometry', () => {
    for (const [mode, category] of [[18, 8], [22, 32]]) {
        const out = output(), [draw] = buildBillboards(out, [{ ...placement, unkC: category }], table(mode), [], dat);
        equal(draw.projectedObjectSprite, null);
        deepEqual([...new Set(out.indices.slice(draw.firstIndex, draw.firstIndex + 6).map(i => out.vertices[i].y))], [-0.5, 0.5]);
    }
    equal(buildBillboards(output(), [{ ...placement, unkC: 40 }], table(), [], dat).length, 0);
});

const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
test('all 59 placed mode-22 sprites use the corrected shape across the five audited levels', { skip: !existsSync('data/SSSV/objects.bin') }, () => {
    const objectTable = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin'))), counts: Record<string, number> = {};
    for (const level of LEVELS) {
        const payload = parseLevelContainer(read(`data/SSSV/levels/${level.id}.bin`)), out = output();
        const objects = parseObjects(findPayload(payload, LevelPayloadType.Cob)!);
        const calls = buildBillboards(out, objects, objectTable, [], dat, parseCommands(findPayload(payload, LevelPayloadType.Cmd)));
        const tall = calls.filter(c => c.projectedObjectSprite !== null);
        ok(tall.every(c => objectTable.get(objects[c.objectPlacementIndex!].id)!.renderMode === 22));
        if (tall.length) counts[level.id] = tall.length;
    }
    deepEqual(counts, { HONEYMOON_LAGOON: 18, FAT_BEAR_MOUNTAIN: 9, ROCKY_HARD_PLACE: 16, JUNGLE_DOLDRUMS: 8, WEIGHT_FOR_IT: 8 });
});
