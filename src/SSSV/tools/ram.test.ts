import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { RAM_STATIC_RECIPE, SPRINGY_RAM_STATIC_RECIPE, SHEEP_STATIC_RECIPE, SPRINGY_STATIC_RECIPE } from "../animals/sheep.js";
import { getStaticAnimalRecipe } from "../animals/animal_contracts.js";

test("RAM variants reuse source support and wool, replace the head and omit separate eyes", () => {
    for (const [ram, base] of [[RAM_STATIC_RECIPE, SHEEP_STATIC_RECIPE], [SPRINGY_RAM_STATIC_RECIPE, SPRINGY_STATIC_RECIPE]]) {
        equal(getStaticAnimalRecipe({ id: ram.animalId, health: 40 }), ram);
        equal(getStaticAnimalRecipe({ id: ram.animalId, health: 0 }), null);
        deepEqual(ram.pose.sample.jointPositions, base.pose.sample.jointPositions);
        equal(ram.parts.find(p => p.name === "head")?.address, 0x04003DE0);
        equal(ram.parts.length, base.parts.length - 2);
        ok(ram.parts.every(p => !p.name.endsWith("eye")));
        ok(ram.stateChanges.every(c => c.kind !== "load-eye-palette-frame"));
        deepEqual(ram.parts.filter(p => p.name.includes("leg")), base.parts.filter(p => p.name.includes("leg")));
        equal(ram.parts.find(p => p.name === "body")?.address, 0x04002D90);
    }
});
