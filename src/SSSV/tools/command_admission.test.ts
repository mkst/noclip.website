import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { parseCommands } from '../commands/paths.js';
import { matchCommandRecords } from '../commands/command_admission.js';

const state = '000f0000000000000000', delay = '00060005000000000000', material = '00330002000000000000';
function bank(...records: string[]) {
    const bytes = Buffer.alloc(2 + records.length * 10); bytes.writeUInt16BE(bytes.length, 0);
    records.forEach((record, i) => Buffer.from(record, 'hex').copy(bytes, 2 + i * 10));
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}

test('exact signatures use the explicit bank base and local cursor without mutating records', () => {
    const commands = bank(state, delay, material), records = Object.freeze([material]);
    const before = commands.map(c => [...c.raw.createTypedArray(Uint8Array)]);
    for (const source of ['raw', 'decoded'] as const)
        deepEqual(matchCommandRecords(commands, { base: 1, cursor: 1, records, source }), { matched: true });
    deepEqual(commands.map(c => [...c.raw.createTypedArray(Uint8Array)]), before);
});

test('the first mismatch retains the absolute command location and both record values', () => {
    const commands = bank(state, delay, material); commands[1].payload.createDataView().setUint8(0, 0x7F);
    for (const source of ['raw', 'decoded'] as const)
        deepEqual(matchCommandRecords(commands, { base: 0, records: [state, delay, material], source }),
            { matched: false, commandIndex: 1, expected: delay, actual: '00067f05000000000000' });
});

test('truncated banks report the missing command rather than matching a partial signature', () => {
    for (const source of ['raw', 'decoded'] as const)
        deepEqual(matchCommandRecords(bank(state), { base: 0, records: [state, delay], source }),
            { matched: false, commandIndex: 1, expected: delay, actual: null });
});

test('raw and decoded admission preserve independent opcode mutation semantics', () => {
    const commands = bank(state);
    const pattern = { base: 0, records: [state] };
    commands[0].opcode = 6;
    equal(matchCommandRecords(commands, { ...pattern, source: 'raw' }).matched, true);
    deepEqual(matchCommandRecords(commands, { ...pattern, source: 'decoded' }),
        { matched: false, commandIndex: 0, expected: state, actual: '00060000000000000000' });
    commands[0].opcode = 15; commands[0].raw.createDataView().setUint16(0, 6);
    equal(matchCommandRecords(commands, { ...pattern, source: 'decoded' }).matched, true);
    equal(matchCommandRecords(commands, { ...pattern, source: 'raw' }).matched, false);
});

test('decoded opcode comparison remains numeric while raw record comparison stays exact', () => {
    const commands = bank(state), records = [state.replace('000f', '000F')];
    equal(matchCommandRecords(commands, { base: 0, records, source: 'decoded' }).matched, true);
    equal(matchCommandRecords(commands, { base: 0, records, source: 'raw' }).matched, false);
});

test('a bounded signature does not claim to validate the rest of its command bank', () => {
    const commands = bank(state, 'ffff0000000000000000');
    deepEqual(matchCommandRecords(commands, { base: 0, records: [state], source: 'decoded' }), { matched: true });
    deepEqual(matchCommandRecords(commands, { base: 999, records: [], source: 'raw' }), { matched: true });
});
