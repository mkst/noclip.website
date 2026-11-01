import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput, Vertex, RSP_Geometry } from "../../BanjoKazooie/f3dex.js";
import { mat4 } from "gl-matrix";
import { colorNewFromRGBA8 } from "../../Color.js";

import { parseI8Texture } from "../core/texture.js";
import { COMBINE_TEXTURED, DP_OTHERMODE_H, makeFogNearFar, makeLight, RENDER_TRANSLUCENT, SSSVDrawCall, SSSVLayer } from "./terrain.js";
import type { LevelDat } from "../core/level.js";

export const STAR_TEXTURE_ID = 630;
export const STAR_COUNT = 360;
export const STAR_SIZE_SCALE = 0.25;
export const STAR_DRIFT_SPEED = 60;
export const STAR_DRIFT_START_OFFSET = 10000;
export const STAR_MIN_HORIZONTAL_RADIUS = 5000;

export function installStarTexture(sharedOutput: RSPSharedOutput, segment1: ArrayBufferSlice): void {
    sharedOutput.textureCache.textures[STAR_TEXTURE_ID] = parseI8Texture(segment1, 32, 32, "stars", 0x2A210);
}

export function buildStarfield(sharedOutput: RSPSharedOutput, dat: LevelDat): SSSVDrawCall[] {
    const texture = sharedOutput.textureCache.textures[STAR_TEXTURE_ID];
    if (texture === undefined)
        return [];

    const [fogNear, fogFar] = makeFogNearFar(dat);
    const fogColor = colorNewFromRGBA8(0x000000FF);
    const light = makeLight(dat);
    const base = sharedOutput.vertices.length;
    const quad = [
        { x: -0.5, y: -0.5, u: 0, v: 1 },
        { x: 0.5, y: -0.5, u: 1, v: 1 },
        { x: 0.5, y: 0.5, u: 1, v: 0 },
        { x: -0.5, y: 0.5, u: 0, v: 0 },
    ];
    for (const corner of quad) {
        const v = new Vertex();
        v.x = corner.x;
        v.y = corner.y;
        v.z = 0;
        v.matrixIndex = 1;
        v.tx = corner.u;
        v.ty = corner.v;
        v.c0 = 0.7;
        v.c1 = 0.75;
        v.c2 = 0.9;
        v.a = 1;
        sharedOutput.vertices.push(v);
    }
    const firstIndex = sharedOutput.indices.length;
    sharedOutput.indices.push(base + 0, base + 1, base + 2, base + 0, base + 2, base + 3);

    const center = [2304, 500, 3584];
    const drawCalls: SSSVDrawCall[] = [];
    let seed = 0x12345678;
    const random = (): number => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
    };

    for (let i = 0; i < STAR_COUNT; i++) {
        let x = 0;
        let y = 0;
        let wz = 0;
        do {
            const z = (random() * 2) - 1;
            const theta = random() * Math.PI * 2;
            const r = Math.sqrt(1 - z * z);
            const radius = 24000 + random() * 4000;
            x = center[0] + Math.cos(theta) * r * radius;
            y = center[1] + z * radius;
            wz = center[2] + Math.sin(theta) * r * radius;
        } while (Math.hypot(x - center[0], wz - center[2]) < STAR_MIN_HORIZONTAL_RADIUS);
        const size = (300 + random() * 250) * STAR_SIZE_SCALE;

        const modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, [x, y, wz]);
        mat4.scale(modelMatrix, modelMatrix, [size, size, size]);

        const drawCall = new SSSVDrawCall();
        drawCall.layer = SSSVLayer.Stars;
        drawCall.billboard = true;
        drawCall.translucent = true;
        drawCall.modelMatrix = modelMatrix;
        drawCall.starDrift = true;
        drawCall.starBaseY = y;
        drawCall.starDriftSpeed = STAR_DRIFT_SPEED;
        drawCall.starDriftStartOffset = STAR_DRIFT_START_OFFSET;
        drawCall.SP_GeometryMode = RSP_Geometry.G_ZBUFFER;
        drawCall.SP_TextureState.set(true, 0, 0, texture.width, texture.height);
        drawCall.DP_OtherModeH = DP_OTHERMODE_H;
        drawCall.DP_OtherModeL = RENDER_TRANSLUCENT;
        drawCall.DP_Combine = COMBINE_TEXTURED;
        drawCall.textureIndices = [STAR_TEXTURE_ID];
        drawCall.fogNear = fogNear;
        drawCall.fogFar = fogFar;
        drawCall.fogColor = fogColor;
        drawCall.light = light;
        drawCall.firstIndex = firstIndex;
        drawCall.indexCount = 6;
        drawCall.center[0] = x;
        drawCall.center[1] = y;
        drawCall.center[2] = wz;
        drawCall.centerCount = 1;
        drawCalls.push(drawCall);
    }

    for (let i = 0; i < 6; i++) {
        const modelMatrix = mat4.create();
        const startX = center[0] + ((random() * 2) - 1) * 10000;
        const startY = center[1] + 5000 + random() * 5000;
        const startZ = center[2] + ((random() * 2) - 1) * 10000;
        const size = 300 + random() * 300;
        mat4.translate(modelMatrix, modelMatrix, [startX, startY, startZ]);
        mat4.scale(modelMatrix, modelMatrix, [size, size, size]);

        const drawCall = new SSSVDrawCall();
        drawCall.layer = SSSVLayer.Stars;
        drawCall.billboard = true;
        drawCall.translucent = true;
        drawCall.modelMatrix = modelMatrix;
        drawCall.meteor = {
            startX,
            startY,
            startZ,
            velocityX: (random() * 2 - 1) * 6000,
            velocityY: -1200 - random() * 1800,
            velocityZ: (random() * 2 - 1) * 6000,
            duration: 1.2 + random() * 0.8,
            cycle: 7 + random() * 7,
            phase: random() * 14,
        };
        drawCall.SP_GeometryMode = RSP_Geometry.G_ZBUFFER;
        drawCall.SP_TextureState.set(true, 0, 0, texture.width, texture.height);
        drawCall.DP_OtherModeH = DP_OTHERMODE_H;
        drawCall.DP_OtherModeL = RENDER_TRANSLUCENT;
        drawCall.DP_Combine = COMBINE_TEXTURED;
        drawCall.textureIndices = [STAR_TEXTURE_ID];
        drawCall.fogNear = fogNear;
        drawCall.fogFar = fogFar;
        drawCall.fogColor = fogColor;
        drawCall.light = light;
        drawCall.firstIndex = firstIndex;
        drawCall.indexCount = 6;
        drawCall.center[0] = startX;
        drawCall.center[1] = startY;
        drawCall.center[2] = startZ;
        drawCall.centerCount = 1;
        drawCalls.push(drawCall);
    }

    return drawCalls;
}
