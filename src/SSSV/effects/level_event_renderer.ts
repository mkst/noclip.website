import { mat4, vec3, vec4 } from "gl-matrix";
import { RSP_Geometry } from "../../BanjoKazooie/f3dex.js";
import type { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import * as RDP from "../../Common/N64/RDP.js";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { assertExists } from "../../util.js";
import { mirrorZ } from "../core/level.js";
import type { LevelDat, LevelObjectPlacement } from "../core/level.js";
import { buildObjects } from "../objects/objects.js";
import type { SSSVObjectData } from "../objects/objects.js";
import { computeObjectRotationMatrix } from "../objects/object_rotation.js";
import { RENDER_TRANSLUCENT, SSSVDrawCall, SSSVLayer } from "../render/terrain.js";
import { BoulderEventSimulation } from "./level_events.js";

export class BoulderEventVisuals {
    public objectsEnabled = true;
    public readonly drawCalls: SSSVDrawCall[];

    constructor(public readonly simulation: BoulderEventSimulation, private rocks: SSSVDrawCall[][], private flashes: SSSVDrawCall[][]) {
        this.drawCalls = [...rocks.flat(), ...flashes.flat()];
        this.hide();
    }

    public setEnabled(enabled: boolean): void {
        this.simulation.setEnabled(enabled);
        this.hide();
    }

    public hide(): void {
        for (const draw of this.drawCalls) draw.visible = false;
    }

    public update(tick: number, cameraX: number, cameraZ: number): void {
        this.simulation.advanceTo(tick, cameraX, cameraZ);
        this.hide();
        if (!this.simulation.enabled || !this.objectsEnabled) return;
        for (const rock of this.simulation.boulders) {
            const scale = rock.scale / 2048;
            const placement: LevelObjectPlacement = { id: 2, x: rock.x / 65536, z: rock.z / 65536, y: rock.y / 65536,
                angle: rock.heading, zRotation: rock.rotation ?? rock.pitch ?? 0, scale: rock.scale, unkC: 20, commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 };
            for (const draw of this.rocks[rock.slot]) {
                computeObjectRotationMatrix(assertExists(draw.modelMatrix), { placement, rotation: { zPerTick: rock.rotation !== undefined || this.simulation.config.kind === "jungle" ? 0 : 20, yPerTick: 0 }, scale,
                    originY: Math.floor(this.simulation.bodyHeight * scale) / 2, localMatrix: null }, rock.age);
                vec3.set(draw.center, placement.x, placement.y + this.simulation.bodyHeight * scale / 2, mirrorZ(placement.z));
                draw.visible = true;
            }
        }
        this.simulation.impacts.forEach((impact, i) => {
            const scale = (impact.size ?? 200) * impact.age / 1600;
            for (const draw of this.flashes[i]) {
                const placement: LevelObjectPlacement = { id: 2, x: impact.x, z: impact.z, y: impact.y, angle: 0, zRotation: 0,
                    scale: 2048, unkC: 0, commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 };
                computeObjectRotationMatrix(assertExists(draw.modelMatrix), { placement, rotation: { zPerTick: 0, yPerTick: 0 },
                    scale, originY: 0, localMatrix: null }, 0);
                vec3.set(draw.center, impact.x, impact.y, mirrorZ(impact.z));
                vec4.set(draw.DP_PrimColor, 1, Math.min(255, 256 - impact.age * 16) / 255, 0, (128 - impact.age * 8) / 255);
                draw.visible = true;
            }
        });
    }
}

export function buildBoulderEventVisuals(shared: RSPSharedOutput, table: Map<number, SSSVObjectData>, segments: (ArrayBufferSlice | undefined)[], dat: LevelDat, simulation: BoulderEventSimulation): BoulderEventVisuals {
    const boulder = assertExists(table.get(2));
    const placement: LevelObjectPlacement = { id: 2, x: 0, z: 0, y: 0, angle: 0, zRotation: 0, scale: 2048,
        unkC: 20, commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 };
    const rock = buildObjects(shared, [placement], new Map([[2, { ...boulder, shadowType: 0 }]]), segments, dat, [], null, true);
    const flash = buildObjects(shared, [placement], new Map([[2, { ...boulder, displayLists: [0x0101B000], collideHeight: 0, shadowType: 0 }]]), segments, dat, [], null, true);
    for (const draw of flash) {
        draw.SP_GeometryMode = RSP_Geometry.G_ZBUFFER;
        draw.SP_TextureState.set(false, 0, 0, 0, 0);
        draw.textureIndices = [];
        draw.translucent = true;
        draw.DP_OtherModeL = RENDER_TRANSLUCENT;
        draw.DP_Combine = {
            c0: { a: RDP.CCMUX.ADD_ZERO, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.MUL_ZERO, d: RDP.CCMUX.PRIMITIVE },
            a0: { a: RDP.ACMUX.ZERO, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.ZERO, d: RDP.ACMUX.PRIMITIVE },
            c1: { a: RDP.CCMUX.ADD_ZERO, b: RDP.CCMUX.ADD_ZERO, c: RDP.CCMUX.MUL_ZERO, d: RDP.CCMUX.PRIMITIVE },
            a1: { a: RDP.ACMUX.ZERO, b: RDP.ACMUX.ZERO, c: RDP.ACMUX.ZERO, d: RDP.ACMUX.PRIMITIVE },
        };
    }
    const instances = (prototype: SSSVDrawCall[], count: number) => Array.from({ length: count }, () => prototype.map(draw =>
        Object.assign(new SSSVDrawCall(), draw, { layer: SSSVLayer.ScriptedEvents, modelMatrix: mat4.create(), center: vec3.create(), DP_PrimColor: vec4.clone(draw.DP_PrimColor) })));
    return new BoulderEventVisuals(simulation, instances(rock, 20), instances(flash, 10));
}
