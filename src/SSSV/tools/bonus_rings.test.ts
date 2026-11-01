import { existsSync, readFileSync } from 'node:fs';
import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { RSPSharedOutput } from '../../BanjoKazooie/f3dex.js';
import { getLevelRegularTextureBank, BIOME_REGULAR_TEXTURES } from '../core/level_table.js';
import { parseRegularBank } from '../core/texture.js';
import AB from '../../ArrayBufferSlice.js';
import { parseLevelContainer } from '../core/level.js';
import { prepareLevel } from '../core/level_preparation.js';
import { BIOME_REGULAR_TEXTURE_ID_BASE, LEVEL_REGULAR_TEXTURE_ID_BASE, buildBillboards, installReflectionTextures, indexObjectTable, parseObjectTable } from '../objects/objects.js';
import { BonusRingRuntime, readBonusRings } from '../effects/bonus_rings.js';
import { BonusRingVisuals, BONUS_RING_TEXTURE, sampleBonusHoop } from '../effects/bonus_ring_renderer.js';

(globalThis as any).window = { debug: false };
const read = (p: string) => AB.fromView(readFileSync(p));
const available = existsSync('data/SSSV/levels/GIVE_A_DOG_A_BONUS.bin');
function fixture() {
    const level = prepareLevel(parseLevelContainer(read('data/SSSV/levels/GIVE_A_DOG_A_BONUS.bin')), 'GIVE_A_DOG_A_BONUS');
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    const config = readBonusRings(level.objectPlacements, table, level.commands);
    ok(config);
    return { level, table, config, runtime: new BonusRingRuntime(config) };
}
const healthy = (r: BonusRingRuntime) => deepEqual(r.world.programs.flatMap(vm => vm.diagnostic ? [vm.diagnostic] : []), []);

test('exact Dog Bonus admission rejects altered scripts and metadata', { skip: !available }, () => {
    const { level, table, config } = fixture();
    equal(config.sites.length, 16);
    const placements = level.objectPlacements.map(p => ({ ...p }));
    placements[48].commandReferenceIdx++;
    equal(readBonusRings(placements, table, level.commands), null);
    const commands = level.commands.map(c => ({ ...c }));
    commands[405].opcode = 0;
    equal(readBonusRings(level.objectPlacements, table, commands), null);
});

test('startup activates one course hoop and four gates, with admitted texture cycling', { skip: !available }, () => {
    const { runtime: r } = fixture();
    equal([...r.world.states.values()].filter(s => s.hoop).length, 5);
    equal(r.current?.site.ordinal, 0);
    const gate = () => r.world.states.get('object:48')!;
    equal(gate().material, 11);
    const captured = { ...gate().hoop };
    r.world.getEntity('object:48')!.contactFlags = 20;
    r.advanceTo(100);
    const frames = [];
    for (let tick = 101; tick <= 116; tick++) { r.advanceTo(tick); frames.push(gate().material); }
    deepEqual(frames, [11,10,10,9,9,8,8,11,11,10,10,9,9,8,8,11]);
    deepEqual(gate().hoop, captured);
    healthy(r);
});

test('manual course passes increment source counters, activate successors and fade deleted hoops', { skip: !available }, () => {
    const { runtime: r } = fixture();
    const first = r.current!;
    for (let i = 0; i < 12; i++) {
        equal(r.current?.site.ordinal, i);
        r.passCurrent();
        equal(r.world.globals[7], i + 1);
        equal(r.world.globals[9], i + 1);
        healthy(r);
    }
    equal(r.current, null);
    ok(first.hoop?.removed !== null);
    const removed = first.hoop!.removed!;
    const start = sampleBonusHoop(first, removed);
    equal(start.alpha, 186 / 255);
    equal(start.scale, 0.125 + 6 / 512);
    equal(sampleBonusHoop(first, removed + 31).alpha, 0);
    r.advanceTo(0); r.advanceTo(100);
    healthy(r);
});

test('repeated frames, disable/re-enable, backwards time and large seeks preserve reset policy', { skip: !available }, () => {
    const { runtime: r } = fixture();
    r.advanceTo(200); r.advanceTo(201);
    const tick = r.world.tick;
    r.advanceTo(201); equal(r.world.tick, tick);
    r.passCurrent(); equal(r.world.globals[9], 1);
    r.advanceTo(100); equal(r.world.globals[9], 0);
    r.passCurrent(); r.advanceTo(1100); equal(r.world.globals[9], 0);
    r.setEnabled(false); r.advanceTo(1200); r.advanceTo(1210); r.passCurrent();
    equal(r.world.tick, 1); equal(r.world.globals[9], 0);
    r.setEnabled(true); equal(r.current?.site.ordinal, 0);
    healthy(r);
});


test('rendered gates replace powercells and hoop geometry updates once per simulation tick', { skip: !available }, () => {
    const { level, table, config } = fixture();
    const output = new RSPSharedOutput();
    const bank = getLevelRegularTextureBank(level.dat.segment, level.dat.textureBank)!;
    for (const [base, name] of [[BIOME_REGULAR_TEXTURE_ID_BASE, BIOME_REGULAR_TEXTURES.europe.name],
        [LEVEL_REGULAR_TEXTURE_ID_BASE, bank.name]] as const)
        parseRegularBank(read(`data/SSSV/textures/${name}.regular.bin`), name).forEach((t, i) => output.textureCache.textures[base+i] = t);
    const excluded = new Set(config.sites.filter(s => s.ordinal === null).map(s => s.index));
    const ordinary = buildBillboards(output, level.objectPlacements, table, [], level.dat, level.commands, excluded);
    ok(ordinary.every(c => !excluded.has(c.objectPlacementIndex!)));
    installReflectionTextures(output, read('data/SSSV/segments/segment1.bin'));
    equal(output.textureCache.textures[BONUS_RING_TEXTURE], undefined);
    const visuals = new BonusRingVisuals(output, config, table, level.dat, read('data/SSSV/segments/segment1.bin'));
    equal(visuals.calls.length, 20);
    equal(visuals.calls.filter(c => c.visible).length, 9);
    equal(visuals.vertexCount, 512);
    equal(output.textureCache.textures[BONUS_RING_TEXTURE].width, 32);
    const sprite = visuals.calls.find(c => c.objectPlacementIndex === 48 && c.commandTextureFrame !== null)!;
    deepEqual(sprite.animationTextureIndices, [523,522,521,520]);
    const vertices = new Float32Array(output.vertices.length * 10);
    equal(visuals.update(true, vertices), true);
    equal(visuals.update(true, vertices), false);
    const first = visuals.calls[0];
    const state = visuals.runtime.current!;
    const sample = sampleBonusHoop(state, 0);
    // Source phase zero uses -32 / +31 alternating radial offsets before scaling.
    deepEqual(Array.from(sample.positions.slice(0,6)), [224*state.site.scale>>11,0,0,384*state.site.scale>>11,0,0]);
    equal(first.center[1], state.site.placement.y + (state.site.height >> 1));
    visuals.runtime.advanceTo(0); visuals.runtime.advanceTo(2);
    equal(visuals.update(true, vertices), true); equal(sprite.commandTextureFrame, 1);
    visuals.runtime.passCurrent(); visuals.update(false, vertices);
    ok(visuals.calls.every(c => !c.visible));
    visuals.update(true, vertices); ok(visuals.calls[1].visible);
    visuals.runtime.reset(); equal(visuals.update(true, vertices), true);
    equal(visuals.calls.filter(c => c.visible).length, 9);
});
