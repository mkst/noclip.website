import type { LevelPath } from '../core/level.js';
import type { CommandObject } from './command_objects.js';

// func_802F9EB8: its parameter includes one leading control interval. Retain
// source float32 operations and truncation to 16.16 rather than renderer doubles.
export function sampleCommandPath(path: LevelPath, parameter: number, loop: boolean): [number, number, number] {
    const f = Math.fround, points = path.waypoints, length = points.length;
    const segment = Math.trunc(parameter / 128), base = segment - 1;
    const index = (i: number) => loop ? (i % length + length) % length : Math.max(0, Math.min(length - 1, i));
    const t = f((parameter - segment * 128) / 128), t2 = f(t * t), t3 = f(t * t2);
    const weights = [f((-t3 + 3 * t2 - 3 * t + 1) / 6), f((3 * t3 - 6 * t2 + 4) / 6),
        f((-3 * t3 + 3 * t2 + 3 * t + 1) / 6), f(t3 / 6)];
    return (['x', 'y', 'z'] as const).map(axis => {
        const values = weights.map((w, i) => f(w * points[index(base - 1 + i)][axis]));
        const value = f(f(f(values[0] + values[1]) + values[2]) + values[3]);
        return (Math.trunc(f(value * 4194304)) + (axis === 'y' ? 0 : 2097152)) | 0;
    }) as [number, number, number];
}

interface PathController { path: LevelPath; parameter: number; step: number; direction: number; mode: number; active: boolean; }
type PathObject = Pick<CommandObject, 'id' | 'fixedPosition' | 'velocity' | 'movement'>;
export interface CommandPathRequest {
    opcode: 0x1D | 0x34;
    path: LevelPath;
    speed: number;
    direction: number;
    mode: number;
}

// The host admits paths/operands and owns integration, VM and controller order.
// These mechanics cover the existing direct-update subset, without object physics.
export class CommandPathControllers {
    public readonly paths = new Map<string, PathController>();
    public readonly approaches = new Map<string, { target: number[]; speed: number }>();

    public isComplete(object: PathObject): boolean {
        return object.movement === null && !this.paths.get(object.id)?.active && !this.approaches.has(object.id);
    }

    public cancel(id: string): void {
        const path = this.paths.get(id); if (path) path.active = false;
        this.approaches.delete(id);
    }

    public start(object: PathObject, request: CommandPathRequest): 'wait' | 'yield' {
        const { opcode, path, speed, direction, mode } = request;
        if (this.approaches.has(object.id)) return 'wait';
        if (opcode === 0x1D) {
            const start = sampleCommandPath(path, 0, mode !== 1).map(v => v >> 16);
            if (start.some((v, i) => Math.abs(v - (object.fixedPosition[i] >> 16)) > 4)) {
                object.movement = null;
                this.cancel(object.id);
                this.approaches.set(object.id, { target: start, speed }); return 'wait';
            }
        }
        const parameter = opcode === 0x34 ? this.paths.get(object.id)?.parameter ?? 0 : direction > 0 ? 0 : (path.waypoints.length + 1) * 128;
        object.movement = null;
        this.paths.set(object.id, { path, step: speed * direction, direction, mode, parameter, active: true });
        return 'yield';
    }

    // True includes the completion tick: the host must not advance a different
    // controller on that same tick after this one clears its state.
    public advance(object: PathObject, state: number): boolean {
        const approach = this.approaches.get(object.id), path = this.paths.get(object.id);
        if (approach) {
            if (approach.target.every((v, i) => v === (object.fixedPosition[i] >> 16))) { this.approaches.delete(object.id); object.velocity.fill(0); }
            else for (let i = 0; i < 3; i++) {
                const current = object.fixedPosition[i] >> 16, delta = Math.max(-approach.speed, Math.min(approach.speed, approach.target[i] - current));
                object.velocity[i] = ((current + (state === 0 ? 0 : delta)) << 16) - object.fixedPosition[i];
            }
        } else if (path?.active) {
            const end = (path.path.waypoints.length + 1) * 128;
            if (path.mode === 1 && (path.direction > 0 ? path.parameter >= end : path.parameter < 1)) { path.active = false; object.velocity.fill(0); return true; }
            path.parameter += path.step;
            if (path.mode === 1) path.parameter = Math.max(0, Math.min(end, path.parameter));
            else { const length = path.path.waypoints.length * 128; path.parameter = (path.parameter % length + length) % length; }
            const next = sampleCommandPath(path.path, path.parameter, path.mode !== 1);
            for (let i = 0; i < 3; i++) object.velocity[i] = next[i] - object.fixedPosition[i];
        } else return false;
        return true;
    }
}
