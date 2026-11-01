import { createEmitterConfiguration } from './particle_emitters.js';
import { CommandTickBudget, CommandVM, commandFailure, commandSuccess } from '../commands/command_vm.js';
import type { CommandResult } from '../commands/command_vm.js';
import { CommandWorld } from '../commands/command_world.js';
import { applyEmitterCommand } from './emitter_commands.js';
import type { EmitterConfiguration } from './particle_emitters.js';
import type { LevelCommand } from '../commands/paths.js';
import type { BoulderEventConfig, EventBoulder } from './level_events.js';

export interface BoulderCommandBackend {
    random(n: number): number;
    spawn(sourceIndex: number, yaw: number, pitch: number, speed: number): EventBoulder | null;
    remove(boulder: EventBoulder, effect: number): void;
}
export interface BoulderProgram {
    id: string;
    sourceIndex: number;
    vm: CommandVM | null;
    boulder: EventBoulder | null;
    angle: number;
    rotation: number;
    angleStep: number;
    rotationStep: number;
    scale: number;
    material: number;
    effect: number;
    mass: number;
    emitter: EmitterConfiguration;
}

const angle = (v: number) => (v % 360 + 360) % 360;

export class BoulderCommandWorld extends CommandWorld {
    public readonly programs = new Map<string, BoulderProgram>();
    public diagnostics: { id: string; reason: string; commandIndex: number }[] = [];
    public regionActive = false;
    private tick = 0;
    private serial = 0;

    constructor(public readonly config: BoulderEventConfig, private readonly commands: readonly LevelCommand[], private readonly backend: BoulderCommandBackend) {
        super([{ id: 'camera', typeId: 256, position: { x: 0, z: 0, y: 0 } }], 'silent');
        this.currentPlayer = 'camera';
        for (const [i, source] of config.spawners.entries()) {
            const id = `spawner:${source.placementIndex}`;
            this.addEntity({ id, typeId: 64, position: { x: source.placement.x, y: source.placement.y, z: source.placement.z } });
            const program = this.makeProgram(id, i, null, source.placement.angle, source.placement.zRotation);
            program.vm = this.makeVM(id, source.placement.commandReferenceIdx - 1);
            this.programs.set(id, program);
        }
    }
    private makeVM(owner: string, scriptBase: number): CommandVM {
        return new CommandVM({ owner, commands: this.commands, scriptBase, maxInstructionsPerTick: 256, traceCapacity: 64 }, this);
    }
    private makeProgram(id: string, sourceIndex: number, boulder: EventBoulder | null, yaw: number, pitch: number): BoulderProgram {
        return { id, sourceIndex, vm: null, boulder, angle: yaw, rotation: pitch, angleStep: 0, rotationStep: 0,
            scale: boulder?.scale ?? 2048, material: 0, effect: 0, mass: 0, emitter: createEmitterConfiguration() };
    }
    public step(active: boolean, cameraX: number, cameraZ: number, advancePhysics: (program: BoulderProgram) => void, emit: (program: BoulderProgram) => void): void {
        this.regionActive = active;
        Object.assign(this.getEntity('camera')!.position!, { x: cameraX, z: cameraZ });
        const budget = new CommandTickBudget(8192);
        // New bodies enter at the head, but begin updating on the following tick.
        for (const program of [...this.programs.values()].reverse()) {
            if (program.vm?.diagnostic) continue;
            if (program.boulder !== null) {
                advancePhysics(program);
                if (!this.programs.has(program.id)) continue;
                const b = program.boulder;
                Object.assign(this.getEntity(program.id)!.position!, { x: b.x >> 16, y: b.y >> 16, z: b.z >> 16 });
            }
            program.vm?.step(this.tick, budget);
            if (!this.programs.has(program.id)) continue;
            if (program.vm?.diagnostic) {
                const d = program.vm.diagnostic;
                this.diagnostics.push({ id: program.id, reason: d.reason, commandIndex: d.commandIndex });
                if (this.diagnostics.length > 32) this.diagnostics.shift();
                program.vm.stop(); program.emitter.flags = 0;
                continue;
            }
            program.angle = (program.angle + program.angleStep) % 360;
            program.rotation = (program.rotation + program.rotationStep) % 360;
            if (program.boulder !== null) {
                const b = program.boulder;
                b.scale = program.scale; b.heading = program.angle; b.rotation = program.rotation;
                emit(program);
            }
        }
        this.tick++;
    }
    public override readOperand(target: string | null, operand: number): CommandResult<number> {
        if (operand === 0x7F84) return commandSuccess(this.backend.random(32768) % 0x7F7E);
        const program = target === null ? undefined : this.programs.get(target);
        if (operand === 0x7F88 && program) return commandSuccess(program.scale);
        return super.readOperand(target, operand);
    }
    public override writeVariable(target: string | null, field: number, value: number): CommandResult<void> {
        const program = target === null ? undefined : this.programs.get(target);
        if (field === 9 && program) { program.scale = value & 65535 || 2048; if (program.boulder) program.boulder.scale = program.scale; return commandSuccess(undefined); }
        if (field === 18 && program) { program.mass = value; return commandSuccess(undefined); }
        return super.writeVariable(target, field, value);
    }
    public override evaluateCondition(target: string | null, p: DataView): CommandResult<boolean> {
        if ((p.getUint8(0) & 0x3F) === 0 && p.getUint8(2) === 16 && p.getUint8(3) === 6 && this.config.region !== null)
            return commandSuccess(p.getUint8(0) & 0x80 ? !this.regionActive : this.regionActive);
        return super.evaluateCondition(target, p);
    }
    public assignProgram(owner: string, target: string | null, scriptBase: number): CommandResult<void> {
        const program = target === null ? undefined : this.programs.get(target);
        if (!program || program.boulder === null || program.vm !== null) return commandFailure('Only a new admitted child can receive a foreign program');
        program.vm = this.makeVM(program.id, scriptBase); return commandSuccess(undefined);
    }
    public executeObjectCommand(owner: string, target: string | null, opcode: number, p: DataView): CommandResult<void> {
        const program = target === null ? undefined : this.programs.get(target);
        if (!program) return commandFailure('Missing event target', 'invalid-reference');
        if (opcode === 0x10) {
            if (p.getUint8(0) !== 2 || p.getUint8(1) || p.getUint8(2) || p.getUint8(3)) return commandFailure('Unsupported event spawn type/offset');
            const yaw = angle(program.angle + ((p.getInt8(4) * 360) >> 8)), pitch = angle(program.rotation + ((p.getInt8(5) * 360) >> 8));
            const boulder = this.backend.spawn(program.sourceIndex, yaw, pitch, p.getUint8(6));
            if (boulder === null) return commandFailure('Boulder capacity exceeded', 'invalid-data');
            const id = `boulder:${this.serial++}`; boulder.commandId = id;
            this.addEntity({ id, typeId: 2, position: { x: boulder.x >> 16, y: boulder.y >> 16, z: boulder.z >> 16 } });
            this.programs.set(id, this.makeProgram(id, program.sourceIndex, boulder, yaw, pitch));
            this.getEntity(owner)!.references.set(7, id);
        } else if (opcode === 0x32) {
            if (p.getUint8(0) !== 16) return commandFailure('Unsupported event rotation mode');
            const z = this.readOperand(target, p.getInt16(2)), y = this.readOperand(target, p.getInt16(6));
            if (!z.ok) return z; if (!y.ok) return y;
            program.rotationStep = (z.value << 16) >> 16; program.angleStep = (y.value << 16) >> 16;
        } else if (opcode === 0x33) {
            const value = this.readOperand(target, p.getUint16(0)); if (!value.ok) return value;
            if (value.value !== 20) return commandFailure('Unsupported boulder material');
            program.material = value.value;
        } else if (opcode === 0x36) { program.scale = p.getUint16(0) || 2048; if (program.boulder) program.boulder.scale = program.scale; }
        else return commandFailure(`Unsupported event object opcode ${opcode}`);
        return commandSuccess(undefined);
    }
    public executeEmitterCommand(target: string | null, opcode: number, p: DataView): CommandResult<void> {
        const program = target === null ? undefined : this.programs.get(target);
        if (!program?.boulder) return commandFailure('Event emitter requires a live body');
        return applyEmitterCommand(program.emitter, opcode, p, true, [1, 4, 23]);
    }
    public executeEffectCommand(target: string | null, opcode: number, p: DataView): CommandResult<void> {
        const program = target === null ? undefined : this.programs.get(target);
        if (!program?.boulder) return commandFailure('Event effect requires a live body');
        if (opcode === 0x5B) {
            const value = this.readOperand(target, p.getInt16(0)); if (!value.ok) return value;
            if (value.value !== 10 && value.value !== 13) return commandFailure('Unsupported event deletion effect');
            program.effect = value.value;
        } else if (opcode === 0x13) {
            this.backend.remove(program.boulder, program.effect);
            this.remove(program.id);
        } else if (opcode === 0x18) {
            if (p.getUint16(0) !== 0 || p.getUint16(2) !== 0x4500 || p.getUint32(4) !== 0) return commandFailure('Active trails require a trail backend');
            program.emitter.flags = 0;
        } else if (opcode === 0x31) {
            if (!(p.getInt16(0) === 20 && p.getInt16(2) === 200 || p.getInt16(0) === 2 && p.getInt16(2) === 0))
                return commandFailure('Unsupported event damage request');
        } else if (opcode === 0x47) {
            if (p.getUint16(0) !== 6 || p.getUint16(2) !== 0x1E1E || p.getUint32(4) !== 0)
                return commandFailure('Unsupported event rumble request');
        } else return commandFailure('Unsupported event effect');
        // Damage and controller rumble are explicitly suppressed in this visual host.
        return commandSuccess(undefined);
    }
    public remove(id: string): void { this.programs.delete(id); this.deleteEntity(id); }
}
