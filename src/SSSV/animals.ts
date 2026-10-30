import { vec3 } from "gl-matrix";
import { RSP_Geometry, RSPSharedOutput, Vertex } from "../BanjoKazooie/f3dex.js";
import { mirrorZ } from "./level.js";
import type { LevelAnimalPlacement, LevelDat, LevelObjectPlacement } from "./level.js";
import { COMBINE_UNTEXTURED, DP_OTHERMODE_H, RENDER_OPAQUE, SSSVDrawCall, SSSVLayer } from "./terrain.js";

export const ANIMAL_NAMES = [
    "SEAGULL",
    "LION",
    "HIPPO",
    "RACING_HIPPO",
    "RACING_DOG",
    "FLYING_DOG",
    "FOX",
    "FIRE_FOX",
    "FROG",
    "POLAR_BEAR_DEFENDING",
    "RABBIT",
    "HELI_RABBIT",
    "COD",
    "KING_RAT",
    "PARROT",
    "PARROT_ATTACKING",
    "MOUSE",
    "HARD_MOUSE",
    "RACING_MOUSE",
    "VULTURE",
    "MOUSE2",
    "HELI_MOUSE",
    "BEAR",
    "CRAZY_BEAR",
    "MYSTERY_BEAR",
    "SEAGULL2",
    "RACING_FOX",
    "TORTOISE_TANK",
    "RACING_TORTOISE",
    "TORTOISE_TANK_DEFENDING",
    "PIRANHA",
    "DOG",
    "RAT",
    "SHEEP",
    "RAM",
    "SPRINGY_THINGY",
    "SPRINGY_RAM",
    "PENGUIN",
    "POLAR_BEAR",
    "POLAR_TANK",
    "HUSKY",
    "CRAZY_HUSKY",
    "SKI_HUSKY",
    "CROW",
    "WALRUS",
    "VULTURE2",
    "CAMEL",
    "CANNON_CAMEL",
    "CROW_DIVER",
    "POGO_KANGAROO",
    "BOXING_KANGAROO",
    "DESERT_FOX",
    "ARMED_DESERT_FOX",
    "SCORPION",
    "GORILLA",
    "DESERT_FOX_ATTACKING",
    "ELEPHANT",
    "HYENA",
    "HYENA_BIKER",
    "CHAMELEON",
    "SNEAKY_CHAMELEON",
    "EVO_MICROCHIP",
    "EVO_TRANSFER",
    "EVO",
    "KING_PENGUIN",
    "RACING_TORTOISE_DEFENDING",
    "COOL_COD",
    "EVO_SHELLSUIT",
];

export type AnimalMarkerMode = "auto" | "all" | "off";

export function isAnimalMarkerVisible(mode: AnimalMarkerMode, hasModel: boolean, animalsEnabled: boolean): boolean {
    return mode === "all" || (mode === "auto" && (!hasModel || !animalsEnabled));
}

export interface AnimalMarker {
    placementIndex: number;
    hasModel: boolean;
    position: vec3;
    labelPosition: vec3;
    label: string;
}

const MARKER_RADIUS = 24;

export function createPlayerPlacement(dat: Pick<LevelDat, "startingAnimalId" | "startHeading">, objects: readonly Pick<LevelObjectPlacement, "id" | "x" | "z" | "y">[]): LevelAnimalPlacement | null {
    // The loader retains the last entrance; B9B8 positions the chip at its Y+8,
    // then C85EC spawns the starting species there and converts degrees to heading.
    let entrance: typeof objects[number] | undefined;
    for (const object of objects) if (object.id === 55) entrance = object;
    if (entrance === undefined) return null;
    return { id: dat.startingAnimalId, x: entrance.x, z: entrance.z, y: entrance.y + 8, rotation: Math.trunc(dat.startHeading * 256 / 360) & 0xFF, health: 0x7F, unkC: 0, unkE: 0 };
}

export function createAnimalMarkers(placements: LevelAnimalPlacement[], player: LevelAnimalPlacement | null = null): AnimalMarker[] {
    return [...placements, ...(player !== null ? [player] : [])].map((animal, i) => ({
        placementIndex: i === placements.length ? -1 : i,
        hasModel: false,
        position: vec3.fromValues(animal.x, animal.y + MARKER_RADIUS, mirrorZ(animal.z)),
        labelPosition: vec3.fromValues(animal.x, animal.y + MARKER_RADIUS * 2 + 8, mirrorZ(animal.z)),
        label: i === placements.length ? `PLAYER (${ANIMAL_NAMES[animal.id] ?? `ANIMAL_${animal.id}`})` : ANIMAL_NAMES[animal.id] ?? `ANIMAL_${animal.id}`,
    }));
}

export function buildAnimalMarkers(sharedOutput: RSPSharedOutput, markers: AnimalMarker[], modeledPlacements: ReadonlySet<number> = new Set(), placementOffset = 0): SSSVDrawCall[] {
    for (const marker of markers)
        marker.hasModel = modeledPlacements.has(marker.placementIndex === -1 ? -1 : marker.placementIndex + placementOffset);
    return [false, true].flatMap(hasModel => buildAnimalMarkerGroup(sharedOutput, markers.filter(marker => marker.hasModel === hasModel), hasModel));
}

function buildAnimalMarkerGroup(sharedOutput: RSPSharedOutput, markers: AnimalMarker[], hasModel: boolean): SSSVDrawCall[] {
    if (markers.length === 0)
        return [];

    const drawCall = new SSSVDrawCall();
    drawCall.layer = SSSVLayer.AnimalMarkers;
    drawCall.animalMarkerHasModel = hasModel;
    drawCall.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH;
    drawCall.SP_TextureState.set(false, 0, 0, 0, 0);
    drawCall.DP_OtherModeH = DP_OTHERMODE_H;
    drawCall.DP_OtherModeL = RENDER_OPAQUE;
    drawCall.DP_Combine = COMBINE_UNTEXTURED;
    drawCall.firstIndex = sharedOutput.indices.length;

    const rings = 8;
    const slices = 12;
    for (const marker of markers) {
        const base = sharedOutput.vertices.length;
        for (let ring = 0; ring <= rings; ring++) {
            const latitude = ring * Math.PI / rings;
            for (let slice = 0; slice <= slices; slice++) {
                const longitude = slice * Math.PI * 2 / slices;
                const nx = Math.sin(latitude) * Math.cos(longitude);
                const ny = Math.cos(latitude);
                const nz = Math.sin(latitude) * Math.sin(longitude);
                const shade = 0.65 + 0.35 * Math.max(0, (nx + ny - nz) / Math.sqrt(3));
                const v = new Vertex();
                v.x = marker.position[0] + nx * MARKER_RADIUS;
                v.y = marker.position[1] + ny * MARKER_RADIUS;
                v.z = marker.position[2] + nz * MARKER_RADIUS;
                v.matrixIndex = 1;
                v.c0 = shade;
                v.c1 = shade * 0.65;
                v.c2 = shade * 0.12;
                v.a = 1;
                sharedOutput.vertices.push(v);
            }
        }
        for (let ring = 0; ring < rings; ring++) {
            for (let slice = 0; slice < slices; slice++) {
                const a = base + ring * (slices + 1) + slice;
                const b = a + slices + 1;
                if (ring !== 0)
                    sharedOutput.indices.push(a, a + 1, b);
                if (ring !== rings - 1)
                    sharedOutput.indices.push(a + 1, b + 1, b);
            }
        }
    }
    drawCall.indexCount = sharedOutput.indices.length - drawCall.firstIndex;
    return [drawCall];
}
