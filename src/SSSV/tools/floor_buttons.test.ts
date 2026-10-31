import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { mat4, vec3 } from "gl-matrix";
import { FloorButtonVisuals, computeFloorButtonMatrix, COMBINE_FLOOR_BUTTON_GLOW } from "../floor_buttons.js";
import { RSP_Geometry } from "../../BanjoKazooie/f3dex.js";
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
        equal(buttons.length, count); equal(draws.length, count * 3);
        for (const [index, p] of buttons.entries()) {
            const parts = draws.filter(d => d.objectPlacementIndex === index);
            deepEqual(parts.map(d => d.indexCount), [30, 24, 24]);
            const [base, cap, glow] = parts;
            equal(glow.visible, false); equal(glow.translucent, true);
            equal(glow.DP_OtherModeL, 0x005049D8); deepEqual(glow.DP_Combine, COMBINE_FLOOR_BUTTON_GLOW);
            equal(glow.SP_GeometryMode & (RSP_Geometry.G_FOG | RSP_Geometry.G_LIGHTING | RSP_Geometry.G_CULL_BACK), 0);
            deepEqual(Array.from(base.DP_PrimColor), [1, 1, 1, 1]);
            ok(base.textureIndices.length > 0);
            equal(cap.textureIndices.length, 0); deepEqual(cap.DP_Combine, COMBINE_SHADE_PRIMITIVE);
            ok(Math.abs(cap.DP_PrimColor[0] - 64 / 255) < 1e-7);
            deepEqual(Array.from(cap.DP_PrimColor.slice(1)), [0, 0, 1]);
            equal(cap.DP_OtherModeL, RENDER_OPAQUE);
            const scale = (entry.scaleOverride || p.scale || 2048) / 2048;
            const ys = shared.indices.slice(cap.firstIndex, cap.firstIndex + cap.indexCount).map(i => vec3.transformMat4(vec3.create(), [shared.vertices[i].x, shared.vertices[i].y, shared.vertices[i].z], cap.modelMatrix!)[1]);
            equal(Math.min(...ys), p.y + entry.collideHeight * scale / 2 + 2 * scale);
            equal(Math.max(...ys), Math.min(...ys));
            // The erroneously rendered shell had a second tier ten units higher.
            equal(parts.filter(d => d.visible).reduce((n, d) => n + d.indexCount, 0), 54);
        }
    });
}

test('the inactive floor-button policy applies consistently to all fourteen authored placements', { skip: !available }, () => {
    let count = 0;
    for (const level of LEVELS) {
        const { buttons, draws } = fixture(level.id);
        count += buttons.length;
        equal(draws.length, buttons.length * 3);
        for (const cap of draws.filter(d => d.floorButton?.part === 'cap')) ok(Math.abs(cap.DP_PrimColor[0] - 64 / 255) < 1e-7);
    }
    equal(count, 14);
});


test('active floor buttons use the source pressed scale, full red cap and alpha-faded glow', { skip: !available }, () => {
    const { draws, shared } = fixture('HONEYMOON_LAGOON'), visual = new FloorButtonVisuals(draws);
    const counts = [shared.vertices.length, shared.indices.length, draws.length];
    const button = draws[0].floorButton!.button, origin = [button.placement.x, button.placement.y + Math.floor(button.collideHeight * button.scale / 2048) / 2, 7168 - button.placement.z];
    const vertex = shared.vertices[shared.indices[draws[0].firstIndex]], point = vec3.fromValues(vertex.x, vertex.y, vertex.z);
    const before = vec3.transformMat4(vec3.create(), point, draws[0].modelMatrix!);
    visual.update(true, i => i === 0 ? 1 : null);
    const after = vec3.transformMat4(vec3.create(), point, draws[0].modelMatrix!);
    for (let i = 0; i < 3; i++) ok(Math.abs(after[i] - origin[i] - (before[i] - origin[i]) * 0.75) < 1e-5);
    const parts = draws.filter(d => d.objectPlacementIndex === 0), cap = parts[1], glow = parts[2];
    equal(cap.DP_PrimColor[0], 1); equal(glow.visible, true);
    const alpha = new Set(shared.indices.slice(glow.firstIndex, glow.firstIndex + glow.indexCount).map(i => shared.vertices[i].a));
    deepEqual([...alpha].sort(), [0, 128 / 255]);
    equal(glow.DP_Combine.c0.d, 3); equal(glow.DP_Combine.a0.d, 4);
    ok(draws.filter(d => d.objectPlacementIndex !== 0 && d.floorButton?.part === 'glow').every(d => !d.visible));
    visual.update(false, () => 1); ok(draws.every(d => !d.visible));
    visual.update(true); equal(glow.visible, false); ok(Math.abs(cap.DP_PrimColor[0] - 64 / 255) < 1e-7);
    deepEqual([shared.vertices.length, shared.indices.length, draws.length], counts);
});

test('pressed scale uses the source integer three-quarter operation without moving the collision-height pivot', () => {
    const button = { placement: { x: 10, y: 20, z: 30, angle: 0, zRotation: 0 } as any, scale: 2049, collideHeight: 6, initialState: 0, state: 1 };
    const matrix = mat4.create(); computeFloorButtonMatrix(matrix, button);
    equal(matrix[0], 1536 / 2048); equal(matrix[13], 23); equal(matrix[14], 7138);
});
