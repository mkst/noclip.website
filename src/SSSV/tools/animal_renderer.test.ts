import { deepStrictEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { sampleAnimalSpawnGroundHeight, resolveAnimalSpawnY } from "../animals/animal_renderer.js";
import type { LevelAnimalPlacement, LevelMapEntry } from "../core/level.js";
import { MAP_X_POINTS, MAP_Z_POINTS } from "../core/level.js";

function emptyMap(): LevelMapEntry[] {
    return Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({
        unk0: 0, unk1: 0, unk2: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0, unk7: 0,
    }));
}

function placement(y: number): LevelAnimalPlacement {
    return { id: 31, x: 672, z: 656, y, rotation: 0, health: 70, unkC: 0, unkE: 0 };
}

test("spawn ground clamp uses the source map diagonal and raises only below-ground Y", () => {
    const map = emptyMap();
    const a = map[6 * MAP_Z_POINTS + 2];
    map[6 * MAP_Z_POINTS + 3].unk0 = 20;
    map[7 * MAP_Z_POINTS + 3].unk0 = 80;
    map[7 * MAP_Z_POINTS + 2].unk0 = 30;
    a.unk0 = 10;
    equal(sampleAnimalSpawnGroundHeight(map, 672, 656), 180);
    equal(resolveAnimalSpawnY(placement(100), map), 180);
    equal(resolveAnimalSpawnY(placement(200), map), 200);
});

test("spawn ground clamp follows the alternate source diagonal and leaves unsupported borders explicit", () => {
    const map = emptyMap();
    const a = map[6 * MAP_Z_POINTS + 2];
    map[6 * MAP_Z_POINTS + 3].unk0 = 20;
    map[7 * MAP_Z_POINTS + 3].unk0 = 80;
    map[7 * MAP_Z_POINTS + 2].unk0 = 30;
    a.unk0 = 10; a.unk4 = 1;
    equal(sampleAnimalSpawnGroundHeight(map, 672, 656), 260);
    equal(sampleAnimalSpawnGroundHeight(map, 656, 672), 240);
    equal(sampleAnimalSpawnGroundHeight(map, 0, 0), null);
    deepStrictEqual(resolveAnimalSpawnY(placement(10), map), 260);
});
