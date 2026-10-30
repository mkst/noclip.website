import ArrayBufferSlice from "../ArrayBufferSlice.js";
import * as RDP from "../Common/N64/RDP.js";
import type { RSPSharedOutput } from "../BanjoKazooie/f3dex.js";
import { LEVEL_Z_MIRROR, MAP_X_POINTS, MAP_Z_POINTS, mirrorZ } from "./level.js";
import type { LevelHangingPlacement, LevelMapEntry, LevelObjectPlacement } from "./level.js";
import { parseIA16Texture } from "./texture.js";

export type HangingTextureStyle = 'white' | 'orange' | 'blueGreen' | 'lavender';

export interface HangingMaterial {
    primColor: [number, number, number, number];
    envColor: [number, number, number, number];
}

export type HangingPalette = 'blue' | 'green' | 'orange' | 'white' | 'lavender';

export interface HangingTypeDescriptor {
    type: number;
    name: string;
    pointCount: number;
    spacing: number;
    initialDirection: 'up' | 'down';
    swingMode: number;
    textureStyle: HangingTextureStyle;
    palette: HangingPalette;
    forceTable: 'blueA' | 'blueB' | 'colored' | 'white';
}

export const HANGING_TEXTURE_ID_BASE = 660;
export const HANGING_TEXTURE_SIZE = 32;

export const HANGING_TEXTURE_STYLES: readonly HangingTextureStyle[] = ['white', 'orange', 'blueGreen', 'lavender'];

export const HANGING_TEXTURE_ASSETS: Record<HangingTextureStyle, { offset: number; name: string }> = {
    white: { offset: 0x35190, name: 'white' },
    orange: { offset: 0x35990, name: 'orange' },
    blueGreen: { offset: 0x36190, name: 'blueGreen' },
    lavender: { offset: 0x2BA10, name: 'lavender' },
};

export const HANGING_MATERIALS: Record<HangingPalette, HangingMaterial> = {
    blue: { primColor: [0x78, 0x8C, 0xDC, 0xFF], envColor: [0x00, 0x14, 0x31, 0x00] },
    green: { primColor: [0x52, 0xDC, 0x63, 0xFF], envColor: [0x00, 0x31, 0x00, 0x00] },
    orange: { primColor: [0xFF, 0x9C, 0x31, 0xFF], envColor: [0x31, 0x08, 0x00, 0x00] },
    white: { primColor: [0xFF, 0xFF, 0xFF, 0xFF], envColor: [0x00, 0x00, 0x00, 0x00] },
    lavender: { primColor: [0xD7, 0xD7, 0xFF, 0xFF], envColor: [0x89, 0x65, 0xB4, 0x00] },
};

export const HANGING_TYPE_DESCRIPTORS = new Map<number, HangingTypeDescriptor>([
    [6, { type: 6, name: 'CHAIN_BLUE_A', pointCount: 8, spacing: 31.25, initialDirection: 'up', swingMode: 0, textureStyle: 'blueGreen', palette: 'blue', forceTable: 'blueA' }],
    [7, { type: 7, name: 'CHAIN_BLUE_B', pointCount: 16, spacing: 31.25, initialDirection: 'up', swingMode: 0, textureStyle: 'blueGreen', palette: 'blue', forceTable: 'blueB' }],
    [8, { type: 8, name: 'CHAIN_WHITE', pointCount: 16, spacing: 10.828125, initialDirection: 'down', swingMode: 0, textureStyle: 'white', palette: 'white', forceTable: 'white' }],
    [19, { type: 19, name: 'CHAIN_GRN_A', pointCount: 16, spacing: 31.25, initialDirection: 'down', swingMode: 1, textureStyle: 'blueGreen', palette: 'green', forceTable: 'colored' }],
    [20, { type: 20, name: 'CHAIN_ORN_A', pointCount: 16, spacing: 31.25, initialDirection: 'down', swingMode: 1, textureStyle: 'orange', palette: 'orange', forceTable: 'colored' }],
    [21, { type: 21, name: 'CHAIN_WHT_A', pointCount: 16, spacing: 31.25, initialDirection: 'down', swingMode: 1, textureStyle: 'white', palette: 'white', forceTable: 'colored' }],
    [22, { type: 22, name: 'CHAIN_GRN_B', pointCount: 16, spacing: 31.25, initialDirection: 'down', swingMode: 0, textureStyle: 'blueGreen', palette: 'green', forceTable: 'colored' }],
    [23, { type: 23, name: 'CHAIN_ORN_B', pointCount: 16, spacing: 31.25, initialDirection: 'down', swingMode: 0, textureStyle: 'orange', palette: 'orange', forceTable: 'colored' }],
    [24, { type: 24, name: 'CHAIN_WHT_B', pointCount: 16, spacing: 31.25, initialDirection: 'down', swingMode: 0, textureStyle: 'white', palette: 'white', forceTable: 'colored' }],
    [25, { type: 25, name: 'CHAIN_GRN_C', pointCount: 8, spacing: 31.25, initialDirection: 'down', swingMode: 1, textureStyle: 'blueGreen', palette: 'green', forceTable: 'colored' }],
    [26, { type: 26, name: 'CHAIN_ORN_C', pointCount: 8, spacing: 31.25, initialDirection: 'down', swingMode: 1, textureStyle: 'orange', palette: 'orange', forceTable: 'colored' }],
    [27, { type: 27, name: 'CHAIN_WHT_C', pointCount: 8, spacing: 31.25, initialDirection: 'down', swingMode: 1, textureStyle: 'white', palette: 'white', forceTable: 'colored' }],
    [28, { type: 28, name: 'CHAIN_GRN_D', pointCount: 8, spacing: 31.25, initialDirection: 'down', swingMode: 0, textureStyle: 'blueGreen', palette: 'green', forceTable: 'colored' }],
    [29, { type: 29, name: 'CHAIN_ORN_D', pointCount: 8, spacing: 31.25, initialDirection: 'down', swingMode: 0, textureStyle: 'orange', palette: 'orange', forceTable: 'colored' }],
    [30, { type: 30, name: 'CHAIN_WHT_D', pointCount: 8, spacing: 31.25, initialDirection: 'down', swingMode: 0, textureStyle: 'white', palette: 'white', forceTable: 'colored' }],
    [36, { type: 36, name: 'CHAIN_LAV_A', pointCount: 16, spacing: 31.25, initialDirection: 'down', swingMode: 0, textureStyle: 'lavender', palette: 'lavender', forceTable: 'colored' }],
    [37, { type: 37, name: 'CHAIN_LAV_B', pointCount: 8, spacing: 31.25, initialDirection: 'down', swingMode: 0, textureStyle: 'lavender', palette: 'lavender', forceTable: 'colored' }],
]);

export function hangingTextureId(style: HangingTextureStyle): number {
    return HANGING_TEXTURE_ID_BASE + HANGING_TEXTURE_STYLES.indexOf(style);
}

export function parseHangingTextures(segment1: ArrayBufferSlice): RDP.Texture[] {
    return HANGING_TEXTURE_STYLES.map((style) => {
        const asset = HANGING_TEXTURE_ASSETS[style];
        return parseIA16Texture(segment1, asset.offset, HANGING_TEXTURE_SIZE, HANGING_TEXTURE_SIZE, `hanging/${asset.name}`, undefined, true);
    });
}

export function installHangingTextures(sharedOutput: RSPSharedOutput, segment1: ArrayBufferSlice): void {
    const textures = parseHangingTextures(segment1);
    for (let i = 0; i < textures.length; i++)
        sharedOutput.textureCache.textures[HANGING_TEXTURE_ID_BASE + i] = textures[i];
}

export function resolveHangingObject(objects: LevelObjectPlacement[], index: number): LevelObjectPlacement | null {
    if (index < 0 || index >= objects.length)
        return null;
    return objects[index];
}

export function hangingMaterialFor(placement: LevelHangingPlacement): HangingMaterial | null {
    const descriptor = HANGING_TYPE_DESCRIPTORS.get(placement.type);
    return descriptor !== undefined ? HANGING_MATERIALS[descriptor.palette] : null;
}


export interface HangingRibbon {
    descriptor: HangingTypeDescriptor;
    material: HangingMaterial;
    textureId: number;
    spacing: number;
    flags: number;
    phaseSeed: number;
    mapCurrent: number;
    blueMaxY: number | null;
    points: Float32Array;
}

const BLUE_A_INITIAL: readonly [number, number, number][] = [
    [0, -8192, 16384],
    [0, -4096, 16384],
    [0, -4096, 16384],
    [-2048, -4096, 16384],
    [-2048, -8192, 16384],
    [-2048, -8192, 16384],
    [0, -8192, 16384],
    [0, -4096, 16384],
    [0, -4096, 16384],
    [0, -2048, 16384],
    [2048, -2048, 16384],
    [2048, -2048, 16384],
    [2048, -4096, 16384],
    [0, -4096, 16384],
    [0, -4096, 16384],
    [0, -8192, 16384],
];

const BLUE_B_INITIAL: readonly [number, number, number][] = [
    [0, 8192, 16384],
    [0, 4096, 16384],
    [0, 4096, 16384],
    [0, -4096, 16384],
    [2048, -8192, 16384],
    [2048, -8192, 16384],
    [2048, -8192, 16384],
    [0, -4096, 16384],
    [0, -4096, 16384],
    [0, -2048, 16384],
    [0, 2048, 16384],
    [-2048, 2048, 16384],
    [0, 4096, 16384],
    [-2048, 4096, 16384],
    [-2048, 4096, 16384],
    [-4096, 8192, 16384],
];

const BLUE_C_INITIAL: readonly [number, number, number][] = [
    [-8192, 0, 16384],
    [-4096, 0, 16384],
    [-4096, 0, 16384],
    [-4096, -2048, 16384],
    [-8192, -2048, 16384],
    [-8192, -2048, 16384],
    [-8192, 0, 16384],
    [-4096, 0, 16384],
    [-4096, 0, 16384],
    [-2048, 0, 16384],
    [-2048, 2048, 16384],
    [-2048, 2048, 16384],
    [-4096, 2048, 16384],
    [-4096, 0, 16384],
    [-4096, 0, 16384],
    [-8192, 0, 16384],
];

const BLUE_D_INITIAL: readonly [number, number, number][] = [
    [8192, 0, 16384],
    [4096, 0, 16384],
    [4096, 0, 16384],
    [-4096, 0, 16384],
    [-8192, 2048, 16384],
    [-8192, 2048, 16384],
    [-8192, 2048, 16384],
    [-4096, 0, 16384],
    [-4096, 0, 16384],
    [-2048, 0, 16384],
    [2048, 0, 16384],
    [2048, -2048, 16384],
    [4096, 0, 16384],
    [4096, -2048, 16384],
    [4096, -2048, 16384],
    [8192, -4096, 16384],
];

const COLORED_SWAY: readonly [number, number, number][] = [
    [1024, 0, -32768],
    [2048, 0, -32768],
    [3072, 0, -32768],
    [4096, 0, -32768],
    [5120, 0, -32768],
    [6144, 0, -32768],
    [7168, 0, -32768],
    [8192, 0, -32768],
    [9216, 0, -32768],
    [10240, 0, -32768],
    [11264, 0, -32768],
    [12288, 0, -32768],
    [14336, 0, -32768],
    [16384, 0, -32768],
    [18432, 0, -32768],
    [20480, 0, -32768],
];

const COLORED_DOWN: readonly [number, number, number][] = Array.from({ length: 16 }, () => [0, 0, -32768] as [number, number, number]);
const WHITE_DOWN: readonly [number, number, number][] = Array.from({ length: 16 }, () => [0, 0, -131072] as [number, number, number]);
const BLUE_CURVES = [BLUE_A_INITIAL, BLUE_B_INITIAL, BLUE_C_INITIAL, BLUE_D_INITIAL];

const DOWN_INITIAL: readonly [number, number, number][] = Array.from({ length: 16 }, () => [0, 0, -32768] as [number, number, number]);

function sampleMap(map: LevelMapEntry[] | null, worldX: number, worldZ: number): LevelMapEntry | null {
    if (map === null)
        return null;
    const gameZ = LEVEL_Z_MIRROR - worldZ;
    const x = Math.min(MAP_X_POINTS - 1, Math.max(0, Math.floor(worldX / 64) - 4));
    const z = Math.min(MAP_Z_POINTS - 1, Math.max(0, Math.floor(gameZ / 64) - 8));
    return map[x * MAP_Z_POINTS + z];
}

function initialCurveTable(descriptor: HangingTypeDescriptor): readonly [number, number, number][] {
    if (descriptor.forceTable === 'blueA')
        return BLUE_A_INITIAL;
    if (descriptor.forceTable === 'blueB')
        return BLUE_B_INITIAL;
    return DOWN_INITIAL;
}

function anchorWorld(placement: LevelHangingPlacement, objects: LevelObjectPlacement[]): [number, number, number] {
    const anchorObject = resolveHangingObject(objects, placement.anchorObjectIndex);
    if (anchorObject !== null) {
        return [
            anchorObject.x + placement.anchorOffsetX,
            anchorObject.y + placement.anchorOffsetY,
            mirrorZ(anchorObject.z + placement.anchorOffsetZ),
        ];
    }
    return [placement.x, placement.y, mirrorZ(placement.z)];
}

function buildInitialCurve(descriptor: HangingTypeDescriptor, anchor: [number, number, number]): Float32Array {
    const table = initialCurveTable(descriptor);
    const points = new Float32Array(descriptor.pointCount * 3);
    let x = anchor[0];
    let y = anchor[1];
    let z = anchor[2];
    for (let i = 0; i < descriptor.pointCount; i++) {
        points[i * 3 + 0] = x;
        points[i * 3 + 1] = y;
        points[i * 3 + 2] = z;
        if (i === descriptor.pointCount - 1)
            continue;

        const cell = table[Math.min(i + 1, table.length - 1)];
        let dx = cell[0] / 0x10000;
        let dz = -cell[1] / 0x10000;
        let dy = cell[2] / 0x10000;
        let length = Math.hypot(dx, dy, dz);
        if (length < 0.0625) {
            dz = -1;
            length = 1;
        }
        const step = descriptor.spacing / length;
        x += dx * step;
        y += dy * step;
        z += dz * step;
    }
    return points;
}

export function buildHangingRibbons(placements: LevelHangingPlacement[], objects: LevelObjectPlacement[], map: LevelMapEntry[] | null = null): HangingRibbon[] {
    const ribbons: HangingRibbon[] = [];
    for (const placement of placements) {
        const descriptor = HANGING_TYPE_DESCRIPTORS.get(placement.type);
        if (descriptor === undefined)
            continue;
        const anchor = anchorWorld(placement, objects);
        const cell = sampleMap(map, anchor[0], anchor[2]);
        let mapCurrent = 0;
        let blueMaxY: number | null = null;
        if (descriptor.forceTable === 'blueA' || descriptor.forceTable === 'blueB') {
            const current = cell !== null ? ((cell.unk7 >> 4) & 7) : 0;
            mapCurrent = cell !== null && (cell.unk7 & 0x80) !== 0 ? -current : current;
            blueMaxY = Math.max(anchor[1], (cell !== null ? cell.unk6 * 4 : 0) - 32);
        }
        ribbons.push({
            descriptor,
            material: HANGING_MATERIALS[descriptor.palette],
            textureId: hangingTextureId(descriptor.textureStyle),
            spacing: descriptor.spacing,
            flags: placement.flags,
            phaseSeed: placement.phaseSeed,
            mapCurrent,
            blueMaxY,
            points: buildInitialCurve(descriptor, anchor),
        });
    }
    return ribbons;
}

export function hangingRibbonVertexCount(ribbon: HangingRibbon): number {
    return (ribbon.points.length / 3) * 2;
}

export function hangingRibbonIndexCount(ribbon: HangingRibbon): number {
    const pointCount = ribbon.points.length / 3;
    return Math.max(0, pointCount - 1) * 6;
}

export function writeHangingIndices(ribbon: HangingRibbon, vertexOffset: number, indices: Uint32Array, indexOffset: number): number {
    const pointCount = ribbon.points.length / 3;
    for (let i = 0; i < pointCount - 1; i++) {
        const a = vertexOffset + i * 2;
        indices[indexOffset++] = a + 0;
        indices[indexOffset++] = a + 1;
        indices[indexOffset++] = a + 2;
        indices[indexOffset++] = a + 1;
        indices[indexOffset++] = a + 3;
        indices[indexOffset++] = a + 2;
    }
    return indexOffset;
}

export function writeHangingVertices(ribbon: HangingRibbon, vertexOffset: number, forwardX: number, forwardZ: number, vertexData: Float32Array): void {
    const pointCount = ribbon.points.length / 3;
    const halfWidth = ribbon.spacing * 0.5;
    let dst = vertexOffset * 10;
    for (let i = 0; i < pointCount; i++) {
        const px = ribbon.points[i * 3 + 0];
        const py = ribbon.points[i * 3 + 1];
        const pz = ribbon.points[i * 3 + 2];
        const a = i === pointCount - 1 ? i - 1 : i;
        const b = i === pointCount - 1 ? i : i + 1;
        const tx = ribbon.points[b * 3 + 0] - ribbon.points[a * 3 + 0];
        const ty = ribbon.points[b * 3 + 1] - ribbon.points[a * 3 + 1];
        const tz = ribbon.points[b * 3 + 2] - ribbon.points[a * 3 + 2];

        let ex = -forwardZ * ty;
        let ey = forwardZ * tx - forwardX * tz;
        let ez = forwardX * ty;
        const edgeLength = Math.hypot(ex, ey, ez);
        if (edgeLength > 1e-6) {
            const scale = halfWidth / edgeLength;
            ex *= scale;
            ey *= scale;
            ez *= scale;
        } else {
            ex = 0;
            ey = 0;
            ez = 0;
        }

        const v = (i * 2) - 8;
        vertexData[dst++] = px + ex;
        vertexData[dst++] = py + ey;
        vertexData[dst++] = pz + ez;
        vertexData[dst++] = 1;
        vertexData[dst++] = 0;
        vertexData[dst++] = v;
        vertexData[dst++] = 1;
        vertexData[dst++] = 1;
        vertexData[dst++] = 1;
        vertexData[dst++] = 1;

        vertexData[dst++] = px - ex;
        vertexData[dst++] = py - ey;
        vertexData[dst++] = pz - ez;
        vertexData[dst++] = 1;
        vertexData[dst++] = 0x7C0 / 0x800;
        vertexData[dst++] = v;
        vertexData[dst++] = 1;
        vertexData[dst++] = 1;
        vertexData[dst++] = 1;
        vertexData[dst++] = 1;
    }
}


const MAX_CATCHUP_TICKS = 600;

export class HangingSimulation {
    private initialPoints: Float32Array[] = [];
    private velocities: Float32Array[] = [];
    private curveVariants: number[] = [];
    private randomState = 0x13579BDF;
    private tick = 0;

    constructor(private ribbons: HangingRibbon[]) {
        for (const ribbon of ribbons) {
            this.initialPoints.push(Float32Array.from(ribbon.points));
            this.velocities.push(new Float32Array(ribbon.points.length));
            this.curveVariants.push(0);
        }
    }

    public reset(): void {
        for (let i = 0; i < this.ribbons.length; i++) {
            this.ribbons[i].points.set(this.initialPoints[i]);
            this.velocities[i].fill(0);
            this.curveVariants[i] = 0;
        }
        this.randomState = 0x13579BDF;
        this.tick = 0;
    }

    public advance(ticks: number): void {
        if (ticks <= 0)
            return;
        if (ticks > MAX_CATCHUP_TICKS) {
            this.reset();
            return;
        }
        for (let i = 0; i < ticks; i++) {
            this.tick++;
            for (let j = 0; j < this.ribbons.length; j++)
                this.updateRibbon(j);
        }
    }

    private nextRandom(): number {
        this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
        return this.randomState;
    }

    private updateRibbon(index: number): void {
        const ribbon = this.ribbons[index];
        const points = ribbon.points;
        const velocities = this.velocities[index];
        const pointCount = points.length / 3;
        let damping = 0xD7 / 256;
        let heading = 0;
        let table = COLORED_DOWN;
        let currentX = 0;
        let currentZ = 0;

        if (ribbon.descriptor.forceTable === 'blueA' || ribbon.descriptor.forceTable === 'blueB') {
            table = BLUE_CURVES[this.curveVariants[index]];
            damping = (ribbon.descriptor.forceTable === 'blueA' ? 0xF0 : 0xE6) / 256;
            currentX = ribbon.mapCurrent / 32;
            currentZ = -ribbon.mapCurrent / 32;
        } else if (ribbon.descriptor.forceTable === 'white') {
            table = WHITE_DOWN;
            damping = 0xAA / 256;
        } else {
            const phase = (this.tick + ribbon.phaseSeed * 2) % 90;
            heading = (ribbon.flags & 1) !== 0 ? (phase < 45 ? 0 : 0x80) : (phase < 45 ? 0x40 : 0xC0);
            if (phase < 22 || (phase > 45 && phase < 67))
                table = COLORED_SWAY;
            damping = 0xD7 / 256;
        }

        const angle = heading * (Math.PI * 2 / 256);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        let prevX = points[0];
        let prevY = points[1];
        let prevZ = points[2];

        for (let i = 1; i < pointCount; i++) {
            const cell = table[Math.min(i, table.length - 1)];
            const localX = cell[0] / 0x10000 + currentX;
            const localZ = -(cell[1] / 0x10000) + currentZ;
            const forceX = (localX * cos) - (localZ * sin);
            const forceZ = (localX * sin) + (localZ * cos);
            const forceY = cell[2] / 0x10000;

            const oldX = points[i * 3 + 0];
            const oldY = points[i * 3 + 1];
            const oldZ = points[i * 3 + 2];
            let x = oldX + velocities[i * 3 + 0] * damping + forceX;
            let y = oldY + velocities[i * 3 + 1] * damping + forceY;
            let z = oldZ + velocities[i * 3 + 2] * damping + forceZ;
            if (ribbon.blueMaxY !== null && y > ribbon.blueMaxY)
                y = ribbon.blueMaxY;

            const dx = prevX - x;
            const dy = prevY - y;
            const dz = prevZ - z;
            const distance = Math.hypot(dx, dy, dz);
            if (distance > 1e-6) {
                const scale = ribbon.spacing / distance;
                x = prevX - dx * scale;
                y = prevY - dy * scale;
                z = prevZ - dz * scale;
            } else {
                x = prevX;
                y = prevY;
                z = prevZ;
            }

            velocities[i * 3 + 0] = x - oldX;
            velocities[i * 3 + 1] = y - oldY;
            velocities[i * 3 + 2] = z - oldZ;
            points[i * 3 + 0] = x;
            points[i * 3 + 1] = y;
            points[i * 3 + 2] = z;
            prevX = x;
            prevY = y;
            prevZ = z;
        }

        if (ribbon.descriptor.forceTable === 'blueA' || ribbon.descriptor.forceTable === 'blueB') {
            if ((this.nextRandom() & 63) === 0)
                this.curveVariants[index] = (this.curveVariants[index] + 1) & 3;
        }
    }
}
