import * as RDP from "../Common/N64/RDP.js";
import { ImageFormat, ImageSize, TexCM, TextureLUT } from "../Common/N64/Image.js";
import ArrayBufferSlice from "../ArrayBufferSlice.js";
import { RSP_Geometry, RSPSharedOutput, Vertex } from "../BanjoKazooie/f3dex.js";
import { RSPState, RSPSharedOutput as F3DEXSharedOutput, runDL_F3DEX } from "../TopGearRally/f3dex.js";
import { colorNewFromRGBA8 } from "../Color.js";
import { assert, assertExists } from "../util.js";
import { mat4, vec3, vec4 } from "gl-matrix";
import { sampleGroundHeight } from "./terrain_height.js";
import type { LevelAnimalPlacement, LevelDat, LevelMapEntry } from "./level.js";
import { DP_OTHERMODE_H, makeFogNearFar, makeLight, RENDER_OPAQUE, SSSVDrawCall, SSSVLayer } from "./terrain.js";
import { getStaticAnimalRecipe } from "./animal_contracts.js";
import { buildRatEyeGlows } from "./rat_eye_glows.js";
import { fireFoxSeed, sampleFireFoxFlameScale } from "./fire_fox_effects.js";
import { ParticleRandom } from "./script_particles.js";
import { buildMysteryBearBalls, sampleMysteryBearBalls, sampleMysteryBearJoints } from "./mystery_bear.js";
import { buildMysteryBearSpotlights } from "./mystery_bear_spotlights.js";
import type { MysteryBearSpotlights } from "./mystery_bear_spotlights.js";
import type { AnimalJoint } from "./animal_matrix.js";
import type { AnimalModelRecipe, AnimalPartAttachment, AnimalRenderStateChange } from "./animal_contracts.js";
import { animalMatrixFlipsWinding, computeAnimalLimbMatrix, computeAnimalPlacementMatrix, multiplyAnimalMatrices, transformAnimalNormal, writeAnimalLimbMatrix } from "./animal_matrix.js";
import { readWoolVertices, sampleWoolVertex, WOOL_ACTIVE_OFFSET, WOOL_VERTEX_COUNT } from "./wool.js";
import type { WoolVertex } from "./wool.js";
import { ANIMAL_EYE_ATLASES } from "./animal_eyes.js";
import { advanceAnimalTail, animalTailMatrix, createAnimalTail } from "./animal_tails.js";
import type { AnimalTail } from "./animal_tails.js";

export { sampleGroundHeight as sampleAnimalSpawnGroundHeight } from "./terrain_height.js";

interface PartRange {
    tailLink?: number;
    firstIndex: number;
    endIndex: number;
    matrix: mat4;
    part: AnimalPartAttachment;
    diagnostics: StaticAnimalBuild["partMatrices"][number];
}

export interface StaticAnimalBuild {
    recipe: AnimalModelRecipe;
    placement: Readonly<LevelAnimalPlacement>;
    drawCalls: SSSVDrawCall[];
    textureIds: number[];
    placementIndex: number;
    isPlayer: boolean;
    spawnCommandIndex?: number;
    resolvedY: number;
    wool: AnimalWoolAnimation | null;
    tail: AnimalTailAnimation | null;
    flame: AnimalFlameAnimation | null;
    mysteryBear: MysteryBearAnimation | null;
    partMatrices: {
        name: string;
        matrix: mat4;
        flipsWinding: boolean;
        drawCalls: number;
        triangles: number;
        geometryModes: number[];
        otherModesL: number[];
        textureIndices: number[];
    }[];
}

export interface MysteryBearAnimation {
    root: mat4;
    placement: Readonly<LevelAnimalPlacement>;
    resolvedY: number;
    targets: { vertexIndex: number; rest: Vertex; lit: boolean; part: AnimalPartAttachment; draw: SSSVDrawCall }[];
    balls: SSSVDrawCall[];
    spotlights: MysteryBearSpotlights | null;
    firstVertex: number;
    vertexCount: number;
    lastTick: number;
}

export function updateMysteryBear(animation: MysteryBearAnimation, vertexData: Float32Array, tick: number): boolean {
    if (animation.lastTick === tick) return false;
    const joints = sampleMysteryBearJoints(tick);
    const matrices = new Map<AnimalPartAttachment, mat4>();
    const draws = new Set(animation.targets.map(t => t.draw));
    for (const draw of draws) vec3.zero(draw.center);
    for (const target of animation.targets) {
        let matrix = matrices.get(target.part);
        if (matrix === undefined) {
            const scale = sourceScale(target.part.scale);
            const limb = assertExists(computeAnimalLimbMatrix(joints[target.part.joints.from], joints[target.part.joints.to], {
                scaleX: scale[0], scaleZ: scale[1], scaleY: scale[2], centerScale: 0, roll: 0,
                mirror: target.part.mirror, orientationMode: target.part.orientationMode,
            }));
            matrix = mat4.create();
            writeAnimalLimbMatrix(matrix, limb, target.part.sourceVertexAxes);
            multiplyAnimalMatrices(matrix, animation.root, matrix);
            matrices.set(target.part, matrix);
        }
        const baked = makeBakedVertex(target.rest, matrix, target.lit);
        const offset = target.vertexIndex * 10;
        vertexData[offset] = baked.x; vertexData[offset + 1] = baked.y; vertexData[offset + 2] = baked.z;
        vertexData[offset + 6] = baked.c0; vertexData[offset + 7] = baked.c1; vertexData[offset + 8] = baked.c2;
        vec3.add(target.draw.center, target.draw.center, [baked.x, baked.y, baked.z]);
    }
    for (const draw of draws) vec3.scale(draw.center, draw.center, 1 / draw.centerCount);
    sampleMysteryBearBalls(animation.placement, animation.resolvedY, tick).forEach((center, i) => {
        vec3.copy(animation.balls[i].center, center);
        mat4.fromTranslation(animation.balls[i].modelMatrix!, center);
    });
    animation.lastTick = tick;
    return true;
}

export interface AnimalWoolAnimation {
    rest: WoolVertex[];
    matrix: mat4;
    targets: { vertexIndex: number; woolIndex: number }[];
    firstVertex: number;
    vertexCount: number;
    lastTick: number;
}

export interface AnimalFlameAnimation {
    root: mat4;
    from: AnimalJoint;
    to: AnimalJoint;
    placementIndex: number;
    sourceVertexAxes: boolean;
    targets: { vertexIndex: number; rest: Vertex; lit: boolean }[];
    firstVertex: number;
    vertexCount: number;
    lastTick: number;
}

export function updateAnimalFlame(animation: AnimalFlameAnimation, vertexData: Float32Array, tick: number): boolean {
    if (animation.lastTick === tick) return false;
    const [scaleX, scaleZ, scaleY] = sampleFireFoxFlameScale(new ParticleRandom(fireFoxSeed(animation.placementIndex, tick)));
    const limb = assertExists(computeAnimalLimbMatrix(animation.from, animation.to, {
        scaleX, scaleZ, scaleY, centerScale: 0, roll: 0, mirror: 0, orientationMode: 0,
    }));
    const matrix = mat4.create();
    writeAnimalLimbMatrix(matrix, limb, animation.sourceVertexAxes);
    multiplyAnimalMatrices(matrix, animation.root, matrix);
    for (const target of animation.targets) {
        const baked = makeBakedVertex(target.rest, matrix, target.lit);
        const offset = target.vertexIndex * 10;
        vertexData[offset] = baked.x; vertexData[offset + 1] = baked.y; vertexData[offset + 2] = baked.z;
        vertexData[offset + 6] = baked.c0; vertexData[offset + 7] = baked.c1; vertexData[offset + 8] = baked.c2;
    }
    animation.lastTick = tick;
    return true;
}

export function updateAnimalWool(animation: AnimalWoolAnimation, vertexData: Float32Array, tick: number): boolean {
    if (animation.lastTick === tick) return false;
    const samples = animation.rest.map(rest => sampleWoolVertex(rest, tick));
    const vertex = new Vertex();
    for (const target of animation.targets) {
        const sample = samples[target.woolIndex];
        [vertex.x, vertex.y, vertex.z] = sample.position;
        vertex.c0 = (sample.normal[0] & 0xFF) / 255;
        vertex.c1 = (sample.normal[1] & 0xFF) / 255;
        vertex.c2 = (sample.normal[2] & 0xFF) / 255;
        const baked = makeBakedVertex(vertex, animation.matrix, true);
        const offset = target.vertexIndex * 10;
        vertexData[offset] = baked.x; vertexData[offset + 1] = baked.y; vertexData[offset + 2] = baked.z;
        vertexData[offset + 6] = baked.c0; vertexData[offset + 7] = baked.c1; vertexData[offset + 8] = baked.c2;
    }
    animation.lastTick = tick;
    return true;
}

export interface AnimalTailAnimation {
    simulation: AnimalTail;
    targets: { vertexIndex: number; link: number; rest: Vertex }[];
    firstVertex: number;
    vertexCount: number;
}

export function updateAnimalTail(animation: AnimalTailAnimation, vertexData: Float32Array, tick: number): boolean {
    if (!advanceAnimalTail(animation.simulation, tick)) return false;
    const matrices = Array.from({ length: animation.simulation.points.length - 1 }, (_, link) => animalTailMatrix(animation.simulation, link));
    for (const target of animation.targets) {
        const baked = makeBakedVertex(target.rest, matrices[target.link], true);
        const offset = target.vertexIndex * 10;
        vertexData[offset] = baked.x; vertexData[offset + 1] = baked.y; vertexData[offset + 2] = baked.z;
        vertexData[offset + 6] = baked.c0; vertexData[offset + 7] = baked.c1; vertexData[offset + 8] = baked.c2;
    }
    return true;
}

export const ANIMAL_TEXTURE_ID_BASE = 800;
const ANIMAL_TEXTURE_ID_LIMIT = 900;

interface AnimalTextureRemapper {
    nextId: number;
    byKey: Map<string, number>;
}

function makeAnimalTextureRemapper(sharedOutput: RSPSharedOutput): AnimalTextureRemapper {
    let nextId = ANIMAL_TEXTURE_ID_BASE;
    while (sharedOutput.textureCache.textures[nextId] !== undefined && nextId < ANIMAL_TEXTURE_ID_LIMIT)
        nextId++;
    assert(nextId < ANIMAL_TEXTURE_ID_LIMIT, "Animal texture ID range is exhausted");
    return { nextId, byKey: new Map() };
}

export function resolveAnimalSpawnY(placement: LevelAnimalPlacement, map: readonly LevelMapEntry[]): number | null {
    const ground = sampleGroundHeight(map, placement.x, placement.z);
    return ground !== null ? Math.max(placement.y, ground) : null;
}

function sourceScale(scale: AnimalPartAttachment["scale"]): [number, number, number] {
    switch (scale.kind) {
    case "shared-body-scale":
        return [0x10000, 0x10000, 0x10000];
    case "shared-head-scale":
        return [0x10000, 0x10000, 0x10000];
    case "unit-16.16":
        return [scale.value, scale.value, scale.value];
    }
}

function setTlut(state: RSPState, paletteAddress: number, tmem = 0x110): void {
    state.gDPSetTextureImage(ImageFormat.G_IM_FMT_RGBA, ImageSize.G_IM_SIZ_16b, 1, paletteAddress);
    state.gDPSetTile(ImageFormat.G_IM_FMT_RGBA, ImageSize.G_IM_SIZ_16b, 0, tmem, 7, 0, 0, 0, 0, 0, 0, 0);
    state.gDPLoadTLUT(7, 16);
}

function loadAnimalBodyTile(state: RSPState, change: Extract<AnimalRenderStateChange, { kind: "load-tile" }>): void {
    setTlut(state, change.paletteAddress);
    state.gDPSetTextureImage(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_16b, 1, change.textureAddress);
    state.gDPSetTile(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_16b, 0, 0, 7, 0, TexCM.WRAP, 2, 0, TexCM.CLAMP, 0, 0);
    state.gDPLoadBlock(7, 0, 0, ((32 * 32) >> 2) - 1, 1024);
    const wrap = change.clamp ? TexCM.CLAMP : TexCM.WRAP;
    state.gDPSetTile(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_4b, 2, 0, 0, 1, wrap, 5, 0, wrap, 5, 0);
    state.gDPSetTileSize(0, 0, 0, 4 * 31, 4 * 31);
}

function loadAnimalWingTiles(state: RSPState, change: Extract<AnimalRenderStateChange, { kind: "load-wing-tiles" | "load-two-tiles" }>): void {
    setTlut(state, change.paletteAddresses[0], 0x100);
    setTlut(state, change.paletteAddresses[1], 0x110);
    state.gDPSetTextureImage(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_16b, 1, change.textureAddress);
    state.gDPSetTile(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_16b, 0, 0, 7, 0, TexCM.WRAP, 2, 0, TexCM.CLAMP, 0, 0);
    state.gDPLoadBlock(7, 0, 0, (48 * 64 >> 2) - 1, 683);
    // 56F64 loads one 48x64 image, then the mesh samples two 48x32 regions
    // at TMEM 0 / 0x60 with different palettes. Neither render tile clamps.
    for (let tile = 0; tile < 2; tile++) {
        state.gDPSetTile(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_4b, 3, tile * 0x60, tile, tile, TexCM.WRAP, 0, 0, TexCM.WRAP, 0, 0);
        state.gDPSetTileSize(tile, 0, 0, 4 * 47, 4 * 31);
    }
}

function loadAnimalTwoTiles(state: RSPState, change: Extract<AnimalRenderStateChange, { kind: "load-wing-tiles" | "load-two-tiles" }>): void {
    setTlut(state, change.paletteAddresses[0], 0x110);
    setTlut(state, change.paletteAddresses[1], 0x120);
    state.gDPSetTextureImage(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_16b, 1, change.textureAddress);
    state.gDPSetTile(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_16b, 0, 0, 7, 0, TexCM.WRAP, 2, 0, TexCM.CLAMP, 0, 0);
    state.gDPLoadBlock(7, 0, 0, (32 * 64 >> 2) - 1, 1024);
    for (let tile = 0; tile < 2; tile++) {
        state.gDPSetTile(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_4b, 2, tile * 0x40, tile, tile + 1, TexCM.WRAP, 5, 0, TexCM.WRAP, 5, 0);
        state.gDPSetTileSize(tile, 0, 0, 4 * 31, 4 * 31);
    }
}

function loadAnimalEyeFrame(state: RSPState, change: Extract<AnimalRenderStateChange, { kind: "load-eye-palette-frame" }>): void {
    setTlut(state, change.paletteAddress);
    state.gDPSetTextureImage(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_16b, 1, change.textureAddress);
    state.gDPSetTile(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_16b, 0, 0, 7, 0, TexCM.WRAP, 0, 0, TexCM.WRAP, 0, 0);
    state.gDPLoadBlock(7, 0, 0, 63, 2048);
    state.gDPSetTile(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_4b, 1, 0, 0, 1, TexCM.WRAP, 0, 0, TexCM.WRAP, 0, 0);
    state.gDPSetTileSize(0, 0, 0, 4 * 15, 4 * 15);
}

function applyStateChange(state: RSPState, change: AnimalRenderStateChange): void {
    switch (change.kind) {
    case "set-cull-mode":
        state.gSPClearGeometryMode(RSP_Geometry.G_CULL_BACK | RSP_Geometry.G_CULL_FRONT);
        if (change.mode !== "none") state.gSPSetGeometryMode(change.mode === "front" ? RSP_Geometry.G_CULL_FRONT : RSP_Geometry.G_CULL_BACK);
        break;
    case "load-track-panels":
        // func_80356D84: one 64x64 CI4 load, sampled as two 64x32 regions.
        setTlut(state, change.paletteAddress);
        state.gDPSetTextureImage(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_16b, 1, change.textureAddress);
        state.gDPSetTile(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_16b, 0, 0, 7, 0, TexCM.WRAP, 0, 0, TexCM.WRAP, 0, 0);
        state.gDPLoadBlock(7, 0, 0, 1023, 512);
        for (let tile = 0; tile < 2; tile++) {
            state.gDPSetTile(ImageFormat.G_IM_FMT_CI, ImageSize.G_IM_SIZ_4b, 4, tile * 0x80, tile, 1, TexCM.WRAP, 0, 0, TexCM.WRAP, 0, 0);
            state.gDPSetTileSize(tile, 0, 0, 4 * 63, 4 * 31);
        }
        break;
    case "load-tile":
        loadAnimalBodyTile(state, change);
        break;
    case "set-primitive-color":
        state.gSPSetPrimColor(0, change.rgba[0], change.rgba[1], change.rgba[2], change.rgba[3]);
        break;
    case "apply-state-display-list":
        runDL_F3DEX(state, change.address);
        break;
    case "load-two-tiles":
        loadAnimalTwoTiles(state, change);
        break;
    case "load-wing-tiles":
        loadAnimalWingTiles(state, change);
        break;
    case "load-eye-palette-frame":
        loadAnimalEyeFrame(state, change);
        break;
    }
}

function decodeN64Normal(component: number): number {
    const byte = Math.trunc(component * 0xFF) & 0xFF;
    return ((byte << 24) >> 24) / 127;
}

function encodeN64Normal(component: number): number {
    const value = Math.max(-127, Math.min(127, Math.round(component * 127)));
    return (value & 0xFF) / 0xFF;
}

function makeBakedVertex(src: Vertex, matrix: mat4, isLighting: boolean): Vertex {
    const dst = new Vertex();
    const position = vec3.transformMat4(vec3.create(), [src.x, src.y, src.z], matrix);
    dst.x = position[0]; dst.y = position[1]; dst.z = position[2];
    dst.matrixIndex = 1;
    dst.tx = src.tx; dst.ty = src.ty; dst.a = src.a;
    if (isLighting) {
        const normal = vec3.fromValues(decodeN64Normal(src.c0), decodeN64Normal(src.c1), decodeN64Normal(src.c2));
        const transformed = vec3.create();
        assert(transformAnimalNormal(transformed, normal, matrix), "Animal part matrix must be invertible");
        dst.c0 = encodeN64Normal(transformed[0]);
        dst.c1 = encodeN64Normal(transformed[1]);
        dst.c2 = encodeN64Normal(transformed[2]);
    } else {
        dst.c0 = src.c0; dst.c1 = src.c1; dst.c2 = src.c2;
    }
    return dst;
}

function remapAnimalTextures(
    localIndices: readonly number[],
    parserOutput: F3DEXSharedOutput,
    sharedOutput: RSPSharedOutput,
    remapper: AnimalTextureRemapper,
): number[] {
    return localIndices.map((localIndex) => {
        const texture = assertExists(parserOutput.textureCache.textures[localIndex], `Animal parser texture ${localIndex}`);
        const key = `${texture.dramAddr}|${texture.dramPalAddr}|${texture.tile.cacheKey}|${texture.width}x${texture.height}`;
        let id = remapper.byKey.get(key);
        if (id === undefined) {
            while (sharedOutput.textureCache.textures[remapper.nextId] !== undefined && remapper.nextId < ANIMAL_TEXTURE_ID_LIMIT)
                remapper.nextId++;
            assert(remapper.nextId < ANIMAL_TEXTURE_ID_LIMIT, "Animal texture ID range is exhausted");
            id = remapper.nextId++;
            assert(sharedOutput.textureCache.textures[id] === undefined, `Animal texture ID collision at ${id}`);
            sharedOutput.textureCache.textures[id] = texture;
            remapper.byKey.set(key, id);
        }
        return id;
    });
}

function buildStaticAnimalModel(
    sharedOutput: RSPSharedOutput,
    segmentBuffers: readonly (ArrayBufferSlice | undefined)[],
    placement: LevelAnimalPlacement,
    placementIndex: number,
    map: readonly LevelMapEntry[],
    dat: LevelDat,
    textureRemapper: AnimalTextureRemapper,
    recipe: AnimalModelRecipe,
): StaticAnimalBuild | null {
    const resolvedY = resolveAnimalSpawnY(placement, map);
    if (resolvedY === null)
        return null;
    const levelSegments = segmentBuffers as ArrayBufferSlice[];
    assertExists(levelSegments[0x01], "Animal shared segment 1");
    assertExists(levelSegments[0x04], "Animal biome segment 4");

    const parserOutput = new F3DEXSharedOutput();
    const state = new RSPState(levelSegments, parserOutput);
    state.loadVerticesOnDemand = true;
    state.deinterleaveTextures = false;
    state.gSPSetGeometryMode(RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH | RSP_Geometry.G_CULL_BACK | RSP_Geometry.G_LIGHTING);
    state.gDPSetOtherModeH(0, 24, DP_OTHERMODE_H | (TextureLUT.G_TT_RGBA16 << RDP.OtherModeH_Layout.G_MDSFT_TEXTLUT));
    state.gDPSetOtherModeL(0, 29, RENDER_OPAQUE);

    const rootMatrix = mat4.create();
    const scales = recipe.pose.sample.scaleInputs.outerMatrixAxis16_16;
    computeAnimalPlacementMatrix(rootMatrix, {
        x: placement.x,
        z: placement.z,
        y: resolvedY,
        heading: placement.rotation,
        scaleX: scales[0], scaleZ: scales[2], scaleY: scales[1],
        roll: 0, rollScale: 0,
    });

    const operations = [
        ...recipe.parts.map((part) => ({ order: part.order, part })),
        ...recipe.stateChanges.map((change) => ({ order: change.order, change })),
    ].sort((a, b) => a.order - b.order);
    const partRanges: PartRange[] = [];
    const partMatrices: StaticAnimalBuild["partMatrices"] = [];
    for (const operation of operations) {
        if ("change" in operation) {
            applyStateChange(state, operation.change);
            continue;
        }

        const part = operation.part;
        const joint0 = part.jointOverrides?.from ?? assertExists(recipe.pose.sample.jointPositions[part.joints.from], `${part.name}: joint ${part.joints.from}`);
        const joint1 = part.jointOverrides?.to ?? assertExists(recipe.pose.sample.jointPositions[part.joints.to], `${part.name}: joint ${part.joints.to}`);
        const partScale = sourceScale(part.scale);
        const limb = computeAnimalLimbMatrix(joint0, joint1, {
            scaleX: partScale[0], scaleZ: partScale[1], scaleY: partScale[2],
            centerScale: 0, roll: 0, mirror: part.mirror, orientationMode: part.orientationMode,
        });
        assert(limb !== null, `${part.name}: degenerate DOG limb`);
        const limbMatrix = mat4.create();
        writeAnimalLimbMatrix(limbMatrix, limb, part.sourceVertexAxes);
        const worldMatrix = mat4.create();
        multiplyAnimalMatrices(worldMatrix, rootMatrix, limbMatrix);
        const diagnostics = { name: part.name, matrix: mat4.clone(worldMatrix), flipsWinding: animalMatrixFlipsWinding(worldMatrix), drawCalls: 0, triangles: 0, geometryModes: [], otherModesL: [], textureIndices: [] };
        // The source's vertical fallback basis changes handedness for upward limbs.
        const upwardVertical = joint0.x === joint1.x && joint0.z === joint1.z && joint1.y > joint0.y;
        assert(diagnostics.flipsWinding === (upwardVertical !== (part.mirror === 1 || part.mirror === 2)), `${part.name}: unexpected animal part winding`);
        partMatrices.push(diagnostics);

        const firstIndex = parserOutput.indices.length;
        runDL_F3DEX(state, part.address);
        const endIndex = parserOutput.indices.length;
        assert(endIndex > firstIndex, `${part.name}: source display list emitted no triangles`);
        partRanges.push({ firstIndex, endIndex, matrix: worldMatrix, part, diagnostics });
    }

    const simulation = createAnimalTail(placement, resolvedY, recipe.pose.sample.jointPositions[placement.id === 56 ? 20 : [40, 41, 42].includes(placement.id) ? 26 : 2]);
    const tail: AnimalTailAnimation | null = simulation === null ? null : { simulation, targets: [], firstVertex: sharedOutput.vertices.length, vertexCount: 0 };
    if (tail !== null) {
        runDL_F3DEX(state, tail.simulation.kind === "elephant" ? 0x01003618 : 0x01003548);
        state.gSPSetPrimColor(0, 255, 153, 153, 255);
        for (let link = 0; link < tail.simulation.points.length - 1; link++) {
            if (tail.simulation.kind === "husky") state.gSPSetPrimColor(0, [190, 212, 255][link], 255, 255, 255);
            // CRAZY_HUSKY colour phases and alternating tip are held at source tick zero.
            if (tail.simulation.kind === "crazy-husky") state.gSPSetPrimColor(0, [128, 183, 73][link], 255, 255, 255);
            if (tail.simulation.kind === "elephant") state.gSPSetPrimColor(0, 148, 148, 148, 255);
            const matrix = animalTailMatrix(tail.simulation, link);
            const part = { ...recipe.parts[0], name: `${tail.simulation.kind === "elephant" ? "trunk" : "tail"} ${link}` };
            const diagnostics = { name: part.name, matrix, flipsWinding: animalMatrixFlipsWinding(matrix), drawCalls: 0, triangles: 0, geometryModes: [], otherModesL: [], textureIndices: [] };
            const firstIndex = parserOutput.indices.length;
            runDL_F3DEX(state, tail.simulation.kind === "elephant" ? (link === 3 ? 0x040062C0 : 0x04006200) : tail.simulation.kind === "mouse" ? 0x04006C00 : tail.simulation.kind === "crazy-husky" && link === 2 ? 0x040039C0 : 0x04003930);
            partRanges.push({ firstIndex, endIndex: parserOutput.indices.length, matrix, part, diagnostics, tailLink: link });
        }
    }

    const parserDrawCalls = assertExists(state.finish(), "Animal RSP draw calls").drawCalls;
    const [fogNear, fogFar] = makeFogNearFar(dat);
    const fogColor = colorNewFromRGBA8((dat.fogColor[0] << 24) | (dat.fogColor[1] << 16) | (dat.fogColor[2] << 8) | 0xFF);
    const light = makeLight(dat);
    const drawCalls: SSSVDrawCall[] = [];
    const flamePart = recipe.species === "FIRE_FOX" ? assertExists(recipe.parts.find(part => part.name === "flame tail")) : null;
    const mysteryBear: MysteryBearAnimation | null = recipe.species !== "MYSTERY_BEAR" ? null : {
        root: rootMatrix, placement, resolvedY, targets: [], balls: [], spotlights: null, firstVertex: sharedOutput.vertices.length, vertexCount: 0, lastTick: 0,
    };
    const flame: AnimalFlameAnimation | null = flamePart === null ? null : {
        root: rootMatrix, from: recipe.pose.sample.jointPositions[flamePart.joints.from], to: recipe.pose.sample.jointPositions[flamePart.joints.to],
        placementIndex, sourceVertexAxes: flamePart.sourceVertexAxes ?? true, targets: [], firstVertex: 0, vertexCount: 0, lastTick: -1,
    };
    let wool: AnimalWoolAnimation | null = null;
    const livingWool = placement.health > 0 && recipe.parts.some(part => part.name === "body" && part.address === 0x04002D90);
    if (livingWool) {
        const body = assertExists(partRanges.find(range => range.part.name === "body"));
        wool = { rest: readWoolVertices(assertExists(segmentBuffers[4]).createDataView()), matrix: body.matrix, targets: [], firstVertex: 0, vertexCount: 0, lastTick: 0 };
    }

    for (const range of partRanges) {
        for (const sourceDrawCall of parserDrawCalls) {
            const first = Math.max(range.firstIndex, sourceDrawCall.firstIndex);
            const end = Math.min(range.endIndex, sourceDrawCall.firstIndex + sourceDrawCall.indexCount);
            if (end <= first)
                continue;
            assert((first - range.firstIndex) % 3 === 0 && (end - first) % 3 === 0, `${range.part.name}: split inside triangle`);

            const drawCall = new SSSVDrawCall();
            drawCall.layer = SSSVLayer.Animals;
            drawCall.SP_GeometryMode = sourceDrawCall.SP_GeometryMode;
            drawCall.SP_TextureState.copy(sourceDrawCall.SP_TextureState);
            drawCall.DP_OtherModeH = sourceDrawCall.DP_OtherModeH;
            drawCall.DP_OtherModeL = sourceDrawCall.DP_OtherModeL;
            drawCall.DP_Combine = sourceDrawCall.DP_Combine;
            vec4.copy(drawCall.DP_PrimColor, sourceDrawCall.DP_PrimColor);
            vec4.copy(drawCall.DP_EnvColor, sourceDrawCall.DP_EnvColor);
            if (range.tailLink !== undefined) {
                // The tail's primitive/shade combiner ignores any inherited eye texture.
                assert(!RDP.combineParamsUsesT0(drawCall.DP_Combine) && !RDP.combineParamsUsesT1(drawCall.DP_Combine));
                drawCall.textureIndices = [];
            } else {
                drawCall.textureIndices = remapAnimalTextures(sourceDrawCall.textureIndices, parserOutput, sharedOutput, textureRemapper);
            }
            if (range.part.name.endsWith("eye") && recipe.eyes !== undefined) {
                const side = range.part.name.startsWith("left") ? "left" : "right";
                const deactivated = placement.health <= 0;
                if (recipe.eyes === "primitive") {
                    drawCall.animalEyeAnimation = { kind: "primitive", side, deactivated };
                } else {
                    const family = recipe.eyes;
                    const { base, palette, frames } = ANIMAL_EYE_ATLASES[family];
                    const sourceTexture = assertExists(parserOutput.textureCache.textures[sourceDrawCall.textureIndices[0]], "Animal eye texture");
                    assert(sourceTexture.dramAddr === base + recipe.pose.sample.eyeFrame * 128 && sourceTexture.dramPalAddr === palette, "Animal eye animation must match its source atlas/palette");
                    const localFrames = Array.from({ length: frames }, (_, frame) =>
                        parserOutput.textureCache.translateTileTexture(levelSegments, base + frame * 128, palette, sourceTexture.tile, false));
                    const textureIndices = remapAnimalTextures(localFrames, parserOutput, sharedOutput, textureRemapper);
                    drawCall.animalEyeAnimation = { kind: "texture", family, side, deactivated, textureIndices };
                }
            }
            if (!range.diagnostics.geometryModes.includes(drawCall.SP_GeometryMode))
                range.diagnostics.geometryModes.push(drawCall.SP_GeometryMode);
            if (!range.diagnostics.otherModesL.includes(drawCall.DP_OtherModeL))
                range.diagnostics.otherModesL.push(drawCall.DP_OtherModeL);
            for (const textureIndex of drawCall.textureIndices) {
                if (!range.diagnostics.textureIndices.includes(textureIndex))
                    range.diagnostics.textureIndices.push(textureIndex);
            }
            drawCall.fogNear = fogNear; drawCall.fogFar = fogFar; drawCall.fogColor = fogColor; drawCall.light = light;
            drawCall.translucent = (drawCall.DP_OtherModeL & (1 << 14)) !== 0;
            drawCall.firstIndex = sharedOutput.indices.length;
            const vertexMap = new Map<number, number>();
            for (let i = first; i < end; i++) {
                const sourceVertexIndex = parserOutput.indices[i];
                let outputVertexIndex = vertexMap.get(sourceVertexIndex);
                if (outputVertexIndex === undefined) {
                    const sourceVertex = assertExists(parserOutput.vertices[sourceVertexIndex], `${range.part.name}: source vertex ${sourceVertexIndex}`);
                    const baked = makeBakedVertex(sourceVertex, range.matrix, !!(sourceDrawCall.SP_GeometryMode & RSP_Geometry.G_LIGHTING));
                    outputVertexIndex = sharedOutput.vertices.length;
                    sharedOutput.vertices.push(baked);
                    mysteryBear?.targets.push({ vertexIndex: outputVertexIndex, rest: sourceVertex, lit: !!(sourceDrawCall.SP_GeometryMode & RSP_Geometry.G_LIGHTING), part: range.part, draw: drawCall });
                    if (flame !== null && range.part === flamePart)
                        flame.targets.push({ vertexIndex: outputVertexIndex, rest: sourceVertex, lit: !!(sourceDrawCall.SP_GeometryMode & RSP_Geometry.G_LIGHTING) });
                    if (tail !== null && range.tailLink !== undefined)
                        tail.targets.push({ vertexIndex: outputVertexIndex, link: range.tailLink, rest: sourceVertex });
                    const woolIndex = sourceVertexIndex - WOOL_ACTIVE_OFFSET / 16;
                    if (wool !== null && range.part.name === "body" && woolIndex >= 0 && woolIndex < WOOL_VERTEX_COUNT)
                        wool.targets.push({ vertexIndex: outputVertexIndex, woolIndex });
                    vertexMap.set(sourceVertexIndex, outputVertexIndex);
                    vec3.add(drawCall.center, drawCall.center, [baked.x, baked.y, baked.z]);
                    drawCall.centerCount++;
                }
                sharedOutput.indices.push(outputVertexIndex);
            }
            drawCall.indexCount = sharedOutput.indices.length - drawCall.firstIndex;
            range.diagnostics.drawCalls++;
            range.diagnostics.triangles += drawCall.indexCount / 3;
            if (drawCall.centerCount !== 0)
                vec3.scale(drawCall.center, drawCall.center, 1 / drawCall.centerCount);
            drawCalls.push(drawCall);
        }
    }

    assert(drawCalls.length !== 0, "Static animal produced no draw calls");
    assert(drawCalls.some((drawCall) => (drawCall.SP_GeometryMode & RSP_Geometry.G_LIGHTING) !== 0), "Animal model has no lit draws");
    assert(partMatrices.every((part) => part.drawCalls > 0 && part.triangles > 0), "Animal model has an unrendered part");
    if (recipe.species === "RAT" || recipe.species === "KING_RAT")
        drawCalls.push(...buildRatEyeGlows(sharedOutput, placement, resolvedY, recipe.pose.sample.jointPositions[1]));
    if (mysteryBear !== null) {
        mysteryBear.vertexCount = sharedOutput.vertices.length - mysteryBear.firstVertex;
        mysteryBear.balls = buildMysteryBearBalls(sharedOutput, placement, resolvedY);
        drawCalls.push(...mysteryBear.balls);
        mysteryBear.spotlights = buildMysteryBearSpotlights(sharedOutput, map, placement, resolvedY, placementIndex === -1);
        drawCalls.push(...mysteryBear.spotlights.draws);
    }
    const textureIds = Array.from(new Set(drawCalls.flatMap(drawCall => [
        ...drawCall.textureIndices,
        ...(drawCall.animalEyeAnimation?.kind === "texture" ? drawCall.animalEyeAnimation.textureIndices : []),
    ]))).sort((a, b) => a - b);
    if (wool !== null) {
        assert(new Set(wool.targets.map(target => target.woolIndex)).size === WOOL_VERTEX_COUNT, "Wool animation must retain all 52 source vertices");
        wool.firstVertex = Math.min(...wool.targets.map(target => target.vertexIndex));
        wool.vertexCount = Math.max(...wool.targets.map(target => target.vertexIndex)) - wool.firstVertex + 1;
    }
    if (tail !== null) {
        tail.firstVertex = Math.min(...tail.targets.map(target => target.vertexIndex));
        tail.vertexCount = Math.max(...tail.targets.map(target => target.vertexIndex)) - tail.firstVertex + 1;
    }
    if (flame !== null) {
        flame.firstVertex = Math.min(...flame.targets.map(target => target.vertexIndex));
        flame.vertexCount = Math.max(...flame.targets.map(target => target.vertexIndex)) - flame.firstVertex + 1;
    }
    return { recipe, placement, drawCalls, textureIds, placementIndex, isPlayer: placementIndex === -1, resolvedY, partMatrices, wool, tail, flame, mysteryBear };
}

export function buildStaticAnimalModels(
    sharedOutput: RSPSharedOutput,
    segmentBuffers: readonly (ArrayBufferSlice | undefined)[],
    placements: readonly LevelAnimalPlacement[],
    map: readonly LevelMapEntry[],
    dat: LevelDat,
    player: LevelAnimalPlacement | null = null,
): StaticAnimalBuild[] {
    const textureRemapper = makeAnimalTextureRemapper(sharedOutput);
    const builds: StaticAnimalBuild[] = [];
    const indexed = placements.map((placement, placementIndex) => ({ placement, placementIndex }));
    if (player !== null) indexed.push({ placement: player, placementIndex: -1 });
    indexed.forEach(({ placement, placementIndex }) => {
        const recipe = getStaticAnimalRecipe(placement);
        if (recipe === null || dat.segment !== (recipe.biomeSegment ?? 0))
            return;
        const build = buildStaticAnimalModel(sharedOutput, segmentBuffers, placement, placementIndex, map, dat, textureRemapper, recipe);
        if (build !== null)
            builds.push(build);
    });
    return builds;
}
