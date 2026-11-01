import { matchCommandRecords } from '../commands/command_admission.js';
import { CommandVM, CommandTickBudget, commandSuccess, commandFailure } from '../commands/command_vm.js';
import type { CommandResult } from '../commands/command_vm.js';
import { CommandWorld } from '../commands/command_world.js';
import type { LevelCommand } from '../commands/paths.js';
import type { LevelObjectPlacement } from '../core/level.js';
import type { SSSVObjectData } from '../objects/objects.js';
import { applyEmitterCommand, createEmitterConfiguration } from './particle_emitters.js';
import { SceneTickClock } from '../core/timing.js';

const course = [[22,142,0],[25,150,1],[26,159,2],[27,168,3],[28,177,4],[30,186,5],
    [29,195,6],[31,204,7],[32,213,8],[33,222,9],[34,231,10],[24,240,11]] as const;
const courseBody = ['006400ffff0000ff0000', '00180001911e14000000', '0003040010000000ffff',
    '0026004e3f807fff0100', '003d7fc6000100284710', '003d7fc8000100284910', '00130000000000000000', '00090000000000000000'];
const gateScript = [
    '0064ffff00ff00000000','001500000a0000000000','00180001911e14000000','003d000000237f8b1200',
    '00570000000000000000','003d0000003c00081100','00000000000000000000','00020400100000000018',
    '00020400040000000054','0064e7be000000000000','00163f000a1cff0a0000','001500000a0000000000',
    '0033000b000000000000','00060002000000000000','0033000a000000000000','00060002000000000000',
    '00330009000000000000','00060002000000000000','00330008000000000000','00060002000000000000','0008000b000000000000',
];

export interface BonusRingSite { index: number; base: number; ordinal: number | null; placement: LevelObjectPlacement; height: number; scale: number; }
export interface BonusRingConfig { sites: BonusRingSite[]; commands: readonly LevelCommand[]; }

export function readBonusRings(placements: readonly LevelObjectPlacement[], table: ReadonlyMap<number, SSSVObjectData>, commands: readonly LevelCommand[]): BonusRingConfig | null {
    const sites: BonusRingSite[] = [];
    for (const [index, base, ordinal] of [...course, ...[48,49,50,51].map(i => [i,405,null] as const)]) {
        const p = placements[index], entry = p && table.get(p.id);
        if (!p || !entry || p.id !== (ordinal === null ? 166 : 9) || p.commandReferenceIdx !== base + 1 || p.commandsLength !== 0
            || entry.renderMode !== (ordinal === null ? 18 : 0)) return null;
        const records = ordinal === null ? gateScript : ordinal === 0 ? courseBody
            : [`000313007fc8${ordinal.toString(16).padStart(4,'0')}ffff`, ...courseBody];
        if (!matchCommandRecords(commands, { base, records, source: 'decoded' }).matched) return null;
        const scale = entry.scaleOverride || p.scale || 2048;
        sites.push({ index, base, ordinal, placement: { ...p }, scale, height: Math.floor(entry.collideHeight * scale / 2048) });
    }
    return { sites, commands };
}

export interface BonusHoop { birth: number; removed: number | null; primary: number; environment: number; }
export interface BonusRingState { site: BonusRingSite; emitter: ReturnType<typeof createEmitterConfiguration>; hoop: BonusHoop | null; material: number; }

export class BonusRingWorld extends CommandWorld {
    public readonly states = new Map<string, BonusRingState>();
    public readonly programs: CommandVM[] = [];
    public tick = 0;
    constructor(public readonly config: BonusRingConfig) {
        super(config.sites.map(s => ({ id: `object:${s.index}`, typeId: s.placement.id,
            position: { x: s.placement.x, y: s.placement.y, z: s.placement.z } })), 'silent');
        for (const site of config.sites) {
            const id = `object:${site.index}`;
            this.states.set(id, { site, emitter: createEmitterConfiguration(), hoop: null, material: site.placement.unkC });
            this.programs.push(new CommandVM({ owner: id, scriptBase: site.base, commands: config.commands, traceCapacity: 32 }, this));
        }
    }
    public executeEmitterCommand(target: string | null, opcode: number, p: DataView): CommandResult<void> {
        const state = target === null ? undefined : this.states.get(target);
        return state ? applyEmitterCommand(state.emitter, opcode, p) : commandFailure('Missing hoop emitter');
    }
    public executeEffectCommand(target: string | null, opcode: number, p: DataView): CommandResult<void> {
        const state = target === null ? undefined : this.states.get(target);
        if (!state) return commandFailure('Missing hoop owner');
        if (opcode === 0x18 && p.getUint16(0) === 1 && p.getUint8(2) === 0x91 && p.getUint8(4) === 20) {
            state.hoop = { birth: this.tick, removed: null, primary: state.emitter.primaryColor, environment: state.emitter.environmentColor };
        } else if (opcode === 0x13 && state.site.ordinal !== null) {
            if (state.hoop) state.hoop.removed = this.tick;
            this.deleteEntity(target!);
        } else return commandFailure('Unsupported hoop effect');
        return commandSuccess(undefined);
    }
    public executeObjectCommand(owner: string, target: string | null, opcode: number, p: DataView): CommandResult<void> {
        const state = target === null ? undefined : this.states.get(target);
        if (!state || target !== owner || state.site.ordinal !== null) return commandFailure('Unsupported gate target');
        if (opcode === 0x33 && p.getUint16(0) >= 8 && p.getUint16(0) <= 11) state.material = p.getUint16(0);
        else if (opcode !== 0x57 || p.getUint32(0) !== 0 || p.getUint32(4) !== 0) return commandFailure('Unsupported gate command');
        return commandSuccess(undefined);
    }
    public override writeVariable(target: string | null, field: number, value: number): CommandResult<void> {
        const state = target === null ? undefined : this.states.get(target);
        // These admitted writes set mass and collision flags; stationary visual gates do not simulate physics.
        if (state?.site.ordinal === null && (field === 18 && value === 0 || field === 17 && value === 0)) return commandSuccess(undefined);
        return super.writeVariable(target, field, value);
    }
    public override evaluateCondition(target: string | null, p: DataView): CommandResult<boolean> {
        // The extra gates retain their visual loop; gameplay contact branches are outside this preview.
        if (target !== null && this.states.get(target)?.site.ordinal === null && (p.getUint8(0) & 0x3F) === 4)
            return commandSuccess(false);
        return super.evaluateCondition(target, p);
    }
    public step(): void {
        const budget = new CommandTickBudget(2048);
        for (let i = this.programs.length - 1; i >= 0; i--)
            if (this.getEntity(`object:${this.config.sites[i].index}`)) this.programs[i].step(this.tick, budget);
        this.tick++;
    }
}

export class BonusRingRuntime {
    public world!: BonusRingWorld;
    public enabled = true;
    private readonly clock = new SceneTickClock();
    constructor(public readonly config: BonusRingConfig) { this.reset(); }
    public reset(): void { this.world = new BonusRingWorld(this.config); this.world.step(); this.clock.reset(); }
    public setEnabled(enabled: boolean): void { this.enabled = enabled; this.reset(); }
    public get current(): BonusRingState | null {
        return [...this.world.states.values()].find(s => s.site.ordinal !== null && s.hoop !== null && s.hoop.removed === null) ?? null;
    }
    public passCurrent(): void {
        if (!this.enabled || !this.current) return;
        this.world.getEntity(`object:${this.current.site.index}`)!.contactFlags = 16;
        // Advance the contact and following activation tick so paused preview controls remain usable.
        this.world.step();
        this.world.step();
        for (const state of this.world.states.values()) {
            const entity = this.world.getEntity(`object:${state.site.index}`);
            if (entity) entity.contactFlags = 0;
        }
    }
    public advanceTo(tick: number): void {
        const advance = this.clock.advance(tick);
        if (advance.kind === 'initial' || !this.enabled) return;
        if (advance.kind === 'discontinuity') { this.reset(); this.clock.reset(tick); }
        else for (let i=0;i<advance.ticks;i++) this.world.step();
    }
}
