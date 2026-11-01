import { deepEqual, equal, ok } from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { RSPSharedOutput } from '../../BanjoKazooie/f3dex.js';
import { findPayload, LevelPayloadType as P, parseGeometry, parseLevelContainer, parseLevelDat, parseObjects, parseScrollingTable } from '../core/level.js';
import { textureAnimationFrame } from '../objects/object_texture_animation.js';
import { parseCommands } from '../commands/paths.js';
import { buildTerrain, COMBINE_TEXTURED, FAN_TEXTURE_ID_BASE, installTerrainAnimationTextures, RENDER_ALPHA } from '../render/terrain.js';
import { applyStartupFanAnimation } from '../effects/terrain_fans.js';

const read = (path: string) => ArrayBufferSlice.fromView(readFileSync(path));
const available = existsSync('data/SSSV/levels/STINKY_SEWERS.bin');
function fixture(level = 'STINKY_SEWERS') {
    const payloads = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
    const dat = parseLevelDat(findPayload(payloads, P.Dat)!);
    const objects = parseObjects(findPayload(payloads, P.Cob)!);
    const commands = parseCommands(findPayload(payloads, P.Cmd));
    const output = new RSPSharedOutput();
    installTerrainAnimationTextures(output, read('data/SSSV/segments/segment1.bin'));
    const calls = buildTerrain(output, parseGeometry(findPayload(payloads, P.Geo)!, dat), dat, parseScrollingTable(findPayload(payloads, P.Unknown14)!));
    return { objects, commands, calls, output };
}

test('Sewers startup binds its opaque fan to four decoded cutout frames at one frame per tick', { skip: !available }, () => {
    const f = fixture(), fan = f.calls.find(call => call.fanAnimation?.slot === 5)!;
    ok(fan);
    const geometry = JSON.stringify(f.output.vertices), mode = fan.SP_GeometryMode;
    applyStartupFanAnimation(f.calls, f.objects, f.commands);
    deepEqual(fan.animationTextureIndices, [640, 641, 642, 643]);
    deepEqual(fan.textureIndices, [FAN_TEXTURE_ID_BASE]);
    for (const id of fan.animationTextureIndices!) ok(f.output.textureCache.textures[id]);
    equal(fan.animationFrameRate, 30); equal(fan.translucent, false);
    equal(fan.DP_OtherModeL, RENDER_ALPHA); equal(fan.DP_Combine, COMBINE_TEXTURED);
    equal(fan.scrollStepS, 0); equal(fan.scrollStepT, 0);
    equal(fan.SP_GeometryMode, mode); equal(JSON.stringify(f.output.vertices), geometry);
    deepEqual([0, 1, 2, 3, 4, 4, 1, 120].map(tick => textureAnimationFrame(tick * fan.animationFrameRate / 30, 4, 0)), [0, 1, 2, 3, 0, 0, 1, 0]);
});

test('fan startup admission rejects partial, disabled, dynamic, linked and nonterminal scripts', { skip: !available }, () => {
    const f = fixture(), p = f.objects[37];
    for (const placement of [{ ...p, commandReferenceIdx: 0 }, { ...p, commandsLength: 1 }, { ...p, commandsLength: 254 }, { ...p, id: 1 }]) {
        applyStartupFanAnimation(f.calls, [placement], f.commands);
        ok(f.calls.every(call => call.animationTextureIndices === null));
    }
    for (const index of [758, 759, 760]) {
        const command = f.commands[index], opcode = command.opcode;
        command.opcode = 0x14;
        applyStartupFanAnimation(f.calls, [p], f.commands);
        ok(f.calls.every(call => call.animationTextureIndices === null));
        command.opcode = opcode;
    }
    const v = f.commands[758].payload.createDataView();
    for (const step of [0, 0x7F7F]) {
        v.setUint16(2, step);
        applyStartupFanAnimation(f.calls, [p], f.commands);
        ok(f.calls.every(call => call.animationTextureIndices === null));
    }
    v.setUint16(2, 1);
    applyStartupFanAnimation(f.calls, [{ ...p, commandReferenceIdx: 758, commandsLength: 1 }], f.commands);
    deepEqual(f.calls.find(call => call.fanAnimation?.slot === 5)!.animationTextureIndices, [640, 641, 642, 643]);
});

test('Sewers startup binder leaves Snow fan preview and control slots unchanged', { skip: !available }, () => {
    const f = fixture('SNOW_JOKE');
    const before = JSON.stringify(f.calls);
    applyStartupFanAnimation(f.calls, f.objects, f.commands);
    equal(JSON.stringify(f.calls), before);
});
