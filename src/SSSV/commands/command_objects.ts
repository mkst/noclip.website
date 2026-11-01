import { commandFailure, commandSuccess } from "./command_vm.js";
import type { CommandEntityId, CommandResult } from "./command_vm.js";
import { CommandWorld } from "./command_world.js";
import { cos256, sinDegrees } from "../core/degree_math.js";
import type { LevelObjectPlacement } from "../core/level.js";
import type { SSSVObjectData } from "../objects/objects.js";

interface LinearMovement { start: number[]; target: number[]; progress: number; speed: number; mode: 1 | 2; }
export interface CommandObject {
    readonly id: CommandEntityId;
    readonly typeId: number;
    readonly fixedPosition: Int32Array;
    readonly velocity: Int32Array;
    scale: number;
    material: number;
    flags: number;
    physicsFlags: number;
    angle: number;
    zRotation: number;
    zPerTick: number;
    yPerTick: number;
    movement: LinearMovement | null;
}
const s16 = (v: number) => (v << 16) >> 16;
const normalize = (v: number) => (v % 360 + 360) % 360;

// Direct-update objects only (func_802FB270). Physics/callback-driven objects
// need additional capabilities before they can enter this host.
export interface CommandObjectPolicy {
    silentCallbacks?: ReadonlySet<number>;
    secondaryList?: boolean;
    initialPhysicsTypes?: ReadonlySet<number>;
    materials?: ReadonlyMap<number, ReadonlySet<number>>;
}

export class CommandObjectWorld extends CommandWorld {
    public readonly objects = new Map<CommandEntityId, CommandObject>();
    constructor(private readonly catalog: ReadonlyMap<number, SSSVObjectData>, private readonly waterHeight: (x: number, z: number) => number | null,
        private readonly capacity: number, private readonly policy: CommandObjectPolicy = {}) { super([], "silent"); }

    public createObject(id: string, p: LevelObjectPlacement): CommandResult<CommandObject> {
        const definition = this.catalog.get(p.id);
        if (!definition || definition.updateCallback !== 0 && !this.policy.silentCallbacks?.has(definition.updateCallback!) || definition.behaviorFlags === undefined
            || (definition.behaviorFlags & 0x0C) !== 0 && !this.policy.initialPhysicsTypes?.has(p.id)
            || !(definition.behaviorFlags & 0x40) && !this.policy.secondaryList)
            return commandFailure(`Object ${p.id} requires physics or an unsupported update callback`);
        if (this.objects.size >= this.capacity || this.objects.has(id)) return commandFailure("Command object capacity exceeded", "invalid-data");
        this.addEntity({ id, typeId: p.id, position: { x: s16(p.x), y: s16(p.y), z: s16(p.z) } });
        const object: CommandObject = { id, typeId: p.id, fixedPosition: Int32Array.from([p.x << 16, p.y << 16, p.z << 16]), velocity: new Int32Array(3),
            scale: definition.scaleOverride || p.scale || 2048, material: p.unkC, flags: 0, physicsFlags: definition.behaviorFlags & 0x1C, angle: p.angle, zRotation: p.zRotation, zPerTick: 0, yPerTick: 0, movement: null };
        this.objects.set(id, object); return commandSuccess(object);
    }

    public override deleteEntity(id: string): void { super.deleteEntity(id); this.objects.delete(id); }

    public integrate(id: string): void {
        const o = this.objects.get(id)!, p = this.getEntity(id)!.position!;
        if (o.physicsFlags & 12) throw new Error(`Physics required for command object ${id}`);
        for (let i = 0; i < 3; i++) o.fixedPosition[i] += o.velocity[i];
        // Game-state reads and subsequent relative moves use the signed high word.
        p.x = o.fixedPosition[0] >> 16; p.y = o.fixedPosition[1] >> 16; p.z = o.fixedPosition[2] >> 16;
    }

    public advanceController(id: string): void {
        const o = this.objects.get(id)!, movement = o.movement;
        if (movement !== null) {
            if (movement.progress >= 256) { o.movement = null; o.velocity.fill(0); }
            else if (this.getEntity(id)!.state === 0) o.velocity.fill(0);
            else {
                movement.progress = movement.mode === 1 ? movement.progress + movement.speed : Math.min(256, movement.progress + movement.speed);
                let cosine = movement.progress >= 256 ? -32768 : cos256(movement.progress >> 1);
                if (movement.mode === 1 && (movement.progress & 1)) cosine = (cosine + cos256((movement.progress >> 1) + 1)) >> 1;
                for (let i = 0; i < 3; i++) {
                    const half = (movement.target[i] - movement.start[i]) >> 1;
                    const next = movement.mode === 2 ? (movement.start[i] << 16) + (((movement.target[i] - movement.start[i]) * movement.progress) << 8)
                        : ((movement.start[i] + half) << 16) - half * 2 * cosine;
                    o.velocity[i] = next - o.fixedPosition[i];
                }
            }
        }
        o.angle = s16(o.angle + o.yPerTick) % 360;
        o.zRotation = s16(o.zRotation + o.zPerTick) % 360;
    }

    public override evaluateCondition(target: string | null, payload: DataView): CommandResult<boolean> {
        const predicate = payload.getUint8(0) & 0x3F;
        if (predicate !== 1 && predicate !== 5) return super.evaluateCondition(target, payload);
        const object = target === null ? undefined : this.objects.get(target);
        if (!object) return commandFailure("Object condition has no supported target", "invalid-reference");
        let value = object.movement === null;
        if (predicate === 1) {
            const p = this.getEntity(object.id)!.position!, water = this.waterHeight(p.x, p.z);
            if (water === null) return commandFailure("Water predicate is outside the loaded collision map");
            // Direct integration preserves spawn_object's AIRBORNE state. There is
            // no swim/sink/fly/drift state transition for these admitted objects.
            value = p.y < water;
        }
        return commandSuccess(payload.getUint8(0) & 0x80 ? !value : value);
    }

    public override readOperand(target: string | null, operand: number): CommandResult<number> {
        if (operand === 0x7F90) {
            const o = target === null ? undefined : this.objects.get(target);
            return o ? commandSuccess((o.flags & 0x18) >> 3) : commandFailure("Missing flags target", "invalid-reference");
        }
        return super.readOperand(target, operand);
    }

    public override writeVariable(target: string | null, field: number, value: number): CommandResult<void> {
        if (field !== 17) return super.writeVariable(target, field, value);
        const o = target === null ? undefined : this.objects.get(target);
        if (!o) return commandFailure("Missing flags target", "invalid-reference");
        o.flags = (o.flags & ~0xD8) | (value & 1 ? 0 : 8) | (value & 2 ? 16 : 0) | (value & 4 ? 64 : 0) | (value & 8 ? 128 : 0);
        return commandSuccess(undefined);
    }

    public executeObjectCommand(owner: string, target: string | null, opcode: number, p: DataView): CommandResult<void> {
        const o = target === null ? undefined : this.objects.get(target);
        if (!o) return commandFailure("Object command has no supported target", "invalid-reference");
        if (opcode === 0x10) {
            if (p.getUint8(6) !== 0) return commandFailure("Relative spawn velocity is not supported");
            const yaw = normalize(o.angle + ((p.getInt8(4) * 360) >> 8)), tilt = normalize(o.zRotation + ((p.getInt8(5) * 360) >> 8));
            const x = (p.getInt8(1) * o.scale) >> 11, y = (p.getInt8(2) * o.scale) >> 11, z = (p.getInt8(3) * o.scale) >> 11;
            const a = (y * sinDegrees(tilt + 90) - z * sinDegrees(tilt)) >> 8;
            const position = this.getEntity(o.id)!.position!, issuer = this.getEntity(owner);
            if (!issuer) return commandFailure("Missing spawn issuer", "invalid-reference");
            const id = `${owner}/spawn:${this.objects.size}`;
            const result = this.createObject(id, { id: p.getUint8(0), x: position.x + ((x * sinDegrees(yaw + 90) + a * sinDegrees(yaw)) >> 8),
                z: position.z + ((-x * sinDegrees(yaw) + a * sinDegrees(yaw + 90)) >> 8), y: position.y + ((y * sinDegrees(tilt) + z * sinDegrees(tilt + 90)) >> 8),
                angle: yaw, zRotation: tilt, scale: 2048, unkC: 0, commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 });
            if (!result.ok) return result;
            issuer.references.set(7, id);
        } else if (opcode === 0x57) {
            const flags = p.getInt16(0);
            if (flags & 6) return commandFailure("Physics-enabled object flags require a physics host");
            o.physicsFlags = (o.physicsFlags & ~0x1C) | (flags & 1 ? 0x10 : 0);
        } else if (opcode === 0x36) o.scale = p.getUint16(0) || 2048;
        else if (opcode === 0x33) {
            const value = this.readOperand(target, p.getUint16(0));
            if (!value.ok) return value;
            const material = value.value & 65535;
            const allowed = this.policy.materials?.get(o.typeId);
            if (allowed !== undefined && !allowed.has(material)) return commandFailure(`Unsupported material ${material} for object ${o.typeId}`);
            o.material = material;
        } else if (opcode === 0x19 || opcode === 0x1B || opcode === 0x1C || opcode === 0x32) {
            const offsets = opcode !== 0x32 ? [0, 4, 2, 6] : [2, 6];
            const values: number[] = [];
            for (const offset of offsets) {
                const value = opcode === 0x19 ? commandSuccess(p.getInt16(offset)) : this.readOperand(target, p.getInt16(offset));
                if (!value.ok) return value;
                values.push(value.value);
            }
            if (opcode !== 0x32) {
                const speed = s16(values[3]);
                if (speed < 1 || speed > 256) return commandFailure(`Unsupported linear movement step ${speed}`);
                const start = Array.from(o.fixedPosition, v => v >> 16);
                o.movement = { start, target: start.map((v, i) => s16((opcode === 0x19 ? 0 : v) + values[i])), speed, progress: 0, mode: opcode === 0x1C ? 2 : 1 };
            } else {
                const definition = this.catalog.get(o.typeId)!;
                if (p.getUint8(0) !== 0x10 || (values[0] !== 0 && definition.orientationMode === 4 && definition.collideHeight !== definition.width * 2))
                    return commandFailure("Rotation requires unsupported mode or collision-height adjustment");
                o.zPerTick = s16(values[0]); o.yPerTick = s16(values[1]);
            }
        } else return commandFailure(`Unsupported object opcode ${opcode}`);
        return commandSuccess(undefined);
    }
}
