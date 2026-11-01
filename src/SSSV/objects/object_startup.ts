import type { LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";

export interface ObjectStartupAppearance {
    material: number | null;
    scale: number | null;
    state: number;
    commandIndices: number[];
    boundaryCommandIndex: number | null;
}

export interface ObjectVisibility {
    appearance: ObjectStartupAppearance | null;
    material: number;
    hidden: boolean;
    resolved: boolean;
}

export function readObjectVisibility(placement: LevelObjectPlacement, commands: readonly LevelCommand[]): ObjectVisibility {
    const appearance = readObjectStartupAppearance(placement, commands);
    const material = appearance?.material ?? placement.unkC;
    return { appearance, material, hidden: appearance !== null && (material & 0x3F) === 40, resolved: appearance !== null };
}

export function readObjectStartupAppearance(placement: LevelObjectPlacement, commands: readonly LevelCommand[]): ObjectStartupAppearance | null {
    return readStartupAppearance(placement, commands, false);
}

export function readSwitchStartupAppearance(placement: LevelObjectPlacement, commands: readonly LevelCommand[]): ObjectStartupAppearance | null {
    return readStartupAppearance(placement, commands, true);
}

export function readBillboardStartupColor(placement: LevelObjectPlacement, commands: readonly LevelCommand[]): [number, number, number] | null {
    if (placement.commandReferenceIdx <= 0 || placement.commandsLength > 251) return null;
    const base = placement.commandReferenceIdx - 1 + placement.commandsLength;
    const setup = commands[base], stop = commands[base + 4];
    if (setup?.opcode !== 0x3D || stop?.opcode !== 0x09) return null;
    const flags = setup.payload.createDataView(), end = stop.payload.createDataView();
    if (flags.getUint32(0) !== 0 || flags.getUint32(4) !== 0x1100 || end.getUint32(0) !== 0 || end.getUint32(4) !== 0) return null;
    const rgb: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
        const command = commands[base + 1 + i];
        if (command?.opcode !== 0x3D) return null;
        const v = command.payload.createDataView();
        if (v.getUint16(0) > 255 || v.getUint32(2) !== 0 || v.getUint16(6) !== (i << 8)) return null;
        rgb[i] = v.getUint16(0);
    }
    return rgb;
}

function readStartupAppearance(placement: LevelObjectPlacement, commands: readonly LevelCommand[], switchPresentation: boolean): ObjectStartupAppearance | null {
    const result: ObjectStartupAppearance = { material: null, scale: null, state: 1, commandIndices: [], boundaryCommandIndex: null };
    if (placement.commandReferenceIdx === 0)
        return result;
    const base = placement.commandReferenceIdx - 1;
    for (let cursor = placement.commandsLength & 0xFF; cursor <= 0xFF; cursor++) {
        const command = commands[base + cursor];
        if (command === undefined)
            return null;
        const view = command.payload.createDataView();
        const value = view.getInt16(0, false);
        const zeroTail = view.getUint16(2) === 0 && view.getUint32(4) === 0;
        switch (command.opcode) {
            case 0x03:
                // Static controls use the pre-contact snapshot, without simulating contact.
                if (!switchPresentation || view.getUint8(0) !== 4 || !(view.getUint8(2) & 0x7F)) return null;
                result.boundaryCommandIndex = command.index;
                return result;
            case 0x46:
                if (!switchPresentation) return null;
                break;
            case 0x00:
                if (view.getUint32(0) !== 0 || view.getUint32(4) !== 0)
                    return null;
                break;
            case 0x14:
            case 0x57:
                if (view.getUint32(0) !== 0 || view.getUint32(4) !== 0)
                    return null;
                break;
            case 0x33:
                if (value < 0 || value >= 0x7F7F || !zeroTail)
                    return null;
                result.material = value;
                result.commandIndices.push(command.index);
                break;
            case 0x36:
                if (view.getUint16(0) === 0 || !zeroTail)
                    return null;
                result.scale = view.getUint16(0);
                result.commandIndices.push(command.index);
                break;
            case 0x0F:
                if (!zeroTail)
                    return null;
                result.state = view.getUint16(0);
                result.commandIndices.push(command.index);
                break;
            case 0x3D: {
                const destination = view.getUint8(6);
                if (value < 0 || value >= 0x7F7F || view.getUint16(2) !== 0 || view.getUint16(4) !== 0 || view.getUint8(7) !== 0)
                    return null;
                if (destination === 21)
                    result.state = value;
                else if (destination === 9 && value !== 0)
                    result.scale = value;
                else if (destination === 17 && value === 0)
                    break;
                else
                    return null;
                result.commandIndices.push(command.index);
                break;
            }
            case 0x06:
                if (value < 0 || value >= 0x7F7F || !zeroTail)
                    return null;
                if (value === 0)
                    break;
                result.boundaryCommandIndex = command.index;
                return result;
            case 0x09:
                if (view.getUint32(0) !== 0 || view.getUint32(4) !== 0)
                    return null;
                result.boundaryCommandIndex = command.index;
                return result;
            default:
                return null;
        }
    }
    return null;
}
