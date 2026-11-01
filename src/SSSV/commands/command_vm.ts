import type { LevelCommand } from "./paths.js";

export type CommandEntityId = string;
export type CommandFailureKind = "unsupported" | "invalid-reference" | "invalid-data";
export type CommandResult<T> = { ok: true; value: T } | { ok: false; kind: CommandFailureKind; reason: string };

export function commandSuccess<T>(value: T): CommandResult<T> { return { ok: true, value }; }
export function commandFailure(reason: string, kind: CommandFailureKind = "unsupported"): CommandResult<never> {
    return { ok: false, kind, reason };
}

export interface CommandHost {
    executePathCommand?(target: CommandEntityId | null, opcode: number, payload: DataView): CommandResult<"wait" | "yield" | "continue">;
    assignReference?(owner: CommandEntityId, target: CommandEntityId | null, payload: DataView): CommandResult<void>;
    spawnAnimal?(owner: CommandEntityId, payload: DataView, commandIndex: number): CommandResult<boolean>;
    executeViewerCommand?(owner: CommandEntityId, target: CommandEntityId | null, opcode: number, payload: DataView): CommandResult<void>;
    assignProgram?(owner: CommandEntityId, target: CommandEntityId | null, scriptBase: number): CommandResult<void>;
    executeEffectCommand?(target: CommandEntityId | null, opcode: number, payload: DataView): CommandResult<void>;
    executeEmitterCommand?(target: CommandEntityId | null, opcode: number, payload: DataView): CommandResult<void>;
    executeObjectCommand?(owner: CommandEntityId, target: CommandEntityId | null, opcode: number, payload: DataView): CommandResult<void>;
    resolveReference(owner: CommandEntityId, selected: CommandEntityId | null, reference: number, region: number): CommandResult<CommandEntityId | null>;
    readOperand(entity: CommandEntityId | null, operand: number): CommandResult<number>;
    evaluateCondition(target: CommandEntityId | null, payload: DataView): CommandResult<boolean>;
    setState(target: CommandEntityId | null, value: number): CommandResult<void>;
    setRain(value: number): CommandResult<void>;
    writeVariable(target: CommandEntityId | null, field: number, value: number): CommandResult<void>;
    playSound(target: CommandEntityId | null, payload: DataView): CommandResult<void>;
    showMessage(owner: CommandEntityId, message: number, style: number): CommandResult<boolean>;
    configureAudio(target: CommandEntityId | null, payload: Uint8Array): CommandResult<void>;
}

export type CommandVMStatus = "running" | "waiting" | "stopped" | "unsupported" | "faulted";
export type CommandDiagnosticKind = CommandFailureKind | "invalid-data" | "instruction-budget" | "tick-discontinuity";

export interface CommandLocation {
    readonly owner: CommandEntityId;
    readonly target: CommandEntityId | null;
    readonly scriptBase: number;
    readonly cursor: number;
    readonly commandIndex: number;
    readonly opcode: number | null;
    readonly tick: number | null;
}

export interface CommandDiagnostic extends CommandLocation {
    readonly kind: CommandDiagnosticKind;
    readonly reason: string;
}

export interface CommandTrace extends CommandLocation {
    readonly payload: string;
    readonly result: CommandVMStatus | "continue";
    readonly reason: string | null;
}

export interface CommandVMConfig {
    owner: CommandEntityId;
    commands: readonly LevelCommand[];
    scriptBase: number;
    initialCursor?: number;
    maxInstructionsPerTick?: number;
    traceCapacity?: number;
}

// Pass one budget to all programs scheduled in a scene tick; the caller owns ordering.
export class CommandTickBudget {
    public remaining: number;

    constructor(limit: number) {
        if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("Invalid command tick budget");
        this.remaining = limit;
    }
}

interface DeferredCondition { payload: Uint8Array; commandIndex: number; }
interface SavedCommandContext { scriptBase: number; cursor: number; loopCounter: number; loopCursor: number; deferred: DeferredCondition[]; }

export function commandMath(left: number, operation: number, right: number): CommandResult<number> {
    left |= 0; right |= 0;
    if ((operation === 4 || operation === 7) && (right === 0 || left === -2147483648 && right === -1))
        return commandFailure("Invalid integer division/remainder", "invalid-data");
    switch (operation) {
    case 0: return commandSuccess(left);
    case 1: return commandSuccess((left + right) | 0);
    case 2: return commandSuccess((left - right) | 0);
    case 3: return commandSuccess(Math.imul(left, right));
    case 4: return commandSuccess(Math.trunc(left / right) | 0);
    case 5: return commandSuccess(left & right);
    case 6: return commandSuccess(left | right);
    case 7: return commandSuccess((left % right) | 0);
    case 8: return commandSuccess(left >> right);
    case 9: return commandSuccess(left << right);
    default: return commandFailure(`Unsupported math operation ${operation}`);
    }
}

type InstructionResult = { kind: "yield"; reason: string } | { kind: "continue"; cursor?: number } | { kind: "wait"; reason: string; cursor?: number } | { kind: "stop" }
    | { kind: "failure"; reason: string; diagnosticKind: CommandDiagnosticKind };

export class CommandVM {
    public status: CommandVMStatus = "running";
    public waitReason: string | null = null;
    public diagnostic: CommandDiagnostic | null = null;
    private cursor: number;
    private target: CommandEntityId | null;
    private targetReference = 0;
    private delayCounter = 0;
    private loopCounter = 0;
    private loopCursor = 0;
    private rewindCursor = 0;
    private deferred: DeferredCondition[] = [];
    private savedContext: SavedCommandContext | null = null;
    private instruction: { opcode: number; payload: Uint8Array } | null = null;
    private lastTick: number | null = null;
    private readonly owner: CommandEntityId;
    private readonly commands: readonly LevelCommand[];
    private scriptBase: number;
    private readonly initialScriptBase: number;
    private readonly initialCursor: number;
    private readonly maxInstructions: number;
    private readonly traceCapacity: number;
    private readonly traceEntries: CommandTrace[] = [];

    constructor(config: CommandVMConfig, private readonly host: CommandHost) {
        this.owner = config.owner;
        this.commands = config.commands;
        this.scriptBase = this.initialScriptBase = config.scriptBase;
        this.initialCursor = config.initialCursor ?? 0;
        this.maxInstructions = config.maxInstructionsPerTick ?? 128;
        this.traceCapacity = config.traceCapacity ?? 0;
        if (!Number.isSafeInteger(this.scriptBase) || this.scriptBase < 0
            || !Number.isInteger(this.initialCursor) || this.initialCursor < 0 || this.initialCursor > 255
            || !Number.isSafeInteger(this.maxInstructions) || this.maxInstructions < 1
            || !Number.isSafeInteger(this.traceCapacity) || this.traceCapacity < 0)
            throw new RangeError("Invalid command VM configuration");
        this.cursor = this.initialCursor;
        this.target = this.owner;
    }

    public get trace(): readonly CommandTrace[] { return this.traceEntries; }

    public get location(): CommandLocation {
        return { owner: this.owner, target: this.target, scriptBase: this.scriptBase, cursor: this.cursor,
            commandIndex: this.scriptBase + this.cursor, opcode: this.instruction?.opcode ?? this.commands[this.scriptBase + this.cursor]?.opcode ?? null, tick: this.lastTick };
    }

    // This resets execution only. The scene owns restoration of entities and global effects.
    public reset(): void {
        this.status = "running"; this.waitReason = null; this.diagnostic = null;
        this.cursor = this.initialCursor; this.target = this.owner; this.targetReference = 0;
        this.scriptBase = this.initialScriptBase;
        this.delayCounter = this.loopCounter = this.loopCursor = this.rewindCursor = 0;
        this.deferred = []; this.savedContext = null;
        this.instruction = null; this.lastTick = null;
        this.traceEntries.length = 0;
    }

    public stop(): void { this.status = "stopped"; this.waitReason = null; }

    private fail(kind: CommandDiagnosticKind, reason: string): void {
        this.status = kind === "unsupported" ? "unsupported" : "faulted";
        this.waitReason = null; this.diagnostic = { ...this.location, kind, reason };
    }

    public step(tick: number, sceneBudget?: CommandTickBudget): number {
        if (this.status !== "running" && this.status !== "waiting") return 0;
        if (!Number.isSafeInteger(tick) || tick < 0 || this.lastTick !== null && tick !== this.lastTick && tick !== this.lastTick + 1) {
            this.fail("tick-discontinuity", `Tick ${tick} does not follow ${this.lastTick}; advance one tick at a time or reset before seeking`); return 0;
        }
        if (tick === this.lastTick) return 0;
        this.lastTick = tick; this.status = "running"; this.waitReason = null;
        const owner = this.host.resolveReference(this.owner, this.target, 0, 0);
        if (!owner.ok) { this.fail(owner.kind, owner.reason); return 0; }
        if (owner.value === null) { this.fail("invalid-reference", "Script owner is not live"); return 0; }
        if (this.targetReference === 9) {
            const target = this.host.resolveReference(this.owner, this.target, 9, 0);
            if (!target.ok) { this.fail(target.kind, target.reason); return 0; }
            this.target = target.value;
        }
        let count = 0;
        const consumeBudget = (): boolean => {
            if (count >= this.maxInstructions || sceneBudget !== undefined && sceneBudget.remaining <= 0) {
                this.fail("instruction-budget", count >= this.maxInstructions ? "Program instruction budget exhausted" : "Scene instruction budget exhausted"); return false;
            }
            count++; if (sceneBudget !== undefined) sceneBudget.remaining--;
            return true;
        };
        for (const condition of this.deferred) {
            if (!consumeBudget()) return count;
            const p = new DataView(condition.payload.buffer);
            const target = this.host.resolveReference(this.owner, this.target, p.getUint8(1), 0);
            if (!target.ok) { this.fail(target.kind, `Deferred C${condition.commandIndex}: ${target.reason}`); return count; }
            const result = this.host.evaluateCondition(target.value, p);
            if (!result.ok) { this.fail(result.kind, `Deferred C${condition.commandIndex}: ${result.reason}`); return count; }
            if (result.value) {
                this.cursor = (p.getInt16(6) + 1) & 255;
                this.instruction = null; this.deferred = []; this.rewindCursor = 0;
                break;
            }
        }
        while (this.status === "running") {
            if (!consumeBudget()) break;
            if (this.instruction === null) {
                const command = this.commands[this.scriptBase + this.cursor];
                if (command === undefined || command.payload.byteLength !== 8) {
                    this.fail("invalid-data", "Command outside the bank or malformed payload"); break;
                }
                this.instruction = { opcode: command.opcode, payload: new Uint8Array(command.payload.copyToBuffer()) };
            }
            const location = this.location;
            const payload = this.traceCapacity > 0 ? Array.from(this.instruction.payload, b => b.toString(16).padStart(2, "0")).join("") : "";
            const result = this.execute(this.instruction.opcode, this.instruction.payload);
            if (result.kind === "continue") {
                // Both command cursor stores and the runner's increment are eight-bit.
                this.cursor = ((result.cursor ?? this.cursor) + 1) & 255;
                this.instruction = null;
            } else if (result.kind === "yield") {
                this.cursor = (this.cursor + 1) & 255; this.instruction = null;
                this.status = "waiting"; this.waitReason = result.reason;
            } else if (result.kind === "wait") {
                if (result.cursor !== undefined) { this.cursor = result.cursor; this.instruction = null; }
                this.status = "waiting"; this.waitReason = result.reason;
            } else if (result.kind === "stop") this.stop();
            else this.fail(result.diagnosticKind, result.reason);
            if (this.traceCapacity > 0) {
                this.traceEntries.push({ ...location, payload, result: result.kind === "continue" ? "continue" : this.status,
                    reason: this.diagnostic?.reason ?? this.waitReason });
                if (this.traceEntries.length > this.traceCapacity) this.traceEntries.shift();
            }
        }
        return count;
    }

    private execute(opcode: number, payload: Uint8Array): InstructionResult {
        const p = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const failed = (result: { kind: CommandFailureKind; reason: string }): InstructionResult => ({ kind: "failure", diagnosticKind: result.kind, reason: result.reason });
        switch (opcode) {
        case 0x00: return { kind: "continue" };
        case 0x01: {
            const condition = this.host.evaluateCondition(this.target, p);
            if (!condition.ok) return failed(condition);
            if (!(p.getUint8(0) & 0x40)) return condition.value ? { kind: "continue", cursor: p.getInt16(6) & 255 } : { kind: "continue" };
            if (condition.value) return { kind: "continue" };
            let cursor = this.cursor;
            for (let scan = 0; scan < 256; scan++) {
                const next = this.commands[this.scriptBase + cursor + 1];
                if (next === undefined) return { kind: "failure", diagnosticKind: "invalid-data", reason: "Conditional group leaves command bank" };
                if (next.opcode !== 0x01) return { kind: "continue", cursor };
                cursor = (cursor + 1) & 255;
            }
            return { kind: "failure", diagnosticKind: "instruction-budget", reason: "Conditional group scan exhausted" };
        }
        case 0x02:
            if (this.deferred.length === 4) return { kind: "failure", diagnosticKind: "invalid-data", reason: "Deferred condition capacity exceeded" };
            const copy = payload.slice(); copy[1] = this.targetReference;
            this.deferred.push({ payload: copy, commandIndex: this.scriptBase + this.cursor });
            return { kind: "continue" };
        case 0x03: {
            const condition = this.host.evaluateCondition(this.target, p);
            if (!condition.ok) return failed(condition);
            if (condition.value) {
                if (this.rewindCursor === 0 && (p.getUint8(0) & 0x40)) this.rewindCursor = (this.cursor + 1) & 255;
                else if (this.rewindCursor !== 0 && !(p.getUint8(0) & 0x40)) this.rewindCursor = 0;
                return { kind: "continue" };
            }
            return { kind: "wait", reason: "Condition not met", cursor: this.rewindCursor === 0 ? undefined : (this.rewindCursor - 1) & 255 };
        }
        case 0x04: {
            const count = this.host.readOperand(this.target, p.getInt16(0));
            if (!count.ok) return failed(count);
            this.loopCounter = (count.value << 16) >> 16; this.loopCursor = this.cursor;
            return { kind: "continue" };
        }
        case 0x05:
            this.loopCounter = ((this.loopCounter - 1) << 16) >> 16;
            return { kind: "continue", cursor: this.loopCounter > 0 ? this.loopCursor : this.cursor };
        case 0x06: {
            if (p.getInt16(0) !== -1) {
                // Unlike weather/audio operands, the source delay reads from the issuer.
                const value = this.host.readOperand(this.owner, p.getInt16(0));
                if (!value.ok) return failed(value);
                this.delayCounter = (value.value << 16) >> 16;
                p.setInt16(0, -1);
            }
            const previous = this.delayCounter;
            this.delayCounter = ((previous - 1) << 16) >> 16;
            return previous < 1 ? { kind: "continue" } : { kind: "wait", reason: `Delay (${previous} ticks remaining)` };
        }
        case 0x07: return { kind: "wait", reason: "Waiting for a deferred condition" };
        case 0x08: return { kind: "continue", cursor: p.getInt16(0) & 255 };
        case 0x09: return { kind: "stop" };
        case 0x0E: {
            const base = p.getUint16(0);
            if (this.commands[base] === undefined) return { kind: "failure", diagnosticKind: "invalid-data", reason: "Program handoff outside command bank" };
            if (this.target === this.owner) {
                this.scriptBase = base; this.deferred = []; this.loopCounter = this.loopCursor = this.delayCounter = 0;
                this.target = this.owner; this.targetReference = 0;
                return { kind: "continue", cursor: 255 };
            }
            const result = this.host.assignProgram?.(this.owner, this.target, base) ?? commandFailure("Foreign program assignment requires a scheduler");
            return result.ok ? { kind: "continue" } : failed(result);
        }
        case 0x13:
        case 0x18:
        case 0x31:
        case 0x47:
        case 0x5B: {
            const result = this.host.executeEffectCommand?.(this.target, opcode, p) ?? commandFailure(`Effect capability required for opcode 0x${opcode.toString(16)}`);
            if (!result.ok) return failed(result);
            return opcode === 0x13 && this.target === this.owner ? { kind: "wait", reason: "Owner removed" } : { kind: "continue" };
        }
        case 0x0F: {
            const result = this.host.setState(this.target, p.getUint16(0));
            return result.ok ? { kind: "continue" } : failed(result);
        }
        case 0x10:
        case 0x19:
        case 0x1B:
        case 0x1C:
        case 0x32:
        case 0x33:
        case 0x36:
        case 0x57: {
            const result = this.host.executeObjectCommand?.(this.owner, this.target, opcode, p)
                ?? commandFailure(`Object capability required for opcode 0x${opcode.toString(16)}`);
            return result.ok ? { kind: "continue" } : failed(result);
        }
        case 0x14: {
            const reference = p.getInt16(0);
            const result = this.host.resolveReference(this.owner, this.target, reference, p.getUint16(2));
            if (!result.ok) return failed(result);
            this.target = result.value; this.targetReference = reference & 255;
            return { kind: "continue" };
        }
        case 0x1D:
        case 0x34: {
            const result = this.host.executePathCommand?.(this.target, opcode, p) ?? commandFailure("Path capability required");
            if (!result.ok) return failed(result);
            return result.value === "wait" ? { kind: "wait", reason: "Approaching path start" }
                : result.value === "yield" ? { kind: "yield", reason: "Path started" } : { kind: "continue" };
        }
        case 0x56: {
            const result = this.host.assignReference?.(this.owner, this.target, p) ?? commandFailure("Reference assignment capability required");
            return result.ok ? { kind: "continue" } : failed(result);
        }
        case 0x60: {
            const result = this.host.spawnAnimal?.(this.owner, p, this.scriptBase + this.cursor) ?? commandFailure("Animal spawning capability required");
            if (!result.ok) return failed(result);
            return result.value ? { kind: "continue" } : { kind: "wait", reason: "Animal capacity unavailable" };
        }
        case 0x23:
        case 0x2A:
        case 0x4C:
        case 0x2E:
        case 0x39:
        case 0x42:
        case 0x43:
        case 0x4A:
        case 0x4D:
        case 0x53: {
            const result = this.host.executeViewerCommand?.(this.owner, this.target, opcode, p) ?? commandFailure(`Viewer capability required for opcode 0x${opcode.toString(16)}`);
            return result.ok ? { kind: "continue" } : failed(result);
        }
        case 0x15:
        case 0x16:
        case 0x17:
        case 0x64: {
            const result = this.host.executeEmitterCommand?.(this.target, opcode, p)
                ?? commandFailure(`Emitter capability required for opcode 0x${opcode.toString(16)}`);
            return result.ok ? { kind: "continue" } : failed(result);
        }
        case 0x65: {
            if (p.getUint8(1) !== 0) return { kind: "failure", diagnosticKind: "unsupported", reason: `Unsupported unary operation ${p.getUint8(1)}` };
            const operand = this.host.readOperand(this.target, p.getInt16(2));
            if (!operand.ok) return failed(operand);
            const result = this.host.writeVariable(this.target, p.getUint8(0), Math.abs(operand.value) | 0);
            return result.ok ? { kind: "continue" } : failed(result);
        }
        case 0x26: {
            const result = this.host.playSound(this.target, p);
            return result.ok ? { kind: "continue" } : failed(result);
        }
        case 0x3B:
            if (this.target !== this.owner) return { kind: "failure", diagnosticKind: "unsupported", reason: "Clearing another entity's deferred conditions is not supported" };
            this.deferred = []; return { kind: "continue" };
        case 0x3D: {
            const first = this.host.readOperand(this.target, p.getInt16(0));
            if (!first.ok) return failed(first);
            let value = first.value;
            if (p.getUint8(7) >>> 4) {
                const second = this.host.readOperand(this.target, p.getInt16(2));
                if (!second.ok) return failed(second);
                const result = commandMath(value, p.getUint8(7) >>> 4, second.value);
                if (!result.ok) return failed(result);
                value = result.value;
                if (p.getUint8(7) & 15) {
                    const third = this.host.readOperand(this.target, p.getInt16(4));
                    if (!third.ok) return failed(third);
                    const result = commandMath(value, p.getUint8(7) & 15, third.value);
                    if (!result.ok) return failed(result);
                    value = result.value;
                }
            }
            const result = this.host.writeVariable(this.target, p.getUint8(6), value);
            return result.ok ? { kind: "continue" } : failed(result);
        }
        case 0x44: {
            const result = this.host.showMessage(this.owner, p.getUint16(0), p.getUint16(2));
            if (!result.ok) return failed(result);
            return result.value ? { kind: "continue" } : { kind: "wait", reason: "Message acknowledgement" };
        }
        case 0x48: {
            if (this.savedContext !== null) return { kind: "failure", diagnosticKind: "unsupported", reason: "Nested calls overwrite the source's single saved context" };
            const base = p.getUint16(0);
            if (this.commands[base] === undefined) return { kind: "failure", diagnosticKind: "invalid-data", reason: "Call outside command bank" };
            this.savedContext = { scriptBase: this.scriptBase, cursor: this.cursor, loopCounter: this.loopCounter, loopCursor: this.loopCursor, deferred: this.deferred };
            this.scriptBase = base; this.loopCounter = this.loopCursor = 0; this.deferred = [];
            return { kind: "continue", cursor: 255 };
        }
        case 0x49: {
            const saved = this.savedContext;
            if (saved === null) return { kind: "failure", diagnosticKind: "invalid-data", reason: "Return without saved call context" };
            this.scriptBase = saved.scriptBase; this.loopCounter = saved.loopCounter; this.loopCursor = saved.loopCursor; this.deferred = saved.deferred;
            this.savedContext = null;
            // Source return restores loop/deferred state, but keeps the callee's target and delay counter.
            return { kind: "continue", cursor: saved.cursor };
        }
        case 0x29:
        case 0x46: {
            // Active assembly loads the weather operand unsigned, the audio operand signed.
            const value = this.host.readOperand(this.target, opcode === 0x29 ? p.getUint16(0) : p.getInt16(6));
            if (!value.ok) return failed(value);
            let result: CommandResult<void>;
            if (opcode === 0x29) result = this.host.setRain(value.value & 65535);
            else {
                const configuration = payload.slice();
                new DataView(configuration.buffer).setInt16(6, value.value);
                configuration[5] |= 4;
                result = this.host.configureAudio(this.target, configuration);
            }
            return result.ok ? { kind: "continue" } : failed(result);
        }
        default: return { kind: "failure", diagnosticKind: "unsupported", reason: `Unsupported opcode 0x${opcode.toString(16)}` };
        }
    }
}
