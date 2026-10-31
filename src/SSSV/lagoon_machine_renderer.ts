import { mat4, vec3 } from 'gl-matrix';
import { LagoonMachineRuntime, MACHINE_ARMS, MACHINE_LEVERS } from './lagoon_machine.js';
import type { FenceSpan } from './fences.js';
import type { SSSVDrawCall } from './terrain.js';

export class LagoonMachineVisuals {
    private readonly arms;
    private readonly controls;
    private readonly gates;
    constructor(public readonly runtime: LagoonMachineRuntime, calls: readonly SSSVDrawCall[], fences: readonly FenceSpan[]) {
        this.arms = calls.filter(c => (MACHINE_ARMS as readonly number[]).includes(c.objectPlacementIndex!)).map(call => ({ call,
            center: vec3.clone(call.center), matrix: call.modelMatrix, liveMatrix: mat4.create() }));
        this.controls = calls.filter(c => c.objectStateColor && (MACHINE_LEVERS as readonly number[]).includes(c.objectPlacementIndex!))
            .map(call => ({ call, red: call.DP_PrimColor[0] }));
        this.gates = fences.filter(f => [13, 14].includes(f.sourceIndex)).map(fence => ({ fence, enabled: fence.enabled }));
    }
    public update(objectsEnabled: boolean): void {
        const r = this.runtime;
        for (const { call, center, matrix, liveMatrix } of this.arms) {
            const index = call.objectPlacementIndex!, o = r.world.objects.get(`object:${index}`)!, p = r.config.placements[index];
            call.visible = objectsEnabled;
            if (r.enabled) {
                const delta = vec3.fromValues(o.fixedPosition[0] / 65536 - p.x, o.fixedPosition[1] / 65536 - p.y, -(o.fixedPosition[2] / 65536 - p.z));
                mat4.fromTranslation(liveMatrix, delta);
                if (matrix !== null) mat4.mul(liveMatrix, liveMatrix, matrix);
                call.modelMatrix = liveMatrix; vec3.add(call.center, center, delta);
            } else { call.modelMatrix = matrix; vec3.copy(call.center, center); }
        }
        for (const { call, red } of this.controls) {
            const index = call.objectPlacementIndex!;
            call.DP_PrimColor[0] = r.enabled ? r.world.getEntity(`object:${index}`)!.state === 1 ? 1 : 64 / 255 : red;
            if (call.leverLight !== null) call.DP_EnvColor[0] = call.DP_PrimColor[0];
            if (call.leverHandle !== null) call.leverHandle.phase = r.enabled ? r.world.leverPhases.get(index)! : call.leverHandle.initialPhase;
        }
        for (const { fence, enabled } of this.gates) fence.enabled = r.enabled ? r.world.getEntity(`object:${fence.sourceIndex}`)!.state === 1 : enabled;
    }
}
