export const GAME_TICK_RATE = 30;

export function getGameTick(timeMs: number): number {
    return Math.floor((timeMs * GAME_TICK_RATE) / 1000);
}

export function getGameTimeSeconds(timeMs: number): number {
    return getGameTick(timeMs) / GAME_TICK_RATE;
}
