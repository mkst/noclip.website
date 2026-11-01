import { createInteractionInput } from '../ui/interaction_targets.js';
import type { InteractionTarget } from '../ui/interaction_targets.js';
import { focusInteraction } from '../ui/interaction_controls.js';
import type { FeatureInteraction, InteractionContext } from '../ui/interaction_controls.js';
import { createRainInteractions, createFenceInteractions } from '../ui/button_interactions.js';
import { createElevatorInteractions, createMachineInteractions, createSnowInteractions } from '../ui/object_interactions.js';
import { createAnimalInteractions } from '../ui/animal_interactions.js';
import { appendLevelEventToggle, createObjectInteractions, createEmitterInteractions, createEventInteractions } from '../ui/script_interactions.js';
import { FloorButtonVisuals } from '../objects/floor_buttons.js';
import { LeverVisuals } from '../objects/object_visuals.js';
import type { LagoonMachineVisuals } from '../objects/lagoon_machine_renderer.js';
import type { LiveAnimalSpawnVisuals } from "../animals/live_animal_renderer.js";
import { createMusicPanel } from "../audio/music_panel.js";
import type { MusicPlayer } from "../audio/music.js";
import type { SnowPlatformVisuals } from "../objects/snow_platform_renderer.js";
import type { ObjectCommandRuntime } from "../objects/object_commands.js";
import type { ElevatorVisuals } from "../objects/elevator_renderer.js";
import { ARRIVAL_VERTEX_COUNT } from "../effects/arrival.js";
import type { ArrivalVisuals } from "../effects/arrival.js";
import * as Viewer from "../../viewer.js";
import * as UI from "../../ui.js";
import * as RDP from "../../Common/N64/RDP.js";

import { calcTextureMatrixFromRSPState } from "../../Common/N64/RSP.js";
import { RSP_Geometry, RSPSharedOutput, translateCullMode, Vertex } from "../../BanjoKazooie/f3dex.js";
import { F3DEX_Program } from "../../BanjoKazooie/render.js";
import { DeviceProgram } from "../../Program.js";
import { GfxBufferFrequencyHint, GfxBufferUsage, GfxCullMode, GfxFormat, GfxFrontFaceMode, GfxVertexBufferFrequency } from "../../gfx/platform/GfxPlatform.js";
import type { GfxBindingLayoutDescriptor, GfxBuffer, GfxDevice, GfxInputLayout, GfxInputLayoutBufferDescriptor, GfxIndexBufferDescriptor, GfxMegaStateDescriptor, GfxProgram, GfxSampler, GfxTexture, GfxVertexAttributeDescriptor, GfxVertexBufferDescriptor } from "../../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../../gfx/render/GfxRenderCache.js";
import { GfxRenderHelper } from "../../gfx/render/GfxRenderHelper.js";
import { GfxRenderInstList, GfxRenderInstManager, GfxRendererLayer, makeSortKey, setSortKeyDepth } from "../../gfx/render/GfxRenderInstManager.js";
import { GfxrAttachmentSlot } from "../../gfx/render/GfxRenderGraph.js";
import { createBufferFromData } from "../../gfx/helpers/BufferHelpers.js";
import { fillColor, fillMatrix4x2, fillMatrix4x3, fillMatrix4x4, fillVec3v, fillVec4 } from "../../gfx/helpers/UniformBufferHelpers.js";
import { makeAttachmentClearDescriptor, makeBackbufferDescSimple } from "../../gfx/helpers/RenderGraphHelpers.js";
import { computeViewMatrix } from "../../Camera.js";
import { pickButton } from "../ui/button_input.js";
import type { FenceSwitchRuntime } from "../objects/fence_switch.js";
import { HIDDEN_OBJECT_MARKER_COLOR, UNRESOLVED_OBJECT_MARKER_COLOR } from "../objects/object_markers.js";
import { describeObjectRoleReferences, OBJECT_ROLE_NAMES } from "../objects/object_roles.js";
import type { ObjectMarker } from "../objects/object_markers.js";
import type { RainSimulation } from "../effects/rain.js";
import type { Camera } from "../../Camera.js";
import type { CameraController } from "../../Camera.js";
import { CalcBillboardFlags, calcBillboardMatrix, transformVec3Mat4w0 } from "../../MathHelpers.js";
import { TextureMapping } from "../../TextureHolder.js";
import { assertExists, nArray } from "../../util.js";
import { mat4, vec3 } from "gl-matrix";
import type { Color } from "../../Color.js";
import { COMBINE_TEXTURED, DP_OTHERMODE_H, RENDER_ALPHA, RENDER_TRANSLUCENT, SSSVLayer, WATER_ANIMATED_FRAMES, WATER_FRAME_RATE, WATER_SCROLL_RATE, WATER_TEXTURE_ROWS } from "./terrain.js";
import { GAME_TICK_RATE, getGameTick, getGameTimeSeconds } from "../core/timing.js";
import type { SSSVDrawCall } from "./terrain.js";
import { FENCE_TEXTURE_ID, fenceIndexCount, fenceVertexCount, writeFenceVertices } from "../objects/fences.js";
import type { FenceSpan } from "../objects/fences.js";
import { HangingSimulation, hangingRibbonIndexCount, hangingRibbonVertexCount, writeHangingIndices, writeHangingVertices } from "../objects/hanging.js";
import type { HangingRibbon } from "../objects/hanging.js";
import { drawWorldSpaceText, getDebugOverlayCanvas2D } from "../../DebugJunk.js";
import { White } from "../../Color.js";
import { isAnimalMarkerVisible } from "../animals/animals.js";
import type { AnimalMarker, AnimalMarkerMode } from "../animals/animals.js";
import { textureAnimationFrame } from "../objects/object_texture_animation.js";
import { computeObjectMotionMatrix, computeObjectShadowMotionMatrix } from "../objects/object_motion.js";
import { computeObjectPathMatrix, computeObjectPathShadowMatrix } from "../objects/object_path.js";
import { computeObjectRotationMatrix } from "../objects/object_rotation.js";
import { computeLeverHandleMatrix } from "../objects/lever_handle.js";
import { updateGravitySwitchVisual } from "../objects/gravity_switch.js";
import { teleporterFanOffset, teleporterFrame, teleporterIsActive } from "../objects/teleporters.js";
import type { BoulderEventVisuals } from "../effects/level_event_renderer.js";
import { mirrorZ } from "../core/level.js";
import type { PathOverlay } from "../ui/path_overlay.js";
import type { EmitterCommandRuntime } from "../effects/emitter_commands.js";
import { ParticleSimulation, particleProjectedHalfSize } from "../effects/particles.js";
import type { StaticAnimalBuild } from "../animals/animal_renderer.js";
import { updateAnimalFlame, updateAnimalTail, updateAnimalWool, updateMysteryBear } from "../animals/animal_renderer.js";
import { updateMysteryBearSpotlights } from "../animals/mystery_bear_spotlights.js";
import { sampleAnimalEyeFrame, sampleAnimalEyeIndices, sampleAnimalEyeRed } from "../animals/animal_eyes.js";

const BUTTONS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path d="M8 8l3 13 3-5 5-3L8 8z" fill="white" stroke="white" stroke-linejoin="round"/>
    <path d="M8 2v2M2 8h2M3.5 3.5L5 5M13 3l-1 2M3 13l2-1" stroke="white" stroke-width="2" stroke-linecap="round"/>
</svg>`;

function makeVertexBufferData(vertices: Vertex[], matrixIndex = 1): Float32Array {
    const buffer = new Float32Array(10 * vertices.length);
    let j = 0;
    for (let i = 0; i < vertices.length; i++) {
        buffer[j++] = vertices[i].x;
        buffer[j++] = vertices[i].y;
        buffer[j++] = vertices[i].z;
        buffer[j++] = matrixIndex;
        buffer[j++] = vertices[i].tx;
        buffer[j++] = vertices[i].ty;
        buffer[j++] = vertices[i].c0;
        buffer[j++] = vertices[i].c1;
        buffer[j++] = vertices[i].c2;
        buffer[j++] = vertices[i].a;
    }
    return buffer;
}

class RenderData {
    public vertexBuffer: GfxBuffer;
    public inputLayout: GfxInputLayout;
    public vertexBufferDescriptors: GfxVertexBufferDescriptor[];
    public indexBufferDescriptor: GfxIndexBufferDescriptor;
    public vertexBufferData: Float32Array;
    public indexBuffer: GfxBuffer;

    constructor(device: GfxDevice, cache: GfxRenderCache, sharedOutput: RSPSharedOutput, matrixIndex = 1, dynamic = false) {
        this.vertexBufferData = makeVertexBufferData(sharedOutput.vertices, matrixIndex);
        this.vertexBuffer = createBufferFromData(device, GfxBufferUsage.Vertex, dynamic ? GfxBufferFrequencyHint.Dynamic : GfxBufferFrequencyHint.Static, this.vertexBufferData.buffer);
        this.indexBuffer = createBufferFromData(device, GfxBufferUsage.Index, GfxBufferFrequencyHint.Static, new Uint32Array(sharedOutput.indices).buffer);

        const vertexAttributeDescriptors: GfxVertexAttributeDescriptor[] = [
            { location: F3DEX_Program.a_Position, bufferIndex: 0, format: GfxFormat.F32_RGBA, bufferByteOffset: 0 * 0x04 },
            { location: F3DEX_Program.a_TexCoord, bufferIndex: 0, format: GfxFormat.F32_RG, bufferByteOffset: 4 * 0x04 },
            { location: F3DEX_Program.a_Color, bufferIndex: 0, format: GfxFormat.F32_RGBA, bufferByteOffset: 6 * 0x04 },
        ];
        const vertexBufferDescriptors: GfxInputLayoutBufferDescriptor[] = [
            { byteStride: 10 * 0x04, frequency: GfxVertexBufferFrequency.PerVertex },
        ];

        this.inputLayout = cache.createInputLayout({
            indexBufferFormat: GfxFormat.U32_R,
            vertexBufferDescriptors,
            vertexAttributeDescriptors,
        });
        this.vertexBufferDescriptors = [{ buffer: this.vertexBuffer }];
        this.indexBufferDescriptor = { buffer: this.indexBuffer };
    }

    public destroy(device: GfxDevice): void {
        device.destroyBuffer(this.indexBuffer);
        device.destroyBuffer(this.vertexBuffer);
    }
}

class GfxTextureCache {
    private textures = new Map<RDP.Texture, { gfxTexture: GfxTexture, gfxSampler: GfxSampler }>();

    public get(device: GfxDevice, cache: GfxRenderCache, texture: RDP.Texture): { gfxTexture: GfxTexture, gfxSampler: GfxSampler } {
        let entry = this.textures.get(texture);
        if (entry === undefined) {
            entry = {
                gfxTexture: RDP.translateToGfxTexture(device, texture),
                gfxSampler: RDP.translateSampler(device, cache, texture),
            };
            this.textures.set(texture, entry);
        }
        return entry;
    }

    public destroy(device: GfxDevice): void {
        for (const entry of this.textures.values())
            device.destroyTexture(entry.gfxTexture);
    }
}

const viewMatrixScratch = mat4.create();
const lightDirectionScratch = vec3.create();
const lightDiffuseScratch = vec3.create();
const texMatrixScratch = mat4.create();
const textureGenLookAtScratch = mat4.create();
const centerViewScratch = vec3.create();
const drawCenterScratch = vec3.create();
const modelViewScratch = mat4.create();
const fenceCenterScratch = vec3.create();

const RENDER_HANGING = RENDER_ALPHA;

const COMBINE_HANGING: RDP.CombineParams = {
    c0: { a: RDP.CCMUX.PRIMITIVE, b: RDP.CCMUX.ENVIRONMENT, c: RDP.CCMUX.TEXEL0, d: RDP.CCMUX.ENVIRONMENT },
    a0: { a: RDP.ACMUX.ZERO, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.ZERO, d: RDP.ACMUX.TEXEL0 },
    c1: { a: RDP.CCMUX.COMBINED, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.SHADE, d: RDP.CCMUX.ADD_ZERO },
    a1: { a: RDP.ACMUX.ZERO, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.ZERO, d: RDP.ACMUX.TEXEL0 },
};

class HangingRenderer {
    private program: DeviceProgram;
    private gfxProgram: GfxProgram | null = null;
    private inputLayout: GfxInputLayout;
    private vertexBuffer: GfxBuffer;
    private indexBuffer: GfxBuffer;
    private vertexData: Float32Array;
    private vertexOffsets: number[] = [];
    private firstIndices: number[] = [];
    private indexCounts: number[] = [];
    private textureMappings: TextureMapping[] = [];
    private texture: RDP.Texture;
    private megaStateFlags: Partial<GfxMegaStateDescriptor>;
    private simulation: HangingSimulation;
    private lastForwardX = Number.NaN;
    private lastForwardZ = Number.NaN;
    private lastSimTick = -1;
    private lastVertexTick = -1;
    private enabled = true;
    private fogEnabled = false;

    constructor(device: GfxDevice, cache: GfxRenderCache, sharedOutput: RSPSharedOutput, private ribbons: HangingRibbon[], textureCache: GfxTextureCache, private fogNear: number, private fogFar: number, private fogColor: Color) {
        let totalVertices = 0;
        let totalIndices = 0;
        for (const ribbon of ribbons) {
            this.vertexOffsets.push(totalVertices);
            this.firstIndices.push(totalIndices);
            this.indexCounts.push(hangingRibbonIndexCount(ribbon));
            totalVertices += hangingRibbonVertexCount(ribbon);
            totalIndices += hangingRibbonIndexCount(ribbon);
        }

        this.vertexData = new Float32Array(totalVertices * 10);
        const indices = new Uint32Array(totalIndices);
        let indexOffset = 0;
        for (let i = 0; i < ribbons.length; i++)
            indexOffset = writeHangingIndices(ribbons[i], this.vertexOffsets[i], indices, indexOffset);

        this.vertexBuffer = device.createBuffer(this.vertexData.byteLength, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Dynamic);
        this.indexBuffer = createBufferFromData(device, GfxBufferUsage.Index, GfxBufferFrequencyHint.Static, indices.buffer);

        const vertexAttributeDescriptors: GfxVertexAttributeDescriptor[] = [
            { location: F3DEX_Program.a_Position, bufferIndex: 0, format: GfxFormat.F32_RGBA, bufferByteOffset: 0 * 0x04 },
            { location: F3DEX_Program.a_TexCoord, bufferIndex: 0, format: GfxFormat.F32_RG, bufferByteOffset: 4 * 0x04 },
            { location: F3DEX_Program.a_Color, bufferIndex: 0, format: GfxFormat.F32_RGBA, bufferByteOffset: 6 * 0x04 },
        ];
        this.inputLayout = cache.createInputLayout({
            indexBufferFormat: GfxFormat.U32_R,
            vertexBufferDescriptors: [{ byteStride: 10 * 0x04, frequency: GfxVertexBufferFrequency.PerVertex }],
            vertexAttributeDescriptors,
        });

        this.texture = assertExists(sharedOutput.textureCache.textures[ribbons[0].textureId], "Missing hanging texture");
        const mappingByTextureId = new Map<number, TextureMapping>();
        for (const ribbon of ribbons) {
            let mapping = mappingByTextureId.get(ribbon.textureId);
            if (mapping === undefined) {
                const texture = assertExists(sharedOutput.textureCache.textures[ribbon.textureId], "Missing hanging texture");
                const gfxTexture = textureCache.get(device, cache, texture);
                mapping = new TextureMapping();
                mapping.gfxTexture = gfxTexture.gfxTexture;
                mapping.gfxSampler = gfxTexture.gfxSampler;
                mappingByTextureId.set(ribbon.textureId, mapping);
            }
            this.textureMappings.push(mapping);
        }

        this.megaStateFlags = RDP.translateRenderMode(RENDER_HANGING);
        this.megaStateFlags.frontFace = GfxFrontFaceMode.CCW;
        this.megaStateFlags.cullMode = GfxCullMode.None;
        this.simulation = new HangingSimulation(ribbons);
        this.program = this.makeProgram();
    }

    private makeProgram(): DeviceProgram {
        const program = new F3DEX_Program(DP_OTHERMODE_H, RENDER_HANGING, COMBINE_HANGING, 0.5, [], 0);
        program.defines.set("BONE_MATRIX_COUNT", "1");
        program.defines.set("USE_TEXTURE", "1");
        program.defines.set("USE_VERTEX_COLOR", "1");
        if (this.fogEnabled)
            program.defines.set("USE_FOG", "1");
        return program;
    }

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    public setFogEnabled(enabled: boolean): void {
        if (this.fogEnabled === enabled)
            return;
        this.fogEnabled = enabled;
        this.program = this.makeProgram();
        this.gfxProgram = null;
    }

    private update(device: GfxDevice, forwardX: number, forwardZ: number, tick: number): void {
        if (forwardX === this.lastForwardX && forwardZ === this.lastForwardZ && tick === this.lastVertexTick)
            return;
        this.lastForwardX = forwardX;
        this.lastForwardZ = forwardZ;
        this.lastVertexTick = tick;
        for (let i = 0; i < this.ribbons.length; i++)
            writeHangingVertices(this.ribbons[i], this.vertexOffsets[i], forwardX, forwardZ, this.vertexData);
        device.uploadBufferData(this.vertexBuffer, 0, new Uint8Array(this.vertexData.buffer));
    }

    private advanceSimulation(tick: number): void {
        if (this.lastSimTick === -1) {
            this.lastSimTick = tick;
        } else if (tick < this.lastSimTick) {
            this.simulation.reset();
            this.lastSimTick = tick;
        } else if (tick > this.lastSimTick) {
            this.simulation.advance(tick - this.lastSimTick);
            this.lastSimTick = tick;
        }
    }

    public prepareToRender(device: GfxDevice, renderHelper: GfxRenderHelper, viewerInput: Viewer.ViewerRenderInput): void {
        const tick = getGameTick(viewerInput.time);
        this.advanceSimulation(tick);

        if (!this.enabled || this.ribbons.length === 0)
            return;

        const worldMatrix = viewerInput.camera.worldMatrix;
        let forwardX = -worldMatrix[8];
        let forwardZ = -worldMatrix[10];
        const forwardLength = Math.hypot(forwardX, forwardZ);
        if (forwardLength > 1e-6) {
            forwardX /= forwardLength;
            forwardZ /= forwardLength;
        } else {
            forwardX = 0.7;
            forwardZ = 0.7;
        }
        this.update(device, forwardX, forwardZ, tick);

        if (this.gfxProgram === null)
            this.gfxProgram = renderHelper.renderCache.createProgram(this.program);

        const renderInstManager = renderHelper.renderInstManager;
        const template = renderHelper.pushTemplateRenderInst();
        template.setBindingLayouts(bindingLayouts);
        template.setGfxProgram(this.gfxProgram);
        template.setVertexInput(this.inputLayout, [{ buffer: this.vertexBuffer }], { buffer: this.indexBuffer });
        template.setMegaStateFlags(this.megaStateFlags);

        let sceneOffs = template.allocateUniformBuffer(F3DEX_Program.ub_SceneParams, 16);
        const scene = template.mapUniformBufferF32(F3DEX_Program.ub_SceneParams);
        sceneOffs += fillMatrix4x4(scene, sceneOffs, viewerInput.camera.projectionMatrix);

        computeViewMatrix(viewMatrixScratch, viewerInput.camera);
        calcTextureMatrixFromRSPState(texMatrixScratch, this.texture.width, this.texture.height, this.texture.width, this.texture.height, this.texture.tile.shifts, this.texture.tile.shiftt);

        for (let i = 0; i < this.ribbons.length; i++) {
            const ribbon = this.ribbons[i];
            const renderInst = renderInstManager.newRenderInst();
            renderInst.setGfxProgram(this.gfxProgram);
            renderInst.setSamplerBindingsFromTextureMappings([this.textureMappings[i], this.textureMappings[i]]);
            renderInst.setMegaStateFlags(this.megaStateFlags);
            renderInst.setDrawCount(this.indexCounts[i], this.firstIndices[i]);
            renderInst.sortKey = makeSortKey(GfxRendererLayer.OPAQUE, this.gfxProgram.ResourceUniqueId);

            const drawSize = 12 + 8 * 2 + (this.fogEnabled ? 8 : 0);
            let drawOffs = renderInst.allocateUniformBuffer(F3DEX_Program.ub_DrawParams, drawSize);
            const draw = renderInst.mapUniformBufferF32(F3DEX_Program.ub_DrawParams);
            drawOffs += fillMatrix4x3(draw, drawOffs, viewMatrixScratch);
            drawOffs += fillMatrix4x2(draw, drawOffs, texMatrixScratch);
            drawOffs += fillMatrix4x2(draw, drawOffs, texMatrixScratch);
            if (this.fogEnabled) {
                drawOffs += fillVec4(draw, drawOffs, this.fogNear, this.fogFar, 0, 0);
                drawOffs += fillColor(draw, drawOffs, this.fogColor);
            }

            let combOffs = renderInst.allocateUniformBuffer(F3DEX_Program.ub_CombineParams, 12);
            const comb = renderInst.mapUniformBufferF32(F3DEX_Program.ub_CombineParams);
            combOffs += fillVec4(comb, combOffs, ribbon.material.primColor[0] / 0xFF, ribbon.material.primColor[1] / 0xFF, ribbon.material.primColor[2] / 0xFF, ribbon.material.primColor[3] / 0xFF);
            combOffs += fillVec4(comb, combOffs, ribbon.material.envColor[0] / 0xFF, ribbon.material.envColor[1] / 0xFF, ribbon.material.envColor[2] / 0xFF, ribbon.material.envColor[3] / 0xFF);
            combOffs += fillVec4(comb, combOffs, 0, 0, 0, 0);
            renderInstManager.submitRenderInst(renderInst);
        }

        renderInstManager.popTemplate();
    }

    public destroy(device: GfxDevice): void {
        device.destroyBuffer(this.vertexBuffer);
        device.destroyBuffer(this.indexBuffer);
    }
}

class ParticleRenderer {
    public enabled = true;
    private renderData: RenderData;
    private program: F3DEX_Program;
    private gfxProgram: GfxProgram | null = null;
    private mappings = new Map<number, TextureMapping>();
    private megaState = RDP.translateRenderMode(0x0C184B54);

    constructor(device: GfxDevice, cache: GfxRenderCache, sharedOutput: RSPSharedOutput, textureCache: GfxTextureCache, public simulation: ParticleSimulation) {
        const quad = new RSPSharedOutput();
        for (const [x, y, s, t] of [[-1, -1, 0, 1], [1, -1, 1, 1], [1, 1, 1, 0], [-1, 1, 0, 0]]) {
            const v = new Vertex();
            v.x = x; v.y = y; v.z = 0; v.tx = s; v.ty = t;
            v.c0 = v.c1 = v.c2 = v.a = 1;
            quad.vertices.push(v);
        }
        quad.indices.push(0, 1, 2, 0, 2, 3);
        this.renderData = new RenderData(device, cache, quad, 0);
        this.program = new F3DEX_Program(DP_OTHERMODE_H, 0x0C184B54, RDP.decodeCombineParams(0x272C60, 0x15FC9378), 0, [], 0);
        this.program.defines.set("BONE_MATRIX_COUNT", "1");
        this.program.defines.set("USE_TEXTURE", "1");
        this.program.defines.set("EXTRA_COMBINE", "1");
        this.megaState.cullMode = GfxCullMode.None;
        for (const id of simulation.textureIds) {
            const texture = assertExists(sharedOutput.textureCache.textures[id]);
            const entry = textureCache.get(device, cache, texture);
            const mapping = new TextureMapping();
            mapping.gfxTexture = entry.gfxTexture; mapping.gfxSampler = entry.gfxSampler;
            this.mappings.set(id, mapping);
        }
    }

    public prepareToRender(device: GfxDevice, helper: GfxRenderHelper, input: Viewer.ViewerRenderInput): void {
        this.simulation.advanceTo(getGameTick(input.time));
        if (!this.enabled)
            return;
        if (this.gfxProgram === null)
            this.gfxProgram = helper.renderCache.createProgram(this.program);
        const manager = helper.renderInstManager;
        const template = helper.pushTemplateRenderInst();
        template.setBindingLayouts(bindingLayouts);
        template.setVertexInput(this.renderData.inputLayout, this.renderData.vertexBufferDescriptors, this.renderData.indexBufferDescriptor);
        const sceneOffs = template.allocateUniformBuffer(F3DEX_Program.ub_SceneParams, 16);
        fillMatrix4x4(template.mapUniformBufferF32(F3DEX_Program.ub_SceneParams), sceneOffs, input.camera.projectionMatrix);
        computeViewMatrix(viewMatrixScratch, input.camera);
        const fovY = 2 * Math.atan(1 / input.camera.projectionMatrix[5]) * 180 / Math.PI;
        const identity = mat4.identity(texMatrixScratch);
        for (const particle of this.simulation.particles) {
            vec3.set(centerViewScratch, particle.x / 65536, particle.y / 65536, mirrorZ(particle.z / 65536));
            vec3.transformMat4(centerViewScratch, centerViewScratch, viewMatrixScratch);
            const depth = -centerViewScratch[2];
            const textureSize = particle.textureSize ?? 16;
            const half = particleProjectedHalfSize(particle.size, depth, fovY, textureSize);
            if (half <= 0)
                continue;
            const worldHalf = half * depth / input.camera.projectionMatrix[5];
            mat4.fromTranslation(modelViewScratch, centerViewScratch);
            const heightScale = particle.surfaceAligned ? Math.max(0, input.camera.worldMatrix[9])
                : particle.vertical ? Math.sqrt(Math.max(0, 1 - input.camera.worldMatrix[9] ** 2)) + 4 / 256 : 1;
            if (heightScale === 0) continue;
            mat4.scale(modelViewScratch, modelViewScratch, [worldHalf, worldHalf * heightScale, 1]);
            const inst = manager.newRenderInst();
            inst.setGfxProgram(this.gfxProgram);
            inst.setMegaStateFlags(this.megaState);
            inst.setDrawCount(6);
            inst.setSamplerBindingsFromTextureMappings([assertExists(this.mappings.get(particle.texture0)), assertExists(this.mappings.get(particle.texture1))]);
            inst.sortKey = setSortKeyDepth(makeSortKey(GfxRendererLayer.TRANSLUCENT), depth);
            let offs = inst.allocateUniformBuffer(F3DEX_Program.ub_DrawParams, 28);
            const draw = inst.mapUniformBufferF32(F3DEX_Program.ub_DrawParams);
            offs += fillMatrix4x3(draw, offs, modelViewScratch);
            identity[0] = identity[5] = (textureSize - 1) / textureSize;
            offs += fillMatrix4x2(draw, offs, identity);
            fillMatrix4x2(draw, offs, identity);
            offs = inst.allocateUniformBuffer(F3DEX_Program.ub_CombineParams, 12);
            const combine = inst.mapUniformBufferF32(F3DEX_Program.ub_CombineParams);
            for (const [color, alpha] of [[particle.primaryColor, particle.primaryAlpha], [particle.environmentColor, particle.environmentAlpha]])
                offs += fillVec4(combine, offs, ((color >>> 11) & 31) * 8 / 255, ((color >>> 6) & 31) * 8 / 255, ((color >>> 1) & 31) * 8 / 255, alpha / 255);
            fillVec4(combine, offs, particle.lodFraction / 256, 0, 0, 0);
            manager.submitRenderInst(inst);
        }
        manager.popTemplate();
    }

    public destroy(device: GfxDevice): void {
        this.renderData.destroy(device);
    }
}

class FenceRenderer {
    private program: DeviceProgram;
    private gfxProgram: GfxProgram | null = null;
    private inputLayout: GfxInputLayout;
    private vertexBuffer: GfxBuffer;
    private indexBuffer: GfxBuffer;
    private vertexData: Float32Array;
    private textureMappings = nArray(2, () => new TextureMapping());
    private textureEntry: RDP.Texture;
    private firstIndices: number[] = [];
    private vertexOffsets: number[] = [];
    private indexCounts: number[] = [];
    private lastTick = -1;
    private megaStateFlags: Partial<GfxMegaStateDescriptor>;

    constructor(device: GfxDevice, cache: GfxRenderCache, sharedOutput: RSPSharedOutput, private fences: FenceSpan[], textureCache: GfxTextureCache) {
        const texture = sharedOutput.textureCache.textures[FENCE_TEXTURE_ID];
        if (texture === undefined)
            throw new Error("Missing fence texture");
        this.textureEntry = texture;

        let totalVertices = 0;
        let totalIndices = 0;
        for (const fence of fences) {
            this.vertexOffsets.push(totalVertices);
            this.firstIndices.push(totalIndices);
            this.indexCounts.push(fenceIndexCount(fence));
            totalVertices += fenceVertexCount(fence);
            totalIndices += fenceIndexCount(fence);
        }

        this.vertexData = new Float32Array(totalVertices * 10);
        const indices = new Uint32Array(totalIndices);
        let indexOffset = 0;
        for (let f = 0; f < fences.length; f++) {
            const fence = fences[f];
            const base = this.vertexOffsets[f];
            for (let i = 0; i < fence.segments; i++) {
                const a = base + i * 2;
                indices[indexOffset++] = a + 0;
                indices[indexOffset++] = a + 3;
                indices[indexOffset++] = a + 1;
                indices[indexOffset++] = a + 0;
                indices[indexOffset++] = a + 2;
                indices[indexOffset++] = a + 3;
            }
        }

        this.vertexBuffer = device.createBuffer(this.vertexData.byteLength, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Dynamic);
        this.indexBuffer = createBufferFromData(device, GfxBufferUsage.Index, GfxBufferFrequencyHint.Static, indices.buffer);

        const vertexAttributeDescriptors: GfxVertexAttributeDescriptor[] = [
            { location: F3DEX_Program.a_Position, bufferIndex: 0, format: GfxFormat.F32_RGBA, bufferByteOffset: 0 * 0x04 },
            { location: F3DEX_Program.a_TexCoord, bufferIndex: 0, format: GfxFormat.F32_RG, bufferByteOffset: 4 * 0x04 },
            { location: F3DEX_Program.a_Color, bufferIndex: 0, format: GfxFormat.F32_RGBA, bufferByteOffset: 6 * 0x04 },
        ];
        this.inputLayout = cache.createInputLayout({
            indexBufferFormat: GfxFormat.U32_R,
            vertexBufferDescriptors: [{ byteStride: 10 * 0x04, frequency: GfxVertexBufferFrequency.PerVertex }],
            vertexAttributeDescriptors,
        });

        this.program = new F3DEX_Program(DP_OTHERMODE_H, RENDER_TRANSLUCENT, COMBINE_TEXTURED, 0.5, [texture.tile]);
        this.program.defines.set("BONE_MATRIX_COUNT", "1");
        this.program.defines.set("USE_TEXTURE", "1");
        this.program.defines.set("USE_VERTEX_COLOR", "1");

        const gfxTexture = textureCache.get(device, cache, texture);
        for (const mapping of this.textureMappings) {
            mapping.gfxTexture = gfxTexture.gfxTexture;
            mapping.gfxSampler = gfxTexture.gfxSampler;
        }

        this.megaStateFlags = RDP.translateRenderMode(RENDER_TRANSLUCENT);
        this.megaStateFlags.frontFace = GfxFrontFaceMode.CCW;
        this.megaStateFlags.cullMode = GfxCullMode.None;
    }

    private update(device: GfxDevice, tick: number): void {
        if (tick === this.lastTick)
            return;
        this.lastTick = tick;
        for (let i = 0; i < this.fences.length; i++)
            writeFenceVertices(this.fences[i], tick, this.vertexData, this.vertexOffsets[i] * 10);
        device.uploadBufferData(this.vertexBuffer, 0, new Uint8Array(this.vertexData.buffer));
    }

    public prepareToRender(device: GfxDevice, renderHelper: GfxRenderHelper, viewerInput: Viewer.ViewerRenderInput): void {
        const tick = getGameTick(viewerInput.time);
        this.update(device, tick);
        const renderInstManager = renderHelper.renderInstManager;
        if (this.gfxProgram === null)
            this.gfxProgram = renderHelper.renderCache.createProgram(this.program);

        const template = renderHelper.pushTemplateRenderInst();
        template.setBindingLayouts([{ numUniformBuffers: 3, numSamplers: 2 }]);
        template.setGfxProgram(this.gfxProgram);
        template.setVertexInput(this.inputLayout, [{ buffer: this.vertexBuffer }], { buffer: this.indexBuffer });
        template.setMegaStateFlags(this.megaStateFlags);

        let offs = template.allocateUniformBuffer(F3DEX_Program.ub_SceneParams, 16);
        const mapped = template.mapUniformBufferF32(F3DEX_Program.ub_SceneParams);
        offs += fillMatrix4x4(mapped, offs, viewerInput.camera.projectionMatrix);

        computeViewMatrix(viewMatrixScratch, viewerInput.camera);
        calcTextureMatrixFromRSPState(texMatrixScratch, this.textureEntry.width, this.textureEntry.height, this.textureEntry.width, this.textureEntry.height, this.textureEntry.tile.shifts, this.textureEntry.tile.shiftt);
        texMatrixScratch[12] += (tick % 4) * 0.25;

        for (let i = 0; i < this.fences.length; i++) {
            if (!this.fences[i].enabled)
                continue;
            const renderInst = renderInstManager.newRenderInst();
            renderInst.setGfxProgram(this.gfxProgram);
            renderInst.setSamplerBindingsFromTextureMappings(this.textureMappings);
            renderInst.setMegaStateFlags(this.megaStateFlags);
            renderInst.setDrawCount(this.indexCounts[i], this.firstIndices[i]);
            const fence = this.fences[i];
            vec3.set(fenceCenterScratch,
                (fence.startX + fence.endX) / 2,
                (fence.startY + fence.endY) / 2,
                mirrorZ((fence.startZ + fence.endZ) / 2));
            vec3.transformMat4(fenceCenterScratch, fenceCenterScratch, viewMatrixScratch);
            renderInst.sortKey = setSortKeyDepth(makeSortKey(GfxRendererLayer.TRANSLUCENT), -fenceCenterScratch[2]);

            let drawOffs = renderInst.allocateUniformBuffer(F3DEX_Program.ub_DrawParams, 12 + 8 * 2);
            const draw = renderInst.mapUniformBufferF32(F3DEX_Program.ub_DrawParams);
            drawOffs += fillMatrix4x3(draw, drawOffs, viewMatrixScratch);
            drawOffs += fillMatrix4x2(draw, drawOffs, texMatrixScratch);

            let combOffs = renderInst.allocateUniformBuffer(F3DEX_Program.ub_CombineParams, 12);
            const comb = renderInst.mapUniformBufferF32(F3DEX_Program.ub_CombineParams);
            combOffs += fillVec4(comb, combOffs, 1, 1, 1, 1);
            combOffs += fillVec4(comb, combOffs, 0, 0, 0.31, 0);
            combOffs += fillVec4(comb, combOffs, 0, 0, 0, 0);
            renderInstManager.submitRenderInst(renderInst);
        }

        renderInstManager.popTemplate();
    }

    public destroy(device: GfxDevice): void {
        device.destroyBuffer(this.vertexBuffer);
        device.destroyBuffer(this.indexBuffer);
    }
}

class SSSVDrawCallInstance {
    private textureEntry: RDP.Texture[] = [];
    private vertexColorsEnabled = true;
    private texturesEnabled = true;
    private fogEnabled = false;
    private wireframeEnabled = false;
    private pathStartTick = -1;
    private megaStateFlags: Partial<GfxMegaStateDescriptor>;
    private program!: DeviceProgram;
    private gfxProgram: GfxProgram | null = null;
    private textureMappings = nArray(2, () => new TextureMapping());
    private animationTextureMappings: TextureMapping[] = [];
    private animationTextureMappings1: TextureMapping[] = [];
    private usesLighting: boolean;
    private usesFog: boolean;

    constructor(device: GfxDevice, cache: GfxRenderCache, private sharedOutput: RSPSharedOutput, private drawCall: SSSVDrawCall, private textureCache: GfxTextureCache) {
        for (let i = 0; i < this.textureMappings.length; i++) {
            if (i >= drawCall.textureIndices.length)
                continue;
            const texture = sharedOutput.textureCache.textures[drawCall.textureIndices[i]];
            if (texture === undefined)
                continue;
            this.textureEntry[i] = texture;
            const gfxTexture = textureCache.get(device, cache, texture);
            this.textureMappings[i].gfxTexture = gfxTexture.gfxTexture;
            this.textureMappings[i].gfxSampler = gfxTexture.gfxSampler;
        }

        const animationTextures = drawCall.animalEyeAnimation?.kind === "texture" ? drawCall.animalEyeAnimation.textureIndices : drawCall.animationTextureIndices;
        if (animationTextures !== null) {
            for (const textureId of animationTextures) {
                const mapping = new TextureMapping();
                const texture = sharedOutput.textureCache.textures[textureId];
                if (texture !== undefined) {
                    const gfxTexture = textureCache.get(device, cache, texture);
                    mapping.gfxTexture = gfxTexture.gfxTexture;
                    mapping.gfxSampler = gfxTexture.gfxSampler;
                }
                this.animationTextureMappings.push(mapping);
            }
        }

        for (const textureId of drawCall.animationTextureIndices1 ?? []) {
            const texture = assertExists(sharedOutput.textureCache.textures[textureId]);
            const gfxTexture = textureCache.get(device, cache, texture), mapping = new TextureMapping();
            mapping.gfxTexture = gfxTexture.gfxTexture; mapping.gfxSampler = gfxTexture.gfxSampler;
            this.animationTextureMappings1.push(mapping);
        }

        this.usesLighting = (drawCall.SP_GeometryMode & RSP_Geometry.G_LIGHTING) !== 0;
        this.usesFog = (drawCall.SP_GeometryMode & RSP_Geometry.G_FOG) !== 0;
        this.megaStateFlags = RDP.translateRenderMode(drawCall.DP_OtherModeL);
        this.megaStateFlags.frontFace = GfxFrontFaceMode.CCW;
        this.setBackfaceCullingEnabled(true);
        this.createProgram();
    }

    private createProgram(): void {
        const program = new F3DEX_Program(this.drawCall.DP_OtherModeH, this.drawCall.DP_OtherModeL, this.drawCall.DP_Combine, 0.5, [], this.usesLighting ? 1 : 0);
        program.defines.set("BONE_MATRIX_COUNT", "1");

        if (this.texturesEnabled && this.drawCall.textureIndices.length !== 0)
            program.defines.set("USE_TEXTURE", "1");
        if (this.vertexColorsEnabled && (this.drawCall.SP_GeometryMode & RSP_Geometry.G_SHADE) !== 0)
            program.defines.set("USE_VERTEX_COLOR", "1");
        if (this.usesLighting) {
            program.defines.set("LIGHTING", "1");
            program.defines.set("PARAMETERIZED_LIGHTING", "1");
        }
        if ((this.drawCall.SP_GeometryMode & RSP_Geometry.G_TEXTURE_GEN) !== 0)
            program.defines.set("TEXTURE_GEN", "1");
        if ((this.drawCall.SP_GeometryMode & RSP_Geometry.G_TEXTURE_GEN_LINEAR) !== 0)
            program.defines.set("TEXTURE_GEN_LINEAR", "1");
        if (this.fogEnabled && this.usesFog)
            program.defines.set("USE_FOG", "1");

        this.program = program;
        this.gfxProgram = null;
    }

    private computeTextureMatrix(m: mat4, index: number): void {
        const texture = this.textureEntry[index];
        if (texture !== undefined) {
            calcTextureMatrixFromRSPState(m, this.drawCall.SP_TextureState.s, this.drawCall.SP_TextureState.t,
                texture.width, texture.height, texture.tile.shifts, texture.tile.shiftt);
            m[0] *= this.drawCall.textureScaleS;
            m[5] *= this.drawCall.textureScaleT;
            m[12] = (m[12] * this.drawCall.textureScaleS) + this.drawCall.textureOffsetS;
            m[13] = (m[13] * this.drawCall.textureScaleT) + (index === 1 ? this.drawCall.textureOffsetT1 ?? this.drawCall.textureOffsetT : this.drawCall.textureOffsetT);
        } else {
            mat4.identity(m);
        }
    }

    public prepareToRender(device: GfxDevice, renderInstManager: GfxRenderInstManager, viewerInput: Viewer.ViewerRenderInput): void {
        updateGravitySwitchVisual(this.drawCall, getGameTick(viewerInput.time));
        const gameTimeSeconds = getGameTimeSeconds(viewerInput.time);
        if (this.drawCall.shadowFadeExponent !== null) {
            const cameraMatrix = viewerInput.camera.worldMatrix;
            const dx = this.drawCall.center[0] - cameraMatrix[12];
            const dz = this.drawCall.center[2] - cameraMatrix[14];
            const distanceSquared = (dx * dx) + (dz * dz);
            const exponent = this.drawCall.shadowFadeExponent;
            const value = exponent >= 0 ? (distanceSquared >> exponent) : (distanceSquared << -exponent);
            if (value >= 0x51000)
                return;
            let alpha = 0x9B / 0xFF;
            if (value > 0x31000)
                alpha = (alpha * (0x51000 - value)) / 0x20000;
            this.drawCall.DP_PrimColor[3] = alpha;
        }
        if (this.drawCall.starDrift && this.drawCall.modelMatrix !== null) {
            const y = this.drawCall.starBaseY + this.drawCall.starDriftStartOffset - (gameTimeSeconds * this.drawCall.starDriftSpeed);
            this.drawCall.modelMatrix[13] = (((y + 32768) % 65536) + 65536) % 65536 - 32768;
        }
        if (this.drawCall.meteor !== null && this.drawCall.modelMatrix !== null) {
            const meteor = this.drawCall.meteor;
            const t = (gameTimeSeconds + meteor.phase) % meteor.cycle;
            if (t >= meteor.duration) {
                this.drawCall.visible = false;
                return;
            }
            const x = meteor.startX + meteor.velocityX * t;
            const y = meteor.startY + meteor.velocityY * t;
            const z = meteor.startZ + meteor.velocityZ * t;
            this.drawCall.modelMatrix[12] = x;
            this.drawCall.modelMatrix[13] = y;
            this.drawCall.modelMatrix[14] = z;
            this.drawCall.center[0] = x;
            this.drawCall.center[1] = y;
            this.drawCall.center[2] = z;
            this.drawCall.visible = true;
        }
        if (!this.drawCall.visible)
            return;
        const teleporter = this.drawCall.teleporter;
        if (teleporter !== null) {
            if (teleporter.part === "fan") {
                if (!teleporterIsActive(teleporter)) return;
                this.drawCall.textureOffsetT = teleporterFanOffset(getGameTick(viewerInput.time));
            } else {
                const active = teleporterIsActive(teleporter), unknown = (teleporter.arrivalState ?? teleporter.state) === null && !teleporter.previewActive;
                this.drawCall.DP_PrimColor[0] = active || unknown ? 1 : 0;
                this.drawCall.DP_PrimColor[1] = unknown ? 1 : 0;
                this.drawCall.DP_PrimColor[2] = active ? 0 : 1;
            }
        }
        const eyeAnimation = this.drawCall.animalEyeAnimation;
        if (this.drawCall.animalEyeGlow && sampleAnimalEyeIndices(getGameTick(viewerInput.time))[0] === 5)
            return;
        if (eyeAnimation?.kind === "primitive")
            this.drawCall.DP_PrimColor[0] = sampleAnimalEyeRed(getGameTick(viewerInput.time), eyeAnimation.deactivated) / 255;
        if (this.gfxProgram === null)
            this.gfxProgram = renderInstManager.gfxRenderCache.createProgram(this.program);

        if (this.drawCall.waterAnimated) {
            const frame = Math.floor(gameTimeSeconds * WATER_FRAME_RATE) % WATER_ANIMATED_FRAMES;
            this.drawCall.textureOffsetS = (gameTimeSeconds * WATER_SCROLL_RATE) % 1;
            this.drawCall.textureOffsetT = (WATER_TEXTURE_ROWS - frame - 1) / WATER_TEXTURE_ROWS;
        } else if (this.drawCall.scrollStepS !== 0 || this.drawCall.scrollStepT !== 0) {
            const frames = getGameTick(viewerInput.time);
            const offsetS = -(this.drawCall.scrollStepS * frames) / 524288;
            const offsetT = -(this.drawCall.scrollStepT * frames) / 524288;
            this.drawCall.textureOffsetS = ((offsetS % 1) + 1) % 1;
            this.drawCall.textureOffsetT = ((offsetT % 1) + 1) % 1;
        }

        const renderInst = renderInstManager.newRenderInst();
        renderInst.setGfxProgram(this.gfxProgram);
        if (this.animationTextureMappings.length !== 0) {
            const frame = teleporter !== null ? teleporterFrame(getGameTick(viewerInput.time), teleporter.arrivalState ?? teleporter.state, teleporter.previewActive)
                : this.drawCall.switchBall !== null ? this.drawCall.switchBall.state === 1 ? 0 : 1 : eyeAnimation?.kind === "texture"
                ? sampleAnimalEyeFrame(getGameTick(viewerInput.time), eyeAnimation.family, eyeAnimation.side, eyeAnimation.deactivated)
                : this.drawCall.commandTextureFrame ?? textureAnimationFrame(getGameTick(viewerInput.time) * this.drawCall.animationFrameRate / GAME_TICK_RATE, this.animationTextureMappings.length, this.drawCall.animationLoopStartFrame);
            renderInst.setSamplerBindingsFromTextureMappings([this.animationTextureMappings[frame]]);
        } else {
            renderInst.setSamplerBindingsFromTextureMappings(this.animationTextureMappings1.length !== 0
                ? [this.textureMappings[0], this.animationTextureMappings1[this.drawCall.animationTextureFrame1]] : this.textureMappings);
        }
        renderInst.setMegaStateFlags(this.megaStateFlags);
        renderInst.setDrawCount(this.drawCall.indexCount, this.drawCall.firstIndex);

        computeViewMatrix(viewMatrixScratch, viewerInput.camera);
        vec3.copy(drawCenterScratch, this.drawCall.center);
        const objectTick = getGameTick(viewerInput.time);
        if (this.pathStartTick === -1 || objectTick < this.pathStartTick)
            this.pathStartTick = objectTick;
        const pathTick = objectTick - this.pathStartTick;
        if (this.drawCall.gravitySwitch !== null && this.drawCall.gravitySwitch.part !== 'ball') {
            vec3.transformMat4(drawCenterScratch, drawCenterScratch, this.drawCall.modelMatrix!);
        } else if (this.drawCall.leverHandle !== null && this.drawCall.modelMatrix !== null) {
            computeLeverHandleMatrix(this.drawCall.modelMatrix, this.drawCall.leverHandle);
            vec3.transformMat4(drawCenterScratch, drawCenterScratch, this.drawCall.modelMatrix);
        } else if (this.drawCall.objectPathMotion !== null && this.drawCall.modelMatrix !== null) {
            computeObjectPathMatrix(this.drawCall.modelMatrix, this.drawCall.objectPathMotion, pathTick);
            vec3.transformMat4(drawCenterScratch, drawCenterScratch, this.drawCall.modelMatrix);
        } else if (this.drawCall.objectPathShadowMotion !== null && this.drawCall.modelMatrix !== null) {
            computeObjectPathShadowMatrix(this.drawCall.modelMatrix, this.drawCall.objectPathShadowMotion, pathTick);
            vec3.transformMat4(drawCenterScratch, drawCenterScratch, this.drawCall.modelMatrix);
        } else if (this.drawCall.objectMotion !== null && this.drawCall.modelMatrix !== null) {
            computeObjectMotionMatrix(this.drawCall.modelMatrix, this.drawCall.objectMotion, objectTick);
            vec3.transformMat4(drawCenterScratch, drawCenterScratch, this.drawCall.modelMatrix);
        } else if (this.drawCall.objectShadowMotion !== null && this.drawCall.modelMatrix !== null) {
            computeObjectShadowMotionMatrix(this.drawCall.modelMatrix, this.drawCall.objectShadowMotion, objectTick);
            vec3.transformMat4(drawCenterScratch, drawCenterScratch, this.drawCall.modelMatrix);
        } else if (this.drawCall.objectRotation !== null && this.drawCall.modelMatrix !== null) {
            computeObjectRotationMatrix(this.drawCall.modelMatrix, this.drawCall.objectRotation, objectTick);
            vec3.transformMat4(drawCenterScratch, drawCenterScratch, this.drawCall.modelMatrix);
        }
        if (this.drawCall.textureGen) {
            let sceneOffs = renderInst.allocateUniformBuffer(F3DEX_Program.ub_SceneParams, 24);
            const scene = renderInst.mapUniformBufferF32(F3DEX_Program.ub_SceneParams);
            sceneOffs += fillMatrix4x4(scene, sceneOffs, viewerInput.camera.projectionMatrix);
            vec3.transformMat4(centerViewScratch, drawCenterScratch, viewMatrixScratch);
            mat4.lookAt(textureGenLookAtScratch, [0, 0, 0], [centerViewScratch[0], centerViewScratch[1], centerViewScratch[2]], [0, 1, 0]);
            sceneOffs += fillVec4(scene, sceneOffs, textureGenLookAtScratch[0], textureGenLookAtScratch[4], textureGenLookAtScratch[8], 0);
            sceneOffs += fillVec4(scene, sceneOffs, textureGenLookAtScratch[1], textureGenLookAtScratch[5], textureGenLookAtScratch[9], 0);
        }

        const usesFog = this.fogEnabled && this.usesFog;
        const drawUboSize = 12 + 8 * 2 + (this.usesLighting ? 12 : 0) + (usesFog ? 8 : 0);
        let offs = renderInst.allocateUniformBuffer(F3DEX_Program.ub_DrawParams, drawUboSize);
        const mappedF32 = renderInst.mapUniformBufferF32(F3DEX_Program.ub_DrawParams);

        if (this.drawCall.translucent) {
            vec3.transformMat4(centerViewScratch, drawCenterScratch, viewMatrixScratch);
            renderInst.sortKey = setSortKeyDepth(makeSortKey(GfxRendererLayer.TRANSLUCENT), -centerViewScratch[2]);
        } else {
            renderInst.sortKey = makeSortKey(GfxRendererLayer.OPAQUE, this.gfxProgram.ResourceUniqueId);
        }
        if (this.drawCall.modelMatrix !== null) {
            mat4.mul(modelViewScratch, viewMatrixScratch, this.drawCall.modelMatrix);
            if (this.drawCall.switchBall !== null || this.drawCall.leverLight !== null || this.drawCall.projectedObjectSprite !== null) {
                vec3.transformMat4(centerViewScratch, this.drawCall.center, viewMatrixScratch);
                const depth = -centerViewScratch[2], fovY = 2 * Math.atan(1 / viewerInput.camera.projectionMatrix[5]) * 180 / Math.PI;
                const size = this.drawCall.switchBall?.size ?? this.drawCall.leverLight?.size ?? this.drawCall.projectedObjectSprite!.size;
                const half = particleProjectedHalfSize(size, depth, fovY, 32) * depth / viewerInput.camera.projectionMatrix[5];
                mat4.fromTranslation(modelViewScratch, centerViewScratch);
                mat4.scale(modelViewScratch, modelViewScratch, [half, half, 1]);
            } else if (this.drawCall.billboard)
                calcBillboardMatrix(modelViewScratch, modelViewScratch, CalcBillboardFlags.UseRollGlobal | CalcBillboardFlags.PriorityZ | CalcBillboardFlags.UseZPlane);
            offs += fillMatrix4x3(mappedF32, offs, modelViewScratch);
        } else {
            offs += fillMatrix4x3(mappedF32, offs, viewMatrixScratch);
        }

        this.computeTextureMatrix(texMatrixScratch, 0);
        offs += fillMatrix4x2(mappedF32, offs, texMatrixScratch);
        this.computeTextureMatrix(texMatrixScratch, 1);
        offs += fillMatrix4x2(mappedF32, offs, texMatrixScratch);

        if (this.usesLighting) {
            vec3.sub(lightDiffuseScratch, this.drawCall.light.diffuseColor, this.drawCall.light.ambientColor);
            transformVec3Mat4w0(lightDirectionScratch, viewMatrixScratch, this.drawCall.light.direction);
            offs += fillVec3v(mappedF32, offs, lightDiffuseScratch);
            offs += fillVec3v(mappedF32, offs, lightDirectionScratch);
            offs += fillVec3v(mappedF32, offs, this.drawCall.light.ambientColor);
        }

        if (usesFog) {
            offs += fillVec4(mappedF32, offs, this.drawCall.fogNear, this.drawCall.fogFar, 0, 0);
            offs += fillColor(mappedF32, offs, this.drawCall.fogColor);
        }

        let combOffs = renderInst.allocateUniformBuffer(F3DEX_Program.ub_CombineParams, 12);
        const comb = renderInst.mapUniformBufferF32(F3DEX_Program.ub_CombineParams);
        const prim = this.drawCall.DP_PrimColor;
        const env = this.drawCall.DP_EnvColor;
        combOffs += fillVec4(comb, combOffs, prim[0], prim[1], prim[2], prim[3]);
        combOffs += fillVec4(comb, combOffs, env[0], env[1], env[2], env[3]);
        combOffs += fillVec4(comb, combOffs, 0, 0, 0, this.wireframeEnabled ? 1 : 0);

        renderInstManager.submitRenderInst(renderInst);
    }

    public setBackfaceCullingEnabled(enabled: boolean): void {
        this.megaStateFlags.cullMode = enabled ? translateCullMode(this.drawCall.SP_GeometryMode) : GfxCullMode.None;
    }

    public setVertexColorsEnabled(enabled: boolean): void {
        this.vertexColorsEnabled = enabled;
        this.createProgram();
    }

    public setTexturesEnabled(enabled: boolean): void {
        this.texturesEnabled = enabled;
        this.createProgram();
    }

    public setFogEnabled(enabled: boolean): void {
        this.fogEnabled = enabled;
        this.createProgram();
    }

    public setWireframeEnabled(enabled: boolean): void {
        this.wireframeEnabled = enabled;
    }

    public get layer(): SSSVLayer {
        return this.drawCall.layer;
    }

    public setVisible(enabled: boolean): void {
        if (this.drawCall.gravitySwitch !== null) this.drawCall.gravitySwitch.enabled = enabled;
        this.drawCall.visible = enabled;
    }
}

const bindingLayouts: GfxBindingLayoutDescriptor[] = [
    { numUniformBuffers: 3, numSamplers: 2 },
];

export interface SSSVRendererOptions {
    particleSimulation?: ParticleSimulation | null;
    emitterPrograms?: EmitterCommandRuntime | null;
    animalStaticBuilds?: readonly StaticAnimalBuild[];
    animalSpawnMarkers?: AnimalMarker[];
    levelEvents?: BoulderEventVisuals | null;
    rain?: RainSimulation | null;
    fenceSwitch?: FenceSwitchRuntime | null;
    objectMarkers?: readonly ObjectMarker[];
    arrival?: ArrivalVisuals | null;
    elevator?: ElevatorVisuals | null;
    objectCommands?: ObjectCommandRuntime | null;
    snowPlatforms?: SnowPlatformVisuals | null;
    liveAnimalSpawns?: LiveAnimalSpawnVisuals | null;
    lagoonMachine?: LagoonMachineVisuals | null;
}

export class SSSVRenderer implements Viewer.SceneGfx {
    private renderHelper: GfxRenderHelper;
    private renderInstListMain = new GfxRenderInstList();
    private renderData: RenderData;
    private textureCache = new GfxTextureCache();
    private drawCallInstances: SSSVDrawCallInstance[] = [];
    private fenceRenderer: FenceRenderer | null = null;
    private hangingRenderer: HangingRenderer | null = null;
    private particleRenderer: ParticleRenderer | null = null;
    private animalMarkerMode: AnimalMarkerMode = "auto";
    private animalMarkerDrawCalls: SSSVDrawCall[] = [];
    private animalMarkerSelect: HTMLSelectElement | null = null;
    private animalsVisible = true;
    private animalSpawnPreviewEnabled = false;
    private buttonInput: ReturnType<typeof createInteractionInput> | null = null;
    private buttonCamera: Camera | null = null;
    private objectsEnabled = true;
    private teleporterPreviewActive = false;
    private lastSceneTick = 0;
    private arrivalRevision = -1;
    private objectMarkersEnabled = false;
    public readonly floorButtons: FloorButtonVisuals;
    private readonly buttonVisuals: LeverVisuals;
    public music: MusicPlayer | null = null;

    public readonly animalStaticBuilds: readonly StaticAnimalBuild[];
    private animalSpawnMarkers: AnimalMarker[];
    private levelEvents: BoulderEventVisuals | null;
    public readonly rain: RainSimulation | null;
    public readonly fenceSwitch: FenceSwitchRuntime | null;
    public readonly objectMarkers: readonly ObjectMarker[];
    public readonly arrival: ArrivalVisuals | null;
    public readonly elevator: ElevatorVisuals | null;
    public readonly objectCommands: ObjectCommandRuntime | null;
    public readonly snowPlatforms: SnowPlatformVisuals | null;
    public readonly liveAnimalSpawns: LiveAnimalSpawnVisuals | null;
    public readonly lagoonMachine: LagoonMachineVisuals | null;
    private readonly machineInteractions: FeatureInteraction | null;
    private readonly liveInteractions: FeatureInteraction | null;
    private readonly snowInteractions: FeatureInteraction | null;
    private readonly objectInteractions: FeatureInteraction | null;
    private readonly elevatorInteractions: FeatureInteraction | null;
    private readonly rainInteractions: FeatureInteraction | null;
    private readonly fenceInteractions: FeatureInteraction | null;
    private readonly emitterInteractions: FeatureInteraction | null;
    private readonly eventInteractions: FeatureInteraction | null;
    private readonly interactionTargets: readonly InteractionTarget[];

    constructor(device: GfxDevice, private sharedOutput: RSPSharedOutput, drawCalls: SSSVDrawCall[], fences: FenceSpan[], public levelName: string, public faceCount: number, private initialWorldMatrix: mat4, private clearColor: Color, private animalMarkers: AnimalMarker[], hangingRibbons: HangingRibbon[], fogNear: number, fogFar: number, fogColor: Color, private pathOverlay: PathOverlay, options: SSSVRendererOptions = {}) {
        const { particleSimulation = null, animalStaticBuilds = [], rain = null, arrival = null } = options;
        this.animalStaticBuilds = animalStaticBuilds;
        this.animalSpawnMarkers = options.animalSpawnMarkers ?? [];
        this.levelEvents = options.levelEvents ?? null;
        this.rain = rain;
        this.fenceSwitch = options.fenceSwitch ?? null;
        this.objectMarkers = options.objectMarkers ?? [];
        this.arrival = arrival;
        this.elevator = options.elevator ?? null;
        this.objectCommands = options.objectCommands ?? null;
        this.snowPlatforms = options.snowPlatforms ?? null;
        this.liveAnimalSpawns = options.liveAnimalSpawns ?? null;
        this.lagoonMachine = options.lagoonMachine ?? null;

        this.renderHelper = new GfxRenderHelper(device);
        this.levelEvents?.setEnabled(true);
        this.renderData = new RenderData(device, this.renderHelper.renderCache, sharedOutput, 1, arrival !== null || animalStaticBuilds.some(build => build.wool !== null || build.tail !== null || build.flame !== null || build.mysteryBear !== null));
        for (const drawCall of drawCalls)
            this.drawCallInstances.push(new SSSVDrawCallInstance(device, this.renderHelper.renderCache, sharedOutput, drawCall, this.textureCache));
        this.buttonVisuals = new LeverVisuals(rain !== null ? drawCalls.filter(c => c.objectPlacementIndex === rain.button.config.placementIndex) : []);
        this.pickDrawCalls = drawCalls;
        this.floorButtons = new FloorButtonVisuals(drawCalls);
        this.updateFloorButtons();
        this.animalMarkerDrawCalls = drawCalls.filter(draw => draw.layer === SSSVLayer.AnimalMarkers || draw.layer === SSSVLayer.AnimalSpawnMarkers);
        this.updateAnimalSpawnPreviewVisibility();
        if (fences.length !== 0)
            this.fenceRenderer = new FenceRenderer(device, this.renderHelper.renderCache, sharedOutput, fences, this.textureCache);
        if (hangingRibbons.length !== 0)
            this.hangingRenderer = new HangingRenderer(device, this.renderHelper.renderCache, sharedOutput, hangingRibbons, this.textureCache, fogNear, fogFar, fogColor);
        if (particleSimulation !== null)
            this.particleRenderer = new ParticleRenderer(device, this.renderHelper.renderCache, sharedOutput, this.textureCache, particleSimulation);

        const context: InteractionContext = { camera: () => this.buttonCamera,
            objectsEnabled: () => this.objectsEnabled, sceneTick: () => this.lastSceneTick };
        this.machineInteractions = this.lagoonMachine !== null ? createMachineInteractions(this.lagoonMachine, context) : null;
        this.liveInteractions = this.liveAnimalSpawns !== null ? createAnimalInteractions(this.liveAnimalSpawns,
            { camera: context.camera, animalsVisible: () => this.animalsVisible, markerMode: () => this.animalMarkerMode }) : null;
        this.snowInteractions = this.snowPlatforms !== null ? createSnowInteractions(this.snowPlatforms, context) : null;
        this.objectInteractions = this.objectCommands !== null ? createObjectInteractions(this.objectCommands) : null;
        this.elevatorInteractions = this.elevator !== null ? createElevatorInteractions(this.elevator, context) : null;
        this.rainInteractions = this.rain !== null ? createRainInteractions(this.rain, context) : null;
        this.fenceInteractions = this.fenceSwitch !== null ? createFenceInteractions(this.fenceSwitch, context) : null;
        const emitters = options.emitterPrograms;
        this.emitterInteractions = emitters ? createEmitterInteractions(emitters) : null;
        this.eventInteractions = this.levelEvents !== null ? createEventInteractions(this.levelEvents) : null;
        this.interactionTargets = [
            ...(this.machineInteractions?.targets ?? []), ...(this.snowInteractions?.targets ?? []),
            ...(this.rainInteractions?.targets ?? []), ...(this.fenceInteractions?.targets ?? []),
        ];
    }

    private pickDrawCalls: SSSVDrawCall[] = [];

    public installButtonInput(element: HTMLElement, camera: Camera): void {
        this.buttonCamera = camera;
        this.buttonInput?.destroy();
        this.buttonInput = null;
        if (this.interactionTargets.length === 0) return;
        this.buttonInput = createInteractionInput(element, this.interactionTargets, () => this.objectsEnabled, (index, x, y) => {
            const rect = element.getBoundingClientRect();
            return pickButton(camera, (x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2,
                this.sharedOutput, this.pickDrawCalls, index);
        });
    }

    public setButtonInteractionsEnabled(enabled: boolean): void { this.rain?.setEnabled(enabled); this.fenceSwitch?.setEnabled(enabled); }

    public focusButton(): void { this.focusRainButton(); }

    public focusRainButton(): void {
        const target = this.rainInteractions?.targets[0] ?? this.fenceInteractions?.targets[0];
        const view = target?.focus?.();
        if (view) focusInteraction(this.buttonCamera, view);
    }

    public get dogStaticBuilds(): readonly StaticAnimalBuild[] {
        return this.animalStaticBuilds.filter(build => build.recipe.species === "DOG");
    }

    public getDefaultWorldMatrix(dst: mat4): void {
        mat4.copy(dst, this.initialWorldMatrix);
    }

    public adjustCameraController(cameraController: CameraController): void {
        cameraController.setSceneMoveSpeedMult(1.0);
    }

    public setFogEnabled(enabled: boolean): void {
        for (const instance of this.drawCallInstances)
            instance.setFogEnabled(enabled);
        this.hangingRenderer?.setFogEnabled(enabled);
    }

    public setCullingEnabled(enabled: boolean): void {
        for (const instance of this.drawCallInstances)
            instance.setBackfaceCullingEnabled(enabled);
    }

    public setLayerVisible(layer: SSSVLayer, enabled: boolean): void {
        for (const instance of this.drawCallInstances) {
            if (instance.layer === layer)
                instance.setVisible(enabled);
        }
    }

    public setWaterEnabled(enabled: boolean): void {
        this.setLayerVisible(SSSVLayer.Water, enabled);
    }

    public setMapEnabled(enabled: boolean): void {
        this.setLayerVisible(SSSVLayer.Map, enabled);
    }

    public setUpperMapEnabled(enabled: boolean): void {
        this.setLayerVisible(SSSVLayer.Upper, enabled);
    }

    private updateFloorButtons(): void {
        this.floorButtons.update(this.objectsEnabled, index => this.lagoonMachine?.runtime.enabled
            ? this.lagoonMachine.runtime.world.getEntity(`object:${index}`)?.state ?? null : null);
    }

    public setObjectsEnabled(enabled: boolean): void {
        this.objectsEnabled = enabled;
        this.setLayerVisible(SSSVLayer.Objects, enabled);
        this.updateFloorButtons();
        this.setTeleporterPreviewActive(this.teleporterPreviewActive);
        this.updateArrivalState();
        this.elevator?.update(enabled);
        this.snowPlatforms?.update(enabled);
        if (this.levelEvents !== null) {
            this.levelEvents.objectsEnabled = enabled;
            if (!enabled) this.levelEvents.hide();
        }
    }

    public setTeleporterPreviewActive(enabled: boolean): void {
        this.teleporterPreviewActive = enabled;
        for (const call of this.pickDrawCalls) {
            if (call.teleporter === null) continue;
            call.teleporter.previewActive = enabled;
            if (call.teleporter.part === "fan") call.visible = this.objectsEnabled && teleporterIsActive(call.teleporter);
        }
    }

    public setEntranceArrivalEnabled(enabled: boolean): void {
        this.arrival?.simulation.setEnabled(enabled, this.lastSceneTick);
        this.updateArrivalState();
    }

    private updateArrivalState(): void {
        if (this.arrival === null) return;
        const simulation = this.arrival.simulation;
        this.arrival.draw.visible = this.objectsEnabled && simulation.beamVisible;
        this.arrival.draw.animationTextureFrame1 = simulation.noiseFrame;
        this.arrival.draw.textureOffsetT = -simulation.scroll / 128;
        for (const call of this.pickDrawCalls) {
            if (call.objectPlacementIndex !== simulation.placementIndex || call.teleporter === null) continue;
            call.teleporter.arrivalState = simulation.entranceState;
            if (call.teleporter.part === "fan") call.visible = this.objectsEnabled && teleporterIsActive(call.teleporter);
        }
    }

    public setObjectMarkersEnabled(enabled: boolean): void {
        this.objectMarkersEnabled = enabled;
        this.setLayerVisible(SSSVLayer.ObjectMarkers, enabled);
    }

    public setHangingEnabled(enabled: boolean): void {
        this.hangingRenderer?.setEnabled(enabled);
    }

    public setAnimalMarkersEnabled(enabled: boolean): void {
        this.setAnimalMarkerMode(enabled ? "all" : "off");
    }

    public setAnimalMarkerMode(mode: AnimalMarkerMode): void {
        this.animalMarkerMode = mode;
        if (this.animalMarkerSelect !== null) this.animalMarkerSelect.value = mode;
        this.updateAnimalSpawnPreviewVisibility();
    }

    public setAnimalsEnabled(enabled: boolean): void {
        this.animalsVisible = enabled;
        this.setLayerVisible(SSSVLayer.Animals, enabled);
        this.updateAnimalSpawnPreviewVisibility();
    }

    public setAnimalSpawnPreviewEnabled(enabled: boolean): void {
        this.animalSpawnPreviewEnabled = enabled;
        this.updateAnimalSpawnPreviewVisibility();
    }

    public setScriptedLevelEventsEnabled(enabled: boolean): void {
        this.levelEvents?.setEnabled(enabled);
    }

    private updateAnimalSpawnPreviewVisibility(): void {
        this.liveAnimalSpawns?.update(this.animalsVisible, this.animalMarkerMode);
        this.setLayerVisible(SSSVLayer.AnimalSpawnPreview, this.animalSpawnPreviewEnabled && this.animalsVisible);
        for (const draw of this.animalMarkerDrawCalls)
            draw.visible = isAnimalMarkerVisible(this.animalMarkerMode, draw.animalMarkerHasModel, this.animalsVisible)
                && (draw.layer !== SSSVLayer.AnimalSpawnMarkers || this.animalSpawnPreviewEnabled);
    }

    public createPanels(): UI.Panel[] {
        const renderHacksPanel = new UI.Panel();
        renderHacksPanel.customHeaderBackgroundColor = UI.COOL_BLUE_COLOR;
        renderHacksPanel.setTitle(UI.RENDER_HACKS_ICON, "Render Hacks");

        if (this.drawCallInstances.some((instance) => instance.layer === SSSVLayer.Animals || instance.layer === SSSVLayer.AnimalSpawnPreview)) {
            const animalModels = new UI.Checkbox("Animals", true);
            animalModels.onchanged = () => this.setAnimalsEnabled(animalModels.checked);
            renderHacksPanel.contents.appendChild(animalModels.elem);
        }

        const markerLabel = document.createElement("label");
        markerLabel.textContent = "Animal Markers ";
        markerLabel.style.display = "flex";
        markerLabel.style.alignItems = "center";
        markerLabel.style.gap = "8px";
        const markerMode = this.animalMarkerSelect = document.createElement("select");
        markerMode.setAttribute("aria-label", "Animal Markers");
        markerMode.title = "Auto shows placeholders for animals without a visible model.";
        for (const [value, label] of [["auto", "Auto"], ["all", "All"], ["off", "Off"]]) {
            const option = document.createElement("option");
            option.value = value; option.textContent = label;
            markerMode.appendChild(option);
        }
        markerMode.value = this.animalMarkerMode;
        markerMode.onchange = () => this.setAnimalMarkerMode(markerMode.value as AnimalMarkerMode);
        markerLabel.appendChild(markerMode);
        renderHacksPanel.contents.appendChild(markerLabel);

        const objects = new UI.Checkbox("Objects", true);
        objects.onchanged = () => this.setObjectsEnabled(objects.checked);
        renderHacksPanel.contents.appendChild(objects.elem);
        const hanging = new UI.Checkbox("Hanging Objects", true);
        hanging.onchanged = () => this.setHangingEnabled(hanging.checked);
        renderHacksPanel.contents.appendChild(hanging.elem);

        if (this.particleRenderer !== null) {
            const particles = new UI.Checkbox("Particles", true);
            particles.onchanged = () => { this.particleRenderer!.enabled = particles.checked; };
            renderHacksPanel.contents.appendChild(particles.elem);
        }

        const fog = new UI.Checkbox("Enable Fog", false);
        fog.onchanged = () => {
            for (const instance of this.drawCallInstances)
                instance.setFogEnabled(fog.checked);
        };
        renderHacksPanel.contents.appendChild(fog.elem);

        if (this.objectMarkers.length !== 0) {
            const markers = new UI.Checkbox("Object Markers", this.objectMarkersEnabled);
            markers.elem.title = "Material-40 objects: cyan means hidden; amber means startup visibility is unresolved. Labels use placement indices.";
            const legend = document.createElement('div');
            legend.textContent = "Cyan: hidden · Amber: unresolved visibility";
            legend.style.fontSize = '12px'; legend.style.display = 'none';
            const inspection = document.createElement('details'); inspection.style.display = 'none';
            const summary = document.createElement('summary'); summary.textContent = "Object marker roles"; inspection.appendChild(summary);
            const selection = document.createElement('select'); selection.setAttribute('aria-label', 'Inspect object marker'); selection.style.maxWidth = '100%';
            for (const marker of this.objectMarkers) {
                const option = document.createElement('option'); option.textContent = `#${marker.placementIndex} · ${marker.roleAnalysis.roles.map(r => OBJECT_ROLE_NAMES[r]).join(', ')}`;
                selection.appendChild(option);
            }
            inspection.appendChild(selection);
            const detail = document.createElement('div'); detail.style.cssText = 'font-size:12px;white-space:pre-wrap;max-height:180px;overflow:auto';
            const resize = () => {
                // Panel height is normally measured only on expansion or mouse entry.
                if (renderHacksPanel.expanded) renderHacksPanel.elem.style.height = `${renderHacksPanel.mainPanel.offsetHeight}px`;
            };
            const update = () => {
                const marker = this.objectMarkers[selection.selectedIndex], analysis = marker.roleAnalysis;
                detail.textContent = [marker.label, 'Command indices are zero-based.', describeObjectRoleReferences(analysis) || 'No initial/event commands attached.',
                    ...analysis.evidence.map(e => `${e.activation}${e.commandIndex !== null ? ` C${e.commandIndex}` : ''}: ${e.detail}`), ...analysis.diagnostics].join('\n');
                resize();
            };
            selection.onchange = update; update(); inspection.appendChild(detail);
            inspection.ontoggle = resize;
            markers.onchanged = () => { this.setObjectMarkersEnabled(markers.checked); legend.style.display = inspection.style.display = markers.checked ? '' : 'none'; resize(); };
            renderHacksPanel.contents.appendChild(markers.elem);
            renderHacksPanel.contents.appendChild(legend);
            renderHacksPanel.contents.appendChild(inspection);
        }

        if (this.animalSpawnMarkers.length !== 0) {
            const spawnPreview = new UI.Checkbox("Scripted Animal Spawn Preview", false);
            spawnPreview.onchanged = () => this.setAnimalSpawnPreviewEnabled(spawnPreview.checked);
            renderHacksPanel.contents.appendChild(spawnPreview.elem);
        }

        const panels = [renderHacksPanel, this.pathOverlay.createPanel()];
        if (this.music !== null) panels.push(createMusicPanel(this.music));
        const teleporters = this.pickDrawCalls.filter(c => c.teleporter?.part === "fan");
        const panel = new UI.Panel();
        panel.customHeaderBackgroundColor = 'rgb(137, 69, 205)';
        panel.setTitle(BUTTONS_ICON, "Interactions");
        if (this.levelEvents !== null) appendLevelEventToggle(panel.contents, this.levelEvents);
        this.rainInteractions?.appendTo(panel.contents);
        this.fenceInteractions?.appendTo(panel.contents);
        if (teleporters.length !== 0) {
            const preview = new UI.Checkbox("Preview Active Teleporters", false);
            preview.elem.title = "Preview all teleporters active. Fan fading uses the starting player's position; this does not teleport or run scripts.";
            preview.onchanged = () => this.setTeleporterPreviewActive(preview.checked);
            panel.contents.appendChild(preview.elem);
            const status = document.createElement('div'); status.style.fontSize = '12px';
            status.textContent = `Startup: ${teleporters.filter(c => c.teleporter!.state === 1).length} active, ${teleporters.filter(c => c.teleporter!.state !== null && c.teleporter!.state !== 1).length} inactive, ${teleporters.filter(c => c.teleporter!.state === null).length} unresolved. Preview overrides these states.`;
            panel.contents.appendChild(status);
        }

        if (this.arrival !== null) {
            const enabled = new UI.Checkbox("Enable Entrance Arrival", this.arrival.simulation.enabled);
            enabled.onchanged = () => this.setEntranceArrivalEnabled(enabled.checked);
            panel.contents.appendChild(enabled.elem);
            const replay = document.createElement('button'); replay.textContent = "Replay Entrance Arrival";
            replay.onclick = () => { enabled.setChecked(true); this.setEntranceArrivalEnabled(true); };
            panel.contents.appendChild(replay);
            const focus = document.createElement('button'); focus.textContent = "Go to Entrance";
            focus.onclick = () => {
                if (this.buttonCamera === null) return;
                const p = this.arrival!.simulation.entrance;
                mat4.targetTo(this.buttonCamera.worldMatrix, [p.x + 320, p.y + 240, mirrorZ(p.z) + 420], [p.x, p.y + 110, mirrorZ(p.z)], [0, 1, 0]);
                this.buttonCamera.worldMatrixUpdated();
            };
            panel.contents.appendChild(focus);
            const note = document.createElement('div'); note.style.fontSize = '12px';
            note.textContent = "Arrival visual preview (5 seconds). Starting animal pose stays static. Disable to restore startup state. Active teleporter preview overrides shutdown.";
            panel.contents.appendChild(note);
        }

        this.elevatorInteractions?.appendTo(panel.contents);
        this.machineInteractions?.appendTo(panel.contents);
        this.liveInteractions?.appendTo(panel.contents);
        this.snowInteractions?.appendTo(panel.contents);
        this.objectInteractions?.appendTo(panel.contents);
        this.emitterInteractions?.appendTo(panel.contents);
        this.eventInteractions?.appendTo(panel.contents);

        panels.push(panel);
        return panels;
    }

    private prepareToRender(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput): void {
        const tick = this.lastSceneTick = getGameTick(viewerInput.time);
        this.lagoonMachine?.runtime.advanceTo(tick);
        this.lagoonMachine?.update(this.objectsEnabled);
        this.updateFloorButtons();
        this.machineInteractions?.sync();
        this.liveAnimalSpawns?.runtime.advanceTo(tick);
        this.liveAnimalSpawns?.update(this.animalsVisible, this.animalMarkerMode);
        this.liveInteractions?.sync();
        this.snowPlatforms?.runtime.advanceTo(tick);
        this.snowPlatforms?.update(this.objectsEnabled, tick);
        this.snowInteractions?.sync();
        this.objectCommands?.advanceTo(tick);
        this.objectInteractions?.sync();
        this.elevator?.runtime.advanceTo(tick);
        this.elevator?.update(this.objectsEnabled);
        this.elevatorInteractions?.sync();
        if (this.arrival !== null) {
            const { simulation, firstVertex } = this.arrival;
            simulation.advanceTo(tick);
            this.updateArrivalState();
            if (simulation.revision !== this.arrivalRevision) {
                this.arrivalRevision = simulation.revision;
                for (let v = 0; v < ARRIVAL_VERTEX_COUNT; v++) {
                    const offset = (firstVertex + v) * 10;
                    this.renderData.vertexBufferData.set(simulation.positions.subarray(v * 3, v * 3 + 3), offset);
                }
                const byteOffset = firstVertex * 40;
                device.uploadBufferData(this.renderData.vertexBuffer, byteOffset, new Uint8Array(this.renderData.vertexBufferData.buffer, byteOffset, ARRIVAL_VERTEX_COUNT * 40));
            }
        }
        this.rain?.advanceTo(tick, { worldMatrix: viewerInput.camera.worldMatrix, fovY: 2 * Math.atan(1 / viewerInput.camera.projectionMatrix[5]) * 180 / Math.PI });
        this.buttonVisuals.update(() => this.rain?.button.enabled ? { state: this.rain.button.state, phase: this.rain.button.leverPhase } : null);
        this.fenceSwitch?.advanceTo(tick);
        if (this.fenceSwitch !== null) for (const call of this.pickDrawCalls)
            if (call.switchBall !== null && call.objectPlacementIndex === this.fenceSwitch.config.placementIndex) call.switchBall.state = this.fenceSwitch.state;
        this.rainInteractions?.sync();
        this.fenceInteractions?.sync();
        this.levelEvents?.update(tick, viewerInput.camera.worldMatrix[12], mirrorZ(viewerInput.camera.worldMatrix[14]));
        this.eventInteractions?.sync();
        for (const build of this.animalStaticBuilds) {
            const mysteryBear = build.mysteryBear;
            if (mysteryBear !== null && updateMysteryBear(mysteryBear, this.renderData.vertexBufferData, tick)) {
                const byteOffset = mysteryBear.firstVertex * 40;
                device.uploadBufferData(this.renderData.vertexBuffer, byteOffset, new Uint8Array(this.renderData.vertexBufferData.buffer, byteOffset, mysteryBear.vertexCount * 40));
            }
            const spotlights = mysteryBear?.spotlights;
            if (spotlights && updateMysteryBearSpotlights(spotlights, this.renderData.vertexBufferData, tick, [viewerInput.camera.worldMatrix[12], viewerInput.camera.worldMatrix[13], mirrorZ(viewerInput.camera.worldMatrix[14])])) {
                const byteOffset = spotlights.firstVertex * 40;
                device.uploadBufferData(this.renderData.vertexBuffer, byteOffset, new Uint8Array(this.renderData.vertexBufferData.buffer, byteOffset, spotlights.vertexCount * 40));
            }
            const flame = build.flame;
            if (flame !== null && updateAnimalFlame(flame, this.renderData.vertexBufferData, tick)) {
                const byteOffset = flame.firstVertex * 40;
                device.uploadBufferData(this.renderData.vertexBuffer, byteOffset, new Uint8Array(this.renderData.vertexBufferData.buffer, byteOffset, flame.vertexCount * 40));
            }
            const tail = build.tail;
            if (tail !== null && updateAnimalTail(tail, this.renderData.vertexBufferData, tick)) {
                const byteOffset = tail.firstVertex * 40;
                device.uploadBufferData(this.renderData.vertexBuffer, byteOffset, new Uint8Array(this.renderData.vertexBufferData.buffer, byteOffset, tail.vertexCount * 40));
            }
            const wool = build.wool;
            if (wool !== null && updateAnimalWool(wool, this.renderData.vertexBufferData, tick)) {
                const byteOffset = wool.firstVertex * 40;
                device.uploadBufferData(this.renderData.vertexBuffer, byteOffset, new Uint8Array(this.renderData.vertexBufferData.buffer, byteOffset, wool.vertexCount * 40));
            }
        }
        const template = this.renderHelper.pushTemplateRenderInst();
        template.setBindingLayouts(bindingLayouts);
        template.setVertexInput(this.renderData.inputLayout, this.renderData.vertexBufferDescriptors, this.renderData.indexBufferDescriptor);

        let offs = template.allocateUniformBuffer(F3DEX_Program.ub_SceneParams, 16);
        const mappedF32 = template.mapUniformBufferF32(F3DEX_Program.ub_SceneParams);
        offs += fillMatrix4x4(mappedF32, offs, viewerInput.camera.projectionMatrix);

        this.renderHelper.renderInstManager.setCurrentList(this.renderInstListMain);
        for (const instance of this.drawCallInstances)
            instance.prepareToRender(device, this.renderHelper.renderInstManager, viewerInput);

        this.renderHelper.renderInstManager.popTemplate();
        this.hangingRenderer?.prepareToRender(device, this.renderHelper, viewerInput);
        this.fenceRenderer?.prepareToRender(device, this.renderHelper, viewerInput);
        this.particleRenderer?.prepareToRender(device, this.renderHelper, viewerInput);
        this.emitterInteractions?.sync();
        this.renderHelper.prepareToRender();
    }

    public render(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput): void {
        const draw = this.renderHelper.debugDraw;
        draw.beginFrame(viewerInput.camera.projectionMatrix, viewerInput.camera.viewMatrix, viewerInput.backbufferWidth, viewerInput.backbufferHeight);
        this.pathOverlay.draw(draw, viewerInput);
        const builder = this.renderHelper.renderGraph.newGraphBuilder();
        const mainColorDesc = makeBackbufferDescSimple(GfxrAttachmentSlot.Color0, viewerInput, makeAttachmentClearDescriptor(this.clearColor));
        const mainDepthDesc = makeBackbufferDescSimple(GfxrAttachmentSlot.DepthStencil, viewerInput, makeAttachmentClearDescriptor(this.clearColor));
        const mainColorTargetID = builder.createRenderTargetID(mainColorDesc, "Main Color");
        const mainDepthTargetID = builder.createRenderTargetID(mainDepthDesc, "Main Depth");

        builder.pushPass((pass) => {
            pass.setDebugName("Main");
            pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mainColorTargetID);
            pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, mainDepthTargetID);
            pass.exec((passRenderer) => {
                this.renderInstListMain.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
            });
        });
        draw.pushPasses(builder, mainColorTargetID, mainDepthTargetID);
        this.renderHelper.antialiasingSupport.pushPasses(builder, viewerInput, mainColorTargetID);
        builder.resolveRenderTargetToExternalTexture(mainColorTargetID, viewerInput.onscreenTexture);

        this.prepareToRender(device, viewerInput);
        builder.execute();
        this.renderInstListMain.reset();
        if (this.objectMarkersEnabled) {
            const ctx = getDebugOverlayCanvas2D();
            for (const marker of this.objectMarkers)
                drawWorldSpaceText(ctx, viewerInput.camera.clipFromWorldMatrix, marker.labelPosition, marker.label, 0,
                    marker.unresolved ? UNRESOLVED_OBJECT_MARKER_COLOR : HIDDEN_OBJECT_MARKER_COLOR, { align: "center", outline: 3 });
        }
        if (this.animalMarkerMode !== "off" && this.animalMarkers.length !== 0) {
            const ctx = getDebugOverlayCanvas2D();
            for (const marker of this.animalMarkers) {
                if (!isAnimalMarkerVisible(this.animalMarkerMode, marker.hasModel, this.animalsVisible)) continue;
                drawWorldSpaceText(ctx, viewerInput.camera.clipFromWorldMatrix, marker.labelPosition, marker.label, 0, White, { align: "center", outline: 3 });
            }
        }
        if (this.liveAnimalSpawns !== null && this.liveAnimalSpawns.activeMarkers.length) {
            const ctx = getDebugOverlayCanvas2D();
            for (const marker of this.liveAnimalSpawns.activeMarkers)
                drawWorldSpaceText(ctx, viewerInput.camera.clipFromWorldMatrix, marker.labelPosition, marker.label, 0, White, { align: "center", outline: 3 });
        }
        if (this.animalMarkerMode !== "off" && this.animalSpawnPreviewEnabled && this.animalSpawnMarkers.length !== 0) {
            const ctx = getDebugOverlayCanvas2D();
            for (const marker of this.animalSpawnMarkers) {
                if (!isAnimalMarkerVisible(this.animalMarkerMode, marker.hasModel, this.animalsVisible)) continue;
                drawWorldSpaceText(ctx, viewerInput.camera.clipFromWorldMatrix, marker.labelPosition, marker.label, 0, White, { align: "center", outline: 3 });
            }
        }
    }

    public destroy(device: GfxDevice): void {
        this.buttonInput?.destroy();
        this.music?.destroy();
        this.renderHelper.destroy();
        this.renderData.destroy(device);
        this.hangingRenderer?.destroy(device);
        this.particleRenderer?.destroy(device);
        this.fenceRenderer?.destroy(device);
        this.textureCache.destroy(device);
    }
}
