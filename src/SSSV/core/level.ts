import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { assert } from "../../util.js";
import { decompressRNC } from "./rnc.js";

export const CELL_COLUMNS = 4;
export const CELL_ROWS = 6;
export const CELL_SIZE = 0x400;
export const TILE_SIZE = 0x40;
export const HEIGHT_SCALE = 8;
export const GEO_RECORD_SIZE = 0x34;
export const MAP_X_POINTS = 65;
export const MAP_Z_POINTS = 97;
export const X_ORIGIN = 0x100;
export const Z_ORIGIN = 0x200;
export const LEVEL_Z_MIRROR = (CELL_ROWS * CELL_SIZE) + (Z_ORIGIN * 2);

export function mirrorZ(z: number): number {
    return LEVEL_Z_MIRROR - z;
}

export const FLAG_TRIANGLE = 0x0001;
export const FLAG_CELL_END = 0x0002;

export enum LevelPayloadType {
    Cob = 0,
    Can = 1,
    Joi = 2,
    Sentinel = 3,
    Cmd = 4,
    Rng = 5,
    Paf = 6,
    Cha = 7,
    Map = 9,
    Geo = 10,
    Mat = 11,
    Dat = 12,
    Cam = 13,
    Unknown14 = 14,
    Unknown15 = 15,
}

export interface LevelPayload {
    type: LevelPayloadType;
    data: ArrayBufferSlice;
}

export interface LevelDat {
    segment: number;
    startingAnimalId: number;
    startHeading: number;
    fogNear: number;
    fogFar: number;
    fogColor: [number, number, number];
    nearClip: number;
    farClip: number;
    textureBank: number;
    waterTileX: number;
    waterTileZ: number;
    waterTileWidth: number;
    waterTileDepth: number;
    waterPrimColor: [number, number, number, number];
    waterEnvColor: [number, number, number, number];
    cellLightingModes: number[][];
    useDynamicLightDir: boolean;
    lightDir: [number, number, number];
}

export interface GeometryVertex {
    position: [number, number, number];
    local: [number, number, number];
    uv: [number, number];
    color: [number, number, number, number];
    normal: [number, number, number] | null;
}

export interface GeometryFace {
    index: number;
    cellX: number;
    cellZ: number;
    flags: number;
    texture: number;
    variant: number;
    lit: boolean;
    vertices: GeometryVertex[];
}

export interface LevelGeometry {
    faces: GeometryFace[];
    trailingBytes: number;
}

export function parseLevelContainer(data: ArrayBufferSlice): LevelPayload[] {
    const view = data.createDataView();
    const payloads: LevelPayload[] = [];
    let offset = 0;

    while (offset < data.byteLength) {
        const type = view.getUint8(offset);
        offset += 1;

        if (type === LevelPayloadType.Sentinel)
            break;

        assert(data.byteLength - offset >= 3, "Level: truncated payload header");
        assert(view.getUint8(offset) === 0x52 && view.getUint8(offset + 1) === 0x4E && view.getUint8(offset + 2) === 0x43,
            "Level: payload is not RNC-compressed");

        const compressedSize = view.getUint32(offset + 8, false);
        const payloadEnd = offset + 18 + compressedSize;
        assert(payloadEnd <= data.byteLength, "Level: payload exceeds container");

        const payload = data.subarray(offset, 18 + compressedSize);
        payloads.push({ type, data: decompressRNC(payload) });
        offset = payloadEnd;
    }

    return payloads;
}

export function findPayload(payloads: LevelPayload[], type: LevelPayloadType): ArrayBufferSlice | null {
    const payload = payloads.find((payload) => payload.type === type);
    return payload !== undefined ? payload.data : null;
}

export function parseLevelDat(data: ArrayBufferSlice): LevelDat {
    const view = data.createDataView();
    assert(data.byteLength >= 0x9C, "Level: dat payload too small");

    const cellLightingModes: number[][] = [];
    for (let cellX = 0; cellX < CELL_COLUMNS; cellX++) {
        const row: number[] = [];
        for (let cellZ = 0; cellZ < CELL_ROWS; cellZ++)
            row.push(view.getInt8(0x5C + (cellX * CELL_ROWS) + cellZ));
        cellLightingModes.push(row);
    }

    return {
        segment: view.getInt16(0x20, false),
        startingAnimalId: view.getUint16(0x1A, false),
        startHeading: view.getInt16(0x4E, false),
        fogNear: view.getUint16(0x02, false),
        fogFar: view.getUint16(0x04, false),
        fogColor: [view.getUint16(0x06, false), view.getUint16(0x08, false), view.getUint16(0x0A, false)],
        nearClip: view.getInt16(0x0C, false),
        farClip: view.getInt16(0x0E, false),
        textureBank: view.getInt16(0x52, false),
        waterTileX: view.getUint16(0x10, false),
        waterTileZ: view.getUint16(0x12, false),
        waterTileWidth: view.getUint16(0x14, false),
        waterTileDepth: view.getUint16(0x16, false),
        waterPrimColor: [view.getUint8(0x54), view.getUint8(0x55), view.getUint8(0x56), view.getUint8(0x57)],
        waterEnvColor: [view.getUint8(0x58), view.getUint8(0x59), view.getUint8(0x5A), view.getUint8(0x5B)],
        cellLightingModes,
        useDynamicLightDir: view.getInt8(0x75) !== 0,
        lightDir: [view.getInt8(0x76), view.getInt8(0x77), view.getInt8(0x78)],
    };
}

export function parseCameraSkyMode(data: ArrayBufferSlice): number {
    const view = data.createDataView();
    if (data.byteLength < 2)
        return 2;
    const count = view.getUint16(0, false);
    const configStart = 2 + count * 8;
    if (configStart + 6 > data.byteLength)
        return 2;
    const config = view.getUint16(configStart + 4, false);
    return (config >> 6) & 0x03;
}

export interface LevelScrollStep {
    s: number;
    t: number;
}

export function parseScrollingTable(data: ArrayBufferSlice): LevelScrollStep[] {
    const view = data.createDataView();
    const count = Math.min(256, Math.floor(data.byteLength / 8));
    const table: LevelScrollStep[] = [];
    for (let i = 0; i < count; i++) {
        const offset = i * 8;
        table.push({
            s: view.getInt32(offset + 0, false),
            t: view.getInt32(offset + 4, false),
        });
    }
    return table;
}

function signedByte(value: number): number {
    return value > 0x7F ? value - 0x100 : value;
}

function vertexNormal(red: number, green: number, blue: number): [number, number, number] {
    const nx = signedByte(red);
    const nz = signedByte(green);
    const ny = signedByte(blue);
    const length = Math.sqrt((nx * nx) + (ny * ny) + (nz * nz));
    if (length === 0)
        return [0.0, 1.0, 0.0];
    return [nx / length, ny / length, -nz / length];
}

export function parseGeometry(data: ArrayBufferSlice, dat: LevelDat | null = null): LevelGeometry {
    const view = data.createDataView();
    const faces: GeometryFace[] = [];
    let offset = 0;
    let faceIndex = 0;

    for (let cellZ = 0; cellZ < CELL_ROWS; cellZ++) {
        for (let cellX = 0; cellX < CELL_COLUMNS; cellX++) {
            const lit = dat !== null ? dat.cellLightingModes[cellX][cellZ] === 0 : false;

            while (true) {
                assert(offset + GEO_RECORD_SIZE <= data.byteLength, "Geometry: unexpected end of data");

                const flags = view.getUint16(offset + 0x00, false);
                const texture = view.getUint8(offset + 0x02);
                const variant = view.getUint8(offset + 0x03);
                const vertexCount = (flags & FLAG_TRIANGLE) !== 0 ? 3 : 4;
                const vertices: GeometryVertex[] = [];

                for (let i = 0; i < vertexCount; i++) {
                    const vertexOffset = offset + 0x04 + (i * 0x0C);
                    const u = view.getInt16(vertexOffset + 0x00, false);
                    const v = view.getInt16(vertexOffset + 0x02, false);
                    const red = view.getUint8(vertexOffset + 0x04);
                    const green = view.getUint8(vertexOffset + 0x05);
                    const blue = view.getUint8(vertexOffset + 0x06);
                    const localX = view.getUint8(vertexOffset + 0x07);
                    const localY = view.getInt16(vertexOffset + 0x08, false);
                    const localZ = view.getUint8(vertexOffset + 0x0A);
                    const alpha = view.getUint8(vertexOffset + 0x0B);

                    vertices.push({
                        position: [
                            (localX * TILE_SIZE) + (cellX * CELL_SIZE) + X_ORIGIN,
                            localY * HEIGHT_SCALE,
                            (localZ * TILE_SIZE) + (cellZ * CELL_SIZE) + Z_ORIGIN,
                        ],
                        local: [localX, localY, localZ],
                        uv: [u, v],
                        color: [red, green, blue, alpha],
                        normal: lit ? vertexNormal(red, green, blue) : null,
                    });
                }

                faces.push({ index: faceIndex, cellX, cellZ, flags, texture, variant, lit, vertices });
                offset += GEO_RECORD_SIZE;
                faceIndex++;

                if ((flags & FLAG_CELL_END) !== 0)
                    break;
            }
        }
    }

    return { faces, trailingBytes: data.byteLength - offset };
}

export interface LevelMapEntry {
    unk0: number;
    unk1: number;
    unk2: number;
    unk3: number;
    unk4: number;
    unk5: number;
    unk6: number;
    unk7: number;
}

export function parseMap(data: ArrayBufferSlice): LevelMapEntry[] {
    const view = data.createDataView();
    const entryCount = MAP_X_POINTS * MAP_Z_POINTS;
    assert(data.byteLength >= entryCount * 8, "Map: payload too small");

    const map: LevelMapEntry[] = [];
    for (let i = 0; i < entryCount; i++) {
        const offset = i * 8;
        map.push({
            unk0: view.getUint8(offset + 0),
            unk1: view.getUint8(offset + 1),
            unk2: view.getUint8(offset + 2),
            unk3: view.getUint8(offset + 3),
            unk4: view.getUint8(offset + 4),
            unk5: view.getUint8(offset + 5),
            unk6: view.getUint8(offset + 6),
            unk7: view.getUint8(offset + 7),
        });
    }
    return map;
}

export interface LevelLink {
    parent: number;
    child: number;
    referenceIdx: number;
}

export function parseLinks(data: ArrayBufferSlice): LevelLink[] {
    const view = data.createDataView();
    assert(data.byteLength >= 2, "Links: payload too small");
    const count = view.getUint16(0, false);
    assert(data.byteLength >= 2 + count * 6, "Links: payload truncated");
    const links: LevelLink[] = [];
    for (let i = 0; i < count; i++) {
        const offset = 2 + i * 6;
        links.push({
            parent: view.getUint16(offset + 0, false),
            child: view.getUint16(offset + 2, false),
            referenceIdx: view.getUint16(offset + 4, false),
        });
    }
    return links;
}

export interface LevelObjectPlacement {
    id: number;
    x: number;
    z: number;
    y: number;
    zRotation: number;
    angle: number;
    unkC: number;
    scale: number;
    commandReferenceIdx: number;
    unk12: number;
    commandsLength: number;
    unk15: number;
}

export function parseObjects(data: ArrayBufferSlice): LevelObjectPlacement[] {
    const view = data.createDataView();
    assert(data.byteLength >= 2, "Objects: payload too small");
    const count = view.getUint16(0, false);
    assert(data.byteLength >= 2 + count * 22, "Objects: payload truncated");

    const objects: LevelObjectPlacement[] = [];
    for (let i = 0; i < count; i++) {
        const offset = 2 + i * 22;
        objects.push({
            id: view.getUint16(offset + 0, false),
            x: view.getInt16(offset + 2, false),
            z: view.getInt16(offset + 4, false),
            y: view.getInt16(offset + 6, false),
            zRotation: view.getInt16(offset + 8, false),
            angle: view.getInt16(offset + 10, false),
            unkC: view.getUint16(offset + 12, false),
            scale: view.getUint16(offset + 14, false),
            commandReferenceIdx: view.getInt16(offset + 16, false),
            unk12: view.getInt16(offset + 18, false),
            commandsLength: view.getUint8(offset + 20),
            unk15: view.getUint8(offset + 21),
        });
    }
    return objects;
}

export const HANGING_RECORD_SIZE = 0x1A;

export interface LevelHangingPlacement {
    type: number;
    x: number;
    z: number;
    y: number;
    anchorOffsetX: number;
    anchorOffsetZ: number;
    anchorOffsetY: number;
    anchorObjectIndex: number;
    endOffsetX: number;
    endOffsetZ: number;
    endOffsetY: number;
    endObjectIndex: number;
    flags: number;
    phaseSeed: number;
}

export function parseHangingObjects(data: ArrayBufferSlice): LevelHangingPlacement[] {
    const view = data.createDataView();
    assert(data.byteLength >= 2, "Hanging objects: payload too small");
    const count = view.getInt16(0, false);
    assert(count >= 0, "Hanging objects: negative record count");
    assert(data.byteLength >= 2 + count * HANGING_RECORD_SIZE, "Hanging objects: payload truncated");

    const placements: LevelHangingPlacement[] = [];
    for (let i = 0; i < count; i++) {
        const offset = 2 + i * HANGING_RECORD_SIZE;
        placements.push({
            type: view.getUint16(offset + 0x00, false),
            x: view.getInt16(offset + 0x02, false),
            z: view.getInt16(offset + 0x04, false),
            y: view.getInt16(offset + 0x06, false),
            anchorOffsetX: view.getInt16(offset + 0x08, false),
            anchorOffsetZ: view.getInt16(offset + 0x0A, false),
            anchorOffsetY: view.getInt16(offset + 0x0C, false),
            anchorObjectIndex: view.getInt16(offset + 0x0E, false),
            endOffsetX: view.getInt16(offset + 0x10, false),
            endOffsetZ: view.getInt16(offset + 0x12, false),
            endOffsetY: view.getInt16(offset + 0x14, false),
            endObjectIndex: view.getInt16(offset + 0x16, false),
            flags: view.getUint8(offset + 0x18),
            phaseSeed: view.getUint8(offset + 0x19),
        });
    }
    return placements;
}

export interface LevelAnimalPlacement {
    id: number;
    x: number;
    z: number;
    y: number;
    rotation: number;
    health: number;
    unkC: number;
    unkE: number;
}

export function parseAnimals(data: ArrayBufferSlice): LevelAnimalPlacement[] {
    const view = data.createDataView();
    assert(data.byteLength >= 2, "Animals: payload too small");
    const count = view.getInt16(0, false);
    assert(data.byteLength >= 2 + count * 16, "Animals: payload truncated");

    const animals: LevelAnimalPlacement[] = [];
    for (let i = 0; i < count; i++) {
        const offset = 2 + i * 16;
        animals.push({
            id: view.getInt16(offset + 0, false),
            x: view.getInt16(offset + 2, false),
            z: view.getInt16(offset + 4, false),
            y: view.getInt16(offset + 6, false),
            rotation: view.getInt16(offset + 8, false),
            health: view.getInt16(offset + 10, false),
            unkC: view.getInt16(offset + 12, false),
            unkE: view.getInt16(offset + 14, false),
        });
    }
    return animals;
}

export interface LevelWaypoint {
    x: number;
    z: number;
    y: number;
}

export interface LevelPath {
    index: number;
    waypoints: LevelWaypoint[];
}

export function parsePaths(data: ArrayBufferSlice | null): LevelPath[] {
    if (data === null)
        return [];

    assert(data.byteLength >= 2, "Paths: payload too small");
    const view = data.createDataView();
    const count = view.getUint16(0, false);
    const paths: LevelPath[] = [];
    let offset = 2;
    for (let i = 0; i < count; i++) {
        assert(offset < data.byteLength, `Paths: missing point count for path ${i}`);
        const pointCount = view.getUint8(offset++);
        assert(data.byteLength - offset >= pointCount * 3, `Paths: points truncated for path ${i}`);

        const waypoints: LevelWaypoint[] = [];
        for (let j = 0; j < pointCount; j++, offset += 3) {
            waypoints.push({
                x: view.getUint8(offset + 0),
                z: view.getUint8(offset + 1),
                y: view.getUint8(offset + 2),
            });
        }
        paths.push({ index: i, waypoints });
    }
    return paths;
}
