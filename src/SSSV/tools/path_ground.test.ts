import { deepStrictEqual, equal, notStrictEqual, ok } from "node:assert/strict";
import { test } from "node:test";
import { getAnimalLocomotion } from "../animals/animal_locomotion.js";
import { MAP_X_POINTS, MAP_Z_POINTS } from "../core/level.js";
import type { LevelMapEntry, LevelPath } from "../core/level.js";
import { createGroundSnappedPathDisplayVariants, createPathDisplayVariants, PATH_GROUND_CLEARANCE } from "../commands/paths.js";
import type { PathAnalysis, PathRole } from "../commands/paths.js";

function terrain(diagonal = 0): LevelMapEntry[] {
    const map = Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({
        unk0: 0, unk1: 255, unk2: 0, unk3: 1, unk4: 0, unk5: 0, unk6: 255, unk7: 0,
    }));
    map[6 * MAP_Z_POINTS + 2].unk0 = 10;
    map[6 * MAP_Z_POINTS + 2].unk4 = diagonal;
    map[6 * MAP_Z_POINTS + 3].unk0 = 20;
    map[7 * MAP_Z_POINTS + 3].unk0 = 80;
    map[7 * MAP_Z_POINTS + 2].unk0 = 30;
    return map;
}

function analysis(ids: number[], roles: PathRole[] = ["animal"]): PathAnalysis {
    const path: LevelPath = { index: 7, waypoints: [
        { x: 10, z: 10, y: 0 },
        { x: 10, z: 10, y: 10 },
        { x: 0, z: 0, y: 1 },
    ] };
    return {
        paths: [{ path, roles, uses: ids.map((id, index) => ({
            pathId: 7, rawPathId: 7, role: "animal", commandIndex: index,
            source: null, target: { kind: "animal", index, id }, confidence: "static-target",
        })) }],
        invalidUses: [], diagnostics: [], unresolvedCommandCount: 0,
    };
}

test("source locomotion classes exclude flying fox, birds, helis and fish but include ground and sinking species", () => {
    for (const id of [1, 2, 3, 8, 27, 31, 33, 37, 44, 49, 59, 67])
        equal(getAnimalLocomotion(id), "land");
    for (const id of [0, 5, 7, 11, 14, 21, 25, 43, 45, 48])
        equal(getAnimalLocomotion(id), "air");
    for (const id of [12, 30, 66])
        equal(getAnimalLocomotion(id), "swim");
    for (const id of [-1, 68, 255, 1.5, NaN])
        equal(getAnimalLocomotion(id), "unknown");
    for (let id = 0; id < 68; id++)
        notStrictEqual(getAnimalLocomotion(id), "unknown");
});

test("ground projection uses offset X/Z, map origin and one Z mirror, snapping both up and down", () => {
    const input = analysis([33]);
    const before = JSON.stringify(input);
    const map = terrain();
    const mapBefore = JSON.stringify(map);
    const authored = createPathDisplayVariants(input);
    const result = createGroundSnappedPathDisplayVariants(input, map);
    deepStrictEqual(result[0].points, [
        [672, 200 + PATH_GROUND_CLEARANCE, 6496],
        [672, 200 + PATH_GROUND_CLEARANCE, 6496],
        [32, 96, 7136],
    ]);
    deepStrictEqual(result[0].animalProjection, {
        kind: "ground", consumers: [{ kind: "animal", index: 0, id: 33 }],
        unsampledIndices: [2], belowGroundCount: 1,
    });
    deepStrictEqual(authored[0].points, [[672, 32, 6496], [672, 672, 6496], [32, 96, 7136]]);
    deepStrictEqual(createPathDisplayVariants(input), authored);
    equal(JSON.stringify(input), before);
    equal(JSON.stringify(map), mapBefore);
});

test("projection respects the alternate base-terrain diagonal without sampling water or upper terrain", () => {
    const result = createGroundSnappedPathDisplayVariants(analysis([44]), terrain(1));
    equal(result[0].points[0][1], 360 + PATH_GROUND_CLEARANCE);
});

test("excluded and unknown animal targets retain authored geometry, as do every other role", () => {
    for (const id of [0, 7, 11, 12, 30, 66, 255]) {
        const input = analysis([id], ["camera", "animal", "object", "unresolved"]);
        deepStrictEqual(createGroundSnappedPathDisplayVariants(input, terrain()), createPathDisplayVariants(input));
    }
    const input = analysis([33], ["camera", "animal", "object", "unresolved"]);
    const result = createGroundSnappedPathDisplayVariants(input, terrain());
    const authored = createPathDisplayVariants(input);
    for (let i = 0; i < result.length; i++) {
        if (result[i].role !== "animal")
            deepStrictEqual(result[i], authored[i]);
    }
});

test("shared animal paths split land from excluded and unknown consumers, deduplicating placement uses", () => {
    const input = analysis([33, 0, 12, 255]);
    input.paths[0].uses.push({ ...input.paths[0].uses[0], commandIndex: 10 });
    const result = createGroundSnappedPathDisplayVariants(input, terrain());
    equal(result.length, 2);
    deepStrictEqual(result.map((variant) => variant.animalProjection?.kind), ["ground", "authored"]);
    deepStrictEqual(result[0].animalProjection?.consumers.map((target) => target.id), [33]);
    deepStrictEqual(result[1].animalProjection?.consumers.map((target) => target.id), [0, 12, 255]);
    deepStrictEqual(result[1].points, createPathDisplayVariants(input)[0].points);
    equal(createPathDisplayVariants(input).length, 1);
});

test("eligibility comes from target rather than script owner, with unattributed animal uses preserved", () => {
    const input = analysis([12]);
    input.paths[0].uses[0].source = {
        entity: { kind: "animal", index: 9, id: 33 }, activation: "initial", scriptBase: 0, initialCursor: 0,
    };
    equal(createGroundSnappedPathDisplayVariants(input, terrain())[0].animalProjection, undefined);
    input.paths[0].uses[0].target = { kind: "animal", index: 8, id: 33 };
    input.paths[0].uses.push({ ...input.paths[0].uses[0], target: null });
    const result = createGroundSnappedPathDisplayVariants(input, terrain());
    equal(result.length, 2);
    equal(result[0].animalProjection?.consumers[0].index, 8);
    equal(result[1].animalProjection?.kind, "authored");
});

test("missing terrain, empty paths and unidentified consumers remain explicit", () => {
    const input = analysis([33]);
    const projected = createGroundSnappedPathDisplayVariants(input, [])[0];
    deepStrictEqual(projected.points, createPathDisplayVariants(input)[0].points);
    deepStrictEqual(projected.animalProjection?.unsampledIndices, [0, 1, 2]);
    input.paths[0].path.waypoints = [];
    deepStrictEqual(createGroundSnappedPathDisplayVariants(input, terrain())[0].points, []);
    input.paths[0].uses = [];
    equal(createGroundSnappedPathDisplayVariants(input, terrain())[0].animalProjection, undefined);
    input.paths[0].roles = [];
    deepStrictEqual(createGroundSnappedPathDisplayVariants(input, terrain()), createPathDisplayVariants(input));
    ok(createGroundSnappedPathDisplayVariants({ ...input, paths: [] }, terrain()).length === 0);
});
