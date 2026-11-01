import { ButtonInput } from './button_input.js';
import { mirrorZ } from '../core/level.js';
import type { LevelObjectPlacement } from '../core/level.js';

export interface InteractionFocus {
    eye: [number, number, number];
    target: [number, number, number];
}

export interface InteractionTarget {
    readonly placementIndex: number;
    canPick(): boolean;
    activate(): boolean;
    focus?(): InteractionFocus;
}

export function placedControlFocus(p: Pick<LevelObjectPlacement, 'x' | 'y' | 'z'>): InteractionFocus {
    return { eye: [p.x + 180, p.y + 180, mirrorZ(p.z) + 260], target: [p.x, p.y + 35, mirrorZ(p.z)] };
}

export function selectInteractionTarget(targets: readonly InteractionTarget[], hit: (index: number) => boolean): InteractionTarget | null {
    return targets.find(target => target.canPick() && hit(target.placementIndex)) ?? null;
}

export function createInteractionInput(element: HTMLElement, targets: readonly InteractionTarget[], enabled: () => boolean,
    hit: (index: number, x: number, y: number) => boolean): ButtonInput {
    let selected: InteractionTarget | null = null;
    return new ButtonInput(element, (x, y) => {
        selected = enabled() ? selectInteractionTarget(targets, index => hit(index, x, y)) : null;
        return selected !== null;
    }, () => {
        const target = selected; selected = null;
        if (enabled() && target?.canPick()) target.activate();
    });
}
