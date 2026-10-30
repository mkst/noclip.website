import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import { RSPSharedOutput } from "../../BanjoKazooie/f3dex.js";
import { ARRIVAL_SPARK_TEXTURE, ARRIVAL_TEXTURE_BASE, buildArrivalVisuals, EntranceArrival, findArrivalEntrance } from "../arrival.js";
import { MAP_X_POINTS, MAP_Z_POINTS, mirrorZ } from "../level.js";
import type { LevelMapEntry, LevelObjectPlacement } from "../level.js";
import { parseParticleDefinition } from "../particle_assets.js";
import { teleporterIsActive } from "../teleporters.js";

(globalThis as any).window = { debug: false };
const definition = parseParticleDefinition(ArrayBufferSlice.fromView(Buffer.from("205c080000c80000000000010001e73ee73e000000000000", "hex")));
const entrance: LevelObjectPlacement = { id: 55, x: 1291, z: 3230, y: 888, angle: 0, zRotation: 0, scale: 2048, unkC: 0, commandReferenceIdx: 0, commandsLength: 0, unk12: 0, unk15: 0 };
const map: LevelMapEntry[] = Array.from({ length: MAP_X_POINTS * MAP_Z_POINTS }, () => ({ unk0: 0, unk1: 0, unk2: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0, unk7: 0 }));
const create = () => new EntranceArrival(entrance, 7, definition, map);
const snapshot = (s: EntranceArrival) => ({ elapsed: s.elapsed, noise: s.noiseFrame, scroll: s.scroll, positions: Array.from(s.positions), particles: structuredClone(s.particles) });

test('arrival selects the last entrance as the source loader does', () => {
    equal(findArrivalEntrance([{ ...entrance, id: 56 }]), null);
    deepEqual(findArrivalEntrance([entrance, { ...entrance, x: 9 }, { ...entrance, id: 56 }]), { placement: { ...entrance, x: 9 }, index: 1 });
});

test('arrival beam boundaries, scroll and entrance shutdown follow the source counters', () => {
    const s = create(); s.advanceTo(999); equal(s.elapsed, 0); equal(s.entranceState, null);
    s.replay(100); s.advanceTo(101);
    equal(s.entranceState, 1); equal(s.beamVisible, true);
    deepEqual(Array.from(s.positions.slice(0, 3)), [entrance.x + 20, entrance.y, mirrorZ(entrance.z + 36)]);
    s.advanceTo(139); equal(s.scroll, 0);
    s.advanceTo(140); equal(s.scroll, 13);
    s.advanceTo(179); equal(s.scroll, 10);
    s.advanceTo(180); equal(s.scroll, 6);
    s.advanceTo(214); const scroll = s.scroll;
    s.advanceTo(219); equal(s.beamVisible, true); equal(s.scroll, scroll);
    s.advanceTo(220); equal(s.beamVisible, false); equal(s.entranceState, 1);
    s.advanceTo(249); equal(s.finished, false);
    s.advanceTo(250); equal(s.finished, true); equal(s.entranceState, 0);
    s.setEnabled(false, 250); equal(s.entranceState, null); equal(s.particles.length, 0);
});

test('arrival replay and seeking are deterministic, bounded and do not mutate the placement', () => {
    const s = create(), original = structuredClone(entrance);
    s.replay(0); s.advanceTo(119); const first = snapshot(s), revision = s.revision;
    s.advanceTo(119); equal(s.revision, revision); deepEqual(snapshot(s), first);
    s.advanceTo(40); s.advanceTo(119); deepEqual(snapshot(s), first);
    s.replay(500); s.advanceTo(619); deepEqual(snapshot(s), first);
    s.advanceTo(90000000); equal(s.elapsed, 351); equal(s.particles.length, 0);
    s.advanceTo(0); equal(s.elapsed, 0); equal(s.enabled, true);
    deepEqual(entrance, original);
});

test('sparks are rendered on the following tick and retain the source texture/alpha', () => {
    const s = create(); s.replay(0); s.advanceTo(111); equal(s.particles.length, 0);
    s.advanceTo(120); ok(s.particles.length > 0);
    ok(s.particles.every(p => p.id === 35 && p.texture0 === ARRIVAL_SPARK_TEXTURE && p.textureSize === 32 && p.primaryAlpha === 25));
});

test('arrival override restores resolved and unresolved startup states, with explicit active preview taking precedence', () => {
    for (const state of [null, 0, 1]) {
        const visual = { state, arrivalState: 1, previewActive: false, part: 'rim' as const, alpha: [255, 127] as [number, number] };
        equal(teleporterIsActive(visual), true);
        visual.arrivalState = 0; equal(teleporterIsActive(visual), false);
        visual.previewActive = true; equal(teleporterIsActive(visual), true);
        visual.previewActive = false; delete (visual as { arrivalState?: number }).arrivalState;
        equal(teleporterIsActive(visual), state === 1);
    }
});

test('arrival uses both source I4 textures, the I8 spark and exact seam topology', () => {
    const segment = new Uint8Array(0x2C290); segment.fill(0xA5, 0x6C60, 0x6E60); segment.fill(0x3C, 0x6E60, 0x7150); segment.fill(0x7F, 0x2AA10);
    const output = new RSPSharedOutput(), s = create();
    const visual = buildArrivalVisuals(output, s, ArrayBufferSlice.fromView(segment));
    equal(output.vertices.length, 72); equal(visual.draw.indexCount, 396); equal(visual.draw.visible, false);
    deepEqual(output.indices.slice(30, 36), [6, 0, 5, 6, 5, 11]);
    deepEqual(Array.from(output.textureCache.textures[ARRIVAL_TEXTURE_BASE].pixels.slice(0, 8)), [170,170,170,170,85,85,85,85]);
    deepEqual(Array.from(output.textureCache.textures[ARRIVAL_TEXTURE_BASE + 1].pixels.slice(0, 4)), [51,51,51,51]);
    deepEqual(Array.from(output.textureCache.textures[ARRIVAL_SPARK_TEXTURE].pixels.slice(0, 4)), [127,127,127,127]);
    equal(visual.draw.animationTextureIndices1!.length, 16); equal(visual.draw.textureOffsetT1, 0);
});


test('sparks use the submerged variant below water and reset completely when disabled', () => {
    const wet = map.map(p => ({ ...p, unk6: 400 }));
    const s = new EntranceArrival(entrance, 7, definition, wet);
    s.replay(0); s.advanceTo(120);
    ok(s.particles.length > 0); ok(s.particles.every(p => p.id === 109 && p.textureSize === 16));
    s.setEnabled(false, 120); equal(s.particles.length, 0);
    s.replay(120); s.advanceTo(121); equal(s.particles.length, 0);
});
