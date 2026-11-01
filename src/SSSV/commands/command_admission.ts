import type { LevelCommand } from './paths.js';

export interface CommandRecordPattern {
    base: number;
    cursor?: number;
    records: readonly string[];
    source: 'raw' | 'decoded';
}

export type CommandRecordMatch = { matched: true } | {
    matched: false;
    commandIndex: number;
    expected: string;
    actual: string | null;
};

const hex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

// Keep raw-byte admission distinct from decoded fields, which fault tests can
// mutate independently. Feature metadata and dependency checks stay with callers.
export function matchCommandRecords(commands: readonly LevelCommand[], pattern: CommandRecordPattern): CommandRecordMatch {
    for (const [offset, expected] of pattern.records.entries()) {
        const commandIndex = pattern.base + (pattern.cursor ?? 0) + offset, command = commands[commandIndex];
        if (command === undefined) return { matched: false, commandIndex, expected, actual: null };
        const actual = pattern.source === 'raw' ? hex(command.raw.createTypedArray(Uint8Array))
            : command.opcode.toString(16).padStart(4, '0') + hex(command.payload.createTypedArray(Uint8Array));
        const matched = pattern.source === 'raw' ? actual === expected
            : command.opcode === parseInt(expected.slice(0, 4), 16) && actual.slice(4) === expected.slice(4);
        if (!matched) return { matched: false, commandIndex, expected, actual };
    }
    return { matched: true };
}
