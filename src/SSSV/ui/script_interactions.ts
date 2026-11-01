import type { ObjectCommandRuntime } from '../objects/object_commands.js';
import type { EmitterCommandRuntime } from '../effects/emitter_commands.js';
import type { BoulderEventVisuals } from '../effects/level_event_renderer.js';
import { appendButton, appendStatus, appendToggle, createFeatureInteraction } from './interaction_controls.js';
import type { FeatureInteraction } from './interaction_controls.js';

export function createObjectInteractions(runtime: ObjectCommandRuntime): FeatureInteraction {
    return createFeatureInteraction([], parent => {
        if (runtime.configs.some(c => c.kind === 'autonomous-motion'))
            appendToggle(parent, 'Enable Autonomous Object Motion', runtime.autonomousEnabled, enabled => runtime.setAutonomousEnabled(enabled));
        appendButton(parent, 'Reset Scripted Props', () => runtime.reset());
        return appendStatus(parent);
    }, () => {
        const errors = runtime.entries.flatMap(e => e.vm.diagnostic ? [`Object ${e.config.placementIndex}: ${e.vm.diagnostic.reason}`] : []);
        const computerPreview = runtime.configs.some(c => c.placement.id === 107) ? ' Computer displays preview their undamaged state.' : '';
        const count = runtime.entries.filter(e => e.config.kind !== 'autonomous-motion' || runtime.autonomousEnabled).length;
        return errors.length ? errors.join('; ') : `${count} scripted props active.${computerPreview}`;
    });
}

export function createEmitterInteractions(runtime: EmitterCommandRuntime): FeatureInteraction {
    return createFeatureInteraction([], parent => appendStatus(parent), () => {
        const errors = runtime.programs.flatMap(p => p.vm.diagnostic ? [`Object ${p.emitter.placementIndex}: ${p.vm.diagnostic.reason}`] : []);
        return errors.length ? `Emitter stopped: ${errors.join('; ')}` : '';
    });
}

export function appendLevelEventToggle(parent: HTMLElement, visual: BoulderEventVisuals): void {
    const enabled = appendToggle(parent, 'Enable Scripted Level Events', visual.simulation.enabled, enabled => visual.setEnabled(enabled));
    enabled.elem.title = visual.simulation.config.region === null
        ? 'JUNGLE_DOLDRUMS launchers run their autonomous spawn cycles.'
        : 'ROCKY_HARD_PLACE boulders activate when the camera enters the original player trigger region.';
}

export function createEventInteractions(visual: BoulderEventVisuals): FeatureInteraction {
    return createFeatureInteraction([], parent => appendStatus(parent), () => {
        const diagnostics = visual.simulation.commands.diagnostics;
        return diagnostics.length ? `Level event stopped: ${diagnostics.map(d => `${d.id} C${d.commandIndex}: ${d.reason}`).join('; ')}` : '';
    });
}
