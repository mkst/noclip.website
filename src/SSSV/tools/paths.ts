import { readFileSync } from "node:fs";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { findPayload, LevelPayloadType, parseAnimals, parseLevelContainer, parseLinks, parseMap, parseObjects, parsePaths } from "../level.js";
import { LEVELS } from "../level_table.js";
import { analyzePathUses, createGroundSnappedPathDisplayVariants, parseCommands } from "../paths.js";
import type { PathRole } from "../paths.js";

const args = process.argv.slice(2);
const levels = args.includes("--all") ? LEVELS : LEVELS.filter((level) => level.id === (args[0] ?? "SMASHING_START"));
if (levels.length === 0)
    throw new Error(`Unknown level ${args[0]}`);

let totalPaths = 0;
let totalUnresolved = 0;
const totalRoles: Record<PathRole, number> = { camera: 0, animal: 0, object: 0, unresolved: 0 };
let totalUnclassified = 0;
let totalInvalidCommands = 0;
let totalUnattributed = 0;
let totalUnknownTargets = 0;
let totalAnalysisLimits = 0;
const groundTotals = { paths: 0, points: 0, zeroY: 0, belowGround: 0, unsampled: 0 };
for (const level of levels) {
    const payloads = parseLevelContainer(ArrayBufferSlice.fromView(readFileSync(`data/SSSV/levels/${level.id}.bin`)));
    const paths = parsePaths(findPayload(payloads, LevelPayloadType.Paf));
    const commands = parseCommands(findPayload(payloads, LevelPayloadType.Cmd));
    const objectData = findPayload(payloads, LevelPayloadType.Cob);
    const animalData = findPayload(payloads, LevelPayloadType.Can);
    const linkData = findPayload(payloads, LevelPayloadType.Joi);
    const result = analyzePathUses(paths, commands, objectData !== null ? parseObjects(objectData) : [], animalData !== null ? parseAnimals(animalData) : [], linkData !== null ? parseLinks(linkData) : []);
    const mapData = findPayload(payloads, LevelPayloadType.Map);
    const groundVariants = createGroundSnappedPathDisplayVariants(result, mapData !== null ? parseMap(mapData) : [])
        .filter((variant) => variant.animalProjection?.kind === "ground");
    const ground = {
        paths: groundVariants.length,
        points: groundVariants.reduce((sum, variant) => sum + variant.points.length, 0),
        zeroY: groundVariants.reduce((sum, variant) => sum + paths.find((path) => path.index === variant.pathId)!.waypoints.filter((point) => point.y === 0).length, 0),
        belowGround: groundVariants.reduce((sum, variant) => sum + variant.animalProjection!.belowGroundCount, 0),
        unsampled: groundVariants.reduce((sum, variant) => sum + variant.animalProjection!.unsampledIndices.length, 0),
    };
    for (const key of Object.keys(groundTotals) as (keyof typeof groundTotals)[])
        groundTotals[key] += ground[key];
    const countRole = (role: PathRole): number => result.paths.filter((path) => path.roles.includes(role)).length;
    const unclassified = result.paths.filter((path) => path.roles.length === 0).length;
    const invalidCommands = new Set(result.invalidUses.map((use) => use.commandIndex)).size;
    const stops = result.diagnostics.filter((diagnostic) => diagnostic.kind !== "invalid-path").length;
    const unresolvedUses = [...result.paths.flatMap((path) => path.uses), ...result.invalidUses].filter((use) => use.role === "unresolved");
    const unattributed = new Set(unresolvedUses.filter((use) => use.source === null).map((use) => use.commandIndex)).size;
    const unknownTargets = new Set(unresolvedUses.filter((use) => use.source !== null).map((use) => use.commandIndex)).size;
    const limits = result.diagnostics.filter((diagnostic) => diagnostic.kind === "analysis-limit");
    totalUnattributed += unattributed;
    totalUnknownTargets += unknownTargets;
    totalAnalysisLimits += limits.length;
    console.log(`${level.id}: ${paths.length} paths; roles camera=${countRole("camera")} animal=${countRole("animal")} object=${countRole("object")} unresolved=${countRole("unresolved")} unclassified=${unclassified}; ${result.unresolvedCommandCount} unresolved command references; ${invalidCommands} invalid path commands; ${stops} analysis diagnostics`);
    if (ground.paths !== 0)
        console.log(`  Land-animal ground projection: ${JSON.stringify(ground)}`);
    if (unattributed !== 0 || unknownTargets !== 0 || limits.length !== 0)
        console.log(`  Unresolved: ${unattributed} unattributed bank references, ${unknownTargets} traced commands with unknown targets; ${limits.length} analysis limits`);
    for (const diagnostic of limits)
        console.log(`  command ${diagnostic.commandIndex}: ${diagnostic.message}`);
    for (const diagnostic of result.diagnostics.filter((diagnostic) => diagnostic.kind === "invalid-path"))
        console.log(`  command ${diagnostic.commandIndex}: ${diagnostic.message}`);
    for (const role of Object.keys(totalRoles) as PathRole[])
        totalRoles[role] += countRole(role);
    totalUnclassified += unclassified;
    totalInvalidCommands += invalidCommands;
    totalPaths += paths.length;
    totalUnresolved += result.unresolvedCommandCount;
}
console.log(`Total: ${levels.length} levels, ${totalPaths} paths, ${totalUnresolved} unresolved command references`);
console.log(`Path roles (may overlap): ${JSON.stringify(totalRoles)}; ${totalUnclassified} unclassified; ${totalInvalidCommands} invalid path commands`);
console.log(`Land-animal ground projection: ${JSON.stringify(groundTotals)}`);
console.log(`Unresolved evidence: ${totalUnattributed} unattributed bank references, ${totalUnknownTargets} traced commands with unknown targets; ${totalAnalysisLimits} analysis limits`);
