import { mat4 } from "gl-matrix";
import { SINE_TABLE_256, writeAnimalLimbMatrix } from "./animal_matrix.js";
import type { AnimalFixedVec3, AnimalJoint } from "./animal_matrix.js";
import { LEVEL_Z_MIRROR } from "./level.js";
import type { LevelAnimalPlacement } from "./level.js";

export interface AnimalTail {
    kind: "mouse" | "husky" | "crazy-husky" | "elephant";
    anchor: AnimalFixedVec3;
    forces: AnimalFixedVec3[];
    points: AnimalFixedVec3[];
    velocities: AnimalFixedVec3[];
    segmentLength: number;
    size: number;
    tick: number;
}

function sourceLength(v: AnimalFixedVec3): number {
    const [x, z, y] = v.map(Math.fround);
    return Math.fround(Math.sqrt(Math.fround(Math.fround(Math.fround(x * x) + Math.fround(z * z)) + Math.fround(y * y))));
}

export function createAnimalTail(placement: Readonly<LevelAnimalPlacement>, y: number, joint: AnimalJoint): AnimalTail | null {
    if (![18, 32, 13, 40, 41, 42, 56].includes(placement.id)) return null;
    const size = placement.id === 13 ? 2 : 1;
    const husky = [40, 41, 42].includes(placement.id);
    const elephant = placement.id === 56;
    const rat = placement.id === 32 || placement.id === 13;
    const sin = SINE_TABLE_256[placement.rotation & 255], cos = SINE_TABLE_256[(placement.rotation + 64) & 255];
    const x = size * joint.x, z = size * (joint.z - (rat ? 203 : 0));
    const divisor = placement.id === 18 ? 32 : 16;
    const anchor: AnimalFixedVec3 = [
        placement.x * 65536 + Math.trunc(cos * x / divisor) + Math.trunc(sin * z / divisor),
        placement.z * 65536 + Math.trunc(cos * z / divisor) - Math.trunc(sin * x / divisor),
        y * 65536 + Math.trunc(joint.y * size * (placement.id === 18 ? 65536 : 32768) / divisor) - (elephant ? 0x1B5800 : 0),
    ];
    // Source curves D_803A39C0 (trunk), D_803A3990 (husky), D_803A3B4C / D_803A3BAC (mouse).
    // Row zero is unused by both source routines.
    const dead = placement.health <= 0;
    const curve: AnimalFixedVec3[] = elephant
        ? [[0, 0, -131072], [0, 0, -131072], [0, 0, -131072], [0, -65536, -131072], [0, -131072, -131072]]
        : husky
        ? [[0, 0, 131072], [0, -65536, 131072], [0, 65536, 131072], [0, 131072, 32768]]
        : [-32768, -65536, -8192, 8192, -8192, -65536].map((z, i) => [dead && i === 3 ? 8192 : 0, z, dead ? 1024 : 32768]);
    const forces: AnimalFixedVec3[] = curve.map(([x, z, y]) => [
        (x * (cos >> 7) + z * (sin >> 7)) >> 8, (-x * (sin >> 7) + z * (cos >> 7)) >> 8, y,
    ]);
    const tail: AnimalTail = { kind: elephant ? "elephant" : placement.id === 41 ? "crazy-husky" : husky ? "husky" : "mouse", anchor, forces, points: [], velocities: [], size, segmentLength: elephant ? 1075200 : husky ? 450560 : 204800 * size, tick: 0 };
    resetAnimalTail(tail);
    return tail;
}

// func_802DD244: curve initialization in source x/z/y 16.16 coordinates.
function resetAnimalTail(tail: AnimalTail): void {
    tail.points = [[...tail.anchor]];
    tail.velocities = Array.from({ length: tail.forces.length }, (): AnimalFixedVec3 => [0, 0, 0]);
    for (let i = 1; i < tail.forces.length; i++) {
        let force = tail.forces[i];
        let length = Math.trunc(sourceLength(force));
        if (length < 4096) { force = [force[0], 65536, force[2]]; length = 65536; }
        tail.points.push(force.map((v, axis) => tail.points[i - 1][axis] + Math.trunc(Math.imul(v, tail.segmentLength >> 8) / (length >> 8))) as AnimalFixedVec3);
    }
    tail.tick = 0;
}

// func_802DD548, collision mode zero, fixed stationary anchor.
export function advanceAnimalTail(tail: AnimalTail, tick: number): boolean {
    tick = Math.max(0, Math.floor(tick));
    if (tick === tail.tick) return false;
    if (tick < tail.tick) resetAnimalTail(tail);
    while (tail.tick < tick) {
        for (let i = 1; i < tail.forces.length; i++) {
            const old = tail.points[i], previous = tail.points[i - 1];
            const delta = old.map((v, axis) => previous[axis] - (v + Math.trunc(Math.imul(tail.velocities[i][axis], tail.kind === "elephant" ? 10 : 150) / 256) + tail.forces[i][axis])) as AnimalFixedVec3;
            const length = sourceLength(delta);
            const scale = length !== 0 ? Math.trunc(tail.segmentLength / Math.trunc(length / 1024)) : 1;
            const next = delta.map((v, axis) => previous[axis] - (Math.imul(v, scale) >> 10)) as AnimalFixedVec3;
            tail.velocities[i] = next.map((v, axis) => v - old[axis]) as AnimalFixedVec3;
            tail.points[i] = next;
        }
        tail.tick++;
    }
    return true;
}

// func_80126FD4: the tail mesh has its long axis along source vertex X.
export function animalTailMatrix(tail: AnimalTail, link: number): mat4 {
    const a = tail.points[link], b = tail.points[link + 1];
    const direction = b.map((v, axis) => (v >> 8) - (a[axis] >> 8)) as AnimalFixedVec3;
    const [dx, dz, dy] = direction;
    let side: AnimalFixedVec3, up: AnimalFixedVec3;
    if (dx === 0 && dz === 0) {
        side = [1024, 0, 0]; up = [0, -1024, 0];
    } else {
        side = dz < 0 ? [-dz, dx, 0] : [dz, -dx, 0];
        const cross = [-side[1] * dy, dy * side[0], dx * side[1] - dz * side[0]];
        up = cross.map(v => Math.trunc(v / 512) || Math.sign(v)) as AnimalFixedVec3;
    }
    const trunkScale = [0x9CCC, 0x7000, 0x5999, 0x5999][link];
    const lengthScale = tail.kind === "elephant" ? trunkScale : tail.kind !== "mouse" ? 0x1199A : 0x8000 * tail.size;
    const widthScale = tail.kind === "elephant" ? trunkScale : tail.kind !== "mouse" ? 0x1199A : (0xC000 - link * 0x2000) * tail.size;
    const scaleAxis = (v: AnimalFixedVec3, scale: number): AnimalFixedVec3 => {
        const length = Math.trunc(sourceLength(v));
        return v.map(n => Math.trunc(Math.imul(n, scale) / length)) as AnimalFixedVec3;
    };
    const matrix = mat4.create();
    writeAnimalLimbMatrix(matrix, {
        direction: scaleAxis(direction, lengthScale), side: scaleAxis(side, widthScale), up: scaleAxis(up, widthScale),
        translation: a.map((v, axis) => (v + b[axis]) >> 1) as AnimalFixedVec3,
    });
    // Convert the world-space source matrix once, independently of the body root.
    for (const index of [2, 6, 10]) matrix[index] *= -1;
    matrix[14] = LEVEL_Z_MIRROR - matrix[14];
    return matrix;
}
