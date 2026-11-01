import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { mat4, vec3, vec4 } from 'gl-matrix';
import type { LevelObjectPlacement } from '../core/level.js';
import { SSSVDrawCall } from '../render/terrain.js';
import { computeObjectRotationMatrix } from '../objects/object_rotation.js';
import { createLiveObjectTransform, LeverVisuals, updateLiveObjectPose, WorldObjectTranslation } from '../objects/object_visuals.js';

const placement: LevelObjectPlacement = { id: 45, x: 10, y: 20, z: 30, angle: 0, zRotation: 0, scale: 2048, unkC: 0,
    commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 };
const fixed = (x: number, y: number, z: number) => Int32Array.from([x, y, z], v => v * 65536);

test('lever bindings consume state by placement and restore each part without changing other channels or visibility', () => {
    const handle = new SSSVDrawCall(), light = new SSSVDrawCall(), unrelated = new SSSVDrawCall();
    handle.objectPlacementIndex = light.objectPlacementIndex = unrelated.objectPlacementIndex = 4;
    handle.objectStateColor = light.objectStateColor = true;
    handle.leverHandle = { placement, scale: 2048, collideHeight: 6, initialPhase: 32, phase: 32 };
    light.leverLight = { size: 1 };
    handle.visible = false;
    vec4.set(handle.DP_PrimColor, 0.5, 0.25, 0.125, 0.75);
    vec4.set(light.DP_PrimColor, 0.25, 0.125, 0.5, 0.75);
    vec4.set(light.DP_EnvColor, 0.125, 0.5, 0.25, 0);
    const originalHandle = [...handle.DP_PrimColor], originalLight = [...light.DP_PrimColor], originalEnvironment = [...light.DP_EnvColor];
    const visuals = new LeverVisuals([handle, light, unrelated]);
    visuals.update(index => { equal(index, 4); return { state: 1, phase: 128 }; });
    equal(handle.DP_PrimColor[0], 1); equal(light.DP_EnvColor[0], 1); equal(handle.leverHandle.phase, 128);
    equal(handle.visible, false); equal(unrelated.DP_PrimColor[0], 1);
    visuals.update(() => ({ state: 0, phase: 64 }));
    ok(Math.abs(light.DP_PrimColor[0] - 64 / 255) < 1e-7); equal(handle.leverHandle.phase, 64);
    visuals.update(() => null);
    deepEqual([...handle.DP_PrimColor], originalHandle); deepEqual([...light.DP_PrimColor], originalLight);
    deepEqual([...light.DP_EnvColor], originalEnvironment); equal(handle.leverHandle.phase, 32);
    visuals.update(() => ({ state: 1, phase: 128 })); visuals.update(() => null);
    deepEqual([...light.DP_EnvColor], originalEnvironment);
});

test('missing live state restores only that lever and unplaced draws are not queried', () => {
    const calls = [1, 2, null].map(index => {
        const call = new SSSVDrawCall(); call.objectStateColor = true; call.objectPlacementIndex = index;
        call.DP_PrimColor[0] = 0.5; return call;
    });
    const visuals = new LeverVisuals(calls);
    visuals.update(index => { ok(index !== null); return index === 1 ? { state: 1, phase: 128 } : null; });
    deepEqual(calls.map(c => c.DP_PrimColor[0]), [1, 0.5, 0.5]);
});

test('world-baked translation mirrors source Z once, composes part transforms and keeps the centre free of cumulative drift', () => {
    const call = new SSSVDrawCall();
    vec3.set(call.center, 40, 50, 60);
    call.modelMatrix = mat4.fromTranslation(mat4.create(), [1, 2, 3]);
    mat4.scale(call.modelMatrix, call.modelMatrix, [2, 3, 4]);
    const originalMatrix = call.modelMatrix, originalValues = [...originalMatrix];
    const visual = new WorldObjectTranslation(call, placement);
    visual.update(fixed(10.5, 16.75, 31.75));
    deepEqual([...call.center], [40.5, 46.75, 58.25]);
    deepEqual([...vec3.transformMat4(vec3.create(), [2, 3, 4], call.modelMatrix!)], [5.5, 7.75, 17.25]);
    const matrix = call.modelMatrix, values = [...matrix!];
    visual.update(fixed(10.5, 16.75, 31.75)); equal(call.modelMatrix, matrix); deepEqual([...matrix!], values);
    visual.update(fixed(9, 21, 29)); deepEqual([...call.center], [39, 51, 61]);
    visual.update(null); equal(call.modelMatrix, originalMatrix); deepEqual([...call.center], [40, 50, 60]);
    deepEqual([...originalMatrix], originalValues);
});

test('world-baked objects with no original matrix return to the static matrix-free baseline', () => {
    const call = new SSSVDrawCall(); vec3.set(call.center, 1, 2, 3);
    const visual = new WorldObjectTranslation(call, placement);
    visual.update(fixed(11, 22, 33)); deepEqual([...call.center], [2, 4, 0]);
    visual.update(null); equal(call.modelMatrix, null); deepEqual([...call.center], [1, 2, 3]);
});

test('shadow translation replaces the automatic path-preview matrix and restores its original writer on disable', () => {
    const call = new SSSVDrawCall(); vec3.set(call.center, 10, 22, 7138);
    call.modelMatrix = mat4.fromTranslation(mat4.create(), [100, 200, 300]);
    const previewMatrix = call.modelMatrix;
    const visual = new WorldObjectTranslation(call, placement, null);
    visual.update(fixed(11, 24, 32));
    deepEqual([...vec3.transformMat4(vec3.create(), [10, 22, 7138], call.modelMatrix!)], [11, 26, 7136]);
    deepEqual([...call.center], [11, 26, 7136]);
    visual.update(null); equal(call.modelMatrix, previewMatrix);
    mat4.fromTranslation(previewMatrix, [400, 500, 600]);
    visual.update(fixed(11, 24, 32)); equal(call.modelMatrix![12], 1);
    visual.update(null); equal(call.modelMatrix, previewMatrix); equal(call.modelMatrix![12], 400);
});

test('live local poses retain fractional source positions, part transforms and pivots without renderer-time rotation rates', () => {
    const localMatrix = mat4.fromTranslation(mat4.create(), [2, 0, 0]);
    const transform = createLiveObjectTransform(placement, { scale: 2, originY: 3, localMatrix });
    const position = fixed(10.5, 20, 30), original = [...position];
    updateLiveObjectPose(transform, { fixedPosition: position, angle: 90, zRotation: 0 });
    deepEqual(transform.rotation, { yPerTick: 0, zPerTick: 0 }); equal(transform.localMatrix, localMatrix);
    equal(placement.x, 10); equal(transform.placement.x, 10.5); deepEqual([...position], original);
    const matrix = mat4.create(); computeObjectRotationMatrix(matrix, transform, 999);
    deepEqual([...vec3.transformMat4(vec3.create(), [1, 2, 3], matrix)], [14.5, 29, 7144]);
    updateLiveObjectPose(transform, { fixedPosition: position, angle: -45, zRotation: 12 });
    equal(transform.placement.angle, -45); equal(transform.placement.zRotation, 12);
});
