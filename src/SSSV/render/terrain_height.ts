import { MAP_X_POINTS, MAP_Z_POINTS } from "../core/level.js";
import type { LevelMapEntry } from "../core/level.js";

export function sampleGroundHeight(map: readonly LevelMapEntry[], x: number, z: number): number | null {
    const cellX = (x >> 6) - 4;
    const cellZ = (z >> 6) - 8;
    if (cellX < 0 || cellZ < 0 || cellX + 1 >= MAP_X_POINTS || cellZ + 1 >= MAP_Z_POINTS)
        return null;

    const a = map[cellX * MAP_Z_POINTS + cellZ];
    const b = map[cellX * MAP_Z_POINTS + cellZ + 1];
    const c = map[(cellX + 1) * MAP_Z_POINTS + cellZ + 1];
    const d = map[(cellX + 1) * MAP_Z_POINTS + cellZ];
    if (a === undefined || b === undefined || c === undefined || d === undefined)
        return null;

    const h0 = a.unk0 << 13;
    const h1 = b.unk0 << 13;
    const h2 = c.unk0 << 13;
    const h3 = d.unk0 << 13;
    const dx = x & 0x3F;
    const dz = z & 0x3F;
    let heightFixed: number;
    if (a.unk4 & 1) {
        if (dx < dz)
            heightFixed = (h0 << 6) + ((h2 - h1) * dx) + ((h1 - h0) * dz);
        else
            heightFixed = (h0 << 6) + ((h3 - h0) * dx) + ((h2 - h3) * dz);
    } else if (dx + dz < 0x40) {
        heightFixed = (h0 << 6) + ((h3 - h0) * dx) + ((h1 - h0) * dz);
    } else {
        heightFixed = (h2 << 6) + ((h1 - h2) * (0x40 - dx)) + ((h3 - h2) * (0x40 - dz));
    }
    return (heightFixed | 0) >> 16;
}

