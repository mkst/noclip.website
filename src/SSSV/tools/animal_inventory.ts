import { readFileSync } from "node:fs";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { assert, assertExists } from "../../util.js";
import { ANIMAL_NAMES } from "../animals/animals.js";
import { classifyAnimalHealth, indexAnimalPlacements } from "../animals/animal_contracts.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLevelDat } from "../core/level.js";
import { BIOME_SEGMENTS, LEVELS } from "../core/level_table.js";

interface PlacementRecord {
    level: string;
    index: number;
    health: number;
    rotation: number;
}

interface AnimalSummary {
    id: number;
    name: string;
    health: Record<"positive" | "zero" | "negative", number>;
    levels: Map<string, { biome: string; indices: number[] }>;
    placements: PlacementRecord[];
}

function read(path: string): ArrayBufferSlice {
    return ArrayBufferSlice.fromView(readFileSync(path));
}

function buildInventory(): AnimalSummary[] {
    const summaries = new Map<number, AnimalSummary>();

    for (const level of LEVELS) {
        const payloads = parseLevelContainer(read(`data/SSSV/levels/${level.id}.bin`));
        const can = assertExists(findPayload(payloads, LevelPayloadType.Can), `${level.id}: missing can`);
        const dat = parseLevelDat(assertExists(findPayload(payloads, LevelPayloadType.Dat), `${level.id}: missing dat`));
        const biome = BIOME_SEGMENTS[dat.segment];
        assert(biome !== undefined, `${level.id}: unsupported animal asset segment ${dat.segment}`);

        for (const { placementIndex, placement } of indexAnimalPlacements(parseAnimals(can))) {
            const id = placement.id;
            const name = ANIMAL_NAMES[id];
            assert(name !== undefined, `${level.id}[${placementIndex}]: unknown animal ID ${id}`);

            let summary = summaries.get(id);
            if (summary === undefined) {
                summary = {
                    id,
                    name,
                    health: { positive: 0, zero: 0, negative: 0 },
                    levels: new Map(),
                    placements: [],
                };
                summaries.set(id, summary);
            }

            summary.health[classifyAnimalHealth(placement.health)]++;
            let levelUse = summary.levels.get(level.id);
            if (levelUse === undefined) {
                levelUse = { biome, indices: [] };
                summary.levels.set(level.id, levelUse);
            }
            levelUse.indices.push(placementIndex);
            summary.placements.push({ level: level.id, index: placementIndex, health: placement.health, rotation: placement.rotation });
        }
    }

    return Array.from(summaries.values()).sort((a, b) => a.id - b.id);
}

function formatMarkdown(summaries: AnimalSummary[]): string {
    const count = summaries.reduce((sum, animal) => sum + animal.placements.length, 0);
    const health = summaries.reduce((totals, animal) => ({
        positive: totals.positive + animal.health.positive,
        zero: totals.zero + animal.health.zero,
        negative: totals.negative + animal.health.negative,
    }), { positive: 0, zero: 0, negative: 0 });
    const lines = [
        `# Authored animal placement inventory`,
        ``,
        `Records: ${count}; placed IDs: ${summaries.length}; health classes: ${health.positive} positive, ${health.zero} zero, ${health.negative} negative.`,
        ``,
        `All records come from raw ".can" arrays; displayed indices are stable per-level record indices. With ".can" loader argument 0, source spawn selects injured mode for positive health and deactivated mode for zero/negative health. This describes spawn setup, not later command execution.`,
        ``,
        `| ID | Animal | Count | Health (+ / 0 / -) | Levels and placement indices | Segment 4 bank(s) |`,
        `|---:|---|---:|---:|---|---|`,
    ];

    for (const animal of summaries) {
        const levels = Array.from(animal.levels, ([name, use]) => `${name} [${use.indices.join(",")}]`).join("; ");
        const banks = Array.from(new Set(Array.from(animal.levels.values(), (use) => use.biome))).join(", ");
        lines.push(`| ${animal.id} | ${animal.name} | ${animal.placements.length} | ${animal.health.positive} / ${animal.health.zero} / ${animal.health.negative} | ${levels} | ${banks} |`);
    }

    lines.push("", "## Placement facts", "", "`index: health / rotation` per level. Rotation is raw `.can.rotation`; source stores it as heading without degree conversion.", "");
    for (const animal of summaries) {
        const records = animal.placements.map((p) => `${p.level}[${p.index}]: ${p.health} / ${p.rotation}`).join("; ");
        lines.push(`- ${animal.name} (${animal.id}): ${records}`);
    }
    return `${lines.join("\n")}\n`;
}

const summaries = buildInventory();
assert(summaries.length > 0, "animal inventory is empty");
console.log(formatMarkdown(summaries));
