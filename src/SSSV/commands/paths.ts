import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { assert } from "../../util.js";
import { mirrorZ } from "../core/level.js";
import type { LevelAnimalPlacement, LevelLink, LevelMapEntry, LevelObjectPlacement, LevelPath } from "../core/level.js";
import { getAnimalLocomotion } from "../animals/animal_locomotion.js";
import { sampleGroundHeight } from "../render/terrain_height.js";

export interface LevelCommand {
    index: number;
    opcode: number;
    raw: ArrayBufferSlice;
    payload: ArrayBufferSlice;
}

export function parseCommands(data: ArrayBufferSlice | null): LevelCommand[] {
    if (data === null)
        return [];
    assert(data.byteLength >= 2, "Commands: payload too small");
    const view = data.createDataView();
    const byteCount = view.getUint16(0, false);
    assert(byteCount === data.byteLength, "Commands: byte count does not match payload size");
    assert((byteCount - 2) % 10 === 0, "Commands: records truncated");
    const commands: LevelCommand[] = [];
    for (let offset = 2; offset < byteCount; offset += 10) {
        commands.push({
            index: commands.length,
            opcode: view.getUint16(offset, false),
            raw: data.subarray(offset, 10),
            payload: data.subarray(offset + 2, 8),
        });
    }
    return commands;
}

export type PathRole = "camera" | "animal" | "object" | "unresolved";

export interface PathEntity {
    kind: "animal" | "object";
    index: number | null;
    id: number;
    spawnCommandIndex?: number;
    spawnOwner?: string;
}

export interface PathScriptSource {
    entity: PathEntity;
    activation: "initial" | "event" | "handoff";
    assignmentCommandIndex?: number;
    scriptBase: number;
    initialCursor: number;
}

export interface PathUse {
    pathId: number;
    rawPathId: number;
    role: PathRole;
    commandIndex: number;
    source: PathScriptSource | null;
    target: PathEntity | null;
    confidence: "opcode" | "static-target" | "unresolved";
}

export interface PathInfo {
    path: LevelPath;
    roles: PathRole[];
    uses: PathUse[];
}

export interface PathDiagnostic {
    kind: "invalid-path" | "invalid-command" | "unsupported-command" | "analysis-limit";
    commandIndex: number;
    source: PathScriptSource | null;
    message: string;
    pathId?: number;
}

export interface PathAnalysis {
    paths: PathInfo[];
    invalidUses: PathUse[];
    diagnostics: PathDiagnostic[];
    unresolvedCommandCount: number;
}

interface SavedScriptState {
    base: number;
    cursor: number;
    loopCursor: number | null;
    deferred: number[];
}

interface ScriptState extends SavedScriptState {
    owner: string;
    source: PathScriptSource;
    refs: Record<string, (string | null)[]>;
    spawned: string[];
    rewindCursor: number | null;
    returnState: SavedScriptState | null;
}

const MAX_SCRIPT_STATES = 4096;

const TARGET_PRESERVING_COMMANDS = new Set([
    0x00, 0x06, 0x0B, 0x0C, 0x0D, 0x0F, 0x12,
    0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D,
    0x1E, 0x1F, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26,
    0x27, 0x28, 0x29, 0x2A, 0x2B, 0x2C, 0x2E, 0x2F, 0x30,
    0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
    0x3A, 0x3C, 0x3E, 0x3F, 0x40, 0x41, 0x44, 0x46, 0x47,
    0x4B, 0x4C, 0x4D, 0x4E, 0x4F, 0x50, 0x51, 0x52, 0x53,
    0x54, 0x55, 0x57, 0x58, 0x59, 0x5A, 0x5B, 0x5C, 0x5D,
    0x5E, 0x61, 0x62, 0x63, 0x64,
]);

export function pathEntityKey(entity: PathEntity): string {
    return entity.index !== null ? `${entity.kind}:${entity.index}` : `${entity.spawnOwner}/spawn:${entity.spawnCommandIndex}`;
}

export function describePathEntity(entity: PathEntity): string {
    return entity.index !== null ? `${entity.kind}[${entity.index}] ID ${entity.id}`
        : `${entity.kind} ID ${entity.id} spawned at command ${entity.spawnCommandIndex} (${entity.spawnOwner})`;
}

function commandPathId(command: LevelCommand): number | null {
    const view = command.payload.createDataView();
    switch (command.opcode) {
        case 0x1D: return view.getUint16(0, false);
        case 0x34: return view.getUint8(1);
        case 0x50: return view.getUint8(0);
        default: return null;
    }
}

export function analyzePathUses(
    paths: LevelPath[], commands: LevelCommand[],
    objects: Pick<LevelObjectPlacement, "id" | "commandReferenceIdx" | "commandsLength" | "unk12">[],
    animals: Pick<LevelAnimalPlacement, "id" | "unkC" | "unkE">[],
    links: readonly LevelLink[] = [],
): PathAnalysis {
    const result: PathAnalysis = {
        paths: paths.map((path) => ({ path, roles: [], uses: [] })),
        invalidUses: [], diagnostics: [], unresolvedCommandCount: 0,
    };
    const byId = new Map(result.paths.map((info) => [info.path.index, info]));
    const contextualCommands = new Set<number>();
    const useKeys = new Set<string>();
    const diagnosticKeys = new Set<string>();
    const sources: PathScriptSource[] = [];
    const entities = new Map<string, PathEntity>();
    const initialRefs: ScriptState["refs"] = {};

    const diagnose = (diagnostic: PathDiagnostic): void => {
        const key = JSON.stringify(diagnostic);
        if (!diagnosticKeys.has(key)) {
            diagnosticKeys.add(key);
            result.diagnostics.push(diagnostic);
        }
    };
    const addUse = (command: LevelCommand, source: PathScriptSource | null, target: PathEntity | null): void => {
        const rawPathId = commandPathId(command);
        if (rawPathId === null)
            return;
        const role: PathRole = command.opcode === 0x50 ? "camera" : target?.kind ?? "unresolved";
        const narrowed = rawPathId & 0xFF;
        const ids = command.opcode === 0x1D && rawPathId !== narrowed
            ? role === "animal" ? [narrowed] : role === "object" ? [rawPathId] : [rawPathId, narrowed]
            : [rawPathId];
        for (const pathId of ids) {
            const use: PathUse = {
                pathId, rawPathId, role, commandIndex: command.index, source,
                target: role === "camera" ? null : target,
                confidence: role === "camera" ? "opcode" : role === "unresolved" ? "unresolved" : "static-target",
            };
            const key = JSON.stringify(use);
            if (useKeys.has(key))
                continue;
            useKeys.add(key);
            const info = byId.get(pathId);
            if (info === undefined) {
                result.invalidUses.push(use);
                diagnose({ kind: "invalid-path", commandIndex: command.index, source, pathId, message: `Path ${pathId} is outside the path bank` });
            } else {
                info.uses.push(use);
                if (!info.roles.includes(role))
                    info.roles.push(role);
            }
        }
    };
    const addSource = (entity: PathEntity, activation: PathScriptSource["activation"], reference: number, cursor: number): void => {
        entities.set(pathEntityKey(entity), entity);
        if (reference !== 0)
            sources.push({ entity, activation, scriptBase: reference - 1, initialCursor: cursor & 0xFF });
    };
    objects.forEach((object, index) => {
        const entity: PathEntity = { kind: "object", index, id: object.id };
        addSource(entity, "initial", object.commandReferenceIdx, object.commandsLength);
        addSource(entity, "event", object.unk12, 0);
    });
    animals.forEach((animal, index) => {
        const entity: PathEntity = { kind: "animal", index, id: animal.id };
        addSource(entity, "initial", animal.unkC, 0);
        addSource(entity, "event", animal.unkE, 0);
    });
    for (const link of links) {
        const key = (index: number): string => index >= 1000 ? `animal:${index - 1000}` : `object:${index}`;
        const parent = key(link.parent), child = key(link.child), slot = 1 + (link.referenceIdx & 0xFF);
        if (!entities.has(parent) || slot > 7)
            continue;
        const refs = initialRefs[parent] ?? Array<string | null>(8).fill(null);
        refs[0] = parent;
        refs[slot] = entities.has(child) ? child : null;
        initialRefs[parent] = refs;
    }

    const resolve = (state: ScriptState, owner: string | null, ref: number): string | null => {
        if (owner === null)
            return null;
        if (ref === 0)
            return owner;
        if (ref === 12)
            ref = 0;
        if (ref < 0 || ref > 7)
            return null;
        return state.refs[owner]?.[ref] ?? (ref === 0 && state.refs[owner] === undefined ? owner : null);
    };
    const writeRef = (state: ScriptState, owner: string, slot: number, target: string | null): ScriptState["refs"] => {
        const refs = state.refs[owner]?.slice() ?? [owner, ...Array<string | null>(7).fill(null)];
        refs[slot] = target;
        return { ...state.refs, [owner]: refs };
    };

    for (const source of sources) {
        const queue: ScriptState[] = [{
            base: source.scriptBase, cursor: source.initialCursor, owner: pathEntityKey(source.entity), source,
            refs: initialRefs, spawned: [], loopCursor: null, deferred: [], rewindCursor: null, returnState: null,
        }];
        const visited = new Set<string>();
        for (let next = 0; next < queue.length; next++) {
            const state = queue[next];
            const key = JSON.stringify(state);
            if (visited.has(key))
                continue;
            const commandIndex = state.base + state.cursor;
            if (visited.size >= MAX_SCRIPT_STATES) {
                diagnose({ kind: "analysis-limit", commandIndex, source: state.source, message: "Script state limit reached; remaining consumers are unresolved" });
                break;
            }
            visited.add(key);
            if (state.base < 0 || commandIndex < 0 || commandIndex >= commands.length) {
                diagnose({ kind: "invalid-command", commandIndex, source: state.source, message: "Script points outside the command bank" });
                continue;
            }
            const command = commands[commandIndex];
            const view = command.payload.createDataView();
            const targetKey = resolve(state, state.owner, 12);
            const target = targetKey !== null ? entities.get(targetKey) ?? null : null;
            if (commandPathId(command) !== null) {
                contextualCommands.add(command.index);
                addUse(command, state.source, target);
            }
            const advance = (changes: Partial<ScriptState> = {}): void => {
                queue.push({ ...state, cursor: (state.cursor + 1) & 0xFF, ...changes });
            };
            const unsupported = (message: string): void => diagnose({ kind: "unsupported-command", commandIndex, source: state.source, message });
            const interrupt = (): void => {
                for (const cursor of state.deferred)
                    queue.push({ ...state, cursor, deferred: [], rewindCursor: null });
            };
            switch (command.opcode) {
                case 0x07:
                case 0x0A:
                    interrupt();
                    break;
                case 0x09:
                    break;
                case 0x02:
                    if (state.deferred.length < 4)
                        advance({ deferred: [...state.deferred, (view.getInt16(6, false) + 1) & 0xFF] });
                    else
                        unsupported("Deferred-condition capacity exceeded");
                    break;
                case 0x03: {
                    interrupt();
                    const rewind = (view.getUint8(0) & 0x40) !== 0;
                    const bookmark = state.rewindCursor ?? (rewind ? (state.cursor + 1) & 0xFF : null);
                    advance({ rewindCursor: rewind ? bookmark === 0 ? null : bookmark : null });
                    if (state.rewindCursor !== null)
                        queue.push({ ...state, cursor: (state.rewindCursor - 1) & 0xFF });
                    break;
                }
                case 0x06:
                    interrupt();
                    advance();
                    break;
                case 0x01:
                    advance();
                    if ((view.getUint8(0) & 0x40) === 0) {
                        advance({ cursor: (view.getInt16(6, false) + 1) & 0xFF });
                    } else {
                        let cursor = state.cursor;
                        let skipped = 0;
                        while (skipped < 255 && commands[state.base + ((cursor + 1) & 0xFF)]?.opcode === 0x01) {
                            cursor = (cursor + 1) & 0xFF;
                            skipped++;
                        }
                        advance({ cursor: (cursor + 1) & 0xFF });
                    }
                    break;
                case 0x04:
                    advance({ loopCursor: state.cursor });
                    break;
                case 0x05:
                    advance();
                    if (state.loopCursor !== null)
                        advance({ cursor: (state.loopCursor + 1) & 0xFF });
                    else
                        unsupported("Loop has no established bookmark; loop branch is unresolved");
                    break;
                case 0x08:
                    advance({ cursor: (view.getInt16(0, false) + 1) & 0xFF });
                    break;
                case 0x10:
                case 0x11:
                case 0x5F:
                case 0x60: {
                    const entity: PathEntity = {
                        kind: command.opcode === 0x10 || command.opcode === 0x11 ? "object" : "animal",
                        index: null, id: view.getUint8(0), spawnCommandIndex: commandIndex, spawnOwner: state.owner,
                    };
                    const spawnedKey = pathEntityKey(entity);
                    if (state.spawned.includes(spawnedKey) || state.spawned.length >= 16) {
                        unsupported("Repeated or excessive spawning requires runtime entity identities");
                        break;
                    }
                    entities.set(spawnedKey, entity);
                    advance({ refs: writeRef(state, state.owner, 7, spawnedKey), spawned: [...state.spawned, spawnedKey] });
                    break;
                }
                case 0x0E:
                case 0x4A: {
                    if (targetKey === null || target === null) {
                        unsupported("Script assignment has an unresolved target");
                        break;
                    }
                    const base = view.getUint16(0, false);
                    if (command.opcode === 0x4A && base === 0xFFFF) {
                        advance();
                        break;
                    }
                    const assignedSource: PathScriptSource = {
                        entity: target, activation: command.opcode === 0x4A ? "event" : "handoff", scriptBase: base, initialCursor: 0,
                        assignmentCommandIndex: commandIndex,
                    };
                    const assigned: ScriptState = {
                        ...state, base, cursor: 0, owner: targetKey, source: assignedSource,
                        refs: writeRef(state, targetKey, 0, targetKey), loopCursor: null, deferred: [],
                        rewindCursor: targetKey === state.owner ? state.rewindCursor : null,
                        returnState: targetKey === state.owner ? state.returnState : null,
                    };
                    queue.push(assigned);
                    if (targetKey !== state.owner || command.opcode === 0x4A)
                        advance({ refs: command.opcode === 0x4A ? state.refs : assigned.refs });
                    break;
                }
                case 0x14:
                    advance({ refs: writeRef(state, state.owner, 0, resolve(state, state.owner, view.getInt16(0, false))) });
                    break;
                case 0x56: {
                    const destination = resolve(state, state.owner, view.getInt16(0, false));
                    const slot = view.getInt16(2, false);
                    if (destination === null || slot < 0 || slot > 7) {
                        unsupported("Reference write has an unresolved destination or invalid slot");
                        break;
                    }
                    const from = resolve(state, state.owner, view.getInt16(4, false));
                    advance({ refs: writeRef(state, destination, slot, resolve(state, from, view.getInt16(6, false))) });
                    break;
                }
                case 0x48:
                    if (state.returnState !== null) {
                        unsupported("Nested calls overwrite the single saved script context");
                    } else {
                        advance({ base: view.getUint16(0, false), cursor: 0, loopCursor: null, deferred: [], returnState: {
                            base: state.base, cursor: state.cursor, loopCursor: state.loopCursor, deferred: state.deferred,
                        } });
                    }
                    break;
                case 0x49:
                    if (state.returnState !== null)
                        advance({ ...state.returnState, cursor: (state.returnState.cursor + 1) & 0xFF, returnState: null });
                    else
                        unsupported("Return has no established call context");
                    break;
                case 0x3D:
                case 0x65: {
                    const destination = view.getUint8(command.opcode === 0x3D ? 6 : 0);
                    if (destination === 32) {
                        unsupported("Runtime entity type change prevents further role attribution");
                    } else if (destination === 16) {
                        if (targetKey === null)
                            unsupported("Target write affects an unresolved entity");
                        else
                            advance({ refs: writeRef(state, targetKey, 0, null) });
                    } else {
                        advance();
                    }
                    break;
                }
                case 0x1D:
                case 0x34:
                    if (target?.kind !== "animal")
                        interrupt();
                    advance();
                    break;
                default:
                    if (TARGET_PRESERVING_COMMANDS.has(command.opcode))
                        advance();
                    else
                        unsupported(`Opcode 0x${command.opcode.toString(16)} is outside the supported static control/target analysis`);
                    break;
            }
        }
    }

    for (const command of commands) {
        if (!contextualCommands.has(command.index))
            addUse(command, null, null);
    }
    const unresolved = [...result.paths.flatMap((info) => info.uses), ...result.invalidUses]
        .filter((use) => use.role === "unresolved");
    result.unresolvedCommandCount = new Set(unresolved.map((use) => use.commandIndex)).size;
    return result;
}

export type PathDisplayRole = PathRole | "unclassified";

export interface PathDisplayVariant {
    pathId: number;
    role: PathDisplayRole;
    points: [number, number, number][];
    animalProjection?: {
        kind: "ground" | "authored";
        consumers: PathEntity[];
        unsampledIndices: number[];
        belowGroundCount: number;
    };
}

export const PATH_GROUND_CLEARANCE = 8;

export function createPathDisplayVariants(analysis: PathAnalysis): PathDisplayVariant[] {
    const variants: PathDisplayVariant[] = [];
    for (const info of analysis.paths) {
        const roles: PathDisplayRole[] = info.roles.length !== 0 ? info.roles : ["unclassified"];
        for (const role of roles) {
            const halfTileXZ = role === "animal" || role === "object" ? 32 : 0;
            const halfTileY = role === "animal" ? 32 : 0;
            variants.push({
                pathId: info.path.index, role,
                points: info.path.waypoints.map((point) => [point.x * 64 + halfTileXZ, point.y * 64 + halfTileY, mirrorZ(point.z * 64 + halfTileXZ)]),
            });
        }
    }
    return variants;
}

export function createGroundSnappedPathDisplayVariants(analysis: PathAnalysis, map: readonly LevelMapEntry[]): PathDisplayVariant[] {
    const byId = new Map(analysis.paths.map((info) => [info.path.index, info]));
    return createPathDisplayVariants(analysis).flatMap((variant) => {
        if (variant.role !== "animal")
            return [variant];
        const info = byId.get(variant.pathId)!;
        const consumers = new Map<string, PathEntity>();
        for (const use of info.uses) {
            if (use.role === "animal" && use.target?.kind === "animal")
                consumers.set(pathEntityKey(use.target), use.target);
        }
        const land = Array.from(consumers.values()).filter((target) => getAnimalLocomotion(target.id) === "land");
        if (land.length === 0)
            return [variant];
        const other = Array.from(consumers.values()).filter((target) => getAnimalLocomotion(target.id) !== "land");
        const unsampledIndices: number[] = [];
        let belowGroundCount = 0;
        const points = info.path.waypoints.map((point, index): [number, number, number] => {
            const x = point.x * 64 + 32;
            const z = point.z * 64 + 32;
            const ground = sampleGroundHeight(map, x, z);
            if (ground === null) {
                unsampledIndices.push(index);
                return variant.points[index];
            }
            if (variant.points[index][1] < ground)
                belowGroundCount++;
            return [x, ground + PATH_GROUND_CLEARANCE, mirrorZ(z)];
        });
        const snapped: PathDisplayVariant = {
            ...variant, points,
            animalProjection: { kind: "ground", consumers: land, unsampledIndices, belowGroundCount },
        };
        const hasUnattributedUse = info.uses.some((use) => use.role === "animal" && use.target === null);
        return other.length !== 0 || hasUnattributedUse
            ? [snapped, { ...variant, animalProjection: { kind: "authored", consumers: other, unsampledIndices: [], belowGroundCount: 0 } }]
            : [snapped];
    });
}
