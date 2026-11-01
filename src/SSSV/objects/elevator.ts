import { matchCommandRecords } from '../commands/command_admission.js';
import { SceneTickClock } from "../core/timing.js";
import { CommandVM } from "../commands/command_vm.js";
import { CommandObjectWorld } from "../commands/command_objects.js";
import type { LevelMapEntry, LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";
import type { SSSVObjectData } from "./objects.js";

const elevatorScript = [
    "001074001cd240000000",
    "00140007000000000000",
    "003d0002000000001100",
    "00330001000000000000",
    "00361000000000000000",
    "00140000000000000000",
    "003d0000000000001100",
    "00140007000000000000",
    "00321001000800000000",
    "001c00000000faec0003",
    "00140000000000000000",
    "001c00000000faec0003",
    "00461c7f7f7f3f010055",
    "0003010000000016ffff",
    "0026004c52807fff0100",
    "000305007fc20016ffff",
    "00140007000000000000",
    "00321001000000000000",
    "00140000000000000000",
    "003d0000000000001100",
    "002600463f807fff0100",
    "0006005a000000000000",
    "00140007000000000000",
    "00321001fff800000000",
    "001c0000000005140003",
    "00140000000000000000",
    "001c0000000005140003",
    "00461c7f7f3f7f010055",
    "0003810000000016ffff",
    "0026004c52807fff0100",
    "000305007fc20016ffff",
    "00140007000000000000",
    "00321001000000000000",
    "00140000000000000000",
    "002600463f807fff0100",
    "0006005a000000000000",
    "00080006000000000000",
];

export interface ElevatorConfig {
    placement: LevelObjectPlacement;
    placementIndex: number;
    scriptBase: number;
    commands: readonly LevelCommand[];
    catalog: ReadonlyMap<number, SSSVObjectData>;
    map: readonly LevelMapEntry[];
}

export function readElevator(placements: readonly LevelObjectPlacement[], commands: readonly LevelCommand[], catalog: ReadonlyMap<number, SSSVObjectData>, map: readonly LevelMapEntry[]): ElevatorConfig | null {
    for (const type of [23, 116]) {
        const d = catalog.get(type);
        if (!d || d.renderMode !== 6 || d.displayLists.length !== 1 || d.shadowType !== 0 || d.orientationMode !== 4
            || d.updateCallback !== 0 || d.behaviorFlags === undefined || d.behaviorFlags & 12 || !(d.behaviorFlags & 64) || d.scaleOverride !== 0) return null;
    }
    if (catalog.get(116)!.collideHeight !== catalog.get(116)!.width * 2) return null;
    for (const [placementIndex, placement] of placements.entries()) {
        if (placement.id !== 23 || placement.commandsLength !== 0 || placement.commandReferenceIdx <= 0
            || placement.angle !== 0 || placement.zRotation !== 0 || placement.scale !== 4096) continue;
        const scriptBase = placement.commandReferenceIdx - 1;
        if (!matchCommandRecords(commands, { base: scriptBase, records: elevatorScript, source: 'raw' }).matched) continue;
        if (commandWaterHeight(map, placement.x, placement.z) === null) continue;
        return { placement: { ...placement }, placementIndex, scriptBase, commands, catalog, map };
    }
    return null;
}

// The collision-map loader doubles the byte in-place before GET_WATER_LEVEL
// takes the maximum of four corners. Keep this separate from render water.
export function commandWaterHeight(map: readonly LevelMapEntry[], x: number, z: number): number | null {
    const cx = Math.floor(x / 64) - 4, cz = Math.floor(z / 64) - 8;
    if (cx < 0 || cx >= 64 || cz < 0 || cz >= 96) return null;
    const corners = [map[cx * 97 + cz], map[(cx + 1) * 97 + cz], map[cx * 97 + cz + 1], map[(cx + 1) * 97 + cz + 1]];
    if (corners.some(c => !c)) return null;
    return Math.max(...corners.map(c => (c.unk6 * 2) & 255)) * 4;
}

export class ElevatorRuntime {
    public enabled = false;
    public motionEnabled = true;
    public world!: CommandObjectWorld;
    public vm!: CommandVM;
    public readonly owner: string;
    private localTick = 0;
    private readonly clock = new SceneTickClock();

    constructor(public readonly config: ElevatorConfig) {
        this.owner = `object:${config.placementIndex}`;
        this.reset();
    }
    public get error(): string | null { return this.vm.diagnostic?.reason ?? null; }
    public get tick(): number { return this.localTick - 1; }

    public setEnabled(enabled: boolean): void { this.enabled = enabled; this.reset(); }
    public reset(): void {
        this.world = new CommandObjectWorld(this.config.catalog, (x, z) => commandWaterHeight(this.config.map, x, z), 2);
        const result = this.world.createObject(this.owner, this.config.placement);
        if (!result.ok) throw new Error(result.reason);
        this.vm = new CommandVM({ owner: this.owner, commands: this.config.commands, scriptBase: this.config.scriptBase, traceCapacity: 128 }, this.world);
        this.localTick = 0; this.clock.reset();
        if (this.enabled) this.step();
    }
    public step(): void {
        if (!this.enabled) return;
        // collist2 inserts new objects at the head. Snapshotting prevents a spawn
        // from receiving an update during the tick that created it.
        const ids = [...this.world.objects.keys()].reverse();
        for (const id of ids) {
            this.world.integrate(id);
            if (id === this.owner) this.vm.step(this.localTick);
            if (this.vm.diagnostic !== null) { this.enabled = false; return; }
            this.world.advanceController(id);
        }
        this.localTick++;
    }
    public advanceTo(tick: number): void {
        const advance = this.clock.advance(tick);
        if (advance.kind === 'initial') return;
        if (!this.enabled) return;
        if (advance.kind === 'discontinuity') { this.reset(); this.clock.reset(tick); }
        else if (this.motionEnabled) for (let i = 0; i < advance.ticks; i++) this.step();
    }
}
