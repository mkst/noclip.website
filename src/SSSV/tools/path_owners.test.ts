import { deepStrictEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLinks, parseObjects, parsePaths } from "../core/level.js";
import { analyzePathUses, describePathEntity, parseCommands, pathEntityKey } from "../commands/paths.js";
import type { LevelCommand, PathAnalysis } from "../commands/paths.js";

function bank(...records: number[][]): LevelCommand[] {
    const bytes = Uint8Array.from([0, 0, ...records.flatMap(([opcode, ...payload]) => [opcode >> 8, opcode & 255, ...Array.from({ length: 8 }, (_, i) => payload[i] ?? 0)])]);
    new DataView(bytes.buffer).setUint16(0, bytes.length);
    return parseCommands(ArrayBufferSlice.fromView(bytes));
}
const paths = Array.from({ length: 4 }, (_, index) => ({ index, waypoints: Array.from({ length: 4 }, () => ({ x: 1, y: 0, z: 1 })) }));
const object = (entry = 1) => ({ id: 94, commandReferenceIdx: entry, commandsLength: 0, unk12: 0 });
const animal = (entry = 1) => ({ id: 33, unkC: entry, unkE: 0 });
const targets = (result: PathAnalysis, pathId = 0) => result.paths[pathId].uses.filter((use) => use.target !== null).map((use) => use.target!);

test("assigned animal scripts cross ordinary waits without scanning through another owner's stop", () => {
    const commands = bank([0x09], [0x03, 19], [0x1D, 0, 0, 0, 20, 0, 1, 1, 52], [0x09]);
    const result = analyzePathUses(paths, commands, [object()], [animal(2)]);
    deepStrictEqual(result.paths[0].roles, ["animal"]);
    deepStrictEqual(targets(result), [{ kind: "animal", index: 0, id: 33 }]);
    equal(result.paths[0].uses[0].commandIndex, 2);
});

test("rewind waits retain their bookmark and terminate bounded analysis", () => {
    const result = analyzePathUses(paths, bank([0x03, 0x40], [0x1D, 0, 0], [0x03], [0x1D, 0, 1], [0x09]), [], [animal()]);
    deepStrictEqual(result.paths[0].roles, ["animal"]);
    deepStrictEqual(result.paths[1].roles, ["animal"]);
    ok(!result.diagnostics.some((diagnostic) => diagnostic.kind === "analysis-limit"));
});

test("calls use global destinations, return to the next caller command and preserve callee target selection", () => {
    const commands = bank([0x48, 0, 4], [0x1D, 0, 0], [0x09], [0x09], [0x14, 0, 1], [0x49]);
    const result = analyzePathUses(paths, commands, [object()], [animal(0)], [{ parent: 0, child: 1000, referenceIdx: 0 }]);
    deepStrictEqual(targets(result), [{ kind: "animal", index: 0, id: 33 }]);
    equal(result.paths[0].uses[0].source?.entity.kind, "object");
});

test("nested calls and returns without a saved context are explicit barriers", () => {
    const result = analyzePathUses(paths, bank([0x48, 0, 3], [0x1D, 0, 0], [0x09], [0x48, 0, 1]), [object()], []);
    deepStrictEqual(result.paths[0].roles, ["unresolved"]);
    ok(result.diagnostics.some((diagnostic) => diagnostic.message.includes("Nested calls")));
});

test("links use loader slot offsets, animal endpoints, last-write wins and null invalid endpoints", () => {
    const commands = bank([0x14, 0, 1], [0x1D, 0, 0], [0x09]);
    const links = [{ parent: 0, child: 1, referenceIdx: 0 }, { parent: 0, child: 1000, referenceIdx: 256 }];
    const result = analyzePathUses(paths, commands, [object(), object(0)], [animal(0)], links);
    deepStrictEqual(targets(result), [{ kind: "animal", index: 0, id: 33 }]);
    const invalid = analyzePathUses(paths, commands, [object()], [], [...links, { parent: 0, child: 999, referenceIdx: 0 }]);
    deepStrictEqual(invalid.paths[0].roles, ["unresolved"]);
});

test("target selectors are relative to the script owner rather than the prior target", () => {
    const commands = bank([0x14, 0, 1], [0x14, 0, 2], [0x1D, 0, 0], [0x09]);
    const result = analyzePathUses(paths, commands, [object(), object(0)], [animal(0)], [
        { parent: 0, child: 1, referenceIdx: 0 }, { parent: 0, child: 1000, referenceIdx: 1 },
    ]);
    deepStrictEqual(targets(result), [{ kind: "animal", index: 0, id: 33 }]);
});

test("spawned targets carry spawn-site identity without pretending to be placements", () => {
    for (const [opcode, kind] of [[0x10, "object"], [0x11, "object"], [0x5F, "animal"], [0x60, "animal"]] as const) {
        const result = analyzePathUses(paths, bank([opcode, 33], [0x14, 0, 7], [0x1D, 0, 0], [0x09]), [object(), object()], []);
        const found = targets(result);
        equal(found.length, 2);
        ok(found.every((entity) => entity.index === null && entity.kind === kind && entity.spawnCommandIndex === 0));
        ok(pathEntityKey(found[0]) !== pathEntityKey(found[1]));
        ok(describePathEntity(found[0]).includes("spawned at command 0"));
    }
});

test("SNOW_JOKE-style helper calls write back-references, hand off scripts and restore the platform owner", () => {
    const commands = bank(
        [0x48, 0, 4], [0x34, 0, 0], [0x09], [0x09],
        [0x10, 64], [0x14, 0, 7], [0x56, 0, 7, 0, 1, 0, 0, 0, 0],
        [0x0E, 0, 10], [0x14, 0, 0], [0x49],
        [0x14, 0, 1], [0x1D, 0, 1], [0x09],
    );
    const result = analyzePathUses(paths, commands, [object()], []);
    deepStrictEqual(targets(result), [{ kind: "object", index: 0, id: 94 }]);
    deepStrictEqual(targets(result, 1), [{ kind: "object", index: 0, id: 94 }]);
    const handed = result.paths[1].uses[0];
    equal(handed.source?.entity.index, null);
    equal(handed.source?.activation, "handoff");
    equal(handed.source?.assignmentCommandIndex, 7);
});

test("deferred conditions can leave the wait state, and are saved and restored across calls", () => {
    const commands = bank(
        [0x02, 0, 0, 0, 0, 0, 0, 0, 3], [0x48, 0, 6], [0x07], [0x09],
        [0x1D, 0, 0], [0x09], [0x49],
    );
    const result = analyzePathUses(paths, commands, [object()], []);
    deepStrictEqual(result.paths[0].roles, ["object"]);
    equal(result.paths[0].uses[0].commandIndex, 4);
});

test("deferred conditions do not carry into the callee or across a script-ending stop", () => {
    for (const terminal of [0x07, 0x09]) {
        const result = analyzePathUses(paths, bank(
            [0x02, 0, 0, 0, 0, 0, 0, 0, 3], [0x48, 0, 6], [0x09], [0x09],
            [0x1D, 0, 0], [0x09], [terminal],
        ), [object()], []);
        deepStrictEqual(result.paths[0].roles, ["unresolved"]);
    }
});

test("runtime reference writes replace linked targets and unknown values do not become self", () => {
    const result = analyzePathUses(paths, bank([0x56, 0, 0, 0, 1, 0, 9, 0, 0], [0x14, 0, 1], [0x1D, 0, 0], [0x09]), [object()], [animal(0)], [
        { parent: 0, child: 1000, referenceIdx: 0 },
    ]);
    deepStrictEqual(result.paths[0].roles, ["unresolved"]);
});

test("event script assignments retain their target and assignment provenance", () => {
    const result = analyzePathUses(paths, bank([0x14, 0, 1], [0x4A, 0, 4], [0x09], [0x09], [0x1D, 0, 0], [0x09]), [object()], [animal(0)], [
        { parent: 0, child: 1000, referenceIdx: 0 },
    ]);
    deepStrictEqual(targets(result), [{ kind: "animal", index: 0, id: 33 }]);
    equal(result.paths[0].uses[0].source?.activation, "event");
    equal(result.paths[0].uses[0].source?.assignmentCommandIndex, 1);
    const cleared = analyzePathUses(paths, bank([0x4A, 255, 255], [0x1D, 0, 0], [0x09]), [object()], []);
    deepStrictEqual(cleared.paths[0].roles, ["object"]);
    ok(!cleared.diagnostics.some((diagnostic) => diagnostic.kind === "invalid-command"));
});

test("repeated spawning stops with a diagnostic rather than conflating runtime instances", () => {
    const result = analyzePathUses(paths, bank([0x10, 64], [0x08, 255, 255], [0x1D, 0, 0]), [object()], []);
    ok(result.diagnostics.some((diagnostic) => diagnostic.message.includes("Repeated")));
    deepStrictEqual(result.paths[0].roles, ["unresolved"]);
});

test("a known consumer never hides an unattributed reference to the same path", () => {
    const result = analyzePathUses(paths, bank([0x1D, 0, 0], [0x09], [0x1D, 0, 0]), [], [animal()]);
    deepStrictEqual(result.paths[0].roles, ["animal", "unresolved"]);
    equal(result.unresolvedCommandCount, 1);
});

for (const level of ["SNOW_JOKE", "SMASHING_START", "HOPPA_CHOPPA"]) {
    const filename = `data/SSSV/levels/${level}.bin`;
    test(`${level} ownership follows the actual placement-assigned scripts`, { skip: !existsSync(filename) }, () => {
        const payloads = parseLevelContainer(ArrayBufferSlice.fromView(readFileSync(filename)));
        const objects = parseObjects(findPayload(payloads, LevelPayloadType.Cob)!);
        const animals = parseAnimals(findPayload(payloads, LevelPayloadType.Can)!);
        const links = parseLinks(findPayload(payloads, LevelPayloadType.Joi)!);
        const result = analyzePathUses(parsePaths(findPayload(payloads, LevelPayloadType.Paf)), parseCommands(findPayload(payloads, LevelPayloadType.Cmd)), objects, animals, links);
        if (level === "SNOW_JOKE") {
            for (const [pathId, owner, commandIndices] of [[0, 8, [32, 44]], [1, 2, [53, 65]], [9, 3, [372, 377]]] as const) {
                const uses = result.paths[pathId].uses;
                ok(commandIndices.every((index) => uses.some((use) => use.commandIndex === index && use.target?.kind === "object" && use.target.index === owner)));
                ok(!uses.some((use) => use.target?.index === 25));
            }
            ok(result.paths[8].roles.length === 0 && result.paths[12].roles.length === 0);
        } else {
            const expected = level === "SMASHING_START" ? { index: 2, id: 33 } : { index: 13, id: 11 };
            ok(targets(result).some((entity) => entity.kind === "animal" && entity.index === expected.index && entity.id === expected.id));
            ok(!targets(result).some((entity) => entity.kind === "object"));
        }
    });
}
