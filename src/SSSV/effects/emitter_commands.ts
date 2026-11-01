import { SceneTickClock } from '../core/timing.js';
import { CommandTickBudget, CommandVM, commandFailure, commandSuccess } from '../commands/command_vm.js';
import type { CommandResult } from '../commands/command_vm.js';
import { CommandWorld } from '../commands/command_world.js';
import type { CommandEntityInit } from '../commands/command_world.js';
import { createEmitterConfiguration, packParticleColor } from './particle_emitters.js';
import type { EmitterConfiguration, PersistentEmitter } from './particle_emitters.js';
import type { LevelAnimalPlacement } from '../core/level.js';
import type { LevelCommand } from '../commands/paths.js';

export function applyEmitterCommand(config: EmitterConfiguration, opcode: number, p: DataView, allowReplacement = false, allowedIds: readonly number[] = [122, 24, 37], allowedFlags: readonly number[] = [9, 0x89, 0xE9]): CommandResult<void> {
    if (opcode === 0x15) {
        config.offset = [p.getInt8(0), p.getInt8(1), p.getInt8(2)];
        config.spread = [p.getUint8(3), p.getUint8(4), p.getUint8(5)];
    } else if (opcode === 0x16) {
        config.direction = [p.getUint8(0), p.getUint8(1), p.getUint8(2)];
        config.directionSpread = [p.getUint8(3), p.getUint8(4), p.getUint8(5)];
    } else if (opcode === 0x64) {
        config.primaryColor = packParticleColor(p.getUint8(0), p.getUint8(1), p.getUint8(2));
        config.environmentColor = packParticleColor(p.getUint8(3), p.getUint8(4), p.getUint8(5));
    } else if (opcode === 0x17) {
        const flags = p.getUint16(0), id = p.getUint8(2), duration = p.getUint16(6);
        if (!allowedFlags.includes(flags) || !allowedIds.includes(id) || duration !== 0)
            return commandFailure('Emitter configuration requires an unsupported particle lifecycle');
        // Reconstructed particles need configuration history for later replacement.
        if (!allowReplacement && config.flags !== 0) return commandFailure('Replacing a live emitter requires configuration history');
        config.flags = flags; config.particleId = id; config.frequency = (p.getInt8(3) - 20) << 24 >> 24;
        config.size = p.getUint8(4); config.argument = p.getUint8(5); config.duration = duration;
    } else return commandFailure(`Unsupported emitter opcode ${opcode}`);
    return commandSuccess(undefined);
}

export class CommandEmitterWorld extends CommandWorld {
    public readonly emitters = new Map<string, EmitterConfiguration>();
    public executeEmitterCommand(target: string | null, opcode: number, p: DataView): CommandResult<void> {
        const config = target === null ? undefined : this.emitters.get(target);
        if (!config) return commandFailure('Emitter command has no admitted target', 'invalid-reference');
        return applyEmitterCommand(config, opcode, p);
    }
}

export class EmitterCommandRuntime {
    public readonly emitters: PersistentEmitter[];
    public world!: CommandEmitterWorld;
    public programs: { emitter: PersistentEmitter; vm: CommandVM }[] = [];
    private readonly clock = new SceneTickClock();
    private localTick = 0;

    constructor(admitted: readonly PersistentEmitter[], private readonly commands: readonly LevelCommand[], private readonly player: LevelAnimalPlacement | null) {
        this.emitters = admitted.map(e => ({ ...e, initial: createEmitterConfiguration() }));
        this.reset();
    }
    public reset(): void {
        const entities: CommandEntityInit[] = this.emitters.map(e => ({ id: `object:${e.placementIndex}`, typeId: e.placement.id,
            position: { x: e.placement.x, y: e.placement.y, z: e.placement.z } }));
        if (this.player) entities.push({ id: 'player', typeId: this.player.id + 256, position: { x: this.player.x, y: this.player.y, z: this.player.z } });
        this.world = new CommandEmitterWorld(entities, 'silent');
        this.world.currentPlayer = this.player ? 'player' : null;
        this.programs = this.emitters.map(emitter => {
            Object.assign(emitter.initial, createEmitterConfiguration());
            const owner = `object:${emitter.placementIndex}`;
            this.world.emitters.set(owner, emitter.initial);
            return { emitter, vm: new CommandVM({ owner, commands: this.commands, scriptBase: emitter.placement.commandReferenceIdx - 1,
                initialCursor: emitter.placement.commandsLength, traceCapacity: 64 }, this.world) };
        });
        this.clock.reset(); this.localTick = 0; this.step();
    }
    public step(): void {
        const budget = new CommandTickBudget(4096);
        for (const { emitter, vm } of [...this.programs].reverse()) {
            vm.step(this.localTick, budget);
            if (vm.diagnostic !== null) emitter.initial.flags = 0;
        }
        this.localTick++;
    }
    public advanceTo(tick: number): void {
        const advance = this.clock.advance(tick);
        if (advance.kind === 'initial') return;
        if (advance.kind === 'discontinuity') { this.reset(); this.clock.reset(tick); }
        else for (let i = 0; i < advance.ticks; i++) this.step();
    }
}
