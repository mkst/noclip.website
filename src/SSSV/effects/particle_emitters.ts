import { matchCommandRecords } from '../commands/command_admission.js';
import type { LevelObjectPlacement } from "../core/level.js";
import type { SSSVObjectData } from "../objects/objects.js";
import type { LevelCommand } from "../commands/paths.js";

export interface EmitterConfiguration {
    flags: number;
    particleId: number;
    frequency: number;
    size: number;
    argument: number;
    duration: number;
    offset: [number, number, number];
    spread: [number, number, number];
    direction: [number, number, number];
    directionSpread: [number, number, number];
    primaryColor: number;
    environmentColor: number;
}

export function createEmitterConfiguration(): EmitterConfiguration {
    return { flags: 0, particleId: 0, frequency: 0, size: 0, argument: 0, duration: 0, offset: [0, 0, 0], spread: [0, 0, 0],
        direction: [0, 0, 0], directionSpread: [0, 0, 0], primaryColor: 0, environmentColor: 0 };
}

export function getOrCreateEmitterConfiguration(emitters: Map<string, EmitterConfiguration>, target: string): EmitterConfiguration {
    let config = emitters.get(target);
    if (!config) { config = createEmitterConfiguration(); emitters.set(target, config); }
    return config;
}

export interface PersistentEmitter {
    placementIndex: number;
    placement: LevelObjectPlacement;
    scale: number;
    height: number;
    initial: EmitterConfiguration;
    provenance: EmitterProvenance;
}

export interface EmitterProvenance {
    placementIndex: number;
    initialEntry: number;
    target: { kind: "object"; index: number };
    commandIndices: number[];
    unsupportedReason: string | null;
}

export function packParticleColor(r: number, g: number, b: number): number {
    const color = ((r << 8) & 0xF800) | ((g << 3) & 0x7C0) | ((b >> 2) & 0x3E);
    return color === 0 ? 0 : color | 1;
}

const swampEmitterScript = [
    "0015a600fb0303030000", "006467884d0000000000", "001600bf030400010000", "00170009251621000000",
    "0006000b000000000000", "00480153000000000000", "000115007fd204b00003", "00460b6d6dcaca01000b",
    "00080003000000000000", "00090000000000000000",
];
const swampDistanceHelper = [
    "00000000000000000000", "00140009000000000000", "003d7f85006400005300", "003d7f86006400005400",
    "00140000000000000000", "003d7fd27f8500005320", "003d7fd37f8600005420", "00000000000000000000",
    "006553007fd200000000", "006554007fd300000000", "003d7fd27fd300005310", "00490000000000000000",
];

export function readPersistentEmitters(placements: readonly LevelObjectPlacement[], table: ReadonlyMap<number, SSSVObjectData>, commands: readonly LevelCommand[]): { emitters: PersistentEmitter[]; provenance: EmitterProvenance[] } {
    const emitters: PersistentEmitter[] = [], provenance: EmitterProvenance[] = [];
    placements.forEach((placement, placementIndex) => {
        if ((placement.id !== 64 && placement.id !== 106) || placement.commandReferenceIdx <= 0)
            return;
        const base = placement.commandReferenceIdx - 1, entry = base + placement.commandsLength;
        const source: EmitterProvenance = { placementIndex, initialEntry: entry, target: { kind: "object", index: placementIndex }, commandIndices: [], unsupportedReason: null };
        provenance.push(source);
        let swampHelper: number | null = null;
        if (placement.id === 106) {
            const call = commands[base + 5];
            if (placement.commandsLength === 0 && call !== undefined && matchCommandRecords(commands, { base, records: swampEmitterScript, source: 'raw' }).matched) {
                const helper = call.payload.createDataView().getUint16(0);
                if (matchCommandRecords(commands, { base: helper, records: swampDistanceHelper, source: 'raw' }).matched) swampHelper = helper;
            }
            if (swampHelper === null) { source.unsupportedReason = "unrecognised Swamp emitter loop or distance helper"; return; }
        }
        const config = createEmitterConfiguration();
        let offsets = false, direction = false, particle = false, colors = false, audio = false;
        for (let cursor = placement.commandsLength; cursor <= 0xFF; cursor++) {
            const command = commands[base + cursor];
            if (command === undefined) { source.unsupportedReason = "truncated script"; return; }
            source.commandIndices.push(command.index);
            const v = command.payload.createDataView();
            // The audited loop only waits, measures player distance and controls sound.
            // Jump cursor 3 advances to cursor 4, so it never reconfigures the emitter.
            if (swampHelper !== null && cursor >= 4 && cursor <= 8) continue;
            if (command.opcode === 0x15 && !offsets && !particle && !audio && v.getUint16(6) === 0) {
                config.offset = [v.getInt8(0), v.getInt8(1), v.getInt8(2)];
                config.spread = [v.getUint8(3), v.getUint8(4), v.getUint8(5)];
                offsets = true;
            } else if (command.opcode === 0x16 && offsets && !direction && !particle && v.getUint16(6) === 0) {
                config.direction = [v.getUint8(0), v.getUint8(1), v.getUint8(2)];
                config.directionSpread = [v.getUint8(3), v.getUint8(4), v.getUint8(5)];
                direction = true;
            } else if (command.opcode === 0x64 && offsets && !colors && !audio && v.getUint16(6) === 0) {
                config.primaryColor = packParticleColor(v.getUint8(0), v.getUint8(1), v.getUint8(2));
                config.environmentColor = packParticleColor(v.getUint8(3), v.getUint8(4), v.getUint8(5));
                colors = true;
            } else if (command.opcode === 0x17 && offsets && !particle) {
                config.flags = v.getUint16(0); config.particleId = v.getUint8(2);
                config.frequency = (v.getInt8(3) - 20) << 24 >> 24; config.size = v.getUint8(4);
                config.argument = v.getUint8(5); config.duration = v.getUint16(6);
                if ((config.flags !== 9 && config.flags !== 0xE9) || (config.particleId !== 122 && config.particleId !== 24 && !(config.particleId === 37 && swampHelper !== null)) || config.duration !== 0 || (config.particleId === 122 && config.size === 0)) {
                    source.unsupportedReason = "unsupported particle, flags, duration or wrapper size"; return;
                }
                particle = true;
            } else if (command.opcode === 0x46 && particle && !audio && v.getUint32(0) === 0x0B96FF7F && v.getUint32(4) === 0x7F01FFFF) {
                // This exact sound setup returns immediately and does not change particle state.
                audio = true;
            } else if (command.opcode === 9 && particle && v.getUint32(0) === 0 && v.getUint32(4) === 0) {
                const object = table.get(placement.id);
                if (object === undefined) { source.unsupportedReason = "missing object definition"; return; }
                const scale = object.scaleOverride || placement.scale || 2048;
                if (config.particleId === 122 && (config.flags & 0x80) && Math.floor(config.size * scale / 2048) === 0) {
                    source.unsupportedReason = "scaled wrapper size is zero"; return;
                }
                if (swampHelper !== null) source.commandIndices.push(...swampDistanceHelper.map((_, i) => swampHelper! + i));
                emitters.push({ placementIndex, placement: { ...placement }, scale, height: Math.floor(object.collideHeight * scale / 2048), initial: config, provenance: source });
                return;
            } else {
                source.unsupportedReason = `unsupported command or setup order: 0x${command.opcode.toString(16)}`;
                return;
            }
        }
        source.unsupportedReason = "script has no terminal stop";
    });
    return { emitters, provenance };
}

export function persistentEmissionCount(config: Pick<EmitterConfiguration, "flags" | "frequency">, tick: number): number {
    if (tick < 1 || !(config.flags & 1)) return 0;
    if (!(config.flags & 8)) return 1;
    if (config.frequency >= 0) return (tick - 1) % (config.frequency + 1) === 0 ? 1 : 0;
    // The loop increments the newly reset negative counter, producing alternating counts.
    return tick % 2 === 1 ? 1 : Math.max(1, -config.frequency - 1);
}
