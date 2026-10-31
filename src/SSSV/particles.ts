import { SCRIPT_PARTICLE_TEXTURE_BASE, SCRIPT_PARTICLE_TEXTURE_OFFSETS, TORCH_PARTICLE_ASSETS } from "./particle_assets.js";
import type { ParticleSprite, ScriptParticleSimulation } from "./script_particles.js";
import type { LevelMapEntry, LevelObjectPlacement } from "./level.js";
import { MAP_X_POINTS, MAP_Z_POINTS } from "./level.js";
import type { SSSVObjectData } from "./objects.js";
import type { ParticleDefinition } from "./particle_assets.js";
import { assert } from "../util.js";
import type { FireFoxParticleSimulation } from "./fire_fox_effects.js";

export interface TorchEmitter {
    placementIndex: number;
    x: number;
    z: number;
    y: number;
    size: number;
}

export interface TorchParticle {
    slot: number;
    emitterIndex: number;
    x: number;
    z: number;
    y: number;
    size: number;
    remaining: number;
    frame: number;
    lodFraction: number;
}

export interface ParticleSurfaces {
    ground: number;
    upper: number;
    water: number;
}

export function createTorchEmitters(placements: readonly LevelObjectPlacement[], table: ReadonlyMap<number, SSSVObjectData>): TorchEmitter[] {
    const result: TorchEmitter[] = [];
    placements.forEach((placement, placementIndex) => {
        if (placement.id !== 50)
            return;
        const entry = table.get(placement.id);
        if (entry === undefined)
            return;
        const scale = entry.scaleOverride || placement.scale || 2048;
        const height = Math.floor(entry.collideHeight * scale / 2048);
        result.push({ placementIndex, x: placement.x, z: placement.z, y: placement.y + height + Math.floor(height / 2), size: Math.floor(scale * 40 / 2048) });
    });
    return result;
}

export function sampleParticleSurfaces(map: readonly LevelMapEntry[], x: number, z: number): ParticleSurfaces | null {
    x = Math.floor(x); z = Math.floor(z);
    const cellX = Math.floor(x / 64) - 4, cellZ = Math.floor(z / 64) - 8;
    if (cellX < 0 || cellZ < 0 || cellX >= MAP_X_POINTS - 1 || cellZ >= MAP_Z_POINTS - 1)
        return null;
    const a = map[cellX * MAP_Z_POINTS + cellZ], b = map[cellX * MAP_Z_POINTS + cellZ + 1];
    const c = map[(cellX + 1) * MAP_Z_POINTS + cellZ + 1], d = map[(cellX + 1) * MAP_Z_POINTS + cellZ];
    const dx = x & 63, dz = z & 63;
    const height = (field: "unk0" | "unk1", diagonal: number): number => {
        const h = [a[field] * 8, b[field] * 8, c[field] * 8, d[field] * 8];
        const quantize = (value: number): number => field === "unk0" ? Math.floor(value) : value;
        if (a.unk4 & diagonal)
            return dx < dz ? h[0] + quantize(((h[2] - h[1]) * dx + (h[1] - h[0]) * dz) / 64)
                : h[0] + quantize(((h[3] - h[0]) * dx + (h[2] - h[3]) * dz) / 64);
        return dx + dz < 64 ? h[0] + quantize(((h[3] - h[0]) * dx + (h[1] - h[0]) * dz) / 64)
            : h[2] + quantize(((h[1] - h[2]) * (64 - dx) + (h[3] - h[2]) * (64 - dz)) / 64);
    };
    // Source corner repair/interpolation without the animated wave offsets.
    const water = [a.unk6 * 4, b.unk6 * 4, c.unk6 * 4, d.unk6 * 4];
    for (let i = 0; i < 4; i++) if (water[i] < 16) {
        let maximum = -Infinity;
        for (let j = 0; j < 4; j++) if (j !== i) maximum = Math.max(maximum, water[j]);
        water[i] = maximum;
    }
    const waterHeight = water[0] + Math.floor((dx < dz
        ? (water[2] - water[1]) * dx + (water[1] - water[0]) * dz
        : (water[3] - water[0]) * dx + (water[2] - water[3]) * dz) / 64);
    return { ground: height("unk0", 1), upper: a.unk3 === 0 ? Infinity : height("unk1", 2), water: waterHeight };
}

export class TorchSimulation {
    public particles: TorchParticle[] = [];
    private lastTick = -1;

    constructor(public readonly emitters: readonly TorchEmitter[], private definition: ParticleDefinition, private drift: readonly (readonly [number, number, number])[], private map: readonly LevelMapEntry[]) {
        assert(definition.flags === 0xD6 && definition.motionTable === 1 && definition.lifetime === 11 && definition.frameTicks === 2 && definition.maxFrame === 6, "Unsupported torch definition");
        assert(drift.length === 32, "Torch simulation requires 32 drift vectors");
    }

    public advanceTo(tick: number): void {
        tick = Math.max(0, Math.floor(tick));
        if (tick === this.lastTick)
            return;
        this.lastTick = tick;
        this.particles.length = 0;
        // Only the last eleven ticks can survive, so seeking requires no full replay.
        const firstBirth = Math.max(4, Math.ceil((tick - this.definition.lifetime + 1) / 4) * 4);
        for (let birth = firstBirth; birth <= tick; birth += 4) {
            for (let emitterIndex = 0; emitterIndex < this.emitters.length; emitterIndex++) {
                if (this.particles.length >= 255)
                    return;
                const emitter = this.emitters[emitterIndex];
                const slot = (((birth / 4 - 1) * this.emitters.length) + emitterIndex + 1) % 255;
                const bornSurface = sampleParticleSurfaces(this.map, emitter.x, emitter.z);
                const aboveUpper = bornSurface !== null && emitter.y > bornSurface.upper;
                const particle: TorchParticle = { slot, emitterIndex, x: emitter.x * 65536, z: emitter.z * 65536, y: emitter.y * 65536, size: emitter.size, remaining: this.definition.lifetime, frame: 0, lodFraction: 0 };
                let alive = true;
                for (let step = 0; step <= tick - birth; step++) {
                    if (particle.remaining === 0) { alive = false; break; }
                    particle.remaining--;
                    const drift = this.drift[(particle.remaining + slot) & 31];
                    particle.x += drift[0] * 256; particle.z += drift[1] * 256; particle.y += drift[2] * 256;
                    if (particle.remaining % this.definition.frameTicks === this.definition.frameTicks - 1)
                        particle.frame = Math.min(this.definition.maxFrame, particle.frame + 1);
                    const surface = sampleParticleSurfaces(this.map, particle.x / 65536, particle.z / 65536);
                    if (surface === null || particle.y / 65536 < surface.ground || particle.y / 65536 < surface.water || (aboveUpper && particle.y / 65536 < surface.upper))
                        particle.remaining = 0;
                    particle.y += 4 * 65536;
                    particle.lodFraction = Math.floor(256 / this.definition.frameTicks) * (this.definition.frameTicks - particle.remaining % this.definition.frameTicks - 1);
                }
                if (alive)
                    this.particles.push(particle);
            }
        }
    }
}

export function particleProjectedHalfSize(size: number, viewDepth: number, fovYDegrees: number, textureSize = 16): number {
    if (viewDepth <= 3 || fovYDegrees <= 0)
        return 0;
    const scaled = Math.trunc(size * 256 * 33 / fovYDegrees);
    const step = Math.min(16383, Math.trunc(scaled * 32 / viewDepth));
    return (textureSize - 1) * step / (128 * 4 * 120);
}

export class ParticleSimulation {
    public particles: ParticleSprite[] = [];
    public readonly textureIds: number[];

    constructor(public readonly torch: TorchSimulation | null, private torchDefinition: ParticleDefinition | null, public readonly script: ScriptParticleSimulation | null, private events: { readonly particles: readonly ParticleSprite[]; readonly textureIds: readonly number[] } | null = null, private rain: { readonly particles: readonly ParticleSprite[]; readonly textureIds: readonly number[] } | null = null, private arrival: { readonly particles: readonly ParticleSprite[]; readonly textureIds: readonly number[] } | null = null, public readonly fireFox: FireFoxParticleSimulation | null = null) {
        this.textureIds = [
            ...(torch !== null ? Array.from({ length: TORCH_PARTICLE_ASSETS.textureCount }, (_, i) => TORCH_PARTICLE_ASSETS.textureIdBase + i) : []),
            ...(script !== null ? Array.from({ length: SCRIPT_PARTICLE_TEXTURE_OFFSETS.length }, (_, i) => SCRIPT_PARTICLE_TEXTURE_BASE + i) : []),
            ...(events?.textureIds ?? []),
            ...(rain?.textureIds ?? []),
            ...(arrival?.textureIds ?? []),
            ...(fireFox?.textureIds ?? []),
        ];
    }

    public advanceTo(tick: number): void {
        this.particles.length = 0;
        if (this.torch !== null && this.torchDefinition !== null) {
            this.torch.advanceTo(tick);
            for (const p of this.torch.particles) this.particles.push({ ...p, texture0: TORCH_PARTICLE_ASSETS.textureIdBase + p.frame, texture1: TORCH_PARTICLE_ASSETS.textureIdBase + p.frame + 1, primaryColor: this.torchDefinition.primaryColor, environmentColor: this.torchDefinition.environmentColor, primaryAlpha: 200, environmentAlpha: 0 });
        }
        if (this.script !== null) {
            this.script.advanceTo(tick);
            this.particles.push(...this.script.particles);
        }
        if (this.events !== null)
            this.particles.push(...this.events.particles);
        if (this.rain !== null) this.particles.push(...this.rain.particles);
        if (this.arrival !== null) this.particles.push(...this.arrival.particles);
        if (this.fireFox !== null) {
            this.fireFox.advanceTo(tick);
            this.particles.push(...this.fireFox.particles);
        }
        if (this.particles.length > 255) this.particles.splice(0, this.particles.length - 255);
    }
}
