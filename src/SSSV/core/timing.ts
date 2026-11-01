export const GAME_TICK_RATE = 30;

export function getGameTick(timeMs: number): number {
    return Math.floor((timeMs * GAME_TICK_RATE) / 1000);
}

export function getGameTimeSeconds(timeMs: number): number {
    return getGameTick(timeMs) / GAME_TICK_RATE;
}

type SceneTickAdvance = { kind: 'initial' } | { kind: 'discontinuity' } | { kind: 'advance'; ticks: number };

// Tracks scene time only; runtimes own startup steps, simulation order and reset policy.
export class SceneTickClock {
    private lastTick: number | null = null;

    constructor(private readonly firstFrame: 'anchor' | 'step' = 'anchor') {}

    public reset(tick: number | null = null): void { this.lastTick = tick; }

    public advance(tick: number): SceneTickAdvance {
        const previous = this.lastTick;
        this.lastTick = tick;
        if (previous === null && this.firstFrame === 'anchor') return { kind: 'initial' };
        const ticks = previous === null ? 1 : tick - previous;
        return ticks < 0 || ticks > 900 ? { kind: 'discontinuity' } : { kind: 'advance', ticks };
    }
}
