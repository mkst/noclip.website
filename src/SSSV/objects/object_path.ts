import { mat4 } from "gl-matrix";
import { composeObjectMatrix } from "./object_matrix.js";
import type { ObjectMatrixTransform } from "./object_matrix.js";
import type { LevelObjectPlacement, LevelPath } from "../core/level.js";
import type { LevelCommand, PathAnalysis } from "../commands/paths.js";

export interface ObjectPathPilot {
    commandIndex: number;
    path: LevelPath;
    speedPerTick: number;
    direction: 1 | -1;
    loop: boolean;
}

export interface ObjectPathPreviewTime {
    startTick: number | null;
}

// Body and shadow share the placed object's first eligible render time, including live mode.
export function getObjectPathPreviewTick(time: ObjectPathPreviewTime, sceneTick: number): number {
    if (time.startTick === null || sceneTick < time.startTick)
        time.startTick = sceneTick;
    return sceneTick - time.startTick;
}

export interface ObjectPathTransform extends ObjectMatrixTransform {
    pilot: ObjectPathPilot;
    placement: LevelObjectPlacement;
}

export interface ObjectPathShadowMotion {
    pilot: ObjectPathPilot;
    placement: LevelObjectPlacement;
}

export function readObjectPathPilot(placement: LevelObjectPlacement, placementIndex: number, commands: readonly LevelCommand[], analysis: PathAnalysis | null): ObjectPathPilot | null {
    if (placement.commandReferenceIdx <= 0 || analysis === null)
        return null;
    const base = placement.commandReferenceIdx - 1;
    const initialCursor = placement.commandsLength & 0xFF;
    const start = base + initialCursor;
    const candidates = analysis.paths.flatMap((info) => info.uses.filter((use) =>
        use.role === "object" && use.confidence === "static-target" &&
        use.target?.kind === "object" && use.target.index === placementIndex && use.target.id === placement.id &&
        use.source?.entity.kind === "object" && use.source.entity.index === placementIndex &&
        use.source.activation === "initial" && use.source.scriptBase === base && use.source.initialCursor === initialCursor &&
        use.commandIndex >= start && use.commandIndex < start + 16,
    ).map((use) => ({ path: info.path, commandIndex: use.commandIndex })));
    candidates.sort((a, b) => a.commandIndex - b.commandIndex);
    const candidate = candidates[0];
    if (candidate === undefined)
        return null;
    const command = commands[candidate.commandIndex];
    if (command === undefined || (command.opcode !== 0x1D && command.opcode !== 0x34))
        return null;
    const view = command.payload.createDataView();
    const pathId = command.opcode === 0x1D ? view.getUint16(0, false) : view.getUint8(1);
    const speed = command.opcode === 0x1D ? view.getUint16(2, false) : view.getUint8(3);
    const direction = view.getInt8(5);
    const mode = view.getUint8(6);
    if (pathId !== candidate.path.index || candidate.path.waypoints.length < 4 || speed === 0 || speed > 255 ||
        (direction !== 1 && direction !== -1) || mode > 1)
        return null;
    return { commandIndex: candidate.commandIndex, path: candidate.path, speedPerTick: speed, direction, loop: mode === 0 };
}

function wrapIndex(index: number, length: number): number {
    return ((index % length) + length) % length;
}

export function computeObjectPathPosition(pilot: ObjectPathPilot, tick: number): [number, number, number] {
    const points = pilot.path.waypoints;
    let parameter = pilot.direction * pilot.speedPerTick * tick;
    if (pilot.loop) {
        const cycle = points.length * 128;
        parameter = ((parameter % cycle) + cycle) % cycle;
    } else {
        parameter = Math.max(0, Math.min((points.length - 1) * 128, parameter));
    }

    const segment = Math.floor(parameter / 128);
    const t = (parameter - segment * 128) / 128;
    const t2 = t * t;
    const t3 = t2 * t;
    const w0 = (-t3 + 3 * t2 - 3 * t + 1) / 6;
    const w1 = (3 * t3 - 6 * t2 + 4) / 6;
    const w2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
    const w3 = t3 / 6;

    const index = (value: number): number => pilot.loop
        ? wrapIndex(value, points.length)
        : Math.max(0, Math.min(points.length - 1, value));
    const p0 = points[index(segment - 1)];
    const p1 = points[index(segment + 0)];
    const p2 = points[index(segment + 1)];
    const p3 = points[index(segment + 2)];

    const x = (w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x) * 64 + 32;
    const z = (w0 * p0.z + w1 * p1.z + w2 * p2.z + w3 * p3.z) * 64 + 32;
    const y = (w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y) * 64;
    return [x, y, z];
}

export function computeObjectPathMatrix(dst: mat4, state: ObjectPathTransform, tick: number): void {
    const { placement } = state;
    const position = computeObjectPathPosition(state.pilot, tick);
    composeObjectMatrix(dst, state, position, placement.angle, placement.zRotation);
}

export function computeObjectPathShadowMatrix(dst: mat4, state: ObjectPathShadowMotion, tick: number): void {
    const position = computeObjectPathPosition(state.pilot, tick);
    mat4.fromTranslation(dst, [
        position[0] - state.placement.x,
        position[1] - state.placement.y,
        -(position[2] - state.placement.z),
    ]);
}
