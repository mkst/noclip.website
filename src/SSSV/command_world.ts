import { commandFailure, commandSuccess } from "./command_vm.js";
import type { CommandEntityId, CommandHost, CommandResult } from "./command_vm.js";

export interface CommandEntityInit {
    id: CommandEntityId;
    typeId: number;
    state?: number;
    references?: ReadonlyMap<number, CommandEntityId>;
    temporaries?: readonly number[];
    position?: { x: number; y: number; z: number };
}

export interface CommandEntity {
    readonly id: CommandEntityId;
    readonly typeId: number;
    state: number;
    readonly position: { x: number; y: number; z: number } | null;
    readonly references: Map<number, CommandEntityId>;
    readonly temporaries: Int32Array;
    contactFlags: number;
    audioConfiguration: Uint8Array | null;
    audioAge: number;
}

export interface CommandWorldOptions {
    regions?: ReadonlyMap<number, readonly number[]>;
    acknowledgedMessages?: ReadonlySet<number>;
}

export interface CommandMessage {
    readonly owner: CommandEntityId;
    readonly id: number;
    readonly style: number;
}

export function inCommandRegion(entity: { x: number; z: number; y: number }, region: readonly number[]): boolean {
    const [x, z, y] = [entity.x, entity.z, entity.y].map(v => Math.floor(v / 64) & 255);
    return x >= region[0] && x <= region[3] && z >= region[1] && z <= region[4]
        && (region[2] === 240 || y >= region[2] && y <= region[5]);
}

// Headless state for the supported command subsets. Scene admission and callbacks
// supply contact inputs and own reset/update ordering; this class does not simulate them.
export class CommandWorld implements CommandHost {
    private readonly entities = new Map<CommandEntityId, CommandEntity>();
    public rainCount = 0;
    public readonly globals = new Int32Array(32);
    public taskBits = 0;
    private lastRegionEntity: CommandEntityId | null = null;
    private pendingMessage: CommandMessage | null = null;
    private messageAcknowledged = false;
    public currentPlayer: CommandEntityId | null = null;

    constructor(entities: readonly CommandEntityInit[], public readonly audioPolicy: "unsupported" | "silent" = "unsupported", private readonly options: CommandWorldOptions = {}) {
        for (const initial of entities) this.addEntity(initial);
    }

    public addEntity(initial: CommandEntityInit): void {
        if (this.entities.has(initial.id)) throw new Error(`Duplicate command entity ${initial.id}`);
        this.entities.set(initial.id, { id: initial.id, typeId: initial.typeId, state: (initial.state ?? 1) & 65535, position: initial.position ? { ...initial.position } : null,
            references: new Map(initial.references), temporaries: Int32Array.from(Array.from({ length: 3 }, (_, i) => initial.temporaries?.[i] ?? 0)),
            contactFlags: 0, audioConfiguration: null, audioAge: 0 });
    }

    public getEntity(id: CommandEntityId): CommandEntity | null { return this.entities.get(id) ?? null; }
    public deleteEntity(id: CommandEntityId): void { this.entities.delete(id); }

    public resolveReference(owner: CommandEntityId, selected: CommandEntityId | null, reference: number, region: number): CommandResult<CommandEntityId | null> {
        const entity = this.getEntity(owner);
        if (entity === null) return commandFailure(`Missing script owner ${owner}`, "invalid-reference");
        let target: CommandEntityId | null;
        if (reference === 0) target = owner;
        else if (reference >= 1 && reference <= 7) target = entity.references.get(reference) ?? null;
        else if (reference === 9) target = this.currentPlayer;
        else if (reference === 12) target = selected;
        else if (reference === 10 || reference === 11) {
            const bounds = this.options.regions?.get(region);
            if (bounds === undefined || bounds.length !== 6 || bounds.some(v => !Number.isInteger(v) || v < 0 || v > 255)
                || bounds[0] > bounds[3] || bounds[1] > bounds[4] || bounds[2] > 240 || bounds[2] !== 240 && bounds[2] > bounds[5])
                return commandFailure(`Unsupported region ${region}`);
            let canReturn = reference === 10;
            if (canReturn) this.lastRegionEntity = null;
            // Source uses one iterator across owners/regions. Authored insertion order
            // substitutes for unavailable collision-bucket traversal in this host.
            for (const candidate of this.entities.values()) {
                if (candidate.typeId === 256 + 62) continue;
                if (candidate.position === null) return commandFailure(`Region entity ${candidate.id} has no position`);
                if (canReturn && inCommandRegion(candidate.position, bounds)) {
                    this.lastRegionEntity = candidate.id; return commandSuccess(candidate.id);
                }
                if (!canReturn && candidate.id === this.lastRegionEntity) canReturn = true;
            }
            this.lastRegionEntity = null; return commandSuccess(null);
        } else return commandFailure(`Unsupported entity reference ${reference}`);
        return commandSuccess(target !== null && this.entities.has(target) ? target : null);
    }

    public readOperand(id: CommandEntityId | null, operand: number): CommandResult<number> {
        if (operand < 0x7F7F) return commandSuccess(operand);
        if (operand >= 0x7FBF && operand < 0x7FDF) return commandSuccess(this.globals[operand - 0x7FBF]);
        if (operand === 0x7F9B) return commandSuccess(this.taskBits);
        const entity = id === null ? null : this.getEntity(id);
        if (entity === null) return commandFailure(`Missing operand entity ${id}`, "invalid-reference");
        if (operand <= 0x7F81) return commandSuccess(entity.temporaries[operand - 0x7F7F]);
        if (operand === 0x7F94) return commandSuccess(entity.state);
        if (operand === 0x7F9F) return commandSuccess(entity.typeId);
        return commandFailure(`Unsupported state operand 0x${operand.toString(16)}`);
    }

    public evaluateCondition(target: CommandEntityId | null, payload: DataView): CommandResult<boolean> {
        const condition = payload.getUint8(0), predicate = condition & 0x3F;
        const entity = target === null ? null : this.getEntity(target);
        let result: boolean;
        if (predicate === 6) result = entity !== null;
        else if (predicate >= 17 && predicate <= 21) {
            const left = this.readOperand(target, payload.getInt16(2)), right = this.readOperand(target, payload.getInt16(4));
            if (!left.ok) return left; if (!right.ok) return right;
            result = predicate === 17 ? left.value < right.value : predicate === 18 ? left.value <= right.value
                : predicate === 19 ? left.value === right.value : predicate === 20 ? left.value >= right.value : left.value > right.value;
        } else if (predicate === 22) {
            if (entity === null) return commandFailure("Type predicate has no live target", "invalid-reference");
            const mask = payload.getUint8(2), type = entity.typeId;
            result = !!(mask & 1 && type < 256 || mask & 4 && type >= 256 || mask & 8
                || mask & 16 && target === this.currentPlayer || mask & 32 && type === 256 + payload.getUint8(5)
                || mask & 64 && type === payload.getUint8(4));
        } else if (predicate === 4) {
            const mask = payload.getUint8(2);
            if (mask & 0x60) return commandFailure("Type-qualified contact predicates are not supported");
            if (entity === null) return commandFailure("Contact predicate has no live target", "invalid-reference");
            result = (entity.contactFlags & mask & 0x1F) !== 0;
        } else return commandFailure(`Unsupported predicate ${predicate}`);
        return commandSuccess(condition & 0x80 ? !result : result);
    }

    public writeVariable(target: CommandEntityId | null, field: number, value: number): CommandResult<void> {
        if (field >= 64 && field < 96) this.globals[field - 64] = value;
        else if (field === 28) this.taskBits = value | 0;
        else if (field === 21) return this.setState(target, value);
        else if (field >= 0 && field < 3) {
            const entity = target === null ? null : this.getEntity(target);
            if (entity === null) return commandFailure("Variable write has no live target", "invalid-reference");
            entity.temporaries[field] = value;
        } else return commandFailure(`Unsupported state destination ${field}`);
        return commandSuccess(undefined);
    }

    public playSound(target: CommandEntityId | null, payload: DataView): CommandResult<void> {
        if (this.audioPolicy !== "silent") return commandFailure("0x26 sound requires an explicit silent host policy");
        if (payload.getUint8(6) !== 0 && (target === null || this.getEntity(target)?.position == null))
            return commandFailure("Positional sound has no live position", "invalid-reference");
        return commandSuccess(undefined);
    }

    public get message(): CommandMessage | null { return this.pendingMessage; }
    public acknowledgeMessage(owner: CommandEntityId): void {
        if (this.pendingMessage?.owner === owner) this.messageAcknowledged = true;
    }
    public showMessage(owner: CommandEntityId, message: number, style: number): CommandResult<boolean> {
        if (!this.options.acknowledgedMessages?.has(message)) return commandFailure(`0x44 message ${message} requires an explicit acknowledgement policy`);
        if (this.pendingMessage === null) {
            this.pendingMessage = { owner, id: message, style }; this.messageAcknowledged = false;
        } else if (this.pendingMessage.owner === owner && this.pendingMessage.id === message && this.messageAcknowledged) {
            this.pendingMessage = null; this.messageAcknowledged = false; return commandSuccess(true);
        }
        return commandSuccess(false);
    }

    public setState(target: CommandEntityId | null, value: number): CommandResult<void> {
        const entity = target === null ? null : this.getEntity(target);
        if (entity === null) return commandFailure("State write has no live target", "invalid-reference");
        entity.state = value & 65535;
        return commandSuccess(undefined);
    }

    public setRain(value: number): CommandResult<void> {
        this.rainCount = value & 65535;
        return commandSuccess(undefined);
    }

    public configureAudio(target: CommandEntityId | null, payload: Uint8Array): CommandResult<void> {
        if (this.audioPolicy !== "silent") return commandFailure("Audio configuration requires an explicit silent host policy");
        const entity = target === null ? null : this.getEntity(target);
        if (entity === null) return commandFailure("Audio configuration has no live target", "invalid-reference");
        entity.audioConfiguration = payload.slice(); entity.audioAge = 0;
        return commandSuccess(undefined);
    }
}
