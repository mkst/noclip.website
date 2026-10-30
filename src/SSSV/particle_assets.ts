import ArrayBufferSlice from "../ArrayBufferSlice.js";
import type { Texture } from "../Common/N64/RDP.js";
import { assert } from "../util.js";
import { parseI4Texture } from "./texture.js";

export const TORCH_PARTICLE_ASSETS = {
    id: 63,
    definitionRomStart: 0x7B3770 + 63 * 0x18,
    definitionFile: "particles/63.bin",
    definitionSize: 0x18,
    driftRomStart: 0x7B42B0,
    driftFile: "particles/drift-0.bin",
    driftCount: 32,
    atlasOffset: 0x23D50,
    firstAtlasTile: 3,
    tileSize: 0x80,
    width: 16,
    height: 16,
    textureIdBase: 720,
    textureCount: 8,
} as const;

export const ARRIVAL_PARTICLE_IDS = [35] as const;
export const SCRIPT_PARTICLE_IDS = [19, 24, 25, 26, 37, 58] as const;
export const LEVEL_EVENT_PARTICLE_IDS = [0, 1, 4, 20, 40, 71, 72, 73, 74, 75, 76] as const;
export const LEVEL_EVENT_TEXTURE_BASE = 750;
export const LEVEL_EVENT_TEXTURE_OFFSETS = [
    ...Array.from({ length: 9 }, (_, i) => 0x25750 + i * 0x200),
    ...Array.from({ length: 9 }, (_, i) => 0x24550 + i * 0x200),
    ...Array.from({ length: 11 }, (_, i) => 0x226D0 + (3 + i) * 0x80),
    0x23550,
    ...Array.from({ length: 6 }, (_, i) => 0x23550 + (11 + i) * 0x80),
];

export function parseLevelEventParticleTextures(segment1: ArrayBufferSlice): Texture[] {
    return LEVEL_EVENT_TEXTURE_OFFSETS.map((offset, i) => {
        const size = i < 18 ? 32 : 16;
        return parseI4Texture(segment1, size, size, `particle/event/${i}`, offset);
    });
}
export const SCRIPT_PARTICLE_TEXTURE_BASE = 728;
export const SCRIPT_PARTICLE_TEXTURE_OFFSETS = [
    ...Array.from({ length: 6 }, (_, i) => 0x23550 + (11 + i) * 0x80),
    0x215B0 + 7 * 0x80,
    ...Array.from({ length: 6 }, (_, i) => 0x20DB0 + i * 0x80),
    0x21630, 0x216B0,
    0x23550,
];

export function particleDefinitionFile(id: number): string {
    return `particles/${id}.bin`;
}

export function parseScriptParticleTextures(segment1: ArrayBufferSlice): Texture[] {
    return SCRIPT_PARTICLE_TEXTURE_OFFSETS.map((offset, i) => {
        assert(segment1.byteLength >= offset + 0x80, "Script particle atlas is truncated");
        return parseI4Texture(segment1, 16, 16, `particle/script/${i}`, offset);
    });
}

export interface ParticleDefinition {
    raw: Uint8Array;
    flags: number;
    defaultSize: number;
    lifetime: number;
    motionTable: number;
    frameTicks: number;
    maxFrame: number;
    renderGroup: number;
    primaryColor: number;
    environmentColor: number;
}

export function parseParticleDefinition(data: ArrayBufferSlice): ParticleDefinition {
    assert(data.byteLength === 0x18, "Particle definition must contain one 24-byte record");
    const view = data.createDataView();
    return {
        raw: new Uint8Array(data.copyToBuffer()),
        flags: view.getUint16(0),
        defaultSize: view.getUint8(2),
        lifetime: view.getInt16(4),
        motionTable: view.getUint8(6),
        frameTicks: view.getUint8(0x0B),
        maxFrame: view.getUint8(0x0C),
        renderGroup: view.getUint8(0x0D),
        primaryColor: view.getUint16(0x0E),
        environmentColor: view.getUint16(0x10),
    };
}

export function parseTorchDriftTable(data: ArrayBufferSlice): [number, number, number][] {
    assert(data.byteLength === TORCH_PARTICLE_ASSETS.driftCount * 6, "Torch drift table must contain 32 X/Z/Y vectors");
    const view = data.createDataView();
    return Array.from({ length: TORCH_PARTICLE_ASSETS.driftCount }, (_, i) => [
        view.getInt16(i * 6), view.getInt16(i * 6 + 2), view.getInt16(i * 6 + 4),
    ]);
}

export function parseTorchParticleTextures(segment1: ArrayBufferSlice): Texture[] {
    const a = TORCH_PARTICLE_ASSETS;
    const end = a.atlasOffset + (a.firstAtlasTile + a.textureCount) * a.tileSize;
    assert(segment1.byteLength >= end, "Torch particle atlas is truncated");
    return Array.from({ length: a.textureCount }, (_, i) =>
        parseI4Texture(segment1, a.width, a.height, `particle/63/${i}`, a.atlasOffset + (a.firstAtlasTile + i) * a.tileSize));
}
