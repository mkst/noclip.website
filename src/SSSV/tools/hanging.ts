import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";

import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { assert } from "../../util.js";
import { findPayload, LevelPayloadType, parseHangingObjects, parseLevelContainer, parseObjects } from "../core/level.js";
import { HANGING_MATERIALS, HANGING_TEXTURE_STYLES, HANGING_TYPE_DESCRIPTORS, parseHangingTextures, resolveHangingObject } from "../objects/hanging.js";
import type { HangingMaterial, HangingPalette, HangingTextureStyle } from "../objects/hanging.js";
import type { LevelHangingPlacement } from "../core/level.js";
import { LEVELS } from "../core/level_table.js";

function read(path: string): ArrayBufferSlice {
    return ArrayBufferSlice.fromView(readFileSync(path));
}

function writePreview(path: string, texturePixels: Uint8Array, material: HangingMaterial | null): void {
    const size = 32;
    const scale = 4;
    const png = new PNG({ width: size * scale, height: size * scale, colorType: 6 });
    for (let y = 0; y < size * scale; y++) {
        for (let x = 0; x < size * scale; x++) {
            const src = ((y / scale) | 0) * size + ((x / scale) | 0);
            const intensity = texturePixels[src * 4 + 0] / 255;
            const alpha = texturePixels[src * 4 + 3] / 255;
            let r = intensity;
            let g = intensity;
            let b = intensity;
            if (material !== null) {
                r = (material.envColor[0] + (material.primColor[0] - material.envColor[0]) * intensity) / 255;
                g = (material.envColor[1] + (material.primColor[1] - material.envColor[1]) * intensity) / 255;
                b = (material.envColor[2] + (material.primColor[2] - material.envColor[2]) * intensity) / 255;
            }
            const checker = (((x >> 3) ^ (y >> 3)) & 1) !== 0 ? 56 : 88;
            const dst = (y * size * scale + x) * 4;
            png.data[dst + 0] = r * 255 * alpha + checker * (1 - alpha);
            png.data[dst + 1] = g * 255 * alpha + checker * (1 - alpha);
            png.data[dst + 2] = b * 255 * alpha + checker * (1 - alpha);
            png.data[dst + 3] = 255;
        }
    }
    writeFileSync(path, PNG.sync.write(png));
}

function main(): void {
    const outDir = join("data", "SSSV", "previews", "hanging");
    mkdirSync(outDir, { recursive: true });

    const segment1 = read(join("data", "SSSV", "segments", "segment1.bin"));
    const textures = parseHangingTextures(segment1);
    for (let i = 0; i < textures.length; i++)
        writePreview(join(outDir, `${HANGING_TEXTURE_STYLES[i]}-raw.png`), textures[i].pixels, null);

    const materialPreviews: [string, HangingTextureStyle, HangingPalette][] = [
        ['blue', 'blueGreen', 'blue'],
        ['green', 'blueGreen', 'green'],
        ['orange', 'orange', 'orange'],
        ['white', 'white', 'white'],
        ['lavender', 'lavender', 'lavender'],
    ];
    for (const [name, style, palette] of materialPreviews)
        writePreview(join(outDir, `${name}-material.png`), textures[HANGING_TEXTURE_STYLES.indexOf(style)].pixels, HANGING_MATERIALS[palette]);

    const counts = new Map<number, number>();
    let total = 0;
    for (const level of LEVELS) {
        const path = join("data", "SSSV", "levels", `${level.id}.bin`);
        if (!existsSync(path))
            continue;
        const payloads = parseLevelContainer(read(path));
        const chaData = findPayload(payloads, LevelPayloadType.Cha);
        if (chaData === null)
            continue;
        const cha = parseHangingObjects(chaData);
        const objects = parseObjects(assertPayload(payloads, LevelPayloadType.Cob, level.id));
        for (const placement of cha) {
            const descriptor = HANGING_TYPE_DESCRIPTORS.get(placement.type);
            assert(descriptor !== undefined, `${level.id}: unsupported hanging type ${placement.type}`);
            counts.set(placement.type, (counts.get(placement.type) ?? 0) + 1);
            total++;
            validateReference(level.id, placement, placement.anchorObjectIndex, objects);
            validateReference(level.id, placement, placement.endObjectIndex, objects);
        }
        console.log(`${level.id}: ${cha.length} hanging objects`);
    }

    assert(total === 50, `Expected 50 hanging objects, got ${total}`);
    console.log(`total: ${total}`);
    for (const [type, count] of [...counts.entries()].sort((a, b) => a[0] - b[0]))
        console.log(`  ${type.toString().padStart(2)} ${HANGING_TYPE_DESCRIPTORS.get(type)!.name}: ${count}`);
    console.log(`previews: ${outDir}`);
}

function assertPayload(payloads: ReturnType<typeof parseLevelContainer>, type: LevelPayloadType, level: string): ArrayBufferSlice {
    const data = findPayload(payloads, type);
    assert(data !== null, `${level}: missing payload ${type}`);
    return data;
}

function validateReference(level: string, placement: LevelHangingPlacement, index: number, objects: ReturnType<typeof parseObjects>): void {
    if (index === -1)
        return;
    assert(resolveHangingObject(objects, index) !== null, `${level}: hanging type ${placement.type} has invalid object reference ${index} (count ${objects.length})`);
}

main();
