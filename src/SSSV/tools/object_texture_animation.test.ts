import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import type { LevelObjectPlacement } from "../level.js";
import { parseCommands } from "../paths.js";
import { readObjectTextureAnimation, textureAnimationFrame } from "../object_texture_animation.js";

const placement: LevelObjectPlacement = {
    id: 88, x: 0, y: 0, z: 0, angle: 0, zRotation: 0, unkC: 28, scale: 4096,
    commandReferenceIdx: 1, commandsLength: 0, unk12: 0, unk15: 0,
};

function script(delay: number = 0) {
    const records = ['00570000000000000000'];
    if (delay !== 0)
        records.push(`0006${delay.toString(16).padStart(4, '0')}000000000000`);
    records.push('003d0000000000001100', '00140000000000000000');
    for (const [texture, duration] of [[28, 10], [30, 4], [31, 4], [29, 4], [31, 4], [30, 4]]) {
        records.push(`0033${texture.toString(16).padStart(4, '0')}000000000000`);
        records.push(`0006${duration.toString(16).padStart(4, '0')}000000000000`);
    }
    records.push(delay === 0 ? '00080002000000000000' : '00080003000000000000');
    const bytes = new Uint8Array(2 + records.length * 10);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    records.forEach((raw, index) => {
        for (let i = 0; i < 10; i++)
            bytes[2 + index * 10 + i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    });
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}

for (const delay of [0, 14, 22]) {
    test(`PUNCHUP_PYRAMID eye loop retains its ${delay}-tick startup delay and source frame holds`, () => {
        const animation = readObjectTextureAnimation(placement, script(delay));
        ok(animation);
        equal(animation.loopStartFrame, delay);
        const cycle = [28, 30, 31, 29, 31, 30].flatMap((texture, i) => Array(i === 0 ? 10 : 4).fill(texture));
        deepEqual(animation.textureIndices, [...Array(delay).fill(28), ...cycle]);
        for (let tick = 0; tick < delay + 3 * cycle.length; tick++) {
            const frame = textureAnimationFrame(tick, animation.textureIndices.length, animation.loopStartFrame);
            equal(animation.textureIndices[frame], tick < delay ? 28 : cycle[(tick - delay) % cycle.length]);
        }
    });
}

test("the delay handler's initial call consumes time within the same hold", () => {
    let remaining = 10;
    let releaseTick = -1;
    for (let tick = 0; tick <= 10; tick++) {
        if (remaining-- < 1) {
            releaseTick = tick;
            break;
        }
    }
    equal(releaseTick, 10);
    const animation = readObjectTextureAnimation(placement, script())!;
    equal(animation.textureIndices[releaseTick - 1], 28);
    equal(animation.textureIndices[releaseTick], 30);
});

test("animation reading rejects unrelated state changes, targets and control flow", () => {
    for (const [index, opcode, payload] of [[0, 0x0F, 0], [2, 0x14, 1], [1, 0x3D, 1], [4, 0x06, 0x7F7F], [15, 0x08, 200]]) {
        const commands = script();
        const bytes = new Uint8Array(8);
        new DataView(bytes.buffer).setUint16(0, payload);
        commands[index] = { ...commands[index], opcode, payload: ArrayBufferSlice.fromView(bytes) };
        equal(readObjectTextureAnimation(placement, commands), null);
    }
    equal(readObjectTextureAnimation({ ...placement, commandReferenceIdx: 0 }, script()), null);
    equal(readObjectTextureAnimation({ ...placement, unkC: 0xC1 }, script()), null);
});

test("existing uniformly looping animations retain their frame selection", () => {
    for (let frame = 0; frame < 20; frame++)
        equal(textureAnimationFrame(frame, 5), frame % 5);
});
