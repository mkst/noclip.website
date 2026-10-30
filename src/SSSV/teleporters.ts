import type { LevelObjectPlacement } from "./level.js";
import type { LevelCommand } from "./paths.js";
import type { ObjectStartupAppearance } from "./object_startup.js";

export interface TeleporterVisualState {
    state: number | null;
    arrivalState?: number | null;
    part: "rim" | "fan";
    previewActive: boolean;
    alpha: [number, number];
}

export function teleporterIsActive(visual: TeleporterVisualState): boolean {
    return visual.previewActive || (visual.arrivalState ?? visual.state) === 1;
}

export function teleporterFrame(tick: number, state: number | null, previewActive = false): number {
    if (!previewActive && state !== null && state !== 1) return 0;
    return Math.floor(((Math.max(0, Math.floor(tick)) + 1) % 5) / 2);
}

export function teleporterFanOffset(tick: number): number {
    const offset = ((Math.max(0, Math.floor(tick)) + 1) * 8) & 127;
    return offset === 0 ? 0 : -offset / 128;
}

export function teleporterFanAlpha(x: number, y: number, z: number, player: { x: number; y: number; z: number } | null): [number, number] {
    if (player === null) return [255, 127];
    const distance = Math.abs(x - player.x) + Math.abs(y - player.y) + Math.abs(z - player.z);
    return distance >= 512 ? [255, 127] : [Math.trunc(distance / 2), Math.trunc(distance / 4)];
}

// A static snapshot before a wait/delay; branches, calls and other targets remain unresolved.
export function readTeleporterStartup(placement: LevelObjectPlacement, commands: readonly LevelCommand[]): ObjectStartupAppearance | null {
    const result: ObjectStartupAppearance = { material: null, scale: null, state: 1, commandIndices: [], boundaryCommandIndex: null };
    if (placement.commandReferenceIdx === 0) return result;
    const base = placement.commandReferenceIdx - 1;
    for (let cursor = placement.commandsLength & 255; cursor <= 255; cursor++) {
        const c = commands[base + cursor];
        if (c === undefined) return null;
        const v = c.payload.createDataView(), value = v.getInt16(0), zeroTail = v.getUint16(2) === 0 && v.getUint32(4) === 0;
        switch (c.opcode) {
            case 0x00:
            case 0x14:
                if (v.getUint32(0) !== 0 || v.getUint32(4) !== 0) return null;
                break;
            case 0x0F:
                if (!zeroTail) return null;
                result.state = v.getUint16(0); result.commandIndices.push(c.index);
                break;
            case 0x33:
                if (!zeroTail || value < 0 || value >= 0x7F7F) return null;
                result.material = value; result.commandIndices.push(c.index);
                break;
            case 0x36:
                if (!zeroTail || v.getUint16(0) === 0) return null;
                result.scale = v.getUint16(0); result.commandIndices.push(c.index);
                break;
            case 0x3D: {
                const destination = v.getUint8(6);
                if (destination === 21 || destination === 9) {
                    if (v.getUint8(7) !== 0 || value < 0 || value >= 0x7F7F || destination === 9 && value === 0) return null;
                    // Assignment ignores the other two operands in source.
                    if (destination === 21) result.state = value;
                    else result.scale = value;
                    result.commandIndices.push(c.index);
                } else if (![0, 1, 2, 3, 5, 17, 33, 34].includes(destination) && destination < 64) return null;
                break;
            }
            case 0x25:
            case 0x27:
            case 0x46:
                break; // Global light/music or owner sound configuration does not change this visual snapshot.
            case 0x03:
                if (v.getUint8(0) & 0x40) return null;
                if ((v.getUint8(0) & 0xBF) === 0 && (v.getUint8(2) & 2)) break;
                result.boundaryCommandIndex = c.index;
                return result;
            case 0x06:
                if (!zeroTail || value < 0 || value >= 0x7F7F) return null;
                if (value === 0) break;
                result.boundaryCommandIndex = c.index;
                return result;
            case 0x09:
                if (v.getUint32(0) !== 0 || v.getUint32(4) !== 0) return null;
                result.boundaryCommandIndex = c.index;
                return result;
            default:
                return null;
        }
    }
    return null;
}
