import { RSPSharedOutput, RSP_Geometry, Vertex } from "../BanjoKazooie/f3dex.js";
import * as RDP from "../Common/N64/RDP.js";
import { TexCM } from "../Common/N64/Image.js";
import type ArrayBufferSlice from "../ArrayBufferSlice.js";
import type { LevelMapEntry, LevelObjectPlacement } from "./level.js";
import { mirrorZ } from "./level.js";
import { sinDegrees } from "./degree_math.js";
import { sampleParticleSurfaces } from "./particles.js";
import type { ParticleDefinition } from "./particle_assets.js";
import type { ScriptParticle } from "./script_particles.js";
import { parseI4Texture, parseI8Texture } from "./texture.js";
import { DP_OTHERMODE_H, SSSVDrawCall, SSSVLayer } from "./terrain.js";
import { vec3, vec4 } from "gl-matrix";
import { assert } from "../util.js";

export const ARRIVAL_TEXTURE_BASE = 904;
export const ARRIVAL_SPARK_TEXTURE = ARRIVAL_TEXTURE_BASE + 17;
export const ARRIVAL_SUBMERGED_TEXTURE = ARRIVAL_SPARK_TEXTURE + 1;
export const ARRIVAL_VERTEX_COUNT = 72;

export function findArrivalEntrance(placements: readonly LevelObjectPlacement[]): { placement: LevelObjectPlacement; index: number } | null {
    for (let index = placements.length - 1; index >= 0; index--)
        if (placements[index].id === 55) return { placement: placements[index], index };
    return null;
}

export class EntranceArrival {
    public revision = 0;
    public enabled = false;
    public elapsed = 0;
    public noiseFrame = 0;
    public scroll = 0;
    public particles: ScriptParticle[] = [];
    public readonly textureIds = [ARRIVAL_SPARK_TEXTURE, ARRIVAL_SUBMERGED_TEXTURE];
    public readonly positions = new Float32Array(ARRIVAL_VERTEX_COUNT * 3);
    private pending: ScriptParticle[] = [];
    private phases = new Int16Array(12);
    private radii = new Int16Array(12);
    private speed = 0;
    private phase = 0;
    private seed = 1;
    private startTick = 0;
    private lastElapsed = 0;

    constructor(public readonly entrance: LevelObjectPlacement, public readonly placementIndex: number, private definition: ParticleDefinition, private map: readonly LevelMapEntry[]) {
        assert(definition.flags === 0x205C && definition.lifetime === 200 && definition.motionTable === 0 && definition.renderGroup === 1, "Unsupported arrival particle definition");
        this.clear();
    }

    public get beamVisible(): boolean { return this.enabled && this.elapsed > 0 && this.elapsed < 120; }
    public get finished(): boolean { return this.enabled && this.elapsed >= 150; }
    public get entranceState(): number | null { return this.enabled ? this.finished ? 0 : 1 : null; }
    // A local stream makes the visual preview reproducible without simulating global RNG users.
    private random(n: number): number { this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5; return (this.seed >>> 0) % n; }
    private clear(): void {
        this.elapsed = this.lastElapsed = this.scroll = this.speed = this.phase = this.noiseFrame = 0;
        this.revision++; this.pending.length = 0;
        this.seed = 1; this.phases.fill(0); this.radii.fill(0); this.positions.fill(0); this.particles.length = 0;
    }
    public replay(tick: number): void { this.clear(); this.startTick = Math.max(0, Math.floor(tick)); this.enabled = true; }
    public setEnabled(enabled: boolean, tick: number): void {
        if (enabled) this.replay(tick);
        else { this.enabled = false; this.clear(); }
    }
    public advanceTo(tick: number): void {
        if (!this.enabled) return;
        tick = Math.max(0, Math.floor(tick));
        if (tick < this.startTick) this.replay(tick);
        const elapsed = Math.min(351, tick - this.startTick);
        if (elapsed < this.lastElapsed) this.clear();
        while (this.lastElapsed < elapsed) { this.step(); this.lastElapsed++; }
    }
    private step(): void {
        this.elapsed++; this.revision++;
        // The game updates/renders particles before advancing the arrival controller.
        this.particles.push(...this.pending); this.pending.length = 0;
        this.particles = this.particles.filter(p => this.stepSpark(p));
        if (this.elapsed > 150) return;
        const tick = this.elapsed;
        if (tick >= 40 && tick < 115) this.scroll -= tick < 80 ? 2 : 4;
        if (tick < 80) {
            if (tick < 40 && this.speed < 5) this.speed = Math.fround(this.speed + 0.18);
            else if (this.speed > 1) this.speed = Math.fround(this.speed - 0.18);
            this.phase = Math.fround(this.phase + this.speed);
        }
        if (this.scroll < 0) this.scroll += 15;
        const e = this.entrance;
        for (let ring = 0; ring < 12; ring++) {
            let radius: number;
            if (this.phases[ring] < ring * 3) {
                this.phases[ring] = Math.trunc(this.phase);
                radius = sinDegrees(Math.trunc(this.phase + ring * 10)) >> 3;
                this.radii[ring] = radius;
            } else radius = this.radii[ring];
            for (let side = 0; side < 6; side++) {
                const height = sinDegrees(this.phases[ring]);
                if (tick >= 111) {
                    if (this.random(32) === 0) this.spark(e.x + ((sinDegrees(side * 60 + 30) * radius) >> 7), e.z + ((sinDegrees(side * 60 + 120) * radius) >> 7), e.y + height);
                    // Source updates these per vertex, including the six increments per ring.
                    if (this.radii[ring] >= 2) this.radii[ring] -= 2;
                    if (this.phases[ring] < 100) this.phases[ring]++;
                } else if (ring < 4) radius = 21;
                if (ring === 11) radius = 0;
                const offset = (ring * 6 + side) * 3;
                this.positions[offset] = e.x + ((sinDegrees(side * 60 + 30) * radius) >> 7);
                this.positions[offset + 1] = e.y + height;
                this.positions[offset + 2] = mirrorZ(e.z + ((sinDegrees(side * 60 + 120) * radius) >> 7));
            }
        }
        if (this.beamVisible) this.noiseFrame = this.random(16);
    }
    private spark(x: number, z: number, y: number): void {
        if (this.particles.length + this.pending.length >= 255) return;
        const surface = sampleParticleSurfaces(this.map, x, z);
        this.pending.push({ id: 35, emitterIndex: -1, x: x * 65536, z: z * 65536, y: y * 65536,
            vx: this.random(65536) * 3 - 98304, vz: this.random(65536) * 3 - 98304, vy: -this.random(16384),
            size: this.random(2) + 1, targetSize: 0, remaining: this.definition.lifetime, frame: 0, lodFraction: 0,
            aboveUpper: surface !== null && y > surface.upper, primaryColor: 0xFFFF, environmentColor: 0xFFFF,
            primaryAlpha: 25, environmentAlpha: 25, texture0: ARRIVAL_SPARK_TEXTURE, texture1: ARRIVAL_SPARK_TEXTURE, textureSize: 32 });
    }
    private stepSpark(p: ScriptParticle): boolean {
        if (p.remaining === 0) return false;
        p.remaining--;
        if (p.vy > -12 * 65536) p.vy -= 25000;
        if (p.vx > 0) p.vx -= 5536; if (p.vx < 0) p.vx += 5536;
        if (p.vz > 0) p.vz -= 5536; if (p.vz < 0) p.vz += 5536;
        const surface = sampleParticleSurfaces(this.map, p.x >> 16, p.z >> 16);
        if (surface === null) return false;
        if (p.id === 109 && p.vy < -4 * 65536) p.vy = -4 * 65536;
        const submerged = (p.y >> 16) < surface.water;
        p.id = submerged ? 109 : 35;
        p.texture0 = p.texture1 = submerged ? ARRIVAL_SUBMERGED_TEXTURE : ARRIVAL_SPARK_TEXTURE;
        p.textureSize = submerged ? 16 : 32;
        if ((p.y >> 16) < surface.ground || (p.aboveUpper && p.y / 65536 < surface.upper) || p.y < 0) {
            p.vy = Math.trunc(p.vy / -2); p.size >>= 1;
            if (p.vy < 32000) p.remaining = 0;
        }
        p.x += p.vx; p.z += p.vz; p.y += p.vy;
        return true;
    }
}

export interface ArrivalVisuals { simulation: EntranceArrival; draw: SSSVDrawCall; firstVertex: number; }

export function buildArrivalVisuals(output: RSPSharedOutput, simulation: EntranceArrival, segment1: ArrayBufferSlice): ArrivalVisuals {
    const textures = output.textureCache.textures;
    textures[ARRIVAL_TEXTURE_BASE] = parseI4Texture(segment1, 32, 32, "arrival/beam", 0x6C60, TexCM.WRAP);
    for (let i = 0; i < 16; i++) textures[ARRIVAL_TEXTURE_BASE + 1 + i] = parseI4Texture(segment1, 32, 32, `arrival/noise/${i}`, 0x6E60 + i * 16, TexCM.WRAP);
    textures[ARRIVAL_SPARK_TEXTURE] = parseI8Texture(segment1, 32, 32, "arrival/spark", 0x2AA10);
    textures[ARRIVAL_SUBMERGED_TEXTURE] = parseI4Texture(segment1, 16, 16, "arrival/submerged-spark", 0x2C210);
    const firstVertex = output.vertices.length, draw = new SSSVDrawCall();
    for (let ring = 0; ring < 12; ring++) for (let side = 0; side < 6; side++) {
        const v = new Vertex(); v.tx = side === 5 ? 0 : side * 170 / 32; v.ty = ring * 6;
        v.c0 = v.c1 = v.c2 = v.a = 1; output.vertices.push(v);
    }
    draw.firstIndex = output.indices.length;
    for (let ring = 0; ring < 11; ring++) {
        const base = firstVertex + ring * 6;
        for (let side = 0; side < 5; side++) {
            const a = base + side;
            output.indices.push(a + 6, a + 1, a, a + 1, a + 6, a + 7);
        }
        output.indices.push(base + 6, base, base + 5, base + 6, base + 5, base + 11);
    }
    draw.indexCount = output.indices.length - draw.firstIndex;
    draw.layer = SSSVLayer.Objects; draw.visible = false; draw.translucent = true;
    draw.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH;
    draw.SP_TextureState.set(true, 0, 0, 0.5, 0.5);
    draw.textureIndices = [ARRIVAL_TEXTURE_BASE, ARRIVAL_TEXTURE_BASE + 1];
    draw.animationTextureIndices1 = Array.from({ length: 16 }, (_, i) => ARRIVAL_TEXTURE_BASE + 1 + i);
    draw.textureOffsetT1 = 0;
    draw.DP_OtherModeH = DP_OTHERMODE_H; draw.DP_OtherModeL = 0x00504A50;
    draw.DP_Combine = {
        c0: { a: RDP.CCMUX.TEXEL1, b: RDP.CCMUX.TEXEL0, c: RDP.CCMUX.TEXEL1, d: RDP.CCMUX.TEXEL0 },
        a0: { a: RDP.ACMUX.TEXEL1, b: RDP.ACMUX.TEXEL0, c: RDP.ACMUX.TEXEL1, d: RDP.ACMUX.TEXEL0 },
        c1: { a: RDP.CCMUX.PRIMITIVE, b: RDP.CCMUX.ENVIRONMENT, c: RDP.CCMUX.COMBINED, d: RDP.CCMUX.ENVIRONMENT },
        a1: { a: RDP.ACMUX.ZERO, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.ZERO, d: RDP.ACMUX.ADD_COMBINED },
    };
    vec4.set(draw.DP_PrimColor, 185 / 255, 185 / 255, 1, 1); vec4.set(draw.DP_EnvColor, 100 / 255, 100 / 255, 190 / 255, 0);
    vec3.set(draw.center, simulation.entrance.x, simulation.entrance.y + 128, mirrorZ(simulation.entrance.z)); draw.centerCount = 1;
    return { simulation, draw, firstVertex };
}
