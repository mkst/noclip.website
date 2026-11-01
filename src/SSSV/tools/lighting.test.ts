import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSP_Geometry } from "../../BanjoKazooie/f3dex.js";
import type { LevelAnimalPlacement, LevelObjectPlacement } from "../core/level.js";
import { applyStartupLighting, readStartupLighting } from "../render/lighting.js";
import { parseCommands } from "../commands/paths.js";
import { makeLight, SSSVDrawCall } from "../render/terrain.js";
import { parseLevelDat } from "../core/level.js";

const object: LevelObjectPlacement = {
    id: 55, x: 0, z: 0, y: 0, zRotation: 0, angle: 0, unkC: 0, scale: 2048,
    commandReferenceIdx: 1, unk12: 0, commandsLength: 0, unk15: 0,
};
const blue = "002529337b3447d50000";
const yellow = "00255d5e5dffff930000";
const stop = "00090000000000000000";

function commands(records: string[]) {
    const bytes = new Uint8Array(2 + records.length * 10);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    records.forEach((raw, index) => {
        for (let i = 0; i < 10; i++)
            bytes[2 + index * 10 + i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    });
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}

test("SOMETHING_FISHY startup camera and random-seed setup precedes blue lighting", () => {
    deepEqual(readStartupLighting(commands(["0062fffe000000000000", "003d0b57000203e80501", blue, stop]), [object], []), {
        ambient: [41, 51, 123], diffuse: [52, 71, 213], commandIndex: 2,
    });
});

test("startup music and nonblocking message/camera setup preserve lighting discovery", () => {
    for (const setup of ["004502bc000000000000", "004504b0000100000000"])
        equal(readStartupLighting(commands([setup, "00271b00000000000000", yellow]), [object], [])?.commandIndex, 2);
});

test("initial script base and cursor are honoured; event and unreferenced scripts are ignored", () => {
    const data = commands([yellow, stop, stop, blue, stop]);
    deepEqual(readStartupLighting(data, [{ ...object, commandReferenceIdx: 3, commandsLength: 1, unk12: 1 }], []), {
        ambient: [41, 51, 123], diffuse: [52, 71, 213], commandIndex: 3,
    });
    for (const reference of [0, -1, 100])
        equal(readStartupLighting(data, [{ ...object, commandReferenceIdx: reference, unk12: 1 }], []), null);
});

test("animal initial references are distinct from event references", () => {
    const animal: LevelAnimalPlacement = { id: 1, x: 0, z: 0, y: 0, rotation: 0, health: 100, unkC: 2, unkE: 1 };
    equal(readStartupLighting(commands([yellow, blue, stop]), [], [animal])?.commandIndex, 1);
    equal(readStartupLighting(commands([yellow]), [], [{ ...animal, unkC: 0 }]), null);
});

test("delays, conditions, calls, target changes and unknown setup stop startup discovery", () => {
    for (const record of [stop, "00000000000000000000", "00060001000000000000", "00010000000000000000", "00480000000000000000", "00140000000000000000", "004501f4006400640050", "003d0000000000001100", "003d7f7f000003e80501"])
        equal(readStartupLighting(commands([record, blue]), [object], []), null, record);
    equal(readStartupLighting(commands([blue, "00060001000000000000", yellow]), [object], [])?.commandIndex, 0);
});

test("transition duration and dynamic operands are not mistaken for immediate intensity", () => {
    for (const duration of [1, 180, 0x7F7F, 0xFFFF])
        equal(readStartupLighting(commands([blue.slice(0, -4) + duration.toString(16).padStart(4, '0')]), [object], []), null);
});

test("the last immediate write wins within a prefix; conflicting controllers retain fallback", () => {
    equal(readStartupLighting(commands([blue, yellow, stop]), [object], [])?.commandIndex, 1);
    const data = commands([blue, stop, yellow, stop]);
    equal(readStartupLighting(data, [object, { ...object, commandReferenceIdx: 3 }], []), null);
    equal(readStartupLighting(data, [object, object], [])?.commandIndex, 0);
});

test("startup colours update existing lit terrain/object lights without tinting unlit draws", () => {
    const dat = parseLevelDat(new ArrayBufferSlice(new ArrayBuffer(0xA0)));
    const draws = [new SSSVDrawCall(), new SSSVDrawCall(), new SSSVDrawCall()];
    draws.forEach((draw) => draw.light = makeLight(dat));
    draws[0].SP_GeometryMode = draws[1].SP_GeometryMode = RSP_Geometry.G_LIGHTING;
    draws[2].SP_GeometryMode = 0;
    const unlit = Array.from(draws[2].light.ambientColor);
    const direction = Array.from(draws[0].light.direction);
    const lighting = readStartupLighting(commands([blue]), [object], []);
    ok(lighting);
    applyStartupLighting(draws, lighting);
    for (const draw of draws.slice(0, 2)) {
        draw.light.ambientColor.forEach((value, i) => ok(Math.abs(value - lighting.ambient[i] / 255) < 1e-7));
        draw.light.diffuseColor.forEach((value, i) => ok(Math.abs(value - lighting.diffuse[i] / 255) < 1e-7));
    }
    deepEqual(Array.from(draws[2].light.ambientColor), unlit);
    deepEqual(Array.from(draws[0].light.direction), direction);
    const unchanged = Array.from(draws[0].light.ambientColor);
    applyStartupLighting(draws, null);
    deepEqual(Array.from(draws[0].light.ambientColor), unchanged);
});
