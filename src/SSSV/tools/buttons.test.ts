import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RainButtonRuntime, readRainButton } from "../buttons.js";
import { RainSimulation } from "../rain.js";
import { findPayload, LevelPayloadType, MAP_X_POINTS, MAP_Z_POINTS, parseLevelContainer, parseLevelDat, parseMap, parseObjects } from "../level.js";
import { parseCommands } from "../paths.js";
import { LEVELS } from "../level_table.js";
import type { Camera } from "../../Camera.js";
import { RSPSharedOutput, Vertex } from "../../BanjoKazooie/f3dex.js";
import { SSSVDrawCall, SSSVLayer } from "../terrain.js";
import { pickButton, rayTriangle } from "../button_input.js";
import { mat4 } from "gl-matrix";
import { CommandVM } from "../command_vm.js";

const available = existsSync("data/SSSV/levels/JUNGLE_DOLDRUMS.bin");

function fixture() {
    const p = parseLevelContainer(ArrayBufferSlice.fromView(readFileSync('data/SSSV/levels/JUNGLE_DOLDRUMS.bin')));
    const placements = parseObjects(findPayload(p, LevelPayloadType.Cob)!);
    const commands = parseCommands(findPayload(p, LevelPayloadType.Cmd));
    const config = readRainButton(placements, commands)!;
    const map = parseMap(findPayload(p, LevelPayloadType.Map)!);
    const dat = parseLevelDat(findPayload(p, LevelPayloadType.Dat)!);
    return { placements, commands, config, map, dat };
}

test('rain lever resolves through its initial object assignment and validates the entire cycle', { skip: !available }, () => {
    const { placements, commands, config } = fixture();
    ok(config); equal(config.placementIndex, 52); equal(config.scriptBase, 259);
    equal(readRainButton(placements.map(p => ({ ...p, commandsLength: 1 })), commands), null);
    equal(readRainButton(placements.map(p => ({ ...p, commandReferenceIdx: 0, unk12: p.commandReferenceIdx })), commands), null);
    commands[263].raw.createDataView().setUint8(9, 0);
    equal(readRainButton(placements, commands), null);
});

test('click supplies one contact, delays preserve the authored 300/360-tick transitions, and busy clicks are ignored', { skip: !available }, () => {
    const r = new RainButtonRuntime(fixture().config);
    equal(r.activate(), false); r.setEnabled(true);
    equal(r.ready, true); equal(r.state, 0); equal(r.rainCount, 0);
    equal(r.activate(), true); equal(r.activate(), false); r.step();
    deepEqual([r.state, r.rainCount, r.ready], [1, 4, false]);
    for (let i = 1; i < 300; i++) { r.step(); equal(r.activate(), false); }
    equal(r.state, 1); r.step(); deepEqual([r.state, r.rainCount], [0, 4]);
    for (let i = 301; i < 360; i++) r.step();
    equal(r.rainCount, 4); r.step(); deepEqual([r.state, r.rainCount, r.ready], [0, 0, true]);
    equal(r.activate(), true); r.step(); equal(r.rainCount, 4);
    r.setEnabled(false); deepEqual([r.state, r.rainCount, r.ready], [0, 0, false]);
});

test('rain facade executes the original bank through the shared VM with independent instance state', { skip: !available }, () => {
    const { config, commands } = fixture();
    equal(config.commands, commands);
    const original = commands.map(c => Buffer.from(c.raw.copyToBuffer()).toString('hex'));
    const a = new RainButtonRuntime(config), b = new RainButtonRuntime(config);
    ok(a.vm instanceof CommandVM); equal(a.vm.status, 'stopped');
    a.setEnabled(true); b.setEnabled(true);
    equal(a.vm.location.commandIndex, 260); equal(a.vm.location.scriptBase, 259);
    deepEqual(a.vm.trace.map(t => t.opcode), [0x0F, 0x03]);
    a.activate(); a.step(); b.step();
    equal(a.vm.location.commandIndex, 264); equal(a.vm.location.tick, 1);
    equal(a.rainCount, 4); equal(b.rainCount, 0); equal(b.ready, true);
    a.reset(); equal(a.vm.location.tick, 0); equal(a.vm.location.commandIndex, 260);
    equal(a.ready, true); equal(a.rainCount, 0); equal(a.error, null);
    b.activate(); b.step(); a.setEnabled(false);
    equal(a.vm.status, 'stopped'); equal(b.rainCount, 4); equal(b.state, 1);
    deepEqual(commands.map(c => Buffer.from(c.raw.copyToBuffer()).toString('hex')), original);
});

const camera = { worldMatrix: mat4.create(), fovY: 45 };
function simulation(upper = 0, water = 0) {
    const { config, dat } = fixture();
    const map = Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({ unk0: 100, unk1: upper, unk2: 0, unk3: upper ? 1 : 0, unk4: 0, unk5: 0, unk6: water, unk7: 0 }));
    return new RainSimulation(config, map, dat);
}

test('rain contacts use collision ground, upper surfaces and water independently of rendered geometry', { skip: !available }, () => {
    const ground = simulation(); ground.spawnDrop(1000, 1000, 820);
    for (let i = 0; i < 5; i++) ground.step(camera);
    equal(ground.impactCount, 1); ok(ground.particles.some(p => p.id === 58 && p.y === 808 * 65536));
    const upper = simulation(150); upper.spawnDrop(1000, 1000, 1220);
    for (let i = 0; i < 4; i++) upper.step(camera);
    equal(upper.impactCount, 1); ok(upper.particles.some(p => p.id === 58 && p.y === 1208 * 65536));
    upper.spawnDrop(1000, 1000, 1100); equal(upper.particles.filter(p => p.id === 57).length, 0);
    const water = simulation(0, 225);
    for (let n = 0; n < 12; n++) water.spawnDrop(1000 + n, 1000, 899);
    water.step(camera); equal(water.impactCount, 12);
    ok(water.particles.some(p => p.id === 19)); ok(water.particles.every(p => p.y === 900 * 65536));
});

test('disable, reset and discontinuous seeks clear the rain cycle and particles', { skip: !available }, () => {
    const r = simulation(); r.setEnabled(true); r.advanceTo(20, camera); r.button.activate(); r.advanceTo(21, camera);
    equal(r.button.rainCount, 4); r.advanceTo(10, camera);
    equal(r.button.rainCount, 0); equal(r.button.ready, true); equal(r.particles.length, 0);
    r.button.activate(); r.advanceTo(11, camera); r.advanceTo(1000, camera); equal(r.button.rainCount, 0);
    r.spawnDrop(1000, 1000, 1000); r.setEnabled(false); equal(r.particles.length, 0); equal(r.button.activate(), false);
});

test('a VM fault preserves its diagnostic, stops emission and clears particles until explicit recovery', { skip: !available }, () => {
    const { config, commands, dat, map } = fixture(), r = new RainSimulation(config, map, dat);
    r.setEnabled(true);
    // Simulate a command changing after admission; do not admit a broader program.
    commands[263].opcode = 0x44;
    r.spawnDrop(1000, 1000, 2000); r.button.activate(); r.step(camera);
    equal(r.button.enabled, false); equal(r.button.ready, false); equal(r.button.rainCount, 0);
    equal(r.particles.length, 0); equal(r.button.vm.status, 'unsupported');
    equal(r.button.vm.diagnostic!.commandIndex, 263); ok(r.button.error!.includes('0x44'));
    equal(r.button.activate(), false);
    commands[263].opcode = 0x46; r.setEnabled(true);
    equal(r.button.error, null); equal(r.button.ready, true); equal(r.button.vm.location.tick, 0);
    r.button.activate(); r.step(camera); equal(r.button.rainCount, 4);
});

test('triangle picking rejects misses and triangles behind the camera, accepts both visible faces', () => {
    const a = [0, 0, 5], b = [1, 0, 5], c = [0, 1, 5];
    equal(rayTriangle([0.2, 0.2, 0], [0, 0, 1], a, b, c), 5);
    equal(rayTriangle([0.2, 0.2, 0], [0, 0, 1], a, c, b), 5);
    equal(rayTriangle([2, 2, 0], [0, 0, 1], a, b, c), null);
    equal(rayTriangle([0.2, 0.2, 0], [0, 0, -1], a, b, c), null);
});

test('only the Jungle rain lever is admitted across all extracted level banks', { skip: !available }, () => {
    const matches: string[] = [];
    for (const level of LEVELS) {
        const p = parseLevelContainer(ArrayBufferSlice.fromView(readFileSync(`data/SSSV/levels/${level.id}.bin`)));
        const objects = findPayload(p, LevelPayloadType.Cob);
        if (objects !== null && readRainButton(parseObjects(objects), parseCommands(findPayload(p, LevelPayloadType.Cmd))) !== null) matches.push(level.id);
    }
    deepEqual(matches, ['JUNGLE_DOLDRUMS']);
});

test('scene picking respects opaque occluders, placement identity and hidden meshes', () => {
    const camera = { worldMatrix: mat4.create(), clipFromWorldMatrix: mat4.perspective(mat4.create(), Math.PI / 3, 1, 1, 1000) } as Camera;
    const output = new RSPSharedOutput();
    for (const z of [-5, -3]) for (const [x, y] of [[-1, -1], [1, -1], [0, 1]]) {
        const v = new Vertex(); v.x = x; v.y = y; v.z = z; output.vertices.push(v);
    }
    output.indices.push(0, 1, 2, 3, 4, 5);
    const lever = new SSSVDrawCall(); lever.layer = SSSVLayer.Objects; lever.objectPlacementIndex = 52; lever.firstIndex = 0; lever.indexCount = 3;
    const wall = new SSSVDrawCall(); wall.layer = SSSVLayer.Terrain; wall.firstIndex = 3; wall.indexCount = 3;
    equal(pickButton(camera, 0, 0, output, [lever], 52), true);
    equal(pickButton(camera, 0, 0, output, [lever], 51), false);
    equal(pickButton(camera, 0, 0, output, [lever, wall], 52), false);
    wall.visible = false; equal(pickButton(camera, 0, 0, output, [lever, wall], 52), true);
    lever.visible = false; equal(pickButton(camera, 0, 0, output, [lever], 52), false);
});
