import { deepEqual, equal, match, ok, throws } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { CommandTickBudget, CommandVM } from "../command_vm.js";
import type { CommandVMConfig } from "../command_vm.js";
import { CommandWorld } from "../command_world.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseObjects } from "../level.js";
import { parseCommands } from "../paths.js";
import type { LevelCommand } from "../paths.js";

// JUNGLE_DOLDRUMS C259–273. Expected ticks below come from the source runner's
// delay post-decrement and jump advancement, not the existing rain interpreter.
const rainRecords = [
    "000f0000000000000000", "0003040008000000ffff", "000f0001000000000000", "00290004000000000000",
    "0046745aaf334100005b", "0006005a000000000000", "004674afaf41410000d3", "000600d2000000000000",
    "00140000000000000000", "000f0000000000000000", "004674ae00334100005a", "0006003c000000000000",
    "00290000000000000000", "00080000000000000000", "00090000000000000000",
];

function bank(...records: string[]): LevelCommand[] {
    const body = Buffer.from(records.join(''), 'hex'), data = Buffer.alloc(2 + body.length);
    data.writeUInt16BE(data.length); body.copy(data, 2);
    return parseCommands(ArrayBufferSlice.fromView(data));
}
const record = (opcode: number, ...words: number[]) => opcode.toString(16).padStart(4, '0') + Array.from({ length: 4 }, (_, i) => ((words[i] ?? 0) & 65535).toString(16).padStart(4, '0')).join('');
const stop = record(9), nop = record(0), state = (n: number) => record(15, n), delay = (n: number) => record(6, n);
const contact = "0003040008000000ffff";
function setup(commands: readonly LevelCommand[], options: Partial<CommandVMConfig> = {}) {
    const world = new CommandWorld([{ id: 'owner', typeId: 45, references: new Map([[1, 'linked']]), temporaries: [2] },
        { id: 'linked', typeId: 28, temporaries: [4] }], 'silent');
    return { world, vm: new CommandVM({ owner: 'owner', commands, scriptBase: 0, traceCapacity: 128, ...options }, world) };
}

function checkRainCycle(commands: readonly LevelCommand[], scriptBase: number, owner: string): void {
    const world = new CommandWorld([{ id: owner, typeId: 45 }], 'silent'), entity = world.getEntity(owner)!;
    const vm = new CommandVM({ owner, commands, scriptBase, traceCapacity: 2048 }, world);
    const original = commands.map(c => Buffer.from(c.raw.copyToBuffer()).toString('hex'));
    vm.step(0); equal(vm.status, 'waiting'); equal(entity.state, 0); equal(world.rainCount, 0);
    entity.contactFlags = 8; vm.step(1); entity.contactFlags = 0;
    equal(entity.state, 1); equal(world.rainCount, 4);
    for (let tick = 2; tick <= 360; tick++) {
        vm.step(tick);
        equal(entity.state, tick < 301 ? 1 : 0, `state at tick ${tick}`);
        equal(world.rainCount, 4);
    }
    vm.step(361); equal(entity.state, 0); equal(world.rainCount, 0);
    equal(vm.location.cursor, 1); equal(vm.status, 'waiting'); equal(vm.diagnostic, null);
    deepEqual(vm.trace.filter(t => t.opcode === 0x46).map(t => [t.tick, t.commandIndex - scriptBase]), [[1, 4], [91, 6], [301, 10]]);
    deepEqual(vm.trace.filter(t => t.opcode === 0x0F).map(t => [t.tick, t.commandIndex - scriptBase]), [[0, 0], [1, 2], [301, 9]]);
    deepEqual(vm.trace.filter(t => t.opcode === 0x29).map(t => t.tick), [1, 361]);
    entity.contactFlags = 8; vm.step(362); entity.contactFlags = 0;
    for (let tick = 363; tick <= 722; tick++) vm.step(tick);
    equal(entity.state, 0); equal(world.rainCount, 0); equal(vm.location.cursor, 1);
    deepEqual(commands.map(c => Buffer.from(c.raw.copyToBuffer()).toString('hex')), original);
}

test('source rain records run two full contact/delay/weather cycles without feature-specific execution', () => {
    checkRainCycle(bank(...rainRecords), 0, 'lever');
});

test('the real level assignment runs from its nonzero command-bank base', { skip: !existsSync('data/SSSV/levels/JUNGLE_DOLDRUMS.bin') }, () => {
    const payloads = parseLevelContainer(ArrayBufferSlice.fromView(readFileSync('data/SSSV/levels/JUNGLE_DOLDRUMS.bin')));
    const commands = parseCommands(findPayload(payloads, LevelPayloadType.Cmd));
    const placement = parseObjects(findPayload(payloads, LevelPayloadType.Cob)!)[52];
    equal(placement.id, 45); equal(placement.commandReferenceIdx, 260); equal(placement.commandsLength, 0);
    deepEqual(commands.slice(259, 274).map(c => Buffer.from(c.raw.copyToBuffer()).toString('hex')), rainRecords);
    checkRainCycle(commands, placement.commandReferenceIdx - 1, 'object:52');
});

test('zero/negative delays continue immediately; positive N yields exactly N ticks', () => {
    const { vm, world } = setup(bank(delay(0), delay(-2), delay(1), state(7), stop));
    equal(vm.step(10), 3); equal(vm.status, 'waiting'); equal(vm.location.cursor, 2);
    equal(world.getEntity('owner')!.state, 1);
    equal(vm.step(10), 0); equal(vm.location.cursor, 2);
    equal(vm.step(11), 3); equal(vm.status, 'stopped'); equal(world.getEntity('owner')!.state, 7);
});

test('delay resolves the issuer variable once, while weather resolves the selected entity', () => {
    const { vm, world } = setup(bank(record(0x14, 1), record(0x29, 0x7F7F), delay(0x7F7F), state(7), stop));
    vm.step(0); equal(world.rainCount, 4); equal(vm.location.target, 'linked');
    world.getEntity('owner')!.temporaries[0] = 100;
    vm.step(1); equal(vm.status, 'waiting');
    vm.step(2); equal(vm.status, 'stopped'); equal(world.getEntity('linked')!.state, 7);
    equal(world.getEntity('owner')!.state, 1);
});

test('delay has a signed 16-bit counter and -1 reuses its previous value', () => {
    const { vm } = setup(bank(delay(-32768), delay(-1), stop));
    vm.step(0); equal(vm.status, 'waiting'); equal(vm.location.cursor, 1);
    match(vm.waitReason!, /32767/);
    const fresh = setup(bank(delay(-1), state(9), stop));
    fresh.vm.step(0); equal(fresh.vm.status, 'stopped'); equal(fresh.world.getEntity('owner')!.state, 9);
    const truncated = setup(bank(delay(0x7F7F), state(9), stop));
    truncated.world.getEntity('owner')!.temporaries[0] = 65537;
    truncated.vm.step(0); equal(truncated.vm.status, 'waiting');
    truncated.vm.step(1); equal(truncated.vm.status, 'stopped');
});

test('jump writes the local eight-bit cursor before the outer runner increments it', () => {
    const { vm, world } = setup(bank(nop, nop, record(8, 1), state(999), state(7), stop), { scriptBase: 2 });
    vm.step(0); equal(world.getEntity('owner')!.state, 7); equal(vm.status, 'stopped');
    deepEqual(vm.trace.map(t => t.commandIndex), [2, 4, 5]);
    const loop = setup(bank(delay(1), record(8, -1)));
    loop.vm.step(0); loop.vm.step(1);
    deepEqual(loop.vm.trace.map(t => t.cursor), [0, 0, 1, 0]); equal(loop.vm.status, 'waiting');
    const wrap = setup(bank(state(8), stop, ...Array.from({ length: 254 }, () => nop)), { initialCursor: 255 });
    wrap.vm.step(0); deepEqual(wrap.vm.trace.map(t => t.cursor), [255, 0, 1]); equal(wrap.world.getEntity('owner')!.state, 8);
});

test('self and links are resolved from the issuer, not the previous selected target', () => {
    const { vm, world } = setup(bank(record(0x14, 1), state(2), record(0x14, 0), state(3), stop));
    vm.step(0); equal(world.getEntity('linked')!.state, 2); equal(world.getEntity('owner')!.state, 3);
    equal(vm.location.target, 'owner');
});

test('a linked reference is captured until reselected; current-player reference refreshes each tick', () => {
    const { vm, world } = setup(bank(record(0x14, 1), delay(1), state(2), stop));
    vm.step(0); world.getEntity('owner')!.references.set(1, 'owner'); vm.step(1);
    equal(world.getEntity('linked')!.state, 2); equal(world.getEntity('owner')!.state, 1);
    const player = setup(bank(record(0x14, 9), delay(1), state(3), stop));
    player.world.currentPlayer = 'linked'; player.vm.step(0);
    player.world.currentPlayer = 'owner'; player.vm.step(1);
    equal(player.world.getEntity('owner')!.state, 3); equal(player.world.getEntity('linked')!.state, 1);
});

test('contact masks and inversion are observed without consuming external contact input', () => {
    for (const mask of [1, 2, 4, 8, 16]) {
        const { vm, world } = setup(bank(record(3, 0x0400, mask << 8), state(8), stop));
        vm.step(0); equal(vm.status, 'waiting'); world.getEntity('owner')!.contactFlags = mask;
        vm.step(1); equal(vm.status, 'stopped'); equal(world.getEntity('owner')!.contactFlags, mask);
    }
    const inverted = setup(bank(record(3, 0x8400, 0x0800), stop));
    inverted.world.getEntity('owner')!.contactFlags = 8; inverted.vm.step(0); equal(inverted.vm.status, 'waiting');
    inverted.world.getEntity('owner')!.contactFlags = 0; inverted.vm.step(1); equal(inverted.vm.status, 'stopped');
});

test('unimplemented predicates and qualified contacts suspend instead of guessing', () => {
    for (const instruction of [record(3, 0x0500), record(3, 0x0400, 0x2800), record(3, 0x4500, 0x0800)]) {
        const { vm, world } = setup(bank(instruction, state(99), stop));
        world.getEntity('owner')!.contactFlags = 8; vm.step(0);
        equal(vm.status, 'unsupported'); equal(vm.diagnostic!.kind, 'unsupported'); equal(vm.location.cursor, 0);
        equal(world.getEntity('owner')!.state, 1);
    }
});

test('state writes are raw u16; weather is an unsigned operand lookup followed by a u16 store', () => {
    const { vm, world } = setup(bank(state(0x7F7F), record(0x29, 0x7F94), stop));
    vm.step(0); equal(world.getEntity('owner')!.state, 0x7F7F); equal(world.rainCount, 0x7F7F);
    const weather = setup(bank(record(0x29, 0x7F7F), state(-1), stop));
    weather.world.getEntity('owner')!.temporaries[0] = -1; weather.vm.step(0);
    equal(weather.world.rainCount, 65535); equal(weather.world.getEntity('owner')!.state, 65535);
    const unsigned = setup(bank(record(0x29, -1), stop));
    unsigned.vm.step(0); equal(unsigned.vm.status, 'unsupported'); equal(unsigned.world.rainCount, 0);
});

test('audio configuration resolves its signed operand, sets its flag and resets its timer under explicit silent policy', () => {
    const commands = bank(record(0x46, 0x1234, 0x5678, 0x1201, -2), stop), { vm, world } = setup(commands);
    world.getEntity('owner')!.audioAge = 77; vm.step(0);
    deepEqual(Array.from(world.getEntity('owner')!.audioConfiguration!), [0x12, 0x34, 0x56, 0x78, 0x12, 5, 255, 254]);
    equal(world.getEntity('owner')!.audioAge, 0); equal(commands[0].payload.createDataView().getUint8(5), 1);
    const unavailable = new CommandWorld([{ id: 'owner', typeId: 45 }]);
    const blocked = new CommandVM({ owner: 'owner', commands, scriptBase: 0 }, unavailable);
    blocked.step(0); equal(blocked.status, 'unsupported'); equal(unavailable.getEntity('owner')!.audioConfiguration, null);
    const dynamic = setup(bank(record(0x14, 1), record(0x46, 0, 0, 0, 0x7F7F), stop));
    dynamic.vm.step(0); equal(new DataView(dynamic.world.getEntity('linked')!.audioConfiguration!.buffer).getInt16(6), 4);
});

test('shared command banks retain independent mutable delay copies and per-owner state', () => {
    const commands = bank(delay(0x7F7F), state(7), stop), { vm: first, world } = setup(commands);
    const second = new CommandVM({ owner: 'linked', commands, scriptBase: 0 }, world);
    first.step(0); second.step(0);
    equal(commands[0].payload.createDataView().getInt16(0), 0x7F7F);
    first.step(1); second.step(1); first.step(2); second.step(2);
    equal(first.status, 'stopped'); equal(second.status, 'waiting');
    second.step(3); second.step(4); equal(second.status, 'stopped');
});

test('reset discards execution state and faults without implicitly restoring host state', () => {
    const { vm, world } = setup(bank(state(7), delay(1), record(0x44), stop));
    vm.step(10); vm.step(11); equal(vm.status, 'unsupported'); equal(vm.diagnostic!.opcode, 0x44);
    vm.reset(); equal(vm.status, 'running'); equal(vm.location.tick, null); equal(vm.location.cursor, 0);
    equal(vm.trace.length, 0); equal(vm.diagnostic, null); equal(world.getEntity('owner')!.state, 7);
    vm.step(0); equal(vm.status, 'waiting'); vm.stop(); equal(vm.step(1), 0); equal(vm.status, 'stopped');
    vm.reset(); vm.step(0); equal(vm.status, 'waiting');
});

test('missing links and deleted entities are distinct from unsupported reference kinds', () => {
    const missing = setup(bank(record(0x14, 2), state(3), stop));
    missing.vm.step(0); equal(missing.vm.location.target, null); equal(missing.vm.status, 'faulted');
    equal(missing.vm.diagnostic!.kind, 'invalid-reference');
    const unknown = setup(bank(record(0x14, 10), state(3), stop));
    unknown.vm.step(0); equal(unknown.vm.status, 'unsupported'); equal(unknown.vm.location.target, 'owner');
    const deleted = setup(bank(record(0x14, 1), delay(1), state(3), stop));
    deleted.vm.step(0); deleted.world.deleteEntity('linked'); deleted.vm.step(1);
    equal(deleted.vm.diagnostic!.kind, 'invalid-reference'); equal(deleted.vm.diagnostic!.target, 'linked');
    const noOwner = setup(bank(nop, stop)); noOwner.world.deleteEntity('owner'); noOwner.vm.step(0);
    equal(noOwner.vm.diagnostic!.kind, 'invalid-reference');
});

test('literal global writes can run after a null selection, but unknown fields never become zero', () => {
    const literal = setup(bank(record(0x14, 2), record(0x29, 4), stop));
    literal.vm.step(0); equal(literal.vm.status, 'stopped'); equal(literal.world.rainCount, 4);
    const field = setup(bank(delay(0x7F82), state(99), stop));
    field.vm.step(0); equal(field.vm.status, 'unsupported'); equal(field.world.getEntity('owner')!.state, 1);
});

test('program and scene instruction budgets fault with exact command provenance', () => {
    const { vm } = setup(bank(record(8, -1)), { scriptBase: 0, maxInstructionsPerTick: 5 });
    equal(vm.step(0), 5); equal(vm.status, 'faulted'); equal(vm.diagnostic!.kind, 'instruction-budget');
    deepEqual([vm.diagnostic!.owner, vm.diagnostic!.commandIndex, vm.diagnostic!.cursor, vm.diagnostic!.opcode, vm.diagnostic!.tick], ['owner', 0, 0, 8, 0]);
    const a = setup(bank(nop, nop, stop)), b = setup(bank(nop, stop)), budget = new CommandTickBudget(4);
    equal(a.vm.step(0, budget), 3); equal(a.vm.status, 'stopped');
    equal(b.vm.step(0, budget), 1); equal(budget.remaining, 0); equal(b.vm.status, 'faulted');
    match(b.vm.diagnostic!.reason, /Scene/); equal(b.vm.diagnostic!.commandIndex, 1);
});

test('trace is optional and bounded; invalid data and discontinuous ticks require explicit recovery', () => {
    const { vm } = setup(bank(delay(100), stop), { traceCapacity: 2 });
    for (let tick = 0; tick < 4; tick++) vm.step(tick);
    equal(vm.trace.length, 2); deepEqual(vm.trace.map(t => t.tick), [2, 3]);
    equal(vm.trace[0].payload.slice(0, 4), 'ffff');
    vm.step(10); equal(vm.status, 'faulted'); equal(vm.diagnostic!.kind, 'tick-discontinuity');
    const backwards = setup(bank(contact, stop)); backwards.vm.step(10); backwards.vm.step(9);
    equal(backwards.vm.diagnostic!.kind, 'tick-discontinuity');
    const invalid = setup(bank(nop)); invalid.vm.step(0); equal(invalid.vm.diagnostic!.kind, 'invalid-data');
    const malformed = bank(nop); malformed[0] = { ...malformed[0], payload: ArrayBufferSlice.fromView(new Uint8Array(7)) };
    const broken = setup(malformed); broken.vm.step(0); equal(broken.vm.diagnostic!.kind, 'invalid-data');
    const quiet = setup(bank(stop), { traceCapacity: 0 }); quiet.vm.step(0); equal(quiet.vm.trace.length, 0);
});

test('invalid VM configuration and duplicate world identities are rejected', () => {
    for (const options of [{ initialCursor: 256 }, { scriptBase: -1 }, { maxInstructionsPerTick: 0 }, { traceCapacity: -1 }])
        throws(() => setup(bank(stop), options), RangeError);
    throws(() => new CommandTickBudget(-1), RangeError);
    throws(() => new CommandWorld([{ id: 'same', typeId: 45 }, { id: 'same', typeId: 28 }]));
});
