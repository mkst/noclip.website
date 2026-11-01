import { mat4, vec3 } from 'gl-matrix';
import { SnowPlatformRuntime } from './snow_platforms.js';
import { SSSVDrawCall, COMBINE_TEXTURED, FAN_TEXTURE_ID_BASE } from '../render/terrain.js';
import { createLiveObjectTransform, LeverVisuals, updateLiveObjectPose, WorldObjectTranslation } from './object_visuals.js';

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
        this.switchColors = new LeverVisuals(calls.filter(c => [4, 5, 27].includes(c.objectPlacementIndex!)));
        this.bindings = calls.flatMap(call => {
            const body = call.objectPathMotion, shadow = call.objectPathShadowMotion;
            const p = body?.placement ?? shadow?.placement;
            if (!p) return [];
            const index = runtime.config.indices.find(i => runtime.config.placements[i].commandReferenceIdx === p.commandReferenceIdx && p.id === 94);
            if (index === undefined) return [];
            const transform = body ? createLiveObjectTransform(p, body) : null;
            const translation = shadow ? new WorldObjectTranslation(call, runtime.config.placements[index], null) : null;
            return [{ index, call, body, shadow, transform, translation }];
        });
    }
    public update(objectsEnabled: boolean, tick = 0): void {
        const r = this.runtime;
        for (const { call, count } of this.fans) {
            const frame = r.world.fanSlots.get(call.fanAnimation!.slot)!.frame;
            call.commandTextureFrame = r.enabled ? call.animationTextureIndices!.indexOf(FAN_TEXTURE_ID_BASE + frame) : Math.floor(tick / 2) % count;
        }
        this.switchColors.update(index => r.enabled ? { state: r.world.getEntity(`object:${index}`)!.state, phase: r.world.leverPhases.get(index)! } : null);
        for (const b of this.bindings) {
            const o = r.world.objects.get(`object:${b.index}`)!, call = b.call;
            call.objectPathMotion = r.enabled || this.revealed.has(call) ? null : b.body;
            call.objectPathShadowMotion = r.enabled ? null : b.shadow;
            call.objectRotation = r.enabled ? b.transform : null;
            call.visible = objectsEnabled && (this.revealed.has(call) ? r.enabled && o.material === 157
                : (!r.enabled || (o.material & 63) !== 40 || this.revealInvisible) && !(r.enabled && o.material === 157 && b.body));
            if (r.enabled && b.transform) updateLiveObjectPose(b.transform, o);
            b.translation?.update(r.enabled ? o.fixedPosition : null);
        }
    }
}
