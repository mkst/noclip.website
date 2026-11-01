import * as RDP from "../../Common/N64/RDP.js";
import { vec3 } from "gl-matrix";
import { RSP_Geometry, RSPSharedOutput, Vertex } from "../../BanjoKazooie/f3dex.js";
import { assert, assertExists } from "../../util.js";
import { SINE_TABLE_256 } from "./animal_matrix.js";
import { MAP_X_POINTS, MAP_Z_POINTS, mirrorZ } from "../core/level.js";
import type { LevelAnimalPlacement, LevelMapEntry } from "../core/level.js";
import { SHADOW_TEXTURE_ID_BASE } from "../objects/objects.js";
import { DP_OTHERMODE_H, SSSVDrawCall, SSSVLayer } from "../render/terrain.js";

const sin = (t: number): number => SINE_TABLE_256[t & 255] >> 7;
const cos = (t: number): number => sin(t + 64);
// A 252-unit footprint touches at most 25 cells; each clipped terrain triangle
// has at most seven vertices (five fan triangles): 25 * 2 * 15 = 750 vertices.
export const SPOTLIGHT_VERTEX_CAPACITY = 768;

const COMBINE_SPOTLIGHT: RDP.CombineParams = {
    c0: { a: RDP.CCMUX.ADD_ZERO, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.MUL_ZERO, d: RDP.CCMUX.SHADE },
    a0: { a: RDP.ACMUX.TEXEL0, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.SHADE, d: RDP.ACMUX.ZERO },
    c1: { a: RDP.CCMUX.ADD_ZERO, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.MUL_ZERO, d: RDP.CCMUX.SHADE },
    a1: { a: RDP.ACMUX.TEXEL0, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.SHADE, d: RDP.ACMUX.ZERO },
};

interface ProjectionVertex { x: number; z: number; u: number; v: number; }
export interface SpotlightVertex extends ProjectionVertex { y: number; alpha: number; }
export interface MysteryBearSpotlight { x: number; z: number; height: number; color: [number, number, number]; }

function surfaceHeight(heights: number[], x: number, z: number, diagonal: boolean): number {
    const [a, b, c, d] = heights;
    if (diagonal) {
        return x < z ? a + (((d - c) * x + (c - a) * z) >> 6)
            : a + (((b - a) * x + (d - b) * z) >> 6);
    }
    return x + z < 64 ? ((a << 6) + (b - a) * x + (c - a) * z) >> 6
        : ((d << 6) + (c - d) * (64 - x) + (b - d) * (64 - z)) >> 6;
}

export function sampleMysteryBearSpotlights(placement: Readonly<LevelAnimalPlacement>, resolvedY: number, tick: number): MysteryBearSpotlight[] {
    return [
        { x: placement.x + (cos(tick) >> 1), z: placement.z + (sin(tick) >> 2), height: resolvedY + 256, color: [1, 0, 1] },
        { x: placement.x + (cos(tick + 30) >> 2), z: placement.z - (sin(tick) >> 1), height: resolvedY + 256, color: [0, 1, 1] },
    ];
}

function clip(polygon: ProjectionVertex[], distance: (v: ProjectionVertex) => number): ProjectionVertex[] {
    const result: ProjectionVertex[] = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const da = distance(a), db = distance(b);
        if (da >= 0) result.push(a);
        if ((da < 0) === (db < 0)) continue;
        const wa = Math.abs(db), wb = Math.abs(da), sum = wa + wb;
        result.push({ x: Math.trunc((a.x * wa + b.x * wb) / sum), z: Math.trunc((a.z * wa + b.z * wb) / sum),
            u: Math.trunc((a.u * wa + b.u * wb) / sum), v: Math.trunc((a.v * wa + b.v * wb) / sum) });
    }
    return result;
}

export function projectMysteryBearSpotlight(map: readonly LevelMapEntry[], spot: MysteryBearSpotlight, camera: readonly number[], isPlayer = false): SpotlightVertex[] {
    const dx = spot.x - Math.trunc(camera[0]), dz = spot.z - Math.trunc(camera[2]);
    const distance = (dx * dx + dz * dz) >> 2;
    if (!isPlayer && distance >= 0x51000) return [];
    const alpha = !isPlayer && distance > 0x31000 ? Math.trunc(77 * (0x51000 - distance) / 0x20000) : 77;
    // C8F8 adds one to both source trig values even at zero rotation.
    const footprint: ProjectionVertex[] = [
        { x: spot.x + 125, z: spot.z + 124, u: 4032, v: 4032 },
        { x: spot.x + 125, z: spot.z - 126, u: 0, v: 4032 },
        { x: spot.x - 125, z: spot.z - 124, u: 0, v: 0 },
        { x: spot.x - 125, z: spot.z + 126, u: 4032, v: 0 },
    ];
    const result: SpotlightVertex[] = [];
    for (let x = (spot.x - 125) >> 6; x <= (spot.x + 125) >> 6; x++) {
        const column = clip(clip(footprint, v => v.x - x * 64), v => (x + 1) * 64 - v.x);
        if (column.length < 3) continue;
        for (let z = (spot.z - 126) >> 6; z <= (spot.z + 126) >> 6; z++) {
            const mx = x - 4, mz = z - 8;
            if (mx < 0 || mz < 0 || mx + 1 >= MAP_X_POINTS || mz + 1 >= MAP_Z_POINTS) continue;
            const entries = [map[mx * MAP_Z_POINTS + mz], map[(mx + 1) * MAP_Z_POINTS + mz], map[mx * MAP_Z_POINTS + mz + 1], map[(mx + 1) * MAP_Z_POINTS + mz + 1]];
            const upper = entries[0].unk3 !== 0 && spot.height - 16 >= Math.min(entries[0].unk1, entries[3].unk1) * 8;
            const heights = entries.map(e => (upper ? e.unk1 : e.unk0) * 8);
            const [a, b, c, d] = heights, min = Math.min(...heights);
            if (spot.height < min - 32) continue;
            const opacity = (Math.min(255, (spot.height + 32 - min) << 4) * alpha) >> 8;
            const cell = clip(clip(column, v => v.z - z * 64), v => (z + 1) * 64 - v.z);
            const diagonal = !!(entries[0].unk4 & (upper ? 2 : 1));
            const planar = d === b + c - a;
            const split = (v: ProjectionVertex): number => diagonal ? (v.x - x * 64) - (v.z - z * 64) : 64 - (v.x - x * 64) - (v.z - z * 64);
            let offset = ((Math.abs(Math.trunc(camera[1]) - ((a + d) >> 1)) + 256) * 2) >> 8;
            if (offset > 4) offset = (offset >> 1) + 2;
            for (let triangle = 0; triangle < (planar ? 1 : 2); triangle++) {
                const polygon = planar ? cell : clip(cell, v => split(v) * (triangle === 0 ? 1 : -1));
                const h = planar ? heights : diagonal ? (triangle === 0 ? [a, b, d] : [a, c, d]) : triangle === 0 ? [a, b, c] : [b, c, d];
                if (Math.max(...h) - Math.min(...h) > 192) continue;
                const vertices = polygon.map(v => {
                    const lx = v.x - x * 64, lz = v.z - z * 64;
                    const height = surfaceHeight(heights, lx, lz, diagonal);
                    return { ...v, y: height + offset, alpha: opacity };
                });
                for (let i = 1; i + 1 < vertices.length; i++) result.push(vertices[0], vertices[i], vertices[i + 1]);
            }
        }
    }
    assert(result.length <= SPOTLIGHT_VERTEX_CAPACITY, "Mystery Bear spotlight capacity");
    return result;
}

export interface MysteryBearSpotlights {
    map: readonly LevelMapEntry[];
    placement: Readonly<LevelAnimalPlacement>;
    resolvedY: number;
    isPlayer: boolean;
    draws: SSSVDrawCall[];
    firstVertex: number;
    vertexCount: number;
    lastSample: string;
}

export function buildMysteryBearSpotlights(output: RSPSharedOutput, map: readonly LevelMapEntry[], placement: Readonly<LevelAnimalPlacement>, resolvedY: number, isPlayer: boolean): MysteryBearSpotlights {
    assertExists(output.textureCache.textures[SHADOW_TEXTURE_ID_BASE + 1], "Mystery Bear spotlight texture");
    const firstVertex = output.vertices.length;
    const draws = [0, 1].map(() => {
        const call = new SSSVDrawCall();
        call.layer = SSSVLayer.Animals;
        call.translucent = true;
        call.DP_Combine = COMBINE_SPOTLIGHT;
        call.DP_OtherModeH = DP_OTHERMODE_H & ~(3 << RDP.OtherModeH_Layout.G_MDSFT_CYCLETYPE);
        call.DP_OtherModeL = 0x00504B50; // G_RM_ZB_CLD_SURF | G_RM_ZB_CLD_SURF2
        call.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH;
        call.SP_TextureState.set(true, 0, 0, 64, 64);
        call.textureIndices = [SHADOW_TEXTURE_ID_BASE + 1];
        call.firstIndex = output.indices.length;
        for (let i = 0; i < SPOTLIGHT_VERTEX_CAPACITY; i++) {
            output.indices.push(output.vertices.length);
            const vertex = new Vertex(); vertex.a = 0;
            output.vertices.push(vertex);
        }
        call.indexCount = SPOTLIGHT_VERTEX_CAPACITY;
        return call;
    });
    return { map, placement, resolvedY, isPlayer, draws, firstVertex, vertexCount: SPOTLIGHT_VERTEX_CAPACITY * 2, lastSample: "" };
}

export function updateMysteryBearSpotlights(animation: MysteryBearSpotlights, data: Float32Array, tick: number, camera: readonly number[]): boolean {
    const key = `${tick & 255}/${camera.map(Math.trunc).join('/')}`;
    if (animation.lastSample === key) return false;
    sampleMysteryBearSpotlights(animation.placement, animation.resolvedY, tick).forEach((spot, i) => {
        const vertices = projectMysteryBearSpotlight(animation.map, spot, camera, animation.isPlayer);
        const start = (animation.firstVertex + i * SPOTLIGHT_VERTEX_CAPACITY) * 10;
        data.fill(0, start, start + SPOTLIGHT_VERTEX_CAPACITY * 10);
        vertices.forEach((v, j) => data.set([v.x, v.y, mirrorZ(v.z), 1, v.u / 4096, v.v / 4096, ...spot.color, v.alpha / 255], start + j * 10));
        vec3.set(animation.draws[i].center, spot.x, vertices[0]?.y ?? animation.resolvedY, mirrorZ(spot.z));
    });
    animation.lastSample = key;
    return true;
}
