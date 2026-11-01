import { mat4 } from "gl-matrix";
import { composeObjectMatrix } from "./object_matrix.js";
import type { ObjectMatrixTransform } from "./object_matrix.js";
import type { LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";

export interface ObjectMotionSegment {
    commandIndex: number;
    start: [number, number, number];
    target: [number, number, number];
    speed: number;
    ticks: number;
}

export interface ObjectMotionPlan {
    segments: ObjectMotionSegment[];
    loop: boolean;
    totalTicks: number;
}

export interface ObjectMotionTransform extends ObjectMatrixTransform {
    plan: ObjectMotionPlan;
    placement: LevelObjectPlacement;
}

export interface ObjectShadowMotion {
    plan: ObjectMotionPlan;
    placement: LevelObjectPlacement;
}

const BENIGN_SETUP = new Set([0x46, 0x53, 0x57]);

function readMoveTarget(view: DataView, opcode: number, current: [number, number, number]): [number, number, number] | null {
    const x = view.getInt16(0, false);
    const z = view.getInt16(2, false);
    const y = view.getInt16(4, false);
    if (opcode === 0x19)
        return [x, y, z];
    if (x >= 0x7F7F || z >= 0x7F7F || y >= 0x7F7F)
        return null;
    return [current[0] + x, current[1] + y, current[2] + z];
}

export function readObjectMotion(placement: LevelObjectPlacement, commands: readonly LevelCommand[]): ObjectMotionPlan | null {
    if (placement.commandReferenceIdx <= 0)
        return null;

    const base = placement.commandReferenceIdx - 1;
    let cursor = base + placement.commandsLength;
    const segments: ObjectMotionSegment[] = [];
    let firstMoveCommand = -1;
    let loop = false;
    let yMovement = true;
    let current: [number, number, number] = [placement.x, placement.y, placement.z];

    for (let step = 0; step < 64; step++) {
        const command = commands[cursor];
        if (command === undefined)
            return null;
        const view = command.payload.createDataView();

        if (BENIGN_SETUP.has(command.opcode)) {
            if (command.opcode === 0x57)
                yMovement = (view.getUint16(0, false) & 2) === 0;
            cursor++;
            continue;
        }

        if (command.opcode === 0x19 || command.opcode === 0x1B) {
            const target = readMoveTarget(view, command.opcode, current);
            const speed = view.getInt16(6, false);
            if (target === null || speed <= 0 || speed > 256)
                return null;
            if (!yMovement)
                target[1] = current[1];
            const wait = commands[cursor + 1];
            if (wait === undefined || wait.opcode !== 0x03 || wait.payload.createDataView().getUint8(0) !== 5)
                return null;
            if (firstMoveCommand === -1)
                firstMoveCommand = cursor;
            const ticks = Math.ceil(256 / speed) + 1;
            segments.push({ commandIndex: cursor, start: current, target, speed, ticks });
            current = target;
            cursor += 2;
            continue;
        }

        if (command.opcode === 0x08) {
            const loopCommand = base + view.getUint16(0, false);
            if (segments.length === 0 || loopCommand > firstMoveCommand)
                return null;
            loop = true;
            break;
        }

        if (command.opcode === 0x09)
            break;

        return null;
    }

    if (segments.length === 0)
        return null;

    let totalTicks = 0;
    for (const segment of segments)
        totalTicks += segment.ticks;

    return { segments, loop, totalTicks };
}

export function computeObjectMotionPosition(plan: ObjectMotionPlan, tick: number): [number, number, number] {
    const segments = plan.segments;
    if (segments.length === 0)
        return [0, 0, 0];

    let local = plan.loop ? ((tick % plan.totalTicks) + plan.totalTicks) % plan.totalTicks : Math.min(Math.max(tick, 0), plan.totalTicks);
    for (const segment of segments) {
        if (local >= segment.ticks) {
            local -= segment.ticks;
            continue;
        }
        const velocity = Math.min(256, local * segment.speed);
        const progress = 0.5 - 0.5 * Math.cos(Math.PI * velocity / 256);
        return [
            segment.start[0] + (segment.target[0] - segment.start[0]) * progress,
            segment.start[1] + (segment.target[1] - segment.start[1]) * progress,
            segment.start[2] + (segment.target[2] - segment.start[2]) * progress,
        ];
    }

    const target = segments[segments.length - 1].target;
    return [target[0], target[1], target[2]];
}

export function computeObjectMotionMatrix(dst: mat4, state: ObjectMotionTransform, tick: number): void {
    const { placement } = state;
    const position = computeObjectMotionPosition(state.plan, tick);
    composeObjectMatrix(dst, state, position, placement.angle, placement.zRotation);
}

export function computeObjectShadowMotionMatrix(dst: mat4, state: ObjectShadowMotion, tick: number): void {
    const position = computeObjectMotionPosition(state.plan, tick);
    mat4.fromTranslation(dst, [
        position[0] - state.placement.x,
        position[1] - state.placement.y,
        -(position[2] - state.placement.z),
    ]);
}
