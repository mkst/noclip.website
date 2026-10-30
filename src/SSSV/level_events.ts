import { sinDegrees } from "./degree_math.js";
import ArrayBufferSlice from "../ArrayBufferSlice.js";
import type { LevelMapEntry, LevelObjectPlacement } from "./level.js";
import type { LevelCommand } from "./paths.js";
import type { ParticleDefinition } from "./particle_assets.js";
import { LEVEL_EVENT_TEXTURE_BASE, LEVEL_EVENT_TEXTURE_OFFSETS } from "./particle_assets.js";
import { persistentEmissionCount } from "./particle_emitters.js";
import type { PersistentEmitter } from "./particle_emitters.js";
import { sampleParticleSurfaces } from "./particles.js";
import { spawnScriptParticle } from "./script_particles.js";
import type { ScriptParticle } from "./script_particles.js";
import { assertExists } from "../util.js";

const rockyScript = [
    "0003000010060000ffff", "003d7f84002800320071", "00067f7f000000000000", "00100200000000000a00",
    "00140007000000000000", "00330014000000000000", "00360400000000000000", "000e00ad000000000000",
    "00140000000000000000", "0008ffff000000000000", "00321001001400000000", "00150000000000000000",
    "00160000000000000000", "00170089170324000000", "00000000000000000000", "00150000000000000000",
    "00163f00080000000000", "00170089041619000000", "0002040006000000000c", "00060001000000000000",
    "003d7f88005000640910", "000111007f8808000008", "00080008000000000000", "005b000a000000000000",
    "0031001400c800000000", "00130000000000000000", "00090000000000000000",
];

const jungleTimedScript = [
    "003d7f84006400320071", "00067f7f000000000000", "00321001000000000004", "001002000000003c4600",
    "00140007000000000000", "003d7f840bd304000971", "00330014000000000000", "000e0011000000000000",
    "00140000000000000000", "0008ffff000000000000", "00150000000000000000", "00163f00080000000000",
    "00170009011620000000", "003d7f84001400140071", "00067f7f000000000000", "00310002000000000000",
    "00180000450000000000", "00480295000000000000", "000115007fd2012c000a", "0026004b3e807fff0100",
    "004700061e1e00000000", "00130000000000000000", "00090000000000000000",
];
const jungleContactScript = [
    "00067f7f000000000000", "00100200000000383300", "00140007000000000000", "003d0001000000001200",
    "003d10000bd304000901", "00330014000000000000", "000e00fb000000000000", "00140000000000000000",
    "0008ffff000000000000", "005b000d000000000000", "002600461e007fff0100", "00150000000000000000",
    "00163f00080000000000", "00170009011620000000", "000304000a000000ffff", "00130000000000000000",
    "00090000000000000000",
];

function matchesRecords(commands: readonly LevelCommand[], base: number, records: readonly string[]): boolean {
    return records.every((expected, i) => {
        const command = commands[base + i];
        return command !== undefined && Array.from(command.raw.createTypedArray(Uint8Array)).map(b => b.toString(16).padStart(2, "0")).join("") === expected;
    });
}


export function jungleLaunchVelocity(pitch: number, heading: number, speed: number): [number, number, number] {
    const horizontal = (speed * 256 * sinDegrees(pitch + 90)) >> 8;
    return [((horizontal * sinDegrees(heading)) >> 8) * 256,
        ((horizontal * sinDegrees(heading + 90)) >> 8) * 256,
        ((speed * 256 * sinDegrees(pitch)) >> 8) * 256];
}

export interface EventRegion {
    x0: number; z0: number; y0: number;
    x1: number; z1: number; y1: number;
}

export interface BoulderEventConfig {
    spawners: { placementIndex: number; placement: LevelObjectPlacement; interval?: number }[];
    region: EventRegion | null;
    scriptBase: number;
    kind?: "jungle";
}

export function readBoulderEvent(placements: readonly LevelObjectPlacement[], commands: readonly LevelCommand[], ranges: ArrayBufferSlice | null): BoulderEventConfig | null {
    const jungleSpawners: BoulderEventConfig["spawners"] = [];
    const timed = matchesRecords(commands, 7, jungleTimedScript);
    const contact = matchesRecords(commands, 242, jungleContactScript);
    placements.forEach((placement, placementIndex) => {
        if (placement.id !== 64 || placement.commandReferenceIdx <= 0 || placement.commandsLength !== 0) return;
        const base = placement.commandReferenceIdx - 1;
        if (timed && base === 7 && placement.zRotation === 0) {
            jungleSpawners.push({ placementIndex, placement });
        } else if (contact && commands[base]?.opcode === 0x3D && commands[base + 1]?.opcode === 0x0E) {
            const setup = commands[base].payload.createDataView(), handoff = commands[base + 1].payload.createDataView();
            const interval = setup.getInt16(0);
            if (interval > 0 && interval < 0x7F7F && setup.getUint32(2) === 0 && setup.getUint16(6) === 0
                && handoff.getUint16(0) === 242 && handoff.getUint32(2) === 0 && handoff.getUint16(6) === 0)
                jungleSpawners.push({ placementIndex, placement, interval });
        }
    });
    if (jungleSpawners.length !== 0)
        return { spawners: jungleSpawners, region: null, scriptBase: 7, kind: "jungle" };
    const spawners: BoulderEventConfig["spawners"] = [];
    let scriptBase = -1;
    placements.forEach((placement, placementIndex) => {
        if (placement.id !== 64 || placement.commandReferenceIdx <= 0 || placement.commandsLength !== 0 || placement.zRotation !== 0)
            return;
        const base = placement.commandReferenceIdx - 1;
        if (!matchesRecords(commands, base, rockyScript)) return;
        // The script's handoff operand is an absolute bank index.
        if (commands[base + 7].payload.createDataView().getUint16(0) !== base + 10)
            return;
        spawners.push({ placementIndex, placement });
        scriptBase = base;
    });
    if (spawners.length === 0 || ranges === null || ranges.byteLength < 2)
        return null;
    const view = ranges.createDataView(), count = view.getUint16(0);
    if (ranges.byteLength !== 2 + count * 8 || count <= 6)
        return null;
    const offset = 2 + 6 * 8;
    const region = { x0: view.getUint8(offset), z0: view.getUint8(offset + 1), y0: view.getUint8(offset + 2),
        x1: view.getUint8(offset + 3), z1: view.getUint8(offset + 4), y1: view.getUint8(offset + 5) };
    // Camera triggering cannot supply the player's upper/lower-surface state.
    return region.y0 === 240 ? { spawners, region, scriptBase } : null;
}

export function cameraInEventRegion(region: EventRegion, x: number, z: number): boolean {
    const tx = Math.floor(x / 64), tz = Math.floor(z / 64);
    return tx >= region.x0 && tx <= region.x1 && tz >= region.z0 && tz <= region.z1;
}

export interface EventBoulder {
    slot: number;
    sourceIndex: number;
    x: number; z: number; y: number;
    vx: number; vz: number; vy: number;
    scale: number;
    heading: number;
    age: number;
    pitch?: number;
    expiresAfter?: number;
}

export interface BoulderImpact {
    x: number; z: number; y: number;
    age: number;
    size?: number;
}

export class BoulderEventSimulation {
    public enabled = false;
    public readonly boulders: EventBoulder[] = [];
    public readonly impacts: BoulderImpact[] = [];
    public readonly particles: ScriptParticle[] = [];
    public readonly textureIds = LEVEL_EVENT_TEXTURE_OFFSETS.map((_, i) => LEVEL_EVENT_TEXTURE_BASE + i);
    public spawnCount = 0;
    public impactCount = 0;
    public expirationCount = 0;
    private lastTick: number | null = null;
    private randomState = 0x524F434B;
    private delays: number[] = [];
    private headings: number[] = [];
    private rotating: boolean[] = [];

    constructor(public readonly config: BoulderEventConfig, private map: readonly LevelMapEntry[], private definitions: ReadonlyMap<number, ParticleDefinition>, public readonly bodyHeight: number, private bodyWidth: number, private debrisColor: number) {
        this.reset();
    }

    public setEnabled(enabled: boolean): void {
        if (enabled === this.enabled) return;
        this.enabled = enabled;
        this.reset();
    }

    private reset(): void {
        this.lastTick = null;
        this.randomState = 0x524F434B;
        this.delays = this.config.spawners.map(() => 0);
        this.headings = this.config.spawners.map(source => source.placement.angle);
        this.rotating = this.config.spawners.map(() => false);
        this.boulders.length = this.impacts.length = this.particles.length = 0;
        this.spawnCount = this.impactCount = this.expirationCount = 0;
    }

    private random(n: number): number {
        let value = this.randomState;
        value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
        this.randomState = value >>> 0;
        return this.randomState % n;
    }

    public advanceTo(tick: number, cameraX: number, cameraZ: number): void {
        if (!this.enabled) return;
        tick = Math.max(0, Math.floor(tick));
        // A seek has no recorded camera history; begin a new preview at that time.
        if (this.lastTick !== null && (tick < this.lastTick || tick - this.lastTick > 900))
            this.reset();
        if (this.lastTick === null) { this.lastTick = tick; return; }
        const active = this.config.region === null || cameraInEventRegion(this.config.region, cameraX, cameraZ);
        while (this.lastTick < tick) {
            this.lastTick++;
            this.step(active);
        }
    }

    private step(active: boolean): void {
        for (let i = this.impacts.length - 1; i >= 0; i--)
            if (++this.impacts[i].age >= 16) this.impacts.splice(i, 1);
        for (let i = this.particles.length - 1; i >= 0; i--)
            if (!this.advanceParticle(this.particles[i])) this.particles.splice(i, 1);
        for (let i = this.boulders.length - 1; i >= 0; i--) {
            const boulder = this.boulders[i];
            const previousY = boulder.y / 65536;
            boulder.age++;
            if (this.config.kind !== "jungle" && boulder.scale < 2048) boulder.scale += 80;
            boulder.vy -= 0x20000;
            boulder.x += boulder.vx; boulder.z += boulder.vz; boulder.y += boulder.vy;
            if (boulder.expiresAfter !== undefined && boulder.age >= boulder.expiresAfter) {
                this.expirationCount++;
                this.boulders.splice(i, 1);
                continue;
            }
            const surface = sampleParticleSurfaces(this.map, boulder.x / 65536, boulder.z / 65536);
            if (surface === null || boulder.age > 240) { this.boulders.splice(i, 1); continue; }
            let floor = surface.ground;
            if (Number.isFinite(surface.upper) && previousY >= surface.upper)
                floor = Math.max(floor, surface.upper);
            if (this.config.kind === "jungle" && boulder.expiresAfter === undefined && previousY >= surface.water)
                floor = Math.max(floor, surface.water);
            if (boulder.y / 65536 <= floor && boulder.vy <= 0) {
                boulder.y = floor * 65536;
                if (boulder.expiresAfter !== undefined) boulder.vy = 0;
                else {
                    this.impact(boulder);
                    this.boulders.splice(i, 1);
                    continue;
                }
            }
            const count = persistentEmissionCount({ flags: 9, frequency: 2 }, boulder.age);
            for (let ordinal = 0; ordinal < count; ordinal++) this.emitTrail(boulder);
        }
        this.config.spawners.forEach((source, sourceIndex) => {
            if (this.delays[sourceIndex] > 0) {
                if (--this.delays[sourceIndex] === 0) {
                    this.spawn(sourceIndex);
                    if (active) this.delays[sourceIndex] = this.nextDelay(sourceIndex);
                }
            } else if (active) this.delays[sourceIndex] = this.nextDelay(sourceIndex);
            if (this.rotating[sourceIndex]) this.headings[sourceIndex] = (this.headings[sourceIndex] + 4) % 360;
        });
        if (this.particles.length > 255) this.particles.splice(0, this.particles.length - 255);
    }

    private nextDelay(sourceIndex: number): number {
        if (this.config.kind === "jungle") return this.config.spawners[sourceIndex].interval ?? this.random(100) + 50;
        return this.random(40) + 50;
    }

    private spawn(sourceIndex: number): void {
        const used = new Set(this.boulders.map(b => b.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        if (slot >= 20) return;
        const placement = this.config.spawners[sourceIndex].placement;
        if (this.config.kind === "jungle") {
            const interval = this.config.spawners[sourceIndex].interval;
            const pitch = (placement.zRotation + ((interval === undefined ? 60 : 56) * 360 >> 8)) % 360;
            const heading = this.headings[sourceIndex];
            const [vx, vz, vy] = jungleLaunchVelocity(pitch, heading, interval === undefined ? 70 : 51);
            const surface = sampleParticleSurfaces(this.map, placement.x, placement.z);
            const y = Math.max(placement.y, surface?.ground ?? placement.y);
            this.boulders.push({ slot, sourceIndex, x: placement.x * 65536, z: placement.z * 65536, y: y * 65536, vx, vz, vy,
                scale: interval === undefined ? this.random(3027) + 1024 : 4096, heading, pitch, age: 0,
                expiresAfter: interval === undefined ? this.random(20) + 20 : undefined });
            if (interval === undefined) this.rotating[sourceIndex] = true;
            this.spawnCount++;
            return;
        }
        const yaw = placement.angle * Math.PI / 180;
        this.boulders.push({ slot, sourceIndex, x: placement.x * 65536, z: placement.z * 65536, y: placement.y * 65536,
            vx: Math.trunc(Math.sin(yaw) * 256) * 2560, vz: Math.trunc(Math.cos(yaw) * 256) * 2560, vy: 0,
            scale: 1024, heading: placement.angle, age: 0 });
        this.spawnCount++;
    }

    private emitTrail(b: EventBoulder): void {
        const source = this.config.spawners[b.sourceIndex];
        const emitter: PersistentEmitter = {
            placementIndex: source.placementIndex, placement: { ...source.placement, x: b.x >> 16, z: b.z >> 16, y: b.y >> 16 },
            scale: b.scale, height: Math.floor(this.bodyHeight * b.scale / 2048),
            initial: { flags: this.config.kind === "jungle" ? 9 : 0x89, particleId: this.config.kind === "jungle" ? 1 : 4,
                frequency: 2, size: this.config.kind === "jungle" ? 32 : 25, argument: 0, duration: 0,
                offset: [0, 0, 0], spread: [0, 0, 0], direction: [63, 0, 8], directionSpread: [0, 0, 0], primaryColor: 0, environmentColor: 0 },
            provenance: { placementIndex: source.placementIndex, initialEntry: source.placement.commandReferenceIdx - 1, target: { kind: "object", index: source.placementIndex }, commandIndices: [], unsupportedReason: null },
        };
        const { particle } = spawnScriptParticle(emitter, b.sourceIndex, this.definitions, this.map, this.random(0x7FFFFFFF));
        particle.primaryAlpha = 255; particle.environmentAlpha = 55;
        this.setParticleTexture(particle);
        this.particles.push(particle);
    }

    private impact(b: EventBoulder): void {
        const x = b.x >> 16, z = b.z >> 16, y = (b.y >> 16) + Math.floor(this.bodyHeight * b.scale / 4096);
        if (this.config.kind === "jungle") {
            this.jungleImpact(x, z, y, Math.floor(this.bodyWidth * b.scale / 8192));
            return;
        }
        if (this.impacts.length < 10) this.impacts.push({ x, z, y, age: 0 });
        this.impactCount++;
        const radius = Math.max(2, Math.floor(this.bodyWidth * b.scale / 2048));
        const category = radius <= 16 ? 0 : radius <= 32 ? 1 : 2;
        const groups = this.random(2) + category + 1;
        const spread = Math.min(24, Math.max(4, Math.floor(radius / 4)));
        this.addParticle(0, x, z, y, 0, 0, 0, this.random(16) + category * 40 + 20);
        for (let i = 0; i < groups; i++) {
            const count = 2 + (category > 0 ? 1 : 0) + (category >= 2 ? 1 : 0);
            for (let j = 0; j < count; j++) {
                const angle = (this.random(90) + Math.floor(360 / groups) * i) * Math.PI / 180;
                const vx = Math.trunc(Math.sin(angle) * 256) * spread * 128;
                const vz = Math.trunc(Math.cos(angle) * 256) * spread * 128;
                this.addParticle(71 + this.random(6), x, z, y + 20, vx, vz, this.random(32768) * 4 + 5 * 65536,
                    this.random(32) + category * (j === 0 ? 10 : 15));
            }
        }
    }

    private jungleImpact(x: number, z: number, y: number, radius: number): void {
        this.impactCount++;
        if (this.impacts.length < 10) this.impacts.push({ x, z, y, age: 0, size: 100 });
        radius = Math.max(2, radius);
        const category = radius <= 16 ? 0 : radius <= 32 ? 1 : 2;
        const groups = this.random(2) + category + 1, spread = Math.min(24, Math.max(4, Math.floor(radius / 4)));
        this.addParticle(0, x, z, y, 0, 0, 0, this.random(16) + category * 40 + 20);
        for (let i = 0; i < groups; i++) {
            for (let j = 0; j < 6; j++) {
                const angle = this.random(90) + Math.floor(360 / groups) * i;
                const p = this.addParticle(40, x, z, y + 20, sinDegrees(angle) * spread * 256, sinDegrees(angle + 90) * spread * 256,
                    this.random(32768) * 4 + 5 * 65536, this.random(8) + 2);
                p.primaryColor = p.environmentColor = ((this.random(128) + 100) << 8 & 0xF800) | (this.random(64) << 3 & 0x7C0) | (this.random(64) >> 2 & 0x3E);
            }
        }
    }

    private addParticle(id: number, x: number, z: number, y: number, vx: number, vz: number, vy: number, size: number): ScriptParticle {
        const d = assertExists(this.definitions.get(id));
        const surface = sampleParticleSurfaces(this.map, x, z);
        const p: ScriptParticle = { id, emitterIndex: -1, x: x * 65536, z: z * 65536, y: y * 65536, vx, vz, vy,
            size: size || d.defaultSize, targetSize: 0, remaining: d.lifetime, frame: 0, lodFraction: 0,
            aboveUpper: surface !== null && y > surface.upper, texture0: 0, texture1: 0,
            primaryColor: d.primaryColor, environmentColor: d.environmentColor, primaryAlpha: 255, environmentAlpha: id === 0 ? 55 : 255 };
        this.setParticleTexture(p);
        if (id >= 71) {
            p.primaryColor = this.debrisColor;
            p.environmentColor = ((this.debrisColor & 0x3E) >> 2) & 0x3E
                | (((this.debrisColor & 0x7C0) >> 7) << 5) & 0x7C0
                | (((this.debrisColor & 0xF800) >> 12) << 10) & 0xF800;
        }
        this.particles.push(p);
        return p;
    }

    private setParticleTexture(p: ScriptParticle): void {
        const d = assertExists(this.definitions.get(p.id));
        p.textureSize = p.id <= 4 ? 32 : 16;
        const base = p.id === 4 ? 0 : p.id <= 1 ? 9 : p.id === 40 ? 29 : p.id === 20 ? 30 : p.id < 74 ? 18 : 24;
        p.texture0 = LEVEL_EVENT_TEXTURE_BASE + base + p.frame;
        p.texture1 = LEVEL_EVENT_TEXTURE_BASE + base + Math.min(p.frame + 1, d.maxFrame + (p.id === 20 || p.id >= 71 ? 1 : 0));
        if (p.id === 40) p.texture1 = p.texture0;
    }

    private advanceParticle(p: ScriptParticle): boolean {
        const d = assertExists(this.definitions.get(p.id));
        if (--p.remaining < 0) return false;
        if ((d.flags & 2) && p.remaining % d.frameTicks === d.frameTicks - 1) p.frame++;
        if (p.id >= 71 && p.frame >= d.maxFrame) return false;
        p.frame = Math.min(p.frame, d.maxFrame);
        if (d.flags & 0x10) {
            if ((d.flags & 8) && p.vy > -12 * 65536) p.vy -= 25000;
            if (d.flags & 0x40) {
                if (p.vx > 0) p.vx -= 5536; if (p.vx < 0) p.vx += 5536;
                if (p.vz > 0) p.vz -= 5536; if (p.vz < 0) p.vz += 5536;
            }
            const surface = sampleParticleSurfaces(this.map, p.x / 65536, p.z / 65536);
            if (surface === null || p.y / 65536 < surface.ground || (p.aboveUpper && p.y / 65536 < surface.upper)) return false;
            if (d.flags & 4) { p.x += p.vx; p.z += p.vz; p.y += p.vy; }
        }
        p.lodFraction = Math.floor(256 / d.frameTicks) * (d.frameTicks - p.remaining % d.frameTicks - 1);
        if (p.id === 40 && this.random(4) === 0) {
            const smoke = this.addParticle(20, p.x >> 16, p.z >> 16, p.y >> 16, 0, 0, 0, p.size);
            smoke.primaryColor = 0xCE73; smoke.environmentColor = 0x6319;
            smoke.primaryAlpha = 200; smoke.environmentAlpha = 0;
        }
        this.setParticleTexture(p);
        return true;
    }
}
