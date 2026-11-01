import { deepEqual, equal, throws } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import type { LevelAnimalPlacement, LevelObjectPlacement } from "../core/level.js";
import { parseCommands } from "../commands/paths.js";
import { readStartupMusic } from "../audio/music_startup.js";
import { parseMusicCatalog } from "../audio/music.js";

const object: LevelObjectPlacement = {
    id: 55, x: 0, y: 0, z: 0, zRotation: 0, angle: 0, unkC: 0, scale: 2048,
    commandReferenceIdx: 1, commandsLength: 0, unk12: 0, unk15: 0,
};
function commands(...records: string[]) {
    const bytes = Buffer.alloc(2 + records.length * 10);
    bytes.writeUInt16BE(bytes.length);
    records.forEach((s, i) => Buffer.from(s, "hex").copy(bytes, 2 + i * 10));
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}
const stop = "00090000000000000000", music = "00270200000000000000";

test("startup music follows placement entry/cursor and treats track zero as silence", () => {
    deepEqual(readStartupMusic(commands(stop, music), [{ ...object, commandReferenceIdx: 2 }], []),
        { trackId: 2, source: "script", commandIndex: 1 });
    equal(readStartupMusic(commands(stop, music), [{ ...object, commandsLength: 1 }], []).trackId, 2);
    equal(readStartupMusic(commands("00270000000000000000"), [object], []).trackId, 0);
    const animal: LevelAnimalPlacement = { id: 1, x: 0, y: 0, z: 0, rotation: 0, health: 100, unkC: 2, unkE: 1 };
    equal(readStartupMusic(commands(stop, music), [], [animal]).trackId, 2);
});

test("event scripts, blocked scripts and conflicting initial controllers do not invent startup music", () => {
    for (const boundary of [stop, "00010000000000000000", "0006001f000000000000", "00440000000000000000"])
        equal(readStartupMusic(commands(boundary, music), [object], []).source, "unresolved");
    equal(readStartupMusic(commands(music), [{ ...object, commandReferenceIdx: 0, unk12: 1 }], []).source, "unresolved");
    equal(readStartupMusic(commands(music, "00270300000000000000"), [object, { ...object, commandReferenceIdx: 2 }], []).source, "unresolved");
    deepEqual(readStartupMusic(commands(stop), [object], []), { trackId: 1, source: "default", commandIndex: null });
});

test("startup discovery admits bounded setup, short delays and source jump/call cursor conventions", () => {
    equal(readStartupMusic(commands("004502bc000000000000", "003d0b57000203e80501", "002529337b3447d50000", music), [object], []).trackId, 2);
    equal(readStartupMusic(commands("00060003000000000000", "003e0014000000000000", music), [object], []).trackId, 2);
    equal(readStartupMusic(commands("00080001000000000000", stop, music), [object], []).trackId, 2);
    equal(readStartupMusic(commands("00480003000000000000", music, stop, "00490000000000000000"), [object], []).trackId, 2);
    equal(readStartupMusic(commands("0008ffff000000000000", music), [object], []).source, "unresolved");
    equal(readStartupMusic(commands("0027ff00000000000000"), [object], []).source, "unresolved");
});

test("Evo's Escape's progress, scratch-slot subroutine and player setup precede track 12", () => {
    const data = commands("003d0000000000002400", "003d7fa3000800002460", "00480007000000000000",
        "003d0001000100014a00", "003d005a000100010f00", "00420009000000000000", "00270c00000000000000",
        "003d7f9e001800005080", "003d7f9e001800ff5085", "003d7fcf006400ff5030", "00490000000000000000");
    deepEqual(readStartupMusic(data, [object], []), { trackId: 12, source: "script", commandIndex: 6 });
});

function catalog() {
    return { version: 1, sampleRate: 32000, tracks: Array.from({ length: 30 }, (_, i) => ({
        id: i + 1, file: `track_${(i + 1).toString().padStart(2, "0")}.ogg`, frames: 64000,
        loopStartFrame: i ? 32000 : null, loopEndFrame: i ? 64000 : null,
    })) };
}

test("music catalog admits one-shots and bounded intro/loop sections", () => {
    equal(parseMusicCatalog(catalog()).tracks.length, 30);
    for (const edit of [(c: ReturnType<typeof catalog>) => { c.tracks[1].id = 1; },
        (c: ReturnType<typeof catalog>) => { c.tracks[0].file = "../music.ogg"; },
        (c: ReturnType<typeof catalog>) => { c.tracks[1].loopEndFrame = 64001; },
        (c: ReturnType<typeof catalog>) => { c.tracks[1].loopStartFrame = 64000; },
        (c: ReturnType<typeof catalog>) => { c.tracks[1].loopEndFrame = null; }]) {
        const c = catalog(); edit(c); throws(() => parseMusicCatalog(c));
    }
    throws(() => parseMusicCatalog({ ...catalog(), sampleRate: 44100 }));
});
