import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { assert } from "../../util.js";
import type { SSSVManifest } from "../manifest.js";
import { parseParticleDefinition, parseTorchDriftTable, parseTorchParticleTextures, TORCH_PARTICLE_ASSETS } from "../particle_assets.js";

function read(path: string): ArrayBufferSlice {
    return ArrayBufferSlice.fromView(readFileSync(path));
}

function main(): void {
    let dataDir = "data/SSSV";
    let outDir = "data/SSSV/previews/particles";
    let romPath: string | null = null;
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
        assert(args[i + 1] !== undefined, `Missing value for ${args[i]}`);
        if (args[i] === "--data") dataDir = args[i + 1];
        else if (args[i] === "--out") outDir = args[i + 1];
        else if (args[i] === "--rom") romPath = args[i + 1];
        else throw new Error(`Unknown argument: ${args[i]}`);
    }
    const a = TORCH_PARTICLE_ASSETS;
    const manifest = JSON.parse(readFileSync(join(dataDir, "manifest.json"), "utf8")) as SSSVManifest;
    const definitionFile = manifest.particleAssets?.definitions.find(entry => entry.id === a.id)?.file;
    const driftFile = manifest.particleAssets?.driftTables.find(entry => entry.index === 0)?.file;
    assert(definitionFile !== undefined && driftFile !== undefined, "Extract particle assets before running the particle inventory");
    const definitionData = read(join(dataDir, definitionFile));
    const driftData = read(join(dataDir, driftFile));
    const segment1 = read(join(dataDir, "segments/segment1.bin"));
    const definition = parseParticleDefinition(definitionData);
    const drift = parseTorchDriftTable(driftData);
    const textures = parseTorchParticleTextures(segment1);
    assert(definition.flags === 0xD6 && definition.lifetime === 11 && definition.defaultSize === 20 && definition.motionTable === 1, "Unexpected US torch definition");
    assert(definition.frameTicks === 2 && definition.maxFrame === 6 && definition.renderGroup === 4, "Unexpected US torch animation layout");
    assert(textures.length === definition.maxFrame + 2, "Torch frame pairs exceed decoded atlas tiles");
    if (romPath !== null) {
        const rom = readFileSync(romPath);
        assert(Buffer.from(definition.raw).equals(rom.subarray(a.definitionRomStart, a.definitionRomStart + a.definitionSize)), "Particle definition differs from ROM");
        assert(Buffer.from(driftData.copyToBuffer()).equals(rom.subarray(a.driftRomStart, a.driftRomStart + a.driftCount * 6)), "Particle drift differs from ROM");
        const first = 0x398D0 + a.atlasOffset + a.firstAtlasTile * a.tileSize;
        const tiles = segment1.subarray(a.atlasOffset + a.firstAtlasTile * a.tileSize, a.textureCount * a.tileSize);
        assert(Buffer.from(tiles.copyToBuffer()).equals(rom.subarray(first, first + a.textureCount * a.tileSize)), "Particle atlas differs from ROM");
    }
    mkdirSync(outDir, { recursive: true });
    const image = (pixels: Uint8Array): string => {
        const png = new PNG({ width: a.width, height: a.height });
        png.data = Buffer.from(pixels);
        return PNG.sync.write(png).toString("base64");
    };
    const cells: string[] = [];
    for (let i = 0; i < textures.length; i++) {
        const pixels = textures[i].pixels.slice();
        for (let p = 3; p < pixels.length; p += 4)
            pixels[p] = 255;
        const png = image(pixels);
        writeFileSync(join(outDir, `torch-intensity-${i}.png`), Buffer.from(png, "base64"));
        cells.push(`<image x="${24 + i * 114}" y="82" width="96" height="96" href="data:image/png;base64,${png}"/><text x="${24 + i * 114}" y="198">tile ${a.firstAtlasTile + i}</text>`);
    }
    for (let i = 0; i <= definition.maxFrame; i++) {
        const first = textures[i], second = textures[i + 1];
        for (let blend = 0; blend < 2; blend++) {
            const fraction = blend * 128 / 256;
            const pixels = new Uint8Array(a.width * a.height * 4);
            for (let p = 0; p < pixels.length; p += 4) {
                const intensity = (first.pixels[p] * (1 - fraction) + second.pixels[p] * fraction) / 255;
                const prim = definition.primaryColor, env = definition.environmentColor;
                const shifts = [11, 6, 1];
                for (let c = 0; c < 3; c++) {
                    const primary = ((prim >> shifts[c]) & 31) * 8;
                    const environment = ((env >> shifts[c]) & 31) * 8;
                    const color = environment + (primary - environment) * intensity;
                    const checker = (((p / 4) % a.width >> 2) ^ ((p / 4 / a.width) >> 2)) & 1 ? 48 : 72;
                    pixels[p + c] = color * intensity + checker * (1 - intensity);
                }
                pixels[p + 3] = 255;
            }
            const png = image(pixels);
            cells.push(`<image x="${24 + i * 114}" y="${228 + blend * 142}" width="96" height="96" href="data:image/png;base64,${png}"/><text x="${24 + i * 114}" y="${344 + blend * 142}">pair ${i}, lod ${blend * 128}</text>`);
        }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="550"><rect width="100%" height="100%" fill="#20242a"/><g fill="#eee" font-family="monospace" font-size="12"><text x="24" y="28" font-size="18">SSSV torch particle 63: source asset contact sheet</text><text x="24" y="52">16x16 I4; segment 1 0x23D50; linear bytes; nearest scaling</text><g style="image-rendering:pixelated">${cells.join("")}</g><text x="24" y="520">Top: raw intensity. Below: paired samples and group-4 colour/alpha combine on checkerboard.</text><text x="24" y="540">Asset preview only: no particle simulation, camera projection or in-game validation.</text></g></svg>`;
    writeFileSync(join(outDir, "torch-contact-sheet.svg"), svg);
    const report = {
        id: a.id,
        definitionFile, definitionRomStart: a.definitionRomStart,
        definition: { ...definition, raw: Buffer.from(definition.raw).toString("hex") },
        driftFile, driftRomStart: a.driftRomStart, drift,
        textures: textures.map((texture, i) => ({ textureId: a.textureIdBase + i, segmentOffset: texture.dramAddr, atlasTile: a.firstAtlasTile + i })),
        framePairs: Array.from({ length: definition.maxFrame + 1 }, (_, i) => [a.textureIdBase + i, a.textureIdBase + i + 1]),
        romVerified: romPath !== null,
    };
    writeFileSync(join(outDir, "inventory.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(`Particle 63: ${definition.lifetime}-tick definition, ${textures.length} tiles, ${drift.length} drift vectors; ROM check ${romPath !== null ? "passed" : "not requested"}`);
    console.log(`Wrote ${join(outDir, "torch-contact-sheet.svg")} and inventory.json`);
}

main();
