import { mat4, vec3 } from 'gl-matrix';
import { SnowPlatformRuntime } from './snow_platforms.js';
import { SSSVDrawCall, COMBINE_TEXTURED, FAN_TEXTURE_ID_BASE } from './terrain.js';
import type { ObjectRotationTransform } from './object_rotation.js';

export class SnowPlatformVisuals {
    public revealInvisible = false;
    private readonly bindings;
    private readonly fans;
    private readonly switchColors;
    private readonly revealed = new Set<SSSVDrawCall>();
    constructor(public readonly runtime: SnowPlatformRuntime, calls: SSSVDrawCall[]) {
        const variants = calls.filter(c => c.objectPlacementIndex === 3 && c.objectPathMotion !== null).map(original => {
            const call = Object.assign(new SSSVDrawCall(), original), state = new SSSVDrawCall().SP_TextureState;
            state.set(true, 0, 0, 0.5, 0.5); call.SP_TextureState = state;
            call.center = vec3.clone(original.center); call.modelMatrix = mat4.create();
            call.textureIndices = [29]; call.DP_Combine = COMBINE_TEXTURED;
            call.visible = false; this.revealed.add(call); return call;
        });
        calls.push(...variants);
        this.fans = calls.filter(c => c.fanAnimation && [1, 2].includes(c.fanAnimation.slot)).map(call => {
            if (call.animationTextureIndices === null) {
                call.animationTextureIndices = Array.from({ length: 4 }, (_, i) => FAN_TEXTURE_ID_BASE + i);
                call.textureIndices = [FAN_TEXTURE_ID_BASE]; call.DP_Combine = COMBINE_TEXTURED;
                call.SP_TextureState.set(true, 0, 0, 32, 32);
                call.scrollStepS = call.scrollStepT = 0;
            }
            const count = call.animationTextureIndices.length;
            return { call, count };
        });
        this.switchColors = calls.filter(c => c.objectStateColor && [4, 5, 27].includes(c.objectPlacementIndex!)).map(call => ({ call, red: call.DP_PrimColor[0] }));
        this.bindings = calls.flatMap(call => {
            const body = call.objectPathMotion, shadow = call.objectPathShadowMotion;
            const p = body?.placement ?? shadow?.placement;
            if (!p) return [];
            const index = runtime.config.indices.find(i => runtime.config.placements[i].commandReferenceIdx === p.commandReferenceIdx && p.id === 94);
            if (index === undefined) return [];
            const transform: ObjectRotationTransform | null = body ? { placement: { ...p }, scale: body.scale, originY: body.originY,
                localMatrix: body.localMatrix, rotation: { yPerTick: 0, zPerTick: 0 } } : null;
            return [{ index, call, body, shadow, transform, center: vec3.clone(call.center) }];
        });
    }
    public update(objectsEnabled: boolean, tick = 0): void {
        const r = this.runtime;
        for (const { call, count } of this.fans) {
            const frame = r.world.fanSlots.get(call.fanAnimation!.slot)!.frame;
            call.commandTextureFrame = r.enabled ? call.animationTextureIndices!.indexOf(FAN_TEXTURE_ID_BASE + frame) : Math.floor(tick / 2) % count;
        }
        for (const { call, red } of this.switchColors) {
            call.DP_PrimColor[0] = r.enabled ? r.world.getEntity(`object:${call.objectPlacementIndex}`)!.state === 1 ? 1 : 64 / 255 : red;
            if (call.leverLight !== null) call.DP_EnvColor[0] = call.DP_PrimColor[0];
            if (call.leverHandle !== null) call.leverHandle.phase = r.enabled ? r.world.leverPhases.get(call.objectPlacementIndex!)! : call.leverHandle.initialPhase;
        }
        for (const b of this.bindings) {
            const o = r.world.objects.get(`object:${b.index}`)!, p = r.config.placements[b.index], call = b.call;
            call.objectPathMotion = r.enabled || this.revealed.has(call) ? null : b.body;
            call.objectPathShadowMotion = r.enabled ? null : b.shadow;
            call.objectRotation = r.enabled ? b.transform : null;
            call.visible = objectsEnabled && (this.revealed.has(call) ? r.enabled && o.material === 157
                : (!r.enabled || (o.material & 63) !== 40 || this.revealInvisible) && !(r.enabled && o.material === 157 && b.body));
            if (r.enabled) {
                const [x, y, z] = Array.from(o.fixedPosition, v => v / 65536);
                if (b.transform) Object.assign(b.transform.placement, { x, y, z });
                else if (call.modelMatrix !== null) {
                    const delta = vec3.fromValues(x - p.x, y - p.y, -(z - p.z));
                    mat4.fromTranslation(call.modelMatrix, delta); vec3.add(call.center, b.center, delta);
                }
            } else vec3.copy(call.center, b.center);
        }
    }
}
