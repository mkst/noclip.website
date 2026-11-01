import { matchCommandRecords } from '../commands/command_admission.js';
import { SceneTickClock } from "../core/timing.js";
import { commandSuccess, CommandTickBudget, CommandVM } from "../commands/command_vm.js";
import type { CommandResult } from "../commands/command_vm.js";
import { CommandObjectWorld } from "../commands/command_objects.js";
import type { LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";
import type { SSSVObjectData } from "./objects.js";
import type { SSSVDrawCall } from "../render/terrain.js";
import { readObjectRotation } from "./object_rotation.js";
import { readComputerIdleAnimation, readObjectTextureAnimation } from "./object_texture_animation.js";
import { createLiveObjectTransform, ObjectTranslationBinding, updateLiveObjectPose } from "./object_visuals.js";

export interface ObjectProgram {
    placementIndex: number;
    placement: LevelObjectPlacement;
    kind: "material" | "rotation" | "motion" | "autonomous-motion";
    materials?: readonly number[];
}
function matches(placement: LevelObjectPlacement, commands: readonly LevelCommand[], records: readonly string[]): boolean {
    if (placement.commandReferenceIdx <= 0 || placement.commandsLength !== 0) return false;
    return matchCommandRecords(commands, { base: placement.commandReferenceIdx - 1, records, source: 'decoded' }).matched;
}
const swampMotion = ['00570000000000000000', '001b0000000000140006', '0003050000000016ffff',
    '001b00000000ffec0006', '0003050000000016ffff', '00080000000000000000'];

function readMaterialProgram(placement: LevelObjectPlacement, placementIndex: number, definition: SSSVObjectData,
    commands: readonly LevelCommand[], drawCalls: readonly SSSVDrawCall[]): number[] | null {
    if (definition.renderMode !== 6 || definition.updateCallback !== 0 || definition.shadowType !== 0 || placement.unk12 !== 0
        || definition.behaviorFlags === undefined || !(definition.behaviorFlags & 0x40) || (definition.behaviorFlags & ~0x42) !== 0)
        return null;
    const animation = readObjectTextureAnimation(placement, commands);
    if (animation === null) return null;
    const materials = new Set([placement.unkC]);
    const indices = animation.commandIndices, jump = commands[indices[indices.length - 1]].payload.createDataView();
    const loopIndex = placement.commandReferenceIdx - 1 + jump.getUint16(0) + 1;
    let uninterrupted = 0;
    // Include the loop boundary and the delay's release instruction in the VM's 128-instruction budget.
    for (const index of [...indices, ...indices.slice(indices.indexOf(loopIndex))]) {
        const command = commands[index], payload = command.payload.createDataView();
        if (++uninterrupted > 128) return null;
        if (command.opcode === 0x06 && payload.getUint16(0) > 0) uninterrupted = 1;
        if (command.opcode === 0x33) materials.add(payload.getUint16(0));
    }
    const bindings = drawCalls.filter(call => call.objectPlacementIndex === placementIndex && call.animationTextureIndices !== null);
    // Prepared animation bindings prove that context textures were loaded and can be selected by this mesh.
    if (bindings.length === 0 || bindings.some(call => [...materials].some(material => !call.animationTextureIndices!.includes(material))))
        return null;
    return [...materials].sort((a, b) => a - b);
}

function readAutonomousMotion(placement: LevelObjectPlacement, definition: SSSVObjectData, commands: readonly LevelCommand[]): boolean {
    if (definition.renderMode !== 6 || definition.updateCallback !== 0 || definition.shadowType !== 0 || placement.unk12 !== 0
        || definition.behaviorFlags === undefined || (definition.behaviorFlags & ~0x42) !== 0 || placement.zRotation !== 0
        || !Number.isSafeInteger(placement.commandReferenceIdx) || placement.commandReferenceIdx <= 0
        || !Number.isInteger(placement.commandsLength) || placement.commandsLength < 0 || placement.commandsLength > 251)
        return false;
    const start = placement.commandReferenceIdx - 1 + placement.commandsLength;
    const records = commands.slice(start, start + 5);
    if (records.length !== 5 || records.some(c => c.payload.byteLength !== 8)
        || records[0].opcode !== 0x1B || records[2].opcode !== 0x1B
        || [records[1], records[3]].some(c => c.opcode !== 3 || c.payload.createDataView().getUint8(0) !== 5)
        || records[4].opcode !== 8) return false;
    const a = records[0].payload.createDataView(), b = records[2].payload.createDataView(), jump = records[4].payload.createDataView();
    if (((jump.getInt16(0) + 1) & 255) !== placement.commandsLength || jump.getUint16(2) !== 0 || jump.getUint32(4) !== 0
        || [a, b].some(p => {
            const speed = p.getInt16(6);
            // Odd terminal phases interpolate the endpoint instead of landing exactly on it.
            return speed < 1 || speed > 256 || (Math.ceil(256 / speed) * speed & 1) !== 0;
        })) return false;
    let moving = false;
    for (const [offset, origin] of [[0, placement.x], [2, placement.z], [4, placement.y]]) {
        const delta = a.getInt16(offset);
        // Mode-1 easing halves integer displacements; even closed trips avoid endpoint drift.
        if (!Number.isInteger(origin) || origin < -32768 || origin > 32767
            || delta >= 0x7F7F || (delta & 1) || b.getInt16(offset) !== -delta
            || b.getInt16(offset) >= 0x7F7F || origin + delta < -32768 || origin + delta > 32767) return false;
        moving ||= delta !== 0;
    }
    return moving;
}

function translationReady(call: SSSVDrawCall): boolean {
    return call.indexCount > 0 && call.objectRotation === null && call.objectPathMotion === null && call.objectPathShadowMotion === null
        && call.objectShadowMotion === null && call.leverHandle === null && call.gravitySwitch === null && call.floorButton === null
        && (call.modelMatrix === null || call.objectMotion !== null);
}

export function readObjectPrograms(placements: readonly LevelObjectPlacement[], commands: readonly LevelCommand[], table: ReadonlyMap<number, SSSVObjectData>, drawCalls: readonly SSSVDrawCall[]): ObjectProgram[] {
    const result: ObjectProgram[] = [];
    for (const [placementIndex, placement] of placements.entries()) {
        const d = table.get(placement.id);
        if (!d || d.behaviorFlags === undefined || d.scaleOverride !== 0) continue;
        let kind: ObjectProgram['kind'];
        const computer = readComputerIdleAnimation(placement, commands, d);
        const materials = computer?.textureIndices ?? readMaterialProgram(placement, placementIndex, d, commands, drawCalls);
        if (materials !== null) kind = 'material';
        else if ([116, 141, 212, 91].includes(placement.id) && d.shadowType === 0 && [6, 15].includes(d.renderMode)
            && (d.behaviorFlags & 12) === 0 && (d.updateCallback === 0 || placement.id === 141 && d.updateCallback === 0x802FF540)
            && readObjectRotation(placement, commands) !== null) {
            const rotation = readObjectRotation(placement, commands)!;
            if (rotation.zPerTick !== 0 && d.orientationMode === 4 && d.collideHeight !== d.width * 2) continue;
            kind = 'rotation';
        } else if (placement.id === 27 && d.renderMode === 6 && d.shadowType === 0 && d.behaviorFlags === 0x9E
            && d.updateCallback === 0 && matches(placement, commands, swampMotion)) kind = 'motion';
        else if (readAutonomousMotion(placement, d, commands)) {
            const calls = drawCalls.filter(c => c.objectPlacementIndex === placementIndex);
            if (calls.length === 0 || !calls.every(translationReady)) continue;
            kind = 'autonomous-motion';
        } else continue;
        result.push({ placementIndex, placement: { ...placement }, kind, materials: kind === 'material' ? materials! : undefined });
    }
    return result;
}

class ObjectProgramWorld extends CommandObjectWorld {
    public override evaluateCondition(target: string | null, payload: DataView): CommandResult<boolean> {
        if (target !== null && this.objects.get(target)?.typeId === 107
            && payload.getUint32(0) === 0x04004000 && payload.getUint32(4) === 0x12000009)
            return commandSuccess(false);
        return super.evaluateCondition(target, payload);
    }
}

interface ProgramEntry { config: ObjectProgram; vm: CommandVM; tick: number; calls: SSSVDrawCall[]; }
export class ObjectCommandRuntime {
    public world!: CommandObjectWorld;
    public entries: ProgramEntry[] = [];
    public motionEnabled = true;
    public autonomousEnabled = true;
    private readonly clock = new SceneTickClock();
    private sceneTick = 0;
    private readonly translations = new Map<number, ObjectTranslationBinding[]>();

    constructor(public readonly configs: readonly ObjectProgram[], private readonly commands: readonly LevelCommand[], private readonly table: ReadonlyMap<number, SSSVObjectData>, private readonly drawCalls: readonly SSSVDrawCall[]) {
        for (const config of configs) if (config.kind === 'autonomous-motion')
            this.translations.set(config.placementIndex, drawCalls.filter(c => c.objectPlacementIndex === config.placementIndex)
                .map(call => new ObjectTranslationBinding(call, config.placement)));
        this.reset();
    }
    public reset(): void {
        const materials = new Map<number, Set<number>>();
        for (const config of this.configs) if (config.materials !== undefined) {
            const allowed = materials.get(config.placement.id) ?? new Set<number>();
            for (const material of config.materials) allowed.add(material);
            materials.set(config.placement.id, allowed);
        }
        this.world = new ObjectProgramWorld(this.table, () => null, this.configs.length, {
            secondaryList: true, silentCallbacks: new Set([0x802FF540]), initialPhysicsTypes: new Set([27]), materials,
        });
        this.entries = this.configs.map(config => {
            const owner = `object:${config.placementIndex}`, created = this.world.createObject(owner, config.placement);
            if (!created.ok) throw new Error(created.reason);
            const vm = new CommandVM({ owner, commands: this.commands, scriptBase: config.placement.commandReferenceIdx - 1,
                initialCursor: config.placement.commandsLength, traceCapacity: 64 }, this.world);
            const calls = this.drawCalls.filter(c => c.objectPlacementIndex === config.placementIndex && (config.kind === 'material'
                ? c.commandTextureFrame !== null || c.animationTextureIndices !== null
                : config.kind === 'autonomous-motion' || c.objectRotation !== null || c.objectMotion !== null));
            for (const call of calls) {
                if (config.kind === 'material') {
                    call.animationTextureIndices = [...config.materials!];
                    call.animationFrameRate = 0; call.animationLoopStartFrame = 0; call.commandTextureFrame = 0;
                } else if (config.kind !== 'autonomous-motion') {
                    const transform = call.objectRotation ?? call.objectMotion!;
                    call.objectRotation = createLiveObjectTransform(config.placement, transform);
                    call.objectMotion = null;
                }
            }
            return { config, vm, calls, tick: 0 };
        });
        this.clock.reset();
        // Preserve the authored startup pose while the initial setup clears physics
        // flags. This retains the existing Swamp pilot's no-physics preview policy.
        for (const entry of [...this.entries].reverse())
            if (entry.config.kind !== 'autonomous-motion' || this.autonomousEnabled) this.step(entry, false, new CommandTickBudget(128));
        this.updateVisuals();
    }
    public setAutonomousEnabled(enabled: boolean): void {
        if (this.autonomousEnabled === enabled) return;
        this.autonomousEnabled = enabled;
        for (const entry of this.entries) if (entry.config.kind === 'autonomous-motion') {
            const id = `object:${entry.config.placementIndex}`;
            this.world.deleteEntity(id);
            const created = this.world.createObject(id, entry.config.placement);
            if (!created.ok) throw new Error(created.reason);
            entry.vm.reset(); entry.tick = 0;
            if (enabled) this.step(entry, false, new CommandTickBudget(128));
        }
        this.updateVisuals();
    }
    private step(entry: ProgramEntry, integrate: boolean, budget: CommandTickBudget): void {
        if (entry.vm.diagnostic !== null) return;
        const id = `object:${entry.config.placementIndex}`;
        if (integrate) this.world.integrate(id);
        entry.vm.step(entry.tick++, budget);
        if (entry.vm.diagnostic === null) this.world.advanceController(id);
    }
    public advanceTo(tick: number): void {
        this.sceneTick = tick;
        const advance = this.clock.advance(tick);
        if (advance.kind === 'initial') { this.updateVisuals(); return; }
        if (advance.kind === 'discontinuity') { this.reset(); this.clock.reset(tick); }
        else for (let n = 0; n < advance.ticks; n++) {
            const budget = new CommandTickBudget(4096);
            for (const entry of [...this.entries].reverse()) {
                if (entry.config.kind === 'autonomous-motion' && !this.autonomousEnabled) continue;
                if ((entry.config.kind === 'motion' || entry.config.kind === 'autonomous-motion') && !this.motionEnabled) continue;
                this.step(entry, true, budget);
            }
        }
        this.updateVisuals();
    }
    private updateVisuals(): void {
        for (const entry of this.entries) {
            const object = this.world.objects.get(`object:${entry.config.placementIndex}`)!;
            if (entry.config.kind === 'autonomous-motion') {
                for (const binding of this.translations.get(entry.config.placementIndex)!)
                    binding.update(this.autonomousEnabled && entry.vm.diagnostic === null ? object.fixedPosition : null, this.sceneTick);
                continue;
            }
            for (const call of entry.calls) {
                if (entry.config.kind === 'material') call.commandTextureFrame = entry.config.materials!.indexOf(object.material);
                else if (call.objectRotation !== null) updateLiveObjectPose(call.objectRotation, object);
            }
        }
    }
}
