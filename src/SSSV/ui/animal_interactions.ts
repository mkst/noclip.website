import type { LiveAnimalSpawnVisuals } from '../animals/live_animal_renderer.js';
import type { AnimalMarkerMode } from '../animals/animals.js';
import { mirrorZ } from '../core/level.js';
import { appendButton, appendNote, appendStatus, appendToggle, createFeatureInteraction, focusInteraction } from './interaction_controls.js';
import type { FeatureInteraction, InteractionContext } from './interaction_controls.js';

interface AnimalInteractionContext extends Pick<InteractionContext, 'camera'> {
    animalsVisible(): boolean;
    markerMode(): AnimalMarkerMode;
}

export function createAnimalInteractions(visual: LiveAnimalSpawnVisuals, context: AnimalInteractionContext): FeatureInteraction {
    const r = visual.runtime;
    let syncControls = () => {};
    return createFeatureInteraction([], parent => {
        appendToggle(parent, 'Enable Scripted Animal Spawns', false, checked => { r.setEnabled(checked); visual.update(context.animalsVisible(), context.markerMode()); syncControls(); });
        const stageButtons: HTMLButtonElement[] = [];
        for (const [stage, label] of [['foxes', 'Fox Stage'], ['dogs', 'First Dog Wave'], ['laterDogs', 'Second Dog Wave']] as const) {
            const button = document.createElement('button'); button.textContent = label; button.onclick = () => r.setStage(stage);
            stageButtons.push(button); parent.appendChild(button);
        }
        const next = document.createElement('button'); next.textContent = 'Continue Spawn Sequence'; next.onclick = () => r.continueSequence(); parent.appendChild(next);
        appendButton(parent, 'Reset Animal Spawns', () => { r.reset(); visual.update(context.animalsVisible(), context.markerMode()); });
        const focus = appendButton(parent, 'Go to Spawned Animals', () => {
            const p = [...r.world.animals.values()].at(-1)?.placement; if (!p) return;
            focusInteraction(context.camera(), { eye: [p.x + 300, p.y + 180, mirrorZ(p.z) + 400], target: [p.x, p.y + 40, mirrorZ(p.z)] });

        });
        syncControls = () => { for (const b of stageButtons) b.disabled = !r.enabled; next.disabled = !r.enabled || !r.world.message && !r.world.cutsceneRequested; focus.disabled = r.world.animals.size === 0; };
        syncControls();
        appendNote(parent, 'Manual stage inputs; spawned animals remain idle. Navigation and scripted cameras are held. The spawn-site preview remains separate.');
        return appendStatus(parent);
    }, () => {
        const errors = [...r.world.programs.values()].flatMap(vm => vm.diagnostic ? [`C${vm.diagnostic.commandIndex}: ${vm.diagnostic.reason}`] : []);
        return errors.length ? errors.join('; ') : !r.enabled ? 'Live spawning disabled.' : r.world.message ? 'Dog-wave notice: use Continue Spawn Sequence.'
            : r.world.cutsceneRequested ? 'Sequence gate: use Continue Spawn Sequence.' : `${r.world.animals.size} animals spawned; navigation held.`;
    }, () => syncControls());
}
