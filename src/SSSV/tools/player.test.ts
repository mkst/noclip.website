import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { parseLevelDat } from "../level.js";
import { createAnimalMarkers, createPlayerPlacement } from "../animals.js";

test("player species and heading come from dat rather than can/object rotation", () => {
    const bytes = new Uint8Array(0x9C), view = new DataView(bytes.buffer);
    view.setUint16(0x1A, 31, false); view.setInt16(0x4E, 90, false);
    const dat = parseLevelDat(ArrayBufferSlice.fromView(bytes));
    equal(dat.startingAnimalId, 31); equal(dat.startHeading, 90);
    const player = createPlayerPlacement(dat, [{ id: 55, x: 500, z: 600, y: 80 }]);
    deepEqual(player, { id: 31, x: 500, z: 600, y: 88, rotation: 64, health: 127, unkC: 0, unkE: 0 });
});

test("player follows the source last entrance and does not invent a spawn without an entrance", () => {
    const dat = { startingAnimalId: 61, startHeading: -90 };
    equal(createPlayerPlacement(dat, []), null);
    equal(createPlayerPlacement(dat, [{ id: 54, x: 1, z: 2, y: 3 }]), null);
    const player = createPlayerPlacement(dat, [{ id: 55, x: 1, z: 2, y: 3 }, { id: 55, x: 10, z: 20, y: 30 }]);
    equal(player?.x, 10); equal(player?.y, 38); equal(player?.rotation, 192);
    equal(createPlayerPlacement({ ...dat, startHeading: 60 }, [{ id: 55, x: 1, z: 2, y: 3 }])?.rotation, 42);
});

test("player marker is separate from authored placements and labels unsupported species too", () => {
    const player = { id: 31, x: 500, z: 600, y: 88, rotation: 64, health: 127, unkC: 0, unkE: 0 };
    const authored = [{ ...player, id: 33 }];
    deepEqual(createAnimalMarkers(authored, player).map(m => m.label), ["SHEEP", "PLAYER (DOG)"]);
    equal(authored.length, 1); equal(authored[0].id, 33);
    equal(createAnimalMarkers([], { ...player, id: 61 })[0].label, "PLAYER (EVO_MICROCHIP)");
    equal(createAnimalMarkers([], { ...player, id: 100 })[0].label, "PLAYER (ANIMAL_100)");
    equal(createAnimalMarkers([], null).length, 0);
});
