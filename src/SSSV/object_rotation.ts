import { mat4 } from "gl-matrix";
import { mirrorZ } from "./level.js";
import type { LevelObjectPlacement } from "./level.js";
import type { LevelCommand } from "./paths.js";

export interface ObjectRotation {
    zPerTick: number;
    yPerTick: number;
}

export interface ObjectRotationTransform {
    rotation: ObjectRotation;
    placement: LevelObjectPlacement;
    scale: number;
    originY: number;
    localMatrix: mat4 | null;
}

export function readObjectRotation(placement: LevelObjectPlacement, commands: readonly LevelCommand[]): ObjectRotation | null {
    if (placement.commandReferenceIdx <= 0)
        return null;
    const base = placement.commandReferenceIdx - 1;
    let rotation: ObjectRotation | null = null;
    for (let cursor = placement.commandsLength; cursor <= 0xFF; cursor++) {
        const command = commands[base + cursor];
        if (command === undefined)
            return null;
        const view = command.payload.createDataView();
        switch (command.opcode) {
            case 0x32:
                if (rotation !== null || view.getUint8(0) !== 0x10 || view.getUint16(4) !== 0 || view.getInt16(2) >= 0x7F7F || view.getInt16(6) >= 0x7F7F)
                    return null;
                rotation = { zPerTick: view.getInt16(2), yPerTick: view.getInt16(6) };
                break;
            case 0x14:
            case 0x57:
                if (view.getUint32(0) !== 0 || view.getUint32(4) !== 0)
                    return null;
                break;
            case 0x3D:
                if (view.getInt16(0) !== 0 || view.getUint16(6) !== 0x1100)
                    return null;
                break;
            case 0x09:
                return view.getUint32(0) === 0 && view.getUint32(4) === 0 ? rotation : null;
            default:
                return null;
        }
    }
    return null;
}

export function computeObjectRotationMatrix(dst: mat4, state: ObjectRotationTransform, tick: number): void {
    const { placement, rotation, scale } = state;
    const zRotation = (placement.zRotation + rotation.zPerTick * tick) % 360;
    const yRotation = (placement.angle + rotation.yPerTick * tick) % 360;
    mat4.fromTranslation(dst, [placement.x, placement.y + state.originY, placement.z]);
    mat4.rotateY(dst, dst, yRotation * Math.PI / 180);
    mat4.rotateX(dst, dst, -zRotation * Math.PI / 180);
    mat4.scale(dst, dst, [scale, scale, scale]);
    if (state.localMatrix !== null)
        mat4.mul(dst, dst, state.localMatrix);
    for (let row = 0; row < 4; row++) {
        const y = dst[4 + row];
        dst[4 + row] = dst[8 + row];
        dst[8 + row] = y;
    }
    dst[2] = -dst[2];
    dst[6] = -dst[6];
    dst[10] = -dst[10];
    dst[14] = mirrorZ(dst[14]);
}
