import { CommandTickBudget, CommandVM } from "./command_vm.js";
import { CommandObjectWorld } from "./command_objects.js";
import type { LevelObjectPlacement } from "./level.js";
import type { LevelCommand } from "./paths.js";
import type { SSSVObjectData } from "./objects.js";
import type { SSSVDrawCall } from "./terrain.js";
import { readObjectRotation } from "./object_rotation.js";

export interface ObjectProgram {
    placementIndex: number;
    placement: LevelObjectPlacement;
    kind: "material" | "rotation" | "motion";
}
function matches(placement: LevelObjectPlacement, commands: readonly LevelCommand[], records: readonly string[]): boolean {
    if (placement.commandReferenceIdx <= 0 || placement.commandsLength !== 0) return false;
    return records.every((raw, i) => {
        const command = commands[placement.commandReferenceIdx - 1 + i];
        return command !== undefined && command.opcode === parseInt(raw.slice(0, 4), 16)
            && Array.from(command.payload.createTypedArray(Uint8Array), b => b.toString(16).padStart(2, '0')).join('') === raw.slice(4);
    });
}
function eyeScript(delay: number): string[] {
    const records = ['00570000000000000000'];
    if (delay) records.push(`0006${delay.toString(16).padStart(4, '0')}000000000000`);
    records.push('003d0000000000001100', '00140000000000000000');
    for (const [texture, duration] of [[28, 10], [30, 4], [31, 4], [29, 4], [31, 4], [30, 4]])
        records.push(`0033${texture.toString(16).padStart(4, '0')}000000000000`, `0006${duration.toString(16).padStart(4, '0')}000000000000`);
    records.push(delay ? '00080003000000000000' : '00080002000000000000');
    return records;
}
const eyes = [0, 14, 22].map(eyeScript);
const swampMotion = ['00570000000000000000', '001b0000000000140006', '0003050000000016ffff',
    '001b00000000ffec0006', '0003050000000016ffff', '00080000000000000000'];

// Only the previously rendered pilots enter this runtime. Recognising an opcode
// or a possible path use is not sufficient admission for arbitrary scene scripts.
export function readObjectPrograms(placements: readonly LevelObjectPlacement[], commands: readonly LevelCommand[], table: ReadonlyMap<number, SSSVObjectData>): ObjectProgram[] {
    const result: ObjectProgram[] = [];
    for (const [placementIndex, placement] of placements.entries()) {
        const d = table.get(placement.id);
        if (!d || d.behaviorFlags === undefined || d.scaleOverride !== 0) continue;
        let kind: ObjectProgram['kind'];
        if (placement.id === 88 && placement.unkC === 28 && d.renderMode === 6 && d.behaviorFlags === 0x42
            && d.updateCallback === 0 && eyes.some(records => matches(placement, commands, records))) kind = 'material';
        else if ([116, 141, 212, 91].includes(placement.id) && d.shadowType === 0 && [6, 15].includes(d.renderMode)
            && (d.behaviorFlags & 12) === 0 && (d.updateCallback === 0 || placement.id === 141 && d.updateCallback === 0x802FF540)
            && readObjectRotation(placement, commands) !== null) {
            const rotation = readObjectRotation(placement, commands)!;
            if (rotation.zPerTick !== 0 && d.orientationMode === 4 && d.collideHeight !== d.width * 2) continue;
            kind = 'rotation';
        } else if (placement.id === 27 && d.renderMode === 6 && d.shadowType === 0 && d.behaviorFlags === 0x9E
            && d.updateCallback === 0 && matches(placement, commands, swampMotion)) kind = 'motion';
        else continue;
        result.push({ placementIndex, placement: { ...placement }, kind });
    }
    return result;
}

interface ProgramEntry { config: ObjectProgram; vm: CommandVM; tick: number; calls: SSSVDrawCall[]; }
export class ObjectCommandRuntime {
    public world!: CommandObjectWorld;
    public entries: ProgramEntry[] = [];
    public motionEnabled = true;
    private lastTick: number | null = null;

    constructor(public readonly configs: readonly ObjectProgram[], private readonly commands: readonly LevelCommand[], private readonly table: ReadonlyMap<number, SSSVObjectData>, private readonly drawCalls: readonly SSSVDrawCall[]) {
        this.reset();
    }
    public reset(): void {
        this.world = new CommandObjectWorld(this.table, () => null, this.configs.length, {
            secondaryList: true, silentCallbacks: new Set([0x802FF540]), initialPhysicsTypes: new Set([27]), materials: new Map([[88, new Set([28, 29, 30, 31])]]),
        });
        this.entries = this.configs.map(config => {
            const owner = `object:${config.placementIndex}`, created = this.world.createObject(owner, config.placement);
            if (!created.ok) throw new Error(created.reason);
            const vm = new CommandVM({ owner, commands: this.commands, scriptBase: config.placement.commandReferenceIdx - 1,
                initialCursor: config.placement.commandsLength, traceCapacity: 64 }, this.world);
            const calls = this.drawCalls.filter(c => c.objectPlacementIndex === config.placementIndex && (config.kind === 'material'
                ? c.commandTextureFrame !== null || c.animationTextureIndices !== null : c.objectRotation !== null || c.objectMotion !== null));
            for (const call of calls) {
                if (config.kind === 'material') {
                    call.animationTextureIndices = [28, 29, 30, 31];
                    call.animationFrameRate = 0; call.animationLoopStartFrame = 0; call.commandTextureFrame = 0;
                } else {
                    const transform = call.objectRotation ?? call.objectMotion!;
                    call.objectRotation = { placement: { ...config.placement }, scale: transform.scale, originY: transform.originY,
                        localMatrix: transform.localMatrix, rotation: { zPerTick: 0, yPerTick: 0 } };
                    call.objectMotion = null;
                }
            }
            return { config, vm, calls, tick: 0 };
        });
        this.lastTick = null;
        // Preserve the authored startup pose while the initial setup clears physics
        // flags. This retains the existing Swamp pilot's no-physics preview policy.
        for (const entry of [...this.entries].reverse()) this.step(entry, false, new CommandTickBudget(128));
        this.updateVisuals();
    }
    private step(entry: ProgramEntry, integrate: boolean, budget: CommandTickBudget): void {
        if (entry.vm.diagnostic !== null) return;
        const id = `object:${entry.config.placementIndex}`;
        if (integrate) this.world.integrate(id);
        entry.vm.step(entry.tick++, budget);
        if (entry.vm.diagnostic === null) this.world.advanceController(id);
    }
    public advanceTo(tick: number): void {
        if (this.lastTick === null) { this.lastTick = tick; return; }
        const delta = tick - this.lastTick;
        if (delta < 0 || delta > 900) this.reset();
        else for (let n = 0; n < delta; n++) {
            const budget = new CommandTickBudget(4096);
            for (const entry of [...this.entries].reverse())
                if (entry.config.kind !== 'motion' || this.motionEnabled) this.step(entry, true, budget);
        }
        this.lastTick = tick;
        this.updateVisuals();
    }
    private updateVisuals(): void {
        for (const entry of this.entries) {
            const object = this.world.objects.get(`object:${entry.config.placementIndex}`)!;
            for (const call of entry.calls) {
                if (entry.config.kind === 'material') call.commandTextureFrame = [28, 29, 30, 31].indexOf(object.material);
                else if (call.objectRotation !== null) {
                    const p = call.objectRotation.placement;
                    [p.x, p.y, p.z] = Array.from(object.fixedPosition, v => v / 65536);
                    p.angle = object.angle; p.zRotation = object.zRotation;
                }
            }
        }
    }
}
