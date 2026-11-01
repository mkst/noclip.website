import type { BonusRingVisuals } from '../effects/bonus_ring_renderer.js';
import { mirrorZ } from '../core/level.js';
import { appendButton, appendNote, appendStatus, appendToggle, createFeatureInteraction, focusInteraction } from './interaction_controls.js';
import type { FeatureInteraction, InteractionContext } from './interaction_controls.js';

export function createBonusRingInteractions(visuals: BonusRingVisuals, context: InteractionContext): FeatureInteraction {
    const r = visuals.runtime;
    let pass: HTMLButtonElement | null = null;
    return createFeatureInteraction([], parent => {
        const update = () => visuals.update(context.objectsEnabled());
        appendToggle(parent, 'Enable Bonus Hoops', true, enabled => { r.setEnabled(enabled); update(); });
        pass = appendButton(parent, 'Pass Current Hoop', () => { r.passCurrent(); update(); });
        appendButton(parent, 'Reset Bonus Hoops', () => { r.reset(); update(); });
        appendButton(parent, 'Go to Current Hoop', () => {
            const p = r.current?.site.placement;
            if (p) focusInteraction(context.camera(), { eye: [p.x+220,p.y+160,mirrorZ(p.z)+320], target: [p.x,p.y+64,mirrorZ(p.z)] });
        });
        appendNote(parent, 'Manual course contact preview. Camera movement does not collect hoops. Additional gate contacts, rewards and later gameplay branches are held. Seeking resets the preview.');
        return appendStatus(parent);
    }, () => {
        const errors = r.world.programs.flatMap(vm => vm.diagnostic ? [`C${vm.diagnostic.commandIndex}: ${vm.diagnostic.reason}`] : []);
        return errors.length ? errors.join('; ') : !r.enabled ? 'Bonus hoops disabled.'
            : `Course hoops passed: ${r.world.globals[9]} / 12. Four additional visual gates remain active.`;
    }, () => { if (pass) pass.disabled = !r.enabled || r.current === null || !context.objectsEnabled(); });
}
