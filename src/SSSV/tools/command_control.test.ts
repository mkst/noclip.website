import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { CommandTickBudget, CommandVM, commandMath, commandSuccess } from "../commands/command_vm.js";
import { CommandWorld } from "../commands/command_world.js";
import { parseCommands } from "../commands/paths.js";

const record = (opcode: number, ...words: number[]) => opcode.toString(16).padStart(4, '0') + Array.from({ length: 4 }, (_, i) => ((words[i] ?? 0) & 65535).toString(16).padStart(4, '0')).join('');
const stop = record(9), nop = record(0), state = (value: number) => record(15, value);
const math = (left: number, right: number, third: number, field: number, ops: number) => record(0x3D, left, right, third, field * 256 + ops);
function bank(records: readonly string[]) {
    const body = Buffer.from(records.join(''), 'hex'), bytes = Buffer.alloc(body.length + 2);
    bytes.writeUInt16BE(bytes.length); body.copy(bytes, 2);
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}
function fixture(records: readonly string[]) {
    const world = new CommandWorld([{ id: 'owner', typeId: 24, references: new Map([[1, 'linked']]) }, { id: 'linked', typeId: 28 }], 'silent');
    return { world, vm: new CommandVM({ owner: 'owner', commands: bank(records), scriptBase: 0, traceCapacity: 128 }, world) };
}

// Active dispatcher 729078–729124: high operation nibble first, low nibble second.
test('assignment ignores unused operands; chained math and state destinations retain source widths', () => {
    const { vm, world } = fixture([math(10, 3, 2, 0, 0x13), math(5, 0x7FFF, 0x7FFF, 1, 0x0F), math(0x7F7F, 1, 0, 64, 0x10), math(0x7F9B, 4, 0, 28, 0x60), stop]);
    vm.step(0); equal(vm.status, 'stopped');
    deepEqual(Array.from(world.getEntity('owner')!.temporaries), [26, 5, 0]);
    equal(world.globals[0], 27); equal(world.taskBits, 4);
    const overflow = fixture([math(0x7F7F, 1, 0, 0, 0x10), stop]);
    overflow.world.getEntity('owner')!.temporaries[0] = 2147483647;
    overflow.vm.step(0); equal(overflow.world.getEntity('owner')!.temporaries[0], -2147483648);
    for (const [left, op, right, expected] of [[-9, 4, 2, -4], [-9, 7, 2, -1], [-8, 8, 33, -4], [3, 9, 33, 6], [7, 5, 3, 3]])
        deepEqual(commandMath(left, op, right), { ok: true, value: expected });
});

test('unsupported math/fields and invalid division suspend before a write', () => {
    for (const [instruction, status] of [[math(1, 0, 0, 0, 0x40), 'faulted'], [math(1, 2, 0, 0, 0xA0), 'unsupported'], [math(1, 0, 0, 6, 0), 'unsupported']] as const) {
        const { vm, world } = fixture([instruction, state(99), stop]);
        vm.step(0); equal(vm.status, status); equal(world.getEntity('owner')!.temporaries[0], 0); equal(world.getEntity('owner')!.state, 1);
    }
    equal(commandMath(-2147483648, 4, -1).ok, false);
});

test('existence, entity-type masks and signed comparisons support inversion', () => {
    const world = new CommandWorld([{ id: 'sheep', typeId: 289 }]);
    const condition = (header: number, a = 0, b = 0) => bank([record(3, header << 8, a, b)])[0].payload.createDataView();
    deepEqual(world.evaluateCondition(null, condition(0x86)), { ok: true, value: true });
    deepEqual(world.evaluateCondition('sheep', condition(0x96, 0x2000, 33)), { ok: true, value: false });
    deepEqual(world.evaluateCondition('sheep', condition(0x16, 0x2000, 33)), { ok: true, value: true });
    world.globals[9] = -1;
    for (const [predicate, expected] of [[17, true], [18, true], [19, false], [20, false], [21, false]] as const)
        deepEqual(world.evaluateCondition(null, condition(predicate, 0x7FC8, 0)), { ok: true, value: expected });
    deepEqual(world.evaluateCondition(null, condition(0x91, 0x7FC8, 0)), { ok: true, value: false });
});

test('ordinary branches use post-increment jumps; false groups skip consecutive branch records', () => {
    const ordinary = fixture([record(1, 0x0600, 0, 0, 1), state(99), state(7), stop]);
    ordinary.vm.step(0); equal(ordinary.world.getEntity('owner')!.state, 7);
    deepEqual(ordinary.vm.trace.map(t => t.commandIndex), [0, 2, 3]);
    const records = [record(1, 0x4400, 0x0800), record(1, 0x0600, 0, 0, 2), state(7), stop];
    const grouped = fixture(records); grouped.vm.step(0); deepEqual(grouped.vm.trace.map(t => t.cursor), [0, 2, 3]);
    const pass = fixture(records); pass.world.getEntity('owner')!.contactFlags = 8; pass.vm.step(0);
    deepEqual(pass.vm.trace.map(t => t.cursor), [0, 1, 3]); equal(pass.world.getEntity('owner')!.state, 1);
});

// Active dispatcher 7297C0–72990C saves loops and deferred predicates, but not
// the selected target, delay counter or rewind marker.
test('calls restore caller loop state/cursor while retaining the callee target', () => {
    const { vm, world } = fixture([record(4, 2), record(0x48, 8), math(0x7FBF, 1, 0, 64, 0x10), record(5), stop, nop, nop, nop,
        record(4, 3), math(0x7FC0, 1, 0, 65, 0x10), record(5), record(6, 1), record(0x14, 1), record(0x49)]);
    vm.step(0); equal(vm.status, 'waiting'); equal(vm.location.scriptBase, 8);
    vm.step(1); equal(vm.status, 'waiting'); vm.step(2);
    equal(vm.status, 'stopped'); equal(world.globals[0], 2); equal(world.globals[1], 6);
    equal(vm.location.scriptBase, 0); equal(vm.location.target, 'linked');
    equal(vm.trace.filter(t => t.opcode === 0x48).length, 2); equal(vm.trace.filter(t => t.opcode === 0x49).length, 2);
    vm.reset(); equal(vm.location.scriptBase, 0); equal(vm.location.cursor, 0);
});

test('return leaves the callee delay counter live for a caller sentinel', () => {
    const { vm, world } = fixture([record(0x48, 4), record(6, -1), state(7), stop, record(6, -32768), record(0x14, 1), record(0x49)]);
    vm.step(0); equal(vm.location.scriptBase, 0); equal(vm.location.cursor, 1); equal(vm.location.target, 'linked');
    equal(vm.status, 'waiting'); ok(vm.waitReason!.includes('32767')); equal(world.getEntity('linked')!.state, 1);
});

test('calls isolate and restore deferred predicates, evaluated next tick through their saved reference', () => {
    const { vm, world } = fixture([record(0x14, 1), record(2, 0x0400, 0x0800, 0, 3), record(0x48, 7), record(6, 10), state(7), stop, nop,
        record(2, 0x0400, 0x1000, 0, 9), record(6, 1), record(0x49), state(99), stop]);
    vm.step(0); equal(vm.location.scriptBase, 7);
    world.getEntity('linked')!.contactFlags = 8;
    vm.step(1); equal(vm.location.scriptBase, 0); equal(vm.location.cursor, 3); equal(vm.status, 'waiting');
    vm.step(2); equal(vm.status, 'stopped'); equal(world.getEntity('linked')!.state, 7); equal(world.getEntity('owner')!.state, 1);
});

test('rewind waits retain their marker across calls and close at an ordinary successful wait', () => {
    const { vm, world } = fixture([record(3, 0x4400, 0x0800), record(0x48, 5), record(3, 0x0400, 0x1000), stop, nop, state(9), record(0x49)]);
    world.getEntity('owner')!.contactFlags = 8; vm.step(0);
    equal(vm.status, 'waiting'); equal(vm.location.cursor, 0);
    world.getEntity('owner')!.contactFlags = 24; vm.step(1);
    equal(vm.status, 'stopped'); equal(vm.trace.filter(t => t.opcode === 0x48).length, 2);
});

test('deferred capacity, clear and evaluation budgets are explicit', () => {
    const condition = record(2, 0x0400, 0x0800, 0, 0);
    const overflow = fixture([condition, condition, condition, condition, condition, stop]);
    overflow.vm.step(0); equal(overflow.vm.diagnostic!.kind, 'invalid-data');
    const cleared = fixture([condition, record(0x3B), record(6, 1), state(7), stop]);
    cleared.vm.step(0); cleared.world.getEntity('owner')!.contactFlags = 8; cleared.vm.step(1);
    equal(cleared.vm.status, 'stopped'); equal(cleared.world.getEntity('owner')!.state, 7);
    const limited = fixture([condition, condition, condition, record(6, 10), stop]);
    limited.vm.step(0); equal(limited.vm.step(1, new CommandTickBudget(2)), 2);
    equal(limited.vm.diagnostic!.kind, 'instruction-budget');
});

test('nested calls, stray returns and out-of-bank calls fail explicitly', () => {
    for (const [records, kind] of [[[record(0x48, 1), record(0x48, 2), stop], 'unsupported'], [[record(0x49)], 'invalid-data'], [[record(0x48, 50)], 'invalid-data']] as const) {
        const { vm } = fixture(records); vm.step(0); equal(vm.diagnostic!.kind, kind);
    }
});

test('region enumeration includes objects, excludes transfer chips and shares its authored-order iterator', () => {
    const position = { x: 1400, y: 800, z: 900 };
    const world = new CommandWorld([{ id: 'a', typeId: 24, position: { ...position, x: 4000 } }, { id: 'b', typeId: 28, position },
        { id: 'chip', typeId: 318, position }, { id: 'sheep', typeId: 289, position }, { id: 'goat', typeId: 290, position }], 'silent',
        { regions: new Map([[0, [16, 9, 240, 26, 18, 12]]]) });
    const next = (owner: string, ref: number) => world.resolveReference(owner, null, ref, 0);
    deepEqual(next('a', 10), { ok: true, value: 'b' }); deepEqual(next('a', 11), { ok: true, value: 'sheep' });
    deepEqual(next('b', 10), { ok: true, value: 'b' }); deepEqual(next('a', 11), { ok: true, value: 'sheep' });
    deepEqual(next('a', 11), { ok: true, value: 'goat' }); deepEqual(next('a', 11), { ok: true, value: null });
    deepEqual(next('a', 11), { ok: true, value: null }); equal(world.resolveReference('a', null, 10, 99).ok, false);
});

test('messages require explicit policy, block the issuer and serialize owners until acknowledged', () => {
    const world = new CommandWorld([{ id: 'a', typeId: 24 }, { id: 'b', typeId: 28 }], 'silent', { acknowledgedMessages: new Set([3]) });
    const commands = bank([record(0x44, 3, 5), state(7), stop]);
    const a = new CommandVM({ owner: 'a', commands, scriptBase: 0 }, world), b = new CommandVM({ owner: 'b', commands, scriptBase: 0 }, world);
    a.step(0); b.step(0); deepEqual(world.message, { owner: 'a', id: 3, style: 5 });
    world.acknowledgeMessage('b'); a.step(1); equal(a.status, 'waiting');
    world.acknowledgeMessage('a'); a.step(2); equal(a.status, 'stopped'); equal(world.message, null);
    b.step(1); equal(b.status, 'waiting'); equal(world.message!.owner, 'b');
    world.acknowledgeMessage('b'); b.step(2); equal(b.status, 'stopped'); equal(world.getEntity('b')!.state, 7);
    const unsupported = fixture([record(0x44, 3, 5), stop]); unsupported.vm.step(0); equal(unsupported.vm.status, 'unsupported');
});

test('silent sound is nonblocking; positional sound still requires a live position', () => {
    const plain = fixture([record(0x26, 77, 0x5000, 0x7FFF), state(7), stop]); plain.vm.step(0);
    equal(plain.vm.status, 'stopped'); equal(plain.world.getEntity('owner')!.state, 7);
    const positional = fixture([record(0x26, 77, 0x5000, 0x7FFF, 0x100), stop]); positional.vm.step(0);
    equal(positional.vm.diagnostic!.kind, 'invalid-reference');
});

test('self program handoff replaces the bank/base and reloads a private delay without executing the old continuation', () => {
    const { vm, world } = fixture([record(4, 3), record(6, 1), record(0x0E, 5), state(99), stop, record(6, 2), state(7), stop]);
    vm.step(0); equal(vm.location.commandIndex, 1);
    vm.step(1); equal(vm.location.scriptBase, 5); equal(vm.location.commandIndex, 5); equal(world.getEntity('owner')!.state, 1);
    vm.step(2); equal(vm.status, 'waiting'); vm.step(3); equal(vm.status, 'stopped'); equal(world.getEntity('owner')!.state, 7);
    const invalid = fixture([record(0x0E, 100)]); invalid.vm.step(0); equal(invalid.vm.diagnostic!.kind, 'invalid-data');
});

test('opcode 7 yields in place until the captured deferred condition fires', () => {
    const { vm, world } = fixture([record(2, 0x0400, 0x0800, 0, 3), record(7), state(99), stop, state(7), stop]);
    vm.step(0); equal(vm.location.commandIndex, 1); equal(vm.status, 'waiting');
    vm.step(1); equal(vm.location.commandIndex, 1); equal(world.getEntity('owner')!.state, 1);
    world.getEntity('owner')!.contactFlags = 8; vm.step(2);
    equal(vm.status, 'stopped'); equal(world.getEntity('owner')!.state, 7);
});

test('foreign program assignment requires an explicit scheduler capability', () => {
    const { vm, world } = fixture([record(0x14, 1), record(0x0E, 3), stop, state(7), stop]);
    vm.step(0); equal(vm.status, 'unsupported'); equal(vm.location.commandIndex, 1);
    equal(world.getEntity('linked')!.state, 1);
});


test('object path commands can wait, advance-and-yield, or continue as distinct source results', () => {
    class PathWorld extends CommandWorld {
        calls = 0;
        executePathCommand() { return commandSuccess(++this.calls === 1 ? 'wait' as const : 'yield' as const); }
    }
    const world = new PathWorld([{ id: 'owner', typeId: 94 }]);
    const vm = new CommandVM({ owner: 'owner', commands: bank([record(0x1D), state(7), stop]), scriptBase: 0 }, world);
    vm.step(0); equal(vm.location.commandIndex, 0); equal(vm.status, 'waiting');
    vm.step(1); equal(vm.location.commandIndex, 1); equal(vm.status, 'waiting'); equal(world.getEntity('owner')!.state, 1);
    vm.step(2); equal(vm.status, 'stopped'); equal(world.getEntity('owner')!.state, 7);
});

test('reference writes use issuer-relative nested references and reject selected-target slot zero', () => {
    const w = new CommandWorld([{ id: 'owner', typeId: 94, references: new Map([[7, 'helper']]) }, { id: 'helper', typeId: 64 }]);
    const program = bank([record(0x14, 7), record(0x56, 7, 1, 0, 0), record(0x56, 0, 2, 0, 7), stop]);
    const vm = new CommandVM({ owner: 'owner', commands: program, scriptBase: 0 }, w); vm.step(0);
    equal(vm.status, 'stopped'); equal(w.getEntity('helper')!.references.get(1), 'owner'); equal(w.getEntity('owner')!.references.get(2), 'helper');
    const invalid = new CommandVM({ owner: 'owner', commands: bank([record(0x56, 0, 0, 0, 7)]), scriptBase: 0 }, w);
    invalid.step(0); equal(invalid.status, 'unsupported');
});

test('an unavailable animal slot retries the same instruction before continuing the issuer', () => {
    class SpawnWorld extends CommandWorld {
        attempts = 0;
        spawnAnimal() { return commandSuccess(++this.attempts > 1); }
    }
    const w = new SpawnWorld([{ id: 'owner', typeId: 64 }]);
    const vm = new CommandVM({ owner: 'owner', commands: bank([record(0x60), state(7), stop]), scriptBase: 0 }, w);
    vm.step(0); equal(vm.location.commandIndex, 0); equal(w.getEntity('owner')!.state, 1);
    vm.step(1); equal(vm.status, 'stopped'); equal(w.getEntity('owner')!.state, 7);
});
