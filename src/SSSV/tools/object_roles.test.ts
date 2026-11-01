import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import type { LevelObjectPlacement } from "../core/level.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseObjects } from "../core/level.js";
import { indexObjectTable, parseObjectTable } from "../objects/objects.js";
import { analyzeObjectRoles, describeObjectRoleReferences } from "../objects/object_roles.js";
import { parseCommands } from "../commands/paths.js";

const placement: LevelObjectPlacement = { id: 2, x: 0, y: 0, z: 0, angle: 0, zRotation: 0, unkC: 40, scale: 2048, commandReferenceIdx: 1, commandsLength: 0, unk12: 0, unk15: 0 };
function commands(...records: number[][]) {
    const bytes = Uint8Array.from([0, 0, ...records.flatMap(([op, ...payload]) => [0, op, ...Array.from({ length: 8 }, (_, i) => payload[i] ?? 0)])]);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}
function entry(callback = 0, mode = 6, trigger = 0) {
    const buffer = new ArrayBuffer(0x9C), v = new DataView(buffer);
    v.setUint16(0, placement.id); v.setUint8(3, mode); v.setUint32(0x84, callback); v.setUint8(0x88, trigger);
    return parseObjectTable(new ArrayBufferSlice(buffer))[0];
}
const contact = [0x03, 4, 0, 8];

test('role labels use callback metadata rather than an object name or type guess', () => {
    const p = { ...placement, id: 999, commandReferenceIdx: 0 };
    deepEqual(analyzeObjectRoles(p, entry(0x802FF540), []).roles, ['sound-source']);
    deepEqual(analyzeObjectRoles({ ...p, id: 141 }, entry(), []).roles, ['unresolved']);
    deepEqual(analyzeObjectRoles(placement, entry(0, 0), commands([9])).roles, ['controller']);
    deepEqual(analyzeObjectRoles(p, entry(0, 0), []).roles, ['unresolved']);
});

test('initial and event assignments preserve one-based base, startup cursor and validity separately', () => {
    const result = analyzeObjectRoles({ ...placement, commandReferenceIdx: 2, commandsLength: 1, unk12: 1 }, entry(), commands([9], contact, [9]));
    deepEqual(result.references, [{ activation: 'initial', base: 1, cursor: 1, valid: true }, { activation: 'event', base: 0, cursor: 0, valid: true }]);
    equal(describeObjectRoleReferences(result), 'init C1+1 · event C0');
    ok(!result.roles.includes('contact-trigger'));
    const bad = analyzeObjectRoles({ ...placement, commandReferenceIdx: 100 }, entry(), commands([9]));
    equal(bad.references[0].valid, false); ok(bad.diagnostics.length > 0); deepEqual(bad.roles, ['unresolved']);
});

test('a stop is a real boundary: an adjacent command bank script cannot label the preceding owner', () => {
    const result = analyzeObjectRoles(placement, entry(), commands([9], contact));
    deepEqual(result.roles, ['unresolved']); equal(result.evidence.some(e => e.commandIndex === 1), false);
});

test('contact, inverted contact and region checks have distinct source evidence', () => {
    const result = analyzeObjectRoles(placement, entry(), commands(contact, [0x03, 0x84, 0, 4], [0x03, 0, 0, 16, 6], [9]));
    deepEqual(result.roles, ['contact-trigger', 'region-trigger']);
    ok(result.evidence.some(e => e.commandIndex === 1 && e.detail.includes('Inverted')));
    ok(result.evidence.some(e => e.commandIndex === 2 && e.detail.includes('region 6')));
    ok(!result.roles.includes('proximity-trigger'));
    // Predicate 0's unconditional flag takes precedence over region flags.
    ok(!analyzeObjectRoles(placement, entry(), commands([0x03, 0, 0, 18, 6], [9])).roles.includes('region-trigger'));
});

test('conditions applied to another target are not attributed as contact at the marker position', () => {
    const result = analyzeObjectRoles(placement, entry(), commands([0x14, 0, 9], contact, [0x14], contact, [9]));
    deepEqual(result.evidence.filter(e => e.role === 'contact-trigger').map(e => e.commandIndex), [3]);
    ok(result.roles.includes('unresolved'));
});

test('local jumps and one-level calls follow runtime cursor increments without reading skipped code', () => {
    const skipped = analyzeObjectRoles(placement, entry(), commands([0x08, 0, 1], contact, [9]));
    ok(!skipped.roles.includes('contact-trigger'));
    const called = analyzeObjectRoles(placement, entry(), commands([0x48, 0, 2], [9], contact, [0x49]));
    deepEqual(called.roles, ['contact-trigger']); equal(called.evidence[0].commandIndex, 2);
    const loop = analyzeObjectRoles(placement, entry(), commands([0x08, 255, 255], contact));
    ok(!loop.roles.includes('contact-trigger'));
});

test('unknown flow, deferred conditions and runtime type changes remain explicitly partial', () => {
    for (const records of [ [[0x66], contact], [[0x3D, 0, 1, 0, 0, 0, 0, 32], contact] ]) {
        const r = analyzeObjectRoles(placement, entry(), commands(...records));
        deepEqual(r.roles, ['unresolved']); ok(r.diagnostics.length > 0);
    }
    const deferred = analyzeObjectRoles(placement, entry(), commands([0x02, 4, 0, 8], [0x46], [9]));
    deepEqual(deferred.roles, ['contact-trigger', 'unresolved']); ok(!deferred.roles.includes('sound-source'));
});

test('sound evidence distinguishes positional emitters from global sound requests and other targets', () => {
    ok(!analyzeObjectRoles(placement, entry(), commands([0x26], [9])).roles.includes('sound-source'));
    ok(analyzeObjectRoles(placement, entry(), commands([0x26, 0, 1, 0, 0, 0, 0, 1], [9])).roles.includes('sound-source'));
    ok(analyzeObjectRoles(placement, entry(), commands([0x46], [9])).roles.includes('sound-source'));
    ok(!analyzeObjectRoles(placement, entry(), commands([0x14, 0, 1], [0x46], [9])).roles.includes('sound-source'));
});

test('an installed event entry needs contact dispatch metadata before being called a contact trigger', () => {
    const p = { ...placement, commandReferenceIdx: 0, unk12: 1 }, bank = commands([9]);
    deepEqual(analyzeObjectRoles(p, entry(0, 6, 3), bank).roles, ['contact-trigger']);
    deepEqual(analyzeObjectRoles(p, entry(0, 6, 0), bank).roles, ['unresolved']);
});

test('proximity is proven only by an exact audited distance helper feeding a threshold test', () => {
    const records = ['00480004000000000000', '000311007fd204b00001', '00090000000000000000', '00090000000000000000',
        '00000000000000000000', '00140009000000000000', '003d7f85006400005300', '003d7f86006400005400',
        '00140000000000000000', '003d7fd27f8500005320', '003d7fd37f8600005420', '00000000000000000000',
        '006553007fd200000000', '006554007fd300000000', '003d7fd27fd300005310', '00490000000000000000'];
    const bytes = Uint8Array.from([0, 162, ...records.flatMap(r => r.match(/../g)!.map(h => parseInt(h, 16)))]);
    const bank = parseCommands(ArrayBufferSlice.fromView(bytes)), before = Array.from(bytes);
    const result = analyzeObjectRoles(placement, entry(), bank);
    deepEqual(result.roles, ['proximity-trigger']); ok(result.evidence[0].detail.includes('helper C4'));
    deepEqual(Array.from(bytes), before);
    bank[6].raw.createDataView().setUint8(5, 99);
    ok(!analyzeObjectRoles(placement, entry(), bank).roles.includes('proximity-trigger'));
    ok(!analyzeObjectRoles(placement, entry(), commands([0x03, 17, 0, 127, 210, 4, 176], [9])).roles.includes('proximity-trigger'));
});

const available = existsSync('data/SSSV/levels/THE_ENGINE_ROOM.bin');
const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
test('real hidden sound source and stopped boulder do not become guessed contact triggers', { skip: !available }, () => {
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    for (const [level, index] of [['THE_ENGINE_ROOM', 61], ['HAVE_A_NICE_DAY', 81]] as const) {
        const payload = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
        const p = parseObjects(findPayload(payload, LevelPayloadType.Cob)!)[index];
        const result = analyzeObjectRoles(p, table.get(p.id), parseCommands(findPayload(payload, LevelPayloadType.Cmd)));
        if (level === 'THE_ENGINE_ROOM') { equal(table.get(p.id)!.updateCallback, 0x802FF540); deepEqual(result.roles, ['sound-source']); equal(result.references.length, 0); }
        else { ok(!result.roles.includes('contact-trigger')); equal(describeObjectRoleReferences(result), 'init C756'); }
    }
});

test('real invisible placements expose contact and region evidence without resolving their visibility', { skip: !available }, () => {
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    for (const [level, index, role, commandIndex] of [
        ['BIG_CELEBRATION_PARADE', 108, 'contact-trigger', 1068],
        ['HAVE_A_NICE_DAY', 80, 'region-trigger', 735],
    ] as const) {
        const payload = parseLevelContainer(read(`data/SSSV/levels/${level}.bin`));
        const p = parseObjects(findPayload(payload, LevelPayloadType.Cob)!)[index];
        const result = analyzeObjectRoles(p, table.get(p.id), parseCommands(findPayload(payload, LevelPayloadType.Cmd)));
        ok(result.roles.includes(role));
        ok(result.evidence.some(e => e.role === role && e.commandIndex === commandIndex));
    }
});
