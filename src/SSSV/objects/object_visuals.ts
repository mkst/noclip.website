import { mat4, vec3 } from 'gl-matrix';
import type { ReadonlyMat4 } from 'gl-matrix';
import type { CommandObject } from '../commands/command_objects.js';
import type { LevelObjectPlacement } from '../core/level.js';
import type { SSSVDrawCall } from '../render/terrain.js';
import type { ObjectRotationTransform } from './object_rotation.js';
import { computeObjectMotionMatrix } from './object_motion.js';

export interface LeverVisualState { state: number; phase: number; }

export class LeverVisuals {
    private readonly bindings;
    constructor(calls: readonly SSSVDrawCall[]) {
        this.bindings = calls.filter(c => c.objectStateColor && c.objectPlacementIndex !== null).map(call => ({
            call, red: call.DP_PrimColor[0], environmentRed: call.DP_EnvColor[0],
        }));
    }

    public update(stateFor: (index: number) => LeverVisualState | null): void {
        for (const { call, red, environmentRed } of this.bindings) {
            const live = stateFor(call.objectPlacementIndex!);
            call.DP_PrimColor[0] = live === null ? red : live.state === 1 ? 1 : 64 / 255;
            if (call.leverLight !== null) call.DP_EnvColor[0] = live === null ? environmentRed : call.DP_PrimColor[0];
            if (call.leverHandle !== null) call.leverHandle.phase = live === null ? call.leverHandle.initialPhase : live.phase;
        }
    }
}

export function createLiveObjectTransform(placement: LevelObjectPlacement,
    template: Pick<ObjectRotationTransform, 'scale' | 'originY' | 'localMatrix'>): ObjectRotationTransform {
    return { placement: { ...placement }, scale: template.scale, originY: template.originY,
        localMatrix: template.localMatrix, rotation: { yPerTick: 0, zPerTick: 0 } };
}

export function updateLiveObjectPose(transform: ObjectRotationTransform, object: Pick<CommandObject, 'fixedPosition' | 'angle' | 'zRotation'>): void {
    const p = transform.placement;
    p.x = object.fixedPosition[0] / 65536; p.y = object.fixedPosition[1] / 65536; p.z = object.fixedPosition[2] / 65536;
    p.angle = object.angle; p.zRotation = object.zRotation;
}

// Geometry and centre are already in viewer world space. A path-preview matrix
// must be restored on disable, but must not be composed as a static part matrix.
export class WorldObjectTranslation {
    private readonly center: vec3;
    private readonly previewMatrix: mat4 | null;
    private readonly partMatrix: mat4 | null;
    private readonly liveMatrix = mat4.create();
    private readonly delta = vec3.create();

    constructor(private readonly call: SSSVDrawCall, private readonly placement: Pick<LevelObjectPlacement, 'x' | 'y' | 'z'>,
        partMatrix: ReadonlyMat4 | null = call.modelMatrix) {
        this.center = vec3.clone(call.center);
        this.previewMatrix = call.modelMatrix;
        this.partMatrix = partMatrix === null ? null : mat4.clone(partMatrix);
    }

    public update(fixedPosition: Readonly<Int32Array> | null): void {
        if (fixedPosition === null) {
            this.call.modelMatrix = this.previewMatrix;
            vec3.copy(this.call.center, this.center);
            return;
        }
        vec3.set(this.delta, fixedPosition[0] / 65536 - this.placement.x, fixedPosition[1] / 65536 - this.placement.y,
            -(fixedPosition[2] / 65536 - this.placement.z));
        mat4.fromTranslation(this.liveMatrix, this.delta);
        if (this.partMatrix !== null) mat4.mul(this.liveMatrix, this.liveMatrix, this.partMatrix);
        this.call.modelMatrix = this.liveMatrix;
        vec3.add(this.call.center, this.center, this.delta);
    }
}

// Owns translation for an admitted object; the renderer only consumes the selected matrix/centre.
export class ObjectTranslationBinding {
    private readonly preview;
    private readonly localCenter: vec3 | null;
    private readonly translation: WorldObjectTranslation;

    constructor(private readonly call: SSSVDrawCall, placement: LevelObjectPlacement) {
        this.preview = call.objectMotion;
        this.localCenter = this.preview !== null ? vec3.clone(call.center) : null;
        if (this.localCenter !== null) vec3.transformMat4(call.center, this.localCenter, call.modelMatrix!);
        call.objectMotion = null;
        this.translation = new WorldObjectTranslation(call, placement);
    }

    public update(position: Readonly<Int32Array> | null, tick: number): void {
        this.translation.update(position);
        if (position === null && this.preview !== null) {
            computeObjectMotionMatrix(this.call.modelMatrix!, this.preview, tick);
            vec3.transformMat4(this.call.center, this.localCenter!, this.call.modelMatrix!);
        }
    }
}
