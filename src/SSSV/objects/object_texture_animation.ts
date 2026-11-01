import { matchCommandRecords } from '../commands/command_admission.js';
import type { LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";
import type { SSSVObjectData } from "./objects.js";

export interface ObjectTextureAnimation {
    textureIndices: number[];
    loopStartFrame: number;
}

export function readComputerIdleAnimation(placement: LevelObjectPlacement, commands: readonly LevelCommand[], definition: SSSVObjectData): ObjectTextureAnimation | null {
    if (placement.id !== 107 || placement.unkC !== 24 || placement.commandReferenceIdx <= 0 || placement.commandsLength !== 0
        || definition.renderMode !== 6 || definition.behaviorFlags !== 2 || definition.updateCallback !== 0
        || definition.scaleOverride !== 0 || definition.shadowType !== 0)
        return null;
    const records = ['00020400400012000009', '00570000000000000000', '00140000000000000000',
        '00330002000000000000', '00060005000000000000', '00330018000000000000',
        '00060005000000000000', '00330019000000000000', '00060005000000000000', '00080002000000000000'];
    const base = placement.commandReferenceIdx - 1;
    if (!matchCommandRecords(commands, { base, records, source: 'decoded' }).matched) return null;
    return { textureIndices: [2, 24, 25], loopStartFrame: 0 };
}

export function readObjectTextureAnimation(placement: LevelObjectPlacement, commands: readonly LevelCommand[]): (ObjectTextureAnimation & { commandIndices: number[] }) | null {
    if (!Number.isSafeInteger(placement.commandReferenceIdx) || placement.commandReferenceIdx <= 0
        || !Number.isInteger(placement.commandsLength) || placement.commandsLength < 0 || placement.commandsLength > 255
        || !Number.isInteger(placement.unkC) || placement.unkC < 0 || placement.unkC >= 32)
        return null;
    const base = placement.commandReferenceIdx - 1;
    let cursor = placement.commandsLength & 0xFF;
    let texture = placement.unkC;
    const frames: number[] = [];
    const commandIndices: number[] = [];
    const visited = new Map<number, { frame: number, writes: number }>();
    let writes = 0;
    for (let step = 0; step < 128; step++, cursor++) {
        const command = commands[base + cursor];
        if (cursor > 255 || command === undefined || command.payload.byteLength !== 8)
            return null;
        commandIndices.push(base + cursor);
        visited.set(cursor, { frame: frames.length, writes });
        const view = command.payload.createDataView();
        switch (command.opcode) {
            case 0x57:
                if (view.getUint32(0) !== 0 || view.getUint32(4) !== 0)
                    return null;
                break;
            case 0x3D:
                if (view.getUint32(0) !== 0 || view.getUint32(4) !== 0x1100)
                    return null;
                break;
            case 0x14:
                if (view.getUint32(0) !== 0 || view.getUint32(4) !== 0)
                    return null;
                break;
            case 0x33:
                texture = view.getUint16(0);
                if (texture >= 32 || view.getUint16(2) !== 0 || view.getUint32(4) !== 0)
                    return null;
                writes++;
                break;
            case 0x06: {
                const duration = view.getUint16(0);
                if (frames.length + duration > 4096 || view.getUint16(2) !== 0 || view.getUint32(4) !== 0)
                    return null;
                for (let tick = 0; tick < duration; tick++)
                    frames.push(texture);
                break;
            }
            case 0x08: {
                const start = visited.get(view.getUint16(0) + 1);
                if (start === undefined || start.frame >= frames.length || start.writes === writes || view.getUint16(2) !== 0 || view.getUint32(4) !== 0)
                    return null;
                const target = commands[base + view.getUint16(0) + 1];
                if (target.opcode !== 0x33)
                    return null;
                return { textureIndices: frames, loopStartFrame: start.frame, commandIndices };
            }
            default:
                return null;
        }
    }
    return null;
}

export function textureAnimationFrame(elapsedFrames: number, frameCount: number, loopStartFrame: number = 0): number {
    const frame = Math.max(0, Math.floor(elapsedFrames));
    return frame < frameCount ? frame : loopStartFrame + (frame - loopStartFrame) % (frameCount - loopStartFrame);
}
