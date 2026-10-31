import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseMusicCatalog } from "../music.js";

export function verifyMusicAssets(directory: string): string[] {
    const catalogPath = join(directory, "catalog.json");
    let value: unknown;
    try {
        value = JSON.parse(readFileSync(catalogPath, "utf8"));
    } catch (error) {
        throw new Error(`Missing or unreadable music catalog: ${catalogPath}`, { cause: error });
    }
    const catalog = parseMusicCatalog(value);
    const files = new Set<string>();
    for (const track of catalog.tracks) {
        if (files.has(track.file)) throw new Error(`Duplicate music file: ${track.file}`);
        files.add(track.file);
        const path = join(directory, track.file);
        let data: Buffer;
        try {
            data = readFileSync(path);
        } catch (error) {
            throw new Error(`Missing music track: ${path}`, { cause: error });
        }
        if (data.length < 4 || data.toString("ascii", 0, 4) !== "OggS")
            throw new Error(`Invalid Ogg music track: ${path}`);
        const hash = (track as typeof track & { sha256?: unknown }).sha256;
        if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash) || createHash("sha256").update(data).digest("hex") !== hash)
            throw new Error(`Music track checksum mismatch: ${path}`);
    }
    return ["catalog.json", ...files];
}

export function copyMusicAssets(source: string, destination: string): void {
    const files = verifyMusicAssets(source);
    mkdirSync(destination, { recursive: true });
    for (const file of files) copyFileSync(join(source, file), join(destination, file));
    verifyMusicAssets(destination);
}

function main(args: string[]): void {
    if (args.length === 2 && args[0] === "--verify") {
        const files = verifyMusicAssets(args[1]);
        console.log(`Verified ${files.length - 1} music tracks in ${args[1]}`);
    } else if (args.length === 2 && !args.some(arg => arg.startsWith("--"))) {
        copyMusicAssets(args[0], args[1]);
        console.log(`Copied music catalog and tracks to ${args[1]}`);
    } else {
        throw new Error("Usage: copy_music.ts <source-directory> <destination-directory> | --verify <directory>");
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
    main(process.argv.slice(2));
