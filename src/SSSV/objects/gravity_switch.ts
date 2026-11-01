import { mat4, vec3, vec4 } from "gl-matrix";
import { cos256, sin256 } from "../core/degree_math.js";
import { mirrorZ } from "../core/level.js";
import type { LevelObjectPlacement } from "../core/level.js";
import { computeObjectRotationMatrix } from "./object_rotation.js";
import type { SSSVDrawCall } from "../render/terrain.js";

export interface GravitySwitchVisual {
    placement: LevelObjectPlacement;
    baseScale: number;
    collideHeight: number;
    state: number;
    enabled?: boolean;
    part: 'body' | 'arcA' | 'arcB' | 'ball';
}

export function sampleGravitySwitch(baseScale: number, state: number, tick: number) {
    tick = Math.max(0, Math.floor(tick));
    // Source seeds this phase randomly. Use zero for a deterministic startup preview.
    const amount = state === 1 ? Math.min(256, tick * 8) : 0;
    const phase = amount > 0 ? (tick * 4) & 255 : 0;
    const scale = amount > 0 ? Math.trunc(baseScale + (cos256(phase) >> 7) / 1.5) : baseScale;
    return { amount, phase, scale };
}

export function updateGravitySwitchVisual(call: SSSVDrawCall, tick: number): void {
    const visual = call.gravitySwitch;
    if (visual === null) return;
    const { placement: p, baseScale, collideHeight, state, part } = visual;
    const { amount, phase, scale } = sampleGravitySwitch(baseScale, state, tick);
    const height = (collideHeight * scale) >> 11;
    const matrix = call.modelMatrix!;
    if (part === 'ball') {
        call.switchBall!.size = Math.trunc(scale * 0.2) * 3 / 256;
        vec3.set(call.center, p.x, p.y + scale * 6 / 256, mirrorZ(p.z));
        mat4.fromTranslation(matrix, call.center);
        return;
    }
    let placement = p, originY = height / 2, modelScale = scale / 2048;
    if (part !== 'body') {
        const offset = ((cos256(phase) >> 7) * (height >> 2)) >> 8;
        const radius = (amount * Math.trunc(scale * 4)) >> 8;
        const smaller = (Math.abs(sin256(phase) >> 7) * radius) >> 8;
        const first = part === 'arcA';
        modelScale = ((first ? offset < 0 : offset >= 0) ? radius : smaller) / 65536;
        placement = { ...p, y: Math.trunc(p.y + height * 0.6) + (first ? offset : -offset), zRotation: first ? 20 : -20, angle: (phase * 360) >> 8 };
        originY = 0;
        const red = Math.min(255, Math.abs(sin256(phase) >> 7)), green = red >> 1;
        vec4.set(call.DP_PrimColor, (first ? 255 - red : red) / 255, (first ? 255 - green : green + 128) / 255, 1, 160 / 255);
        call.visible = amount > 0 && visual.enabled !== false;
    }
    computeObjectRotationMatrix(matrix, { placement, rotation: { zPerTick: 0, yPerTick: 0 }, scale: modelScale, originY, localMatrix: null }, 0);
}
