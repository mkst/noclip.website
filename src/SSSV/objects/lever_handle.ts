import { mat4 } from "gl-matrix";
import type { LevelObjectPlacement } from "../core/level.js";
import { cos256, sinDegrees } from "../core/degree_math.js";
import { computeObjectRotationMatrix } from "./object_rotation.js";

export interface LeverHandleTransform {
    placement: LevelObjectPlacement;
    scale: number;
    collideHeight: number;
    initialPhase: number;
    phase: number;
}

export function stepLeverPhase(phase: number, state: number): number {
    return state === 1 ? Math.min(128, phase + 8) : Math.max(0, phase - 8);
}

export function leverHandleOffset(phase: number, scale: number, tilt: number, heading: number): [number, number, number] {
    const distance = ((cos256(phase) >> 9) * scale) >> 11;
    const horizontal = (-distance * sinDegrees(tilt)) >> 8;
    // func_802F5F44 rotates in integer units, then the caller shifts by 13 (1/8 world unit).
    return [((horizontal * sinDegrees(heading)) >> 8) / 8,
        ((distance * sinDegrees(tilt + 90)) >> 8) / 8,
        ((horizontal * sinDegrees(heading + 90)) >> 8) / 8];
}

export function computeLeverHandleMatrix(dst: mat4, state: LeverHandleTransform): void {
    const p = state.placement, offset = leverHandleOffset(state.phase, state.scale, p.zRotation, p.angle);
    computeObjectRotationMatrix(dst, {
        placement: { ...p, x: p.x + offset[0], y: p.y + offset[1], z: p.z + offset[2] },
        rotation: { zPerTick: 0, yPerTick: 0 }, scale: state.scale / 2048,
        originY: Math.floor(state.collideHeight * state.scale / 2048) / 2, localMatrix: null,
    }, 0);
}
