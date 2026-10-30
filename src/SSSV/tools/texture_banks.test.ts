import { equal } from "node:assert/strict";
import { test } from "node:test";
import { getLevelRegularTextureBank } from "../level_table.js";

test("jungle and desert billboard banks follow the runtime's swapped lookup pointers", () => {
    equal(getLevelRegularTextureBank(3, 3)?.romStart, 0x50A4D0);
    equal(getLevelRegularTextureBank(2, 3)?.romStart, 0x514CB0);
    equal(getLevelRegularTextureBank(2, 2)?.romStart, 0x5137C0);
    equal(getLevelRegularTextureBank(3, 7)?.romStart, 0x5106E0);
});

test("Europe, ice and city billboard banks retain their runtime slots", () => {
    equal(getLevelRegularTextureBank(0, 2)?.romStart, 0x4FC110);
    equal(getLevelRegularTextureBank(1, 8)?.romStart, 0x507F90);
    equal(getLevelRegularTextureBank(4, 3)?.romStart, 0x4FD1E0);
    equal(getLevelRegularTextureBank(5, 3)?.romStart, 0x4FD1E0);
});

test("missing billboard slots do not select a neighbouring bank", () => {
    equal(getLevelRegularTextureBank(3, 0), undefined);
    equal(getLevelRegularTextureBank(1, 7), undefined);
    equal(getLevelRegularTextureBank(3, 11), undefined);
});
