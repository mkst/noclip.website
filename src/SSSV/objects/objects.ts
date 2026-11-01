import { readWalraceSpriteStartup } from './walrace_sprites.js';
import { COMBINE_FLOOR_BUTTON_GLOW, computeFloorButtonMatrix } from './floor_buttons.js';
import type { FloorButtonState } from './floor_buttons.js';
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import * as RDP from "../../Common/N64/RDP.js";
import { mat4, vec3, vec4 } from "gl-matrix";

import { RSPSharedOutput as RSPSharedOutputTGR, RSPState as RSPStateTGR, RSP_Geometry, runDL_F3DEX } from "../../TopGearRally/f3dex.js";
import type { RSPOutput as RSPOutputTGR } from "../../TopGearRally/f3dex.js";
import { RSPSharedOutput, Vertex } from "../../BanjoKazooie/f3dex.js";
import { colorNewFromRGBA8 } from "../../Color.js";
import { mirrorZ } from "../core/level.js";
import type { LevelDat, LevelObjectPlacement } from "../core/level.js";
import type { LevelObjectTextureEntry } from "../core/level_table.js";
import type { LevelCommand, PathAnalysis } from "../commands/paths.js";
import { readBillboardStartupColor, readSwitchStartupAppearance, readObjectVisibility } from "./object_startup.js";
import { readComputerIdleAnimation, readObjectTextureAnimation } from "./object_texture_animation.js";
import { computeObjectMotionMatrix, computeObjectShadowMotionMatrix, readObjectMotion } from "./object_motion.js";
import { computeObjectPathMatrix, computeObjectPathShadowMatrix, readObjectPathPilot } from "./object_path.js";
import type { ObjectPathPreviewTime } from "./object_path.js";
import { computeObjectRotationMatrix, readObjectRotation } from "./object_rotation.js";
import { GAME_TICK_RATE } from "../core/timing.js";
import { computeLeverHandleMatrix } from "./lever_handle.js";
import { updateGravitySwitchVisual } from "./gravity_switch.js";
import { readTeleporterStartup, teleporterFanAlpha } from "./teleporters.js";
import { createPlayerPlacement } from "../animals/animals.js";

const COMBINE_TELEPORTER_FAN: RDP.CombineParams = {
    c0: { a: RDP.CCMUX.PRIMITIVE, b: RDP.CCMUX.ENVIRONMENT, c: RDP.CCMUX.TEXEL0, d: RDP.CCMUX.ENVIRONMENT },
    a0: { a: RDP.ACMUX.PRIMITIVE, b: RDP.ACMUX.ENVIRONMENT, c: RDP.ACMUX.TEXEL0, d: RDP.ACMUX.ENVIRONMENT },
    c1: { a: RDP.CCMUX.ADD_ZERO, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.MUL_ZERO, d: RDP.CCMUX.COMBINED },
    a1: { a: RDP.ACMUX.ADD_COMBINED, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.SHADE, d: RDP.ACMUX.ZERO },
};
import { parseI4Texture, parseI8Texture, parseMipmapBank, parseRGBA16Texture } from "../core/texture.js";
import { COMBINE_COLOURED_LIGHT, COMBINE_PRIM_TEXTURED, COMBINE_SHADE_PRIMITIVE, COMBINE_TEXTURED, COMBINE_UNTEXTURED, DP_OTHERMODE_H, makeFogNearFar, makeLight, RENDER_ALPHA, RENDER_OPAQUE, RENDER_TRANSLUCENT, SSSVDrawCall, SSSVLayer } from "../render/terrain.js";

export interface SSSVObjectData {
    index: number;
    id: number;
    category: number;
    renderMode: number;
    displayLists: number[];
    orientationMode: number;
    scaleOverride: number;
    billboardSetIndex: number;
    width: number;
    depth: number;
    collideHeight: number;
    shadowType: number;
    shadowImageIndex: number;
    shadowScaleX: number;
    shadowScaleY: number;
    shadowAlpha: number;
    behaviorFlags?: number;
    updateCallback?: number;
    eventTrigger?: number;
}

export function parseObjectTable(data: ArrayBufferSlice): SSSVObjectData[] {
    const view = data.createDataView();
    const stride = 0x9C;
    const count = Math.floor(data.byteLength / stride);
    const entries: SSSVObjectData[] = [];

    for (let index = 0; index < count; index++) {
        const offset = index * stride;
        const displayLists: number[] = [];
        for (let i = 0; i < 3; i++) {
            const dl = view.getUint32(offset + 0x04 + i * 0x04, false);
            if (dl !== 0)
                displayLists.push(dl);
        }
        const category = view.getUint8(offset + 0x02);
        const renderMode = view.getUint8(offset + 0x03);
        if (renderMode === 10)
            displayLists.push(0x0100AF90, 0x0100B2C0);
        else if (renderMode === 15)
            displayLists.push(0x010106E0, 0x01011140);

        entries.push({
            index,
            id: view.getUint16(offset + 0x00, false),
            category,
            renderMode,
            displayLists,
            orientationMode: view.getUint8(offset + 0x15),
            scaleOverride: view.getUint16(offset + 0x70, false),
            billboardSetIndex: view.getUint8(offset + 0x14),
            width: view.getInt16(offset + 0x74, false),
            depth: view.getUint16(offset + 0x72, false),
            collideHeight: view.getUint16(offset + 0x7A, false),
            shadowType: view.getUint8(offset + 0x96) & 0x0F,
            shadowImageIndex: (view.getUint8(offset + 0x96) >> 4) & 0x0F,
            shadowScaleX: view.getUint8(offset + 0x97),
            shadowScaleY: view.getUint8(offset + 0x98),
            shadowAlpha: view.getInt8(offset + 0x99),
            behaviorFlags: view.getUint8(offset + 0x82),
            updateCallback: view.getUint32(offset + 0x84),
            eventTrigger: view.getUint8(offset + 0x88),
        });
    }
    return entries;
}

export function indexObjectTable(entries: SSSVObjectData[]): Map<number, SSSVObjectData> {
    const byId = new Map<number, SSSVObjectData>();
    for (const entry of entries) {
        const existing = byId.get(entry.id);
        if (existing === undefined || (existing.displayLists.length === 0 && entry.displayLists.length !== 0))
            byId.set(entry.id, entry);
    }
    return byId;
}

export function parseObjectTextureBank(segment: ArrayBufferSlice, entries: LevelObjectTextureEntry[]): RDP.Texture[] {
    return entries.map((entry) => parseRGBA16Texture(segment, entry.offset, entry.width, entry.height, entry.name));
}

interface ParsedObjectModel {
    sharedOutput: RSPSharedOutputTGR;
    output: RSPOutputTGR;
    usedVertices: number[];
}

function isValidDisplayListStart(segment: ArrayBufferSlice, dlAddr: number): boolean {
    const offset = dlAddr & 0x00FFFFFF;
    if (offset + 0x08 > segment.byteLength)
        return false;
    const opcode = segment.createTypedArray(Uint8Array, offset)[0];
    return opcode === 0x01 || opcode === 0x03 || opcode === 0x04 || opcode === 0x06 || opcode >= 0xAF;
}

function parseObjectModel(segmentBuffers: (ArrayBufferSlice | undefined)[], dlAddr: number, initialOtherModeL: number): ParsedObjectModel | null {
    const segment = segmentBuffers[(dlAddr >>> 24) & 0xFF];
    if (segment === undefined || !isValidDisplayListStart(segment, dlAddr))
        return null;

    const sharedOutput = new RSPSharedOutputTGR();
    const state = new RSPStateTGR(segmentBuffers as ArrayBufferSlice[], sharedOutput);
    state.loadVerticesOnDemand = true;
    state.deinterleaveTextures = false;
    const translucent = initialOtherModeL === RENDER_TRANSLUCENT;
    state.gSPSetGeometryMode(RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH | RSP_Geometry.G_LIGHTING | (translucent ? 0 : RSP_Geometry.G_CULL_BACK));
    if (translucent) {
        // Preserve the source queue's primitive opacity while sampling a single mip level.
        state.gDPSetCombine(0x127FFF, 0xFFFFF63B);
        state.gSPSetPrimColor(0, 0, 0, 0, 128);
    } else {
        state.gDPSetCombine(0xFCFFFFFF, 0xFFFE793C);
    }
    state.gDPSetOtherModeL(0, 29, initialOtherModeL);

    try {
        runDL_F3DEX(state, dlAddr);
    } catch (e) {
        return null;
    }

    const output = state.finish();
    if (output === null)
        return null;

    const usedVerticesSet = new Set<number>();
    for (const drawCall of output.drawCalls) {
        for (let i = 0; i < drawCall.indexCount; i++)
            usedVerticesSet.add(sharedOutput.indices[drawCall.firstIndex + i]);
    }

    return { sharedOutput, output, usedVertices: [...usedVerticesSet] };
}

class ObjectTextureRemapper {
    private textures = new Map<string, number>();
    private nextId = 400;

    constructor(private sharedOutput: RSPSharedOutput) {
    }

    public get(texture: RDP.Texture): number {
        const key = `${texture.dramAddr}|${texture.dramPalAddr}|${texture.tile.cacheKey}|${texture.width}x${texture.height}|${texture.name}`;
        let id = this.textures.get(key);
        if (id === undefined) {
            id = this.nextId++;
            this.sharedOutput.textureCache.textures[id] = texture;
            this.textures.set(key, id);
        }
        return id;
    }
}

const transformScratch = vec3.create();
const partMatrixScratch = mat4.create();

function makePlacementMatrix(placement: LevelObjectPlacement, entry: SSSVObjectData): mat4 {
    const runtimeScale = entry.scaleOverride !== 0 ? entry.scaleOverride : (placement.scale !== 0 ? placement.scale : 0x800);
    const scale = runtimeScale / 0x800;
    const originY = (entry.collideHeight * scale) / 2;

    const m = mat4.create();
    mat4.translate(m, m, [placement.x, placement.y + originY, placement.z]);
    mat4.rotateY(m, m, (placement.angle * Math.PI) / 180);
    mat4.rotateX(m, m, (-placement.zRotation * Math.PI) / 180);
    mat4.scale(m, m, [scale, scale, scale]);
    return m;
}

interface ObjectPartSpec {
    gravityPart?: 'body' | 'arcA' | 'arcB';
    teleporterPart?: "rim" | "fan";
    displayList: number;
    useContextTexture: boolean;
    localMatrix: mat4 | null;
    primColor: [number, number, number, number] | null;
    combine: RDP.CombineParams | null;
    textureOverrideIds: number[] | null;
    animationFrameRate: number;
}

function makeObjectPart(displayList: number, useContextTexture: boolean, localMatrix: mat4 | null = null, primColor: [number, number, number, number] | null = null, combine: RDP.CombineParams | null = null, textureOverrideIds: number[] | null = null, animationFrameRate: number = 0): ObjectPartSpec {
    return { displayList, useContextTexture, localMatrix, primColor, combine, textureOverrideIds, animationFrameRate };
}

function makeLocalTranslate(x: number, y: number, z: number): mat4 {
    const m = mat4.create();
    mat4.translate(m, m, [x, y, z]);
    return m;
}

function makeLocalRotateY(degrees: number): mat4 {
    const m = mat4.create();
    mat4.rotateY(m, m, (degrees * Math.PI) / 180);
    return m;
}

function getObjectParts(entry: SSSVObjectData, state?: number): ObjectPartSpec[] {
    if (entry.renderMode === 13) return [
        { ...makeObjectPart(entry.displayLists[0], true), gravityPart: 'body' },
        { ...makeObjectPart(0x0101B000, false), gravityPart: 'arcA' },
        { ...makeObjectPart(0x0101B000, false), gravityPart: 'arcB' },
    ];
    const displayLists = entry.displayLists;
    switch (entry.renderMode) {
        case 7:
            if (displayLists.length === 0) return [];
            const rim = makeObjectPart(displayLists[0], false, null, null, null, [
                TELEPORTER_TEXTURE_ID_BASE,
                TELEPORTER_TEXTURE_ID_BASE + 1,
                TELEPORTER_TEXTURE_ID_BASE + 2,
            ], 30);
            rim.teleporterPart = "rim";
            const fan = makeObjectPart(0x0100A6D0, false);
            fan.teleporterPart = "fan";
            return [rim, fan];
        case 0:
        case 1:
        case 18:
        case 22:
            return [];
        case 5:
        case 11:
            return [
                makeObjectPart(displayLists[0], false),
                makeObjectPart(displayLists[1], false, makeLocalTranslate(0, 8, 10)),
            ].filter((part) => part.displayList !== undefined);
        case 12:
            return [
                makeObjectPart(displayLists[0], true),
                makeObjectPart(displayLists[1], false, null, [state === 1 ? 1 : 0x40 / 0xFF, 0, 0, 1], COMBINE_SHADE_PRIMITIVE),
            ].filter((part) => part.displayList !== undefined);
        case 19:
            return [
                makeObjectPart(displayLists[0], true),
                makeObjectPart(0x01011B78, false, null, [0x40 / 0xFF, 0, 0, 1], COMBINE_SHADE_PRIMITIVE),
                makeObjectPart(0x01011AB0, false, null, [1, 0, 0, 160 / 255], COMBINE_FLOOR_BUTTON_GLOW),
            ];
        case 20:
            return displayLists.map((displayList) => makeObjectPart(displayList, false, null, null, COMBINE_SHADE_PRIMITIVE));
        case 10:
        case 15:
            return displayLists.map((displayList) => makeObjectPart(displayList, true));
        case 23:
            {
                const isSpecial = entry.id === 0xF5;
                const base = isSpecial ? 0x040165E0 : (displayLists[0] ?? 0x05001720);
                const untextured = isSpecial ? 0x040148B0 : 0x04014990;
                const textured = isSpecial ? 0x050007A0 : 0x04015960;
                const parts = [makeObjectPart(base, true)];
                for (let i = 0; i < 3; i++)
                    parts.push(makeObjectPart(untextured, true, makeLocalRotateY(i * 120)));
                for (let i = 0; i < 3; i++)
                    parts.push(makeObjectPart(textured, true, makeLocalRotateY(i * 120)));
                return parts;
            }
        default:
            return displayLists.length !== 0 ? [makeObjectPart(displayLists[0], renderModeUsesContextTexture(entry))] : [];
    }
}

function renderModeUsesContextTexture(entry: SSSVObjectData): boolean {
    switch (entry.renderMode) {
        case 6:
        case 7:
        case 8:
        case 9:
        case 13:
        case 16:
        case 17:
        case 21:
        case 23:
        case 24:
            return true;
        default:
            return false;
    }
}

export function buildObjects(sharedOutput: RSPSharedOutput, placements: LevelObjectPlacement[], objectTable: Map<number, SSSVObjectData>, segmentBuffers: (ArrayBufferSlice | undefined)[], dat: LevelDat, commands: readonly LevelCommand[] = [], pathAnalysis: PathAnalysis | null = null, localGeometry = false): SSSVDrawCall[] {
    const [fogNear, fogFar] = makeFogNearFar(dat);
    const fogColor = colorNewFromRGBA8((dat.fogColor[0] << 24) | (dat.fogColor[1] << 16) | (dat.fogColor[2] << 8) | 0xFF);
    const light = makeLight(dat);
    const textureRemapper = new ObjectTextureRemapper(sharedOutput);
    const parsedModelCache = new Map<string, ParsedObjectModel | null>();
    const modelCache = new Map<string, { spec: ObjectPartSpec; model: ParsedObjectModel }[]>();
    const drawCalls: SSSVDrawCall[] = [];
    const startingPlayer = createPlayerPlacement(dat, placements);

    const addShadow = (placement: LevelObjectPlacement, entry: SSSVObjectData, motion: ReturnType<typeof readObjectMotion>, pathPilot: ReturnType<typeof readObjectPathPilot>, pathPreviewTime: ObjectPathPreviewTime | null): void => {
        const textureId = SHADOW_TEXTURE_ID_BASE + entry.shadowImageIndex;
        const texture = sharedOutput.textureCache.textures[textureId];
        if (texture === undefined)
            return;

        const runtimeScale = entry.scaleOverride !== 0 ? entry.scaleOverride : (placement.scale !== 0 ? placement.scale : 0x800);
        const scale = runtimeScale / 0x800;
        const halfX = entry.shadowScaleY * scale;
        const halfZ = entry.shadowScaleX * scale;
        if (halfX === 0 && halfZ === 0)
            return;

        const angle = (placement.angle * Math.PI) / 180;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const corners: [number, number][] = [
            [-halfX, -halfZ],
            [halfX, -halfZ],
            [halfX, halfZ],
            [-halfX, halfZ],
        ];
        const uvs: [number, number][] = [[1, 1], [0, 1], [0, 0], [1, 0]];
        const base = sharedOutput.vertices.length;
        let centerX = 0;
        let centerZ = 0;
        for (let i = 0; i < corners.length; i++) {
            const [lx, lz] = corners[i];
            const x = placement.x + (lx * cos) + (lz * sin);
            const z = placement.z + (-lx * sin) + (lz * cos);
            centerX += x;
            centerZ += z;
            const v = new Vertex();
            v.x = x;
            v.y = placement.y + 2.0;
            v.z = mirrorZ(z);
            v.matrixIndex = 1;
            v.tx = uvs[i][0];
            v.ty = uvs[i][1];
            v.c0 = 1;
            v.c1 = 1;
            v.c2 = 1;
            v.a = 1;
            sharedOutput.vertices.push(v);
        }
        centerX /= corners.length;
        centerZ /= corners.length;

        const drawCall = new SSSVDrawCall();
        drawCall.layer = SSSVLayer.Objects;
        drawCall.translucent = true;
        drawCall.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH;
        drawCall.SP_TextureState.set(true, 0, 0, texture.width, texture.height);
        drawCall.DP_OtherModeH = DP_OTHERMODE_H;
        drawCall.DP_OtherModeL = RENDER_TRANSLUCENT;
        drawCall.DP_Combine = COMBINE_PRIM_TEXTURED;
        vec4.set(drawCall.DP_PrimColor, 0, 0, 0, 0x9B / 0xFF);
        drawCall.shadowFadeExponent = entry.shadowAlpha;
        drawCall.textureIndices = [textureId];
        drawCall.fogNear = fogNear;
        drawCall.fogFar = fogFar;
        drawCall.fogColor = fogColor;
        drawCall.light = light;
        drawCall.firstIndex = sharedOutput.indices.length;
        sharedOutput.indices.push(base + 0, base + 1, base + 2, base + 0, base + 2, base + 3);
        drawCall.indexCount = 6;
        drawCall.center[0] = centerX;
        drawCall.center[1] = placement.y + 2.0;
        drawCall.center[2] = mirrorZ(centerZ);
        drawCall.centerCount = 1;
        if (motion !== null) {
            drawCall.objectShadowMotion = { plan: motion, placement };
            drawCall.modelMatrix = mat4.create();
            computeObjectShadowMotionMatrix(drawCall.modelMatrix, drawCall.objectShadowMotion, 0);
        } else if (pathPilot !== null) {
            drawCall.objectPathShadowMotion = { pilot: pathPilot, placement };
            drawCall.objectPathPreviewTime = pathPreviewTime;
            drawCall.modelMatrix = mat4.create();
            computeObjectPathShadowMatrix(drawCall.modelMatrix, drawCall.objectPathShadowMotion, 0);
        }
        drawCalls.push(drawCall);
    };

    for (const [placementIndex, authoredPlacement] of placements.entries()) {
        const authoredEntry = objectTable.get(authoredPlacement.id);
        if (authoredEntry === undefined)
            continue;
        const visibility = readObjectVisibility(authoredPlacement, commands);
        if (visibility.hidden)
            continue;
        const teleporterStartup = authoredEntry.renderMode === 7 ? readTeleporterStartup(authoredPlacement, commands) : null;
        const appearance = authoredEntry.renderMode === 7 ? teleporterStartup : authoredEntry.renderMode === 6 || authoredEntry.renderMode === 12 ? visibility.appearance : null;
        const placement = { ...authoredPlacement, unkC: appearance?.material ?? visibility.material, scale: appearance?.scale ?? authoredPlacement.scale };
        if (authoredEntry.renderMode === 7 && appearance !== null && (placement.unkC & 63) === 40) continue;
        const entry = appearance !== null && appearance.scale !== null ? { ...authoredEntry, scaleOverride: 0 } : authoredEntry;

        const motion = entry.renderMode === 6 && entry.id !== 2 ? readObjectMotion(authoredPlacement, commands) : null;
        const pathCandidate = entry.id === 94 ? readObjectPathPilot(authoredPlacement, placementIndex, commands, pathAnalysis) : null;
        const pathPilot = pathCandidate !== null && (pathCandidate.path.index === 0 || pathCandidate.path.index === 1 || pathCandidate.path.index === 9) ? pathCandidate : null;
        const pathPreviewTime: ObjectPathPreviewTime | null = pathPilot !== null ? { startTick: null } : null;
        if ((entry.shadowType === 1 || entry.shadowType === 2) && (placement.unkC & 0xC0) !== 0x80)
            addShadow(placement, entry, motion, pathPilot, pathPreviewTime);

        const materialFlags = entry.renderMode === 6 ? placement.unkC & 0xC0 : 0;
        const initialOtherModeL = materialFlags === 0x40 ? RENDER_ALPHA : materialFlags === 0x80 ? RENDER_TRANSLUCENT : RENDER_OPAQUE;
        const modelKey = `${entry.id}/${initialOtherModeL}/${entry.renderMode === 12 && appearance?.state === 1}`;
        let models = modelCache.get(modelKey);
        if (models === undefined) {
            models = [];
            for (const spec of getObjectParts(entry, appearance?.state)) {
                const parsedKey = `${spec.displayList}/${initialOtherModeL}`;
                let model = parsedModelCache.get(parsedKey);
                if (model === undefined) {
                    model = parseObjectModel(segmentBuffers, spec.displayList, initialOtherModeL);
                    parsedModelCache.set(parsedKey, model);
                }
                if (model !== null)
                    models.push({ spec, model });
            }
            modelCache.set(modelKey, models);
        }
        if (models.length === 0)
            continue;

        const computerIdle = readComputerIdleAnimation(authoredPlacement, commands, entry);
        const textureAnimation = computerIdle ?? (entry.renderMode === 6 ? readObjectTextureAnimation(authoredPlacement, commands) : null);
        const rotationCandidate = motion === null && pathPilot === null && (entry.renderMode === 6 || entry.renderMode === 15) && entry.shadowType === 0
            ? readObjectRotation(authoredPlacement, commands) : null;
        const rotation = rotationCandidate !== null && (entry.orientationMode !== 4 || entry.collideHeight === entry.width * 2 || (rotationCandidate.zPerTick === 0 && placement.zRotation === 0))
            ? rotationCandidate : null;
        const runtimeHeight = entry.collideHeight * (entry.scaleOverride || placement.scale || 2048) / 2048;
        const modelMatrix = makePlacementMatrix(entry.renderMode === 7 ? { ...placement, y: placement.y + 2 + (Math.floor(runtimeHeight) - runtimeHeight) / 2 } : placement, entry);
        const contextTextureId = placement.unkC & 0x3F;
        const contextTexture = sharedOutput.textureCache.textures[contextTextureId] !== undefined ? contextTextureId : null;

        const floorButton: FloorButtonState | null = entry.renderMode === 19 ? {
            placement, scale: entry.scaleOverride || placement.scale || 2048, collideHeight: entry.collideHeight,
            initialState: readSwitchStartupAppearance(authoredPlacement, commands)?.state ?? 0, state: 0,
        } : null;
        if (floorButton) floorButton.state = floorButton.initialState;
        for (const { spec, model } of models) {
            const leverHandle = entry.renderMode === 12 && spec.primColor !== null ? {
                placement, scale: entry.scaleOverride || placement.scale || 2048, collideHeight: entry.collideHeight,
                initialPhase: appearance?.state === 1 ? 128 : 0, phase: appearance?.state === 1 ? 128 : 0,
            } : null;
            const matrix = spec.localMatrix !== null ? mat4.mul(partMatrixScratch, modelMatrix, spec.localMatrix) : modelMatrix;
            const base = sharedOutput.vertices.length;
            const vertexMap = new Map<number, number>();
            for (const oldIndex of model.usedVertices) {
                const mv = model.sharedOutput.vertices[oldIndex];
                vec3.set(transformScratch, mv.x, mv.z, mv.y);
                vec3.transformMat4(transformScratch, transformScratch, matrix);

                const v = new Vertex();
                const animated = localGeometry || rotation !== null || motion !== null || pathPilot !== null || leverHandle !== null || floorButton !== null || spec.gravityPart !== undefined;
                v.x = animated ? mv.x : transformScratch[0];
                v.y = animated ? mv.y : transformScratch[1];
                v.z = animated ? mv.z : mirrorZ(transformScratch[2]);
                v.matrixIndex = 1;
                v.tx = mv.tx;
                v.ty = mv.ty;
                v.c0 = mv.c0;
                v.c1 = mv.c1;
                v.c2 = mv.c2;
                v.a = mv.a;
                vertexMap.set(oldIndex, sharedOutput.vertices.length);
                sharedOutput.vertices.push(v);
            }

            for (const modelDrawCall of model.output.drawCalls) {
                const drawCall = new SSSVDrawCall();
                drawCall.layer = SSSVLayer.Objects;
                if (floorButton !== null) {
                    const part = spec.displayList === 0x01011AB0 ? 'glow' : spec.displayList === 0x01011B78 ? 'cap' : 'body';
                    drawCall.floorButton = { button: floorButton, part };
                    drawCall.modelMatrix = mat4.create();
                    computeFloorButtonMatrix(drawCall.modelMatrix, floorButton);
                    drawCall.visible = part !== 'glow' || floorButton.state === 1;
                } else if (leverHandle !== null) {
                    drawCall.leverHandle = leverHandle;
                    drawCall.modelMatrix = mat4.create();
                    computeLeverHandleMatrix(drawCall.modelMatrix, leverHandle);
                } else if (pathPilot !== null) {
                    const runtimeScale = entry.scaleOverride !== 0 ? entry.scaleOverride : (placement.scale !== 0 ? placement.scale : 0x800);
                    const scale = runtimeScale / 0x800;
                    drawCall.objectPathMotion = { pilot: pathPilot, placement, scale, originY: entry.collideHeight * scale / 2, localMatrix: spec.localMatrix };
                    drawCall.objectPathPreviewTime = pathPreviewTime;
                    drawCall.modelMatrix = mat4.create();
                    computeObjectPathMatrix(drawCall.modelMatrix, drawCall.objectPathMotion, 0);
                } else if (motion !== null) {
                    const runtimeScale = entry.scaleOverride !== 0 ? entry.scaleOverride : (placement.scale !== 0 ? placement.scale : 0x800);
                    const scale = runtimeScale / 0x800;
                    drawCall.objectMotion = { plan: motion, placement, scale, originY: entry.collideHeight * scale / 2, localMatrix: spec.localMatrix };
                    drawCall.modelMatrix = mat4.create();
                    computeObjectMotionMatrix(drawCall.modelMatrix, drawCall.objectMotion, 0);
                } else if (rotation !== null || localGeometry) {
                    const runtimeScale = entry.scaleOverride !== 0 ? entry.scaleOverride : (placement.scale !== 0 ? placement.scale : 0x800);
                    const scale = runtimeScale / 0x800;
                    const transform = { rotation: rotation ?? { zPerTick: 0, yPerTick: 0 }, placement, scale, originY: entry.collideHeight * scale / 2, localMatrix: spec.localMatrix };
                    if (rotation !== null)
                        drawCall.objectRotation = transform;
                    drawCall.modelMatrix = mat4.create();
                    computeObjectRotationMatrix(drawCall.modelMatrix, transform, 0);
                }
                drawCall.SP_GeometryMode = modelDrawCall.SP_GeometryMode | RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH;
                drawCall.SP_TextureState.set(modelDrawCall.SP_TextureState.on, modelDrawCall.SP_TextureState.tile, modelDrawCall.SP_TextureState.level, modelDrawCall.SP_TextureState.s, modelDrawCall.SP_TextureState.t);
                drawCall.DP_OtherModeH = modelDrawCall.DP_OtherModeH !== 0 ? modelDrawCall.DP_OtherModeH : DP_OTHERMODE_H;
                drawCall.DP_OtherModeL = modelDrawCall.DP_OtherModeL !== 0 ? modelDrawCall.DP_OtherModeL : RENDER_OPAQUE;
                drawCall.DP_Combine = modelDrawCall.DP_Combine;
                vec4.copy(drawCall.DP_PrimColor, modelDrawCall.DP_PrimColor);
                vec4.copy(drawCall.DP_EnvColor, modelDrawCall.DP_EnvColor);
                drawCall.fogNear = fogNear;
                drawCall.fogFar = fogFar;
                drawCall.fogColor = fogColor;
                drawCall.light = light;
                drawCall.translucent = (drawCall.DP_OtherModeL & (1 << 14)) !== 0;

                if (modelDrawCall.SP_TextureState.on && modelDrawCall.textureIndices.length !== 0) {
                    drawCall.textureIndices = modelDrawCall.textureIndices.map((index) => textureRemapper.get(model.sharedOutput.textureCache.textures[index]));
                } else if (spec.useContextTexture && contextTexture !== null) {
                    drawCall.textureIndices = [contextTexture];
                    drawCall.SP_TextureState.set(true, 0, 0, 0.5, 0.5);
                    drawCall.DP_Combine = initialOtherModeL === RENDER_TRANSLUCENT ? modelDrawCall.DP_Combine : COMBINE_TEXTURED;
                } else {
                    drawCall.textureIndices = [];
                    drawCall.DP_Combine = COMBINE_SHADE_PRIMITIVE;
                }
                if (entry.renderMode === 17 || (entry.renderMode === 6 && (placement.unkC & 0xC0) === 0xC0)) {
                    const reflectionId = REFLECTION_TEXTURE_ID_BASE + contextTextureId;
                    if (sharedOutput.textureCache.textures[reflectionId] !== undefined) {
                        drawCall.textureIndices = [reflectionId];
                        drawCall.SP_GeometryMode |= RSP_Geometry.G_TEXTURE_GEN | RSP_Geometry.G_LIGHTING | RSP_Geometry.G_FOG;
                        drawCall.SP_TextureState.set(true, 0, 0, 32, 32);
                        drawCall.DP_Combine = COMBINE_TEXTURED;
                        drawCall.textureGen = true;
                    }
                }
                if (textureAnimation !== null && spec.useContextTexture && modelDrawCall.textureIndices.length === 0
                    && textureAnimation.textureIndices.every((id) => sharedOutput.textureCache.textures[id] !== undefined)) {
                    drawCall.textureIndices = [textureAnimation.textureIndices[0]];
                    drawCall.animationTextureIndices = textureAnimation.textureIndices;
                    drawCall.animationLoopStartFrame = textureAnimation.loopStartFrame;
                    drawCall.animationFrameRate = computerIdle !== null ? 0 : GAME_TICK_RATE;
                    if (computerIdle !== null) drawCall.commandTextureFrame = 0;
                }
                if (spec.textureOverrideIds !== null && modelDrawCall.indexCount > 18) {
                    const textureIds = spec.textureOverrideIds.filter((textureId) => sharedOutput.textureCache.textures[textureId] !== undefined);
                    if (textureIds.length !== 0) {
                        drawCall.textureIndices = [textureIds[0]];
                        if (textureIds.length > 1) {
                            drawCall.animationTextureIndices = textureIds;
                            drawCall.animationFrameRate = spec.animationFrameRate;
                        }
                        drawCall.SP_TextureState.set(true, 0, 0, 0.5, 0.5);
                        drawCall.DP_Combine = COMBINE_TEXTURED;
                        drawCall.DP_OtherModeL = RENDER_TRANSLUCENT;
                        drawCall.translucent = true;
                    }
                }
                if (spec.combine !== null && drawCall.textureIndices.length === 0)
                    drawCall.DP_Combine = spec.combine;
                drawCall.objectPlacementIndex = placementIndex;
                if (spec.gravityPart !== undefined) {
                    drawCall.gravitySwitch = { placement, baseScale: entry.scaleOverride || placement.scale || 2048, collideHeight: entry.collideHeight,
                        state: readSwitchStartupAppearance(authoredPlacement, commands)?.state ?? 1, part: spec.gravityPart };
                    drawCall.modelMatrix = mat4.create();
                    if (spec.gravityPart !== 'body') {
                        drawCall.textureIndices = [];
                        drawCall.SP_TextureState.set(false, 0, 0, 0, 0);
                        drawCall.SP_GeometryMode &= ~(RSP_Geometry.G_LIGHTING | RSP_Geometry.G_FOG);
                        drawCall.DP_OtherModeH = 0;
                        drawCall.DP_OtherModeL = 0x005049D8;
                        drawCall.DP_Combine = RDP.decodeCombineParams(0xFFFFFF, 0xFFFDF6FB);
                        drawCall.translucent = true;
                    }
                    updateGravitySwitchVisual(drawCall, 0);
                }
                drawCall.objectStateColor = entry.renderMode === 12 && spec.primColor !== null;
                if (spec.primColor !== null)
                    vec4.set(drawCall.DP_PrimColor, spec.primColor[0], spec.primColor[1], spec.primColor[2], spec.primColor[3]);
                if (drawCall.floorButton !== null) {
                    if (drawCall.floorButton.part === 'cap') drawCall.DP_PrimColor[0] = floorButton!.state === 1 ? 1 : 64 / 255;
                    if (drawCall.floorButton.part === 'glow') {
                        drawCall.translucent = true; drawCall.DP_OtherModeL = 0x005049D8;
                        drawCall.DP_OtherModeH &= ~(3 << RDP.OtherModeH_Layout.G_MDSFT_CYCLETYPE);
                        drawCall.SP_GeometryMode &= ~(RSP_Geometry.G_LIGHTING | RSP_Geometry.G_FOG);
                    }
                }
                if (spec.teleporterPart !== undefined) {
                    const state = teleporterStartup?.state ?? null;
                    const alpha = teleporterFanAlpha(placement.x, placement.y + Math.floor(runtimeHeight) + 2, placement.z, startingPlayer);
                    drawCall.teleporter = { state, part: spec.teleporterPart, previewActive: false, alpha };
                    if (spec.teleporterPart === "fan") {
                        drawCall.visible = state === 1;
                        drawCall.textureIndices = [TELEPORTER_TEXTURE_ID_BASE + 3];
                        drawCall.SP_TextureState.set(true, 0, 0, 0.5, 0.5);
                        drawCall.SP_GeometryMode &= ~(RSP_Geometry.G_LIGHTING | RSP_Geometry.G_FOG);
                        drawCall.DP_Combine = COMBINE_TELEPORTER_FAN;
                        drawCall.DP_OtherModeL = 0x0C184A50;
                        drawCall.translucent = true;
                        vec4.set(drawCall.DP_PrimColor, 185 / 255, 185 / 255, 1, alpha[0] / 255);
                        vec4.set(drawCall.DP_EnvColor, 100 / 255, 100 / 255, 190 / 255, alpha[1] / 255);
                    } else {
                        vec4.set(drawCall.DP_PrimColor, state === null || state === 1 ? 1 : 0, state === null ? 1 : 0, state === 1 ? 0 : 1, 1);
                    }
                }

                drawCall.firstIndex = sharedOutput.indices.length;
                for (let i = 0; i < modelDrawCall.indexCount; i++) {
                    const oldIndex = model.sharedOutput.indices[modelDrawCall.firstIndex + i];
                    sharedOutput.indices.push(vertexMap.get(oldIndex)!);
                }
                drawCall.indexCount = modelDrawCall.indexCount;

                for (let i = 0; i < drawCall.indexCount; i++) {
                    const v = sharedOutput.vertices[sharedOutput.indices[drawCall.firstIndex + i]];
                    drawCall.center[0] += v.x;
                    drawCall.center[1] += v.y;
                    drawCall.center[2] += v.z;
                    drawCall.centerCount++;
                }
                if (drawCall.centerCount !== 0)
                    vec3.scale(drawCall.center, drawCall.center, 1 / drawCall.centerCount);

                drawCalls.push(drawCall);
            }
        }
    }

    return drawCalls;
}

export const BIOME_REGULAR_TEXTURE_ID_BASE = 500;
export const LEVEL_REGULAR_TEXTURE_ID_BASE = 520;
export const DYNAMIC_EFFECT_TEXTURE_ID_BASE = 560;
export const DYNAMIC_ENERGY_TEXTURE_ID_BASE = 580;
export const SHADOW_TEXTURE_ID_BASE = 600;
export const TELEPORTER_TEXTURE_ID_BASE = 610;
export const REFLECTION_TEXTURE_ID_BASE = 670;

const DYNAMIC_EFFECT_TEXTURE_COUNT = 16;
const DYNAMIC_ENERGY_FRAME_COUNT = 8;

export function installDynamicBillboardTextures(sharedOutput: RSPSharedOutput, segment1: ArrayBufferSlice): void {
    const cache = sharedOutput.textureCache;
    for (let i = 0; i < DYNAMIC_EFFECT_TEXTURE_COUNT; i++)
        cache.textures[DYNAMIC_EFFECT_TEXTURE_ID_BASE + i] = parseI8Texture(segment1, 32, 32, `dynamic_effect/${i}`, 0x29E10 + i * 0x400);

    for (let i = 0; i < DYNAMIC_ENERGY_FRAME_COUNT; i++) {
        const color = parseRGBA16Texture(segment1, 0x40CB0 + i * 0x800, 32, 32, `dynamic_energy/${i}`);
        const mask = parseI8Texture(segment1, 32, 32, `dynamic_energy_mask/${i}`, 0x3ECB0 + i * 0x400);
        for (let p = 0; p < color.pixels.length; p += 4)
            color.pixels[p + 3] = mask.pixels[p];
        cache.textures[DYNAMIC_ENERGY_TEXTURE_ID_BASE + i] = color;
    }
}

export function installTeleporterTextures(sharedOutput: RSPSharedOutput, segment1: ArrayBufferSlice): void {
    const frames = parseMipmapBank(segment1.subarray(0x84A0, 3 * 0xAB8), 'rgba16', 'teleporter');
    for (let i = 0; i < frames.length; i++)
        sharedOutput.textureCache.textures[TELEPORTER_TEXTURE_ID_BASE + i] = frames[i];
    // Despite the asset's IA16 name, mode 7 loads 1024 bytes and renders them as I8.
    sharedOutput.textureCache.textures[TELEPORTER_TEXTURE_ID_BASE + 3] = parseI8Texture(segment1, 32, 32, "teleporter/fan", 0xA730);
}

export function installReflectionTextures(sharedOutput: RSPSharedOutput, segment1: ArrayBufferSlice): void {
    const start = 0x2F010;
    const count = Math.floor((segment1.byteLength - start) / 0x800);
    for (let i = 0; i < count; i++)
        sharedOutput.textureCache.textures[REFLECTION_TEXTURE_ID_BASE + i] = parseRGBA16Texture(segment1, start + i * 0x800, 32, 32, `reflection/${i}`);
}

export function installShadowTextures(sharedOutput: RSPSharedOutput, segment1: ArrayBufferSlice): void {
    const offsets = [0x34190, 0x33190, 0x34990];
    for (let i = 0; i < offsets.length; i++) {
        const texture = parseI4Texture(segment1, 64, 64, `shadow/${i}`, offsets[i]);
        for (let p = 0; p < texture.pixels.length; p += 4) {
            const intensity = texture.pixels[p + 3];
            texture.pixels[p + 0] = 0;
            texture.pixels[p + 1] = 0;
            texture.pixels[p + 2] = 0;
            texture.pixels[p + 3] = intensity;
        }
        sharedOutput.textureCache.textures[SHADOW_TEXTURE_ID_BASE + i] = texture;
    }
}

export interface SSSVBillboard {
    x: number;
    z: number;
    y: number;
    size: number;
    category: number;
}

export function buildBillboards(sharedOutput: RSPSharedOutput, placements: LevelObjectPlacement[], objectTable: Map<number, SSSVObjectData>, billboardSets: SSSVBillboard[][], dat: LevelDat, commands: readonly LevelCommand[] = [], excludedPlacements?: ReadonlySet<number>): SSSVDrawCall[] {
    const [fogNear, fogFar] = makeFogNearFar(dat);
    const fogColor = colorNewFromRGBA8((dat.fogColor[0] << 24) | (dat.fogColor[1] << 16) | (dat.fogColor[2] << 8) | 0xFF);
    const light = makeLight(dat);
    const scratch = vec3.create();
    const pending: { placementIndex: number, textureIds: number[], texture: RDP.Texture, modelMatrix: mat4, center: [number, number, number], frameRate: number, tint: [number, number, number, number] | null, projectedSize: number | null, intensityColor: [number, number, number] | null }[] = [];

    const addBillboard = (placementIndex: number, category: number, worldX: number, worldY: number, worldZ: number, size: number, tint: [number, number, number, number] | null = null, projectedSize: number | null = null, intensityColor: [number, number, number] | null = null): void => {
        let textureIds: number[] | null = null;
        let frameRate = 0;
        if (category === 0) {
            textureIds = [BIOME_REGULAR_TEXTURE_ID_BASE, BIOME_REGULAR_TEXTURE_ID_BASE + 1, BIOME_REGULAR_TEXTURE_ID_BASE + 2];
            frameRate = 15;
        } else if (category > 0 && category < 8) {
            textureIds = [BIOME_REGULAR_TEXTURE_ID_BASE + category];
        } else if (category >= 8 && category < 32) {
            textureIds = [LEVEL_REGULAR_TEXTURE_ID_BASE + (category - 8)];
        } else if (category >= 32 && category < 48) {
            textureIds = [DYNAMIC_EFFECT_TEXTURE_ID_BASE + (category - 32)];
        } else if (category === 48) {
            textureIds = [];
            for (let i = 0; i < DYNAMIC_ENERGY_FRAME_COUNT; i++)
                textureIds.push(DYNAMIC_ENERGY_TEXTURE_ID_BASE + i);
            frameRate = 30;
        }
        if (textureIds === null)
            return;
        textureIds = textureIds.filter((textureId) => sharedOutput.textureCache.textures[textureId] !== undefined);
        if (textureIds.length === 0)
            return;

        const texture = sharedOutput.textureCache.textures[textureIds[0]];
        const modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, [worldX, worldY, mirrorZ(worldZ)]);
        if (projectedSize === null) mat4.scale(modelMatrix, modelMatrix, [size, size, size]);
        pending.push({ placementIndex, textureIds, texture, modelMatrix, center: [worldX, worldY, mirrorZ(worldZ)], frameRate, tint, projectedSize, intensityColor });
    };

    for (const [placementIndex, authoredPlacement] of placements.entries()) {
        if (excludedPlacements?.has(placementIndex)) continue;
        const visibility = readObjectVisibility(authoredPlacement, commands);
        if (visibility.hidden)
            continue;
        const startup = readWalraceSpriteStartup(placementIndex, authoredPlacement, commands);
        const placement = { ...authoredPlacement, ...startup, unkC: startup?.material ?? visibility.material };
        const entry = objectTable.get(placement.id);
        if (entry === undefined)
            continue;

        const runtimeScale = entry.scaleOverride !== 0 ? entry.scaleOverride : (placement.scale !== 0 ? placement.scale : 0x800);
        const scale = runtimeScale / 0x800;
        const originY = (entry.renderMode === 22 ? Math.floor(entry.collideHeight * scale) : entry.collideHeight * scale) / 2;

        if (entry.renderMode === 1) {
            let tint: [number, number, number, number] | null = null;
            if (entry.billboardSetIndex === 48) {
                if (entry.id === 58)
                    tint = [1, 0, 1, 1];
                else if (entry.id === 59)
                    tint = [1, 160 / 255, 1, 1];
                else if (entry.id === 60)
                    tint = [1, 1, 1, 1];
            }
            addBillboard(placementIndex, entry.billboardSetIndex, placement.x, placement.y + originY, placement.z, scale * 96, tint);
        } else if (entry.renderMode === 8) {
            const set = billboardSets[entry.billboardSetIndex];
            if (set === undefined)
                continue;
            const placementMatrix = makePlacementMatrix(placement, entry);
            const color = readBillboardStartupColor(authoredPlacement, commands);
            for (const billboard of set) {
                vec3.set(scratch, billboard.x, billboard.y, billboard.z);
                vec3.transformMat4(scratch, scratch, placementMatrix);
                const spriteScale = Math.max(10, billboard.size) * scale / 32;
                addBillboard(placementIndex, billboard.category, scratch[0], scratch[1], scratch[2], spriteScale, null, null,
                    billboard.category >= 32 && billboard.category < 48 ? color : null);
            }
        } else if (entry.renderMode === 18 || entry.renderMode === 22) {
            const category = placement.unkC & 0x3F;
            const projectedSize = entry.renderMode === 22 && category < 32 ? runtimeScale * 3 / 256 : null;
            addBillboard(placementIndex, category, placement.x, placement.y + originY, placement.z, scale * 64, null, projectedSize);
        }
    }

    if (pending.length === 0)
        return [];

    const base = sharedOutput.vertices.length;
    const quad = [
        { x: -0.5, y: -0.5, u: 0, v: 1 },
        { x: 0.5, y: -0.5, u: 1, v: 1 },
        { x: 0.5, y: 0.5, u: 1, v: 0 },
        { x: -0.5, y: 0.5, u: 0, v: 0 },
    ];
    for (const corner of quad) {
        const v = new Vertex();
        v.x = corner.x;
        v.y = corner.y;
        v.z = 0;
        v.matrixIndex = 1;
        v.tx = corner.u;
        v.ty = corner.v;
        v.c0 = 1;
        v.c1 = 1;
        v.c2 = 1;
        v.a = 1;
        sharedOutput.vertices.push(v);
    }
    const firstIndex = sharedOutput.indices.length;
    sharedOutput.indices.push(base + 0, base + 1, base + 2, base + 0, base + 2, base + 3);

    let tallFirstIndex = firstIndex;
    if (pending.some(b => b.projectedSize !== null)) {
        const tallBase = sharedOutput.vertices.length;
        // Flag 127 stretches the complete image above its anchor: top +3, bottom -1.
        for (const corner of quad) {
            const v = new Vertex();
            v.x = corner.x * 2; v.y = corner.y > 0 ? 3 : -1; v.z = 0;
            v.matrixIndex = 1; v.tx = corner.u; v.ty = corner.v;
            v.c0 = v.c1 = v.c2 = v.a = 1;
            sharedOutput.vertices.push(v);
        }
        tallFirstIndex = sharedOutput.indices.length;
        sharedOutput.indices.push(tallBase, tallBase + 1, tallBase + 2, tallBase, tallBase + 2, tallBase + 3);
    }

    const drawCalls: SSSVDrawCall[] = [];
    for (const billboard of pending) {
        const drawCall = new SSSVDrawCall();
        drawCall.objectPlacementIndex = billboard.placementIndex;
        drawCall.layer = SSSVLayer.Objects;
        drawCall.billboard = true;
        drawCall.modelMatrix = billboard.modelMatrix;
        if (billboard.projectedSize !== null) drawCall.projectedObjectSprite = { size: billboard.projectedSize };
        drawCall.translucent = true;
        drawCall.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH;
        drawCall.SP_TextureState.set(true, 0, 0, billboard.texture.width, billboard.texture.height);
        drawCall.DP_OtherModeH = DP_OTHERMODE_H;
        drawCall.DP_OtherModeL = RENDER_TRANSLUCENT;
        drawCall.DP_Combine = billboard.intensityColor !== null ? COMBINE_COLOURED_LIGHT : COMBINE_TEXTURED;
        if (billboard.intensityColor !== null) {
            const [r, g, b] = billboard.intensityColor.map(c => c / 255);
            vec4.set(drawCall.DP_PrimColor, r, g, b, 1);
            vec4.set(drawCall.DP_EnvColor, r, g, b, 0);
        }
        drawCall.textureIndices = [billboard.textureIds[0]];
        if (billboard.textureIds.length > 1 && billboard.frameRate !== 0) {
            drawCall.animationTextureIndices = billboard.textureIds;
            drawCall.animationFrameRate = billboard.frameRate;
        }
        if (billboard.tint !== null) {
            const tintBase = sharedOutput.vertices.length;
            for (const corner of quad) {
                const v = new Vertex();
                v.x = corner.x;
                v.y = corner.y;
                v.z = 0;
                v.matrixIndex = 1;
                v.tx = corner.u;
                v.ty = corner.v;
                v.c0 = billboard.tint[0];
                v.c1 = billboard.tint[1];
                v.c2 = billboard.tint[2];
                v.a = billboard.tint[3];
                sharedOutput.vertices.push(v);
            }
            drawCall.firstIndex = sharedOutput.indices.length;
            sharedOutput.indices.push(tintBase + 0, tintBase + 1, tintBase + 2, tintBase + 0, tintBase + 2, tintBase + 3);
        } else {
            drawCall.firstIndex = billboard.projectedSize !== null ? tallFirstIndex : firstIndex;
        }
        drawCall.fogNear = fogNear;
        drawCall.fogFar = fogFar;
        drawCall.fogColor = fogColor;
        drawCall.light = light;
        drawCall.indexCount = 6;
        drawCall.center[0] = billboard.center[0];
        drawCall.center[1] = billboard.center[1];
        drawCall.center[2] = billboard.center[2];
        drawCall.centerCount = 1;
        drawCalls.push(drawCall);
    }

    return drawCalls;
}
