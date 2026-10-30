export interface LevelEntry {
    id: string;
    romStart: number;
    romEnd: number;
    textureBank: string;
}

export const LEVELS: LevelEntry[] = [
    { id: 'SMASHING_START', romStart: 0x546D00, romEnd: 0x54F0D0, textureBank: 'SMASHING_START' },
    { id: 'HAVE_A_NICE_DAY', romStart: 0x54F0D0, romEnd: 0x554E00, textureBank: 'HAVE_A_NICE_DAY' },
    { id: 'HONEYMOON_LAGOON', romStart: 0x554E00, romEnd: 0x55A390, textureBank: 'HONEYMOON_LAGOON' },
    { id: 'THE_BATTERY_FARM', romStart: 0x55A390, romEnd: 0x560320, textureBank: 'THE_BATTERY_FARM' },
    { id: 'THE_ENGINE_ROOM', romStart: 0x560320, romEnd: 0x567F00, textureBank: 'THE_ENGINE_ROOM' },
    { id: 'FAT_BEAR_MOUNTAIN', romStart: 0x567F00, romEnd: 0x56CD00, textureBank: 'FAT_BEAR_MOUNTAIN' },
    { id: 'ROCKY_HARD_PLACE', romStart: 0x56CD00, romEnd: 0x572CC0, textureBank: 'ROCKY_HARD_PLACE' },
    { id: 'STINKY_SEWERS', romStart: 0x572CC0, romEnd: 0x578D10, textureBank: 'STINKY_SEWERS' },
    { id: 'RAT_O_MATIC', romStart: 0x578D10, romEnd: 0x57F1D0, textureBank: 'RAT_O_MATIC' },
    { id: 'GIVE_A_DOG_A_BONUS', romStart: 0x57F1D0, romEnd: 0x582C60, textureBank: 'GIVE_A_DOG_A_BONUS' },
    { id: 'SNOW_JOKE', romStart: 0x582C60, romEnd: 0x588CA0, textureBank: 'SNOW_JOKE' },
    { id: 'ICE_N_EASY_DOES_IT', romStart: 0x588CA0, romEnd: 0x58D380, textureBank: 'ICE_N_EASY_DOES_IT' },
    { id: 'PENGUIN_PLAYPEN', romStart: 0x58D380, romEnd: 0x591880, textureBank: 'PENGUIN_PLAYPEN' },
    { id: 'PINBALL_BLIZZARD', romStart: 0x591880, romEnd: 0x596960, textureBank: 'PINBALL_BLIZZARD' },
    { id: 'HOPPA_CHOPPA', romStart: 0x596960, romEnd: 0x5A1110, textureBank: 'HOPPA_CHOPPA' },
    { id: 'SOMETHING_FISHY', romStart: 0x5A1110, romEnd: 0x5A7E10, textureBank: 'SOMETHING_FISHY' },
    { id: 'WALRACE_64', romStart: 0x5A7E10, romEnd: 0x5AE270, textureBank: 'WALRACE_64' },
    { id: 'JUNGLE_JAPES', romStart: 0x5AE270, romEnd: 0x5B4510, textureBank: 'JUNGLE_JAPES' },
    { id: 'JUNGLE_DOLDRUMS', romStart: 0x5B4510, romEnd: 0x5BA760, textureBank: 'JUNGLE_DOLDRUMS' },
    { id: 'SWAMP_OF_ETERNAL_STENCH', romStart: 0x5BA760, romEnd: 0x5C3390, textureBank: 'SWAMP_OF_ETERNAL_STENCH' },
    { id: 'WEIGHT_FOR_IT', romStart: 0x5C3390, romEnd: 0x5C8C80, textureBank: 'WEIGHT_FOR_IT' },
    { id: 'JUNGLE_JUMPS', romStart: 0x5C8C80, romEnd: 0x5D06A0, textureBank: 'JUNGLE_JUMPS' },
    { id: 'EVOS_ESCAPE', romStart: 0x5D06A0, romEnd: 0x5D7E70, textureBank: 'EVOS_ESCAPE' },
    { id: 'FUN_IN_THE_SUN', romStart: 0x5D7E70, romEnd: 0x5DF8F0, textureBank: 'FUN_IN_THE_SUN' },
    { id: 'HOT_CROSS_BUNS', romStart: 0x5DF8F0, romEnd: 0x5E49C0, textureBank: 'HOT_CROSS_BUNS' },
    { id: 'STING_IN_THE_TAIL', romStart: 0x5E49C0, romEnd: 0x5EB140, textureBank: 'STING_IN_THE_TAIL' },
    { id: 'BORASSIC_PARK', romStart: 0x5EB140, romEnd: 0x5F2840, textureBank: 'BORASSIC_PARK' },
    { id: 'WHIRLWIND_TOUR', romStart: 0x5F2840, romEnd: 0x5F9410, textureBank: 'WHIRLWIND_TOUR' },
    { id: 'SHIFTING_SANDS', romStart: 0x5F9410, romEnd: 0x603210, textureBank: 'SHIFTING_SANDS' },
    { id: 'PUNCHUP_PYRAMID', romStart: 0x603210, romEnd: 0x607440, textureBank: 'PUNCHUP_PYRAMID' },
    { id: 'BIG_CELEBRATION_PARADE', romStart: 0x607440, romEnd: 0x60E920, textureBank: 'BIG_CELEBRATION_PARADE' },
    { id: 'SECRET_LEVEL', romStart: 0x60E920, romEnd: 0x60FFD0, textureBank: 'SMASHING_START' },
    { id: 'EMPTY_LEVEL_1', romStart: 0x60FFD0, romEnd: 0x6104A0, textureBank: 'PINBALL_BLIZZARD' },
    { id: 'EMPTY_LEVEL_2', romStart: 0x6104A0, romEnd: 0x6109D0, textureBank: 'HAVE_A_NICE_DAY' },
    { id: 'CREDITS', romStart: 0x6109D0, romEnd: 0x616BB0, textureBank: 'BIG_CELEBRATION_PARADE' },
    { id: 'INTRO', romStart: 0x616BB0, romEnd: 0x617C30, textureBank: 'THE_ENGINE_ROOM' },
];

export interface SegmentEntry {
    name: string;
    vram: number;
    romStart: number;
    romEnd: number;
}

export const SEGMENTS: SegmentEntry[] = [
    { name: 'segment1', vram: 0x01000000, romStart: 0x0398D0, romEnd: 0x07F790 },
    { name: 'data_7F790', vram: 0x05000000, romStart: 0x07F790, romEnd: 0x085790 },
    { name: 'HAVE_A_NICE_DAY', vram: 0x05000000, romStart: 0x085790, romEnd: 0x087B80 },
    { name: 'HONEYMOON_LAGOON', vram: 0x05000000, romStart: 0x087B80, romEnd: 0x089260 },
    { name: 'SMASHING_START', vram: 0x05000000, romStart: 0x089260, romEnd: 0x092BF0 },
    { name: 'THE_BATTERY_FARM', vram: 0x05000000, romStart: 0x092BF0, romEnd: 0x096790 },
    { name: 'GIVE_A_DOG_A_BONUS', vram: 0x05000000, romStart: 0x096790, romEnd: 0x097020 },
    { name: 'DMA_INTRO', vram: 0x05000000, romStart: 0x097020, romEnd: 0x09E0D0 },
    { name: 'STINKY_SEWERS', vram: 0x05000000, romStart: 0x09E0D0, romEnd: 0x09ED10 },
    { name: 'RAT_O_MATIC', vram: 0x05000000, romStart: 0x09ED10, romEnd: 0x0A0E40 },
    { name: 'ROCKY_HARD_PLACE', vram: 0x05000000, romStart: 0x0A0E40, romEnd: 0x0A10C0 },
    { name: 'FAT_BEAR_MOUNTAIN', vram: 0x05000000, romStart: 0x0A10C0, romEnd: 0x0A10D0 },
    { name: 'BIG_CELEBRATION_PARADE', vram: 0x05000000, romStart: 0x0A10D0, romEnd: 0x0AA940 },
    { name: 'SOMETHING_FISHY', vram: 0x05000000, romStart: 0x0AA940, romEnd: 0x0B0490 },
    { name: 'ICE_N_EASY_DOES_IT', vram: 0x05000000, romStart: 0x0B0490, romEnd: 0x0B0B90 },
    { name: 'PINBALL_BLIZZARD', vram: 0x05000000, romStart: 0x0B0B90, romEnd: 0x0B2ED0 },
    { name: 'WALRACE_64', vram: 0x05000000, romStart: 0x0B2ED0, romEnd: 0x0B3D70 },
    { name: 'PENGUIN_PLAYPEN', vram: 0x05000000, romStart: 0x0B3D70, romEnd: 0x0B3D80 },
    { name: 'SNOW_JOKE', vram: 0x05000000, romStart: 0x0B3D80, romEnd: 0x0B3D90 },
    { name: 'UNUSED_ICE_SLOT_7', vram: 0x05000000, romStart: 0x0B3D90, romEnd: 0x0B3DA0 },
    { name: 'HOPPA_CHOPPA', vram: 0x05000000, romStart: 0x0B3DA0, romEnd: 0x0B3DB0 },
    { name: 'UNUSED_ICE_SLOT_9', vram: 0x05000000, romStart: 0x0B3DB0, romEnd: 0x0B3DC0 },
    { name: 'UNUSED_ICE_SLOT_10', vram: 0x05000000, romStart: 0x0B3DC0, romEnd: 0x0B3DD0 },
    { name: 'WEIGHT_FOR_IT', vram: 0x05000000, romStart: 0x0B3DD0, romEnd: 0x0B40C0 },
    { name: 'UNUSED_JUNGLE_SLOT_2', vram: 0x05000000, romStart: 0x0B40C0, romEnd: 0x0B40D0 },
    { name: 'JUNGLE_JUMPS', vram: 0x05000000, romStart: 0x0B40D0, romEnd: 0x0B43A0 },
    { name: 'SWAMP_OF_ETERNAL_STENCH', vram: 0x05000000, romStart: 0x0B43A0, romEnd: 0x0B48C0 },
    { name: 'JUNGLE_DOLDRUMS', vram: 0x05000000, romStart: 0x0B48C0, romEnd: 0x0B48D0 },
    { name: 'EVOS_ESCAPE', vram: 0x05000000, romStart: 0x0B48D0, romEnd: 0x0BD090 },
    { name: 'JUNGLE_JAPES', vram: 0x05000000, romStart: 0x0BD090, romEnd: 0x0BD0A0 },
    { name: 'UNUSED_JUNGLE_SLOT_8', vram: 0x05000000, romStart: 0x0BD0A0, romEnd: 0x0BD0B0 },
    { name: 'UNUSED_JUNGLE_SLOT_9', vram: 0x05000000, romStart: 0x0BD0B0, romEnd: 0x0BD0C0 },
    { name: 'UNUSED_JUNGLE_SLOT_10', vram: 0x05000000, romStart: 0x0BD0C0, romEnd: 0x0BD0D0 },
    { name: 'FUN_IN_THE_SUN', vram: 0x05000000, romStart: 0x0BD0D0, romEnd: 0x0BD2B0 },
    { name: 'HOT_CROSS_BUNS', vram: 0x05000000, romStart: 0x0BD2B0, romEnd: 0x0BFC40 },
    { name: 'PUNCHUP_PYRAMID', vram: 0x05000000, romStart: 0x0BFC40, romEnd: 0x0C4500 },
    { name: 'STING_IN_THE_TAIL', vram: 0x05000000, romStart: 0x0C4500, romEnd: 0x0C4510 },
    { name: 'SHIFTING_SANDS', vram: 0x05000000, romStart: 0x0C4510, romEnd: 0x0C47A0 },
    { name: 'WHIRLWIND_TOUR', vram: 0x05000000, romStart: 0x0C47A0, romEnd: 0x0C47B0 },
    { name: 'BORASSIC_PARK', vram: 0x05000000, romStart: 0x0C47B0, romEnd: 0x0C7A00 },
    { name: 'UNUSED_DESERT_SLOT_8', vram: 0x05000000, romStart: 0x0C7A00, romEnd: 0x0C7A10 },
    { name: 'UNUSED_DESERT_SLOT_9', vram: 0x05000000, romStart: 0x0C7A10, romEnd: 0x0C7A20 },
    { name: 'UNUSED_DESERT_SLOT_10', vram: 0x05000000, romStart: 0x0C7A20, romEnd: 0x0C7A30 },
    { name: 'europe_biome', vram: 0x04000000, romStart: 0x0C7A30, romEnd: 0x0DD5C0 },
    { name: 'ice_biome', vram: 0x04000000, romStart: 0x0DD5C0, romEnd: 0x0E75B0 },
    { name: 'desert_biome', vram: 0x04000000, romStart: 0x0E75B0, romEnd: 0x0F1060 },
    { name: 'jungle_biome', vram: 0x04000000, romStart: 0x0F1060, romEnd: 0x0FFD50 },
    { name: 'city_biome', vram: 0x04000000, romStart: 0x0FFD50, romEnd: 0x116BD0 },
    { name: 'data_116BD0', vram: 0x04000000, romStart: 0x116BD0, romEnd: 0x12A390 },
];

export const LEVEL_SEGMENT_ALIASES: { [id: string]: string } = {
    THE_ENGINE_ROOM: 'DMA_INTRO',
    INTRO: 'DMA_INTRO',
    SECRET_LEVEL: 'SMASHING_START',
    CREDITS: 'BIG_CELEBRATION_PARADE',
    EMPTY_LEVEL_1: 'PINBALL_BLIZZARD',
    EMPTY_LEVEL_2: 'HAVE_A_NICE_DAY',
};

export interface TextureEntry {
    name: string;
    format: 'rgba16' | 'ia16';
    romStart: number;
}

export const BIOME_TEXTURES: TextureEntry[] = [
    { name: 'europe.rgba16', format: 'rgba16', romStart: 0x42DCA0 },
    { name: 'ice.rgba16', format: 'rgba16', romStart: 0x435320 },
    { name: 'desert.rgba16', format: 'rgba16', romStart: 0x43CB60 },
    { name: 'jungle.rgba16', format: 'rgba16', romStart: 0x4457F0 },
    { name: 'city.rgba16', format: 'rgba16', romStart: 0x44E7B0 },
    { name: 'europe.ia16', format: 'ia16', romStart: 0x4571A0 },
    { name: 'ice.ia16', format: 'ia16', romStart: 0x459590 },
    { name: 'desert.ia16', format: 'ia16', romStart: 0x45D550 },
    { name: 'jungle.ia16', format: 'ia16', romStart: 0x45EDC0 },
    { name: 'city.ia16', format: 'ia16', romStart: 0x461950 },
];

export const LEVEL_TEXTURES: TextureEntry[] = [
    { name: 'HAVE_A_NICE_DAY', format: 'rgba16', romStart: 0x461A20 },
    { name: 'HONEYMOON_LAGOON', format: 'rgba16', romStart: 0x465F90 },
    { name: 'SMASHING_START', format: 'rgba16', romStart: 0x46BA30 },
    { name: 'THE_BATTERY_FARM', format: 'rgba16', romStart: 0x470670 },
    { name: 'GIVE_A_DOG_A_BONUS', format: 'rgba16', romStart: 0x474EE0 },
    { name: 'THE_ENGINE_ROOM', format: 'rgba16', romStart: 0x47A0F0 },
    { name: 'STINKY_SEWERS', format: 'rgba16', romStart: 0x47F1E0 },
    { name: 'RAT_O_MATIC', format: 'rgba16', romStart: 0x484450 },
    { name: 'ROCKY_HARD_PLACE', format: 'rgba16', romStart: 0x488A70 },
    { name: 'FAT_BEAR_MOUNTAIN', format: 'rgba16', romStart: 0x48DD20 },
    { name: 'BIG_CELEBRATION_PARADE', format: 'rgba16', romStart: 0x4927E0 },
    { name: 'SOMETHING_FISHY', format: 'rgba16', romStart: 0x497B90 },
    { name: 'ICE_N_EASY_DOES_IT', format: 'rgba16', romStart: 0x49C950 },
    { name: 'PINBALL_BLIZZARD', format: 'rgba16', romStart: 0x4A1690 },
    { name: 'WALRACE_64', format: 'rgba16', romStart: 0x4A5170 },
    { name: 'PENGUIN_PLAYPEN', format: 'rgba16', romStart: 0x4A97E0 },
    { name: 'SNOW_JOKE', format: 'rgba16', romStart: 0x4AE610 },
    { name: 'HOPPA_CHOPPA', format: 'rgba16', romStart: 0x4B3460 },
    { name: 'FUN_IN_THE_SUN', format: 'rgba16', romStart: 0x4B79E0 },
    { name: 'HOT_CROSS_BUNS', format: 'rgba16', romStart: 0x4BC330 },
    { name: 'PUNCHUP_PYRAMID', format: 'rgba16', romStart: 0x4C12C0 },
    { name: 'STING_IN_THE_TAIL', format: 'rgba16', romStart: 0x4C4CD0 },
    { name: 'SHIFTING_SANDS', format: 'rgba16', romStart: 0x4C91B0 },
    { name: 'WHIRLWIND_TOUR', format: 'rgba16', romStart: 0x4CD3A0 },
    { name: 'BORASSIC_PARK', format: 'rgba16', romStart: 0x4D1770 },
    { name: 'WEIGHT_FOR_IT', format: 'rgba16', romStart: 0x4D69A0 },
    { name: 'JUNGLE_JUMPS', format: 'rgba16', romStart: 0x4DB230 },
    { name: 'SWAMP_OF_ETERNAL_STENCH', format: 'rgba16', romStart: 0x4E0B80 },
    { name: 'JUNGLE_DOLDRUMS', format: 'rgba16', romStart: 0x4E57F0 },
    { name: 'EVOS_ESCAPE', format: 'rgba16', romStart: 0x4EABE0 },
    { name: 'JUNGLE_JAPES', format: 'rgba16', romStart: 0x4EFC40 },
];

export const BIOME_SEGMENTS: { [segment: number]: string } = {
    0: 'europe',
    1: 'ice',
    2: 'desert',
    3: 'jungle',
    5: 'city',
};

export const WATER_TEXTURE = {
    name: 'water',
    format: 'i8' as const,
    romStart: 0x5449C0,
    width: 16,
    height: 544,
};

export interface LevelObjectTextureEntry { name: string; offset: number; width: number; height: number; }
export const LEVEL_OBJECT_TEXTURES: { [segment: string]: LevelObjectTextureEntry[] } = {
    data_7F790: [
        { name: 'img/actors/dan/dan1', offset: 0x005000, width: 32, height: 32 },
        { name: 'img/actors/dan/dan2', offset: 0x005800, width: 32, height: 32 },
    ],
    HAVE_A_NICE_DAY: [
        { name: 'img/levels/HAVE_A_NICE_DAY/floorboard', offset: 0x000800, width: 32, height: 32 },
        { name: 'img/levels/HAVE_A_NICE_DAY/roof_tile', offset: 0x000000, width: 32, height: 32 },
    ],
    SMASHING_START: [
        { name: 'img/levels/SMASHING_START/capsule.D_05000000_89260', offset: 0x000000, width: 32, height: 32 },
        { name: 'img/levels/SMASHING_START/asteroid.D_050031A0_8C400', offset: 0x0031A0, width: 32, height: 32 },
        { name: 'img/levels/SMASHING_START/silicon_valley_sign.D_05004210_8D470', offset: 0x004210, width: 32, height: 32 },
        { name: 'img/levels/SMASHING_START/earth_sign.D_05004A10_8DC70', offset: 0x004A10, width: 32, height: 32 },
        { name: 'img/levels/SMASHING_START/spaceship_interior_0_16.D_05005A10_8EC70', offset: 0x005A10, width: 16, height: 16 },
        { name: 'img/levels/SMASHING_START/tigerprint_16.D_05005C10_8EE70', offset: 0x005C10, width: 16, height: 16 },
        { name: 'img/levels/SMASHING_START/spaceship_interior_2.D_05005E10_8F070', offset: 0x005E10, width: 32, height: 32 },
        { name: 'img/levels/SMASHING_START/spaceship_interior_4_16.D_05006610_8F870', offset: 0x006610, width: 16, height: 16 },
    ],
    THE_BATTERY_FARM: [
        { name: 'img/levels/THE_BATTERY_FARM/floorboard.D_05000800_933F0', offset: 0x000800, width: 32, height: 32 },
        { name: 'img/levels/THE_BATTERY_FARM/roof_tile.D_05000000_92BF0', offset: 0x000000, width: 32, height: 32 },
        { name: 'img/levels/THE_BATTERY_FARM/dog_bed.D_05001AA0_94690', offset: 0x001AA0, width: 32, height: 32 },
    ],
    DMA_INTRO: [
        { name: 'img/levels/DMA_INTRO/take_two_logo.D_05001410_98430', offset: 0x001410, width: 32, height: 32 },
    ],
    STINKY_SEWERS: [
        { name: 'img/levels/STINKY_SEWERS/turd2.D_05000870_9E940', offset: 0x000870, width: 16, height: 16 },
    ],
    BIG_CELEBRATION_PARADE: [
        { name: 'img/levels/BIG_CELEBRATION_PARADE/shrink_ray.D_05007970_A8A40', offset: 0x007970, width: 32, height: 32 },
    ],
    EVOS_ESCAPE: [
        { name: 'img/levels/EVOS_ESCAPE/turret.D_05000250_B4B20', offset: 0x000250, width: 32, height: 32 },
    ],
};

export const OBJECT_TABLE = {
    romStart: 0x7B9BD8,
    count: 247,
    stride: 0x9C,
};

export interface RegularBankEntry { name: string; romStart: number; }
export const BIOME_REGULAR_TEXTURES: { [biome: string]: RegularBankEntry } = {
    europe: { name: 'europe.rgba16', romStart: 0x4F54D0 },
    jungle: { name: 'jungle.rgba16', romStart: 0x4F6A70 },
    desert: { name: 'desert.rgba16', romStart: 0x4F8010 },
    ice: { name: 'ice.rgba16', romStart: 0x4F95B0 },
};
export const LEVEL_REGULAR_TEXTURES: { [level: string]: RegularBankEntry } = {
    HAVE_A_NICE_DAY: { name: 'HAVE_A_NICE_DAY', romStart: 0x4FAF70 },
    HONEYMOON_LAGOON: { name: 'HONEYMOON_LAGOON', romStart: 0x4FC110 },
    SMASHING_START: { name: 'SMASHING_START', romStart: 0x4FD1E0 },
    THE_BATTERY_FARM: { name: 'THE_BATTERY_FARM', romStart: 0x4FDF70 },
    GIVE_A_DOG_A_BONUS: { name: 'GIVE_A_DOG_A_BONUS', romStart: 0x4FF2B0 },
    THE_ENGINE_ROOM: { name: 'THE_ENGINE_ROOM', romStart: 0x500020 },
    STINKY_SEWERS: { name: 'STINKY_SEWERS', romStart: 0x500050 },
    RAT_O_MATIC: { name: 'RAT_O_MATIC', romStart: 0x501040 },
    ROCKY_HARD_PLACE: { name: 'ROCKY_HARD_PLACE', romStart: 0x502360 },
    FAT_BEAR_MOUNTAIN: { name: 'FAT_BEAR_MOUNTAIN', romStart: 0x503930 },
    BIG_CELEBRATION_PARADE: { name: 'BIG_CELEBRATION_PARADE', romStart: 0x504E70 },
    SOMETHING_FISHY: { name: 'SOMETHING_FISHY', romStart: 0x505F00 },
    ICE_N_EASY_DOES_IT: { name: 'ICE_N_EASY_DOES_IT', romStart: 0x505F30 },
    PINBALL_BLIZZARD: { name: 'PINBALL_BLIZZARD', romStart: 0x506550 },
    WALRACE_64: { name: 'WALRACE_64', romStart: 0x506DD0 },
    PENGUIN_PLAYPEN: { name: 'PENGUIN_PLAYPEN', romStart: 0x507F00 },
    SNOW_JOKE: { name: 'SNOW_JOKE', romStart: 0x507F30 },
    HOPPA_CHOPPA: { name: 'HOPPA_CHOPPA', romStart: 0x507F90 },
    FUN_IN_THE_SUN: { name: 'FUN_IN_THE_SUN', romStart: 0x509250 },
    HOT_CROSS_BUNS: { name: 'HOT_CROSS_BUNS', romStart: 0x50A4A0 },
    PUNCHUP_PYRAMID: { name: 'PUNCHUP_PYRAMID', romStart: 0x50A4D0 },
    STING_IN_THE_TAIL: { name: 'STING_IN_THE_TAIL', romStart: 0x50BDB0 },
    SHIFTING_SANDS: { name: 'SHIFTING_SANDS', romStart: 0x50D230 },
    WHIRLWIND_TOUR: { name: 'WHIRLWIND_TOUR', romStart: 0x50ECD0 },
    BORASSIC_PARK: { name: 'BORASSIC_PARK', romStart: 0x5106E0 },
    WEIGHT_FOR_IT: { name: 'WEIGHT_FOR_IT', romStart: 0x5122D0 },
    UNUSED_JUNGLE_SLOT_2: { name: 'UNUSED_JUNGLE_SLOT_2', romStart: 0x5137C0 },
    JUNGLE_JUMPS: { name: 'JUNGLE_JUMPS', romStart: 0x514CB0 },
    SWAMP_OF_ETERNAL_STENCH: { name: 'SWAMP_OF_ETERNAL_STENCH', romStart: 0x515730 },
    JUNGLE_DOLDRUMS: { name: 'JUNGLE_DOLDRUMS', romStart: 0x516C20 },
    EVOS_ESCAPE: { name: 'EVOS_ESCAPE', romStart: 0x518110 },
    JUNGLE_JAPES: { name: 'JUNGLE_JAPES', romStart: 0x519600 },
};

const LEVEL_REGULAR_TEXTURE_BANKS: string[][] = [
    ['HAVE_A_NICE_DAY', 'HONEYMOON_LAGOON', 'SMASHING_START', 'THE_BATTERY_FARM', 'GIVE_A_DOG_A_BONUS', 'THE_ENGINE_ROOM', 'STINKY_SEWERS', 'RAT_O_MATIC', 'ROCKY_HARD_PLACE', 'FAT_BEAR_MOUNTAIN', 'BIG_CELEBRATION_PARADE'],
    ['SOMETHING_FISHY', 'ICE_N_EASY_DOES_IT', 'PINBALL_BLIZZARD', 'WALRACE_64', 'PENGUIN_PLAYPEN', 'SNOW_JOKE', '', 'HOPPA_CHOPPA'],
    ['WEIGHT_FOR_IT', 'UNUSED_JUNGLE_SLOT_2', 'JUNGLE_JUMPS', 'SWAMP_OF_ETERNAL_STENCH', 'JUNGLE_DOLDRUMS', 'EVOS_ESCAPE', 'JUNGLE_JAPES'],
    ['FUN_IN_THE_SUN', 'HOT_CROSS_BUNS', 'PUNCHUP_PYRAMID', 'STING_IN_THE_TAIL', 'SHIFTING_SANDS', 'WHIRLWIND_TOUR', 'BORASSIC_PARK'],
];

export function getLevelRegularTextureBank(segment: number, textureBank: number): RegularBankEntry | undefined {
    const bank = segment === 4 || segment === 5 ? 0 : segment;
    const name = LEVEL_REGULAR_TEXTURE_BANKS[bank]?.[textureBank - 1];
    return name !== undefined ? LEVEL_REGULAR_TEXTURES[name] : undefined;
}

export const BILLBOARD_TABLE = {
    romStart: 0x7C338C,
    overlayVram: 0x80294E50,
    overlayRomStart: 0x6A6500,
    maxSets: 16,
};
