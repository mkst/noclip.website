import { deepEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { SceneTickClock } from '../core/timing.js';

test('anchored clocks skip the first frame and count subsequent elapsed ticks', () => {
    const clock = new SceneTickClock();
    deepEqual(clock.advance(10000), { kind: 'initial' });
    deepEqual(clock.advance(10000), { kind: 'advance', ticks: 0 });
    deepEqual(clock.advance(10003), { kind: 'advance', ticks: 3 });
});

test('step-first clocks advance once at any starting time and after reset', () => {
    const clock = new SceneTickClock('step');
    deepEqual(clock.advance(10000), { kind: 'advance', ticks: 1 });
    deepEqual(clock.advance(10000), { kind: 'advance', ticks: 0 });
    clock.reset();
    deepEqual(clock.advance(0), { kind: 'advance', ticks: 1 });
});

test('the 900-tick catch-up limit is inclusive and backwards time is discontinuous', () => {
    const clock = new SceneTickClock();
    clock.advance(0);
    deepEqual(clock.advance(900), { kind: 'advance', ticks: 900 });
    deepEqual(clock.advance(1801), { kind: 'discontinuity' });
    deepEqual(clock.advance(1802), { kind: 'advance', ticks: 1 });
    deepEqual(clock.advance(1801), { kind: 'discontinuity' });
    deepEqual(clock.advance(1801), { kind: 'advance', ticks: 0 });
});

test('a runtime reset can clear history or anchor to a discontinuous/disabled frame', () => {
    for (const policy of ['anchor', 'step'] as const) {
        const clock = new SceneTickClock(policy);
        clock.advance(0);
        clock.advance(10000);
        clock.reset();
        clock.reset(10000);
        deepEqual(clock.advance(10001), { kind: 'advance', ticks: 1 });
        clock.reset(20000);
        deepEqual(clock.advance(20000), { kind: 'advance', ticks: 0 });
        deepEqual(clock.advance(20001), { kind: 'advance', ticks: 1 });
    }
});
