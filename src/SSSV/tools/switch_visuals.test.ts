import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseLevelDat, parseObjects } from "../level.js";
import { LEVELS } from "../level_table.js";
import { indexObjectTable, parseObjectTable } from "../objects.js";
import { readObjectStartupAppearance, readSwitchStartupAppearance } from "../object_startup.js";
import { parseCommands } from "../paths.js";
import { buildLampGlows, readLampStartup, buildLeverLights, buildSwitchBall, buildSwitchBalls } from "../switch_visuals.js";

const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
const available = existsSync('data/SSSV/objects.bin');
function fixture(level: string) {
    const payload = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
    return { objects: parseObjects(findPayload(payload, LevelPayloadType.Cob)!), commands: parseCommands(findPayload(payload, LevelPayloadType.Cmd)),
        dat: parseLevelDat(findPayload(payload, LevelPayloadType.Dat)!), table: indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin'))) };
}

test('all placed active and gravity switches receive one ball without interaction admission', { skip: !available }, () => {
    let active = 0, gravity = 0;
    const levels = new Set<string>();
    for (const level of LEVELS) {
        const f = fixture(level.id), output = new RSPSharedOutput();
        const calls = buildSwitchBalls(output, f.objects, f.table, f.dat, f.commands);
        for (const c of calls) {
            const mode = f.table.get(f.objects[c.objectPlacementIndex!].id)!.renderMode;
            if (mode === 4) active++; else { equal(mode, 13); gravity++; }
            levels.add(level.id); deepEqual(c.animationTextureIndices, [504, 505]);
        }
        equal(new Set(calls.map(c => c.objectPlacementIndex)).size, calls.length);
    }
    equal(active, 19); equal(gravity, 1); equal(levels.size, 13);
});

test('switch startup snapshots stop before waits and do not broaden general visibility resolution', { skip: !available }, () => {
    const f = fixture('THE_BATTERY_FARM'), p = f.objects[11];
    equal(readObjectStartupAppearance(p, f.commands), null);
    const startup = readSwitchStartupAppearance(p, f.commands)!;
    equal(startup.state, 0); equal(startup.boundaryCommandIndex, 74); deepEqual(startup.commandIndices, [73]);
    const ball = buildSwitchBalls(new RSPSharedOutput(), f.objects, f.table, f.dat, f.commands).find(c => c.objectPlacementIndex === 11)!;
    equal(ball.switchBall!.state, 0); deepEqual(ball.textureIndices, [505]);
    const conditional = f.commands.map(c => c.index === 74 ? { ...c, opcode: 0x01 } : c);
    equal(readSwitchStartupAppearance(p, conditional), null);
    const comparison = f.commands[74].payload.copyToBuffer();
    new DataView(comparison).setUint8(0, 17);
    const nonContactWait = f.commands.map(c => c.index === 74 ? { ...c, payload: new ArrayBufferSlice(comparison) } : c);
    equal(readSwitchStartupAppearance(p, nonContactWait), null);
});

test('gravity switch uses its own source ball height and size with pre-contact state one', { skip: !available }, () => {
    const f = fixture('ROCKY_HARD_PLACE'), p = f.objects[68];
    const ball = buildSwitchBall(new RSPSharedOutput(), 68, p, f.table.get(p.id)!, f.dat, f.commands);
    equal(readSwitchStartupAppearance(p, f.commands)!.boundaryCommandIndex, 350);
    equal(ball.switchBall!.state, 1); deepEqual(ball.textureIndices, [504]);
    equal(ball.center[1], p.y + p.scale * 6 / 256);
    equal(ball.switchBall!.size, Math.trunc(p.scale * 0.2) * 3 / 256);
});

test('unsupported linked setup keeps source spawn presentation until the dedicated runtime updates it', { skip: !available }, () => {
    const f = fixture('HAVE_A_NICE_DAY'), p = f.objects[30];
    equal(readSwitchStartupAppearance(p, f.commands), null);
    const ball = buildSwitchBall(new RSPSharedOutput(), 30, p, f.table.get(p.id)!, f.dat, f.commands);
    equal(ball.switchBall!.state, 1);
    const off = fixture('ROCKY_HARD_PLACE');
    equal(buildSwitchBalls(new RSPSharedOutput(), off.objects, off.table, off.dat, off.commands)[0].switchBall!.state, 0);
});

test('hidden switch balls respect visibility and ordinary object types do not acquire balls', { skip: !available }, () => {
    const f = fixture('ROCKY_HARD_PLACE'), p = { ...f.objects[5], commandReferenceIdx: 0, unkC: 40 };
    equal(buildSwitchBalls(new RSPSharedOutput(), [p], f.table, f.dat, []).length, 0);
    ok(!buildSwitchBalls(new RSPSharedOutput(), [f.objects[0]], f.table, f.dat, f.commands).length);
});

test('lever indicators use category 32, dim/bright red, and source rotated fixed offsets', { skip: !available }, () => {
    const f = fixture('HONEYMOON_LAGOON'), p = f.objects[30];
    const output = new RSPSharedOutput(), calls = buildLeverLights(output, f.objects, f.table, f.dat, f.commands);
    const c = calls.find(c => c.objectPlacementIndex === 30)!;
    equal(c.DP_PrimColor[0], 1); deepEqual(Array.from(c.DP_EnvColor), [1, 0, 0, 0]);
    deepEqual(c.textureIndices, [560]); ok(c.objectStateColor); equal(c.switchBall, null);
    equal(c.leverLight!.size, (p.scale >> 2) * 3 / 256);
    const off = { ...p, commandReferenceIdx: 0, angle: 90, zRotation: 0, scale: 2048 };
    const rotated = buildLeverLights(output, [off], f.table, f.dat, [])[0];
    const height = f.table.get(p.id)!.collideHeight;
    deepEqual(Array.from(rotated.center), [off.x + 4, off.y + height / 2, 7168 - (off.z - 15)]);
    const tilted = buildLeverLights(output, [{ ...off, angle: 0, zRotation: 90 }], f.table, f.dat, [])[0];
    deepEqual(Array.from(tilted.center), [off.x + 15, off.y + height / 2 + 4, 7168 - off.z]);
    const hidden = { ...off, unkC: 40 };
    equal(buildLeverLights(output, [hidden], f.table, f.dat, []).length, 0);
    const jungle = fixture('JUNGLE_DOLDRUMS');
    const dim = buildLeverLights(output, jungle.objects, jungle.table, jungle.dat, jungle.commands).find(c => c.objectPlacementIndex === 52)!;
    ok(Math.abs(dim.DP_PrimColor[0] - 64 / 255) < 1e-7);
});

test('all 23 placed levers receive indicators while active and gravity balls remain separate', { skip: !available }, () => {
    let total = 0;
    for (const level of LEVELS) {
        const f = fixture(level.id);
        const calls = buildLeverLights(new RSPSharedOutput(), f.objects, f.table, f.dat, f.commands);
        ok(calls.every(c => f.table.get(f.objects[c.objectPlacementIndex!].id)!.renderMode === 12));
        total += calls.length;
    }
    equal(total, 23);
});


test('lamp callbacks add only the three explicitly coloured pilot glows', { skip: !available }, () => {
    const matches: string[] = [];
    for (const level of LEVELS) {
        const f = fixture(level.id), output = new RSPSharedOutput();
        for (const call of buildLampGlows(output, f.objects, f.table, f.dat, f.commands)) {
            matches.push(`${level.id}:${call.objectPlacementIndex}`);
            const p = f.objects[call.objectPlacementIndex!], scale = f.table.get(p.id)!.scaleOverride || p.scale || 2048;
            deepEqual(readLampStartup(p, f.commands)!.rgb, [255, 20, 20]);
            deepEqual(Array.from(call.center), [p.x, p.y + scale * 570 / 65536, 7168 - p.z]);
            deepEqual(call.textureIndices, [562]); equal(call.projectedObjectSprite!.size, scale * 2 * 3 / 256);
            equal(call.DP_PrimColor[0], 1); ok(Math.abs(call.DP_PrimColor[1] - 20 / 255) < 1e-7);
            equal(call.DP_PrimColor[1], call.DP_EnvColor[1]); equal(call.DP_EnvColor[3], 0);
        }
    }
    deepEqual(matches, ['GIVE_A_DOG_A_BONUS:0', 'GIVE_A_DOG_A_BONUS:1', 'GIVE_A_DOG_A_BONUS:2']);
});

function lampCommands(...records: number[][]) {
    const bytes = Uint8Array.from([0, 0, ...records.flatMap(([op, ...p]) => [0, op, ...Array.from({ length: 8 }, (_, i) => p[i] ?? 0)])]);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}

test('lamp setup rejects dynamic/linked flow and stops before later state changes', { skip: !available }, () => {
    const f = fixture('GIVE_A_DOG_A_BONUS'), p = { ...f.objects[0], commandReferenceIdx: 1, commandsLength: 0 };
    const red = [0x3D, 0, 255, 0, 0, 0, 0, 0, 0];
    const bank = lampCommands(red, [9], [0x0F, 0, 0]);
    equal(readLampStartup(p, bank)!.state, 1);
    for (const record of [[0x14, 0, 1], [0x48], [0x03], [0x3D, 127, 127]])
        equal(readLampStartup(p, lampCommands(record, red, [9])), null);
    equal(readLampStartup({ ...p, commandReferenceIdx: 0 }, [])!.rgb[0], 0);
    equal(buildLampGlows(new RSPSharedOutput(), [p], f.table, f.dat, lampCommands(red, [0x0F, 0, 0], [9])).length, 0);
    // Material 40 suppresses ordinary rendering, not this independently queued callback effect.
    equal(buildLampGlows(new RSPSharedOutput(), [{ ...p, unkC: 40 }], f.table, f.dat, bank).length, 1);
});
