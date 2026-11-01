import { RSP_Geometry } from "../../BanjoKazooie/f3dex.js";
import type { LevelAnimalPlacement, LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";
import type { SSSVDrawCall } from "./terrain.js";

export interface StartupLighting {
    ambient: [number, number, number];
    diffuse: [number, number, number];
    commandIndex: number;
}

function readInitialLighting(commands: readonly LevelCommand[], base: number, cursor: number): StartupLighting | null {
    let lighting: StartupLighting | null = null;
    for (let step = 0; step < 256; step++, cursor++) {
        const command = commands[base + cursor];
        if (command === undefined || cursor > 0xFF)
            break;
        const view = command.payload.createDataView();
        switch (command.opcode) {
            case 0x25:
                if (view.getUint16(6) !== 0)
                    return lighting;
                lighting = {
                    ambient: [view.getUint8(0), view.getUint8(1), view.getUint8(2)],
                    diffuse: [view.getUint8(3), view.getUint8(4), view.getUint8(5)],
                    commandIndex: base + cursor,
                };
                break;
            case 0x27:
            case 0x62:
                break;
            case 0x45:
                if (view.getInt16(0) !== 700 && view.getInt16(0) !== 1200)
                    return lighting;
                break;
            case 0x3D:
                if (view.getUint8(6) !== 5 || view.getUint8(7) !== 1 || view.getInt16(0) >= 0x7F7F || view.getInt16(4) >= 0x7F7F)
                    return lighting;
                break;
            default:
                return lighting;
        }
    }
    return lighting;
}

export function readStartupLighting(commands: readonly LevelCommand[], objects: readonly LevelObjectPlacement[], animals: readonly LevelAnimalPlacement[]): StartupLighting | null {
    let lighting: StartupLighting | null = null;
    const entries = [
        ...objects.map((object) => ({ reference: object.commandReferenceIdx, cursor: object.commandsLength })),
        ...animals.map((animal) => ({ reference: animal.unkC, cursor: 0 })),
    ];
    for (const entry of entries) {
        if (entry.reference <= 0)
            continue;
        const candidate = readInitialLighting(commands, entry.reference - 1, entry.cursor);
        if (candidate === null)
            continue;
        if (lighting !== null && (lighting.ambient.some((value, i) => value !== candidate.ambient[i]) || lighting.diffuse.some((value, i) => value !== candidate.diffuse[i])))
            return null;
        lighting = candidate;
    }
    return lighting;
}

export function applyStartupLighting(drawCalls: readonly SSSVDrawCall[], lighting: StartupLighting | null): void {
    if (lighting === null)
        return;
    for (const drawCall of drawCalls) {
        if (!(drawCall.SP_GeometryMode & RSP_Geometry.G_LIGHTING))
            continue;
        for (let i = 0; i < 3; i++) {
            drawCall.light.ambientColor[i] = lighting.ambient[i] / 0xFF;
            drawCall.light.diffuseColor[i] = lighting.diffuse[i] / 0xFF;
        }
    }
}
