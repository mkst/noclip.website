import type { EmitterCommandRuntime } from "./emitter_commands.js";
import { sin256 as sin, cos256 as cos } from "../core/degree_math.js";
import { MAP_Z_POINTS } from "../core/level.js";
import type { LevelDat, LevelMapEntry } from "../core/level.js";
import type { ParticleDefinition } from "./particle_assets.js";
import { SCRIPT_PARTICLE_TEXTURE_BASE } from "./particle_assets.js";
import { packParticleColor, persistentEmissionCount } from "./particle_emitters.js";
import type { EmitterProvenance, PersistentEmitter } from "./particle_emitters.js";
import { sampleParticleSurfaces } from "./particles.js";
import { assert, assertExists } from "../../util.js";

export interface ParticleSprite {
    x: number;
    z: number;
    y: number;
    size: number;
    lodFraction: number;
    texture0: number;
    texture1: number;
    primaryColor: number;
    environmentColor: number;
    primaryAlpha: number;
    environmentAlpha: number;
    surfaceAligned?: boolean;
    textureSize?: number;
    vertical?: boolean;
}

export interface ScriptParticle extends ParticleSprite {
    id: number;
    emitterIndex: number;
    remaining: number;
    frame: number;
    targetSize: number;
    vx: number;
    vz: number;
    vy: number;
    aboveUpper: boolean;
}

export class ParticleRandom {
    private randu: number;
    private lfsr: number;
    constructor(private state: number) { this.state = state || 1; this.randu = this.state; this.lfsr = (this.state & 0xFFFF) || 1; }
    public next(): number {
        let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        return this.state = x >>> 0;
    }
    public mask(n: number): number {
        const old = this.lfsr;
        this.lfsr = ((old << 1) ^ (((old >>> 15) ^ (old >>> 13) ^ (old >>> 4)) & 1)) & 0xFFFF;
        return this.lfsr & (n - 1);
    }
    public clone(): ParticleRandom {
        const copy = new ParticleRandom(this.state);
        copy.randu = this.randu; copy.lfsr = this.lfsr;
        return copy;
    }
    public spread(n: number): number {
        if (n === 0) return 0;
        const a = (this.randu * 4 + 2) >>> 0;
        this.randu = Math.imul(a, a + 1) >>> 2;
        return (this.randu >>> 4) % (n * 2) - n;
    }
}

const sinDegrees = (angle: number) => Math.trunc(Math.sin(angle * Math.PI / 180) * 256);
const cosDegrees = (angle: number) => Math.trunc(Math.cos(angle * Math.PI / 180) * 256);

export function spawnScriptParticle(emitter: PersistentEmitter, emitterIndex: number, definitions: ReadonlyMap<number, ParticleDefinition>, map: readonly LevelMapEntry[], seed: number): { particle: ScriptParticle; random: ParticleRandom } {
    const c = emitter.initial, random = new ParticleRandom(seed);
    let [x, z, y] = c.offset.map((offset, i) => offset + random.spread(c.spread[i]));
    if (c.flags & 0x40) {
        const p = emitter.placement, t = Math.floor((z * cosDegrees(p.zRotation) - y * sinDegrees(p.zRotation)) / 256);
        [x, z, y] = [Math.floor((x * cosDegrees(p.angle) + t * sinDegrees(p.angle)) / 256), Math.floor((-x * sinDegrees(p.angle) + t * cosDegrees(p.angle)) / 256), Math.floor((z * sinDegrees(p.zRotation) + y * cosDegrees(p.zRotation)) / 256)];
    }
    if (c.flags & 0x80) { x = Math.floor(x * emitter.scale / 2048); z = Math.floor(z * emitter.scale / 2048); y = Math.floor(y * emitter.scale / 2048); }
    x += emitter.placement.x; z += emitter.placement.z; y += emitter.placement.y + Math.floor(emitter.height / 2);
    let [pitch, yaw, speed] = c.direction;
    speed += random.spread(c.directionSpread[2]);
    if (c.directionSpread[0] !== 0) pitch = (pitch + random.spread(c.directionSpread[0])) & 255;
    if (c.directionSpread[1] !== 0) yaw = (yaw + random.spread(c.directionSpread[1])) & 255;
    if (c.flags & 0x20) { pitch = (pitch + Math.trunc(emitter.placement.zRotation * 256 / 360)) & 255; yaw = (yaw + Math.trunc(emitter.placement.angle * 256 / 360)) & 255; }
    speed *= 256;
    const horizontal = (speed * cos(pitch)) >> 15;
    let vx = ((horizontal * sin(yaw)) >> 15) * 256, vz = ((horizontal * cos(yaw)) >> 15) * 256, vy = ((speed * sin(pitch)) >> 15) * 256;
    let id = c.particleId, size = c.flags & 0x80 ? Math.floor(c.size * emitter.scale / 2048) : c.size;
    let targetSize = c.argument, primaryColor = c.primaryColor, environmentColor = c.environmentColor;
    if (id === 122) {
        assert(size > 0, "Wrapper 122 requires a positive size divisor");
        id = random.mask(2) + 25;
        targetSize = random.next() % size + 41;
        vx = random.mask(65536) - 40000; vz = random.mask(65536) - 40000;
        vy = random.mask(16384); size = random.mask(16);
        primaryColor = environmentColor = 0xFFFF;
    }
    const d = assertExists(definitions.get(id)), surface = sampleParticleSurfaces(map, x, z);
    return { random, particle: { id, emitterIndex, x: x * 65536, z: z * 65536, y: y * 65536, vx, vz, vy, size: size || d.defaultSize, targetSize, remaining: d.lifetime, frame: 0, lodFraction: 0, aboveUpper: surface !== null && y > surface.upper, primaryColor: primaryColor || d.primaryColor, environmentColor: environmentColor || d.environmentColor, primaryAlpha: id === 24 || id === 37 ? 255 : 200, environmentAlpha: id === 24 || id === 37 ? 255 : 0, texture0: 0, texture1: 0 } };
}

export class ScriptParticleSimulation {
    public particles: ScriptParticle[] = [];
    private lastTick = -1;
    private waterPrimary: number;
    private waterEnvironment: number;
    private waterPrimaryRgb: number[];

    constructor(public readonly emitters: readonly PersistentEmitter[], public readonly definitions: ReadonlyMap<number, ParticleDefinition>, private map: readonly LevelMapEntry[], dat: Pick<LevelDat, "waterPrimColor" | "waterEnvColor">, public readonly provenance: readonly EmitterProvenance[] = [], public readonly programs: EmitterCommandRuntime | null = null) {
        for (const [id, flags, lifetime, frameTicks, maxFrame, group] of [[19, 0, 90, 20, 1, 6], [24, 0x9C, 200, 1, 0, 6], [25, 0x56, 38, 10, 4, 4], [26, 0x56, 22, 6, 4, 4], [37, 0x5C, 200, 1, 0, 4], [58, 2, 12, 3, 4, 6]]) {
            const d = assertExists(definitions.get(id));
            assert(d.flags === flags && d.lifetime === lifetime && d.motionTable === 0 && d.frameTicks === frameTicks && d.maxFrame === maxFrame && d.renderGroup === group, `Unsupported particle definition ${id}`);
        }
        this.waterPrimaryRgb = dat.waterPrimColor.slice(0, 3);
        this.waterPrimary = packParticleColor(...this.waterPrimaryRgb as [number, number, number]) | 1;
        this.waterEnvironment = packParticleColor(...dat.waterEnvColor.slice(0, 3) as [number, number, number]) | 1;
    }

    public advanceTo(tick: number): void {
        tick = Math.max(0, Math.floor(tick));
        this.programs?.advanceTo(tick);
        if (tick === this.lastTick) return;
        this.lastTick = tick;
        this.particles.length = 0;
        // Include the longest parent plus its seventeen-tick ripple, regardless of seek distance.
        for (let birth = Math.max(1, tick - 216); birth <= tick; birth++) {
            this.emitters.forEach((emitter, emitterIndex) => {
                if (emitter.initial.particleId === 122 && tick - birth >= 38) return;
                const count = persistentEmissionCount(emitter.initial, birth);
                for (let ordinal = 0; ordinal < count; ordinal++) {
                    const seed = (Math.imul(emitter.placementIndex + 1, 0x9E3779B1) ^ Math.imul(birth, 0x85EBCA6B) ^ Math.imul(ordinal + 1, 0xC2B2AE35)) >>> 0;
                    const { particle: p, random } = spawnScriptParticle(emitter, emitterIndex, this.definitions, this.map, seed);
                    this.sampleBirth({ particle: p, random }, birth, tick);
                }
            });
        }
        // Source slots are overwritten by later births; retain recent particles under saturation.
        if (this.particles.length > 255) this.particles.splice(0, this.particles.length - 255);
    }

    public sampleBirth({ particle: p, random }: ReturnType<typeof spawnScriptParticle>, birth: number, tick: number): void {
        for (let step = birth; step <= tick && p.remaining !== 0; step++) {
            const d = assertExists(this.definitions.get(p.id)), flags = d.flags;
            p.remaining--;
            if ((flags & 2) && p.remaining % d.frameTicks === d.frameTicks - 1) p.frame = Math.min(d.maxFrame, p.frame + 1);
            if (flags & 0x10) {
                if ((flags & 8) && p.vy > -12 * 65536) p.vy -= 25000;
                if (flags & 0x40) {
                    if (p.vx > 0) p.vx -= 5536; if (p.vx < 0) p.vx += 5536;
                    if (p.vz > 0) p.vz -= 5536; if (p.vz < 0) p.vz += 5536;
                }
                const s = sampleParticleSurfaces(this.map, p.x / 65536, p.z / 65536);
                if (s === null) break;
                if (Math.floor(p.y / 65536) < s.ground || Math.floor(p.y / 65536) < s.water || (p.aboveUpper && p.y / 65536 < s.upper)) {
                    if (flags & 0x80) p.remaining = 0;
                    else {
                        p.vy = Math.trunc(p.vy / -2); p.size >>= 1;
                        if (p.vy < 32000) p.remaining = 0;
                    }
                }
                if (flags & 4) { p.x += p.vx; p.z += p.vz; p.y += p.vy; }
            }
            const drawSize = p.size;
            p.lodFraction = Math.floor(256 / d.frameTicks) * (d.frameTicks - p.remaining % d.frameTicks - 1);
            if (p.id === 25 || p.id === 26) {
                p.texture0 = SCRIPT_PARTICLE_TEXTURE_BASE + p.frame; p.texture1 = p.texture0 + 1;
                if (p.size < p.targetSize) p.size += random.mask(8) + 3;
            } else if (p.id === 24) {
                p.texture0 = p.texture1 = SCRIPT_PARTICLE_TEXTURE_BASE + 6;
                const s = sampleParticleSurfaces(this.map, p.x / 65536, p.z / 65536);
                if (s === null) break;
                const impact = Math.floor(p.y / 65536) + 18 < s.ground || (p.aboveUpper && p.y / 65536 < s.upper);
                if (Math.floor(p.y / 65536) < s.water) {
                    p.y = s.water * 65536; p.remaining = 0;
                    this.addRipple(p, tick - step);
                }
                else if (impact) {
                    p.remaining = 0;
                    this.addImpact(p, s.ground + 8, tick - step);
                }
            } else if (p.id === 37) {
                p.texture0 = p.texture1 = SCRIPT_PARTICLE_TEXTURE_BASE + 15;
            } else {
                p.texture0 = SCRIPT_PARTICLE_TEXTURE_BASE + 7 + p.frame; p.texture1 = p.texture0 + 1;
            }
            if (step === tick) this.particles.push({ ...p, size: drawSize });
        }
    }

    private addImpact(parent: ScriptParticle, y: number, age: number): void {
        const d = assertExists(this.definitions.get(58));
        if (age >= d.lifetime) return;
        const remaining = d.lifetime - age - 1;
        let frame = 0;
        for (let step = 0; step <= age; step++) if ((d.lifetime - step - 1) % d.frameTicks === d.frameTicks - 1) frame++;
        frame = Math.min(d.maxFrame, frame);
        this.particles.push({ ...parent, id: 58, y: y * 65536, x: Math.floor(parent.x / 65536) * 65536, z: Math.floor(parent.z / 65536) * 65536, size: 18, remaining, frame, lodFraction: Math.floor(256 / d.frameTicks) * (d.frameTicks - remaining % d.frameTicks - 1), texture0: SCRIPT_PARTICLE_TEXTURE_BASE + 7 + frame, texture1: SCRIPT_PARTICLE_TEXTURE_BASE + 8 + frame, primaryColor: this.waterPrimary || d.primaryColor, environmentColor: this.waterEnvironment || d.environmentColor, primaryAlpha: 255, environmentAlpha: 255 });
    }

    private addRipple(parent: ScriptParticle, age: number): void {
        if (age > 16) return;
        let x = Math.floor(parent.x / 65536), z = Math.floor(parent.z / 65536), y = parent.y / 65536;
        for (let step = 0; step <= age; step++) {
            const surface = sampleParticleSurfaces(this.map, x, z);
            if (surface === null) return;
            y = surface.water;
            const cell = this.map[(Math.floor(x / 64) - 4) * MAP_Z_POINTS + Math.floor(z / 64) - 8];
            const flow = (v: number) => (v & 7) * (1 - ((v & 8) >> 2));
            x += flow(cell.unk7 >>> 4); z += flow(cell.unk7);
        }
        const color = packParticleColor(...this.waterPrimaryRgb.map(v => Math.floor((v + 511) / 3)) as [number, number, number]) | 1;
        const d = assertExists(this.definitions.get(19)), size = 8 + age * 2;
        this.particles.push({ ...parent, id: 19, x: x * 65536, z: z * 65536, y: y * 65536, size, remaining: size + 2 > 40 ? 0 : d.lifetime - age - 1, frame: 0, lodFraction: size * 6, texture0: SCRIPT_PARTICLE_TEXTURE_BASE + 13, texture1: SCRIPT_PARTICLE_TEXTURE_BASE + 14, primaryColor: color || d.primaryColor, environmentColor: color || d.environmentColor, primaryAlpha: 255, environmentAlpha: 255, surfaceAligned: true });
    }
}
