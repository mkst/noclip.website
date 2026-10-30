export type AnimalEyeFamily = "standard" | "eyes5" | "eyes6" | "standard-tlut4" | "eyes2-tlut4" | "eyes5-tlut2" | "primitive";
export type AnimalEyeSide = "left" | "right";

export type AnimalEyeAnimation = {
    kind: "texture";
    family: Exclude<AnimalEyeFamily, "primitive">;
    side: AnimalEyeSide;
    deactivated: boolean;
    textureIndices: number[];
} | {
    kind: "primitive";
    side: AnimalEyeSide;
    deactivated: boolean;
};

export const ANIMAL_EYE_ATLASES = {
    "eyes2-tlut4": { base: 0x01000D20, palette: 0x01000D00, frames: 13 },
    standard: { base: 0x01000620, palette: 0x01000CC0, frames: 13 },
    "eyes5-tlut2": { base: 0x01002100, palette: 0x01000CC0, frames: 9 },
    eyes5: { base: 0x01002100, palette: 0x01000CA0, frames: 9 },
    "standard-tlut4": { base: 0x01000620, palette: 0x01000D00, frames: 13 },
    eyes6: { base: 0x010025A0, palette: 0x01002C40, frames: 13 },
};

// Logical expressions from func_8031A150; later source branches take precedence.
export function sampleAnimalEyeIndices(tick: number, deactivated = false): [number, number] {
    if (deactivated) return [5, 5];
    let left = 0, right = 0;
    if ((tick & 0x3F) >= 0x3A) left = right = 5;
    if ((tick & 0x4FF) >= 0x46A || (tick & 0xFFF) >= 0xE0C) left = right = 7;
    let phase = (tick & 0x2FF) - 737;
    if ((tick & 0x2FF) > 737) {
        if (phase < 7) { left = 1; right = 0; }
        else if (phase < 14) { left = 0; right = 1; }
        else if (phase < 21) { left = 2; right = 0; }
        else { left = 0; right = 2; }
    }
    phase = (tick & 0x3FF) - 960;
    if ((tick & 0x3FF) > 960) {
        if (phase > 10 && phase < 25) left = right = 3;
        else if (phase > 40 && phase < 55) left = right = 4;
        else left = right = 0;
    }
    return [left, right];
}

const STANDARD_LEFT = [0, 1, 2, 3, 4, 12, 9, 7, 8, 10, 12, 10, 11];
const STANDARD_RIGHT = [0, 1, 2, 4, 3, 12, 9, 7, 8, 10, 12, 10, 11];
const EYES5 = [0, 1, 2, 0, 0, 4, 6, 3, 5, 7, 6, 6, 8];

export function sampleAnimalEyeFrame(tick: number, family: Exclude<AnimalEyeFamily, "primitive">, side: AnimalEyeSide, deactivated = false): number {
    const index = sampleAnimalEyeIndices(tick, deactivated)[side === "left" ? 0 : 1];
    return ((family === "eyes5" || family === "eyes5-tlut2") ? EYES5 : side === "left" ? STANDARD_LEFT : STANDARD_RIGHT)[index];
}

export function sampleAnimalEyeRed(tick: number, deactivated = false): number {
    // RAT/KING_RAT use the logical left-eye expression for both solid eye triangles.
    return sampleAnimalEyeIndices(tick, deactivated)[0] === 5 ? 155 : 255;
}
