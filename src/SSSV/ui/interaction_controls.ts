import { mat4 } from 'gl-matrix';
import * as UI from '../../ui.js';
import type { Camera } from '../../Camera.js';
import type { InteractionFocus, InteractionTarget } from './interaction_targets.js';

export interface InteractionContext {
    camera(): Camera | null;
    objectsEnabled(): boolean;
    sceneTick(): number;
}

export interface FeatureInteraction {
    readonly targets: readonly InteractionTarget[];
    appendTo(parent: HTMLElement): void;
    sync(): void;
}

export function focusInteraction(camera: Camera | null, view: InteractionFocus): void {
    if (camera === null) return;
    mat4.targetTo(camera.worldMatrix, view.eye, view.target, [0, 1, 0]);
    camera.worldMatrixUpdated();
}

export function appendButton(parent: HTMLElement, label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button'); button.textContent = label; button.onclick = action;
    parent.appendChild(button); return button;
}

export function appendToggle(parent: HTMLElement, label: string, enabled: boolean, changed: (enabled: boolean) => void): UI.Checkbox {
    const checkbox = new UI.Checkbox(label, enabled);
    checkbox.onchanged = () => changed(checkbox.checked);
    parent.appendChild(checkbox.elem); return checkbox;
}

export function appendNote(parent: HTMLElement, text: string): void {
    const note = document.createElement('div'); note.style.fontSize = '12px'; note.textContent = text; parent.appendChild(note);
}

export function appendStatus(parent: HTMLElement, fontSize = '12px'): HTMLDivElement {
    const status = document.createElement('div'); status.style.fontSize = fontSize; parent.appendChild(status); return status;
}

export function createFeatureInteraction(targets: readonly InteractionTarget[], build: (parent: HTMLElement) => HTMLElement,
    statusText: () => string, syncControls: () => void = () => {}): FeatureInteraction {
    let status: HTMLElement | null = null;
    return {
        targets,
        appendTo(parent) { status = build(parent); syncControls(); },
        sync() { syncControls(); if (status !== null) status.textContent = statusText(); },
    };
}
