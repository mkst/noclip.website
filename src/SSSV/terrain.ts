import * as RDP from "../Common/N64/RDP.js";
import ArrayBufferSlice from "../ArrayBufferSlice.js";
import { DrawCall, RSP_Geometry, RSPSharedOutput, Vertex } from "../BanjoKazooie/f3dex.js";
import { Color, colorNewCopy, colorNewFromRGBA8, White } from "../Color.js";
import { mat4, vec3, vec4 } from "gl-matrix";
import { MAP_X_POINTS, MAP_Z_POINTS, mirrorZ } from "./level.js";
import type { GeometryFace, LevelDat, LevelGeometry, LevelMapEntry, LevelScrollStep } from "./level.js";
import type { ObjectMotionTransform, ObjectShadowMotion } from "./object_motion.js";
import type { ObjectPathShadowMotion, ObjectPathTransform } from "./object_path.js";
import { parseI8Texture } from "./texture.js";
import type { ObjectRotationTransform } from "./object_rotation.js";
import type { LeverHandleTransform } from "./lever_handle.js";
import type { TeleporterVisualState } from "./teleporters.js";
import type { AnimalEyeAnimation } from "./animal_eyes.js";

export const COMBINE_TEXTURED = RDP.decodeCombineParams(0x127FFF, 0xFFFFF238);
export const COMBINE_UNTEXTURED = RDP.decodeCombineParams(0xFFFFFF, 0xFFFE793C);
export const COMBINE_PRIM_TEXTURED: RDP.CombineParams = {
    c0: { a: RDP.CCMUX.PRIMITIVE, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.TEXEL0, d: RDP.CCMUX.ADD_ZERO },
    a0: { a: RDP.ACMUX.PRIMITIVE, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.TEXEL0, d: RDP.ACMUX.ZERO },
    c1: { a: RDP.CCMUX.PRIMITIVE, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.TEXEL0, d: RDP.CCMUX.ADD_ZERO },
    a1: { a: RDP.ACMUX.PRIMITIVE, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.TEXEL0, d: RDP.ACMUX.ZERO },
};

export const COMBINE_TRANSLUCENT_VERTEX_ALPHA: RDP.CombineParams = {
    c0: { a: RDP.CCMUX.SHADE, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.TEXEL0, d: RDP.CCMUX.ADD_ZERO },
    a0: { a: RDP.ACMUX.ZERO, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.ZERO, d: RDP.ACMUX.SHADE },
    c1: { a: RDP.CCMUX.ADD_ZERO, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.MUL_ZERO, d: RDP.CCMUX.COMBINED },
    a1: { a: RDP.ACMUX.ZERO, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.ZERO, d: RDP.ACMUX.ADD_COMBINED },
};

export const COMBINE_SHADE_PRIMITIVE: RDP.CombineParams = {
    c0: { a: RDP.CCMUX.SHADE, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.PRIMITIVE, d: RDP.CCMUX.ADD_ZERO },
    a0: { a: RDP.ACMUX.SHADE, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.PRIMITIVE, d: RDP.ACMUX.ZERO },
    c1: { a: RDP.CCMUX.SHADE, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.PRIMITIVE, d: RDP.CCMUX.ADD_ZERO },
    a1: { a: RDP.ACMUX.SHADE, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.PRIMITIVE, d: RDP.ACMUX.ZERO },
};

export const DP_OTHERMODE_H = (0x02 << RDP.OtherModeH_Layout.G_MDSFT_TEXTFILT) | (RDP.OtherModeH_CycleType.G_CYC_2CYCLE << RDP.OtherModeH_Layout.G_MDSFT_CYCLETYPE);

export const RENDER_OPAQUE = 0x00110038;
export const RENDER_TRANSLUCENT = 0x001049D8;
const RENDER_OPAQUE_DECAL = 0x00112E10;
const RENDER_TRANSLUCENT_DECAL = 0x00104DD8;
export const RENDER_ALPHA = 0x00113079;
const RENDER_INTER = 0x00112478;

const FLAG_CULL_DISABLE = 0x0004;
const FLAG_TRANSLUCENT = 0x0020;
const FLAG_TRANSLUCENT_ALT_1 = 0x0010;
const FLAG_TRANSLUCENT_ALT_2 = 0x0200;
const FLAG_TRANSLUCENT_ALT_3 = 0x8000;
const FLAG_ALPHA_COMPARE = 0x0040;
const FLAG_RENDER_MODE_DECAL = 0x4000;
const FLAG_INTERPENETRATING = 0x0800;

const LIGHT_DIFFUSE = 200 / 0xFF;
const LIGHT_AMBIENT = 80 / 0xFF;

export const WATER_TEXTURE_ID = 300;
export const WATER_TEXTURE_ROWS = 17;
export const WATER_ANIMATED_FRAMES = 16;
export const WATER_FRAME_RATE = 8;
export const WATER_SCROLL_RATE = 0.045;
export const WATER_DEPTH_LIFT = 0;

export enum SSSVLayer {
    Terrain = 0,
    Water = 1,
    Map = 2,
    Upper = 3,
    Objects = 4,
    Stars = 5,
    AnimalMarkers = 6,
    Animals = 7,
    AnimalSpawnPreview = 8,
    AnimalSpawnMarkers = 9,
    ScriptedEvents = 10,
    ObjectMarkers = 11,
}

export class SSSVLight {
    public diffuseColor = vec3.create();
    public ambientColor = vec3.create();
    public direction = vec3.create();
}

export interface SSSVMeteorState {
    startX: number;
    startY: number;
    startZ: number;
    velocityX: number;
    velocityY: number;
    velocityZ: number;
    duration: number;
    cycle: number;
    phase: number;
}

export const FAN_TEXTURE_ID_BASE = 640;
export const FAN_TEXTURE_FRAME_COUNT = 8;

export function installTerrainAnimationTextures(sharedOutput: RSPSharedOutput, segment1: ArrayBufferSlice): void {
    for (let i = 0; i < FAN_TEXTURE_FRAME_COUNT; i++)
        sharedOutput.textureCache.textures[FAN_TEXTURE_ID_BASE + i] = parseI8Texture(segment1, 32, 32, `terrain_fan/${i}`, 0x2C810 + i * 0x400);
}

export class SSSVDrawCall extends DrawCall {
    public animalMarkerHasModel = false;
    public objectPlacementIndex: number | null = null;
    public objectStateColor = false;
    public leverHandle: LeverHandleTransform | null = null;
    public teleporter: TeleporterVisualState | null = null;
    public switchBall: { state: number; size: number } | null = null;
    public leverLight: { size: number } | null = null;
    public projectedObjectSprite: { size: number } | null = null;
    public animalEyeAnimation: AnimalEyeAnimation | null = null;
    public layer = SSSVLayer.Terrain;
    public visible = true;
    public translucent = false;
    public waterAnimated = false;
    public textureScaleS = 1;
    public textureScaleT = 1;
    public textureOffsetS = 0;
    public textureOffsetT = 0;
    public textureOffsetT1: number | null = null;
    public fogNear = 0;
    public fogFar = 0;
    public fogColor: Color = colorNewCopy(White);
    public light: SSSVLight = new SSSVLight();
    public billboard = false;
    public modelMatrix: mat4 | null = null;
    public objectRotation: ObjectRotationTransform | null = null;
    public objectMotion: ObjectMotionTransform | null = null;
    public objectShadowMotion: ObjectShadowMotion | null = null;
    public objectPathMotion: ObjectPathTransform | null = null;
    public objectPathShadowMotion: ObjectPathShadowMotion | null = null;
    public center = vec3.create();
    public centerCount = 0;
    public DP_PrimColor = vec4.fromValues(1, 1, 1, 1);
    public DP_EnvColor = vec4.fromValues(1, 1, 1, 1);
    public scrollStepS = 0;
    public scrollStepT = 0;
    public animationTextureIndices: number[] | null = null;
    public animationTextureIndices1: number[] | null = null;
    public animationTextureFrame1 = 0;
    public animationFrameRate = 0;
    public animationLoopStartFrame = 0;
    public vertexColorOverride: [number, number, number, number] | null = null;
    public starDrift = false;
    public starBaseY = 0;
    public starDriftSpeed = 0;
    public starDriftStartOffset = 0;
    public shadowFadeExponent: number | null = null;
    public textureGen = false;
    public meteor: SSSVMeteorState | null = null;
}

export function makeFogNearFar(dat: LevelDat): [number, number] {
    const range = dat.farClip - dat.nearClip;
    const near = dat.nearClip + (dat.fogNear / 1000) * range;
    const far = dat.nearClip + (dat.fogFar / 1000) * range;
    return [Math.min(near, far), Math.max(near + 1, far)];
}

export function makeLight(dat: LevelDat): SSSVLight {
    const light = new SSSVLight();
    vec3.set(light.direction, dat.lightDir[0] / 0x7F, dat.lightDir[1] / 0x7F, -dat.lightDir[2] / 0x7F);
    if (vec3.length(light.direction) === 0)
        vec3.set(light.direction, 0, 1, 0);
    vec3.normalize(light.direction, light.direction);
    vec3.set(light.diffuseColor, LIGHT_DIFFUSE, LIGHT_DIFFUSE, LIGHT_DIFFUSE);
    vec3.set(light.ambientColor, LIGHT_AMBIENT, LIGHT_AMBIENT, LIGHT_AMBIENT);
    return light;
}

function isTranslucent(flags: number): boolean {
    return (flags & (FLAG_TRANSLUCENT | FLAG_TRANSLUCENT_ALT_1 | FLAG_TRANSLUCENT_ALT_2 | FLAG_TRANSLUCENT_ALT_3)) !== 0;
}

function isAlphaCompare(flags: number): boolean {
    return (flags & FLAG_ALPHA_COMPARE) !== 0;
}

function isDecal(flags: number): boolean {
    return (flags & FLAG_RENDER_MODE_DECAL) !== 0;
}

function isInterpenetrating(flags: number): boolean {
    return (flags & FLAG_INTERPENETRATING) !== 0;
}

function isBackfaceCullingEnabled(flags: number): boolean {
    return (flags & FLAG_CULL_DISABLE) === 0;
}

function encodeNormal(normal: [number, number, number], index: number): number {
    const value = Math.round(normal[index] * 0x7F) & 0xFF;
    return value / 0xFF;
}

function addToCenter(drawCall: SSSVDrawCall, x: number, y: number, z: number): void {
    drawCall.center[0] += x;
    drawCall.center[1] += y;
    drawCall.center[2] += z;
    drawCall.centerCount++;
}

function finalizeCenter(drawCall: SSSVDrawCall): void {
    if (drawCall.centerCount !== 0)
        vec3.scale(drawCall.center, drawCall.center, 1 / drawCall.centerCount);
}

function addFaceToMesh(sharedOutput: RSPSharedOutput, drawCall: SSSVDrawCall, face: GeometryFace): void {
    const base = sharedOutput.vertices.length;
    const translucent = drawCall.translucent;
    const lit = face.lit && !translucent;

    for (const vertex of face.vertices) {
        const v = new Vertex();
        v.x = vertex.position[0];
        v.y = vertex.position[1];
        v.z = mirrorZ(vertex.position[2]);
        v.matrixIndex = 1;
        v.tx = vertex.uv[0] / 32;
        v.ty = vertex.uv[1] / 32;

        if (lit && vertex.normal !== null) {
            v.c0 = encodeNormal(vertex.normal, 0);
            v.c1 = encodeNormal(vertex.normal, 1);
            v.c2 = encodeNormal(vertex.normal, 2);
        } else {
            v.c0 = vertex.color[0] / 0xFF;
            v.c1 = vertex.color[1] / 0xFF;
            v.c2 = vertex.color[2] / 0xFF;
        }

        if (translucent)
            v.a = face.texture >= 32 ? 1.0 : vertex.color[3] / 0xFF;
        else
            v.a = 1.0;

        if (drawCall.vertexColorOverride !== null) {
            v.c0 = drawCall.vertexColorOverride[0];
            v.c1 = drawCall.vertexColorOverride[1];
            v.c2 = drawCall.vertexColorOverride[2];
            v.a = drawCall.vertexColorOverride[3];
        }

        sharedOutput.vertices.push(v);
        addToCenter(drawCall, v.x, v.y, v.z);
    }

    if (face.vertices.length === 3) {
        sharedOutput.indices.push(base + 2, base + 1, base + 0);
        drawCall.indexCount += 3;
    } else {
        sharedOutput.indices.push(base + 2, base + 1, base + 0, base + 2, base + 3, base + 1);
        drawCall.indexCount += 6;
    }
}

const SCROLL_SPECIAL_FLAGS = 0x0010 | 0x0100 | 0x0200 | 0x1000;

function usesMainTextureScroll(face: GeometryFace): boolean {
    if ((face.flags & SCROLL_SPECIAL_FLAGS) !== 0)
        return true;
    return face.variant !== 0 && ((face.flags & 0x0020) !== 0 || (face.texture <= 40 && (face.flags & (0x0008 | 0x0040 | 0x2000)) === 0));
}

function faceKey(face: GeometryFace, hasTexture: boolean): string {
    const tex = hasTexture ? face.texture : -1;
    const variant = hasTexture ? face.variant : -1;
    return [
        isTranslucent(face.flags) ? 1 : 0,
        isBackfaceCullingEnabled(face.flags) ? 1 : 0,
        isAlphaCompare(face.flags) ? 1 : 0,
        isDecal(face.flags) ? 1 : 0,
        isInterpenetrating(face.flags) ? 1 : 0,
        face.lit ? 1 : 0,
        tex,
        variant,
    ].join(":");
}

function makeDrawCall(face: GeometryFace, sharedOutput: RSPSharedOutput, light: SSSVLight, fogNear: number, fogFar: number, fogColor: Color, scrollingTable: LevelScrollStep[] | null, waterPrimColor: [number, number, number, number]): SSSVDrawCall {
    const drawCall = new SSSVDrawCall();
    const hasTexture = sharedOutput.textureCache.textures[face.texture] !== undefined;
    const translucent = isTranslucent(face.flags);
    const alphaCompare = isAlphaCompare(face.flags);
    const decal = isDecal(face.flags);
    const interpenetrating = isInterpenetrating(face.flags);
    const lit = face.lit && !translucent;

    drawCall.translucent = translucent && !alphaCompare;
    drawCall.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH | RSP_Geometry.G_FOG;
    if (isBackfaceCullingEnabled(face.flags))
        drawCall.SP_GeometryMode |= RSP_Geometry.G_CULL_BACK;
    if (lit)
        drawCall.SP_GeometryMode |= RSP_Geometry.G_LIGHTING;

    drawCall.SP_TextureState.set(hasTexture, 0, 0, 32, 32);
    drawCall.DP_OtherModeH = DP_OTHERMODE_H;

    if (alphaCompare)
        drawCall.DP_OtherModeL = RENDER_ALPHA;
    else if (decal)
        drawCall.DP_OtherModeL = drawCall.translucent ? RENDER_TRANSLUCENT_DECAL : RENDER_OPAQUE_DECAL;
    else if (interpenetrating && !drawCall.translucent)
        drawCall.DP_OtherModeL = RENDER_INTER;
    else
        drawCall.DP_OtherModeL = drawCall.translucent ? RENDER_TRANSLUCENT : RENDER_OPAQUE;

    drawCall.DP_Combine = hasTexture ? COMBINE_TEXTURED : COMBINE_UNTEXTURED;
    if (hasTexture && drawCall.translucent && (face.flags & FLAG_TRANSLUCENT) !== 0 && face.texture < 32)
        drawCall.DP_Combine = COMBINE_TRANSLUCENT_VERTEX_ALPHA;
    drawCall.textureIndices = hasTexture ? [face.texture] : [];
    if ((face.flags & 0x0210) !== 0 && sharedOutput.textureCache.textures[WATER_TEXTURE_ID] !== undefined) {
        const waterTexture = sharedOutput.textureCache.textures[WATER_TEXTURE_ID];
        drawCall.textureIndices = [WATER_TEXTURE_ID];
        drawCall.SP_TextureState.set(true, 0, 0, waterTexture.width, waterTexture.height);
        drawCall.DP_Combine = COMBINE_TEXTURED;
        drawCall.translucent = true;
        drawCall.DP_OtherModeL = RENDER_TRANSLUCENT;
        drawCall.waterAnimated = true;
        drawCall.textureScaleT = 1 / WATER_TEXTURE_ROWS;
        drawCall.vertexColorOverride = waterPrimColor;
        drawCall.SP_GeometryMode &= ~RSP_Geometry.G_LIGHTING;
    } else if ((face.flags & 0x0020) !== 0 && face.texture > 40 && sharedOutput.textureCache.textures[FAN_TEXTURE_ID_BASE] !== undefined) {
        const frameIds = face.texture === 42
            ? [FAN_TEXTURE_ID_BASE + 4, FAN_TEXTURE_ID_BASE + 5, FAN_TEXTURE_ID_BASE + 6]
            : [FAN_TEXTURE_ID_BASE + 0, FAN_TEXTURE_ID_BASE + 1, FAN_TEXTURE_ID_BASE + 2, FAN_TEXTURE_ID_BASE + 3];
        drawCall.textureIndices = [frameIds[0]];
        drawCall.animationTextureIndices = frameIds;
        drawCall.animationFrameRate = 15;
        drawCall.SP_TextureState.set(true, 0, 0, 32, 32);
        drawCall.DP_Combine = COMBINE_TEXTURED;
        drawCall.translucent = true;
        drawCall.DP_OtherModeL = RENDER_TRANSLUCENT;
        drawCall.scrollStepS = 0;
        drawCall.scrollStepT = 0;
    }
    if (hasTexture && scrollingTable !== null && usesMainTextureScroll(face)) {
        const scroll = scrollingTable[face.variant];
        if (scroll !== undefined) {
            drawCall.scrollStepS = scroll.s;
            drawCall.scrollStepT = scroll.t;
        }
    }
    drawCall.fogNear = fogNear;
    drawCall.fogFar = fogFar;
    drawCall.fogColor = fogColor;
    drawCall.light = light;
    return drawCall;
}

export function buildTerrain(sharedOutput: RSPSharedOutput, geometry: LevelGeometry, dat: LevelDat, scrollingTable: LevelScrollStep[] | null = null): SSSVDrawCall[] {
    const faces = geometry.faces.slice();
    const hasTexture = (face: GeometryFace): boolean => sharedOutput.textureCache.textures[face.texture] !== undefined;
    faces.sort((a, b) => faceKey(a, hasTexture(a)) < faceKey(b, hasTexture(b)) ? -1 : 1);

    const [fogNear, fogFar] = makeFogNearFar(dat);
    const fogColor = colorNewFromRGBA8((dat.fogColor[0] << 24) | (dat.fogColor[1] << 16) | (dat.fogColor[2] << 8) | 0xFF);
    const light = makeLight(dat);
    const waterAlpha = Math.max(0.22, Math.min(0.78, dat.waterPrimColor[3] / 0xFF));
    const waterPrimColor: [number, number, number, number] = [dat.waterPrimColor[0] / 0xFF, dat.waterPrimColor[1] / 0xFF, dat.waterPrimColor[2] / 0xFF, waterAlpha];

    const drawCalls: SSSVDrawCall[] = [];
    let currentKey = "";
    let currentDrawCall: SSSVDrawCall | null = null;

    for (const face of faces) {
        const key = faceKey(face, hasTexture(face));
        if (currentDrawCall === null || key !== currentKey) {
            currentDrawCall = makeDrawCall(face, sharedOutput, light, fogNear, fogFar, fogColor, scrollingTable, waterPrimColor);
            currentDrawCall.firstIndex = sharedOutput.indices.length;
            currentDrawCall.indexCount = 0;
            drawCalls.push(currentDrawCall);
            currentKey = key;
        }

        addFaceToMesh(sharedOutput, currentDrawCall, face);
    }

    for (const drawCall of drawCalls)
        finalizeCenter(drawCall);

    return drawCalls;
}

function makeUntexturedDrawCall(layer: SSSVLayer, light: SSSVLight, fogNear: number, fogFar: number, fogColor: Color): SSSVDrawCall {
    const drawCall = new SSSVDrawCall();
    drawCall.layer = layer;
    drawCall.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH | RSP_Geometry.G_FOG;
    drawCall.SP_TextureState.set(false, 0, 0, 0, 0);
    drawCall.DP_OtherModeH = DP_OTHERMODE_H;
    drawCall.DP_OtherModeL = RENDER_OPAQUE;
    drawCall.DP_Combine = COMBINE_UNTEXTURED;
    drawCall.fogNear = fogNear;
    drawCall.fogFar = fogFar;
    drawCall.fogColor = fogColor;
    drawCall.light = light;
    return drawCall;
}

export function buildWater(sharedOutput: RSPSharedOutput, map: LevelMapEntry[], dat: LevelDat, waterTextureIndex: number): SSSVDrawCall | null {
    const waterTexture = sharedOutput.textureCache.textures[waterTextureIndex];
    if (waterTexture === undefined)
        return null;

    if (dat.waterTileWidth === 0 || dat.waterTileDepth === 0)
        return null;

    const width = dat.waterTileWidth;
    const depth = dat.waterTileDepth;

    const rawX0 = dat.waterTileX;
    const rawZ0 = dat.waterTileZ;
    const worldOffsetX = dat.waterTileX;
    const worldOffsetZ = dat.waterTileZ;
    if (rawX0 < 0 || rawZ0 < 0 || rawX0 + width >= MAP_X_POINTS || rawZ0 + depth >= MAP_Z_POINTS)
        return null;

    const [fogNear, fogFar] = makeFogNearFar(dat);
    const fogColor = colorNewFromRGBA8((dat.fogColor[0] << 24) | (dat.fogColor[1] << 16) | (dat.fogColor[2] << 8) | 0xFF);
    const drawCall = new SSSVDrawCall();
    drawCall.layer = SSSVLayer.Water;
    drawCall.translucent = true;
    drawCall.waterAnimated = true;
    drawCall.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH | RSP_Geometry.G_FOG;
    drawCall.SP_TextureState.set(true, 0, 0, waterTexture.width, waterTexture.height);
    drawCall.DP_OtherModeH = DP_OTHERMODE_H;
    drawCall.DP_OtherModeL = RENDER_TRANSLUCENT;
    drawCall.DP_Combine = COMBINE_TEXTURED;
    drawCall.textureIndices = [waterTextureIndex];
    drawCall.textureScaleT = 1 / WATER_TEXTURE_ROWS;
    drawCall.fogNear = fogNear;
    drawCall.fogFar = fogFar;
    drawCall.fogColor = fogColor;
    drawCall.light = makeLight(dat);

    const alpha = Math.max(0.22, Math.min(0.78, dat.waterPrimColor[3] / 0xFF));
    const r = dat.waterPrimColor[0] / 0xFF;
    const g = dat.waterPrimColor[1] / 0xFF;
    const b = dat.waterPrimColor[2] / 0xFF;
    const base = sharedOutput.vertices.length;
    const vertsPerRow = width + 1;
    const heights: number[] = [];

    for (let z = 0; z <= depth; z++) {
        for (let x = 0; x <= width; x++) {
            const entry = map[(rawX0 + x) * MAP_Z_POINTS + (rawZ0 + z)];
            const worldX = (worldOffsetX + x) * 64;
            const worldZ = (worldOffsetZ + z) * 64;
            const waterY = entry.unk6 * 4 + WATER_DEPTH_LIFT;
            heights.push(waterY);

            const v = new Vertex();
            v.x = worldX;
            v.y = waterY;
            v.z = mirrorZ(worldZ);
            v.matrixIndex = 1;
            v.tx = worldX / 128;
            v.ty = worldZ / 256;
            v.c0 = r;
            v.c1 = g;
            v.c2 = b;
            v.a = alpha;
            sharedOutput.vertices.push(v);
            addToCenter(drawCall, v.x, v.y, v.z);
        }
    }

    drawCall.firstIndex = sharedOutput.indices.length;
    for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
            const a = z * vertsPerRow + x;
            const b = a + vertsPerRow;
            const c = a + 1;
            const d = b + 1;
            const waterA = heights[a];
            const waterB = heights[b];
            const waterC = heights[c];
            const waterD = heights[d];
            if (waterA === 0 && waterB === 0 && waterC === 0 && waterD === 0)
                continue;
            const va = base + a;
            const vb = base + b;
            const vc = base + c;
            const vd = base + d;
            sharedOutput.indices.push(va, vc, vb, vb, vc, vd);
        }
    }
    drawCall.indexCount = sharedOutput.indices.length - drawCall.firstIndex;
    if (drawCall.indexCount === 0)
        return null;

    finalizeCenter(drawCall);
    return drawCall;
}

function mapColor(entry: LevelMapEntry, upper: boolean): [number, number, number, number] {
    if (upper) {
        if (entry.unk1 === 0xFF)
            return [0.05, 0.05, 0.05, 1.0];
        return [0.62, 0.42, 0.92, 1.0];
    }

    if (entry.unk0 === 0xFF)
        return [0.05, 0.05, 0.05, 1.0];

    const palette: [number, number, number][] = [
        [0.35, 0.55, 0.28],
        [0.48, 0.42, 0.36],
        [0.56, 0.56, 0.62],
        [0.72, 0.62, 0.34],
        [0.32, 0.48, 0.52],
        [0.58, 0.38, 0.38],
    ];
    const material = entry.unk3 || entry.unk2;
    const color = palette[material % palette.length];
    return [color[0], color[1], color[2], 1.0];
}

export function buildMap(sharedOutput: RSPSharedOutput, map: LevelMapEntry[], dat: LevelDat, layer: SSSVLayer): SSSVDrawCall | null {
    const upper = layer === SSSVLayer.Upper;
    if (layer !== SSSVLayer.Map && !upper)
        return null;

    const [fogNear, fogFar] = makeFogNearFar(dat);
    const fogColor = colorNewFromRGBA8((dat.fogColor[0] << 24) | (dat.fogColor[1] << 16) | (dat.fogColor[2] << 8) | 0xFF);
    const drawCall = makeUntexturedDrawCall(layer, makeLight(dat), fogNear, fogFar, fogColor);
    const base = sharedOutput.vertices.length;

    for (let x = 0; x < MAP_X_POINTS; x++) {
        for (let z = 0; z < MAP_Z_POINTS; z++) {
            const entry = map[x * MAP_Z_POINTS + z];
            const v = new Vertex();
            v.x = (x + 4) * 64;
            v.y = (upper ? entry.unk1 : entry.unk0) * 8;
            v.z = mirrorZ((z + 8) * 64);
            v.matrixIndex = 1;
            v.tx = 0;
            v.ty = 0;
            const color = mapColor(entry, upper);
            v.c0 = color[0];
            v.c1 = color[1];
            v.c2 = color[2];
            v.a = color[3];
            sharedOutput.vertices.push(v);
            addToCenter(drawCall, v.x, v.y, v.z);
        }
    }

    drawCall.firstIndex = sharedOutput.indices.length;
    for (let x = 0; x < MAP_X_POINTS - 1; x++) {
        for (let z = 0; z < MAP_Z_POINTS - 1; z++) {
            const a = x * MAP_Z_POINTS + z;
            const b = a + MAP_Z_POINTS;
            const c = a + 1;
            const d = b + 1;
            if (upper) {
                const maxUpper = Math.max(map[a].unk1, map[b].unk1, map[c].unk1, map[d].unk1);
                if (maxUpper === 0)
                    continue;
            }
            const flip = upper ? (map[a].unk4 & 2) : (map[a].unk4 & 1);
            const va = base + a;
            const vb = base + b;
            const vc = base + c;
            const vd = base + d;
            if (flip)
                sharedOutput.indices.push(va, vc, vd, va, vd, vb);
            else
                sharedOutput.indices.push(va, vc, vb, vb, vc, vd);
        }
    }
    drawCall.indexCount = sharedOutput.indices.length - drawCall.firstIndex;
    if (drawCall.indexCount === 0)
        return null;

    finalizeCenter(drawCall);
    return drawCall;
}
