import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { buildObjects, indexObjectTable, parseObjectTable, installTeleporterTextures, TELEPORTER_TEXTURE_ID_BASE } from "../objects.js";
import { readTeleporterStartup, teleporterFanAlpha, teleporterFanOffset, teleporterFrame, teleporterIsActive } from "../teleporters.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseLevelDat, parseObjects } from "../level.js";
import { parseCommands } from "../paths.js";
import { LEVELS } from "../level_table.js";
import type { LevelObjectPlacement } from "../level.js";

test("teleporter frames use big-endian RGBA16 and undo odd-row word swapping", () => {
    const segment = new ArrayBuffer(0xAB30);
    const view = new DataView(segment);
    const expected: Uint8Array[] = [];
    const colors = [0xF801, 0x07C1, 0x003F, 0xFFFF, 0x0000];
    const rgba = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255], [0, 0, 0, 0]];
    for (let frame = 0; frame < 3; frame++) {
        const pixels = new Uint8Array(32 * 32 * 4);
        for (let y = 0; y < 32; y++) {
            for (let x = 0; x < 32; x++) {
                const color = (frame + x + y * 2) % colors.length;
                const byteOffset = (y * 32 + x) * 2;
                view.setUint16(0x84A0 + frame * 0xAB8 + (byteOffset ^ ((y & 1) * 4)), colors[color], false);
                pixels.set(rgba[color], (y * 32 + x) * 4);
            }
        }
        expected.push(pixels);
    }
    const shared = new RSPSharedOutput();
    installTeleporterTextures(shared, new ArrayBufferSlice(segment));
    for (let frame = 0; frame < 3; frame++) {
        const texture = shared.textureCache.textures[TELEPORTER_TEXTURE_ID_BASE + frame];
        equal(texture.width, 32);
        equal(texture.height, 32);
        deepEqual(texture.pixels, expected[frame]);
    }
    equal(shared.textureCache.textures[TELEPORTER_TEXTURE_ID_BASE + 3].width, 32);
    equal(shared.textureCache.textures[TELEPORTER_TEXTURE_ID_BASE + 3].name, "teleporter/fan");
});



(globalThis as any).window = { debug: false };
const placement: LevelObjectPlacement = { id: 56, x: 100, y: 200, z: 300, angle: 0, zRotation: 0, unkC: 2, scale: 2048, commandReferenceIdx: 1, commandsLength: 0, unk12: 0, unk15: 0 };
function commands(...records: number[][]) {
    const bytes = Uint8Array.from([0, 0, ...records.flatMap(([op, ...p]) => [0, op, ...Array.from({ length: 8 }, (_, i) => p[i] ?? 0)])]);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}

test('teleporter startup snapshots honor waits/stops and reject conditional/called/other-target setup', () => {
    equal(readTeleporterStartup({ ...placement, commandReferenceIdx: 0 }, [])!.state, 1);
    const bank = commands([0x0F, 0, 0], [0x03, 19, 0, 127, 155, 0, 3], [0x0F, 0, 1]);
    const snapshot = readTeleporterStartup(placement, bank)!;
    equal(snapshot.state, 0); equal(snapshot.boundaryCommandIndex, 1);
    equal(readTeleporterStartup(placement, commands([0x0F, 0, 0], [9], [0x0F, 0, 1]))!.state, 0);
    equal(readTeleporterStartup(placement, commands([0x3D, 0, 0, 16, 0, 0, 0, 21, 0], [9]))!.state, 0);
    for (const record of [[0x01], [0x02], [0x48], [0x14, 0, 9], [0x3D, 0, 1, 0, 0, 0, 0, 32]])
        equal(readTeleporterStartup(placement, commands(record, [9])), null);
    equal(readTeleporterStartup({ ...placement, commandReferenceIdx: 100 }, bank), null);
});

test('active rim uses 0/1/1/2/0, inactive freezes, and fan scroll wraps every 16 ticks', () => {
    deepEqual(Array.from({ length: 10 }, (_, t) => teleporterFrame(t, 1)), [0, 1, 1, 2, 0, 0, 1, 1, 2, 0]);
    equal(teleporterFrame(3, 0), 0); equal(teleporterFrame(3, 0, true), 2);
    equal(teleporterFrame(3, null), 2);
    equal(teleporterFanOffset(0), -1 / 16); equal(teleporterFanOffset(15), 0); equal(teleporterFanOffset(16), -1 / 16);
    equal(teleporterIsActive({ state: null, part: 'fan', previewActive: false, alpha: [255, 127] }), false);
    equal(teleporterIsActive({ state: 0, part: 'fan', previewActive: true, alpha: [255, 127] }), true);
});

test('fan fade uses the source Manhattan distance and independent primitive/environment alpha', () => {
    deepEqual(teleporterFanAlpha(0, 0, 0, { x: 0, y: 0, z: 0 }), [0, 0]);
    deepEqual(teleporterFanAlpha(100, 200, 300, { x: 0, y: 200, z: 300 }), [50, 25]);
    deepEqual(teleporterFanAlpha(0, 0, 0, { x: 511, y: 0, z: 0 }), [255, 127]);
    deepEqual(teleporterFanAlpha(0, 0, 0, null), [255, 127]);
});

const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
const available = existsSync('data/SSSV/objects.bin');
function fixture(level: string) {
    const payload = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
    return { objects: parseObjects(findPayload(payload, LevelPayloadType.Cob)!), commands: parseCommands(findPayload(payload, LevelPayloadType.Cmd)),
        dat: parseLevelDat(findPayload(payload, LevelPayloadType.Dat)!), table: indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin'))) };
}

test('source teleporter fan is present with vertex alpha; inactive and unknown fans stay hidden', { skip: !available }, () => {
    const segments: (ArrayBufferSlice | undefined)[] = []; segments[1] = read('data/SSSV/segments/segment1.bin');
    for (const [level, index, expected] of [['RAT_O_MATIC', 81, 1], ['ICE_N_EASY_DOES_IT', 3, 0], ['SHIFTING_SANDS', 44, null]] as const) {
        const f = fixture(level), out = new RSPSharedOutput(); installTeleporterTextures(out, segments[1]);
        const p = f.objects[index], calls = buildObjects(out, [p], f.table, segments, f.dat, f.commands);
        ok(calls.length > 1); ok(calls.every(c => c.teleporter !== null && c.teleporter.state === expected));
        const fans = calls.filter(c => c.teleporter!.part === 'fan'); ok(fans.length > 0);
        ok(fans.every(c => c.visible === (expected === 1) && c.translucent));
        for (const c of fans) {
            deepEqual(c.textureIndices, [613]);
            const alpha = out.indices.slice(c.firstIndex, c.firstIndex + c.indexCount).map(i => out.vertices[i].a);
            ok(alpha.includes(0) && alpha.includes(1));
            ok(c.center[1] > p.y + 2);
        }
        const colored = calls.find(c => c.teleporter!.part === 'rim' && c.textureIndices.length === 0)!;
        deepEqual(Array.from(colored.DP_PrimColor), expected === 1 ? [1, 0, 0, 1] : expected === 0 ? [0, 0, 1, 1] : [1, 1, 1, 1]);
    }
});

test('the state reader inventories all placed teleporters without claiming every script resolved', { skip: !available }, () => {
    let total = 0, active = 0, inactive = 0, unresolved = 0;
    for (const level of LEVELS) {
        const f = fixture(level.id);
        for (const p of f.objects.filter(p => f.table.get(p.id)?.renderMode === 7)) {
            total++;
            const snapshot = readTeleporterStartup(p, f.commands);
            if (snapshot === null) unresolved++; else if (snapshot.state === 1) active++; else inactive++;
        }
    }
    equal(total, 57); deepEqual([active, inactive, unresolved], [20, 24, 13]);
    equal(active + inactive + unresolved, 57);
});
