import type { mat4 } from "gl-matrix";
import { composeObjectMatrix } from "./object_matrix.js";
import type { ObjectMatrixTransform } from "./object_matrix.js";
import type { LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";

export interface ObjectRotation {
    zPerTick: number;
    yPerTick: number;
}

export interface ObjectRotationTransform extends ObjectMatrixTransform {
    rotation: ObjectRotation;
    placement: LevelObjectPlacement;
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
    const { placement, rotation } = state;
    const zRotation = (placement.zRotation + rotation.zPerTick * tick) % 360;
    const yRotation = (placement.angle + rotation.yPerTick * tick) % 360;
    composeObjectMatrix(dst, state, [placement.x, placement.y, placement.z], yRotation, zRotation);
}
