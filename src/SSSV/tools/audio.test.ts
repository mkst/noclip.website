import { deepEqual, throws } from "node:assert/strict";
import { test } from "node:test";
import { parseSequenceArchive, validateAudioROM } from "./extract_audio.js";

function archive(): Buffer {
    const data = Buffer.alloc(28);
    data.write("S1");
    data.writeUInt16BE(2, 2);
    data.writeUInt32BE(20, 4);
    data.writeUInt32BE(3, 8);
    data.writeUInt32BE(24, 12);
    data.writeUInt32BE(4, 16);
    return data;
}

test("S1 offsets are archive-relative and game track IDs are one-based", () => {
    deepEqual(parseSequenceArchive(archive()), [
        { sequenceIndex: 0, gameTrackId: 1, offset: 20, length: 3 },
        { sequenceIndex: 1, gameTrackId: 2, offset: 24, length: 4 },
    ]);
});

test("archive rejects missing headers, wrong signatures and truncated entry tables", () => {
    for (const data of [Buffer.alloc(0), Buffer.from("S"), Buffer.from("B1\0\0")])
        throws(() => parseSequenceArchive(data), /header/);
    throws(() => parseSequenceArchive(archive().subarray(0, 19)), /truncated/);
    const empty = archive();
    empty.writeUInt16BE(0, 2);
    throws(() => parseSequenceArchive(empty), /count/);
});

test("archive rejects sequences in the header, empty payloads, and overrunning ranges", () => {
    for (const [offset, length] of [[19, 3], [20, 0], [25, 4], [0xFFFFFFFF, 4], [20, 0xFFFFFFFF]]) {
        const data = archive();
        data.writeUInt32BE(offset, 4);
        data.writeUInt32BE(length, 8);
        throws(() => parseSequenceArchive(data), /Sequence 0.*outside/);
    }
});

test("ROM validation rejects byte-swapped, truncated and different-revision inputs", () => {
    for (const data of [Buffer.alloc(0), Buffer.from("37804012", "hex"), Buffer.from("40123780", "hex")])
        throws(() => validateAudioROM(data), /big-endian/);
    throws(() => validateAudioROM(Buffer.from("80371240", "hex")), /Unsupported ROM/);
    const data = Buffer.alloc(0x800000);
    data.writeUInt32BE(0x80371240, 0);
    throws(() => validateAudioROM(data), /Unsupported ROM/);
});
