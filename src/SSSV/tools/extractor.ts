import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { isRNC, decompressRNC } from "../rnc.js";
import { findPayload, LevelPayloadType, parseAnimals, parseGeometry, parseLevelContainer, parseLevelDat, parseMap, parseObjects } from "../level.js";
import { BIOME_REGULAR_TEXTURES, BIOME_SEGMENTS, BIOME_TEXTURES, BILLBOARD_TABLE, LEVEL_REGULAR_TEXTURES, LEVELS, LEVEL_SEGMENT_ALIASES, LEVEL_TEXTURES, OBJECT_TABLE, SEGMENTS, WATER_TEXTURE } from "../level_table.js";
import type { TextureEntry } from "../level_table.js";
import { formatLevelName } from "../manifest.js";
import type { ManifestLevel, ManifestSegment, ManifestTexture, SSSVManifest } from "../manifest.js";
import { assert } from "../../util.js";
import { ARRIVAL_PARTICLE_IDS, LEVEL_EVENT_PARTICLE_IDS, particleDefinitionFile, SCRIPT_PARTICLE_IDS, TORCH_PARTICLE_ASSETS } from "../particle_assets.js";

const DEFAULT_ROM = "data/SSSV_Raw/rom.z64";
const DEFAULT_OUT = "data/SSSV";

interface Args {
    rom: string;
    out: string;
}

function parseArgs(): Args {
    const args: Args = { rom: DEFAULT_ROM, out: DEFAULT_OUT };
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        const value = process.argv[++i];
        if (arg === "--rom")
            args.rom = value;
        else if (arg === "--out")
            args.out = value;
        else
            throw new Error(`Unknown argument: ${arg}`);
    }
    return args;
}

function writeFile(path: string, data: ArrayBufferSlice | Buffer | string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data instanceof ArrayBufferSlice ? Buffer.from(data.copyToBuffer()) : data);
}

function decompressAsset(rom: ArrayBufferSlice, offset: number): ArrayBufferSlice {
    const view = rom.createDataView();
    const compressedSize = view.getUint32(offset + 8, false);
    return decompressRNC(rom.subarray(offset, 18 + compressedSize));
}

function main(): void {
    const args = parseArgs();
    const rom = ArrayBufferSlice.fromView(readFileSync(args.rom));

    const levels: ManifestLevel[] = [];
    const textures: ManifestTexture[] = [];
    const segments: ManifestSegment[] = [];

    for (const entry of LEVELS) {
        const compressed = rom.slice(entry.romStart, entry.romEnd);
        const level = isRNC(compressed) ? decompressRNC(compressed) : compressed;
        writeFile(join(args.out, "levels", `${entry.id}.bin`), level);

        let biome: string | null = null;
        let faces = 0;
        let triangles = 0;
        let trailingBytes = 0;
        let mapEntries = 0;
        let objects = 0;
        let animals = 0;

        const payloads = parseLevelContainer(level);
        const datData = findPayload(payloads, LevelPayloadType.Dat);
        const dat = datData !== null ? parseLevelDat(datData) : null;
        if (dat !== null)
            biome = BIOME_SEGMENTS[dat.segment] ?? null;

        const geoData = findPayload(payloads, LevelPayloadType.Geo);
        if (geoData !== null) {
            const geometry = parseGeometry(geoData, dat);
            faces = geometry.faces.length;
            triangles = geometry.faces.reduce((sum, face) => sum + ((face.flags & 0x0001) !== 0 ? 1 : 2), 0);
            trailingBytes = geometry.trailingBytes;
        }

        const mapData = findPayload(payloads, LevelPayloadType.Map);
        if (mapData !== null)
            mapEntries = parseMap(mapData).length;
        const objectData = findPayload(payloads, LevelPayloadType.Cob);
        if (objectData !== null)
            objects = parseObjects(objectData).length;
        const animalData = findPayload(payloads, LevelPayloadType.Can);
        if (animalData !== null)
            animals = parseAnimals(animalData).length;

        levels.push({
            id: entry.id,
            name: formatLevelName(entry.id),
            levelFile: `levels/${entry.id}.bin`,
            textureBank: entry.textureBank,
            biome,
            segmentName: LEVEL_SEGMENT_ALIASES[entry.id] ?? entry.id,
            stats: { faces, triangles, trailingBytes, mapEntries, objects, animals },
        });

        console.log(`${entry.id}: ${faces} faces, ${triangles} triangles, ${objects} objects, ${animals} animals, biome=${biome ?? "none"}`);
    }

    const textureEntries = new Map<string, TextureEntry>();
    for (const entry of [...BIOME_TEXTURES, ...LEVEL_TEXTURES])
        textureEntries.set(entry.name, entry);

    for (const entry of textureEntries.values()) {
        const data = decompressAsset(rom, entry.romStart);
        const file = `textures/${entry.name}.bin`;
        writeFile(join(args.out, file), data);
        textures.push({ name: entry.name, file, format: entry.format });
    }

    const waterSize = WATER_TEXTURE.width * WATER_TEXTURE.height;
    const waterData = rom.slice(WATER_TEXTURE.romStart, WATER_TEXTURE.romStart + waterSize);
    const waterFile = `textures/${WATER_TEXTURE.name}.${WATER_TEXTURE.format}.bin`;
    writeFile(join(args.out, waterFile), waterData);
    textures.push({ name: WATER_TEXTURE.name, file: waterFile, format: WATER_TEXTURE.format });

    const objectTableSize = OBJECT_TABLE.count * OBJECT_TABLE.stride;
    const objectTableData = rom.slice(OBJECT_TABLE.romStart, OBJECT_TABLE.romStart + objectTableSize);
    writeFile(join(args.out, "objects.bin"), objectTableData);

    const particle = TORCH_PARTICLE_ASSETS;
    writeFile(join(args.out, particle.definitionFile), rom.slice(particle.definitionRomStart, particle.definitionRomStart + particle.definitionSize));
    writeFile(join(args.out, particle.driftFile), rom.slice(particle.driftRomStart, particle.driftRomStart + particle.driftCount * 6));
    for (const id of [...SCRIPT_PARTICLE_IDS, ...LEVEL_EVENT_PARTICLE_IDS, ...ARRIVAL_PARTICLE_IDS]) {
        const start = 0x7B3770 + id * 0x18;
        writeFile(join(args.out, particleDefinitionFile(id)), rom.slice(start, start + 0x18));
    }

    const regularBanks = new Map<string, { name: string, romStart: number }>();
    for (const entry of Object.values(BIOME_REGULAR_TEXTURES))
        regularBanks.set(entry.name, entry);
    for (const entry of Object.values(LEVEL_REGULAR_TEXTURES))
        regularBanks.set(entry.name, entry);
    for (const entry of regularBanks.values()) {
        const data = decompressAsset(rom, entry.romStart);
        const file = `textures/${entry.name}.regular.bin`;
        writeFile(join(args.out, file), data);
        textures.push({ name: entry.name, file, format: 'regular' });
    }

    const billboardView = rom.createDataView();
    const billboardSets: { x: number, z: number, y: number, size: number, category: number }[][] = [];
    for (let i = 0; i < BILLBOARD_TABLE.maxSets; i++) {
        const pointer = billboardView.getUint32(BILLBOARD_TABLE.romStart + i * 4, false);
        if (pointer === 0)
            break;
        const arrayOffset = BILLBOARD_TABLE.overlayRomStart + (pointer - BILLBOARD_TABLE.overlayVram);
        const billboards = [];
        for (let j = 0; ; j += 5) {
            const x = billboardView.getInt16(arrayOffset + (j + 0) * 2, false);
            if (x === 9999)
                break;
            billboards.push({
                x,
                z: billboardView.getInt16(arrayOffset + (j + 1) * 2, false),
                y: billboardView.getInt16(arrayOffset + (j + 2) * 2, false),
                size: billboardView.getInt16(arrayOffset + (j + 3) * 2, false),
                category: billboardView.getInt16(arrayOffset + (j + 4) * 2, false),
            });
        }
        billboardSets.push(billboards);
    }
    writeFile(join(args.out, "billboards.json"), JSON.stringify(billboardSets, null, 4) + "\n");

    for (const entry of SEGMENTS) {
        const data = rom.slice(entry.romStart, entry.romEnd);
        const file = `segments/${entry.name}.bin`;
        writeFile(join(args.out, file), data);
        segments.push({ name: entry.name, file, vram: entry.vram });
    }

    const manifest: SSSVManifest = {
        version: 1,
        levels,
        textures,
        segments,
        particleAssets: {
            definitions: [particle.id, ...SCRIPT_PARTICLE_IDS, ...LEVEL_EVENT_PARTICLE_IDS, ...ARRIVAL_PARTICLE_IDS].map((id) => ({ id, file: particleDefinitionFile(id) })),
            driftTables: [{ index: 0, file: particle.driftFile, count: particle.driftCount }],
        },
    };
    writeFile(join(args.out, "manifest.json"), JSON.stringify(manifest, null, 4) + "\n");

    assert(levels.length === LEVELS.length, "Extracted level count mismatch");
    console.log(`Wrote ${levels.length} levels, ${textures.length} textures, ${segments.length} segments to ${args.out}`);
}

main();
