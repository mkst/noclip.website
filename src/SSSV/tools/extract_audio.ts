import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROM_SHA1 = "e5e09205aa743a9e5043a42df72adc379c746b0b";
const ROM_SIZE = 0x800000;
const ARCHIVE_START = 0x40B210;
const ARCHIVE_END = 0x42DCA0;
const BANKS = [
    { id: 1, role: "music", controlStart: 0x12EDC0, tableStart: 0x133450, end: 0x1B6510 },
    { id: 2, role: "effects", controlStart: 0x1B6510, tableStart: 0x1C7C80, end: ARCHIVE_START },
] as const;

interface SequenceEntry {
    sequenceIndex: number;
    gameTrackId: number;
    offset: number;
    length: number;
}

export function parseSequenceArchive(archive: Buffer): SequenceEntry[] {
    if (archive.length < 4 || archive.readUInt16BE(0) !== 0x5331)
        throw new Error("Invalid S1 sequence archive header");
    const count = archive.readUInt16BE(2);
    const headerSize = 4 + count * 8;
    if (count === 0 || headerSize > archive.length)
        throw new Error("Invalid S1 sequence count or truncated entry table");
    const entries: SequenceEntry[] = [];
    for (let sequenceIndex = 0; sequenceIndex < count; sequenceIndex++) {
        const offset = archive.readUInt32BE(4 + sequenceIndex * 8);
        const length = archive.readUInt32BE(8 + sequenceIndex * 8);
        if (offset < headerSize || length === 0 || offset + length > archive.length)
            throw new Error(`Sequence ${sequenceIndex} lies outside the archive payload`);
        entries.push({ sequenceIndex, gameTrackId: sequenceIndex + 1, offset, length });
    }
    return entries;
}

function hash(data: Buffer, algorithm = "sha256"): string {
    return createHash(algorithm).update(data).digest("hex");
}

export function validateAudioROM(rom: Buffer): void {
    if (rom.length < 4 || rom.readUInt32BE(0) !== 0x80371240)
        throw new Error("Expected a big-endian .z64 ROM; byte-swapped input is unsupported");
    if (rom.length !== ROM_SIZE || hash(rom, "sha1") !== ROM_SHA1)
        throw new Error(`Unsupported ROM: expected US SHA-1 ${ROM_SHA1}`);
}

export function extractAudio(rom: Buffer) {
    validateAudioROM(rom);
    const files = new Map<string, Buffer>();
    function asset(file: string, romStart: number, romEnd: number) {
        if (romStart < 0 || romEnd <= romStart || romEnd > rom.length)
            throw new Error(`Invalid ROM range for ${file}`);
        const data = rom.subarray(romStart, romEnd);
        files.set(file, data);
        return { file, romStart, romEnd, byteLength: data.length, sha256: hash(data) };
    }

    const banks = BANKS.map((bank) => {
        const control = rom.subarray(bank.controlStart, bank.tableStart);
        if (control.readUInt16BE(0) !== 0x4231 || control.readUInt16BE(2) !== 1)
            throw new Error(`Invalid B1 header for bank ${bank.id}`);
        const bankOffset = control.readUInt32BE(4);
        if (bankOffset < 8 || bankOffset + 12 > control.length)
            throw new Error(`Invalid bank pointer for bank ${bank.id}`);
        return {
            id: bank.id, role: bank.role,
            control: asset(`raw/bank_${bank.id}.ctl`, bank.controlStart, bank.tableStart),
            samples: asset(`raw/bank_${bank.id}.tbl`, bank.tableStart, bank.end),
        };
    });
    const archive = asset("raw/music.sbk", ARCHIVE_START, ARCHIVE_END);
    const entries = parseSequenceArchive(files.get(archive.file)!);
    if (entries.length !== 30)
        throw new Error(`Expected 30 US sequences, found ${entries.length}`);
    const sequences = entries.map(({ offset, length, ...entry }) => ({
        ...entry,
        bankId: 1,
        archiveOffset: offset,
        ...asset(`raw/sequences/sequence_${entry.sequenceIndex.toString().padStart(2, "0")}.cseq`,
            ARCHIVE_START + offset, ARCHIVE_START + offset + length),
    }));
    const inventory = {
        formatVersion: 1,
        extractor: { tool: "src/SSSV/tools/extract_audio.ts", version: 1 },
        rom: { revision: "US", byteLength: rom.length, sha1: ROM_SHA1, sha256: hash(rom) },
        banks,
        archive,
        sequences,
    };
    return { files, inventory };
}

function main(): void {
    let romPath: string | undefined;
    let out: string | undefined;
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg === "--help") {
            console.log("Usage: tsx src/SSSV/tools/extract_audio.ts --rom <US.z64> --out <audio-directory>");
            return;
        }
        if (arg !== "--rom" && arg !== "--out")
            throw new Error(`Unknown argument: ${arg}`);
        const value = process.argv[++i];
        if (!value || value.startsWith("--"))
            throw new Error(`Missing value for ${arg}`);
        if (arg === "--rom")
            romPath = value;
        else
            out = value;
    }
    if (!romPath || !out)
        throw new Error("Both --rom and --out are required (use --help for usage)");

    // Validate the complete input before creating output files.
    const { files, inventory } = extractAudio(readFileSync(romPath));
    for (const file of [...files.keys(), "inventory.json"]) {
        const destination = join(out, file);
        if (resolve(destination) === resolve(romPath))
            throw new Error("Output would overwrite the source ROM");
    }
    for (const [file, data] of files) {
        const destination = join(out, file);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, data);
    }
    writeFileSync(join(out, "inventory.json"), JSON.stringify({
        ...inventory,
        extractor: { ...inventory.extractor, sha256: hash(readFileSync(fileURLToPath(import.meta.url))) },
    }, null, 2) + "\n");
    console.log(`Extracted ${inventory.banks.length} banks and ${inventory.sequences.length} sequences to ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
