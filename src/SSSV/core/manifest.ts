export interface ManifestLevel {
    id: string;
    name: string;
    levelFile: string;
    textureBank: string;
    biome: string | null;
    segmentName: string;
    stats: {
        faces: number;
        triangles: number;
        trailingBytes: number;
        mapEntries: number;
        objects: number;
        animals: number;
    };
}

export interface ManifestTexture {
    name: string;
    file: string;
    format: 'rgba16' | 'ia16' | 'i8' | 'regular';
}

export interface ManifestSegment {
    name: string;
    file: string;
    vram: number;
}

export interface SSSVManifest {
    version: number;
    levels: ManifestLevel[];
    textures: ManifestTexture[];
    segments: ManifestSegment[];
    particleAssets?: {
        definitions: { id: number; file: string }[];
        driftTables: { index: number; file: string; count: number }[];
    };
}

const LEVEL_NAME_OVERRIDES: { [id: string]: string } = {
    RAT_O_MATIC: 'Rat-O-Matic',
    EVOS_ESCAPE: "Evo's Escape",
};

export function formatLevelName(id: string): string {
    if (LEVEL_NAME_OVERRIDES[id] !== undefined)
        return LEVEL_NAME_OVERRIDES[id];

    return id
        .toLowerCase()
        .split('_')
        .map((word) => word.length !== 0 ? word[0].toUpperCase() + word.slice(1) : word)
        .join(' ');
}
