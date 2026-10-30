import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseLevelDat, parseObjects } from "../level.js";
import { LEVELS } from "../level_table.js";
import { buildObjects, indexObjectTable, parseObjectTable } from "../objects.js";
import { parseCommands } from "../paths.js";
import { COMBINE_SHADE_PRIMITIVE, RENDER_OPAQUE } from "../terrain.js";

(globalThis as any).window = { debug: false };
const available = existsSync('data/SSSV/segments/segment1.bin');
const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));
function fixture(level: string) {
    const payload = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
    const objects = parseObjects(findPayload(payload, LevelPayloadType.Cob)!);
    const buttons = objects.filter(p => p.id === 42);
    const dat = parseLevelDat(findPayload(payload, LevelPayloadType.Dat)!);
    const commands = parseCommands(findPayload(payload, LevelPayloadType.Cmd));
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    const shared = new RSPSharedOutput();
    const draws = buildObjects(shared, buttons, table, [undefined, read('data/SSSV/segments/segment1.bin')], dat, commands);
    return { buttons, entry: table.get(42)!, shared, draws };
}

for (const [level, count] of [['HONEYMOON_LAGOON', 4], ['ROCKY_HARD_PLACE', 1]] as const) {
    test(`${level}: unpressed floor buttons retain the base and dark cap without an opaque glow shell`, { skip: !available }, () => {
        const { buttons, entry, shared, draws } = fixture(level);
        equal(buttons.length, count); equal(draws.length, count * 2);
        for (const [index, p] of buttons.entries()) {
            const parts = draws.filter(d => d.objectPlacementIndex === index);
            deepEqual(parts.map(d => d.indexCount), [30, 24]);
            const [base, cap] = parts;
            deepEqual(Array.from(base.DP_PrimColor), [1, 1, 1, 1]);
            ok(base.textureIndices.length > 0);
            equal(cap.textureIndices.length, 0); deepEqual(cap.DP_Combine, COMBINE_SHADE_PRIMITIVE);
            ok(Math.abs(cap.DP_PrimColor[0] - 64 / 255) < 1e-7);
            deepEqual(Array.from(cap.DP_PrimColor.slice(1)), [0, 0, 1]);
            equal(cap.DP_OtherModeL, RENDER_OPAQUE);
            const scale = (entry.scaleOverride || p.scale || 2048) / 2048;
            const ys = shared.indices.slice(cap.firstIndex, cap.firstIndex + cap.indexCount).map(i => shared.vertices[i].y);
            equal(Math.min(...ys), p.y + entry.collideHeight * scale / 2 + 2 * scale);
            equal(Math.max(...ys), Math.min(...ys));
            // The erroneously rendered shell had a second tier ten units higher.
            equal(parts.reduce((n, d) => n + d.indexCount, 0), 54);
        }
    });
}

test('the inactive floor-button policy applies consistently to all fourteen authored placements', { skip: !available }, () => {
    let count = 0;
    for (const level of LEVELS) {
        const { buttons, draws } = fixture(level.id);
        count += buttons.length;
        equal(draws.length, buttons.length * 2);
        for (const cap of draws.filter(d => d.textureIndices.length === 0)) ok(Math.abs(cap.DP_PrimColor[0] - 64 / 255) < 1e-7);
    }
    equal(count, 14);
});
