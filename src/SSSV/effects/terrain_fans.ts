import type { LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";
import { COMBINE_TEXTURED, FAN_TEXTURE_ID_BASE, RENDER_ALPHA } from "../render/terrain.js";
import type { SSSVDrawCall } from "../render/terrain.js";
import { GAME_TICK_RATE } from "../core/timing.js";

export function applyStartupFanAnimation(drawCalls: readonly SSSVDrawCall[], placements: readonly LevelObjectPlacement[], commands: readonly LevelCommand[]): void {
    const enabled = placements.some(placement => {
        if (placement.id !== 64 || placement.commandReferenceIdx <= 0 || placement.commandsLength > 253) return false;
        const base = placement.commandReferenceIdx - 1 + placement.commandsLength;
        const start = commands[base], audio = commands[base + 1], stop = commands[base + 2];
        if (start?.opcode !== 0x4C || audio?.opcode !== 0x46 || stop?.opcode !== 0x09) return false;
        const s = start.payload.createDataView(), a = audio.payload.createDataView(), end = stop.payload.createDataView();
        // Admit only the complete Sewers startup: slot 5 on, nonblocking audio, stop.
        return s.getUint32(0) === 0x00050001 && s.getUint32(4) === 0
            && a.getUint32(0) === 0x0096964C && a.getUint32(4) === 0x4C01FFFF
            && end.getUint32(0) === 0 && end.getUint32(4) === 0;
    });
    if (!enabled) return;
    for (const call of drawCalls) {
        if (call.fanAnimation?.slot !== 5 || call.fanAnimation.kind !== 8 || call.translucent) continue;
        call.animationTextureIndices = [0, 1, 2, 3].map(frame => FAN_TEXTURE_ID_BASE + frame);
        call.textureIndices = [FAN_TEXTURE_ID_BASE];
        call.animationFrameRate = GAME_TICK_RATE;
        call.SP_TextureState.set(true, 0, 0, 32, 32);
        call.DP_Combine = COMBINE_TEXTURED;
        call.DP_OtherModeL = RENDER_ALPHA;
        call.scrollStepS = call.scrollStepT = 0;
    }
}
