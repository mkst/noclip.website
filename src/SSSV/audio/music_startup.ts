import type { LevelAnimalPlacement, LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";

export interface StartupMusic {
    trackId: number;
    source: "script" | "default" | "unresolved";
    commandIndex: number | null;
}

function firstMusic(commands: readonly LevelCommand[], base: number, cursor: number): number | null {
    // Only trace bounded startup setup, including short delays and screen transitions.
    // Conditions and foreign script replacement require runtime state and remain unresolved.
    const visited = new Set<string>();
    let saved: { base: number; cursor: number } | null = null;
    for (let step = 0; step < 256; step++) {
        const key = `${base}:${cursor}`;
        if (cursor < 0 || cursor > 255 || visited.has(key)) return null;
        visited.add(key);
        const c = commands[base + cursor];
        if (c === undefined) return null;
        const p = c.payload.createDataView();
        switch (c.opcode) {
        case 0x27: return p.getUint8(0) <= 30 ? c.index : null;
        case 0x25: case 0x2A: case 0x46: case 0x62: break;
        case 0x14: break;
        case 0x42: case 0x43:
            if (p.getInt16(0) !== 9) return null;
            break;
        case 0x45:
            if (![700, 800, 1200, 1300].includes(p.getInt16(0))) return null;
            break;
        case 0x3D:
            if (p.getUint8(6) === 5 && p.getUint8(7) === 1 && p.getInt16(0) < 0x7F7F && p.getInt16(4) < 0x7F7F) break;
            if (![15, 33, 34, 36].includes(p.getUint8(6)) && !(p.getUint8(6) >= 64 && p.getUint8(6) < 96)) return null;
            break;
        case 0x06:
            if (p.getInt16(0) < 0 || p.getInt16(0) > 30) return null;
            break;
        case 0x3E: break;
        case 0x08:
            cursor = (p.getInt16(0) + 1) & 255;
            continue;
        case 0x48:
            if (saved !== null) return null;
            saved = { base, cursor: cursor + 1 };
            base = p.getUint16(0);
            cursor = 0;
            continue;
        case 0x49:
            if (saved === null) return null;
            ({ base, cursor } = saved);
            saved = null;
            continue;
        default: return null;
        }
        cursor++;
    }
    return null;
}

export function readStartupMusic(commands: readonly LevelCommand[], objects: readonly LevelObjectPlacement[], animals: readonly LevelAnimalPlacement[]): StartupMusic {
    const entries = [
        ...objects.map(o => ({ reference: o.commandReferenceIdx, cursor: o.commandsLength })),
        ...animals.map(a => ({ reference: a.unkC, cursor: 0 })),
    ];
    const candidates = entries.filter(e => e.reference > 0)
        .map(e => firstMusic(commands, e.reference - 1, e.cursor)).filter((i): i is number => i !== null);
    const ids = new Set(candidates.map(i => commands[i].payload.createDataView().getUint8(0)));
    if (ids.size === 1)
        return { trackId: [...ids][0], source: "script", commandIndex: candidates[0] };
    return { trackId: 1, source: commands.some(c => c.opcode === 0x27) ? "unresolved" : "default", commandIndex: null };
}
