import { deepStrictEqual, equal, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { analyzePathUses, parseCommands } from "../paths.js";
import type { LevelCommand } from "../paths.js";
import type { LevelPath } from "../level.js";

function bank(...records: number[][]): LevelCommand[] {
    const bytes = Uint8Array.from([0, 0, ...records.flatMap(([opcode, ...payload]) => [opcode >> 8, opcode & 255, ...Array.from({ length: 8 }, (_, i) => payload[i] ?? 0)])]);
    new DataView(bytes.buffer).setUint16(0, bytes.length, false);
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}

const paths: LevelPath[] = Array.from({ length: 4 }, (_, index) => ({ index, waypoints: [] }));
const object = (reference = 1, cursor = 0, event = 0) => ({ id: 55, commandReferenceIdx: reference, commandsLength: cursor, unk12: event });
const animal = (reference = 1, event = 0) => ({ id: 6, unkC: reference, unkE: event });

const allUses = (result: ReturnType<typeof analyzePathUses>) => result.paths.flatMap((path) => path.uses);

test("commands retain unsigned opcodes, indices and exact raw bytes", () => {
    const commands = bank([0x501D, 255, 128, 1, 2, 3, 4, 5, 6], [0x50, 2]);
    equal(commands[0].index, 0);
    equal(commands[0].opcode, 0x501D);
    equal(commands[1].index, 1);
    deepStrictEqual(Array.from(commands[0].raw.createTypedArray(Uint8Array)), [0x50, 0x1D, 255, 128, 1, 2, 3, 4, 5, 6]);
    deepStrictEqual(Array.from(commands[0].payload.createTypedArray(Uint8Array)), [255, 128, 1, 2, 3, 4, 5, 6]);
    deepStrictEqual(parseCommands(null), []);
    deepStrictEqual(parseCommands(ArrayBufferSlice.fromView(Uint8Array.from([0, 2]))), []);
});

test("command byte count and record alignment are validated", (t) => {
    t.mock.method(console, "error", () => {});
    for (const bytes of [[], [0]])
        throws(() => parseCommands(ArrayBufferSlice.fromView(Uint8Array.from(bytes))), /Commands: payload too small/);
    throws(() => parseCommands(ArrayBufferSlice.fromView(Uint8Array.from([0, 12]))), /byte count does not match/);
    throws(() => parseCommands(ArrayBufferSlice.fromView(Uint8Array.from([0, 3, 0]))), /records truncated/);
});

test("camera, set-waypoint and update-waypoint use their distinct payload fields", () => {
    const result = analyzePathUses(paths, bank([0x50, 1, 3], [0x1D, 0, 2], [0x34, 99, 3]), [], []);
    deepStrictEqual(allUses(result).map((use) => [use.commandIndex, use.pathId, use.role]), [[0, 1, "camera"], [1, 2, "unresolved"], [2, 3, "unresolved"]]);
    deepStrictEqual(result.paths[0].roles, []);
    equal(result.unresolvedCommandCount, 2);
    equal(allUses(result)[0].confidence, "opcode");
});

test("initial references are one-based and commandsLength is a cursor, not a range", () => {
    const result = analyzePathUses(paths, bank([0x1D, 0, 0], [0x1D, 0, 1], [0x1D, 0, 2], [0x09]), [object(2, 1)], []);
    deepStrictEqual(result.paths.map((path) => path.roles), [["unresolved"], ["unresolved"], ["object"], []]);
    deepStrictEqual(result.paths[2].uses[0].source, {
        entity: { kind: "object", index: 0, id: 55 }, activation: "initial", scriptBase: 1, initialCursor: 1,
    });
    equal(result.paths[2].uses[0].target?.kind, "object");
});

test("shared scripts retain animal and object consumers and possible event entries", () => {
    const result = analyzePathUses(paths, bank([0x1D, 0, 1], [0x09]), [object(1, 0, 1)], [animal()]);
    deepStrictEqual(result.paths[1].roles, ["object", "animal"]);
    equal(result.paths[1].uses.length, 3);
    ok(result.paths[1].uses.some((use) => use.source?.activation === "event"));
});

test("unknown reference targets stay unresolved until an explicit self selection", () => {
    for (const ref of [1, 7, 8, 9, 10, 11]) {
        const result = analyzePathUses(paths, bank([0x14, 0, ref], [0x1D, 0, 0], [0x14, 0, 12], [0x1D, 0, 1], [0x14, 0, 0], [0x1D, 0, 2], [0x09]), [object()], []);
        deepStrictEqual(result.paths.map((path) => path.roles), [["unresolved"], ["unresolved"], ["object"], []]);
        equal(result.paths[0].uses[0].target, null);
        equal(result.paths[0].uses[0].source?.entity.kind, "object");
    }
});

test("conditional branches preserve both possible target contexts", () => {
    const result = analyzePathUses(paths, bank(
        [0x01, 0, 0, 0, 0, 0, 0, 0, 1],
        [0x14, 0, 9],
        [0x1D, 0, 2],
        [0x09],
    ), [object()], []);
    deepStrictEqual(new Set(result.paths[2].roles), new Set(["object", "unresolved"]));
    equal(result.unresolvedCommandCount, 1);
});

test("jumps use the post-incremented u8 cursor and loops terminate analysis", () => {
    const result = analyzePathUses(paths, bank([0x08, 0, 1], [0x1D, 0, 0], [0x1D, 0, 1], [0x08, 255, 255]), [object()], []);
    deepStrictEqual(result.paths.map((path) => path.roles), [["unresolved"], ["object"], [], []]);
    equal(result.paths[1].uses.length, 1);
    equal(result.diagnostics.length, 0);
});

test("counted loops explore possible repeats without evaluating counters", () => {
    const result = analyzePathUses(paths, bank([0x04, 0, 3], [0x1D, 0, 1], [0x05], [0x34, 0, 2], [0x09]), [], [animal()]);
    deepStrictEqual(result.paths[1].roles, ["animal"]);
    deepStrictEqual(result.paths[2].roles, ["animal"]);
    equal(result.paths[1].uses.length, 1);
});

test("self script replacement uses a zero-based bank base and resets its cursor", () => {
    const result = analyzePathUses(paths, bank([0x0E, 0, 2], [0x1D, 0, 0], [0x1D, 0, 1], [0x09]), [], [animal()]);
    deepStrictEqual(result.paths[0].roles, ["unresolved"]);
    deepStrictEqual(result.paths[1].roles, ["animal"]);
});

test("invalid returns, dynamic handoffs and unknown opcodes do not leak owner roles", () => {
    for (const opcode of [0x49, 0xFFFF]) {
        const result = analyzePathUses(paths, bank([opcode], [0x1D, 0, 1]), [object()], []);
        deepStrictEqual(result.paths[1].roles, ["unresolved"]);
        ok(result.diagnostics.some((diagnostic) => diagnostic.kind === "unsupported-command"));
    }
    const result = analyzePathUses(paths, bank([0x14, 0, 1], [0x0E, 0, 2], [0x1D, 0, 1], [0x09]), [object()], []);
    deepStrictEqual(result.paths[1].roles, ["unresolved"]);
    ok(result.diagnostics.some((diagnostic) => diagnostic.message.includes("assignment")));
});

test("math writes can invalidate the primary target or runtime entity type", () => {
    for (const [opcode, payload] of [[0x3D, [0, 0, 0, 0, 0, 0, 16]], [0x65, [16]]] as const) {
        const result = analyzePathUses(paths, bank([opcode, ...payload], [0x1D, 0, 1], [0x09]), [object()], []);
        deepStrictEqual(result.paths[1].roles, ["unresolved"]);
    }
    const result = analyzePathUses(paths, bank([0x65, 32], [0x1D, 0, 1]), [object()], []);
    deepStrictEqual(result.paths[1].roles, ["unresolved"]);
    ok(result.diagnostics.some((diagnostic) => diagnostic.message.includes("type change")));
});

test("animal followers narrow path IDs while object setup also reads the full ID", () => {
    const commands = bank([0x1D, 1, 1], [0x09]);
    const animalResult = analyzePathUses(paths, commands, [], [animal()]);
    equal(animalResult.paths[1].uses[0].rawPathId, 257);
    deepStrictEqual(animalResult.paths[1].roles, ["animal"]);
    equal(animalResult.invalidUses.length, 0);
    const objectResult = analyzePathUses(paths, commands, [object()], []);
    deepStrictEqual(objectResult.paths[1].roles, []);
    equal(objectResult.invalidUses[0].pathId, 257);
});

test("invalid references remain diagnostics instead of creating paths or crashing", () => {
    const result = analyzePathUses(paths, bank([0x50, 4], [0x09]), [object(0, 0, 50)], []);
    equal(result.paths.length, 4);
    equal(result.invalidUses.length, 1);
    equal(result.invalidUses[0].pathId, 4);
    equal(result.invalidUses[0].role, "camera");
    ok(result.diagnostics.some((diagnostic) => diagnostic.kind === "invalid-path"));
    ok(result.diagnostics.some((diagnostic) => diagnostic.kind === "invalid-command"));
});

test("opcode zero follows the C dispatcher rather than the exporter's end name", () => {
    const result = analyzePathUses(paths, bank([0x00], [0x1D, 0, 0], [0x09]), [object()], []);
    deepStrictEqual(result.paths[0].roles, ["object"]);
});

test("chained conditions explore both the next condition and the chain skip", () => {
    const result = analyzePathUses(paths, bank(
        [0x01, 0x40],
        [0x01, 0, 0, 0, 0, 0, 0, 0, 3],
        [0x14, 0, 9],
        [0x1D, 0, 1],
        [0x1D, 0, 2],
        [0x09],
    ), [object()], []);
    deepStrictEqual(result.paths[1].roles, ["unresolved"]);
    deepStrictEqual(new Set(result.paths[2].roles), new Set(["object", "unresolved"]));
});

test("display variants apply each consumer's offsets and mirror Z exactly once", async () => {
    const { createPathDisplayVariants } = await import("../paths.js");
    const path: LevelPath = { index: 9, waypoints: [{ x: 1, z: 2, y: 3 }, { x: 255, z: 128, y: 0 }] };
    const analysis = { paths: [{ path, roles: ["camera", "animal", "object", "unresolved"] as const, uses: [] }], invalidUses: [], diagnostics: [], unresolvedCommandCount: 0 };
    const result = createPathDisplayVariants({ ...analysis, paths: [{ ...analysis.paths[0], roles: [...analysis.paths[0].roles] }] });
    deepStrictEqual(result.map((variant) => [variant.pathId, variant.role, variant.points[0]]), [
        [9, "camera", [64, 192, 7040]],
        [9, "animal", [96, 224, 7008]],
        [9, "object", [96, 192, 7008]],
        [9, "unresolved", [64, 192, 7040]],
    ]);
    deepStrictEqual(result[0].points[1], [16320, 0, -1024]);
    deepStrictEqual(path.waypoints, [{ x: 1, z: 2, y: 3 }, { x: 255, z: 128, y: 0 }]);
});

test("unclassified, empty and single-point paths retain display IDs and authored heights", async () => {
    const { createPathDisplayVariants } = await import("../paths.js");
    const analysis = analyzePathUses([
        { index: 0, waypoints: [] },
        { index: 1, waypoints: [{ x: 0, z: 0, y: 0 }] },
    ], [], [], []);
    deepStrictEqual(createPathDisplayVariants(analysis), [
        { pathId: 0, role: "unclassified", points: [] },
        { pathId: 1, role: "unclassified", points: [[0, 0, 7168]] },
    ]);
});
