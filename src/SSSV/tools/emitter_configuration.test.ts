import { deepEqual, equal, throws } from 'node:assert/strict';
import { test } from 'node:test';
import { applyEmitterCommand as sharedApplyEmitterCommand, createEmitterConfiguration, getOrCreateEmitterConfiguration } from '../effects/particle_emitters.js';
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

const emitterPayload = (...bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);

test('legacy applicator export is the shared implementation', () => {
    equal(applyEmitterCommand, sharedApplyEmitterCommand);
});

test('setup distinguishes signed offsets from unsigned spread and direction bytes in sliced payloads', () => {
    const config = createEmitterConfiguration();
    const bytes = Uint8Array.from([99, 128, 255, 127, 0, 128, 255, 0, 0, 99]);
    equal(applyEmitterCommand(config, 0x15, new DataView(bytes.buffer, 1, 8)).ok, true);
    deepEqual(config.offset, [-128, -1, 127]); deepEqual(config.spread, [0, 128, 255]);
    equal(applyEmitterCommand(config, 0x16, emitterPayload(128, 255, 127, 0, 128, 255, 0, 0)).ok, true);
    deepEqual(config.direction, [128, 255, 127]); deepEqual(config.directionSpread, [0, 128, 255]);
    bytes[1] = 0; equal(config.offset[0], -128);
});

test('every encoded frequency subtracts 20 and wraps as a signed byte while size and argument remain unsigned', () => {
    for (let byte = 0; byte <= 255; byte++) {
        const config = createEmitterConfiguration();
        equal(applyEmitterCommand(config, 0x17, emitterPayload(0, 0xE9, 24, byte, 255, 255, 0, 0)).ok, true);
        const signed = byte < 128 ? byte : byte - 256, difference = signed - 20;
        equal(config.frequency, difference < -128 ? difference + 256 : difference, `encoded frequency ${byte}`);
        deepEqual([config.flags, config.particleId, config.size, config.argument, config.duration], [0xE9, 24, 255, 255, 0]);
    }
});

test('colour commands preserve quantized black and set alpha only on nonblack packed colours', () => {
    const config = createEmitterConfiguration();
    for (const [bytes, primary, environment] of [
        [[0, 0, 0, 255, 255, 255, 0, 0], 0, 0xFFFF],
        [[7, 7, 7, 8, 0, 0, 0, 0], 0, 0x801],
        [[255, 0, 0, 0, 255, 0, 0, 0], 0xF801, 0x7C1],
        [[0, 0, 255, 0, 0, 0, 0, 0], 0x3F, 0],
    ] as const) {
        equal(applyEmitterCommand(config, 0x64, emitterPayload(...bytes)).ok, true);
        deepEqual([config.primaryColor, config.environmentColor], [primary, environment]);
    }
});

test('live replacement and allowed-list policies stay explicit and reject before replacing configuration', () => {
    const config = createEmitterConfiguration();
    equal(applyEmitterCommand(config, 0x17, emitterPayload(0, 9, 122, 20, 1, 0, 0, 0)).ok, true);
    const before = structuredClone(config), replacement = emitterPayload(0, 0x89, 37, 128, 255, 255, 0, 0);
    equal(applyEmitterCommand(config, 0x17, replacement).ok, false); deepEqual(config, before);
    equal(applyEmitterCommand(config, 0x17, replacement, true, [122, 24], [9, 0xE9]).ok, false); deepEqual(config, before);
    equal(applyEmitterCommand(config, 0x17, replacement, true).ok, true);
    deepEqual([config.flags, config.particleId, config.frequency], [0x89, 37, 108]);
    const replaced = structuredClone(config);
    equal(applyEmitterCommand(config, 0x17, emitterPayload(0, 9, 122, 20, 1, 0, 255, 255), true).ok, false);
    deepEqual(config, replaced);
});

test('unknown commands fail and truncated supported payloads retain the DataView failure contract', () => {
    const config = createEmitterConfiguration(), before = structuredClone(config);
    equal(applyEmitterCommand(config, 0xFFFF, emitterPayload()).ok, false); deepEqual(config, before);
    for (const [opcode, size] of [[0x15, 5], [0x16, 5], [0x64, 5], [0x17, 7]])
        throws(() => applyEmitterCommand(createEmitterConfiguration(), opcode, new DataView(new ArrayBuffer(size))), RangeError);
});
