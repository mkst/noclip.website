import type { LevelObjectPlacement } from '../core/level.js';
import type { LevelCommand } from '../commands/paths.js';
import { matchCommandRecords } from '../commands/command_admission.js';

const owners = new Map([
    [6,414], [26,318], [27,348], [28,363], [29,318], [30,348], [31,333], [32,378], [33,378],
    [34,363], [35,363], [36,333], [37,363], [38,333], [39,396], [40,396], [41,414],
    [86,543], [87,543], [88,543], [89,642], [90,642], [91,741], [96,741], [97,543], [98,543], [17,921],
]);
const orbSetup = new Map<number, { moves: string[]; offset: [number, number, number] }>([
    [318, { moves: ['003d7f8500c800000620'], offset: [-200,0,0] }],
    [333, { moves: ['003d7f8500c800000610'], offset: [200,0,0] }],
    [348, { moves: ['003d7f8600c800000720'], offset: [0,0,-200] }],
    [363, { moves: ['003d7f8600c800000710'], offset: [0,0,200] }],
    [378, { moves: ['003d7f8600c800000720','003d7f87007d00000820'], offset: [0,-125,-200] }],
    [396, { moves: ['003d7f8500c800000610','003d7f87007d00000820'], offset: [200,-125,0] }],
    [414, { moves: ['003d7f8500c800000620','003d7f87007d00000820'], offset: [-200,-125,0] }],
]);
const pickupSetup = ['0033000b000000000000','003d000000237f8b1200','00570000000000000000',
    '003d0000003c00081100','0064e7be000000000000','00163f000a1cff0a0000','001500000a0000000000',
    '0002040010000000000c','00020400040000000051','00060001000000000000'];

export interface WalraceSpriteStartup { material: number; x: number; y: number; z: number; }

// Exact first-yield snapshots only. Later orb movement, contact branches and race state stay unexecuted.
export function readWalraceSpriteStartup(index: number, p: LevelObjectPlacement, commands: readonly LevelCommand[]): WalraceSpriteStartup | null {
    const base = owners.get(index);
    if (base === undefined || p.id !== 166 || p.commandReferenceIdx !== base + 1 || p.commandsLength !== 0) return null;
    const orb = orbSetup.get(base);
    const records = orb ? ['003d00ff000700080204','00330023000000000000', ...orb.moves,
        '003d00007f8b00000000','003d00037f8b00000100','00060001000000000000']
        : base === 921 ? ['0033002a000000000000','000393007fc10000ffff'] : pickupSetup;
    if (!matchCommandRecords(commands, { base, records, source: 'decoded' }).matched) return null;
    const [dx,dy,dz] = orb?.offset ?? [0,0,0];
    return { material: orb ? 35 : base === 921 ? 42 : 11, x: p.x + dx, y: p.y + dy, z: p.z + dz };
}
