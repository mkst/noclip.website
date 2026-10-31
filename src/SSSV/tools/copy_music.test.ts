import { throws, deepEqual, equal } from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { copyMusicAssets, verifyMusicAssets } from "./copy_music.js";

function fixture(run: (source: string, destination: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), "sssv-copy-music-"));
    const source = join(root, "source"), destination = join(root, "destination");
    mkdirSync(source);
    const tracks = Array.from({ length: 30 }, (_, i) => {
        const file = `track_${String(i + 1).padStart(2, "0")}.ogg`;
        const data = Buffer.from(`OggS fixture ${i + 1}`);
        writeFileSync(join(source, file), data);
        return { id: i + 1, file, frames: 32000, loopStartFrame: null, loopEndFrame: null, sha256: createHash("sha256").update(data).digest("hex") };
    });
    writeFileSync(join(source, "catalog.json"), JSON.stringify({ version: 1, sampleRate: 32000, tracks }));
    try { run(source, destination); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("copies only the catalog and its validated tracks", () => fixture((source, destination) => {
    writeFileSync(join(source, "private-input.bin"), "excluded");
    copyMusicAssets(source, destination);
    deepEqual(verifyMusicAssets(destination), verifyMusicAssets(source));
    equal(readFileSync(join(destination, "catalog.json"), "utf8"), readFileSync(join(source, "catalog.json"), "utf8"));
    equal(existsSync(join(destination, "private-input.bin")), false);
}));

test("rejects missing music before creating destination", () => fixture((source, destination) => {
    unlinkSync(join(source, "track_30.ogg"));
    throws(() => copyMusicAssets(source, destination), /Missing music track/);
    equal(existsSync(destination), false);
    unlinkSync(join(source, "catalog.json"));
    throws(() => verifyMusicAssets(source), /Missing or unreadable music catalog/);
}));

test("rejects corrupted tracks and incomplete catalogs", () => fixture((source, destination) => {
    writeFileSync(join(source, "track_01.ogg"), "OggS corrupted");
    throws(() => copyMusicAssets(source, destination), /checksum mismatch/);
    writeFileSync(join(source, "track_01.ogg"), "not an ogg");
    throws(() => copyMusicAssets(source, destination), /Invalid Ogg/);
    writeFileSync(join(source, "catalog.json"), JSON.stringify({ version: 1, sampleRate: 32000, tracks: [] }));
    throws(() => copyMusicAssets(source, destination), /Invalid music catalog/);
}));
