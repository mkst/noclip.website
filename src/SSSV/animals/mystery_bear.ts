import { mat4, vec3 } from "gl-matrix";
import { RSP_Geometry, RSPSharedOutput, Vertex } from "../../BanjoKazooie/f3dex.js";
import { assertExists } from "../../util.js";
import { SINE_TABLE_256 } from "./animal_matrix.js";
import type { AnimalJoint } from "./animal_matrix.js";
import type { LevelAnimalPlacement } from "../core/level.js";
import { mirrorZ } from "../core/level.js";
import { BIOME_REGULAR_TEXTURE_ID_BASE } from "../objects/objects.js";
import { COMBINE_TEXTURED, DP_OTHERMODE_H, RENDER_TRANSLUCENT, SSSVDrawCall, SSSVLayer } from "../render/terrain.js";

const sin = (angle: number): number => SINE_TABLE_256[angle & 255] >> 7;
const cos = (angle: number): number => sin(angle + 64);

export function sampleMysteryBearJoints(tick: number): Record<number, AnimalJoint> {
    // At zero velocity adjacent wobble targets differ by <200, so the source
    // smoothing branch always reaches its target, including from tick-zero 0.
    const sway = sin(tick * 8) * 0x592;
    const upper = { x: 0, z: 0 - (sway >> 11), y: 4018 - Math.abs(sway >> 12) };
    const lower = { x: 0, z: sway >> 10, y: 1426 };
    const joints: Record<number, AnimalJoint> = {
        0: { x: 0, z: 0, y: 2722 }, 1: upper, 2: lower,
        19: { x: 0, z: upper.z + 43, y: upper.y + 120 },
        20: { x: 0, z: upper.z + 821, y: upper.y + 120 },
        26: { ...lower, y: 0 }, 27: { ...lower },
    };
    for (const [from, to, x, angle] of [
        [7, 8, 1037, (sin(tick * 12 + 105) >> 4) + 80],
        [10, 11, -1037, (cos(tick * 12 + 126) >> 4) + 80],
    ]) {
        joints[from] = { ...upper, x };
        joints[to] = { x, z: upper.z + ((sin(angle) * 2334) >> 8), y: upper.y + ((cos(angle) * 2334) >> 8) };
    }
    return joints;
}

export function sampleMysteryBearBalls(placement: Readonly<LevelAnimalPlacement>, resolvedY: number, tick: number): [number, number, number][] {
    const s = sin(-placement.rotation), c = cos(-placement.rotation);
    return [0, 85, 171].map(phase => {
        const t = (tick + phase) & 255;
        const height = Math.trunc(sin(t * 8) * 0xA6 * 0x180 / 4);
        const side = Math.trunc(sin(t * 4) * 0xA6 / 4);
        return [placement.x + (c * side - s * 0x33E0) / 65536,
            resolvedY + (height + 67 * 0x29800) / 65536,
            mirrorZ(placement.z + (s * side + c * 0x33E0) / 65536)];
    });
}

export function buildMysteryBearBalls(output: RSPSharedOutput, placement: Readonly<LevelAnimalPlacement>, resolvedY: number): SSSVDrawCall[] {
    return sampleMysteryBearBalls(placement, resolvedY, 0).map((center, i) => {
        const call = new SSSVDrawCall();
        call.layer = SSSVLayer.Animals;
        call.billboard = call.translucent = true;
        call.projectedObjectSprite = { size: 612 * 3 / 256 };
        call.DP_Combine = COMBINE_TEXTURED;
        call.DP_OtherModeH = DP_OTHERMODE_H;
        call.DP_OtherModeL = RENDER_TRANSLUCENT;
        call.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH;
        call.SP_TextureState.set(true, 0, 0, 32, 32);
        const textureId = BIOME_REGULAR_TEXTURE_ID_BASE + i + 3;
        assertExists(output.textureCache.textures[textureId], "Mystery Bear ball texture");
        call.textureIndices = [textureId];
        vec3.copy(call.center, center);
        call.centerCount = 1;
        call.modelMatrix = mat4.fromTranslation(mat4.create(), center);
        const base = output.vertices.length;
        for (const [x, y, s, t] of [[-1, -1, 0, 1], [1, -1, 1, 1], [1, 1, 1, 0], [-1, 1, 0, 0]]) {
            const v = new Vertex();
            v.x = x; v.y = y; v.z = 0;
            v.matrixIndex = 1; v.tx = s; v.ty = t;
            v.c0 = v.c1 = v.c2 = v.a = 1;
            output.vertices.push(v);
        }
        call.firstIndex = output.indices.length;
        output.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        call.indexCount = 6;
        return call;
    });
}
