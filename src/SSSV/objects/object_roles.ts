import { matchCommandRecords } from '../commands/command_admission.js';
import type { LevelObjectPlacement } from "../core/level.js";
import type { LevelCommand } from "../commands/paths.js";
import type { SSSVObjectData } from "./objects.js";

export type ObjectRole = "contact-trigger" | "proximity-trigger" | "region-trigger" | "sound-source" | "controller" | "unresolved";
export const OBJECT_ROLE_NAMES: Record<ObjectRole, string> = {
    "contact-trigger": "Contact trigger", "proximity-trigger": "Proximity trigger", "region-trigger": "Region trigger",
    "sound-source": "Sound source", controller: "Controller", unresolved: "Role unresolved",
};
export interface ObjectScriptReference {
    activation: "initial" | "event";
    base: number;
    cursor: number;
    valid: boolean;
}
export interface ObjectRoleEvidence {
    role: ObjectRole;
    activation: "initial" | "event" | "callback";
    commandIndex: number | null;
    detail: string;
}
export interface ObjectRoleAnalysis {
    roles: ObjectRole[];
    references: ObjectScriptReference[];
    evidence: ObjectRoleEvidence[];
    diagnostics: string[];
}

// Audited X/Z player-distance helper, also used by the Swamp emitter reader.
const distanceHelper = [
    "00000000000000000000", "00140009000000000000", "003d7f85006400005300", "003d7f86006400005400",
    "00140000000000000000", "003d7fd27f8500005320", "003d7fd37f8600005420", "00000000000000000000",
    "006553007fd200000000", "006554007fd300000000", "003d7fd27fd300005310", "00490000000000000000",
];
function isDistanceHelper(commands: readonly LevelCommand[], base: number): boolean {
    return matchCommandRecords(commands, { base, records: distanceHelper, source: 'raw' }).matched;
}

const preserving = new Set([
    0x00, 0x06, 0x0B, 0x0C, 0x0D, 0x0F, 0x10, 0x12, 0x15, 0x16, 0x17, 0x18, 0x19,
    0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x27,
    0x28, 0x29, 0x2A, 0x2B, 0x2C, 0x2E, 0x2F, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35,
    0x36, 0x37, 0x39, 0x3A, 0x3B, 0x3C, 0x3E, 0x3F, 0x40, 0x41, 0x44, 0x47,
    0x4B, 0x4C, 0x4D, 0x4E, 0x4F, 0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x57, 0x58,
    0x59, 0x5A, 0x5B, 0x5C, 0x5D, 0x5E, 0x61, 0x62, 0x63, 0x64,
]);
interface ScriptPosition { base: number; cursor: number; }
interface State extends ScriptPosition { self: boolean; distance: number | null; saved: ScriptPosition | null; }

export function analyzeObjectRoles(placement: LevelObjectPlacement, entry: SSSVObjectData | undefined, commands: readonly LevelCommand[]): ObjectRoleAnalysis {
    const result: ObjectRoleAnalysis = { roles: [], references: [], evidence: [], diagnostics: [] };
    const add = (role: ObjectRole, activation: ObjectRoleEvidence["activation"], commandIndex: number | null, detail: string) => {
        if (!result.roles.includes(role)) result.roles.push(role);
        if (!result.evidence.some(e => e.role === role && e.activation === activation && e.commandIndex === commandIndex && e.detail === detail))
            result.evidence.push({ role, activation, commandIndex, detail });
    };
    const diagnose = (message: string) => { if (!result.diagnostics.includes(message)) result.diagnostics.push(message); };
    for (const [activation, reference, cursor] of [["initial", placement.commandReferenceIdx, placement.commandsLength & 255], ["event", placement.unk12, 0]] as const) {
        if (reference === 0) continue;
        const base = reference - 1;
        result.references.push({ activation, base, cursor, valid: commands[base + cursor] !== undefined });
    }
    if (entry?.updateCallback === 0x802FF540)
        add("sound-source", "callback", null, "Speaker callback 0x802FF540 controls distance-dependent audio volume and rumble");
    else if (entry?.updateCallback)
        diagnose(`Unclassified update callback 0x${entry.updateCallback.toString(16)}`);
    if (entry?.renderMode === 0 && result.references.some(r => r.valid))
        add("controller", "callback", null, "Nonvisual object with an attached command script");
    if (result.references.some(r => r.activation === "event" && r.valid) && [1, 3, 4, 5].includes(entry?.eventTrigger ?? -1))
        add("contact-trigger", "callback", null, `Object event mode ${entry!.eventTrigger} invokes its attached event commands on contact`);

    for (const reference of result.references) {
        if (!reference.valid) { diagnose(`${reference.activation} entry C${reference.base}+${reference.cursor} is outside the command bank`); continue; }
        const queue: State[] = [{ base: reference.base, cursor: reference.cursor, self: true, distance: null, saved: null }];
        const seen = new Set<string>();
        let steps = 0;
        while (queue.length !== 0 && steps++ < 512) {
            const state = queue.pop()!;
            const key = `${state.base}/${state.cursor}/${state.self}/${state.distance}/${state.saved?.base}/${state.saved?.cursor}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const index = state.base + state.cursor, c = commands[index];
            if (state.cursor < 0 || state.cursor > 255 || c === undefined) { diagnose(`Invalid script position C${index}`); continue; }
            const p = c.payload.createDataView();
            const next = (changes: Partial<State> = {}) => queue.push({ ...state, cursor: state.cursor + 1, ...changes });
            const evidence = (role: ObjectRole, detail: string) => add(role, reference.activation, index, detail);
            if (c.opcode === 0x09 || c.opcode === 0x07 || c.opcode === 0x0A) continue;
            if ([0x01, 0x02, 0x03].includes(c.opcode)) {
                const condition = p.getUint8(0) & 0x3F, flags = p.getUint8(2), inverted = (p.getUint8(0) & 0x80) !== 0;
                if (state.self) {
                    if (condition === 4 && (flags & 0x7F)) evidence("contact-trigger", `${inverted ? "Inverted " : ""}contact predicate, mask 0x${flags.toString(16)}`);
                    else if (condition === 0 && !(flags & 2) && (flags & 0x7D)) evidence("region-trigger", `Occupancy/player test for region ${p.getUint8(3)}`);
                    else if (condition === 16) evidence("region-trigger", `Owner position tested against region ${p.getUint8(3)}`);
                    else if (state.distance !== null && condition >= 17 && condition <= 21 &&
                        (p.getUint16(2) === 0x7FD2 && p.getUint16(4) < 0x7F7F || p.getUint16(4) === 0x7FD2 && p.getUint16(2) < 0x7F7F))
                        evidence("proximity-trigger", `Player X/Z distance from audited helper C${state.distance} compared against a literal threshold`);
                } else if ([0, 4, 16].includes(condition)) diagnose(`C${index} tests another or unresolved target`);
                if (c.opcode === 0x02 || p.getUint8(0) & 0x40) { diagnose(`Deferred/chained condition at C${index}; later flow not classified`); continue; }
                next();
                if (c.opcode === 0x01) next({ cursor: p.getInt16(6) + 1 });
            } else if (c.opcode === 0x08) next({ cursor: p.getInt16(0) + 1 });
            else if (c.opcode === 0x14) next({ self: p.getUint16(0) === 0 || p.getUint16(0) === 12 && state.self });
            else if (c.opcode === 0x48) {
                const base = p.getUint16(0);
                if (state.saved !== null) diagnose(`Nested call at C${index} overwrites saved script context`);
                else if (state.self && isDistanceHelper(commands, base)) { next({ distance: base }); }
                else queue.push({ ...state, base, cursor: 0, saved: { base: state.base, cursor: state.cursor + 1 } });
            } else if (c.opcode === 0x49) {
                if (state.saved === null) diagnose(`Return without a call at C${index}`);
                else queue.push({ ...state, ...state.saved, saved: null });
            } else if (c.opcode === 0x0E && state.self && state.saved === null) queue.push({ ...state, base: p.getUint16(0), cursor: 0, distance: null });
            else if (c.opcode === 0x26 || c.opcode === 0x46) {
                if (state.self && (c.opcode === 0x46 || p.getUint16(6) !== 0)) evidence("sound-source", c.opcode === 0x46 ? "Configures owner sound emitter" : "Requests sound at owner position");
                next();
            } else if (c.opcode === 0x3D || c.opcode === 0x65) {
                const destination = p.getUint8(c.opcode === 0x3D ? 6 : 0);
                if (destination === 16 || destination === 32) diagnose(`Dynamic target/type write at C${index}`);
                else next({ distance: null });
            } else if (preserving.has(c.opcode)) next();
            else diagnose(`Unsupported flow/opcode 0x${c.opcode.toString(16)} at C${index}`);
        }
        if (queue.length !== 0) diagnose("Script analysis limit reached");
    }
    if (result.roles.length === 0 || result.diagnostics.length !== 0)
        add("unresolved", "callback", null, result.diagnostics.length ? "Some script/callback behavior remains unclassified" : "No supported trigger, sound or controller evidence");
    const order: ObjectRole[] = ["contact-trigger", "proximity-trigger", "region-trigger", "sound-source", "controller", "unresolved"];
    result.roles.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return result;
}

export function describeObjectRoleReferences(analysis: ObjectRoleAnalysis): string {
    return analysis.references.map(r => `${r.activation === "initial" ? "init" : "event"} C${r.base}${r.cursor ? `+${r.cursor}` : ""}${r.valid ? "" : "?"}`).join(" · ");
}
