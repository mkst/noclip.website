import { CommandVM, CommandTickBudget, commandFailure, commandSuccess } from './command_vm.js';
import type { CommandResult } from './command_vm.js';
import { CommandObjectWorld } from './command_objects.js';
import { stepLeverPhase } from './lever_handle.js';
import { sampleCommandPath } from './command_path.js';
import { applyEmitterCommand } from './emitter_commands.js';
import type { EmitterConfiguration } from './particle_emitters.js';
import type { LevelLink, LevelObjectPlacement, LevelPath } from './level.js';
import type { LevelCommand } from './paths.js';
import type { SSSVObjectData } from './objects.js';

const scripts = [
    { base: 15, records: [
        '000f0000000000000000',
        '0003040010000000ffff',
        '000f0001000000000000',
        '002a0001000000000000',
        '004623ffff5f7f01ffff',
        '003d0001000000004000',
        '004c0001000100000000',
        '003d7f9b000100001c60',
        '002600a26e007fff0000',
        '00440005000500000000',
        '0006001e000000000000',
        '00090000000000000000',
    ] },
    { base: 76, records: [
        '00140000000000000000',
        '000f0000000000000000',
        '0003040010000000ffff',
        '000f0001000000000000',
        '003d0001000000004100',
        '00140001000000000000',
        '00060014000000000000',
        '0033009d000000000000',
        '00140000000000000000',
        '0006001e000000000000',
        '0003040010000000ffff',
        '000f0000000000000000',
        '003d0000000000004100',
        '00140001000000000000',
        '00060014000000000000',
        '00330028000000000000',
        '0006001e000000000000',
        '0008ffff000000000000',
    ] },
    { base: 254, records: [
        '004c0002000000000000',
        '000f0000000000000000',
        '0003040008000000ffff',
        '000f0001000000000000',
        '003d7fc3000100004410',
        '00140002000000000000',
        '004671a0a0666601ffff',
        '00140000000000000000',
        '004c0002000100000000',
        '003d7f9b000200001c60',
        '002600a26e007fff0000',
        '00461c64820c66010122',
        '00440006000400000000',
        '00140001000000000000',
        '003d0010000000001e00',
        '00040096000000000000',
        '00060001000000000000',
        '003d7f9d000200001e10',
        '00050000000000000000',
        '00140000000000000000',
        '00461c8282666601ffff',
        '00440001000200000000',
        '00060007000000000000',
        '0003040010000000ffff',
        '000f0000000000000000',
        '003d7fc3000100004420',
        '00461cb400666601001e',
        '00140002000000000000',
        '00461c00006666010000',
        '00140000000000000000',
        '00060005000000000000',
        '004c0002000000000000',
        '003d0010000100001e00',
        '0006001e000000000000',
        '0003040008000000ffff',
        '000f0001000000000000',
        '003d7fc3000100004410',
        '00140002000000000000',
        '004671a0a0666601ffff',
        '00140000000000000000',
        '004c0002000100000000',
        '00461c64820c66010122',
        '00140001000000000000',
        '003d0010000000001e00',
        '00040096000000000000',
        '00060001000000000000',
        '003d7f9d000200001e10',
        '00050000000000000000',
        '00140000000000000000',
        '00060082000000000000',
        '00461c8282666601ffff',
        '00060007000000000000',
        '00080016000000000000',
    ] },
    { base: 27, records: [
        '004800cd000000000000',
        '00080008000000000000',
        '000313007fbf0001ffff',
        '001b0000000001360002',
        '000305007fbf0016ffff',
        '00340000000200010001',
        '00020b0010000000000b',
        '000213007fbf00000008',
        '00070000000000000000',
        '001b00000000feca0014',
        '000305007fbf0016ffff',
        '00080001000000000000',
        '00000000000000000000',
        '001b00000000ffd80014',
        '000305007f7f001fffff',
        '001c0000000000280014',
        '000305007f7f001fffff',
        '00340000000200010001',
        '00028b00100000000005',
        '000213007fbf00000008',
        '00070000000000000000',
    ] },
    { base: 48, records: [
        '004800cd000000000000',
        '00080008000000000000',
        '000313007fbf0001ffff',
        '001b0000000001360002',
        '000305007fbf0016ffff',
        '003400010003ffff0001',
        '00020b0010000000000b',
        '000213007fbf00000008',
        '00070000000000000000',
        '001b00000000feca0014',
        '000305007fbf0016ffff',
        '00080001000000000000',
        '00000000000000000000',
        '001b00000000ffd80014',
        '000305007f7f001fffff',
        '001c0000000000280014',
        '000305007f7f001fffff',
        '003400010003ffff0001',
        '00028b00100000000005',
        '000213007fbf00000008',
        '00070000000000000000',
    ] },
    { base: 188, records: [
        '00150000003232000000',
        '00163f00140000000000',
        '001700e90a1514100000',
        '00140001000000000000',
        '003d7f85000101805300',
        '003d7f86000101805400',
        '00140000000000000000',
        '003d7fd2000101800600',
        '003d7fd3000101800700',
        '003d0028000101800800',
        '00060001000000000000',
        '000113007fca00010002',
        '00000000000000000000',
        '001700e8231500000000',
        '000313007fca0001ffff',
        '0008ffff000000000000',
        '00090000000000000000',
        '00104000000000000000',
        '00140007000000000000',
        '00560007000100000000',
        '000e00bc000000000000',
        '00140000000000000000',
        '00490000000000000000',
    ] },
    { base: 362, records: [
        '0010a800000000000000',
        '00560007000100000000',
        '00140007000000000000',
        '00360c00000000000000',
        '000e017d000000000000',
        '00140000000000000000',
        '00000000000000000000',
        '00030b0010000000ffff',
        '0006001e000000000000',
        '00018b00100000000006',
        '001d0009000500010101',
        '00000000000000000000',
        '00038b0010000000ffff',
        '0006001e000000000000',
        '00010b0010000000000b',
        '003400090005ffff0101',
        '000305007fd70016ffff',
        '00080005000000000000',
        '00000000000000000000',
        '003d00ff000000000000',
        '003d0078000000000100',
        '003d0000000000000200',
        '00060001000000000000',
        '00140001000000000000',
        '003d7f85000000005500',
        '003d7f86000000005600',
        '003d7f87000000005700',
        '003d7f93000000005800',
        '00140000000000000000',
        '003d7fd4000000000600',
        '003d7fd5000000000700',
        '003d7fd6000000000800',
        '000113007fd70028000f',
        '000f0001000000000000',
        '00080002000000000000',
        '000f0000000000000000',
        '00080002000000000000',
    ] },
 ];
export interface SnowPlatformConfig {
    placements: readonly LevelObjectPlacement[];
    commands: readonly LevelCommand[];
    table: ReadonlyMap<number, SSSVObjectData>;
    paths: readonly LevelPath[];
    indices: readonly number[];
    links: readonly LevelLink[];
}
export function readSnowPlatforms(placements: readonly LevelObjectPlacement[], commands: readonly LevelCommand[], table: ReadonlyMap<number, SSSVObjectData>, paths: readonly LevelPath[], links: readonly LevelLink[]): SnowPlatformConfig | null {
    if (!scripts.every(script => script.records.every((raw, i) => {
        const c = commands[script.base + i];
        return c !== undefined && c.opcode === parseInt(raw.slice(0, 4), 16)
            && Array.from(c.payload.createTypedArray(Uint8Array), b => b.toString(16).padStart(2, '0')).join('') === raw.slice(4);
    }))) return null;
    for (const [index, base] of [[8, 27], [2, 48], [3, 362]]) {
        const p = placements[index];
        if (p?.id !== 94 || p.commandReferenceIdx !== base + 1 || p.commandsLength !== 0 || p.angle || p.zRotation) return null;
    }
    for (const [index, base] of [[4, 76], [5, 15], [27, 254]]) {
        const p = placements[index];
        if (p?.id !== 45 || p.commandReferenceIdx !== base + 1 || p.commandsLength !== 0) return null;
    }
    if (![[4, 3, 0], [27, 56, 0], [27, 57, 1]].every(([parent, child, referenceIdx]) =>
        placements[child] !== undefined && links.some(l => l.parent === parent && l.child === child && l.referenceIdx === referenceIdx))) return null;
    const d = table.get(94);
    if (!d || d.renderMode !== 6 || d.orientationMode !== 5 || d.behaviorFlags !== 0x42 || d.updateCallback !== 0 || d.scaleOverride !== 0) return null;
    if (table.get(64)?.updateCallback !== 0x802F9084 || table.get(168)?.updateCallback !== 0x802FFC34) return null;
    if ([64, 168].some(id => table.get(id)?.behaviorFlags !== 0 || table.get(id)?.scaleOverride !== 0)) return null;
    if (![0, 1, 9].every(i => paths[i]?.waypoints.length >= 4 && paths[i].waypoints.every(p => [p.x, p.y, p.z].every(v => Number.isInteger(v) && v >= 0 && v <= 255)))) return null;
    return { placements, commands, table, paths, links, indices: [8, 2, 3] };
}

interface PathController { path: LevelPath; parameter: number; step: number; direction: number; mode: number; active: boolean; }
export class SnowPlatformWorld extends CommandObjectWorld {
    public readonly programs = new Map<string, CommandVM>();
    public readonly paths = new Map<string, PathController>();
    public readonly approaches = new Map<string, { target: number[]; speed: number }>();
    public readonly emitters = new Map<string, EmitterConfiguration>();
    public standingOn: string | null = null;
    public readonly leverPhases = new Map([[4, 0], [5, 0], [27, 0]]);
    public readonly fanSlots = new Map([[1, { enabled: true, s: 0, t: 0, frame: 0 }], [2, { enabled: true, s: 0, t: 0, frame: 4 }]]);
    public viewFade = 16;
    public snowCount = 0;
    public lastNotice: number | null = null;

    constructor(public readonly config: SnowPlatformConfig) {
        super(config.table, () => null, 6, { secondaryList: true, silentCallbacks: new Set([0x802F9084, 0x802FFC34]) });
        for (const index of [...config.indices].sort((a, b) => a - b)) {
            const id = `object:${index}`, created = this.createObject(id, config.placements[index]);
            if (!created.ok) throw new Error(created.reason);
            this.programs.set(id, this.program(id, config.placements[index].commandReferenceIdx - 1));
        }
        for (const index of [4, 5, 27, 56, 57]) {
            const p = config.placements[index], id = `object:${index}`;
            this.addEntity({ id, typeId: p.id, position: { x: p.x, y: p.y, z: p.z } });
            if ([4, 5, 27].includes(index)) this.programs.set(id, this.program(id, p.commandReferenceIdx - 1));
        }
        for (const link of config.links) if ([4, 27].includes(link.parent))
            this.getEntity(`object:${link.parent}`)!.references.set(link.referenceIdx + 1, `object:${link.child}`);
    }
    public override showMessage(owner: string, message: number, style: number): CommandResult<boolean> {
        if (![1, 5, 6].includes(message)) return commandFailure('Unsupported Snow switch notice');
        this.lastNotice = message; return commandSuccess(true);
    }
    public executeViewerCommand(owner: string, target: string | null, opcode: number, p: DataView): CommandResult<void> {
        if (opcode === 0x4C) {
            const fan = this.fanSlots.get(p.getUint16(0));
            if (!fan) return commandFailure('Unsupported Snow fan slot');
            const s = this.readOperand(target, p.getInt16(2)), t = this.readOperand(target, p.getInt16(4));
            if (!s.ok) return s; if (!t.ok) return t;
            fan.enabled = (s.value | t.value) !== 0;
            if (fan.enabled) { fan.s = s.value; fan.t = t.value; }
        } else if (opcode === 0x2A && owner === 'object:5') this.snowCount = p.getUint16(0);
        else return commandFailure('Unsupported Snow viewer command');
        return commandSuccess(undefined);
    }
    public sampleFans(tick: number): void {
        for (const [slot, fan] of this.fanSlots) if (fan.enabled)
            fan.frame = slot === 1 ? (fan.s | fan.t) !== 0 ? tick % 4 : 0 : (fan.s | fan.t) !== 0 ? 4 + Math.floor(tick % 9 / 3) : 4;
    }
    private program(owner: string, scriptBase: number): CommandVM { return new CommandVM({ owner, commands: this.config.commands, scriptBase, traceCapacity: 128 }, this); }
    public assignProgram(owner: string, target: string | null, scriptBase: number): CommandResult<void> {
        if (target === null || !this.objects.has(target) || this.programs.has(target)) return commandFailure('Platform handoff requires a new helper');
        if (scriptBase !== 188 && scriptBase !== 381) return commandFailure('Unsupported platform helper');
        this.programs.set(target, this.program(target, scriptBase)); return commandSuccess(undefined);
    }
    public override readOperand(target: string | null, operand: number): CommandResult<number> {
        if (operand === 0x7F9D) return commandSuccess(this.viewFade);
        if (operand === 0x7F93) {
            const o = target === null ? undefined : this.objects.get(target);
            return o ? commandSuccess(o.material) : commandFailure('Missing material target', 'invalid-reference');
        }
        return super.readOperand(target, operand);
    }
    public override writeVariable(target: string | null, field: number, value: number): CommandResult<void> {
        if (field === 30) { this.viewFade = value; return commandSuccess(undefined); }
        if (field >= 6 && field <= 8) {
            const o = target === null ? undefined : this.objects.get(target);
            if (!o) return commandFailure('Missing helper position target', 'invalid-reference');
            const axis = [0, 2, 1][field - 6], key = (['x', 'y', 'z'] as const)[axis];
            o.fixedPosition[axis] = value << 16; this.getEntity(o.id)!.position![key] = (value << 16) >> 16;
            return commandSuccess(undefined);
        }
        return super.writeVariable(target, field, value);
    }
    public override evaluateCondition(target: string | null, p: DataView): CommandResult<boolean> {
        const predicate = p.getUint8(0) & 0x3F;
        if (predicate === 11) {
            if (p.getUint8(2) !== 16 || target === null || !this.objects.has(target)) return commandFailure('Unsupported supporting-entity predicate');
            const standing = this.standingOn === target;
            return commandSuccess(p.getUint8(0) & 0x80 ? !standing : standing);
        }
        if (predicate === 5) {
            if (target === null || !this.objects.has(target)) return commandFailure('Missing movement target', 'invalid-reference');
            const done = this.objects.get(target)!.movement === null && !this.paths.get(target)?.active && !this.approaches.has(target);
            return commandSuccess(p.getUint8(0) & 0x80 ? !done : done);
        }
        return super.evaluateCondition(target, p);
    }
    public override executeObjectCommand(owner: string, target: string | null, opcode: number, p: DataView): CommandResult<void> {
        if ([0x19, 0x1B, 0x1C].includes(opcode) && target !== null) {
            const path = this.paths.get(target); if (path) path.active = false;
            this.approaches.delete(target);
        }
        return super.executeObjectCommand(owner, target, opcode, p);
    }
    public executeEmitterCommand(target: string | null, opcode: number, p: DataView): CommandResult<void> {
        if (target === null || this.getEntity(target)?.typeId !== 64) return commandFailure('Platform emitter target is not the admitted helper');
        let config = this.emitters.get(target);
        if (!config) {
            config = { flags: 0, particleId: 0, frequency: 0, size: 0, argument: 0, duration: 0, offset: [0, 0, 0], spread: [0, 0, 0],
                direction: [0, 0, 0], directionSpread: [0, 0, 0], primaryColor: 0, environmentColor: 0 };
            this.emitters.set(target, config);
        }
        return applyEmitterCommand(config, opcode, p, true, [10, 35], [0xE8, 0xE9]);
    }
    public executePathCommand(target: string | null, opcode: number, p: DataView): CommandResult<'wait' | 'yield' | 'continue'> {
        const o = target === null ? undefined : this.objects.get(target);
        if (!o || o.typeId !== 94) return commandFailure('Path requires an admitted platform');
        const pathIndex = opcode === 0x1D ? p.getUint16(0) : p.getUint8(1), speed = opcode === 0x1D ? p.getUint16(2) : p.getUint8(3);
        const direction = p.getInt8(5), mode = p.getUint8(6), path = this.config.paths[pathIndex];
        if (![0, 1, 9].includes(pathIndex) || !path || speed < 1 || speed > 255 || ![-1, 1].includes(direction) || mode > 1) return commandFailure('Unsupported platform path operands');
        if (this.approaches.has(o.id)) return commandSuccess('wait');
        if (opcode === 0x1D) {
            const start = sampleCommandPath(path, 0, mode !== 1).map(v => v >> 16);
            if (start.some((v, i) => Math.abs(v - (o.fixedPosition[i] >> 16)) > 4)) {
                o.movement = null; const previous = this.paths.get(o.id); if (previous) previous.active = false;
                this.approaches.set(o.id, { target: start, speed }); return commandSuccess('wait');
            }
        }
        const parameter = opcode === 0x34 ? this.paths.get(o.id)?.parameter ?? 0 : direction > 0 ? 0 : (path.waypoints.length + 1) * 128;
        o.movement = null;
        this.paths.set(o.id, { path, step: speed * direction, direction, mode, parameter, active: true });
        return commandSuccess('yield');
    }
    public override advanceController(id: string): void {
        const o = this.objects.get(id)!, approach = this.approaches.get(id), path = this.paths.get(id);
        if (approach) {
            if (approach.target.every((v, i) => v === (o.fixedPosition[i] >> 16))) { this.approaches.delete(id); o.velocity.fill(0); }
            else for (let i = 0; i < 3; i++) {
                const current = o.fixedPosition[i] >> 16, delta = Math.max(-approach.speed, Math.min(approach.speed, approach.target[i] - current));
                o.velocity[i] = ((current + (this.getEntity(id)!.state === 0 ? 0 : delta)) << 16) - o.fixedPosition[i];
            }
        } else if (path?.active) {
            const end = (path.path.waypoints.length + 1) * 128;
            if (path.mode === 1 && (path.direction > 0 ? path.parameter >= end : path.parameter < 1)) { path.active = false; o.velocity.fill(0); return; }
            path.parameter += path.step;
            if (path.mode === 1) path.parameter = Math.max(0, Math.min(end, path.parameter));
            else { const length = path.path.waypoints.length * 128; path.parameter = (path.parameter % length + length) % length; }
            const next = sampleCommandPath(path.path, path.parameter, path.mode !== 1);
            for (let i = 0; i < 3; i++) o.velocity[i] = next[i] - o.fixedPosition[i];
        } else super.advanceController(id);
    }
}

export class SnowPlatformRuntime {
    public enabled = false;
    public motionEnabled = true;
    public world!: SnowPlatformWorld;
    private tick = 0;
    private lastTick: number | null = null;
    constructor(public readonly config: SnowPlatformConfig) { this.reset(); }
    public setEnabled(enabled: boolean): void { this.enabled = enabled; this.reset(); }
    public reset(): void { this.world = new SnowPlatformWorld(this.config); this.tick = 0; this.lastTick = null; if (this.enabled) this.step(); }
    public switchReady(index: number): boolean {
        const vm = this.world.programs.get(`object:${index}`);
        return this.enabled && [4, 5, 27].includes(index) && vm?.status === 'waiting' && vm.location.opcode === 3 && !vm.diagnostic && this.world.getEntity(`object:${index}`)!.contactFlags === 0;
    }
    public activateSwitch(index: number): boolean {
        if (!this.switchReady(index)) return false;
        const vm = this.world.programs.get(`object:${index}`)!;
        this.world.getEntity(`object:${index}`)!.contactFlags = this.config.commands[vm.location.commandIndex].payload.createDataView().getUint8(2) & 0x1F;
        return true;
    }
    public setStanding(index: number | null): void { if (index !== null && !this.config.indices.includes(index)) throw new RangeError('Unknown platform input'); this.world.standingOn = index === null ? null : `object:${index}`; }
    public step(): void {
        if (!this.enabled) return;
        const budget = new CommandTickBudget(2048);
        for (const id of [...this.world.programs.keys()].reverse()) {
            const vm = this.world.programs.get(id)!; if (vm.diagnostic) continue;
            if (this.world.objects.has(id)) this.world.integrate(id);
            vm.step(this.tick, budget);
            if (!vm.diagnostic && this.world.objects.has(id)) this.world.advanceController(id);
        }
        for (const index of [4, 5, 27]) {
            const entity = this.world.getEntity(`object:${index}`)!;
            this.world.leverPhases.set(index, stepLeverPhase(this.world.leverPhases.get(index)!, entity.state));
            entity.contactFlags = 0;
        }
        this.world.sampleFans(this.tick++);
    }
    public advanceTo(tick: number): void {
        if (this.lastTick === null) { this.lastTick = tick; return; }
        const delta = tick - this.lastTick;
        if (this.enabled && (delta < 0 || delta > 900)) this.reset();
        else if (this.enabled && this.motionEnabled) for (let i = 0; i < delta; i++) this.step();
        this.lastTick = tick;
    }
}
