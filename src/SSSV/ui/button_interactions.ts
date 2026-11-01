import type { RainSimulation } from '../effects/rain.js';
import type { RainButtonRuntime } from '../objects/buttons.js';
import type { FenceSwitchRuntime } from '../objects/fence_switch.js';
import { appendButton, appendStatus, appendToggle, createFeatureInteraction, focusInteraction } from './interaction_controls.js';
import type { FeatureInteraction, InteractionContext } from './interaction_controls.js';
import { placedControlFocus } from './interaction_targets.js';
import type { InteractionTarget } from './interaction_targets.js';

function createButtonInteractions(control: RainButtonRuntime | FenceSwitchRuntime, name: string,
    setEnabled: (enabled: boolean) => void, reset: () => void, context: InteractionContext, fence: FenceSwitchRuntime | null): FeatureInteraction {
    const target: InteractionTarget = {
        placementIndex: control.config.placementIndex,
        // Busy clicks still capture input; the runtime rejects their activation.
        canPick: () => control.enabled,
        activate: () => control.activate(),
        focus: () => placedControlFocus(control.config.placement),
    };
    let notice: HTMLButtonElement | null = null;
    return createFeatureInteraction([target], parent => {
        const enabled = appendToggle(parent, 'Enable Button Interactions', control.enabled, setEnabled);
        enabled.elem.title = 'Click the supported control in the scene to run its validated script.';
        appendButton(parent, `Go to ${name}`, () => focusInteraction(context.camera(), target.focus!()));
        appendButton(parent, `Activate ${name}`, () => { control.activate(); });
        appendButton(parent, 'Reset', reset);
        if (fence !== null) {
            notice = appendButton(parent, 'Acknowledge Objective Notice', () => fence.acknowledgeMessage());
            notice.style.display = 'none';
            notice.title = "Objective checks use the animals' starting positions; no sheep movement is simulated.";
        }
        return appendStatus(parent, '');
    }, () => control.error ?? (!control.enabled ? 'Disabled'
        : fence?.messagePending ? 'Sheep objective condition met — acknowledge the notice to continue.'
        : control.ready ? fence !== null ? `Fence ${control.state === 1 ? 'on' : 'off'} — ready` : 'Ready — click the lever'
        : fence !== null ? 'Switch busy' : 'Rain cycle running (12 seconds)'),
    () => { if (notice !== null) notice.style.display = fence?.messagePending ? '' : 'none'; });
}

export function createRainInteractions(rain: RainSimulation, context: InteractionContext): FeatureInteraction {
    return createButtonInteractions(rain.button, 'Rain Lever', enabled => rain.setEnabled(enabled), () => rain.reset(), context, null);
}

export function createFenceInteractions(fence: FenceSwitchRuntime, context: InteractionContext): FeatureInteraction {
    return createButtonInteractions(fence, 'Fence Switch', enabled => fence.setEnabled(enabled), () => fence.reset(), context, fence);
}
