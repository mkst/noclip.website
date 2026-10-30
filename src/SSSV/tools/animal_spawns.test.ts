import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { createAnimalSpawnMarkers, readAbsoluteAnimalSpawns } from "../animal_spawns.js";
import { findPayload, LevelPayloadType, MAP_X_POINTS, MAP_Z_POINTS, mirrorZ, parseLevelContainer } from "../level.js";
import { parseCommands } from "../paths.js";

function commands(...records: number[][]) {
    const bytes = Uint8Array.from([0, 0, ...records.flatMap(([op, ...payload]) => [0, op, ...Array.from({ length: 8 }, (_, i) => payload[i] ?? 0)])]);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}

test("absolute spawns decode unsigned species and signed X/Z/Y with source defaults", () => {
    deepEqual(readAbsoluteAnimalSpawns(commands([0x60, 200, 255, 255, 254, 128, 0, 127, 255])), [{
        commandIndex: 0, placement: { id: 200, x: -2, z: -32768, y: 32767, rotation: 0, health: 127, unkC: 0, unkE: 0 },
    }]);
});

test("preview inventories sites across control flow without executing it or including relative/object spawns", () => {
    const bank = commands([0x03], [0x60, 5], [0x09], [0x5F, 7], [0x10], [0x60, 5]);
    const before = bank.map(command => Array.from(command.raw.createTypedArray(Uint8Array)));
    const spawns = readAbsoluteAnimalSpawns(bank);
    deepEqual(spawns.map(spawn => spawn.commandIndex), [1, 5]);
    equal(spawns.length, 2);
    deepEqual(bank.map(command => Array.from(command.raw.createTypedArray(Uint8Array))), before);
    equal(readAbsoluteAnimalSpawns([]).length, 0);
});

test("preview markers ground-clamp even flying species, mirror once and retain raw spawn coordinates", () => {
    const spawns = readAbsoluteAnimalSpawns(commands([0x60, 5, 0, 2, 128, 3, 0, 0, 10], [0x60, 250, 0, 2, 128, 3, 0, 1, 0]));
    const map = Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({ unk0: 16, unk1: 0, unk2: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0, unk7: 0 }));
    const markers = createAnimalSpawnMarkers(spawns, map);
    equal(markers[0].position[0], 640);
    equal(markers[0].position[1], 128 + 24);
    equal(markers[0].position[2], mirrorZ(768));
    equal(markers[1].position[1], 256 + 24);
    equal(markers[0].label, "SPAWN PREVIEW: FLYING_DOG (cmd 0)");
    equal(markers[1].label, "SPAWN PREVIEW: ANIMAL_250 (cmd 1)");
    equal(spawns[0].placement.y, 10);
    equal(createAnimalSpawnMarkers(spawns, [])[0].position[1], 34);
});

const counts: Record<string, number> = { SMASHING_START: 1, RAT_O_MATIC: 1, GIVE_A_DOG_A_BONUS: 11, EVOS_ESCAPE: 3, PUNCHUP_PYRAMID: 3, BIG_CELEBRATION_PARADE: 10, INTRO: 13 };
for (const [level, count] of Object.entries(counts)) {
    const path = `data/SSSV/levels/${level}.bin`;
    test(`${level} retains absolute spawn sites and species from the extracted bank`, { skip: !existsSync(path) }, () => {
        const payloads = parseLevelContainer(ArrayBufferSlice.fromView(readFileSync(path)));
        const spawns = readAbsoluteAnimalSpawns(parseCommands(findPayload(payloads, LevelPayloadType.Cmd)));
        equal(spawns.length, count);
        ok(spawns.every(spawn => spawn.placement.rotation === 0 && spawn.placement.health === 127));
        if (level === "GIVE_A_DOG_A_BONUS") {
            deepEqual(spawns.map(spawn => spawn.commandIndex), [92, 97, 101, 105, 109, 122, 126, 130, 258, 270, 283]);
            deepEqual(spawns.map(spawn => spawn.placement.id), [5, 5, 5, 5, 5, 5, 5, 5, 7, 7, 7]);
            deepEqual(spawns[0].placement, { id: 5, x: 2307, z: 3091, y: 1550, rotation: 0, health: 127, unkC: 0, unkE: 0 });
        }
    });
}
