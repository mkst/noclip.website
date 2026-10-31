import { mat4, vec3 } from 'gl-matrix';
import type { RSPSharedOutput } from '../BanjoKazooie/f3dex.js';
import type { StaticAnimalBuild } from './animal_renderer.js';
import { computeAnimalPlacementMatrix } from './animal_matrix.js';
import { buildAnimalMarkers, isAnimalMarkerVisible } from './animals.js';
import type { AnimalMarker, AnimalMarkerMode } from './animals.js';
import { createAnimalSpawnMarkers, readAbsoluteAnimalSpawns } from './animal_spawns.js';
import { LiveAnimalSpawnRuntime } from './live_animal_spawns.js';
import { SSSVDrawCall, SSSVLayer } from './terrain.js';

export class LiveAnimalSpawnVisuals {
    public readonly drawCalls: SSSVDrawCall[] = [];
    private readonly bindings;
    private shownMarkers: AnimalMarker[] = [];
    constructor(public readonly runtime: LiveAnimalSpawnRuntime, output: RSPSharedOutput, builds: readonly StaticAnimalBuild[]) {
        const spawns = readAbsoluteAnimalSpawns(runtime.config.commands), markers = createAnimalSpawnMarkers(spawns, runtime.config.map);
        this.bindings = spawns.map((spawn, index) => {
            const build = builds.find(b => b.spawnCommandIndex === spawn.commandIndex), marker = markers[index];
            marker.label = marker.label.replace('SPAWN PREVIEW:', 'SCRIPTED:');
            const body = (build?.drawCalls ?? []).map(original => {
                const call = Object.assign(new SSSVDrawCall(), original);
                call.center = vec3.clone(original.center); call.modelMatrix = mat4.create(); call.layer = SSSVLayer.LiveAnimals; call.visible = false;
                this.drawCalls.push(call); return { call, center: vec3.clone(original.center) };
            });
            const markerDraws = buildAnimalMarkers(output, [marker], build ? new Set([marker.placementIndex]) : new Set());
            for (const call of markerDraws) { call.layer = SSSVLayer.LiveAnimalMarkers; call.modelMatrix = mat4.create(); call.visible = false; this.drawCalls.push(call); }
            const baseline = mat4.create(), scales = build?.recipe.pose.sample.scaleInputs.outerMatrixAxis16_16 ?? [65536, 65536, 65536];
            const transform = { x: spawn.placement.x, z: spawn.placement.z, y: build?.resolvedY ?? marker.position[1] - 24,
                heading: spawn.placement.rotation, scaleX: scales[0], scaleZ: scales[2], scaleY: scales[1], roll: 0 as const, rollScale: 0 as const };
            computeAnimalPlacementMatrix(baseline, transform); mat4.invert(baseline, baseline);
            return { commandIndex: spawn.commandIndex, body, marker, markerDraws, inverseBaseline: baseline, transform,
                markerPosition: vec3.clone(marker.position), labelPosition: vec3.clone(marker.labelPosition) };
        });
    }
    public get activeMarkers(): readonly AnimalMarker[] { return this.shownMarkers; }
    public update(animalsEnabled: boolean, markerMode: AnimalMarkerMode): void {
        this.shownMarkers = [];
        const instances = new Map([...this.runtime.world.animals.values()].map(a => [a.commandIndex, a]));
        for (const binding of this.bindings) {
            const animal = instances.get(binding.commandIndex), active = this.runtime.enabled && animal !== undefined;
            for (const { call } of binding.body) call.visible = active && animalsEnabled;
            for (const call of binding.markerDraws) call.visible = active && isAnimalMarkerVisible(markerMode, binding.marker.hasModel, animalsEnabled);
            if (!active) continue;
            const p = animal.placement, matrix = mat4.create();
            computeAnimalPlacementMatrix(matrix, { ...binding.transform, x: p.x, y: p.y, z: p.z, heading: p.rotation });
            mat4.mul(matrix, matrix, binding.inverseBaseline);
            for (const { call, center } of binding.body) { mat4.copy(call.modelMatrix!, matrix); vec3.transformMat4(call.center, center, matrix); }
            for (const call of binding.markerDraws) mat4.copy(call.modelMatrix!, matrix);
            vec3.transformMat4(binding.marker.position, binding.markerPosition, matrix);
            vec3.transformMat4(binding.marker.labelPosition, binding.labelPosition, matrix);
            if (isAnimalMarkerVisible(markerMode, binding.marker.hasModel, animalsEnabled)) this.shownMarkers.push(binding.marker);
        }
    }
}
