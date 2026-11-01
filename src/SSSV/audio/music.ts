import type { DataFetcher } from "../../DataFetcher.js";
import type { StartupMusic } from "./music_startup.js";

export const MUSIC_NAMES = [
    "Silence",
    "Have A Nice Day / Rocky Hard Place / Walrace 64 / Big Celebration Parade",
    "Honeymoon Lagoon / Pinball Blizzard / Walrace 64",
    "The Battery Farm / Walrace 64 / Weight For It",
    "Ice N Easy Does It / Something Fishy / Walrace 64 / Big Celebration Parade",
    "Level Passed",
    "Snow Joke / Hot Cross Buns",
    "Give A Dog A Bonus / Walrace 64 / Borassic Park",
    "Fat Bear Mountain / Hoppa Choppa",
    "Level Failed",
    "Jungle Jumps",
    "Penguin Playpen / Walrace 64",
    "Evo's Escape",
    "Track 13",
    "Fun In The Sun / Sting In The Tail / Shifting Sands",
    "Rat-O-Matic",
    "Jungle Doldrums / Big Celebration Parade",
    "Jungle Japes / Whirlwind Tour",
    "Newscaster",
    "Title Screen",
    "Smashing Start — Title Fanfare",
    "Smashing Start — Flossy Roger",
    "Smashing Start — Dun Dun Dunnn 1",
    "Smashing Start — Dun Dun Dunnn 2",
    "Boss Level Passed",
    "Main Theme",
    "Punchup Pyramid",
    "The Engine Room",
    "Credits",
    "Big Celebration Parade",
    "Swamp Of Eternal Stench",
];

export const MUSIC_MENU_ORDER: readonly number[] = [
    25, 19, 18, 20, 21, 22, 23,
    1, 2, 3, 27, 8, 15, 7,
    6, 4, 11,
    17, 16, 30, 10, 12,
    14, 26, 29,
    28, 5, 24, 9, 13, 0,
];

export interface MusicTrack {
    id: number;
    file: string;
    frames: number;
    loopStartFrame: number | null;
    loopEndFrame: number | null;
}

export interface MusicCatalog {
    version: number;
    sampleRate: number;
    tracks: MusicTrack[];
}

export function parseMusicCatalog(value: unknown): MusicCatalog {
    const c = value as MusicCatalog;
    if (!c || c.version !== 1 || c.sampleRate !== 32000 || !Array.isArray(c.tracks) || c.tracks.length !== 30)
        throw new Error("Invalid music catalog");
    const ids = new Set<number>();
    for (const t of c.tracks) {
        if (!t || !Number.isInteger(t.id) || t.id < 1 || t.id > 30 || ids.has(t.id)
            || typeof t.file !== "string" || !/^track_\d{2}\.ogg$/.test(t.file)
            || !Number.isSafeInteger(t.frames) || t.frames <= 0
            || !((t.loopStartFrame === null && t.loopEndFrame === null)
                || (Number.isSafeInteger(t.loopStartFrame) && Number.isSafeInteger(t.loopEndFrame)
                    && t.loopStartFrame! >= 0 && t.loopStartFrame! < t.loopEndFrame! && t.loopEndFrame! <= t.frames)))
            throw new Error("Invalid music track");
        ids.add(t.id);
    }
    return c;
}

export class MusicPlayer {
    private static volume = 0.5;
    private static enabled = true;
    public onchanged: (() => void) | null = null;
    public trackId: number;
    public status = "Loading music…";
    private catalog: MusicCatalog | null = null;
    private context: AudioContext | null = null;
    private gain: GainNode | null = null;
    private source: AudioBufferSourceNode | null = null;
    private buffer: AudioBuffer | null = null;
    private bufferTrack = -1;
    private offset = 0;
    private startedAt = 0;
    private generation = 0;
    private destroyed = false;
    private loading = false;
    private error = "";
    private ended = false;

    constructor(private readonly fetcher: DataFetcher, public readonly startup: StartupMusic) {
        this.trackId = startup.trackId;
    }

    public async initialize(): Promise<void> {
        try {
            const data = await this.fetcher.fetchData("SSSV/audio/music/catalog.json", { allow404: true });
            if (this.destroyed) return;
            this.catalog = parseMusicCatalog(JSON.parse(new TextDecoder().decode(data.createTypedArray(Uint8Array))));
            this.updateStatus();
            if (MusicPlayer.enabled && this.trackId !== 0) this.play();
        } catch {
            if (this.destroyed) return;
            this.error = "Music assets unavailable.";
            this.updateStatus();
        }
    }

    public get enabled(): boolean { return MusicPlayer.enabled; }
    public get volume(): number { return MusicPlayer.volume; }

    public setVolume(value: number): void {
        MusicPlayer.volume = Math.max(0, Math.min(1, value));
        if (this.gain !== null) this.gain.gain.value = MusicPlayer.volume;
        this.updateStatus();
    }

    public selectTrack(id: number): void {
        if (!Number.isInteger(id) || id < 0 || id > 30 || this.destroyed) return;
        this.generation++;
        this.stopSource();
        this.trackId = id;
        this.buffer = null;
        this.bufferTrack = -1;
        this.offset = 0;
        this.ended = false;
        this.loading = false;
        if (this.catalog !== null) this.error = "";
        if (MusicPlayer.enabled && id !== 0) this.play();
        else this.updateStatus();
    }

    public pause(): void {
        MusicPlayer.enabled = false;
        if (this.source !== null && this.context !== null) {
            this.offset += this.context.currentTime - this.startedAt;
            const track = this.catalog?.tracks.find(t => t.id === this.trackId);
            if (track?.loopStartFrame !== null && track?.loopStartFrame !== undefined && track.loopEndFrame !== null) {
                const start = track.loopStartFrame / 32000, end = track.loopEndFrame / 32000;
                if (this.offset >= end) this.offset = start + (this.offset - start) % (end - start);
            }
        }
        this.generation++;
        this.loading = false;
        this.stopSource();
        this.updateStatus();
    }

    public play(): void {
        if (this.destroyed) return;
        MusicPlayer.enabled = true;
        if (this.catalog === null) { this.updateStatus(); return; }
        this.error = "";
        if (this.trackId === 0) { this.updateStatus(); return; }
        try {
            if (this.context === null) {
                this.context = new AudioContext();
                this.gain = this.context.createGain();
                this.gain.gain.value = MusicPlayer.volume;
                this.gain.connect(this.context.destination);
                this.context.onstatechange = () => { if (!this.destroyed) this.updateStatus(); };
            }
            // Resume synchronously in the Play click, before fetching or decoding.
            void this.context.resume().catch(() => {
                if (!this.destroyed) { this.error = "Click Play to enable audio."; this.updateStatus(); }
            });
            if (this.ended) { this.ended = false; this.offset = 0; }
            if (this.source === null && !this.loading) void this.start(++this.generation);
            this.updateStatus();
        } catch {
            this.error = "Audio playback unavailable.";
            this.updateStatus();
        }
    }

    private async start(generation: number): Promise<void> {
        const track = this.catalog!.tracks.find(t => t.id === this.trackId)!;
        this.loading = true;
        this.updateStatus();
        try {
            if (this.bufferTrack !== track.id) {
                const data = await this.fetcher.fetchData(`SSSV/audio/music/${track.file}`, { allow404: true });
                if (this.destroyed || generation !== this.generation) return;
                const buffer = await this.context!.decodeAudioData(data.copyToBuffer());
                if (this.destroyed || generation !== this.generation) return;
                if (buffer.duration + 0.01 < track.frames / 32000) throw new Error("Truncated music");
                this.buffer = buffer;
                this.bufferTrack = track.id;
            }
            if (this.destroyed || generation !== this.generation) return;
            const source = this.context!.createBufferSource();
            source.buffer = this.buffer;
            source.loop = track.loopStartFrame !== null;
            if (source.loop) {
                source.loopStart = track.loopStartFrame! / 32000;
                source.loopEnd = track.loopEndFrame! / 32000;
            }
            source.connect(this.gain!);
            source.onended = () => {
                if (this.source !== source || this.destroyed) return;
                this.source = null;
                this.ended = true;
                this.offset = 0;
                source.disconnect();
                this.updateStatus();
            };
            source.start(0, this.offset);
            this.source = source;
            this.startedAt = this.context!.currentTime;
            this.loading = false;
            this.updateStatus();
        } catch {
            if (this.destroyed || generation !== this.generation) return;
            this.loading = false;
            this.error = "Could not load this track. Click Play to retry.";
            this.updateStatus();
        }
    }

    private stopSource(): void {
        if (this.source === null) return;
        this.source.onended = null;
        this.source.stop();
        this.source.disconnect();
        this.source = null;
    }

    private updateStatus(): void {
        this.status = this.error || (this.trackId === 0 ? "Silence" : this.catalog === null ? "Loading music…"
            : !MusicPlayer.enabled ? "Paused" : this.loading ? "Loading track…" : this.ended ? "Finished"
            : this.context?.state !== "running" ? "Click Play to enable audio." : "Playing");
        this.onchanged?.();
    }

    public destroy(): void {
        this.destroyed = true;
        this.generation++;
        this.onchanged = null;
        this.stopSource();
        this.buffer = null;
        if (this.context !== null) {
            this.context.onstatechange = null;
            void this.context.close().catch(() => {});
        }
    }
}
