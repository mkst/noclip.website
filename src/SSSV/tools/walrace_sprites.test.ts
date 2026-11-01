import { existsSync, readFileSync } from 'node:fs';
import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';
import AB from '../../ArrayBufferSlice.js';
import { RSPSharedOutput } from '../../BanjoKazooie/f3dex.js';
import { parseLevelContainer, mirrorZ } from '../core/level.js';
import { prepareLevel } from '../core/level_preparation.js';
import { getLevelRegularTextureBank } from '../core/level_table.js';
import { parseRegularBank } from '../core/texture.js';
import { buildBillboards, indexObjectTable, installDynamicBillboardTextures, parseObjectTable, LEVEL_REGULAR_TEXTURE_ID_BASE } from '../objects/objects.js';
import { readWalraceSpriteStartup } from '../objects/walrace_sprites.js';
import { CommandVM, commandSuccess } from '../commands/command_vm.js';
import { CommandWorld } from '../commands/command_world.js';
import type { CommandResult } from '../commands/command_vm.js';

(globalThis as any).window = { debug: false };
const read = (p: string) => AB.fromView(readFileSync(p));
const available = existsSync('data/SSSV/levels/WALRACE_64.bin');
function fixture() {
    const level = prepareLevel(parseLevelContainer(read('data/SSSV/levels/WALRACE_64.bin')), 'WALRACE_64');
    const table = indexObjectTable(parseObjectTable(read('data/SSSV/objects.bin')));
    const output = new RSPSharedOutput();
    const bank = getLevelRegularTextureBank(level.dat.segment, level.dat.textureBank)!;
    parseRegularBank(read(`data/SSSV/textures/${bank.name}.regular.bin`), bank.name)
        .forEach((t, i) => output.textureCache.textures[LEVEL_REGULAR_TEXTURE_ID_BASE+i] = t);
    installDynamicBillboardTextures(output, read('data/SSSV/segments/segment1.bin'));
    return { level, table, output };
}

test('Walrace admits 17 orb, nine pickup and one controller startup snapshots', { skip: !available }, () => {
    const { level } = fixture();
    const snapshots = level.objectPlacements.flatMap((p, i) => readWalraceSpriteStartup(i, p, level.commands) ?? []);
    equal(snapshots.length, 27);
    equal(snapshots.filter(s => s.material === 35).length, 17);
    equal(snapshots.filter(s => s.material === 11).length, 9);
    equal(snapshots.filter(s => s.material === 42).length, 1);
    const p = level.objectPlacements[26];
    equal(readWalraceSpriteStartup(25, p, level.commands), null);
    equal(readWalraceSpriteStartup(26, { ...p, commandsLength: 1 }, level.commands), null);
    const altered = level.commands.map(c => ({ ...c }));
    altered[319].payload = AB.fromView(new Uint8Array(8));
    equal(readWalraceSpriteStartup(26, p, altered), null);
});

test('Walrace orb first-yield positions agree with shared VM arithmetic on source records', { skip: !available }, () => {
    const { level } = fixture();
    class OrbWorld extends CommandWorld {
        public material = 0;
        public override writeVariable(target: string | null, field: number, value: number): CommandResult<void> {
            if (field >= 6 && field <= 8) {
                this.getEntity(target!)!.position![(['x','z','y'] as const)[field-6]] = value;
                return commandSuccess(undefined);
            }
            return super.writeVariable(target, field, value);
        }
        public executeObjectCommand(owner: string, target: string | null, opcode: number, p: DataView): CommandResult<void> {
            equal(target, owner); equal(opcode, 0x33); this.material = p.getUint16(0); return commandSuccess(undefined);
        }
    }
    for (const [i, p] of level.objectPlacements.entries()) {
        const snapshot = readWalraceSpriteStartup(i, p, level.commands);
        if (snapshot?.material !== 35) continue;
        const world = new OrbWorld([{ id: 'orb', typeId: 166, position: { x: p.x, y: p.y, z: p.z } }]);
        const vm = new CommandVM({ owner: 'orb', scriptBase: p.commandReferenceIdx-1, commands: level.commands }, world);
        vm.step(0);
        equal(vm.diagnostic, null);
        equal(world.material, snapshot.material);
        deepEqual(world.getEntity('orb')!.position, { x: snapshot.x, y: snapshot.y, z: snapshot.z });
    }
});

test('Walrace billboard bindings use source materials and first-yield positions', { skip: !available }, () => {
    const { level, table, output } = fixture();
    const calls = buildBillboards(output, level.objectPlacements, table, [], level.dat, level.commands);
    for (const [i, p] of level.objectPlacements.entries()) {
        const snapshot = readWalraceSpriteStartup(i, p, level.commands);
        if (!snapshot) continue;
        const call = calls.find(c => c.objectPlacementIndex === i);
        ok(call);
        deepEqual(call.textureIndices, [snapshot.material === 35 ? 563 : snapshot.material === 11 ? 523 : 570]);
        equal(call.animationTextureIndices, null);
        equal(call.center[0], snapshot.x);
        equal(call.center[2], mirrorZ(snapshot.z));
        equal(call.center[1], snapshot.y + table.get(p.id)!.collideHeight * p.scale / 2048 / 2);
    }
});
