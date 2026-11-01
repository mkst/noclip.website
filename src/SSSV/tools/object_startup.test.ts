import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import type { LevelObjectPlacement } from "../core/level.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseLevelDat, parseObjects } from "../core/level.js";
import { buildObjects, parseObjectTable } from "../objects/objects.js";
import { readObjectStartupAppearance } from "../objects/object_startup.js";
import { parseCommands } from "../commands/paths.js";
import { parseI8Texture } from "../core/texture.js";
import { RENDER_ALPHA, RENDER_OPAQUE, SSSVLayer } from "../render/terrain.js";

(globalThis as any).window = { debug: false };

const placement: LevelObjectPlacement = { id: 133, x: 100, y: 200, z: 300, angle: 0, zRotation: 0, unkC: 1, scale: 2048, commandReferenceIdx: 1, commandsLength: 0, unk12: 0, unk15: 0 };
function commands(...records: number[][]) {
    const bytes = Uint8Array.from([0, 0, ...records.flatMap(([op, ...payload]) => [0, op, ...Array.from({ length: 8 }, (_, i) => payload[i] ?? 0)])]);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}

test("startup material/state/scale writes use the last immediate value and retain command provenance", () => {
    const result = readObjectStartupAppearance(placement, commands([0x33, 0, 29], [0x33, 0, 40], [0x36, 16, 0], [0x0F, 0, 0], [0x09]));
    deepEqual(result, { material: 40, scale: 4096, state: 0, commandIndices: [0, 1, 2, 3], boundaryCommandIndex: 4 });
});

test("positive literal delays delimit the initial snapshot while zero delays continue immediately", () => {
    equal(readObjectStartupAppearance(placement, commands([0x0F, 0, 1], [0x06, 0, 30], [0x0F, 0, 0]))?.state, 1);
    equal(readObjectStartupAppearance(placement, commands([0x0F, 0, 1], [0x06, 0, 0], [0x0F, 0, 0], [0x09]))?.state, 0);
});

test("spawn defaults and loader base/cursor conventions are explicit without event activation", () => {
    equal(readObjectStartupAppearance({ ...placement, commandReferenceIdx: 0, unk12: 1 }, [])?.state, 1);
    equal(readObjectStartupAppearance({ ...placement, commandReferenceIdx: 2, commandsLength: 1 }, commands([0x33, 0, 40], [0x33, 0, 40], [0x33, 0, 2], [0x09]))?.material, 2);
});

test("literal math writes handle only scale/state and the established zero unk163 setup", () => {
    const result = readObjectStartupAppearance(placement, commands([0x3D, 0, 0, 0, 0, 0, 0, 17, 0], [0x3D, 16, 0, 0, 0, 0, 0, 9, 0], [0x3D, 0, 0, 0, 0, 0, 0, 21, 0], [0x09]));
    equal(result?.scale, 4096);
    equal(result?.state, 0);
    equal(result?.material, null);
    equal(readObjectStartupAppearance(placement, commands([0x3D, 0, 26, 0, 0, 0, 0, 20, 0], [0x06, 0, 10])), null);
});

test("conditions, calls, linked targets and unknown instructions reject a partial appearance snapshot", () => {
    for (const record of [[0x03], [0x01], [0x48], [0x14, 0, 1], [0x14, 0, 9], [0x10, 64], [0x35], [0x0E]])
        equal(readObjectStartupAppearance(placement, commands([0x33, 0, 40], record, [0x09])), null);
});

test("expressions, unsupported math destinations, malformed tails and incomplete scripts are rejected", () => {
    for (const record of [[0x33, 127, 127], [0x06, 127, 127], [0x36, 0, 0], [0x3D, 0, 1, 0, 0, 0, 0, 16], [0x3D, 0, 1, 0, 0, 0, 0, 32], [0x3D, 0, 1, 0, 0, 0, 0, 21, 1], [0x33, 0, 40, 0, 1]])
        equal(readObjectStartupAppearance(placement, commands(record, [0x09])), null);
    equal(readObjectStartupAppearance(placement, []), null);
    equal(readObjectStartupAppearance(placement, commands([0x33, 0, 40])), null);
    equal(readObjectStartupAppearance(placement, commands(...Array.from({ length: 256 }, () => [0]))), null);
});

function render(records: number[][], mode = 6, contexts = [1], scaleOverride = 0, otherRecords: number[][] | null = null) {
    const table = new ArrayBuffer(0x9C), tv = new DataView(table);
    tv.setUint16(0, 133); tv.setUint8(3, mode); tv.setUint32(4, 0x01000010); tv.setUint16(0x70, scaleOverride); tv.setUint16(0x7A, 64);
    if (mode === 12) tv.setUint32(8, 0x01000010);
    tv.setUint8(0x96, 1); tv.setUint8(0x97, 20); tv.setUint8(0x98, 20);
    const entry = parseObjectTable(new ArrayBufferSlice(table))[0];
    const buffer = new ArrayBuffer(0x80), v = new DataView(buffer);
    v.setUint32(0x10, 0x04000000 | (3 << 10)); v.setUint32(0x14, 0x01000040); v.setUint32(0x18, 0xBF000000); v.setUint32(0x1C, 0x00000204); v.setUint32(0x20, 0xB8000000);
    for (let i = 0; i < 3; i++) { v.setInt16(0x40 + i * 16, i === 1 ? 32 : 0); v.setInt16(0x42 + i * 16, i === 2 ? 32 : 0); v.setUint8(0x4F + i * 16, 255); }
    const shared = new RSPSharedOutput(), texture = parseI8Texture(ArrayBufferSlice.fromView(new Uint8Array(1024)), 32, 32, "test");
    for (const id of [0, 1, 2, 600]) shared.textureCache.textures[id] = texture;
    const objects = contexts.map((material, i) => ({ ...placement, unkC: material, commandReferenceIdx: records.length ? 1 + i * records.length : 0 }));
    const bank = commands(...objects.flatMap((_, i) => i === 0 || otherRecords === null ? records : otherRecords));
    const original = JSON.stringify(objects), bytes = bank.map(c => Array.from(c.raw.createTypedArray(Uint8Array)));
    const draws = buildObjects(shared, objects, new Map([[133, entry]]), [undefined, new ArrayBufferSlice(buffer)], parseLevelDat(new ArrayBufferSlice(new ArrayBuffer(0xA0))), bank);
    equal(JSON.stringify(objects), original);
    deepEqual(bank.map(c => Array.from(c.raw.createTypedArray(Uint8Array))), bytes);
    return { draws, shared };
}

test("material 40 startup writes suppress mesh and shadow without mutating placements or commands", () => {
    equal(render([[0x33, 0, 40], [0x57], [0x09]]).draws.length, 0);
    equal(render([[0x33, 0, 0xE8], [0x09]]).draws.length, 0);
    ok(render([[0x09]]).draws.length >= 2);
});

test("shadow suppression follows effective startup material rather than authored translucency", () => {
    const translucent = render([[0x33, 0, 0x81], [0x09]]).draws;
    ok(translucent.length > 0);
    equal(translucent.filter(d => d.shadowFadeExponent !== null).length, 0);
    const opaque = render([[0x33, 0, 1], [0x09]], 6, [0x81]).draws;
    equal(opaque.filter(d => d.shadowFadeExponent !== null).length, 1);
});

test("startup material changes preserve texture zero and update inherited cutout state", () => {
    const zero = render([[0x33, 0, 0], [0x09]]).draws.find(d => d.layer === SSSVLayer.Objects && d.textureIndices[0] !== 600)!;
    deepEqual(zero.textureIndices, [0]);
    const opaque = render([[0x33, 0, 2], [0x06, 0, 2]], 6, [0x42]).draws.find(d => d.layer === SSSVLayer.Objects && d.textureIndices[0] !== 600)!;
    equal(opaque.DP_OtherModeL, RENDER_OPAQUE);
    const cutout = render([[0x33, 0, 0x42], [0x09]], 6).draws.find(d => d.layer === SSSVLayer.Objects && d.textureIndices[0] !== 600)!;
    equal(cutout.DP_OtherModeL, RENDER_ALPHA);
});

test("literal startup scale replaces spawn-only overrides and scales the mesh and its shadow consistently", () => {
    const { draws, shared } = render([[0x36, 16, 0], [0x09]], 6, [1], 1024);
    const mesh = draws.find(d => d.layer === SSSVLayer.Objects && d.textureIndices[0] !== 600)!, shadow = draws.find(d => d.textureIndices[0] === 600)!;
    const xs = shared.indices.slice(mesh.firstIndex, mesh.firstIndex + mesh.indexCount).map(i => shared.vertices[i].x);
    equal(Math.max(...xs) - Math.min(...xs), 64);
    const shadowXs = shared.indices.slice(shadow.firstIndex, shadow.firstIndex + shadow.indexCount).map(i => shared.vertices[i].x);
    equal(Math.max(...shadowXs) - Math.min(...shadowXs), 80);
});

test("lever state colours use the supported initial snapshot without leaking through shared model caches", () => {
    const result = render([[0x0F, 0, 1], [0x06, 0, 30]], 12).draws.filter(d => d.layer === SSSVLayer.Objects && d.textureIndices[0] !== 600);
    equal(result[1].DP_PrimColor[0], 1);
    const off = render([[0x0F, 0, 0], [0x06, 0, 30]], 12).draws.filter(d => d.layer === SSSVLayer.Objects && d.textureIndices[0] !== 600);
    ok(Math.abs(off[1].DP_PrimColor[0] - 0x40 / 0xFF) < 1e-7);
    equal(render([], 12).draws.filter(d => d.layer === SSSVLayer.Objects && d.textureIndices[0] !== 600)[1].DP_PrimColor[0], 1);
    for (const [first, second] of [[1, 0], [0, 1]]) {
        const mixed = render([[0x0F, 0, first], [0x09]], 12, [1, 1], 0, [[0x0F, 0, second], [0x09]]).draws.filter(d => d.layer === SSSVLayer.Objects && d.textureIndices[0] !== 600);
        ok(Math.abs(mixed[1].DP_PrimColor[0] - (first === 1 ? 1 : 0x40 / 0xFF)) < 1e-7);
        ok(Math.abs(mixed[3].DP_PrimColor[0] - (second === 1 ? 1 : 0x40 / 0xFF)) < 1e-7);
    }
});

for (const [level, indices] of [["PENGUIN_PLAYPEN", [57, 58]], ["HONEYMOON_LAGOON", [30, 31, 32, 33]], ["STINKY_SEWERS", [46]], ["WALRACE_64", [73]], ["RAT_O_MATIC", [41]]] as const) {
    const filename = `data/SSSV/levels/${level}.bin`;
    test(`${level} real startup appearance evidence`, { skip: !existsSync(filename) }, () => {
        const p = parseLevelContainer(ArrayBufferSlice.fromView(readFileSync(filename)));
        const objects = parseObjects(findPayload(p, LevelPayloadType.Cob)!);
        const bank = parseCommands(findPayload(p, LevelPayloadType.Cmd));
        for (const index of indices) {
            const result = readObjectStartupAppearance(objects[index], bank);
            if (level === "PENGUIN_PLAYPEN" || level === "WALRACE_64") equal(result?.material, 40);
            if (level === "HONEYMOON_LAGOON") equal(result?.state, 1);
            if (level === "STINKY_SEWERS") equal(result?.material, 2);
            if (level === "RAT_O_MATIC") equal(result, null);
        }
    });
}

test("authored invisible materials suppress body and shadow in every supported render mode", () => {
    for (const mode of [6, 12, 15]) {
        equal(render([], mode, [40]).draws.length, 0);
        equal(render([[0x09]], mode, [0xE8]).draws.length, 0);
    }
    const mixed = render([[0x09]], 6, [40, 1]).draws;
    equal(mixed.filter(d => d.objectPlacementIndex === 0).length, 0);
    ok(mixed.some(d => d.objectPlacementIndex === 1));
});

test("resolved unhide writes override authored invisibility while unresolved startup retains the existing mesh", () => {
    ok(render([[0x33, 0, 2], [0x09]], 6, [40]).draws.length > 0);
    ok(render([[0x03]], 6, [40]).draws.length > 0);
    ok(render([[0x33, 0, 40], [0x03]], 6, [1]).draws.length > 0);
});
