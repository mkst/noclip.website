import { ANIMAL_NAMES, createAnimalMarkers } from "./animals.js";
import type { AnimalMarker } from "./animals.js";
import type { LevelAnimalPlacement, LevelMapEntry } from "./level.js";
import type { LevelCommand } from "./paths.js";
import { sampleGroundHeight } from "./terrain_height.js";

export interface AbsoluteAnimalSpawn {
    commandIndex: number;
    placement: LevelAnimalPlacement;
}

export function readAbsoluteAnimalSpawns(commands: readonly LevelCommand[]): AbsoluteAnimalSpawn[] {
    return commands.filter(command => command.opcode === 0x60).map(command => {
        const view = command.payload.createDataView();
        // Active handler 72A3B4: byte species, signed X/Z/Y, heading 0, health 127.
        return { commandIndex: command.index, placement: {
            id: view.getUint8(0), x: view.getInt16(2, false), z: view.getInt16(4, false), y: view.getInt16(6, false),
            rotation: 0, health: 0x7F, unkC: 0, unkE: 0,
        } };
    });
}

export function createAnimalSpawnMarkers(spawns: readonly AbsoluteAnimalSpawn[], map: readonly LevelMapEntry[]): AnimalMarker[] {
    const placements = spawns.map(({ placement }) => ({ ...placement,
        y: Math.max(placement.y, sampleGroundHeight(map, placement.x, placement.z) ?? placement.y),
    }));
    return createAnimalMarkers(placements).map((marker, i) => ({ ...marker,
        label: `SPAWN PREVIEW: ${ANIMAL_NAMES[placements[i].id] ?? `ANIMAL_${placements[i].id}`} (cmd ${spawns[i].commandIndex})`,
    }));
}
