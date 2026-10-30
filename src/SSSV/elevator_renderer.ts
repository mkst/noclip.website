import { vec3 } from "gl-matrix";
import type ArrayBufferSlice from "../ArrayBufferSlice.js";
import type { RSPSharedOutput } from "../BanjoKazooie/f3dex.js";
import { ElevatorRuntime } from "./elevator.js";
import type { ElevatorConfig } from "./elevator.js";
import type { LevelDat } from "./level.js";
import { buildObjects } from "./objects.js";
import { computeObjectRotationMatrix } from "./object_rotation.js";
import type { SSSVDrawCall } from "./terrain.js";

export function buildElevatorVisuals(output: RSPSharedOutput, config: ElevatorConfig, segments: (ArrayBufferSlice | undefined)[], dat: LevelDat, originals: readonly SSSVDrawCall[]): ElevatorVisuals {
    const runtime = new ElevatorRuntime(config);
    runtime.setEnabled(true);
    const parts = [...runtime.world.objects.values()].map(object => {
        const position = runtime.world.getEntity(object.id)!.position!;
        const placement = { ...config.placement, id: object.typeId, ...position, scale: object.scale, unkC: object.material, angle: object.angle,
            zRotation: object.zRotation, commandReferenceIdx: 0, commandsLength: 0 };
        const calls = buildObjects(output, [placement], new Map(config.catalog), segments, dat, [], null, true);
        for (const call of calls) call.objectPlacementIndex = null;
        return { id: object.id, calls, centers: calls.map(c => vec3.clone(c.center)) };
    });
    runtime.setEnabled(false);
    return new ElevatorVisuals(runtime, parts, originals.filter(c => c.objectPlacementIndex === config.placementIndex));
}

export class ElevatorVisuals {
    public readonly drawCalls: SSSVDrawCall[];
    constructor(public readonly runtime: ElevatorRuntime,
        private readonly parts: { id: string; calls: SSSVDrawCall[]; centers: vec3[] }[], private readonly originals: readonly SSSVDrawCall[]) {
        this.drawCalls = parts.flatMap(p => p.calls);
        this.update(true);
    }
    public update(objectsEnabled: boolean): void {
        const enabled = this.runtime.enabled;
        for (const call of this.originals) call.visible = objectsEnabled && !enabled;
        for (const part of this.parts) {
            const object = this.runtime.world.objects.get(part.id);
            for (const [i, call] of part.calls.entries()) {
                call.visible = objectsEnabled && enabled && object !== undefined;
                if (!object || call.modelMatrix === null) continue;
                const [x, y, z] = Array.from(object.fixedPosition, v => v / 65536);
                const definition = this.runtime.config.catalog.get(object.typeId)!;
                computeObjectRotationMatrix(call.modelMatrix, { placement: { ...this.runtime.config.placement, x, y, z, angle: object.angle, zRotation: object.zRotation },
                    rotation: { yPerTick: 0, zPerTick: 0 }, scale: object.scale / 2048,
                    originY: ((definition.collideHeight * object.scale) >> 11) / 2, localMatrix: null }, 0);
                vec3.transformMat4(call.center, part.centers[i], call.modelMatrix);
            }
        }
    }
}
