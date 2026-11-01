import { matchCommandRecords } from '../commands/command_admission.js';
import type { LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";
import { CommandVM } from "../commands/command_vm.js";
import { CommandWorld } from "../commands/command_world.js";
import type { CommandEntity } from "../commands/command_world.js";
import { stepLeverPhase } from "./lever_handle.js";

const rainScript = [
    "000f0000000000000000", "0003040008000000ffff", "000f0001000000000000", "00290004000000000000",
    "0046745aaf334100005b", "0006005a000000000000", "004674afaf41410000d3", "000600d2000000000000",
    "00140000000000000000", "000f0000000000000000", "004674ae00334100005a", "0006003c000000000000",
    "00290000000000000000", "00080000000000000000", "00090000000000000000",
];

export interface RainButtonConfig {
    placementIndex: number;
    placement: LevelObjectPlacement;
    scriptBase: number;
    commands: readonly LevelCommand[];
}

export function readRainButton(placements: readonly LevelObjectPlacement[], commands: readonly LevelCommand[]): RainButtonConfig | null {
    for (const [placementIndex, placement] of placements.entries()) {
        if (placement.id !== 45 || placement.commandsLength !== 0 || placement.commandReferenceIdx <= 0) continue;
        const scriptBase = placement.commandReferenceIdx - 1;
        if (matchCommandRecords(commands, { base: scriptBase, records: rainScript, source: 'raw' }).matched) return { placementIndex, placement, scriptBase, commands };
    }
    return null;
}

// Admission and click/visual policy stay local; command semantics live in the shared VM.
export class RainButtonRuntime {
    public enabled = false;
    public leverPhase = 0;
    public readonly vm: CommandVM;
    private readonly world: CommandWorld;
    private readonly entity: CommandEntity;
    private tick = 0;
    private contact = false;

    constructor(public readonly config: RainButtonConfig) {
        const owner = `object:${config.placementIndex}`;
        this.world = new CommandWorld([{ id: owner, typeId: config.placement.id, state: 0 }], "silent");
        this.entity = this.world.getEntity(owner)!;
        this.vm = new CommandVM({ owner, commands: config.commands, scriptBase: config.scriptBase,
            initialCursor: config.placement.commandsLength, maxInstructionsPerTick: 32, traceCapacity: 128 }, this.world);
        this.vm.stop();
    }

    public get state(): number { return this.entity.state; }
    public get rainCount(): number { return this.world.rainCount; }
    public get error(): string | null { return this.vm.diagnostic?.reason ?? null; }
    public get ready(): boolean {
        return this.enabled && !this.contact && this.vm.status === "waiting" && this.vm.location.opcode === 0x03;
    }

    public reset(): void {
        this.contact = false; this.tick = 0; this.leverPhase = 0;
        this.entity.state = this.world.rainCount = this.entity.contactFlags = this.entity.audioAge = 0;
        this.entity.audioConfiguration = null; this.entity.temporaries.fill(0);
        this.vm.reset();
        if (this.enabled) this.step();
        else this.vm.stop();
    }

    public setEnabled(enabled: boolean): void { this.enabled = enabled; this.reset(); }

    public activate(): boolean {
        if (!this.ready) return false;
        this.contact = true;
        return true;
    }

    public step(): void {
        if (!this.enabled) return;
        // The object callback precedes command processing; a click is one tick of contact.
        this.leverPhase = stepLeverPhase(this.leverPhase, this.state);
        this.entity.contactFlags = this.contact ? 8 : 0;
        this.vm.step(this.tick++);
        this.contact = false; this.entity.contactFlags = 0;
        if (this.vm.status === "unsupported" || this.vm.status === "faulted") {
            this.enabled = false;
            this.world.rainCount = 0;
        }
    }
}
