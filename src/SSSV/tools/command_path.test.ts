import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import type { LevelObjectPlacement, LevelPath } from '../core/level.js';
import type { SSSVObjectData } from '../objects/objects.js';
import { CommandPathControllers } from '../commands/command_path.js';
import type { CommandPathRequest } from '../commands/command_path.js';
import { CommandObjectWorld } from '../commands/command_objects.js';
import { CommandVM, commandFailure, commandSuccess } from '../commands/command_vm.js';
import { parseCommands } from '../commands/paths.js';

const path: LevelPath = { index: 7, waypoints: [10, 12, 14, 16].map((x, i) => ({ x, y: 3 + i * 2, z: 20 })) };
const request: CommandPathRequest = { path, opcode: 0x34, speed: 128, direction: 1, mode: 1 };
const position = (world: IndependentWorld) => Array.from(world.body.fixedPosition, v => v / 65536);

// A separate direct-object host, with no Snow type IDs, scripts or puzzle inputs.
class IndependentWorld extends CommandObjectWorld {
    public readonly controllers = new CommandPathControllers();
    constructor(x = 672, y = 192, z = 1312) {
        super(new Map([[23, { id: 23, updateCallback: 0, behaviorFlags: 0x40, scaleOverride: 0 } as SSSVObjectData]]), () => null, 1);
        ok(this.createObject('crate', { id: 23, x, y, z, scale: 2048, angle: 0, zRotation: 0, unkC: 0,
            commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 } satisfies LevelObjectPlacement).ok);
    }
    public get body() { return this.objects.get('crate')!; }
    public executePathCommand(target: string | null, opcode: number, p: DataView) {
        if (target !== 'crate' || opcode !== 0x34 || p.getUint8(1) !== path.index) return commandFailure('Unadmitted fixture path');
        return commandSuccess(this.controllers.start(this.body, { path, opcode, speed: p.getUint8(3), direction: p.getInt8(5), mode: p.getUint8(6) }));
    }
    public override evaluateCondition(target: string | null, p: DataView) {
        if (target === 'crate' && (p.getUint8(0) & 0x3F) === 5) return commandSuccess(this.controllers.isComplete(this.body));
        return super.evaluateCondition(target, p);
    }
    public override advanceController(id: string): void {
        if (!this.controllers.advance(this.objects.get(id)!, this.getEntity(id)!.state)) super.advanceController(id);
    }
    public step(tick = 0, vm?: CommandVM): void { this.integrate('crate'); vm?.step(tick); this.advanceController('crate'); }
}

test('an independent VM host yields for a path and observes completion after endpoint integration and controller cleanup', () => {
    const world = new IndependentWorld();
    const records = ['00340007008000010100', '0003050000000016ffff', '000f0002000000000000', '00090000000000000000'];
    const bytes = Buffer.alloc(2 + records.length * 10); bytes.writeUInt16BE(bytes.length, 0);
    records.forEach((r, i) => Buffer.from(r, 'hex').copy(bytes, 2 + i * 10));
    const vm = new CommandVM({ owner: 'crate', commands: parseCommands(ArrayBufferSlice.fromView(bytes)), scriptBase: 0 }, world);
    world.body.yPerTick = 1;
    for (let tick = 0; tick <= 5; tick++) { world.step(tick, vm); equal(world.getEntity('crate')!.state, 1); equal(vm.diagnostic, null); }
    deepEqual([...world.body.fixedPosition], [69206016, 37748736, 85983240]); equal(world.controllers.isComplete(world.body), true);
    deepEqual([...world.body.velocity], [0, 0, 0]); equal(world.body.angle, 0);
    world.step(6, vm); equal(world.getEntity('crate')!.state, 2); equal(vm.status, 'stopped'); equal(world.body.angle, 1);
});

test('approach retries preserve their target and state zero retains the signed high-word stepping policy', () => {
    const world = new IndependentWorld(); world.body.fixedPosition.set([682.5, 185.5, 1314.5].map(v => v * 65536));
    const start = { ...request, opcode: 0x1D as const, speed: 4 };
    equal(world.controllers.start(world.body, start), 'wait'); equal(world.controllers.isComplete(world.body), false);
    const approach = world.controllers.approaches.get('crate')!;
    equal(world.controllers.start(world.body, { ...start, speed: 99 }), 'wait'); equal(world.controllers.approaches.get('crate'), approach);
    world.getEntity('crate')!.state = 0; world.step(); deepEqual([...world.body.velocity], [-32768, -32768, -32768]);
    world.step(); deepEqual(position(world), [682, 185, 1314]); deepEqual([...world.body.velocity], [0, 0, 0]);
    world.getEntity('crate')!.state = 1;
    for (let tick = 0; tick < 10 && world.controllers.approaches.size; tick++) world.step();
    deepEqual(position(world), [672, 192, 1312]); equal(world.controllers.isComplete(world.body), true);
    equal(world.controllers.start(world.body, start), 'yield'); equal(world.controllers.paths.get('crate')!.parameter, 0);
});

test('the source four-unit start tolerance is inclusive', () => {
    const near = new IndependentWorld(676, 196, 1316), far = new IndependentWorld(677, 192, 1312);
    equal(near.controllers.start(near.body, { ...request, opcode: 0x1D }), 'yield');
    equal(far.controllers.start(far.body, { ...request, opcode: 0x1D }), 'wait');
});

test('finite reversal resumes the saved endpoint parameter and finishes at the original start', () => {
    const world = new IndependentWorld(); world.controllers.start(world.body, request);
    for (let tick = 0; tick < 6; tick++) world.step();
    equal(world.controllers.paths.get('crate')!.parameter, 640); equal(world.controllers.isComplete(world.body), true);
    equal(world.controllers.start(world.body, { ...request, direction: -1 }), 'yield');
    equal(world.controllers.paths.get('crate')!.parameter, 640);
    for (let tick = 0; tick < 6; tick++) world.step();
    // Float32 spline weights retain low fixed-point bits even at an endpoint.
    deepEqual([...world.body.fixedPosition], [44040196, 12582912, 85983240]); equal(world.controllers.paths.get('crate')!.parameter, 0);
    equal(world.controllers.isComplete(world.body), true);
});

test('looping wraps negative parameters and resume preserves progress when direction and speed change', () => {
    const world = new IndependentWorld();
    world.controllers.start(world.body, { ...request, mode: 0, direction: -1, speed: 200 });
    world.getEntity('crate')!.state = 0; world.step();
    equal(world.controllers.paths.get('crate')!.parameter, 312); equal(world.controllers.isComplete(world.body), false);
    world.controllers.start(world.body, { ...request, mode: 0, speed: 7 });
    equal(world.controllers.paths.get('crate')!.parameter, 312); world.step();
    equal(world.controllers.paths.get('crate')!.parameter, 319); equal(world.controllers.paths.size, 1);
});

test('replacement cancels path/approach control while completion still accounts for the host linear controller', () => {
    const world = new IndependentWorld(); world.controllers.start(world.body, request); world.step();
    const parameter = world.controllers.paths.get('crate')!.parameter;
    world.integrate('crate'); world.controllers.cancel('crate');
    const payload = new DataView(new ArrayBuffer(8)); payload.setInt16(4, 4); payload.setInt16(6, 128);
    ok(world.executeObjectCommand('crate', 'crate', 0x1C, payload).ok);
    equal(world.controllers.isComplete(world.body), false); world.advanceController('crate');
    equal(world.controllers.paths.get('crate')!.parameter, parameter);
    equal(world.body.movement!.progress, 128);
    world.controllers.start(world.body, request); equal(world.body.movement, null);
    world.controllers.start(world.body, { ...request, opcode: 0x1D });
    equal(world.controllers.approaches.size, 1); world.controllers.cancel('crate');
    equal(world.controllers.approaches.size, 0); equal(world.controllers.isComplete(world.body), true);
});

test('controller state belongs to each host instance and reconstruction starts empty', () => {
    const first = new IndependentWorld(), second = new IndependentWorld();
    first.controllers.start(first.body, request); first.step();
    equal(second.controllers.paths.size, 0); equal(second.controllers.isComplete(second.body), true);
    const replacement = new IndependentWorld(); equal(replacement.controllers.paths.size, 0); equal(replacement.controllers.approaches.size, 0);
    equal(first.controllers.paths.get('crate')!.parameter, 128);
});
