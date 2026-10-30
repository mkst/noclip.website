import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { findPayload, LevelPayloadType, parseLevelContainer, parseObjects } from "../level.js";
import type { LevelObjectPlacement } from "../level.js";
import { LEVELS } from "../level_table.js";
import { buildBillboards, indexObjectTable, parseObjectTable } from "../objects.js";
import { parseLevelDat } from "../level.js";
import { parseI8Texture } from "../texture.js";
import { createObjectMarkers, buildObjectMarkers } from "../object_markers.js";
import { readObjectVisibility } from "../object_startup.js";
import { parseCommands } from "../paths.js";
import { SSSVLayer } from "../terrain.js";

const placement: LevelObjectPlacement = { id: 141, x: 100, y: 200, z: 300, angle: 0, zRotation: 0, unkC: 40, scale: 2048, commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 };
function commands(...records: number[][]) {
    const bytes = Uint8Array.from([0, 0, ...records.flatMap(([op, ...payload]) => [0, op, ...Array.from({ length: 8 }, (_, i) => payload[i] ?? 0)])]);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}
function table(mode = 15, scaleOverride = 0) {
    const data = new ArrayBuffer(0x9C), view = new DataView(data);
    view.setUint16(0, placement.id); view.setUint8(3, mode); view.setUint16(0x70, scaleOverride); view.setUint16(0x7A, 42);
    return indexObjectTable(parseObjectTable(new ArrayBufferSlice(data)));
}

test('visibility uses effective material, preserving flags, literal overrides, and unresolved-script uncertainty', () => {
    for (const flags of [0, 0x40, 0x80, 0xC0]) equal(readObjectVisibility({ ...placement, unkC: flags | 40 }, []).hidden, true);
    const p = { ...placement, commandReferenceIdx: 1 };
    equal(readObjectVisibility(p, commands([0x33, 0, 2], [0x09])).hidden, false);
    equal(readObjectVisibility({ ...p, unkC: 2 }, commands([0x33, 0, 40], [0x09])).hidden, true);
    const unknown = readObjectVisibility(p, commands([0x03]));
    deepEqual([unknown.hidden, unknown.resolved, unknown.material], [false, false, 40]);
    equal(readObjectVisibility(p, commands([0x33, 0, 2], [0x03])).resolved, false);
    equal(readObjectVisibility({ ...placement, unk12: 1 }, commands([0x33, 0, 2], [0x09])).hidden, true);
});

test('markers identify hidden and unresolved placements without including ordinary visible objects or mutating source data', () => {
    const objects = [placement, { ...placement, commandReferenceIdx: 1 }, { ...placement, unkC: 2 }];
    const before = JSON.stringify(objects), markers = createObjectMarkers(objects, table(), commands([0x03]));
    deepEqual(markers.map(m => [m.placementIndex, m.unresolved]), [[0, false], [1, true]]);
    deepEqual(Array.from(markers[0].position), [100, 245, 6868]);
    ok(markers[0].label.includes('Hidden: Speaker #0')); ok(markers[1].label.includes('Unresolved: Speaker #1'));
    equal(JSON.stringify(objects), before);
    equal(createObjectMarkers([{ ...placement, commandReferenceIdx: 1 }], table(), commands([0x33, 0, 2], [0x09])).length, 0);
    const scaled = createObjectMarkers([{ ...placement, commandReferenceIdx: 1 }], table(15, 1024), commands([0x36, 16, 0], [0x09]));
    equal(scaled[0].position[1], 200 + 42 + 24);
});

test('marker diamonds start disabled on a separate layer and retain distinct status colours', () => {
    const markers = createObjectMarkers([placement, { ...placement, commandReferenceIdx: 1 }], table(), commands([0x03]));
    const output = new RSPSharedOutput(), [draw] = buildObjectMarkers(output, markers);
    equal(draw.layer, SSSVLayer.ObjectMarkers); equal(draw.visible, false); equal(draw.indexCount, 48); equal(output.vertices.length, 12);
    ok(output.vertices[0].c2 > output.vertices[0].c0); ok(output.vertices[6].c0 > output.vertices[6].c2);
    deepEqual(buildObjectMarkers(new RSPSharedOutput(), []), []);
});

test('hidden billboard bodies are filtered and a resolved unhide uses the overridden material', () => {
    const dat = parseLevelDat(new ArrayBufferSlice(new ArrayBuffer(0xA0))), output = new RSPSharedOutput();
    const texture = parseI8Texture(ArrayBufferSlice.fromView(new Uint8Array(1024)), 32, 32, 'test');
    for (const id of [500, 501, 502, 568]) output.textureCache.textures[id] = texture;
    equal(buildBillboards(output, [placement], table(18), [], dat).length, 0);
    const unresolved = buildBillboards(output, [{ ...placement, commandReferenceIdx: 1 }], table(18), [], dat, commands([0x03]));
    equal(unresolved.length, 1); deepEqual(unresolved[0].textureIndices, [568]);
    const unhidden = buildBillboards(output, [{ ...placement, commandReferenceIdx: 1 }], table(18), [], dat, commands([0x33, 0, 2], [0x09]));
    equal(unhidden.length, 1); deepEqual(unhidden[0].textureIndices, [502]); equal(unhidden[0].objectPlacementIndex, 0);
});

const available = existsSync('data/SSSV/levels/THE_ENGINE_ROOM.bin');
const read = (p: string) => ArrayBufferSlice.fromView(readFileSync(p));
test('all-level inventory preserves the audited hidden-speaker and unresolved-object distinctions', { skip: !available }, () => {
    const objectsTable = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    let hiddenSpeakers = 0, unresolved = 0, confirmedModels = 0, confirmed = 0;
    for (const level of LEVELS) {
        const payload = parseLevelContainer(read(`data/SSSV/levels/${level.id}.bin`));
        const objects = parseObjects(findPayload(payload, LevelPayloadType.Cob)!);
        const bank = parseCommands(findPayload(payload, LevelPayloadType.Cmd));
        const markers = createObjectMarkers(objects, objectsTable, bank);
        for (const marker of markers) {
            if (marker.unresolved) unresolved++;
            else { confirmed++; if (marker.objectId === 141) hiddenSpeakers++; }
            if (!marker.unresolved && objectsTable.get(marker.objectId)!.displayLists.length !== 0) confirmedModels++;
        }
        if (level.id === 'THE_ENGINE_ROOM') ok(markers.some(m => m.placementIndex === 61 && !m.unresolved));
        if (level.id === 'THE_BATTERY_FARM') ok(markers.some(m => m.placementIndex === 82 && !m.unresolved));
    }
    equal(hiddenSpeakers, 5); equal(confirmedModels, 130); equal(confirmed, 132); equal(unresolved, 47);
});
