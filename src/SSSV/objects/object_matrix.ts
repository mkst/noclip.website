import { mat4 } from "gl-matrix";
import { mirrorZ } from "../core/level.js";

export interface ObjectMatrixTransform {
    scale: number;
    originY: number;
    localMatrix: mat4 | null;
}

// Compose source-space parts before converting their axes to viewer space.
export function composeObjectMatrix(dst: mat4, state: ObjectMatrixTransform, position: readonly number[], angle: number, zRotation: number): void {
    const { scale } = state;
    mat4.fromTranslation(dst, [position[0], position[1] + state.originY, position[2]]);
    mat4.rotateY(dst, dst, angle * Math.PI / 180);
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
