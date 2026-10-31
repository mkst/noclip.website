import { mat4, vec3, vec4 } from "gl-matrix";
import * as RDP from "../Common/N64/RDP.js";
import { RSP_Geometry, RSPSharedOutput, Vertex } from "../BanjoKazooie/f3dex.js";
import { SINE_TABLE_256 } from "./animal_matrix.js";
import type { AnimalJoint } from "./animal_matrix.js";
import type { LevelAnimalPlacement } from "./level.js";
import { mirrorZ } from "./level.js";
import { DYNAMIC_EFFECT_TEXTURE_ID_BASE } from "./objects.js";
import { DP_OTHERMODE_H, RENDER_TRANSLUCENT, SSSVDrawCall, SSSVLayer } from "./terrain.js";

const COMBINE_GLOW: RDP.CombineParams = {
    c0: { a: RDP.CCMUX.PRIMITIVE, b: RDP.CCMUX.ENVIRONMENT, c: RDP.CCMUX.TEXEL0, d: RDP.CCMUX.ENVIRONMENT },
    a0: { a: RDP.ACMUX.PRIMITIVE, b: RDP.ACMUX.ENVIRONMENT, c: RDP.ACMUX.TEXEL0, d: RDP.ACMUX.ENVIRONMENT },
    c1: { a: RDP.CCMUX.ADD_ZERO, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.MUL_ZERO, d: RDP.CCMUX.COMBINED },
    a1: { a: RDP.ACMUX.ZERO, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.ZERO, d: RDP.ACMUX.ADD_COMBINED },
};

export function buildRatEyeGlows(output: RSPSharedOutput, placement: Readonly<LevelAnimalPlacement>, resolvedY: number, joint: AnimalJoint): SSSVDrawCall[] {
    if ((placement.id !== 32 && placement.id !== 13) || placement.health <= 0) return [];
    const size = placement.id === 13 ? 2 : 1;
    const sin = SINE_TABLE_256[placement.rotation & 0xFF] >> 7;
    const cos = SINE_TABLE_256[(placement.rotation + 64) & 0xFF] >> 7;
    const height = Math.trunc((joint.y << 15) / 16) * 2 - 22 * 65536;
    const forward = 0xE00 - Math.abs(height >> 10);
    return [1, -1].map(side => {
        const call = new SSSVDrawCall();
        call.layer = SSSVLayer.Animals;
        call.animalEyeGlow = true;
        call.billboard = call.translucent = true;
        call.projectedObjectSprite = { size: (size << 9) * 3 / 256 };
        call.DP_Combine = COMBINE_GLOW;
        call.DP_OtherModeH = DP_OTHERMODE_H;
        call.DP_OtherModeL = RENDER_TRANSLUCENT;
        call.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH;
        call.SP_TextureState.set(true, 0, 0, 32, 32);
        call.textureIndices = [DYNAMIC_EFFECT_TEXTURE_ID_BASE + 3];
        vec4.set(call.DP_PrimColor, 1, 0, 0, 1);
        vec4.set(call.DP_EnvColor, 1, 0, 0, 0);
        vec3.set(call.center,
            placement.x + size * (forward * sin + side * cos * 0x300) / 65536,
            resolvedY + size * (9 + height / 65536),
            mirrorZ(placement.z + size * (forward * cos - side * sin * 0x300) / 65536));
        call.centerCount = 1;
        call.modelMatrix = mat4.fromTranslation(mat4.create(), call.center);
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
