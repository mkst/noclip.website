import { CommandVM, CommandTickBudget, commandSuccess, commandFailure } from './command_vm.js';
import type { CommandResult } from './command_vm.js';
import { CommandWorld } from './command_world.js';
import type { CommandEntityInit } from './command_world.js';
import type { LevelAnimalPlacement, LevelMapEntry, LevelObjectPlacement } from './level.js';
import type { LevelCommand } from './paths.js';
import { sampleGroundHeight } from './terrain_height.js';

const scripts = [
    { base: 47, records: [
        '00210001000000000000',
        '00530004000000000000',
        '0011400001001a000580',
        '00560007000100000000',
        '00140007000000000000',
        '000e017c000000000000',
        '00140000000000000000',
        '00230023000000000000',
        '003d0028000000000400',
        '0051000f000900000000',
        '00090000000000000000',
        '003d7fc300017f884410',
        '00104000000000000000',
        '00560007000100000000',
        '00140007000000000000',
        '000e02ab000000000000',
        '00140000000000000000',
        '00090000000000000000',
    ] },
    { base: 89, records: [
        '000313007fc6000cffff',
        '00420009000000000000',
        '00440008000300000000',
        '0060050009030c13060e',
        '00140007000000000000',
        '00560000000100000007',
        '000e002f000000000000',
        '004a003a000000000000',
        '00600500087f0ba4060e',
        '00140007000000000000',
        '000e002f000000000000',
        '004a003a000000000000',
        '0060050008310b2c060e',
        '00140007000000000000',
        '000e002f000000000000',
        '004a003a000000000000',
        '0060050009820ba4060e',
        '00140007000000000000',
        '000e002f000000000000',
        '004a003a000000000000',
        '0060050009f20b2c060e',
        '00140007000000000000',
        '000e002f000000000000',
        '004a003a000000000000',
        '00140001000000000000',
        '004d001e08d000ba1210',
        '0006003c000000000000',
        '004d001e08d000ac1a18',
        '0006003c000000000000',
        '002e001e000000000000',
        '0003080000000016ffff',
        '00430009000000000000',
        '000314007fc30006ffff',
        '0060050007a00c60060e',
        '00140007000000000000',
        '000e002f000000000000',
        '004a003a000000000000',
        '006005000a200c60060e',
        '00140007000000000000',
        '000e002f000000000000',
        '004a003a000000000000',
        '0060050008f70c60060e',
        '00140007000000000000',
        '000e002f000000000000',
        '004a003a000000000000',
        '00140000000000000000',
        '00090000000000000000',
    ] },
    { base: 257, records: [
        '000313007fc30004ffff',
        '00600700096d15d707f8',
        '00140007000000000000',
        '0039096015e00b540000',
        '003d00b4000000000f00',
        '00230000000000000000',
        '001d0003000f0001015a',
        '000305007fc30016ffff',
        '000e012f000000000000',
        '00140000000000000000',
        '00130000000000000000',
        '00090000000000000000',
        '000313007fc30004ffff',
        '00600700086315d707f8',
        '00140007000000000000',
        '00530004000000000000',
        '0039086015e00b540000',
        '003d00b4000000000f00',
        '00230000000000000000',
        '001d0002000f0001015a',
        '000305007fc30016ffff',
        '000e012f000000000000',
        '00140000000000000000',
        '00130000000000000000',
        '00090000000000000000',
        '000313007fc30004ffff',
        '0060070008e4150c07f8',
        '00140007000000000000',
        '00530004000000000000',
        '0039090015400b540000',
        '003d00b4000000000f00',
        '00230000000000000000',
        '001d0001000f0001015a',
        '00420009000000000000',
        '004d000f08d000ac1010',
        '0006003c000000000000',
        '004d000f08d000ba2020',
        '0006001e000000000000',
        '000305007fc30016ffff',
        '000308007fc30016ffff',
        '000e012f000000000000',
        '00140000000000000000',
        '002e000f000000000000',
        '00430009000000000000',
        '00130000000000000000',
        '00090000000000000000',
    ] },
 ];
export interface LiveAnimalSpawnConfig {
    placements: readonly LevelObjectPlacement[];
    commands: readonly LevelCommand[];
    map: readonly LevelMapEntry[];
    player: LevelAnimalPlacement | null;
    indices: readonly number[];
}
export function readLiveAnimalSpawns(placements: readonly LevelObjectPlacement[], commands: readonly LevelCommand[], map: readonly LevelMapEntry[], player: LevelAnimalPlacement | null): LiveAnimalSpawnConfig | null {
    if (!scripts.every(script => script.records.every((raw, i) => {
        const c = commands[script.base + i];
        return c !== undefined && c.opcode === parseInt(raw.slice(0, 4), 16)
            && Array.from(c.payload.createTypedArray(Uint8Array), b => b.toString(16).padStart(2, '0')).join('') === raw.slice(4);
    }))) return null;
    for (const [index, id, base] of [[47, 9, 89], [20, 64, 257], [10, 64, 269], [4, 64, 282]]) {
        const p = placements[index]; if (p?.id !== id || p.commandReferenceIdx !== base + 1 || p.commandsLength !== 0) return null;
    }
    return { placements, commands, map, player: player ? { ...player } : null, indices: [47, 20, 10, 4] };
}
export interface LiveAnimalInstance {
    id: string;
    commandIndex: number;
    placement: LevelAnimalPlacement;
    behaviorScript: number | null;
    eventScript: number | null;
    aiFlags: number;
    objectFlags: number;
    navigation: { path: number; speed: number; direction: number; mode: number } | null;
}

export class LiveAnimalSpawnWorld extends CommandWorld {
    public readonly animals = new Map<string, LiveAnimalInstance>();
    public readonly programs = new Map<string, CommandVM>();
    public readonly cameraRequests: { opcode: number; target: string | null }[] = [];
    public cutsceneRequested = false;
    public cutsceneComplete = false;
    private serial = 0;

    constructor(public readonly config: LiveAnimalSpawnConfig) {
        const entities: CommandEntityInit[] = config.indices.map(index => ({ id: `object:${index}`, typeId: config.placements[index].id,
            position: { x: config.placements[index].x, y: config.placements[index].y, z: config.placements[index].z } }));
        if (config.player) entities.push({ id: 'player', typeId: config.player.id + 256, position: { x: config.player.x, y: config.player.y, z: config.player.z } });
        super(entities, 'silent', { acknowledgedMessages: new Set([8]) }); this.currentPlayer = config.player ? 'player' : null;
        for (const index of [...config.indices].sort((a, b) => a - b)) {
            const owner = `object:${index}`;
            this.programs.set(owner, new CommandVM({ owner, commands: config.commands, scriptBase: config.placements[index].commandReferenceIdx - 1, traceCapacity: 128 }, this));
        }
    }
    public spawnAnimal(owner: string, p: DataView, commandIndex: number): CommandResult<boolean> {
        if (this.animals.size >= 11) return commandFailure('Live animal capacity exceeded', 'invalid-data');
        if ([...this.animals.values()].some(a => a.commandIndex === commandIndex)) return commandFailure('An admitted spawn site was executed twice', 'invalid-data');
        const type = p.getUint8(0);
        if (type !== 5 && type !== 7) return commandFailure('Unsupported live-spawn species');
        const x = p.getInt16(2), z = p.getInt16(4), requestedY = p.getInt16(6), floor = sampleGroundHeight(this.config.map, x, z);
        if (floor === null) return commandFailure('Animal spawn is outside loaded ground');
        const id = `animal:${this.serial++}`, placement: LevelAnimalPlacement = { id: type, x, y: Math.max(requestedY, floor), z, health: 127, rotation: 0, unkC: 0, unkE: 0 };
        this.addEntity({ id, typeId: type + 256, position: { x: placement.x, y: placement.y, z: placement.z } });
        this.animals.set(id, { id, commandIndex, placement, behaviorScript: null, eventScript: null, aiFlags: 0, objectFlags: 0, navigation: null });
        this.getEntity(owner)!.references.set(7, id); return commandSuccess(true);
    }
    public assignProgram(owner: string, target: string | null, scriptBase: number): CommandResult<void> {
        const animal = target === null ? undefined : this.animals.get(target);
        if (!animal || ![47, 303].includes(scriptBase)) return commandFailure('Unsupported held animal behavior assignment');
        // Assigned behavior/event scripts remain recorded while the approved idle
        // policy holds them before their first instruction. Parent execution continues.
        animal.behaviorScript = scriptBase; return commandSuccess(undefined);
    }
    public override writeVariable(target: string | null, field: number, value: number): CommandResult<void> {
        const animal = target === null ? undefined : this.animals.get(target);
        if (animal && field === 15) { animal.placement.rotation = Math.trunc(value * 256 / 360) & 255; return commandSuccess(undefined); }
        return super.writeVariable(target, field, value);
    }
    public executePathCommand(target: string | null, opcode: number, p: DataView): CommandResult<'wait' | 'yield' | 'continue'> {
        const animal = target === null ? undefined : this.animals.get(target);
        if (!animal || opcode !== 0x1D) return commandFailure('Navigation request requires an admitted animal');
        animal.navigation = { path: p.getUint16(0), speed: p.getUint16(2), direction: p.getInt8(5), mode: p.getUint8(6) };
        return commandSuccess('continue');
    }
    public override evaluateCondition(target: string | null, p: DataView): CommandResult<boolean> {
        const predicate = p.getUint8(0) & 0x3F;
        if (predicate === 5 && target !== null && this.animals.has(target)) {
            const finished = this.animals.get(target)!.navigation === null;
            return commandSuccess(p.getUint8(0) & 0x80 ? !finished : finished);
        }
        if (predicate === 8) return commandSuccess(p.getUint8(0) & 0x80 ? !this.cutsceneComplete : this.cutsceneComplete);
        return super.evaluateCondition(target, p);
    }
    public executeViewerCommand(owner: string, target: string | null, opcode: number, p: DataView): CommandResult<void> {
        const animal = target === null ? undefined : this.animals.get(target);
        if (opcode === 0x39) {
            if (!animal || p.getInt16(6) !== 0) return commandFailure('Unsupported animal positioning request');
            const [x, z, y] = [p.getInt16(0), p.getInt16(2), p.getInt16(4)], ground = sampleGroundHeight(this.config.map, x, z);
            if (ground === null) return commandFailure('Animal position is outside loaded ground');
            Object.assign(animal.placement, { x, z, y: Math.max(y, ground) });
            Object.assign(this.getEntity(animal.id)!.position!, { x, z, y: animal.placement.y });
        } else if (opcode === 0x23 && animal) animal.aiFlags = p.getUint16(0);
        else if (opcode === 0x53 && animal) animal.objectFlags = p.getUint16(0);
        else if (opcode === 0x4A && animal) animal.eventScript = p.getUint16(0);
        else if ([0x42, 0x43, 0x4D, 0x2E].includes(opcode)) {
            this.cameraRequests.push({ opcode, target }); if (this.cameraRequests.length > 16) this.cameraRequests.shift();
            if (opcode === 0x2E) { this.cutsceneRequested = true; this.cutsceneComplete = false; }
        } else return commandFailure(`Unsupported animal-spawn viewer request 0x${opcode.toString(16)}`);
        return commandSuccess(undefined);
    }
    public executeEffectCommand(target: string | null, opcode: number): CommandResult<void> {
        if (opcode !== 0x13 || target === null || !this.programs.has(target)) return commandFailure('Only admitted controller deletion is supported');
        this.programs.delete(target); this.deleteEntity(target); return commandSuccess(undefined);
    }
}

export class LiveAnimalSpawnRuntime {
    public enabled = false;
    public world!: LiveAnimalSpawnWorld;
    private tick = 0;
    private lastTick: number | null = null;
    constructor(public readonly config: LiveAnimalSpawnConfig) { this.reset(); }
    public setEnabled(enabled: boolean): void { this.enabled = enabled; this.reset(); }
    public reset(): void { this.world = new LiveAnimalSpawnWorld(this.config); this.tick = 0; this.lastTick = null; if (this.enabled) this.step(); }
    public setStage(stage: 'foxes' | 'dogs' | 'laterDogs'): void {
        if (!this.enabled) return;
        if (stage === 'foxes') this.world.globals[4] = 4;
        else if (stage === 'dogs') this.world.globals[7] = 12;
        else this.world.globals[4] = 6;
    }
    public continueSequence(): void {
        if (this.world.message) this.world.acknowledgeMessage(this.world.message.owner);
        else if (this.world.cutsceneRequested) { this.world.cutsceneComplete = true; this.world.cutsceneRequested = false; }
    }
    public step(): void {
        if (!this.enabled) return;
        const budget = new CommandTickBudget(2048);
        for (const vm of [...this.world.programs.values()].reverse()) vm.step(this.tick, budget);
        this.tick++;
    }
    public advanceTo(tick: number): void {
        if (this.lastTick === null) { this.lastTick = tick; return; }
        const delta = tick - this.lastTick;
        if (this.enabled && (delta < 0 || delta > 900)) this.reset();
        else if (this.enabled) for (let i = 0; i < delta; i++) this.step();
        this.lastTick = tick;
    }
}
