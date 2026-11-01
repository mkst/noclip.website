import { existsSync, readFileSync } from 'node:fs';
import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { mat4 } from 'gl-matrix';
import { computeObjectPathMatrix, computeObjectPathShadowMatrix, getObjectPathPreviewTick } from '../objects/object_path.js';
import { computeObjectRotationMatrix } from '../objects/object_rotation.js';
import { SnowPlatformRuntime } from '../objects/snow_platforms.js';
import { SnowPlatformVisuals } from '../objects/snow_platform_renderer.js';
import { SSSVDrawCall } from '../render/terrain.js';
import AB from '../../ArrayBufferSlice.js';
import { RSPSharedOutput } from '../../BanjoKazooie/f3dex.js';
import { mirrorZ, parseLevelContainer } from '../core/level.js';
import { prepareLevel, prepareLevelFeatures } from '../core/level_preparation.js';
import { LEVELS, LEVEL_OBJECT_TEXTURES } from '../core/level_table.js';
import { parseMipmapBank } from '../core/texture.js';
import { parseObjectTable, indexObjectTable, installShadowTextures, parseObjectTextureBank, buildObjects } from '../objects/objects.js';

(globalThis as any).window = { debug: false };
const read = (p: string) => AB.fromView(readFileSync(p));
function fixture() {
    const entry = LEVELS.find(e => e.id === 'SNOW_JOKE')!;
    const level = prepareLevel(parseLevelContainer(read('data/SSSV/levels/SNOW_JOKE.bin')), entry.id);
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin'))), output = new RSPSharedOutput();
    const segments = [undefined, read('data/SSSV/segments/segment1.bin'), undefined, undefined,
        read(`data/SSSV/segments/${level.biome}_biome.bin`), read(`data/SSSV/segments/${level.levelSegmentName}.bin`)];
    parseMipmapBank(read(`data/SSSV/textures/${level.biome}.rgba16.bin`), 'rgba16', level.biome!)
        .forEach((t, i) => output.textureCache.textures[i] = t);
    parseMipmapBank(read(`data/SSSV/textures/${entry.textureBank}.bin`), 'rgba16', entry.textureBank)
        .forEach((t, i) => output.textureCache.textures[20 + i] = t);
    parseObjectTextureBank(segments[5]!, LEVEL_OBJECT_TEXTURES[level.levelSegmentName] ?? [])
        .forEach((t, i) => output.textureCache.textures[40 + i] = t);
    installShadowTextures(output, segments[1]!);
    const calls = buildObjects(output, level.objectPlacements, table, segments, level.dat, level.commands, level.pathAnalysis);
    const pairs = [2, 3, 8].map(index => {
        const body = calls.find(c => c.objectPlacementIndex === index && c.objectPathMotion)!;
        const shadow = calls.find(c => c.objectPathShadowMotion?.placement === body.objectPathMotion!.placement)!;
        return { index, body, shadow, bodyState: body.objectPathMotion!, shadowState: shadow.objectPathShadowMotion! };
    });
    return { level, table, output, calls, pairs, config: prepareLevelFeatures(level, table).snowConfig! };
}

const available = existsSync('data/SSSV/levels/SNOW_JOKE.bin');
type Pair = ReturnType<typeof fixture>['pairs'][number];

// Exercise the CPU visual boundary used after visibility/distance rejection in draw submission.
function submit(call: SSSVDrawCall, tick: number, camera: readonly number[]): boolean {
    if (call.shadowFadeExponent !== null) {
        const dx = call.center[0] - camera[0], dz = call.center[2] - camera[2], distance = dx * dx + dz * dz;
        const exponent = call.shadowFadeExponent;
        if ((exponent >= 0 ? distance >> exponent : distance << -exponent) >= 0x51000) return false;
    }
    if (!call.visible) return false;
    const pathTick = call.objectPathPreviewTime !== null ? getObjectPathPreviewTick(call.objectPathPreviewTime, tick) : 0;
    if (call.objectPathMotion) computeObjectPathMatrix(call.modelMatrix!, call.objectPathMotion, pathTick);
    else if (call.objectPathShadowMotion) computeObjectPathShadowMatrix(call.modelMatrix!, call.objectPathShadowMotion, pathTick);
    else if (call.objectRotation) computeObjectRotationMatrix(call.modelMatrix!, call.objectRotation, tick);
    return true;
}
function camera(pair: Pair) { return [pair.shadow.center[0], pair.shadow.center[1] + 100, pair.shadow.center[2]]; }
function positions(pair: Pair) {
    const b = pair.body.modelMatrix!, s = pair.shadow.modelMatrix!, p = pair.shadowState.placement;
    return { body: [b[12], b[13] - pair.bodyState.originY, mirrorZ(b[14])],
        shadow: [p.x + s[12], p.y + s[13], p.z - s[14]] };
}
function synchronized(pair: Pair) {
    const { body, shadow } = positions(pair);
    ok(Math.hypot(...body.map((v, i) => v - shadow[i])) < 0.001, JSON.stringify({ index: pair.index, body, shadow }));
}
function expectedPreview(pair: Pair, tick: number) {
    const body = mat4.create(), shadow = mat4.create();
    computeObjectPathMatrix(body, pair.bodyState, tick); computeObjectPathShadowMatrix(shadow, pair.shadowState, tick);
    deepEqual(pair.body.modelMatrix, body); deepEqual(pair.shadow.modelMatrix, shadow);
}

test('actual Snow bodies and shadows share placement time, with independent state across placements', { skip: !available }, () => {
    const f = fixture();
    deepEqual(f.pairs.map(p => [p.index, p.bodyState.pilot.path.index, p.bodyState.pilot.direction, p.bodyState.pilot.loop]),
        [[2, 1, -1, true], [3, 9, 1, false], [8, 0, 1, true]]);
    for (const p of f.pairs) {
        ok(p.body.indexCount > 0 && p.shadow.indexCount > 0); equal(p.shadow.shadowFadeExponent, 2);
        ok(p.body.objectPathPreviewTime); equal(p.body.objectPathPreviewTime, p.shadow.objectPathPreviewTime);
        equal(p.body.objectPathPreviewTime.startTick, null);
    }
    equal(new Set(f.pairs.map(p => p.body.objectPathPreviewTime)).size, 3);
    ok(f.calls.filter(c => !c.objectPathMotion && !c.objectPathShadowMotion).every(c => c.objectPathPreviewTime === null));
});

test('delayed distance-culled shadows join the body pose on all three actual Snow paths', { skip: !available }, () => {
    for (const shadowFirst of [false, true]) {
        const f = fixture();
        for (const p of f.pairs) {
            const near = camera(p), far = [near[0] + 4096, near[1], near[2]];
            equal(submit(p.body, 0, far), true); equal(submit(p.shadow, 0, far), false);
            const order = shadowFirst ? [p.shadow, p.body] : [p.body, p.shadow];
            for (const c of order) equal(submit(c, 30, near), true);
            synchronized(p); expectedPreview(p, 30); equal(p.body.objectPathPreviewTime!.startTick, 0);
        }
    }
});

test('a hidden body joins an already rendered shadow, including multiple geometry calls for one placement', { skip: !available }, () => {
    const f = fixture();
    for (const p of f.pairs) {
        const near = camera(p);
        p.body.visible = false; equal(submit(p.body, 10, near), false); equal(submit(p.shadow, 10, near), true);
        const part = Object.assign(new SSSVDrawCall(), p.body, { modelMatrix: mat4.create(), visible: true });
        equal(part.objectPathPreviewTime, p.body.objectPathPreviewTime);
        submit(part, 40, near); p.body.visible = true; submit(p.body, 40, near); submit(p.shadow, 40, near);
        deepEqual(part.modelMatrix, p.body.modelMatrix); synchronized(p); expectedPreview(p, 30);
    }
});

test('both-hidden objects keep lazy origins and placements can start independently', { skip: !available }, () => {
    const f = fixture();
    f.pairs.forEach((p, i) => {
        const near = camera(p); p.body.visible = p.shadow.visible = false;
        submit(p.body, 0, near); submit(p.shadow, 20, near); equal(p.body.objectPathPreviewTime!.startTick, null);
        p.body.visible = p.shadow.visible = true;
        const start = 30 + i * 10;
        submit(p.shadow, start, near); submit(p.body, start, near); synchronized(p); expectedPreview(p, 0);
        equal(p.body.objectPathPreviewTime!.startTick, start);
    });
    for (const p of f.pairs) {
        submit(p.body, 80, camera(p)); submit(p.shadow, 80, camera(p)); synchronized(p);
        expectedPreview(p, 80 - p.body.objectPathPreviewTime!.startTick!);
    }
});

test('pause/repeats, large forward seeks and backward seeks retain the previous preview epoch convention', { skip: !available }, () => {
    const f = fixture();
    for (const p of f.pairs) {
        const near = camera(p);
        for (const [scene, phase] of [[10, 0], [40, 30], [40, 30], [1000, 990], [30, 20], [5, 0], [20, 15], [8, 3]]) {
            submit(p.shadow, scene, near); submit(p.body, scene, near); synchronized(p); expectedPreview(p, phase);
        }
        const before = [...p.body.modelMatrix!];
        submit(p.body, 8, near); submit(p.shadow, 8, near); deepEqual([...p.body.modelMatrix!], before);
        submit(p.body, 9, near); submit(p.shadow, 9, near); synchronized(p); expectedPreview(p, 4);
    }
    const fresh = fixture(); ok(fresh.pairs.every(p => p.body.objectPathPreviewTime!.startTick === null));
});

test('live enable/disable/reset preserves time ownership and restores the same automatic preview matrices', { skip: !available }, () => {
    const f = fixture(), runtime = new SnowPlatformRuntime(f.config), visual = new SnowPlatformVisuals(runtime, f.calls);
    for (const p of f.pairs) { submit(p.body, 10, camera(p)); submit(p.shadow, 10, camera(p)); }
    const times = f.pairs.map(p => p.body.objectPathPreviewTime);
    for (const enabled of [true, false, true, false]) {
        runtime.setEnabled(enabled); runtime.advanceTo(0); runtime.advanceTo(20); visual.update(true, 50);
        for (const p of f.pairs) {
            equal(p.body.objectPathPreviewTime, times[f.pairs.indexOf(p)]);
            if (p.body.visible) submit(p.body, 50, camera(p));
            if (p.shadow.visible) submit(p.shadow, 50, camera(p));
            if (!enabled) { synchronized(p); expectedPreview(p, 40); }
            else {
                equal(p.body.objectPathMotion, null); equal(p.shadow.objectPathShadowMotion, null);
                const object = runtime.world.objects.get(`object:${p.index}`)!;
                const s = p.shadow.modelMatrix!, placement = p.shadowState.placement;
                const shadowPose = [placement.x + s[12], placement.y + s[13], placement.z - s[14]];
                object.fixedPosition.forEach((value, i) => ok(Math.abs(value / 65536 - shadowPose[i]) < 0.001));
            }
        }
        runtime.reset(); visual.update(true, 60);
        for (const p of f.pairs) equal(p.body.objectPathPreviewTime!.startTick, 10);
        ok([...runtime.world.programs.values()].every(vm => vm.diagnostic === null));
    }
    const variants = f.calls.filter(c => c.objectPlacementIndex === 3);
    ok(variants.length >= 2); ok(variants.every(c => c.objectPathPreviewTime === f.pairs[1].body.objectPathPreviewTime));
});

test('first eligible render in live mode establishes the fallback preview origin too', { skip: !available }, () => {
    const f = fixture(), runtime = new SnowPlatformRuntime(f.config), visual = new SnowPlatformVisuals(runtime, f.calls);
    const p = f.pairs.find(p => p.index === 8)!;
    runtime.setEnabled(true); visual.update(true, 100);
    equal(p.body.objectPathMotion, null); equal(submit(p.body, 100, camera(p)), true);
    equal(p.body.objectPathPreviewTime!.startTick, 100);
    runtime.setEnabled(false); visual.update(true, 130);
    submit(p.shadow, 130, camera(p)); submit(p.body, 130, camera(p)); synchronized(p); expectedPreview(p, 30);
});

test('live motion pause, hidden objects and resume leave the placement preview origin intact', { skip: !available }, () => {
    const f = fixture(), runtime = new SnowPlatformRuntime(f.config), visual = new SnowPlatformVisuals(runtime, f.calls);
    for (const p of f.pairs) { submit(p.body, 10, camera(p)); submit(p.shadow, 10, camera(p)); }
    runtime.setEnabled(true); runtime.advanceTo(0); runtime.advanceTo(20); visual.update(true, 20);
    for (const p of f.pairs) { submit(p.body, 20, camera(p)); submit(p.shadow, 20, camera(p)); }
    const before = f.pairs.map(p => ({ position: [...runtime.world.objects.get(`object:${p.index}`)!.fixedPosition],
        body: [...p.body.modelMatrix!], shadow: [...p.shadow.modelMatrix!] }));
    runtime.motionEnabled = false; runtime.advanceTo(40); visual.update(false, 40);
    for (const p of f.pairs) {
        equal(submit(p.body, 40, camera(p)), false); equal(submit(p.shadow, 40, camera(p)), false);
        equal(p.body.objectPathPreviewTime!.startTick, 10);
    }
    visual.update(true, 40);
    f.pairs.forEach((p, i) => {
        submit(p.body, 40, camera(p)); submit(p.shadow, 40, camera(p));
        deepEqual([...runtime.world.objects.get(`object:${p.index}`)!.fixedPosition], before[i].position);
        deepEqual([...p.body.modelMatrix!], before[i].body); deepEqual([...p.shadow.modelMatrix!], before[i].shadow);
    });
    runtime.motionEnabled = true; runtime.advanceTo(41); visual.update(true, 41);
    runtime.setEnabled(false); visual.update(true, 60);
    for (const p of f.pairs) {
        submit(p.shadow, 60, camera(p)); submit(p.body, 60, camera(p)); synchronized(p); expectedPreview(p, 50);
    }
});
