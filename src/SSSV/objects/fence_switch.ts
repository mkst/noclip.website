import { matchCommandRecords } from '../commands/command_admission.js';
import { CommandVM } from "../commands/command_vm.js";
import { CommandWorld } from "../commands/command_world.js";
import type { CommandEntityInit } from "../commands/command_world.js";
export { inCommandRegion as inSwitchRegion } from "../commands/command_world.js";
import type ArrayBufferSlice from "../../ArrayBufferSlice.js";
import type { LevelAnimalPlacement, LevelLink, LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";
import type { FenceSpan } from "./fences.js";
import { SceneTickClock } from "../core/timing.js";

const mainScript = [
    "00140001000000000000", "000f0000000000000000", "00140000000000000000", "000f0000000000000000",
    "0003040014000000ffff", "000f0001000000000000", "00140001000000000000", "000f0001000000000000",
    "0026004d50007fff0000", "00140000000000000000", "00480034000000000000", "0006001e000000000000",
    "0003040014000000ffff", "00140000000000000000", "000f0000000000000000", "00140001000000000000",
    "000f0000000000000000", "0026004d50007fff0000", "00140000000000000000", "0006001e000000000000",
    "00080003000000000000",
];
const sharedScript = [
    "003d0000000000004900", "0014000a000000000000", "00018600000000160007", "00019600200000210005",
    "00060001000000000000", "003d7fc8000100004910", "0014000b000000000000", "00080001000000000000",
    "00140000000000000000", "000111007fc80004000d", "003d7f9b000100001c60", "002600a26e007fff0000",
    "00440003000500000000", "0008000e000000000000", "00490000000000000000", "00140000000000000000",
    "0006001e000000000000", "0003040014000000ffff", "000f0000000000000000", "00140001000000000000",
    "000f0000000000000000", "0026004d50007fff0000", "00140000000000000000", "0006001e000000000000",
    "0003040014000000ffff", "000f0001000000000000", "00140001000000000000", "000f0001000000000000",
    "0026004d50007fff0000", "0008000e000000000000",
];

export interface FenceSwitchConfig {
    placementIndex: number;
    placement: LevelObjectPlacement;
    postIndex: number;
    fence: FenceSpan;
    scriptBase: number;
    sharedBase: number;
    commands: readonly LevelCommand[];
    region: readonly number[];
}

export function readFenceSwitch(placements: readonly LevelObjectPlacement[], commands: readonly LevelCommand[], links: readonly LevelLink[], ranges: ArrayBufferSlice | null, fences: readonly FenceSpan[]): FenceSwitchConfig | null {
    if (ranges === null || ranges.byteLength < 10) return null;
    const view = ranges.createDataView(), count = view.getUint16(0);
    if (count < 1 || ranges.byteLength < 2 + count * 8) return null;
    const region = Array.from({ length: 6 }, (_, i) => view.getUint8(2 + i));
    if (region[0] > region[3] || region[1] > region[4] || region[2] > 240) return null;
    const sharedBase = 52;
    if (!matchCommandRecords(commands, { base: sharedBase, records: sharedScript, source: 'raw' }).matched) return null;
    for (const [placementIndex, placement] of placements.entries()) {
        if (placement.id !== 24 || placement.commandReferenceIdx <= 0 || placement.commandsLength !== 0) continue;
        const scriptBase = placement.commandReferenceIdx - 1;
        if (!matchCommandRecords(commands, { base: scriptBase, records: mainScript, source: 'raw' }).matched) continue;
        let postIndex: number | undefined;
        for (const link of links) if (link.parent === placementIndex && link.referenceIdx === 0) postIndex = link.child;
        if (postIndex === undefined || placements[postIndex]?.id !== 28) continue;
        const fence = fences.find(f => f.sourceIndex === postIndex);
        if (fence === undefined) continue;
        return { placementIndex, placement, postIndex, fence, scriptBase, sharedBase, commands, region };
    }
    return null;
}

export class FenceSwitchRuntime {
    public enabled = false;
    private contact = false;
    private tick = 0;
    private readonly clock = new SceneTickClock('step');
    private readonly initialFenceEnabled: boolean;
    private readonly initialEntities: CommandEntityInit[];
    private readonly owner: string;
    private readonly post: string;
    private world!: CommandWorld;
    private program!: CommandVM;

    constructor(public readonly config: FenceSwitchConfig, placements: readonly LevelObjectPlacement[], animals: readonly LevelAnimalPlacement[]) {
        this.initialFenceEnabled = config.fence.enabled;
        this.owner = `object:${config.placementIndex}`; this.post = `object:${config.postIndex}`;
        this.initialEntities = [...placements.map((p, index) => ({ id: `object:${index}`, typeId: p.id,
            position: { x: p.x, y: p.y, z: p.z }, references: index === config.placementIndex ? new Map([[1, this.post]]) : undefined })),
            ...animals.map((p, index) => ({ id: `animal:${index}`, typeId: p.id + 256, position: { x: p.x, y: p.y, z: p.z } }))];
        this.reset();
    }

    public get vm(): CommandVM { return this.program; }
    public get state(): number { return this.world.getEntity(this.owner)!.state; }
    public get taskBits(): number { return this.world.taskBits; }
    public get sheepCount(): number { return this.world.globals[9]; }
    public get messagePending(): boolean { return this.enabled && this.world.message?.owner === this.owner; }
    public get error(): string | null { return this.program.diagnostic?.reason ?? null; }
    public get ready(): boolean {
        return this.enabled && !this.contact && this.program.status === "waiting" && this.program.location.opcode === 0x03;
    }

    public setEnabled(enabled: boolean): void { this.enabled = enabled; this.reset(); }
    public reset(): void {
        this.contact = false; this.tick = 0; this.clock.reset();
        this.world = new CommandWorld(this.initialEntities, "silent", { regions: new Map([[0, this.config.region]]), acknowledgedMessages: new Set([3]) });
        this.program = new CommandVM({ owner: this.owner, commands: this.config.commands, scriptBase: this.config.scriptBase,
            initialCursor: this.config.placement.commandsLength, maxInstructionsPerTick: 512, traceCapacity: 256 }, this.world);
        this.config.fence.enabled = this.enabled ? false : this.initialFenceEnabled;
        if (this.enabled) this.step();
        else {
            this.world.getEntity(this.owner)!.state = this.initialFenceEnabled ? 1 : 0;
            this.program.stop();
        }
    }
    public activate(): boolean {
        if (!this.ready) return false;
        this.contact = true; return true;
    }
    public acknowledgeMessage(): void { if (this.messagePending) this.world.acknowledgeMessage(this.owner); }

    public step(): void {
        if (!this.enabled) return;
        const entity = this.world.getEntity(this.owner)!;
        entity.contactFlags = this.contact ? 0x14 : 0;
        this.program.step(this.tick++);
        this.contact = false; entity.contactFlags = 0;
        if (this.program.status === "unsupported" || this.program.status === "faulted") {
            this.enabled = false; entity.state = 0; this.config.fence.enabled = false;
        } else this.config.fence.enabled = this.world.getEntity(this.post)!.state === 1;
    }

    public advanceTo(tick: number): void {
        tick = Math.max(0, Math.floor(tick));
        if (!this.enabled) { this.clock.reset(tick); return; }
        const advance = this.clock.advance(tick);
        if (advance.kind === 'discontinuity') { this.reset(); this.clock.reset(tick); return; }
        if (advance.kind === 'advance') for (let i = 0; i < advance.ticks; i++) this.step();
    }
}
