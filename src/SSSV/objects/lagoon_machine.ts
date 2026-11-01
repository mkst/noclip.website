import { getOrCreateEmitterConfiguration } from '../effects/particle_emitters.js';
import { matchCommandRecords } from '../commands/command_admission.js';
import { SceneTickClock } from '../core/timing.js';
import type ArrayBufferSlice from '../../ArrayBufferSlice.js';
import { CommandVM, CommandTickBudget, commandFailure, commandSuccess } from '../commands/command_vm.js';
import type { CommandResult } from '../commands/command_vm.js';
import { CommandObjectWorld } from '../commands/command_objects.js';
import { inCommandRegion } from '../commands/command_world.js';
import { stepLeverPhase } from './lever_handle.js';
import { applyEmitterCommand } from '../effects/emitter_commands.js';
import type { EmitterConfiguration } from '../effects/particle_emitters.js';
import type { LevelAnimalPlacement, LevelLink, LevelObjectPlacement } from '../core/level.js';
import type { LevelCommand } from '../commands/paths.js';
import type { SSSVObjectData } from './objects.js';

const records = [
    '000f0000000000000000',
    '00060023000000000000',
    '0003040008000000ffff',
    '003d7fbf000100004010',
    '000f0001000000000000',
    '000114007fbf00040009',
    '000600c8000000000000',
    '000114007fbf0004000d',
    '003d7fbf000100004020',
    '0008ffff000000000000',
    '00000000000000000000',
    '003d7f9b000200001c60',
    '002600a26e007fff0000',
    '00440006000200000000',
    '00090000000000000000',
    '000f0001000000000000',
    '000313007fbf0004ffff',
    '0006000f000000000000',
    '000f0000000000000000',
    '00260054528066660000',
    '00090000000000000000',
    '000f0001000000000000',
    '0006001e000000000000',
    '0003040008000000ffff',
    '003d7fc0000100004110',
    '000f0000000000000000',
    '00140001000000000000',
    '003d0001000000000200',
    '00140000000000000000',
    '00090000000000000000',
    '0006001e000000000000',
    '0006001e000000000000',
    '0006001e000000000000',
    '003d0006000000000000',
    '0015f6000f0000000000',
    '00161f3f030707000000',
    '001b0000000000307f7f',
    '0003050000000016ffff',
    '0001800010030000000a',
    '0026004620007fff0100',
    '001700f97b1414000014',
    '003d000c7f7f00000120',
    '00067f80000000000000',
    '000114007f7f0006000d',
    '001b00000000ffd07f7f',
    '0003050000000016ffff',
    '00018000100300000012',
    '001700f97b1414000014',
    '0026004620007fff0100',
    '003d000c7f7f00000120',
    '00067f80000000000000',
    '000113007f8100000005',
    '000e004a000000000000',
    '003d0006000000000000',
    '0015f6000f0000000000',
    '00161f3f030707000000',
    '001b0000000000307f7f',
    '0003050000000016ffff',
    '00018000100300000007',
    '0026004620007fff0100',
    '001700f97b1414000014',
    '003d000c7f7f00000120',
    '00067f80000000000000',
    '000114007f7f0006000b',
    '003d7f7f000200000020',
    '001b00000000ffd07f7f',
    '0003050000000016ffff',
    '00018000100300000010',
    '001700f97b1414000014',
    '0026004620007fff0100',
    '003d000c7f7f00000120',
    '00067f80000000000000',
    '000112007f7f00020015',
    '003d7f7f000200000020',
    '00080002000000000000',
    '001700f87b1414000014',
    '0026004639007fff0100',
    '00090000000000000000',
];
export const MACHINE_ARMS = [53, 54, 55, 56] as const;
export const MACHINE_PADS = [26, 27, 28, 29] as const;
export const MACHINE_LEVERS = [30, 31, 32, 33] as const;
const POSTS = [13, 14] as const;
const CONTROLS: readonly number[] = [...MACHINE_PADS, ...MACHINE_LEVERS];
export interface LagoonMachineConfig {
    placements: readonly LevelObjectPlacement[];
    commands: readonly LevelCommand[];
    table: ReadonlyMap<number, SSSVObjectData>;
    links: readonly LevelLink[];
    region: readonly number[];
    player: LevelAnimalPlacement;
}
export function readLagoonMachine(placements: readonly LevelObjectPlacement[], commands: readonly LevelCommand[], table: ReadonlyMap<number, SSSVObjectData>,
    links: readonly LevelLink[], ranges: ArrayBufferSlice | null, player: LevelAnimalPlacement | null): LagoonMachineConfig | null {
    if (!player || !ranges || ranges.byteLength < 34 || ranges.createDataView().getUint16(0) < 4) return null;
    const region = Array.from({ length: 6 }, (_, i) => ranges.createDataView().getUint8(26 + i));
    if (region.join(',') !== '20,26,0,33,39,16' || ranges.createDataView().getUint16(32) !== 0) return null;
    if (!matchCommandRecords(commands, { base: 21, records, source: 'decoded' }).matched) return null;
    for (const [index, cursor] of [[53, 0], [54, 3], [55, 2], [56, 1]]) {
        const p = placements[index];
        if (p?.id !== 49 || p.commandReferenceIdx !== 52 || p.commandsLength !== cursor || p.zRotation !== 0) return null;
    }
    for (const [indices, type, base] of [[MACHINE_PADS, 42, 21], [MACHINE_LEVERS, 45, 42], [POSTS, 28, 36]] as const)
        if (!indices.every(i => placements[i]?.id === type && placements[i].commandReferenceIdx === base + 1 && placements[i].commandsLength === 0)) return null;
    if (![[30, 55], [31, 54], [32, 53], [33, 56]].every(([parent, child]) => links.some(l => l.parent === parent && l.child === child && l.referenceIdx === 0))) return null;
    if (![[13, 5], [14, 16]].every(([parent, child]) => links.some(l => l.parent === parent && l.child === child && l.referenceIdx === 0))) return null;
    const arm = table.get(49), pad = table.get(42), lever = table.get(45);
    if (!arm || arm.renderMode !== 6 || arm.orientationMode !== 4 || arm.scaleOverride !== 0 || arm.updateCallback !== 0 || arm.behaviorFlags !== 3 || arm.shadowType !== 0) return null;
    if (pad?.renderMode !== 19 || pad.updateCallback !== 0x802F9B4C || lever?.renderMode !== 12 || lever.updateCallback !== 0x802F9880) return null;
    return { placements, commands, table, links, region, player };
}

export class LagoonMachineWorld extends CommandObjectWorld {
    public readonly programs = new Map<string, CommandVM>();
    public readonly leverPhases = new Map<number, number>(MACHINE_LEVERS.map(i => [i, 128]));
    public readonly smokeRequests = new Map<string, EmitterConfiguration>();
    public noticeCount = 0;
    constructor(public readonly config: LagoonMachineConfig) {
        super(config.table, () => null, 4, { secondaryList: true });
        for (const index of [...MACHINE_ARMS, ...CONTROLS, ...POSTS].sort((a, b) => a - b)) {
            const p = config.placements[index], id = `object:${index}`;
            if ((MACHINE_ARMS as readonly number[]).includes(index)) {
                const result = this.createObject(id, p); if (!result.ok) throw new Error(result.reason);
            } else this.addEntity({ id, typeId: p.id, position: { x: p.x, y: p.y, z: p.z } });
            this.programs.set(id, new CommandVM({ owner: id, commands: config.commands, scriptBase: p.commandReferenceIdx - 1, initialCursor: p.commandsLength, traceCapacity: 128 }, this));
        }
        for (const l of config.links) if (this.getEntity(`object:${l.parent}`)) {
            const id = `object:${l.child}`, p = config.placements[l.child];
            if (!this.getEntity(id)) this.addEntity({ id, typeId: p.id, position: { x: p.x, y: p.y, z: p.z } });
            this.getEntity(`object:${l.parent}`)!.references.set(l.referenceIdx + 1, id);
        }
        const p = config.player;
        this.addEntity({ id: 'player', typeId: p.id + 256, position: { x: p.x, y: p.y, z: p.z } });
        this.currentPlayer = 'player';
    }
    public override evaluateCondition(target: string | null, p: DataView): CommandResult<boolean> {
        if ((p.getUint8(0) & 0x3F) !== 0) return super.evaluateCondition(target, p);
        if (p.getUint8(2) !== 16 || p.getUint8(3) !== 3) return commandFailure('Unsupported machine-area predicate');
        const inside = inCommandRegion(this.getEntity('player')!.position!, this.config.region);
        return commandSuccess(p.getUint8(0) & 0x80 ? !inside : inside);
    }
    public override showMessage(owner: string, id: number, style: number): CommandResult<boolean> {
        if (id !== 6 || style !== 2) return commandFailure('Unsupported floor-pad notice');
        this.noticeCount++; return commandSuccess(true);
    }
    public executeEmitterCommand(target: string | null, opcode: number, p: DataView): CommandResult<void> {
        if (target === null || !this.objects.has(target)) return commandFailure('Machine emitter requires an admitted arm');
        const state = getOrCreateEmitterConfiguration(this.smokeRequests, target);
        if (opcode === 0x17) {
            if (![0xF8, 0xF9].includes(p.getUint16(0)) || p.getUint8(2) !== 123 || p.getUint16(6) !== 20) return commandFailure('Unsupported machine smoke request');
            state.flags = p.getUint16(0); state.particleId = 123; state.frequency = p.getInt8(3) - 20;
            state.size = p.getUint8(4); state.argument = p.getUint8(5); state.duration = p.getUint16(6);
            return commandSuccess(undefined);
        }
        return applyEmitterCommand(state, opcode, p);
    }
}

export class LagoonMachineRuntime {
    public enabled = false;
    public world!: LagoonMachineWorld;
    private tick = 0;
    private readonly clock = new SceneTickClock();
    constructor(public readonly config: LagoonMachineConfig) { this.reset(); }
    public reset(): void { this.world = new LagoonMachineWorld(this.config); this.tick = 0; this.clock.reset(); if (this.enabled) this.step(); }
    public setEnabled(enabled: boolean): void { this.enabled = enabled; this.reset(); }
    public ready(index: number): boolean {
        const vm = this.world.programs.get(`object:${index}`);
        return this.enabled && CONTROLS.includes(index) && vm?.status === 'waiting' && vm.location.opcode === 3 && vm.diagnostic === null
            && this.world.getEntity(`object:${index}`)!.contactFlags === 0;
    }
    public activate(index: number): boolean {
        if (!this.ready(index)) return false;
        this.world.getEntity(`object:${index}`)!.contactFlags = 8; return true;
    }
    public step(): void {
        if (!this.enabled) return;
        const budget = new CommandTickBudget(2048);
        for (const [id, vm] of [...this.world.programs].reverse()) {
            if (vm.diagnostic) continue;
            if (this.world.objects.has(id)) this.world.integrate(id);
            vm.step(this.tick, budget);
            if (!vm.diagnostic && this.world.objects.has(id)) this.world.advanceController(id);
        }
        for (const index of CONTROLS) this.world.getEntity(`object:${index}`)!.contactFlags = 0;
        for (const index of MACHINE_LEVERS) this.world.leverPhases.set(index, stepLeverPhase(this.world.leverPhases.get(index)!, this.world.getEntity(`object:${index}`)!.state));
        this.tick++;
    }
    public advanceTo(tick: number): void {
        const advance = this.clock.advance(tick);
        if (advance.kind === 'initial') return;
        if (!this.enabled) return;
        if (advance.kind === 'discontinuity') { this.reset(); this.clock.reset(tick); }
        else for (let n = 0; n < advance.ticks; n++) this.step();
    }
}
