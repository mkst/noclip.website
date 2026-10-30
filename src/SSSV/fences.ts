import ArrayBufferSlice from "../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../BanjoKazooie/f3dex.js";
import { TexCM } from "../Common/N64/Image.js";
import { parseI4Texture } from "./texture.js";
import { mirrorZ } from "./level.js";
import type { LevelLink, LevelObjectPlacement } from "./level.js";
import type { SSSVObjectData } from "./objects.js";

export function installFenceTexture(sharedOutput: RSPSharedOutput, segment1: ArrayBufferSlice): void {
    sharedOutput.textureCache.textures[FENCE_TEXTURE_ID] = parseI4Texture(segment1, 128, 16, "fence", 0x209B0, TexCM.WRAP);
}

export interface FenceSpan {
    sourceIndex: number;
    destinationIndex: number;
    startX: number;
    startY: number;
    startZ: number;
    endX: number;
    endY: number;
    endZ: number;
    segments: number;
    seed: number;
    enabled: boolean;
}

export const FENCE_TEXTURE_ID = 650;

const POST_OBJECT_ID = 28;
const FENCE_MAX_SEGMENTS = 6;

function hash(seed: number, tick: number, segment: number, field: number): number {
    let h = (seed ^ Math.imul(tick + 1, 0x9E3779B1) ^ Math.imul(segment + 1, 0x85EBCA6B) ^ Math.imul(field + 1, 0xC2B2AE35)) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x7FEB352D) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x846CA68B) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
}

export function resolveFenceSpans(placements: LevelObjectPlacement[], objectTable: Map<number, SSSVObjectData>, links: LevelLink[]): FenceSpan[] {
    const slot0 = new Map<number, number>();
    for (const link of links) {
        if (link.referenceIdx !== 0)
            continue;
        if (link.parent >= 1000 || link.child >= 1000)
            continue;
        if (link.parent >= placements.length || link.child >= placements.length)
            continue;
        slot0.set(link.parent, link.child);
    }

    const fences: FenceSpan[] = [];
    for (let sourceIndex = 0; sourceIndex < placements.length; sourceIndex++) {
        const source = placements[sourceIndex];
        if (source.id !== POST_OBJECT_ID)
            continue;
        const destinationIndex = slot0.get(sourceIndex);
        if (destinationIndex === undefined || destinationIndex === sourceIndex)
            continue;
        const destination = placements[destinationIndex];
        const entry = objectTable.get(source.id);
        if (entry === undefined)
            continue;

        const runtimeScale = entry.scaleOverride !== 0 ? entry.scaleOverride : (source.scale !== 0 ? source.scale : 0x800);
        const height = Math.trunc((entry.collideHeight * runtimeScale) / 0x800);
        const startX = source.x;
        const startY = source.y + (height >> 1);
        const startZ = source.z;
        const endX = destination.x;
        const endY = destination.y + (height >> 1);
        const endZ = destination.z;
        const dx = endX - startX;
        const dz = endZ - startZ;
        const dy = endY - startY;
        const distance = Math.trunc(Math.sqrt((dx * dx) + (dz * dz) + (dy * dy)));
        const segments = (distance >> 6) + 1;
        if (segments > FENCE_MAX_SEGMENTS)
            continue;
        if (distance === 0)
            continue;

        fences.push({
            sourceIndex,
            destinationIndex,
            startX,
            startY,
            startZ,
            endX,
            endY,
            endZ,
            segments,
            seed: hash(sourceIndex, destinationIndex, segments, 17),
            enabled: true,
        });
    }
    return fences;
}

export function fenceVertexCount(fence: FenceSpan): number {
    return (fence.segments + 1) * 2;
}

export function fenceIndexCount(fence: FenceSpan): number {
    return fence.segments * 6;
}

export function fenceColor(fence: FenceSpan, tick: number): [number, number, number] {
    const colors: [number, number, number][] = [
        [1, 1, 1],
        [1, 1, 1],
        [0x5E / 0xFF, 0x72 / 0xFF, 0xFF / 0xFF],
        [0x77 / 0xFF, 0xC4 / 0xFF, 0xFF / 0xFF],
    ];
    return colors[hash(fence.seed, tick, 0, 91) & 3];
}

export function writeFenceVertices(fence: FenceSpan, tick: number, data: Float32Array, offset: number): number {
    const dx = fence.endX - fence.startX;
    const dz = fence.endZ - fence.startZ;
    const dy = fence.endY - fence.startY;
    const stepX = Math.trunc((dx * 0x100) / fence.segments);
    const stepZ = Math.trunc((dz * 0x100) / fence.segments);
    const stepY = Math.trunc((dy * 0x100) / fence.segments);
    const color = fenceColor(fence, tick);

    let j = offset;
    for (let i = 0; i <= fence.segments; i++) {
        let x = fence.startX;
        let z = fence.startZ;
        let y = fence.startY;
        if (i === fence.segments) {
            x = fence.endX;
            z = fence.endZ;
            y = fence.endY;
        } else if (i > 0) {
            x = fence.startX + ((stepX * i) >> 8);
            z = fence.startZ + ((stepZ * i) >> 8);
            y = fence.startY + ((stepY * i) >> 8);
            z += (hash(fence.seed, tick, i, 1) & 31) - 16;
            x += (hash(fence.seed, tick, i, 2) & 31) - 16;
            y += (hash(fence.seed, tick, i, 3) & 31) - 8;
            const phase = (tick * 4) + (i * 16);
            y += Math.trunc((Math.cos(((phase + 64) & 0xFF) * Math.PI / 128) * 8));
        }

        const worldZ = mirrorZ(z);
        const u0 = i / fence.segments;
        const u1 = u0;

        data[j++] = x; data[j++] = y + 8; data[j++] = worldZ; data[j++] = 1;
        data[j++] = u0; data[j++] = 0;
        data[j++] = color[0]; data[j++] = color[1]; data[j++] = color[2]; data[j++] = 1;

        data[j++] = x; data[j++] = y - 8; data[j++] = worldZ; data[j++] = 1;
        data[j++] = u1; data[j++] = 1;
        data[j++] = color[0]; data[j++] = color[1]; data[j++] = color[2]; data[j++] = 1;
    }
    return j;
}
