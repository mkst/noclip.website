import type { ReadonlyMat4 } from "gl-matrix";
import type { LevelDat, LevelMapEntry } from "./level.js";
import { MAP_Z_POINTS, mirrorZ } from "./level.js";
import { RainButtonRuntime } from "./buttons.js";
import type { RainButtonConfig } from "./buttons.js";
import { packParticleColor } from "./particle_emitters.js";
import { SCRIPT_PARTICLE_TEXTURE_BASE } from "./particle_assets.js";
import { sampleParticleSurfaces } from "./particles.js";
import type { ParticleSprite } from "./script_particles.js";

export const RAIN_TEXTURE_ID = 786;
interface RainParticle extends ParticleSprite { id: number; remaining: number; aboveUpper: boolean; frame: number; }
export interface RainCamera { worldMatrix: ReadonlyMat4; fovY: number; }

export class RainSimulation {
    public readonly button: RainButtonRuntime;
    public particles: RainParticle[] = [];
    public readonly textureIds = [RAIN_TEXTURE_ID, ...Array.from({ length: 8 }, (_, i) => SCRIPT_PARTICLE_TEXTURE_BASE + 7 + i)];
    public impactCount = 0;
    private lastTick: number | null = null;
    private seed = 1;
    private primary: number;
    private environment: number;
    private bright: number;

    constructor(config: RainButtonConfig, private map: readonly LevelMapEntry[], dat: Pick<LevelDat, "waterPrimColor" | "waterEnvColor">) {
        this.button = new RainButtonRuntime(config);
        const color = (rgb: readonly number[]) => packParticleColor(rgb[0], rgb[1], rgb[2]) | 1;
        this.primary = color(dat.waterPrimColor); this.environment = color(dat.waterEnvColor);
        this.bright = color(dat.waterPrimColor.map(v => Math.floor((v + 511) / 3)));
    }

    public setEnabled(enabled: boolean): void { this.button.setEnabled(enabled); this.clear(); }
    public reset(): void { this.button.reset(); this.clear(); }
    private clear(): void { this.particles.length = 0; this.lastTick = null; this.seed = 1; this.impactCount = 0; }
    private random(n: number): number {
        let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        this.seed = x >>> 0;
        return this.seed % n;
    }

    public spawnDrop(x: number, z: number, y: number): void {
        const surface = sampleParticleSurfaces(this.map, x, z);
        // Source definition 57: flags 0x0C00, size 20, lifetime 1220.
        // It has flag 0x800: do not allocate below an upper surface.
        if (surface === null || y < surface.upper && Number.isFinite(surface.upper)) return;
        this.add({ id: 57, x: Math.trunc(x) * 65536, z: Math.trunc(z) * 65536, y: Math.trunc(y) * 65536, size: 20, remaining: 1220, aboveUpper: y > surface.upper, frame: 0, lodFraction: 0, texture0: RAIN_TEXTURE_ID, texture1: RAIN_TEXTURE_ID, primaryColor: this.primary, environmentColor: this.primary, primaryAlpha: 255, environmentAlpha: 255, vertical: true });
    }

    private add(p: RainParticle): void {
        if (this.particles.length < 255) this.particles.push(p);
    }

    private impact(p: RainParticle, y: number, water: boolean): void {
        this.impactCount++;
        if (water && this.random(2) === 0) return;
        if (water) this.add({ ...p, id: 19, y: y * 65536, size: 8, remaining: 90, frame: 0, vertical: false, surfaceAligned: true, texture0: SCRIPT_PARTICLE_TEXTURE_BASE + 13, texture1: SCRIPT_PARTICLE_TEXTURE_BASE + 14, primaryColor: this.bright, environmentColor: this.bright });
        this.add({ ...p, id: 58, y: (y + (water ? 0 : 8)) * 65536, remaining: 12, frame: 0, vertical: false, surfaceAligned: false, texture0: SCRIPT_PARTICLE_TEXTURE_BASE + 7, texture1: SCRIPT_PARTICLE_TEXTURE_BASE + 8, primaryColor: this.primary, environmentColor: water ? this.primary : this.environment });
    }

    public step(camera: RainCamera): void {
        this.button.step();
        if (this.button.error !== null) { this.particles.length = 0; return; }
        const m = camera.worldMatrix;
        for (let i = 0; i < this.button.rainCount; i++) {
            const distance = this.random(1024), width = Math.trunc(distance * camera.fovY / 128);
            const offset = ((this.random(512) - 256) * width >> 9) * 2;
            this.spawnDrop(m[12] - m[8] * distance + m[0] * offset,
                mirrorZ(m[14] - m[10] * distance + m[2] * offset), m[13] - m[9] * distance + m[1] * offset + width);
        }
        const previous = this.particles;
        this.particles = [];
        for (const p of previous) {
            if (p.remaining-- <= 0) continue;
            const s = sampleParticleSurfaces(this.map, p.x / 65536, p.z / 65536);
            if (s === null) continue;
            if (p.id === 57) {
                const y = p.y / 65536;
                if (y < s.water) { this.impact(p, s.water, true); continue; }
                if (y + 18 < s.ground) { this.impact(p, s.ground, false); continue; }
                if (p.aboveUpper && y < s.upper) { this.impact(p, s.upper, false); continue; }
                p.y -= 14 * 65536;
            } else if (p.id === 58) {
                if (p.remaining % 3 === 2) p.frame = Math.min(4, p.frame + 1);
                p.texture0 = SCRIPT_PARTICLE_TEXTURE_BASE + 7 + p.frame; p.texture1 = p.texture0 + 1;
                p.lodFraction = 85 * (2 - p.remaining % 3);
            } else {
                p.y = s.water * 65536;
                const cell = this.map[(Math.floor(p.x / 65536 / 64) - 4) * MAP_Z_POINTS + Math.floor(p.z / 65536 / 64) - 8];
                const flow = (v: number) => (v & 7) * (1 - ((v & 8) >> 2));
                p.x += flow(cell.unk7 >>> 4) * 65536; p.z += flow(cell.unk7) * 65536;
                p.lodFraction = p.size * 6; p.size += 2;
                if (p.size > 40) p.remaining = 0;
            }
            this.add(p);
        }
    }

    public advanceTo(tick: number, camera: RainCamera): void {
        tick = Math.max(0, Math.floor(tick));
        if (!this.button.enabled) { this.lastTick = tick; return; }
        if (this.lastTick === null) this.lastTick = tick - 1;
        if (tick < this.lastTick || tick - this.lastTick > 900) { this.reset(); this.lastTick = tick; return; }
        while (this.lastTick < tick) { this.step(camera); this.lastTick++; }
    }
}
