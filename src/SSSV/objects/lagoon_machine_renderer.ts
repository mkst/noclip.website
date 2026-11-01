import { LagoonMachineRuntime, MACHINE_ARMS, MACHINE_LEVERS } from './lagoon_machine.js';
import type { FenceSpan } from './fences.js';
import type { SSSVDrawCall } from '../render/terrain.js';
import { LeverVisuals, WorldObjectTranslation } from './object_visuals.js';

export class LagoonMachineVisuals {
    private readonly arms;
    private readonly controls;
    private readonly gates;
    constructor(public readonly runtime: LagoonMachineRuntime, calls: readonly SSSVDrawCall[], fences: readonly FenceSpan[]) {
        this.arms = calls.filter(c => (MACHINE_ARMS as readonly number[]).includes(c.objectPlacementIndex!)).map(call => ({ call,
            translation: new WorldObjectTranslation(call, runtime.config.placements[call.objectPlacementIndex!]) }));
        this.controls = new LeverVisuals(calls.filter(c => (MACHINE_LEVERS as readonly number[]).includes(c.objectPlacementIndex!)));
        this.gates = fences.filter(f => [13, 14].includes(f.sourceIndex)).map(fence => ({ fence, enabled: fence.enabled }));
    }
    public update(objectsEnabled: boolean): void {
        const r = this.runtime;
        for (const { call, translation } of this.arms) {
            const o = r.world.objects.get(`object:${call.objectPlacementIndex}`)!;
            call.visible = objectsEnabled;
            translation.update(r.enabled ? o.fixedPosition : null);
        }
        this.controls.update(index => r.enabled ? { state: r.world.getEntity(`object:${index}`)!.state, phase: r.world.leverPhases.get(index)! } : null);
        for (const { fence, enabled } of this.gates) fence.enabled = r.enabled ? r.world.getEntity(`object:${fence.sourceIndex}`)!.state === 1 : enabled;
    }
}
