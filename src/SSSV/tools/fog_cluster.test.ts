import { deepEqual, equal, ok } from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { RSP_Geometry, RSPSharedOutput } from '../../BanjoKazooie/f3dex.js';
import { ACMUX, CCMUX } from '../../Common/N64/RDP.js';
import { findPayload, LevelPayloadType as P, parseLevelContainer, parseLevelDat, parseObjects } from '../core/level.js';
import { buildBillboards, indexObjectTable, installDynamicBillboardTextures, parseObjectTable } from '../objects/objects.js';
import type { SSSVBillboard } from '../objects/objects.js';
import { readBillboardStartupColor } from '../objects/object_startup.js';
import { parseCommands } from '../commands/paths.js';
import { COMBINE_TEXTURED } from '../render/terrain.js';

const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));
const available = existsSync('data/SSSV/levels/FAT_BEAR_MOUNTAIN.bin');
function fixture() {
    const payload = parseLevelContainer(read('data/SSSV/levels/FAT_BEAR_MOUNTAIN.bin'));
    const objects = parseObjects(findPayload(payload, P.Cob)!);
    const commands = parseCommands(findPayload(payload, P.Cmd));
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    const sets: SSSVBillboard[][] = JSON.parse(readFileSync('data/SSSV/billboards.json', 'utf8'));
    const output = new RSPSharedOutput(); installDynamicBillboardTextures(output, read('data/SSSV/segments/segment1.bin'));
    return { objects, commands, table, sets, output, dat: parseLevelDat(findPayload(payload, P.Dat)!) };
}

test('Fat Bear Mountain retains all seven fog sprites with source pale-blue RGB and texture-derived alpha', { skip: !available }, () => {
    const f = fixture(), placement = f.objects[26];
    const bank = f.commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array)));
    deepEqual(readBillboardStartupColor(placement, f.commands), [220, 220, 255]);
    const calls = buildBillboards(f.output, f.objects, f.table, f.sets, f.dat, f.commands).filter(c => c.objectPlacementIndex === 26);
    equal(calls.length, 7);
    for (const call of calls) {
        deepEqual(call.textureIndices, [560]); equal(call.billboard, true); equal(call.translucent, true);
        equal(call.SP_GeometryMode & (RSP_Geometry.G_FOG | RSP_Geometry.G_LIGHTING), 0);
        deepEqual(Array.from(call.DP_PrimColor), [Math.fround(220 / 255), Math.fround(220 / 255), 1, 1]);
        deepEqual(Array.from(call.DP_EnvColor), [Math.fround(220 / 255), Math.fround(220 / 255), 1, 0]);
        deepEqual(call.DP_Combine.c0, { a: CCMUX.PRIMITIVE, b: CCMUX.ENVIRONMENT, c: CCMUX.TEXEL0, d: CCMUX.ENVIRONMENT });
        deepEqual(call.DP_Combine.a0, { a: ACMUX.PRIMITIVE, b: ACMUX.ENVIRONMENT, c: ACMUX.TEXEL0, d: ACMUX.ENVIRONMENT });
        deepEqual(call.DP_Combine.c1, { a: CCMUX.ADD_ZERO, b: CCMUX.ADD_ZERO, c: CCMUX.MUL_ZERO, d: CCMUX.COMBINED });
        deepEqual(call.DP_Combine.a1, { a: ACMUX.ZERO, b: ACMUX.ZERO, c: ACMUX.ZERO, d: ACMUX.ADD_COMBINED });
        ok(Array.from(call.center).every(Number.isFinite));
    }
    deepEqual(f.commands.map(c => Array.from(c.raw.createTypedArray(Uint8Array))), bank);
});

test('fog colour admission respects initial cursor and rejects partial, dynamic, linked and nonterminal setup', { skip: !available }, () => {
    const f = fixture(), p = f.objects[26];
    equal(readBillboardStartupColor({ ...p, commandReferenceIdx: 0, unk12: 253 }, f.commands), null);
    equal(readBillboardStartupColor({ ...p, commandsLength: 1 }, f.commands), null);
    deepEqual(readBillboardStartupColor({ ...p, commandReferenceIdx: 252, commandsLength: 1 }, f.commands), [220, 220, 255]);
    for (let index = 252; index <= 256; index++) {
        const command = f.commands[index], opcode = command.opcode;
        for (const altered of [0x48, 0x14, 0x03]) {
            command.opcode = altered; equal(readBillboardStartupColor(p, f.commands), null);
        }
        command.opcode = opcode;
    }
    const payload = f.commands[253].payload.createDataView();
    for (const value of [256, 0x7F7F, 0xFFFF]) {
        payload.setUint16(0, value); equal(readBillboardStartupColor(p, f.commands), null);
    }
    payload.setUint16(0, 220); payload.setUint8(7, 1);
    equal(readBillboardStartupColor(p, f.commands), null);
});

test('mode-8 regular/energy sprites and unresolved intensity colours retain existing materials and geometry', { skip: !available }, () => {
    const f = fixture(), p = f.objects[26], entry = f.sets[10][0];
    f.output.textureCache.textures[503] = f.output.textureCache.textures[560];
    f.sets[10] = [3, 32, 48].map(category => ({ ...entry, category }));
    const draws = buildBillboards(f.output, [p], f.table, f.sets, f.dat, f.commands);
    const fallback = buildBillboards(f.output, [{ ...p, commandReferenceIdx: 0 }], f.table, f.sets, f.dat, f.commands);
    equal(draws.length, 3); equal(fallback.length, 3);
    for (const i of [0, 2]) { equal(draws[i].DP_Combine, COMBINE_TEXTURED); deepEqual(Array.from(draws[i].DP_PrimColor), Array.from(fallback[i].DP_PrimColor)); }
    for (let i = 0; i < draws.length; i++) {
        deepEqual(Array.from(draws[i].modelMatrix!), Array.from(fallback[i].modelMatrix!));
        deepEqual(draws[i].textureIndices, fallback[i].textureIndices);
        equal(draws[i].projectedObjectSprite, null); equal(fallback[i].DP_Combine, COMBINE_TEXTURED);
    }
});
