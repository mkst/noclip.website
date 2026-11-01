import { SINE_TABLE_256 } from "./animal_matrix.js";
import type { StaticAnimalBuild } from "./animal_renderer.js";
import type { LevelDat, LevelMapEntry } from "../core/level.js";
import type { ParticleDefinition } from "../effects/particle_assets.js";
import { SCRIPT_PARTICLE_TEXTURE_BASE } from "../effects/particle_assets.js";
import { sampleParticleSurfaces } from "../effects/particles.js";
import { ParticleRandom, ScriptParticleSimulation } from "../effects/script_particles.js";
import type { ScriptParticle } from "../effects/script_particles.js";
import { assertExists } from "../../util.js";

export function fireFoxSeed(index: number, tick: number): number {
    return (Math.imul(index + 2, 0x9E3779B1) ^ Math.imul(tick + 1, 0x85EBCA6B)) >>> 0;
}

export function sampleFireFoxFlameScale(random: Pick<ParticleRandom, "mask">): [number, number, number] {
    return [0, 1, 2].map(() => ((random.mask(256) << 7) * 58 + 58 * 65536) >> 6) as [number, number, number];
}

export function spawnFireFoxParticles(build: Pick<StaticAnimalBuild, "placement" | "placementIndex" | "resolvedY">, birth: number, definitions: ReadonlyMap<number, ParticleDefinition>, map: readonly LevelMapEntry[]): { particle: ScriptParticle; random: ParticleRandom }[] {
    const { placement: p, placementIndex, resolvedY } = build;
    const random = new ParticleRandom(fireFoxSeed(placementIndex, birth));
    // Consume the tail's three scale draws before its emission calls.
    sampleFireFoxFlameScale(random);
    const sin = SINE_TABLE_256[-p.rotation & 255] >> 7;
    const cos = SINE_TABLE_256[(-p.rotation + 64) & 255] >> 7;
    const x = p.x + (Math.trunc(sin * 1560 / 58) >> 8);
    const z = p.z - (Math.trunc(cos * 1560 / 58) >> 8);
    const y = Math.floor(resolvedY) + 8;
    const surface = sampleParticleSurfaces(map, x, z);
    const spawn = (extra: boolean) => {
        const id = 25 + random.mask(2), d = assertExists(definitions.get(id));
        const vx = random.mask(32768) * 2 - (extra ? 0 : 40000);
        const vz = random.mask(32768) * 2 - (extra ? 0 : 40000);
        const size = random.mask(16) || d.defaultSize, targetSize = random.mask(32) + 25;
        const particle: ScriptParticle = {
            id, emitterIndex: placementIndex, x: x * 65536, z: z * 65536, y: y * 65536,
            vx, vz, vy: 0, size, targetSize, remaining: d.lifetime, frame: 0, lodFraction: 0,
            aboveUpper: surface !== null && y > surface.upper,
            primaryColor: 1, environmentColor: 1, primaryAlpha: 200, environmentAlpha: 0,
            texture0: 0, texture1: 0,
        };
        return { particle, random: random.clone() };
    };
    const result = [spawn(false)];
    if (random.mask(4) === 0) result.push(spawn(true));
    return result;
}

export class FireFoxParticleSimulation extends ScriptParticleSimulation {
    public readonly textureIds = Array.from({ length: 6 }, (_, i) => SCRIPT_PARTICLE_TEXTURE_BASE + i);
    private sampledTick = -1;
    private visibility = "";

    constructor(private builds: readonly StaticAnimalBuild[], definitions: ReadonlyMap<number, ParticleDefinition>, private surfaces: readonly LevelMapEntry[], dat: LevelDat) {
        super([], definitions, surfaces, dat);
    }

    public override advanceTo(tick: number): void {
        tick = Math.max(0, Math.floor(tick));
        const active = this.builds.filter(build => build.drawCalls.some(draw => draw.visible));
        const visibility = active.map(build => build.placementIndex).join(",");
        if (tick === this.sampledTick && visibility === this.visibility) return;
        this.sampledTick = tick;
        this.visibility = visibility;
        this.particles.length = 0;
        for (let birth = Math.max(1, tick - 37); birth <= tick; birth++)
            for (const build of active)
                for (const spawned of spawnFireFoxParticles(build, birth, this.definitions, this.surfaces))
                    this.sampleBirth(spawned, birth, tick);
        if (this.particles.length > 255) this.particles.splice(0, this.particles.length - 255);
    }
}
