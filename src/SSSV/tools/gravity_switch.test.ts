import { deepEqual, equal, ok } from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { RSP_Geometry, RSPSharedOutput } from '../../BanjoKazooie/f3dex.js';
import { ACMUX, CCMUX } from '../../Common/N64/RDP.js';
import { sampleGravitySwitch, updateGravitySwitchVisual } from '../objects/gravity_switch.js';
import { findPayload, LevelPayloadType as P, parseLevelContainer, parseLevelDat, parseObjects } from '../core/level.js';
import { BIOME_SEGMENTS } from '../core/level_table.js';
import { buildObjects, indexObjectTable, parseObjectTable } from '../objects/objects.js';
import { parseCommands } from '../commands/paths.js';
import { buildSwitchBall } from '../objects/switch_visuals.js';

(globalThis as any).window = { debug: false };
const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
const available = existsSync('data/SSSV/levels/ROCKY_HARD_PLACE.bin');
function fixture() {
    const payloads = parseLevelContainer(read('data/SSSV/levels/ROCKY_HARD_PLACE.bin'));
    const dat = parseLevelDat(findPayload(payloads, P.Dat)!);
    const placement = parseObjects(findPayload(payloads, P.Cob)!)[68];
    const commands = parseCommands(findPayload(payloads, P.Cmd));
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    const segments: (ArrayBufferSlice | undefined)[] = [];
    segments[1] = read('data/SSSV/segments/segment1.bin');
    segments[4] = read(`data/SSSV/segments/${BIOME_SEGMENTS[dat.segment]}_biome.bin`);
    segments[5] = read('data/SSSV/segments/ROCKY_HARD_PLACE.bin');
    const output = new RSPSharedOutput();
    const calls = buildObjects(output, [placement], table, segments, dat, commands);
    calls.push(buildSwitchBall(output, 68, placement, table.get(placement.id)!, dat, commands));
    return { calls, output, placement };
}

test('gravity callback ramps over 32 ticks and pulses with source integer rounding and a 64-tick phase period', () => {
    deepEqual(sampleGravitySwitch(2048, 1, 0), { amount: 0, phase: 0, scale: 2048 });
    deepEqual(sampleGravitySwitch(2048, 1, 16), { amount: 128, phase: 64, scale: 2048 });
    deepEqual(sampleGravitySwitch(2048, 1, 32), { amount: 256, phase: 128, scale: 1877 });
    deepEqual(sampleGravitySwitch(2048, 1, 64), { amount: 256, phase: 0, scale: 2218 });
    deepEqual(sampleGravitySwitch(2048, 1, 128), sampleGravitySwitch(2048, 1, 64));
    deepEqual(sampleGravitySwitch(2048, 0, 1000000), { amount: 0, phase: 0, scale: 2048 });
});

test('Rocky gravity switch reuses source arc geometry with primitive translucent material and coherent body/ball pulse', { skip: !available }, () => {
    const { calls, output, placement } = fixture();
    const parts = (part: string) => calls.filter(c => c.gravitySwitch?.part === part);
    for (const part of ['body', 'arcA', 'arcB', 'ball']) ok(parts(part).length > 0, part);
    const arcs = [...parts('arcA'), ...parts('arcB')];
    equal(arcs.length, 2);
    for (const arc of arcs) {
        equal(arc.indexCount, 96); equal(arc.translucent, true); equal(arc.DP_OtherModeH, 0);
        deepEqual(arc.textureIndices, []);
        equal(arc.DP_Combine.c0.d, CCMUX.PRIMITIVE); equal(arc.DP_Combine.a0.d, ACMUX.PRIMITIVE);
        equal(arc.SP_GeometryMode & (RSP_Geometry.G_LIGHTING | RSP_Geometry.G_FOG), 0);
        equal(arc.visible, false);
    }
    const counts = [output.vertices.length, output.indices.length, calls.length];
    for (const call of calls) updateGravitySwitchVisual(call, 16);
    for (const arc of arcs) { equal(arc.visible, true); equal(arc.DP_PrimColor[3], Math.fround(160 / 255)); }
    const first = arcs[0], second = arcs[1];
    deepEqual(Array.from(first.DP_PrimColor), [0, Math.fround(128 / 255), 1, Math.fround(160 / 255)]);
    deepEqual(Array.from(second.DP_PrimColor), [1, 1, 1, Math.fround(160 / 255)]);
    const ball = parts('ball')[0];
    equal(ball.switchBall!.state, 1);
    for (const call of calls) updateGravitySwitchVisual(call, 64);
    const scale = sampleGravitySwitch(ball.gravitySwitch!.baseScale, 1, 64).scale;
    equal(ball.center[1], placement.y + scale * 6 / 256);
    equal(ball.switchBall!.size, Math.trunc(scale * 0.2) * 3 / 256);
    const snapshot = calls.map(c => [Array.from(c.modelMatrix!), Array.from(c.DP_PrimColor), c.visible]);
    for (const arc of arcs) {
        arc.gravitySwitch!.enabled = false; updateGravitySwitchVisual(arc, 64); equal(arc.visible, false);
        arc.gravitySwitch!.enabled = true; updateGravitySwitchVisual(arc, 64); equal(arc.visible, true);
    }
    for (const tick of [64, 8, 1000000, 0, 64]) for (const call of calls) updateGravitySwitchVisual(call, tick);
    deepEqual(calls.map(c => [Array.from(c.modelMatrix!), Array.from(c.DP_PrimColor), c.visible]), snapshot);
    deepEqual([output.vertices.length, output.indices.length, calls.length], counts);
});
