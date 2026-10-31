import argparse
import ctypes as ct
import hashlib
import json
import math
import re
import struct
import subprocess
import tempfile
import types
import wave
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def converter(path):
    source = path.read_text()
    # Reject corrupt sequences instead of the upstream helper's best-effort recovery.
    truncated = "except IndexError:\n            break"
    missing = "if last_status == 0:\n                # data without status -- skip a byte and hope to recover\n                continue"
    if source.count(truncated) != 2 or missing not in source:
        raise ValueError("Unsupported sequence converter revision")
    source = source.replace(truncated, "except IndexError:\n            raise")
    source = source.replace(missing, 'if last_status == 0:\n                raise ValueError("Missing running status")')
    module = types.ModuleType("sssv_sequence_converter")
    exec(compile(source, str(path), "exec"), module.__dict__)
    return module


class Renderer:
    def __init__(self):
        self.lib = ct.CDLL("libfluidsynth.so.3")
        self.fn = {}
        p, s, i = ct.c_void_p, ct.c_char_p, ct.c_int
        for name, args, result in [
            ("new_fluid_settings", [], p), ("fluid_settings_setnum", [p, s, ct.c_double], i),
            ("fluid_settings_setint", [p, s, i], i), ("fluid_settings_setstr", [p, s, s], i),
            ("new_fluid_synth", [p], p), ("fluid_synth_sfload", [p, s, i], i),
            ("new_fluid_player", [p], p), ("fluid_player_add", [p, s], i),
            ("fluid_player_play", [p], i), ("fluid_player_stop", [p], i),
            ("new_fluid_file_renderer", [p], p), ("fluid_file_renderer_process_block", [p], i),
            ("delete_fluid_file_renderer", [p], None), ("delete_fluid_player", [p], None),
            ("delete_fluid_synth", [p], None), ("delete_fluid_settings", [p], None),
            ("fluid_version_str", [], s),
        ]:
            fn = getattr(self.lib, name)
            fn.argtypes, fn.restype = args, result
            self.fn[name] = fn

    def __getattr__(self, name):
        return self.fn[name]

    def render(self, midi, soundfont, wav, frames):
        settings = self.new_fluid_settings()
        synth = player = renderer = None
        try:
            for key, value in [(b"synth.sample-rate", 32000.0), (b"synth.gain", 0.15)]:
                assert self.fluid_settings_setnum(settings, key, value) == 0
            for key in [b"synth.reverb.active", b"synth.chorus.active"]:
                assert self.fluid_settings_setint(settings, key, 0) == 0
            for key, value in [(b"player.timing-source", b"sample"), (b"audio.file.name", str(wav).encode()),
                               (b"audio.file.type", b"wav"), (b"audio.file.format", b"s16")]:
                assert self.fluid_settings_setstr(settings, key, value) == 0
            synth = self.new_fluid_synth(settings)
            assert synth and self.fluid_synth_sfload(synth, str(soundfont).encode(), 1) >= 0
            player = self.new_fluid_player(synth)
            assert player and self.fluid_player_add(player, str(midi).encode()) == 0
            renderer = self.new_fluid_file_renderer(synth)
            assert renderer and self.fluid_player_play(player) == 0
            for _ in range(math.ceil(frames / 64)):
                assert self.fluid_file_renderer_process_block(renderer) == 0
        finally:
            if renderer: self.delete_fluid_file_renderer(renderer)
            if player:
                self.fluid_player_stop(player)
                self.delete_fluid_player(player)
            if synth: self.delete_fluid_synth(synth)
            self.delete_fluid_settings(settings)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--converter", type=Path, required=True)
    parser.add_argument("--soundfont", type=Path, required=True)
    parser.add_argument("--sequences", type=Path, default=Path("data/SSSV/audio/raw/sequences"))
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    module, renderer = converter(args.converter), Renderer()
    catalog = {"version": 1, "sampleRate": 32000, "tracks": [], "rendering": {
        "converterSha256": digest(args.converter), "soundfontSha256": digest(args.soundfont),
        "toolSha256": digest(Path(__file__)), "fluidsynth": renderer.fluid_version_str().decode(),
        "gain": 0.15, "reverb": False, "envelopes": "approximate SF2 envelopes",
    }}
    args.out.mkdir(parents=True, exist_ok=True)
    for index in range(30):
        path = args.sequences / f"sequence_{index:02}.cseq"
        data = path.read_bytes()
        division = struct.unpack_from(">I", data, 64)[0]
        offsets = sorted((v, i) for i, v in enumerate(struct.unpack_from(">16I", data)) if v)
        tracks, loops, tempos = [], [], set()
        for j, (offset, track) in enumerate(offsets):
            events = module.parse_track_to_events(data, offset, offsets[j + 1][0] if j + 1 < len(offsets) else len(data))
            if not any(e[2][0] == "eot" for e in events): raise ValueError(f"Missing end: {path}, track {track}")
            starts = [e[0] for e in events if e[2] == ("marker", "loopstart")]
            ends = [e for e in events if e[2][0] == "marker" and e[2][1].startswith("loopend ")]
            if any(e[2][0] == "marker" and not e[2][1].startswith(("loopstart", "loopend ")) for e in events):
                raise ValueError(f"Unknown event in {path}")
            loop = None
            if starts or ends:
                if len(starts) != 1 or len(ends) != 1 or "count=255 cur=255" not in ends[0][2][1]:
                    raise ValueError(f"Unsupported loop in {path}")
                loop = (starts[0], ends[0][0])
                if loop[1] <= loop[0]: raise ValueError(f"Invalid loop in {path}")
                loops.append(loop)
            tempos.update((e[0], e[2][1]) for e in events if e[2][0] == "tempo")
            tracks.append((track, events, loop))
        if len(set(loops)) > 1: raise ValueError(f"Different track loop periods: {path}")
        tempo_map = sorted(tempos)
        if not tempo_map or tempo_map[0][0] != 0: raise ValueError(f"No initial tempo: {path}")

        def seconds(tick):
            result, last, tempo = 0.0, 0, 500000
            for t, value in tempo_map:
                if t > tick: break
                result += (t - last) * tempo / division / 1e6
                last, tempo = t, value
            return result + (tick - last) * tempo / division / 1e6

        repeated = []
        for track, events, loop in tracks:
            clean = [e for e in events if e[2][0] not in ("eot", "marker")]
            if loop:
                start, end = loop
                if any(t >= start and kind == "tempo" for t, _, (kind, *_) in clean) and start != 0:
                    raise ValueError(f"Tempo change inside repeating section: {path}")
                clean += [(t + end - start, order, payload) for t, order, payload in clean
                          if t >= start and payload[0] != "tempo"]
            clean.sort(key=lambda e: (e[0], e[1]))
            repeated.append((track, clean))
        end_tick = max(e[0] for _, events, _ in tracks for e in events)
        loop_start = loop_end = None
        if loops:
            start, end = loops[0]
            loop_start, loop_end = round(seconds(end) * 32000), round(seconds(end + end - start) * 32000)
            frames = loop_end
        else:
            frames = math.ceil((seconds(end_tick) + 3) * 32000)
        if frames > 32000 * 1200: raise ValueError(f"Unbounded duration: {path}")
        with tempfile.TemporaryDirectory(prefix="sssv-music-") as temp:
            midi, wav, trimmed = (Path(temp) / n for n in ("music.mid", "music.wav", "trimmed.wav"))
            midi.write_bytes(module.emit_smf(division, repeated))
            renderer.render(midi, args.soundfont, wav, frames)
            with wave.open(str(wav)) as src, wave.open(str(trimmed), "wb") as dst:
                dst.setparams(src.getparams())
                pcm = src.readframes(frames)
                samples = struct.unpack("<" + str(len(pcm) // 2) + "h", pcm)
                if not any(samples) or any(s in (-32768, 32767) for s in samples): raise ValueError(f"Silent or clipped render: {path}")
                dst.writeframes(pcm)
            output = args.out / f"track_{index + 1:02}.ogg"
            subprocess.run(["ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error", "-i", str(trimmed),
                            "-c:a", "libvorbis", "-q:a", "5", str(output)], check=True)
        catalog["tracks"].append({"id": index + 1, "file": output.name, "frames": frames,
                                   "loopStartFrame": loop_start, "loopEndFrame": loop_end,
                                   "sequenceSha256": digest(path), "sha256": digest(output)})
        print(f"Track {index + 1:02}: {frames / 32000:.2f}s, loop={loop_start is not None}", flush=True)
    (args.out / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n")


if __name__ == "__main__":
    main()
