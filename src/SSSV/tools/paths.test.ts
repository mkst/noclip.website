import { deepStrictEqual, throws } from "node:assert/strict";
import { test } from "node:test";

import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { parsePaths } from "../core/level.js";

function payload(bytes: number[]): ArrayBufferSlice {
    return ArrayBufferSlice.fromView(Uint8Array.from(bytes));
}

test("missing and empty path banks", () => {
    deepStrictEqual(parsePaths(null), []);
    deepStrictEqual(parsePaths(payload([0, 0])), []);
});

test("unsigned X/Z/Y coordinates and consecutive unaligned records retain path IDs", () => {
    deepStrictEqual(parsePaths(payload([
        0, 4,
        0,
        1, 255, 128, 200,
        2, 1, 2, 3, 4, 5, 6,
        0,
    ])), [
        { index: 0, waypoints: [] },
        { index: 1, waypoints: [{ x: 255, z: 128, y: 200 }] },
        { index: 2, waypoints: [{ x: 1, z: 2, y: 3 }, { x: 4, z: 5, y: 6 }] },
        { index: 3, waypoints: [] },
    ]);
});

test("big-endian bank count is preserved beyond the runtime pointer capacity", () => {
    const paths = parsePaths(payload([1, 0, ...new Array<number>(256).fill(0)]));
    deepStrictEqual(paths.map((path) => path.index), Array.from({ length: 256 }, (_, i) => i));
    deepStrictEqual(paths.map((path) => path.waypoints), Array.from({ length: 256 }, () => []));
});

test("maximum unsigned point count", () => {
    const points = Array.from({ length: 255 }, (_, i) => [i, 255 - i, 128]);
    deepStrictEqual(parsePaths(payload([0, 1, 255, ...points.flat()])), [{
        index: 0,
        waypoints: points.map(([x, z, y]) => ({ x, z, y })),
    }]);
});

test("truncated headers, point counts and point arrays fail with parser diagnostics", (t) => {
    t.mock.method(console, "error", () => {});
    for (const bytes of [[], [0]])
        throws(() => parsePaths(payload(bytes)), /Paths: payload too small/);
    throws(() => parsePaths(payload([0, 1])), /Paths: missing point count for path 0/);
    throws(() => parsePaths(payload([0, 2, 0])), /Paths: missing point count for path 1/);
    for (const bytes of [[0, 1, 1], [0, 1, 1, 5], [0, 1, 1, 5, 6]])
        throws(() => parsePaths(payload(bytes)), /Paths: points truncated for path 0/);
});

test("reads a slice without modifying the source buffer", () => {
    const bytes = Uint8Array.from([99, 0, 1, 1, 129, 200, 255, 88]);
    const before = bytes.slice();
    deepStrictEqual(parsePaths(ArrayBufferSlice.fromView(bytes.subarray(1, 7))), [{
        index: 0,
        waypoints: [{ x: 129, z: 200, y: 255 }],
    }]);
    deepStrictEqual(bytes, before);
});
