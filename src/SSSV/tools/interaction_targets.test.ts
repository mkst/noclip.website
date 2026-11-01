import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import { createInteractionInput, placedControlFocus, selectInteractionTarget } from '../ui/interaction_targets.js';
import type { InteractionTarget } from '../ui/interaction_targets.js';

class InputElement extends EventTarget {
    public override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
        // Node's EventTarget needs an options object to remove capture listeners.
        super.removeEventListener(type, callback, typeof options === 'boolean' ? { capture: options } : options);
    }
}

test('available targets from different feature families remain independently selectable', () => {
    const activations: number[] = [];
    const targets: InteractionTarget[] = [10, 20].map(index => ({ placementIndex: index,
        canPick: () => true, activate: () => { activations.push(index); return true; } }));
    selectInteractionTarget(targets, index => index === 20)!.activate();
    selectInteractionTarget(targets, index => index === 10)!.activate();
    deepEqual(activations, [20, 10]);
    equal(selectInteractionTarget(targets, () => false), null);
});

test('capture eligibility is evaluated before geometric picking', () => {
    const tested: number[] = [];
    const targets: InteractionTarget[] = [1, 2].map(index => ({ placementIndex: index,
        canPick: () => index === 2, activate: () => true }));
    equal(selectInteractionTarget(targets, index => { tested.push(index); return true; })!.placementIndex, 2);
    deepEqual(tested, [2]);
});

function inputFixture(run: (f: {
    element: HTMLElement; window: EventTarget; targets: InteractionTarget[]; activations: number[];
    enabled: boolean; eligible: boolean; hitIndex: number;
    fire: (target: EventTarget, type: string, x?: number, y?: number, button?: number) => Event;
}) => void): void {
    const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const window = new EventTarget(), element = new InputElement() as HTMLElement;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { pointerLockElement: null } });
    const f = { element, window, activations: [] as number[], enabled: true, eligible: true, hitIndex: 2,
        targets: [] as InteractionTarget[],
        fire(target: EventTarget, type: string, x = 100, y = 100, button = 0) {
            const event = Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: y, button });
            target.dispatchEvent(event); return event;
        },
    };
    f.targets = [1, 2].map(index => ({ placementIndex: index, canPick: () => f.eligible,
        activate: () => { f.activations.push(index); return true; } }));
    const input = createInteractionInput(element, f.targets, () => f.enabled, index => index === f.hitIndex);
    try { run(f); } finally {
        input.destroy();
        if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete (globalThis as any).window;
        if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete (globalThis as any).document;
    }
}

test('the shared input keeps the five-pixel click boundary and rejects camera drags', () => inputFixture(f => {
    equal(f.fire(f.element, 'mousedown').defaultPrevented, true);
    f.fire(f.window, 'mousemove', 103, 104); f.fire(f.window, 'mouseup', 103, 104);
    deepEqual(f.activations, [2]);
    f.fire(f.element, 'mousedown'); f.fire(f.window, 'mousemove', 106, 100); f.fire(f.window, 'mouseup');
    deepEqual(f.activations, [2]);
}));

test('release rechecks readiness, visibility and the current geometric target', () => inputFixture(f => {
    f.fire(f.element, 'mousedown'); f.eligible = false; f.fire(f.window, 'mouseup');
    deepEqual(f.activations, []);
    f.eligible = true; f.fire(f.element, 'mousedown'); f.enabled = false; f.fire(f.window, 'mouseup');
    deepEqual(f.activations, []);
    equal(f.fire(f.element, 'mousedown').defaultPrevented, false);
    f.enabled = true; f.fire(f.element, 'mousedown'); f.hitIndex = 1; f.fire(f.window, 'mouseup');
    deepEqual(f.activations, [1]);
}));

test('blur cancels a press and a destroyed input releases its listeners', () => inputFixture(f => {
    f.fire(f.element, 'mousedown'); f.fire(f.window, 'blur'); f.fire(f.window, 'mouseup');
    deepEqual(f.activations, []);
    const input = createInteractionInput(f.element, f.targets, () => true, () => true);
    input.destroy();
    f.enabled = false;
    equal(f.fire(f.element, 'mousedown').defaultPrevented, false); f.fire(f.window, 'mouseup');
    deepEqual(f.activations, []);
}));

test('a busy control can retain click capture while rejecting activation', () => {
    const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const window = new EventTarget(), element = new InputElement() as HTMLElement;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { pointerLockElement: null } });
    let attempts = 0;
    const input = createInteractionInput(element, [{ placementIndex: 1, canPick: () => true, activate: () => { attempts++; return false; } }], () => true, () => true);
    try {
        const event = () => Object.assign(new Event('mousedown', { cancelable: true }), { button: 0, clientX: 100, clientY: 100 });
        const down = event(); element.dispatchEvent(down); equal(down.defaultPrevented, true);
        window.dispatchEvent(Object.assign(new Event('mouseup'), { button: 0, clientX: 100, clientY: 100 }));
        equal(attempts, 1);
    } finally {
        input.destroy();
        if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete (globalThis as any).window;
        if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete (globalThis as any).document;
    }
});

test('standard control focus converts source Z once and preserves the existing camera offsets', () => {
    deepEqual(placedControlFocus({ x: 10, y: 20, z: 30 }), { eye: [190, 200, 7398], target: [10, 55, 7138] });
});
