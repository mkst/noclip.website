import type { LevelPath } from './level.js';

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
