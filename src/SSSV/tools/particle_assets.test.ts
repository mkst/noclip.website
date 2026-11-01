import { deepEqual, equal, throws } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { parseParticleDefinition, parseTorchDriftTable, parseTorchParticleTextures, TORCH_PARTICLE_ASSETS } from "../effects/particle_assets.js";

const raw = Uint8Array.from(Buffer.from("00d61400000b0100000000020604ff80f800000000000000", "hex"));

test("torch definition retains raw bytes, source field offsets and colour sentinels", () => {
    const definition = parseParticleDefinition(ArrayBufferSlice.fromView(raw));
    deepEqual(definition, {
        raw, flags: 0xD6, defaultSize: 20, lifetime: 11, motionTable: 1,
        frameTicks: 2, maxFrame: 6, renderGroup: 4, primaryColor: 0xFF80, environmentColor: 0xF800,
    });
    const changed = raw.slice();
    changed[4] = changed[5] = 255;
    equal(parseParticleDefinition(ArrayBufferSlice.fromView(changed)).lifetime, -1);
    definition.raw[0] = 255;
    equal(raw[0], 0);
    throws(() => parseParticleDefinition(ArrayBufferSlice.fromView(raw.subarray(0, 23))));
    throws(() => parseParticleDefinition(ArrayBufferSlice.fromView(new Uint8Array(48))));
});

test("torch drift table reads signed big-endian X/Z/Y vectors without reordering", () => {
    const bytes = new Uint8Array(32 * 6), view = new DataView(bytes.buffer);
    for (let i = 0; i < 32; i++) {
        view.setInt16(i * 6, -512 + i); view.setInt16(i * 6 + 2, 256 - i); view.setInt16(i * 6 + 4, -i);
    }
    const drift = parseTorchDriftTable(ArrayBufferSlice.fromView(bytes));
    equal(drift.length, 32);
    deepEqual(drift[0], [-512, 256, 0]);
    deepEqual(drift[31], [-481, 225, -31]);
    throws(() => parseTorchDriftTable(ArrayBufferSlice.fromView(bytes.subarray(0, 190))));
});

test("torch frames decode high nibble first with linear rows, correct atlas/stride and adjacent-pair coverage", () => {
    const a = TORCH_PARTICLE_ASSETS;
    const end = a.atlasOffset + (a.firstAtlasTile + a.textureCount) * a.tileSize;
    const bytes = new Uint8Array(end);
    for (let frame = 0; frame < a.textureCount; frame++) {
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x += 2) {
                const first = (x + y * 3 + frame * 5) & 15, second = (first + 1) & 15;
                bytes[a.atlasOffset + (a.firstAtlasTile + frame) * a.tileSize + y * 8 + x / 2] = (first << 4) | second;
            }
        }
    }
    const textures = parseTorchParticleTextures(ArrayBufferSlice.fromView(bytes));
    equal(textures.length, 8);
    for (let frame = 0; frame < 8; frame++) {
        const texture = textures[frame];
        equal(texture.width, 16); equal(texture.height, 16);
        equal(texture.dramAddr, 0x23ED0 + frame * 128);
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const intensity = ((x + y * 3 + frame * 5) & 15) * 17;
                const p = (y * 16 + x) * 4;
                deepEqual(Array.from(texture.pixels.subarray(p, p + 4)), [intensity, intensity, intensity, intensity]);
            }
        }
    }
    equal(a.textureIdBase, 720);
    throws(() => parseTorchParticleTextures(ArrayBufferSlice.fromView(bytes.subarray(0, end - 1))));
});
