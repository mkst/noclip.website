import { mat4, vec3, vec4 } from 'gl-matrix';
import type ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { RSPSharedOutput, Vertex, RSP_Geometry } from '../../BanjoKazooie/f3dex.js';
import * as RDP from '../../Common/N64/RDP.js';
import { TexCM } from '../../Common/N64/Image.js';
import { mirrorZ } from '../core/level.js';
import type { LevelDat } from '../core/level.js';
import { cos256, sinDegrees } from '../core/degree_math.js';
import { parseI4Texture } from '../core/texture.js';
import { SSSVDrawCall, SSSVLayer, DP_OTHERMODE_H, RENDER_TRANSLUCENT } from '../render/terrain.js';
import { buildBillboards, LEVEL_REGULAR_TEXTURE_ID_BASE } from '../objects/objects.js';
import type { SSSVObjectData } from '../objects/objects.js';
import { BonusRingRuntime } from './bonus_rings.js';
import type { BonusRingConfig, BonusRingState } from './bonus_rings.js';

// Reflection images occupy 670–714; torch particle images start at 720.
export const BONUS_RING_TEXTURE = 715;
const COMBINE_RING: RDP.CombineParams = {
    c0: { a: RDP.CCMUX.PRIMITIVE, b: RDP.CCMUX.ENVIRONMENT, c: RDP.CCMUX.TEXEL0, d: RDP.CCMUX.ENVIRONMENT },
    a0: { a: RDP.ACMUX.TEXEL0, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.SHADE, d: RDP.ACMUX.ZERO },
    c1: { a: RDP.CCMUX.ADD_ZERO, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.MUL_ZERO, d: RDP.CCMUX.COMBINED },
    a1: { a: RDP.ACMUX.ZERO, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.ZERO, d: RDP.ACMUX.ADD_COMBINED },
};

// trails/display_trails case 4: alternating radii, byte phase and deletion expansion.
export function sampleBonusHoop(state: BonusRingState, tick: number): { positions: Float32Array; alpha: number; scale: number } {
    const hoop = state.hoop;
    const fade = hoop?.removed === null || hoop?.removed === undefined ? 0 : Math.min(192, (tick - hoop.removed + 1) * 6);
    const phase = (tick - (hoop?.birth ?? tick)) * 2;
    const positions = new Float32Array(32 * 3);
    for (let side=0; side<16; side++) {
        const pulse = cos256(phase) << 5;
        const wave = (side & 1 ? pulse : -pulse) >> 15;
        const inner = ((256 + wave) * state.site.scale) >> 11;
        const outer = inner + ((20 * 8 * state.site.scale) >> 11);
        const angle = Math.trunc(side * 360 / 16);
        for (let edge=0; edge<2; edge++) {
            const radius = edge ? outer : inner, offset = (side * 2 + edge) * 3;
            positions[offset] = (sinDegrees(angle + 90) * radius) >> 8;
            positions[offset + 1] = (sinDegrees(angle) * radius) >> 8;
        }
    }
    return { positions, alpha: (192 - fade) / 255, scale: 0.125 + fade / 512 };
}

function unpack(color: number): [number, number, number, number] {
    return [((color >> 8) & 248) / 255, ((color >> 3) & 248) / 255, ((color << 2) & 248) / 255, 1];
}

export class BonusRingVisuals {
    public readonly runtime: BonusRingRuntime;
    public readonly calls: SSSVDrawCall[] = [];
    public readonly firstVertex: number;
    public readonly vertexCount: number;
    private readonly hoops: { siteIndex: number; draw: SSSVDrawCall; firstVertex: number }[] = [];
    private readonly sprites: { siteIndex: number; draw: SSSVDrawCall }[] = [];
    private uploadedWorld: BonusRingRuntime['world'] | null = null;
    private uploadedTick = -1;
    constructor(output: RSPSharedOutput, config: BonusRingConfig, table: Map<number, SSSVObjectData>, dat: LevelDat, segment1: ArrayBufferSlice) {
        this.runtime = new BonusRingRuntime(config);
        output.textureCache.textures[BONUS_RING_TEXTURE] = parseI4Texture(segment1, 32, 128, 'bonus_ring', 0x44CB0, TexCM.WRAP);
        this.firstVertex = output.vertices.length;
        for (const site of config.sites) {
            const draw = new SSSVDrawCall(), firstVertex = output.vertices.length;
            draw.layer = SSSVLayer.Objects; draw.objectPlacementIndex = site.index;
            draw.translucent = true; draw.modelMatrix = mat4.create();
            draw.DP_OtherModeH = DP_OTHERMODE_H & ~(3 << 20); draw.DP_OtherModeL = RENDER_TRANSLUCENT;
            draw.DP_Combine = COMBINE_RING; draw.textureIndices = [BONUS_RING_TEXTURE];
            draw.SP_TextureState.set(true, 0, 0, 0.5, 0.5);
            draw.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH;
            draw.centerCount = 1;
            for (let i=0; i<32; i++) {
                const v = new Vertex(); v.tx = (i >> 1) & 1 ? 2047 / 32 : 0; v.ty = i & 1 ? 2047 / 32 : 0;
                v.c0 = v.c1 = v.c2 = 1; v.a = 192 / 255; output.vertices.push(v);
            }
            draw.firstIndex = output.indices.length;
            for (let i=0; i<32; i+=2) output.indices.push(firstVertex+i, firstVertex+((i+3)&31), firstVertex+i+1,
                firstVertex+i, firstVertex+((i+2)&31), firstVertex+((i+3)&31));
            draw.indexCount = 96;
            this.hoops.push({ siteIndex: site.index, draw, firstVertex }); this.calls.push(draw);
        }
        this.vertexCount = output.vertices.length - this.firstVertex;
        for (const site of config.sites.filter(s => s.ordinal === null)) {
            const [draw] = buildBillboards(output, [{ ...site.placement, unkC: 11 }], table, [], dat);
            draw.objectPlacementIndex = site.index;
            draw.animationTextureIndices = [11,10,9,8].map(category => LEVEL_REGULAR_TEXTURE_ID_BASE + category - 8);
            draw.commandTextureFrame = 0;
            this.sprites.push({ siteIndex: site.index, draw }); this.calls.push(draw);
        }
        this.update(true);
        for (const hoop of this.hoops) {
            const state = this.runtime.world.states.get(`object:${hoop.siteIndex}`)!;
            const sample = sampleBonusHoop(state, 0);
            for (let i=0;i<32;i++) Object.assign(output.vertices[hoop.firstVertex+i], { x: sample.positions[i*3], y: sample.positions[i*3+1], z: 0 });
        }
    }
    public update(enabled: boolean, vertexData?: Float32Array): boolean {
        const tick = this.runtime.world.tick - 1;
        const changed = !!vertexData && (this.uploadedWorld !== this.runtime.world || this.uploadedTick !== tick);
        for (const binding of this.hoops) {
            const state = this.runtime.world.states.get(`object:${binding.siteIndex}`)!;
            const sample = sampleBonusHoop(state, tick), draw = binding.draw, p = state.site.placement;
            draw.visible = enabled && this.runtime.enabled && state.hoop !== null && sample.alpha > 0;
            vec3.set(draw.center, p.x, p.y + (state.site.height >> 1), mirrorZ(p.z));
            mat4.fromTranslation(draw.modelMatrix!, draw.center);
            mat4.scale(draw.modelMatrix!, draw.modelMatrix!, [sample.scale, sample.scale, sample.scale]);
            mat4.rotateY(draw.modelMatrix!, draw.modelMatrix!, p.angle * Math.PI / 180);
            mat4.rotateX(draw.modelMatrix!, draw.modelMatrix!, p.zRotation * Math.PI / 180);
            if (state.hoop) { vec4.copy(draw.DP_PrimColor, unpack(state.hoop.primary)); vec4.copy(draw.DP_EnvColor, unpack(state.hoop.environment)); }
            if (changed && vertexData) for (let i=0;i<32;i++) {
                const offset = (binding.firstVertex+i)*10;
                vertexData.set(sample.positions.subarray(i*3,i*3+3), offset); vertexData[offset+9] = sample.alpha;
            }
        }
        for (const binding of this.sprites) {
            const state = this.runtime.world.states.get(`object:${binding.siteIndex}`)!;
            binding.draw.commandTextureFrame = 11 - state.material;
            binding.draw.visible = enabled && this.runtime.enabled && state.material >= 8 && state.material <= 11;
        }
        if (changed) { this.uploadedWorld = this.runtime.world; this.uploadedTick = tick; }
        return changed;
    }
}
