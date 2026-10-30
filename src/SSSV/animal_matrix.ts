import { mat3, mat4, vec3 } from "gl-matrix";
import type { ReadonlyMat4, ReadonlyVec3 } from "gl-matrix";
import { LEVEL_Z_MIRROR } from "./level.js";

export type AnimalFixedVec3 = [number, number, number];

export interface AnimalJoint {
    x: number;
    z: number;
    y: number;
}

export interface AnimalLimbMatrix {
    direction: AnimalFixedVec3;
    side: AnimalFixedVec3;
    up: AnimalFixedVec3;
    translation: AnimalFixedVec3;
}

export interface AnimalLimbMatrixParameters {
    scaleX: number;
    scaleZ: number;
    scaleY: number;
    centerScale: number;
    roll: number;
    mirror: 0 | 1 | 2 | 3;
    orientationMode: 0 | 1;
}

export interface AnimalPlacementTransform {
    x: number;
    z: number;
    y: number;
    heading: number;
    scaleX: number;
    scaleZ: number;
    scaleY: number;
    roll: 0;
    rollScale: 0;
}

export const SINE_TABLE_256 = Int16Array.from([
    0, 804, 1607, 2410, 3211, 4011, 4808, 5602, 6392, 7179, 7961, 8739, 9512, 10278, 11039, 11793,
    12539, 13278, 14010, 14732, 15446, 16151, 16846, 17530, 18204, 18868, 19519, 20159, 20787, 21403, 22005, 22594,
    23170, 23732, 24279, 24812, 25329, 25832, 26319, 26790, 27245, 27684, 28106, 28510, 28898, 29269, 29621, 29956,
    30273, 30572, 30852, 31114, 31357, 31581, 31785, 31971, 32138, 32285, 32413, 32521, 32610, 32679, 32728, 32758,
    32767, 32758, 32728, 32679, 32610, 32521, 32413, 32285, 32138, 31971, 31785, 31581, 31357, 31114, 30852, 30572,
    30273, 29956, 29621, 29269, 28898, 28511, 28106, 27684, 27245, 26790, 26319, 25832, 25330, 24812, 24279, 23732,
    23170, 22594, 22005, 21403, 20787, 20159, 19519, 18868, 18204, 17530, 16846, 16151, 15446, 14732, 14010, 13278,
    12539, 11793, 11039, 10278, 9512, 8739, 7961, 7179, 6392, 5602, 4808, 4011, 3211, 2410, 1607, 804,
    0, -804, -1607, -2410, -3211, -4011, -4808, -5602, -6392, -7179, -7961, -8739, -9512, -10278, -11039, -11793,
    -12539, -13278, -14010, -14732, -15446, -16151, -16846, -17530, -18204, -18868, -19519, -20159, -20787, -21403, -22005, -22594,
    -23170, -23732, -24279, -24812, -25329, -25832, -26319, -26790, -27245, -27684, -28106, -28510, -28898, -29269, -29621, -29956,
    -30273, -30572, -30852, -31114, -31357, -31580, -31785, -31971, -32138, -32285, -32413, -32521, -32610, -32679, -32728, -32758,
    -32767, -32758, -32728, -32679, -32610, -32521, -32413, -32285, -32138, -31971, -31785, -31581, -31357, -31114, -30852, -30572,
    -30273, -29956, -29621, -29269, -28898, -28511, -28106, -27684, -27245, -26790, -26319, -25832, -25330, -24812, -24279, -23732,
    -23170, -22594, -22005, -21403, -20787, -20159, -19519, -18868, -18204, -17530, -16846, -16151, -15446, -14732, -14010, -13278,
    -12539, -11793, -11039, -10278, -9512, -8739, -7962, -7179, -6392, -5602, -4808, -4011, -3211, -2410, -1607, -804,
]);

function cDiv(numerator: number, denominator: number): number {
    return Math.trunc(numerator / denominator);
}

function cSqrtLength(x: number, z: number, y: number): number {
    const fx = Math.fround(x), fz = Math.fround(z), fy = Math.fround(y);
    const xx = Math.fround(fx * fx), zz = Math.fround(fz * fz), yy = Math.fround(fy * fy);
    const sum = Math.fround(Math.fround(xx + zz) + yy);
    const result = Math.trunc(Math.fround(Math.sqrt(sum)));
    if (result > 0x7FFF)
        throw new RangeError("animal limb norm exceeds the signed-16 source range");
    return result;
}

function validateS16(value: number, name: string): void {
    if (!Number.isInteger(value) || value < -0x8000 || value > 0x7FFF)
        throw new RangeError(`${name} must be a signed-16 integer`);
}

function validateS32(value: number, name: string): void {
    if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7FFFFFFF)
        throw new RangeError(`${name} must be a signed-32 integer`);
}

function midpoint16_16(a: number, b: number, centerScale: number, shift: number): number {
    const midpoint = (a + b) >> 1;
    const fixed = cDiv(midpoint << 16, 8) | 0;
    return (fixed + (Math.imul(centerScale, fixed) >> shift)) | 0;
}

export function computeAnimalLimbMatrix(joint0: AnimalJoint, joint1: AnimalJoint, params: AnimalLimbMatrixParameters): AnimalLimbMatrix | null {
    for (const [name, value] of Object.entries({
        x0: joint0.x, z0: joint0.z, y0: joint0.y,
        x1: joint1.x, z1: joint1.z, y1: joint1.y,
        centerScale: params.centerScale, roll: params.roll,
    }))
        validateS16(value, name);
    for (const [name, value] of Object.entries({ scaleX: params.scaleX, scaleZ: params.scaleZ, scaleY: params.scaleY }))
        validateS32(value, name);
    if (params.mirror < 0 || params.mirror > 3 || (params.orientationMode !== 0 && params.orientationMode !== 1))
        throw new RangeError("animal limb mirror/orientation mode is outside the traced source cases");

    const translation: AnimalFixedVec3 = [
        midpoint16_16(joint0.x, joint1.x, params.centerScale, 4),
        midpoint16_16(joint0.z, joint1.z, params.centerScale, 4),
        midpoint16_16(joint0.y, joint1.y, params.centerScale, 3),
    ];
    const dx = joint1.x - joint0.x;
    const dz = joint1.z - joint0.z;
    const dy = joint1.y - joint0.y;

    let sideX: number, sideZ: number, sideY: number;
    let upX: number, upZ: number, upY: number;
    if (dx === 0 && dz === 0) {
        if (params.orientationMode === 1) {
            sideX = 0; sideZ = 1 << 10; sideY = 0;
            upX = 1 << 10; upZ = 0; upY = 0;
        } else {
            sideX = 1 << 10; sideZ = 0; sideY = 0;
            upX = 0; upZ = -(1 << 10); upY = 0;
        }
    } else {
        sideX = dz;
        sideZ = -dx;
        sideY = 0;
        if (params.orientationMode === 1) {
            if (sideZ < 0) {
                sideX = -dz;
                sideZ = -sideZ;
            }
        } else if (dz < 0) {
            sideX = -dz;
            sideZ = -sideZ;
        }

        upX = cDiv(Math.imul(sideZ, dy), -256);
        upZ = cDiv(Math.imul(dy, sideX), 256);
        upY = (cDiv((Math.imul(dx, sideZ) - Math.imul(dz, sideX)) | 0, 256));

        if (upX === 0 && upZ === 0 && upY === 0) {
            const sideZdy = Math.imul(sideZ, dy);
            const dySideX = Math.imul(dy, sideX);
            const cross = (Math.imul(dx, sideZ) - Math.imul(dz, sideX)) | 0;
            if (sideZdy < 0) upX = 1;
            else if (sideZdy > 0) upX = -1;
            if (dySideX < 0) upZ = -1;
            else if (dySideX > 0) upZ = 1;
            if (cross < 0) upY = -1;
            else if (cross > 0) upY = 1;
        }
    }

    const directionLength = cSqrtLength(dx, dz, dy);
    const sideLength = cSqrtLength(sideX, sideZ, sideY);
    const upLength = cSqrtLength(upX, upZ, upY);
    if (directionLength === 0 || sideLength === 0 || upLength === 0)
        return null;

    const direction: AnimalFixedVec3 = [
        cDiv(Math.imul(dx, params.scaleX), directionLength),
        cDiv(Math.imul(dz, params.scaleZ), directionLength),
        cDiv(Math.imul(dy, params.scaleY), directionLength),
    ];
    let side: AnimalFixedVec3 = [
        cDiv(Math.imul(sideX, params.scaleX), sideLength),
        cDiv(Math.imul(sideZ, params.scaleZ), sideLength),
        cDiv(Math.imul(sideY, params.scaleY), sideLength),
    ];
    let up: AnimalFixedVec3 = [
        (cDiv(Math.imul(params.scaleX >> 3, upX), upLength) << 3) | 0,
        (cDiv(Math.imul(params.scaleZ >> 3, upZ), upLength) << 3) | 0,
        (cDiv(Math.imul(params.scaleY >> 3, upY), upLength) << 3) | 0,
    ];

    if (params.mirror === 1 || params.mirror === 3)
        side = side.map((value) => value === 0 ? 0 : -value) as AnimalFixedVec3;
    if (params.mirror === 2 || params.mirror === 3)
        up = up.map((value) => value === 0 ? 0 : -value) as AnimalFixedVec3;

    if (params.roll !== 0) {
        const sin = SINE_TABLE_256[params.roll & 0xFF] >> 7;
        const cos = SINE_TABLE_256[(params.roll + 0x40) & 0xFF] >> 7;
        const originalSide = side;
        side = up.map((value, i) => ((Math.imul(sin, value) + Math.imul(originalSide[i], cos)) | 0) >> 8) as AnimalFixedVec3;
        up = up.map((value, i) => ((Math.imul(value, cos) - Math.imul(sin, originalSide[i])) | 0) >> 8) as AnimalFixedVec3;
    }

    return { direction, side, up, translation };
}

function gameAxisToViewer(axis: ReadonlyVec3): vec3 {
    return vec3.fromValues(axis[0], axis[2], axis[1]);
}

export function writeAnimalLimbMatrix(dst: mat4, matrix: AnimalLimbMatrix, sourceVertexAxes = true): void {
    const direction = gameAxisToViewer(matrix.direction).map((value) => value / 0x10000);
    const side = gameAxisToViewer(matrix.side).map((value) => value / 0x10000);
    const up = gameAxisToViewer(matrix.up).map((value) => value / 0x10000);
    const yAxis = sourceVertexAxes ? side : up;
    const zAxis = sourceVertexAxes ? up : side;

    mat4.identity(dst);
    dst[0] = direction[0]; dst[1] = direction[1]; dst[2] = direction[2];
    dst[4] = yAxis[0]; dst[5] = yAxis[1]; dst[6] = yAxis[2];
    dst[8] = zAxis[0]; dst[9] = zAxis[1]; dst[10] = zAxis[2];
    dst[12] = matrix.translation[0] / 0x10000;
    dst[13] = matrix.translation[2] / 0x10000;
    dst[14] = matrix.translation[1] / 0x10000;
}

export function computeAnimalPlacementMatrix(dst: mat4, transform: AnimalPlacementTransform): void {
    for (const name of ["x", "z", "y", "heading"] as const)
        validateS16(transform[name], name);
    for (const name of ["scaleX", "scaleZ", "scaleY"] as const)
        validateS32(transform[name], name);
    if (transform.roll !== 0 || transform.rollScale !== 0)
        throw new RangeError("animal placement matrix currently covers the zero-roll spawn contract");

    const yaw = (-transform.heading) & 0xFF;
    const sin = (SINE_TABLE_256[yaw] >> 7) / 256;
    const cos = (SINE_TABLE_256[(yaw + 0x40) & 0xFF] >> 7) / 256;
    const scaleX = transform.scaleX / 0x10000;
    const scaleZ = transform.scaleZ / 0x10000;
    const scaleY = transform.scaleY / 0x10000;

    mat4.identity(dst);
    dst[0] = cos * scaleX;
    dst[2] = -sin * scaleX;
    dst[5] = scaleY;
    dst[8] = -sin * scaleZ;
    dst[10] = -cos * scaleZ || 0;
    dst[12] = transform.x;
    dst[13] = transform.y;
    dst[14] = LEVEL_Z_MIRROR - transform.z;
}

export function multiplyAnimalMatrices(dst: mat4, placement: ReadonlyMat4, limb: ReadonlyMat4): void {
    mat4.mul(dst, placement, limb);
}

export function transformAnimalNormal(dst: vec3, normal: ReadonlyVec3, matrix: ReadonlyMat4): boolean {
    const normalMatrix = mat3.fromMat4(mat3.create(), matrix);
    if (mat3.determinant(normalMatrix) === 0)
        return false;
    vec3.transformMat3(dst, normal, normalMatrix);
    vec3.normalize(dst, dst);
    return true;
}

export function animalMatrixFlipsWinding(matrix: ReadonlyMat4): boolean {
    const a00 = matrix[0], a01 = matrix[4], a02 = matrix[8];
    const a10 = matrix[1], a11 = matrix[5], a12 = matrix[9];
    const a20 = matrix[2], a21 = matrix[6], a22 = matrix[10];
    const determinant = a00 * (a11 * a22 - a12 * a21)
        - a01 * (a10 * a22 - a12 * a20)
        + a02 * (a10 * a21 - a11 * a20);
    return determinant < 0;
}
