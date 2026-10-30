export type AnimalLocomotion = "land" | "air" | "swim" | "unknown";

const LAND_ANIMAL_IDS = new Set([
    1, 2, 3, 4, 6, 8, 9, 10, 13, 16, 17, 18, 20, 22, 23, 24, 26, 27,
    28, 29, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 44, 46, 47,
    49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 67,
]);
const AIR_ANIMAL_IDS = new Set([0, 5, 7, 11, 14, 15, 19, 21, 25, 43, 45, 48]);
const SWIM_ANIMAL_IDS = new Set([12, 30, 66]);

export function getAnimalLocomotion(id: number): AnimalLocomotion {
    if (LAND_ANIMAL_IDS.has(id))
        return "land";
    if (AIR_ANIMAL_IDS.has(id))
        return "air";
    if (SWIM_ANIMAL_IDS.has(id))
        return "swim";
    return "unknown";
}
