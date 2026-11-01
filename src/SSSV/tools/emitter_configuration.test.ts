import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import { createEmitterConfiguration, getOrCreateEmitterConfiguration } from '../effects/particle_emitters.js';
import type { EmitterConfiguration } from '../effects/particle_emitters.js';
import { applyEmitterCommand, CommandEmitterWorld } from '../effects/emitter_commands.js';

test('fresh emitter configurations isolate every mutable vector across owners and resets', () => {
    const first = createEmitterConfiguration(), second = createEmitterConfiguration();
    const initial = structuredClone(second);
    first.flags = 9;
    for (const field of ['offset', 'spread', 'direction', 'directionSpread'] as const) first[field][0] = 123;
    deepEqual(second, initial);
    Object.assign(first, createEmitterConfiguration());
    deepEqual(first, initial); first.offset[0] = 99; equal(second.offset[0], 0);
});

test('lazy setup reuses a live target configuration without sharing state with another target', () => {
    const emitters = new Map<string, EmitterConfiguration>();
    const first = getOrCreateEmitterConfiguration(emitters, 'one'); first.flags = 9; first.offset[0] = 12;
    equal(getOrCreateEmitterConfiguration(emitters, 'one'), first);
    equal(getOrCreateEmitterConfiguration(emitters, 'one').offset[0], 12);
    const second = getOrCreateEmitterConfiguration(emitters, 'two');
    equal(second.flags, 0); equal(second.offset[0], 0); equal(emitters.size, 2);
});

test('shared setup does not admit unknown persistent targets or finite emitter lifecycles', () => {
    const world = new CommandEmitterWorld([], 'silent'), payload = new DataView(new ArrayBuffer(8));
    equal(world.executeEmitterCommand('unknown', 0x15, payload).ok, false); equal(world.emitters.size, 0);
    payload.setUint16(0, 0xF9); payload.setUint8(2, 123); payload.setUint16(6, 20);
    const config = createEmitterConfiguration();
    equal(applyEmitterCommand(config, 0x17, payload, true, [123], [0xF9]).ok, false);
    equal(config.flags, 0); equal(config.duration, 0);
});
