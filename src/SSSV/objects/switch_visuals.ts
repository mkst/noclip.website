import { mat4, vec3, vec4 } from "gl-matrix";
import { RSPSharedOutput, RSP_Geometry, Vertex } from "../../BanjoKazooie/f3dex.js";
import type { LevelDat, LevelObjectPlacement } from "../core/level.js";
import { mirrorZ } from "../core/level.js";
import { sinDegrees } from "../core/degree_math.js";
import { updateGravitySwitchVisual } from "./gravity_switch.js";
import { BIOME_REGULAR_TEXTURE_ID_BASE, DYNAMIC_EFFECT_TEXTURE_ID_BASE } from "./objects.js";
import type { SSSVObjectData } from "./objects.js";
import type { LevelCommand } from "../commands/paths.js";
import { readObjectStartupAppearance, readObjectVisibility, readSwitchStartupAppearance } from "./object_startup.js";
import { COMBINE_COLOURED_LIGHT, COMBINE_TEXTURED, DP_OTHERMODE_H, makeFogNearFar, RENDER_TRANSLUCENT, SSSVDrawCall, SSSVLayer } from "../render/terrain.js";

export function buildSwitchBalls(output: RSPSharedOutput, placements: readonly LevelObjectPlacement[], table: ReadonlyMap<number, SSSVObjectData>, dat: LevelDat, commands: readonly LevelCommand[]): SSSVDrawCall[] {
    const calls: SSSVDrawCall[] = [];
    for (const [index, placement] of placements.entries()) {
        const entry = table.get(placement.id);
        if (entry === undefined || ![4, 13].includes(entry.renderMode) || readObjectVisibility(placement, commands).hidden) continue;
        calls.push(buildSwitchBall(output, index, placement, entry, dat, commands));
    }
    return calls;
}

export function buildSwitchBall(output: RSPSharedOutput, placementIndex: number, placement: LevelObjectPlacement, entry: SSSVObjectData, dat: LevelDat, commands: readonly LevelCommand[] = []): SSSVDrawCall {
    const startup = readSwitchStartupAppearance(placement, commands);
    const scale = startup?.scale ?? (entry.scaleOverride || placement.scale || 2048);
    const height = Math.floor(entry.collideHeight * scale / 2048);
    const gravity = entry.renderMode === 13;
    const call = createControlBillboard(output, placementIndex, dat);
    // Unknown script prefixes retain the source spawn state, rather than guessing off.
    call.switchBall = { state: startup?.state ?? 1, size: Math.trunc(scale * (gravity ? 0.2 : 0.6)) * 3 / 256 };
    call.animationTextureIndices = [BIOME_REGULAR_TEXTURE_ID_BASE + 4, BIOME_REGULAR_TEXTURE_ID_BASE + 5];
    call.textureIndices = [BIOME_REGULAR_TEXTURE_ID_BASE + (call.switchBall.state === 1 ? 4 : 5)];
    vec3.set(call.center, placement.x, placement.y + (gravity ? scale * 6 / 256 : height / 2 + scale * 55 / 2048), mirrorZ(placement.z));
    call.modelMatrix = mat4.fromTranslation(mat4.create(), call.center);
    if (gravity) {
        call.gravitySwitch = { placement, baseScale: scale, collideHeight: entry.collideHeight, state: call.switchBall.state, part: 'ball' };
        updateGravitySwitchVisual(call, 0);
    }
    return call;
}

function createControlBillboard(output: RSPSharedOutput, placementIndex: number, dat: LevelDat): SSSVDrawCall {
    const call = new SSSVDrawCall();
    call.layer = SSSVLayer.Objects; call.objectPlacementIndex = placementIndex;
    call.billboard = true; call.translucent = true;
    call.DP_Combine = COMBINE_TEXTURED; call.DP_OtherModeH = DP_OTHERMODE_H; call.DP_OtherModeL = RENDER_TRANSLUCENT;
    call.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH;
    call.SP_TextureState.set(true, 0, 0, 32, 32);
    call.centerCount = 1;
    [call.fogNear, call.fogFar] = makeFogNearFar(dat);
    const base = output.vertices.length;
    for (const [x, y, s, t] of [[-1, -1, 0, 1], [1, -1, 1, 1], [1, 1, 1, 0], [-1, 1, 0, 0]]) {
        const v = new Vertex(); v.x = x; v.y = y; v.z = 0; v.tx = s; v.ty = t; v.c0 = v.c1 = v.c2 = v.a = 1;
        output.vertices.push(v);
    }
    call.firstIndex = output.indices.length; call.indexCount = 6;
    output.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return call;
}

export function buildLeverLights(output: RSPSharedOutput, placements: readonly LevelObjectPlacement[], table: ReadonlyMap<number, SSSVObjectData>, dat: LevelDat, commands: readonly LevelCommand[]): SSSVDrawCall[] {
    const calls: SSSVDrawCall[] = [];
    for (const [index, placement] of placements.entries()) {
        const entry = table.get(placement.id), visibility = readObjectVisibility(placement, commands);
        if (entry?.renderMode !== 12 || visibility.hidden) continue;
        const startup = readObjectStartupAppearance(placement, commands);
        const scale = startup?.scale ?? (entry.scaleOverride || placement.scale || 2048);
        const height = Math.floor(entry.collideHeight * scale / 2048);
        // func_802F603C: scale the local (15, 4, 0), then rotate with SINB/COSB.
        const x = (15 * scale) >> 11, y = (4 * scale) >> 11;
        const horizontal = (y * sinDegrees(placement.zRotation + 90)) >> 8;
        const dx = (x * sinDegrees(placement.angle + 90) + horizontal * sinDegrees(placement.angle)) >> 8;
        const dz = (-x * sinDegrees(placement.angle) + horizontal * sinDegrees(placement.angle + 90)) >> 8;
        const dy = (y * sinDegrees(placement.zRotation)) >> 8;
        const call = createControlBillboard(output, index, dat);
        call.leverLight = { size: (scale >> 2) * 3 / 256 };
        call.textureIndices = [DYNAMIC_EFFECT_TEXTURE_ID_BASE];
        call.DP_Combine = COMBINE_COLOURED_LIGHT;
        call.objectStateColor = true;
        vec4.set(call.DP_PrimColor, startup?.state === 1 ? 1 : 64 / 255, 0, 0, 1);
        vec4.set(call.DP_EnvColor, call.DP_PrimColor[0], 0, 0, 0);
        vec3.set(call.center, placement.x + dx, placement.y + dy + height / 2, mirrorZ(placement.z + dz));
        call.modelMatrix = mat4.fromTranslation(mat4.create(), call.center);
        calls.push(call);
    }
    return calls;
}

export interface LampStartup {
    rgb: [number, number, number];
    state: number;
    scale: number | null;
}

export function readLampStartup(placement: LevelObjectPlacement, commands: readonly LevelCommand[]): LampStartup | null {
    const result: LampStartup = { rgb: [0, 0, 0], state: 1, scale: null };
    if (placement.commandReferenceIdx === 0) return result;
    const base = placement.commandReferenceIdx - 1;
    for (let cursor = placement.commandsLength & 255; cursor <= 255; cursor++) {
        const command = commands[base + cursor];
        if (command === undefined) return null;
        const v = command.payload.createDataView(), value = v.getInt16(0);
        const zeroTail = v.getUint16(2) === 0 && v.getUint32(4) === 0;
        switch (command.opcode) {
            case 0x00:
            case 0x14:
                if (v.getUint32(0) !== 0 || v.getUint32(4) !== 0) return null;
                break;
            case 0x3D: {
                const destination = v.getUint8(6);
                if (destination > 2 || value < 0 || value > 255 || v.getUint32(2) !== 0 || v.getUint8(7) !== 0) return null;
                result.rgb[destination] = value;
                break;
            }
            case 0x0F:
                if (!zeroTail) return null;
                result.state = v.getUint16(0);
                break;
            case 0x36:
                if (!zeroTail || v.getUint16(0) === 0) return null;
                result.scale = v.getUint16(0);
                break;
            case 0x06:
                if (!zeroTail || value < 0 || value >= 0x7F7F) return null;
                if (value > 0) return result;
                break;
            case 0x09:
                return v.getUint32(0) === 0 && v.getUint32(4) === 0 ? result : null;
            default:
                return null;
        }
    }
    return null;
}

export function buildLampGlows(output: RSPSharedOutput, placements: readonly LevelObjectPlacement[], table: ReadonlyMap<number, SSSVObjectData>, dat: LevelDat, commands: readonly LevelCommand[]): SSSVDrawCall[] {
    const calls: SSSVDrawCall[] = [];
    for (const [index, placement] of placements.entries()) {
        const entry = table.get(placement.id);
        if (entry?.updateCallback !== 0x802F951C) continue;
        const startup = readLampStartup(placement, commands);
        if (startup === null || startup.state !== 1 || !startup.rgb.some(c => c !== 0)) continue;
        const scale = startup.scale ?? (entry.scaleOverride || placement.scale || 2048);
        const call = createControlBillboard(output, index, dat);
        call.projectedObjectSprite = { size: ((scale << 1) & 0xFFFF) * 3 / 256 };
        call.textureIndices = [DYNAMIC_EFFECT_TEXTURE_ID_BASE + 2];
        call.DP_Combine = COMBINE_COLOURED_LIGHT;
        vec4.set(call.DP_PrimColor, startup.rgb[0] / 255, startup.rgb[1] / 255, startup.rgb[2] / 255, 1);
        vec4.set(call.DP_EnvColor, startup.rgb[0] / 255, startup.rgb[1] / 255, startup.rgb[2] / 255, 0);
        // This callback effect is independent of the body's material-40 render guard.
        vec3.set(call.center, placement.x, placement.y + scale * 570 / 65536, mirrorZ(placement.z));
        call.modelMatrix = mat4.fromTranslation(mat4.create(), call.center);
        calls.push(call);
    }
    return calls;
}
