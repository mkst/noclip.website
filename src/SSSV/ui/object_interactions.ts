import { mirrorZ } from '../core/level.js';
import type { ElevatorVisuals } from '../objects/elevator_renderer.js';
import type { LagoonMachineVisuals } from '../objects/lagoon_machine_renderer.js';
import { MACHINE_PADS, MACHINE_LEVERS } from '../objects/lagoon_machine.js';
import type { SnowPlatformVisuals } from '../objects/snow_platform_renderer.js';
import { appendButton, appendNote, appendStatus, appendToggle, createFeatureInteraction, focusInteraction } from './interaction_controls.js';
import type { FeatureInteraction, InteractionContext } from './interaction_controls.js';
import { placedControlFocus } from './interaction_targets.js';
import type { InteractionTarget } from './interaction_targets.js';

export function createElevatorInteractions(elevator: ElevatorVisuals, context: InteractionContext): FeatureInteraction {
    return createFeatureInteraction([], parent => {
        appendToggle(parent, "Enable Scripted Elevator", elevator.runtime.enabled, checked => { elevator.runtime.setEnabled(checked); elevator.update(context.objectsEnabled()); });
        appendButton(parent, "Reset Elevator", () => { elevator.runtime.reset(); elevator.update(context.objectsEnabled()); });
        appendButton(parent, "Go to Elevator", () => {
            const p = elevator.runtime.config.placement;
            focusInteraction(context.camera(), { eye: [p.x - 500, p.y + 268, mirrorZ(p.z) - 650], target: [p.x, p.y + 18, mirrorZ(p.z)] });

        });
        appendNote(parent, "Scripted platform and rotating companion. Visual preview; no collision or riding. Use the viewer pause control to pause the cycle.");
        return appendStatus(parent);
    }, () => {
        const r = elevator.runtime;
        return r.error !== null ? `Elevator stopped: ${r.error}` : !r.enabled ? 'Elevator preview disabled.' : !r.motionEnabled ? 'Elevator paused.' : 'Elevator cycle running.';
    });
}

export function createMachineInteractions(visual: LagoonMachineVisuals, context: InteractionContext): FeatureInteraction {
    const r = visual.runtime;
    const targets: InteractionTarget[] = [...MACHINE_PADS, ...MACHINE_LEVERS].map(index => ({
        placementIndex: index, canPick: () => r.ready(index), activate: () => r.activate(index),
    }));
    let syncControls = () => {};
    return createFeatureInteraction(targets, parent => {
        appendToggle(parent, 'Enable Scripted Machine', r.enabled, checked => { r.setEnabled(checked); visual.update(context.objectsEnabled()); syncControls(); });
        const buttons: { index: number; button: HTMLButtonElement }[] = [];
        for (const [indices, name] of [[MACHINE_PADS, 'Floor Pad'], [MACHINE_LEVERS, 'Arm Lever']] as const) {
            const row = document.createElement('div');
            for (const [n, index] of indices.entries()) {
                const button = document.createElement('button'); button.textContent = `${name} ${n + 1}`;
                button.onclick = () => r.activate(index); row.appendChild(button); buttons.push({ index, button });
            }
            parent.appendChild(row);
        }
        syncControls = () => { for (const { index, button } of buttons) button.disabled = !r.ready(index); };
        syncControls();
        appendButton(parent, 'Go to Machine', () => {
            focusInteraction(context.camera(), { eye: [2328, 1408, mirrorZ(2112) + 750], target: [1728, 850, mirrorZ(2112)] });

        });
        appendButton(parent, 'Reset Machine', () => { r.reset(); visual.update(context.objectsEnabled()); syncControls(); });
        appendNote(parent, 'Click pads/levers in the scene or use these buttons. Pads time out; each lever slows its linked arm. Smoke, audio and the completion cinematic are not rendered.');
        return appendStatus(parent);
    }, () => {
        const errors = [...r.world.programs.values()].flatMap(vm => vm.diagnostic ? [`C${vm.diagnostic.commandIndex}: ${vm.diagnostic.reason}`] : []);
        const pads = MACHINE_PADS.map((index, n) => r.world.getEntity(`object:${index}`)!.state === 1 ? n + 1 : null).filter(n => n !== null);
        return errors.length ? errors.join('; ') : !r.enabled ? 'Machine scripts disabled.'
            : `Active pads: ${pads.join(', ') || 'none'}; levers used: ${r.world.globals[1]}/4; floor-pad gate ${r.world.globals[0] === 4 ? 'unlocked' : 'locked'}.`;
    }, () => syncControls());
}

export function createSnowInteractions(visual: SnowPlatformVisuals, context: InteractionContext): FeatureInteraction {
    const r = visual.runtime;
    const targets: InteractionTarget[] = [4, 5, 27].map(index => ({
        placementIndex: index, canPick: () => r.switchReady(index), activate: () => r.activateSwitch(index),
        focus: () => placedControlFocus(r.config.placements[index]),
    }));
    let syncControls = () => {};
    return createFeatureInteraction(targets, parent => {
        appendToggle(parent, "Enable Scripted Platforms", r.enabled, checked => { r.setEnabled(checked); standing.value = ''; visual.update(context.objectsEnabled(), context.sceneTick()); syncControls(); });
        const switches: { index: number; button: HTMLButtonElement }[] = [];
        for (const [index, name] of [[4, 'Platform Visibility Switch'], [5, 'Bottom Fan / Orbiting Platforms Switch'], [27, 'Other Fan Switch']] as const) {
            const row = document.createElement('div');
            const button = document.createElement('button'); button.textContent = name; button.onclick = () => r.activateSwitch(index);
            switches.push({ index, button }); row.appendChild(button);
            const focus = document.createElement('button'); focus.textContent = 'Go to Switch'; focus.setAttribute('aria-label', `Go to ${name}`);
            focus.onclick = () => focusInteraction(context.camera(), targets.find(t => t.placementIndex === index)!.focus!()); row.appendChild(focus); parent.appendChild(row);
        }
        const label = document.createElement('label'); label.textContent = 'Standing on ';
        const standing = document.createElement('select'); standing.setAttribute('aria-label', 'Standing on platform');
        for (const [value, text] of [['', 'None'], ['8', 'Platform A (path 0)'], ['2', 'Platform B (path 1)'], ['3', 'Invisible platform (path 9)']]) {
            const option = document.createElement('option'); option.value = value; option.textContent = text; standing.appendChild(option);
        }
        standing.onchange = () => r.setStanding(standing.value === '' ? null : Number(standing.value));
        label.appendChild(standing); parent.appendChild(label);
        syncControls = () => { for (const { index, button } of switches) button.disabled = !r.switchReady(index); standing.value = r.world.standingOn?.split(':')[1] ?? ''; };
        syncControls();
        appendToggle(parent, "Reveal Invisible Platform (Preview)", false, checked => {
            visual.revealInvisible = checked; visual.update(context.objectsEnabled(), context.sceneTick());
        });
        appendButton(parent, 'Reset Platforms', () => { r.reset(); standing.value = ''; visual.update(context.objectsEnabled(), context.sceneTick()); syncControls(); });
        appendButton(parent, 'Go to Platform', () => {
            const o = r.world.objects.get(`object:${standing.value || '8'}`)!, [x, y, z] = Array.from(o.fixedPosition, v => v / 65536);
            focusInteraction(context.camera(), { eye: [x + (standing.value === '3' ? -500 : 500), y + 300, mirrorZ(z) + 600], target: [x, y + 60, mirrorZ(z)] });

        });
        appendNote(parent, 'Click a switch in the scene or use its button above. Invisible platform: stand to depart, select None to return, then repeat. No riding. Audio, notices and camera fades are suppressed. Disable to restore automatic path preview.');
        return appendStatus(parent);
    }, () => {
        const errors = [...r.world.programs.values()].flatMap(vm => vm.diagnostic ? [`C${vm.diagnostic.commandIndex}: ${vm.diagnostic.reason}`] : []);
        return errors.length ? errors.join('; ') : !r.enabled ? 'Automatic path preview.' : !r.motionEnabled ? 'Platforms paused.'
            : `Scripted switches active; bottom fan ${r.world.globals[0] ? 'on' : 'off'}, other fan ${r.world.fanSlots.get(2)!.enabled ? 'on' : 'off'}.`;
    }, () => syncControls());
}
