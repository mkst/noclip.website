import { readFileSync } from "fs";
import { createHash } from "crypto";

import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { assert } from "../../util.js";
import { decompressRNC } from "../rnc.js";
import { findPayload, LevelPayloadType, parseGeometry, parseLevelContainer, parseLevelDat } from "../level.js";

interface Args {
    rom: string;
    offset: number;
    size: number;
    reference: string | null;
    expectFaces: number | null;
    expectTriangles: number | null;
    objectTable: number | null;
    segment1Base: number | null;
    biomeBase: number | null;
    levelBase: number | null;
}

function parseNumber(value: string): number {
    return Number.parseInt(value, 0);
}

function parseArgs(): Args {
    const args: Args = {
        rom: "",
        offset: 0x546D00,
        size: 0x83D0,
        reference: null,
        expectFaces: null,
        expectTriangles: null,
        objectTable: null,
        segment1Base: null,
        biomeBase: null,
        levelBase: null,
    };

    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        const value = process.argv[++i];
        switch (arg) {
        case "--rom": args.rom = value; break;
        case "--offset": args.offset = parseNumber(value); break;
        case "--size": args.size = parseNumber(value); break;
        case "--reference": args.reference = value; break;
        case "--expect-faces": args.expectFaces = parseNumber(value); break;
        case "--expect-triangles": args.expectTriangles = parseNumber(value); break;
        case "--object-table": args.objectTable = parseNumber(value); break;
        case "--segment1-base": args.segment1Base = parseNumber(value); break;
        case "--biome-base": args.biomeBase = parseNumber(value); break;
        case "--level-base": args.levelBase = parseNumber(value); break;
        default: throw new Error(`Unknown argument: ${arg}`);
        }
    }

    assert(args.rom !== "", "Missing --rom");
    return args;
}

function readSlice(path: string): ArrayBufferSlice {
    return ArrayBufferSlice.fromView(readFileSync(path));
}

function sha1(data: ArrayBufferSlice): string {
    return createHash("sha1").update(Buffer.from(data.copyToBuffer())).digest("hex");
}

const PAYLOAD_NAMES: { [key: number]: string } = {
    [LevelPayloadType.Cob]: "cob",
    [LevelPayloadType.Can]: "can",
    [LevelPayloadType.Joi]: "joi",
    [LevelPayloadType.Cmd]: "cmd",
    [LevelPayloadType.Rng]: "rng",
    [LevelPayloadType.Paf]: "paf",
    [LevelPayloadType.Cha]: "cha",
    [LevelPayloadType.Map]: "map",
    [LevelPayloadType.Geo]: "geo",
    [LevelPayloadType.Mat]: "mat",
    [LevelPayloadType.Dat]: "dat",
    [LevelPayloadType.Cam]: "cam",
    [LevelPayloadType.Unknown14]: "unknown14",
    [LevelPayloadType.Unknown15]: "unknown15",
};

function probeObjectTable(rom: ArrayBufferSlice, args: Args): void {
    assert(args.objectTable !== null, "Missing --object-table");
    assert(args.segment1Base !== null, "Missing --segment1-base");
    assert(args.biomeBase !== null, "Missing --biome-base");
    assert(args.levelBase !== null, "Missing --level-base");

    const view = rom.createDataView();
    const bases = new Map<number, number>();
    bases.set(0x01, args.segment1Base);
    bases.set(0x04, args.biomeBase);
    bases.set(0x05, args.levelBase);

    let resolved = 0;
    let unresolved = 0;
    let nonNull = 0;

    const resolve = (address: number): string => {
        if (address === 0)
            return "null";
        nonNull++;
        const segment = address >>> 24;
        const base = bases.get(segment);
        if (base === undefined) {
            unresolved++;
            return `${address.toString(16).padStart(8, "0")} (missing segment ${segment})`;
        }
        const offset = base + (address & 0xFFFFFF);
        if (offset + 8 > rom.byteLength) {
            unresolved++;
            return `${address.toString(16).padStart(8, "0")} (out of range)`;
        }
        resolved++;
        const bytes = Buffer.from(rom.subarray(offset, 8).copyToBuffer()).toString("hex");
        return `${address.toString(16).padStart(8, "0")} -> ${offset.toString(16).padStart(6, "0")} ${bytes}`;
    };

    for (let i = 0; i < 12; i++) {
        const offset = args.objectTable + (i * 0x9C);
        const id = view.getUint16(offset + 0x00, false);
        const category = view.getUint8(offset + 0x02);
        const renderMode = view.getUint8(offset + 0x03);
        const displayLists = [
            view.getUint32(offset + 0x04, false),
            view.getUint32(offset + 0x08, false),
            view.getUint32(offset + 0x0C, false),
        ];
        console.log(`object ${i.toString().padStart(3)} id=${id} cat=${category} mode=${renderMode} dl=[${displayLists.map(resolve).join(", ")}]`);
    }

    console.log(`object table pointers: ${resolved} resolved, ${unresolved} unresolved, ${nonNull} non-null (first 12 entries)`);
}

function main(): void {
    const args = parseArgs();
    const rom = readSlice(args.rom);
    const compressed = rom.slice(args.offset, args.offset + args.size);
    const level = decompressRNC(compressed);

    console.log(`level compressed: ${compressed.byteLength} bytes (sha1 ${sha1(compressed)})`);
    console.log(`level decompressed: ${level.byteLength} bytes (sha1 ${sha1(level)})`);

    if (args.reference !== null) {
        const reference = readSlice(args.reference);
        const matches = level.byteLength === reference.byteLength && Buffer.compare(Buffer.from(level.copyToBuffer()), Buffer.from(reference.copyToBuffer())) === 0;
        console.log(`reference: ${reference.byteLength} bytes (sha1 ${sha1(reference)})`);
        assert(matches, "Decompressed level does not match reference");
        console.log("reference match: yes");
    }

    const payloads = parseLevelContainer(level);
    for (const payload of payloads)
        console.log(`payload ${payload.type.toString().padStart(2)} ${PAYLOAD_NAMES[payload.type] ?? "unknown"}: ${payload.data.byteLength} bytes`);

    const datData = findPayload(payloads, LevelPayloadType.Dat);
    assert(datData !== null, "Missing dat payload");
    const dat = parseLevelDat(datData);
    console.log(`segment: ${dat.segment}, textureBank: ${dat.textureBank}, lightDir: [${dat.lightDir.join(", ")}]`);

    const geoData = findPayload(payloads, LevelPayloadType.Geo);
    assert(geoData !== null, "Missing geometry payload");
    const geometry = parseGeometry(geoData, dat);
    const triangles = geometry.faces.reduce((sum, face) => sum + ((face.flags & 0x0001) !== 0 ? 1 : 2), 0);
    console.log(`geometry: ${geometry.faces.length} faces, ${triangles} triangles, ${geometry.trailingBytes} trailing bytes`);

    if (args.expectFaces !== null)
        assert(geometry.faces.length === args.expectFaces, `Expected ${args.expectFaces} faces, got ${geometry.faces.length}`);
    if (args.expectTriangles !== null)
        assert(triangles === args.expectTriangles, `Expected ${args.expectTriangles} triangles, got ${triangles}`);

    if (args.objectTable !== null)
        probeObjectTable(rom, args);
}

main();
