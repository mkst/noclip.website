import { mat4, vec3 } from 'gl-matrix';
import * as RDP from '../Common/N64/RDP.js';
import type { LevelObjectPlacement } from './level.js';
import { computeObjectRotationMatrix } from './object_rotation.js';
import type { SSSVDrawCall } from './terrain.js';

export const COMBINE_FLOOR_BUTTON_GLOW = RDP.decodeCombineParams(0xFFFFFF, 0xFFFDF8FC);
export interface FloorButtonState {
    placement: LevelObjectPlacement;
    scale: number;
    collideHeight: number;
    initialState: number;
    state: number;
}
export interface FloorButtonPart {
    button: FloorButtonState;
    part: 'body' | 'cap' | 'glow';
}
export function computeFloorButtonMatrix(dst: mat4, button: FloorButtonState): void {
    const scale = button.state === 1 ? (button.scale * 3) >> 2 : button.scale;
    computeObjectRotationMatrix(dst, { placement: button.placement, rotation: { yPerTick: 0, zPerTick: 0 },
        scale: scale / 2048, originY: Math.floor(button.collideHeight * button.scale / 2048) / 2, localMatrix: null }, 0);
}

export class FloorButtonVisuals {
    public readonly calls: readonly SSSVDrawCall[];
    private readonly centers;
    constructor(calls: readonly SSSVDrawCall[]) {
        this.calls = calls.filter(c => c.floorButton !== null);
        this.centers = this.calls.map(c => vec3.clone(c.center));
    }
    public update(objectsEnabled: boolean, stateFor: (index: number) => number | null = () => null): void {
        for (const [i, call] of this.calls.entries()) {
            const { button, part } = call.floorButton!;
            button.state = stateFor(call.objectPlacementIndex!) ?? button.initialState;
            const active = button.state === 1;
            call.visible = objectsEnabled && (part !== 'glow' || active);
            if (part === 'cap') call.DP_PrimColor[0] = active ? 1 : 64 / 255;
            computeFloorButtonMatrix(call.modelMatrix!, button);
            vec3.transformMat4(call.center, this.centers[i], call.modelMatrix!);
        }
    }
}
