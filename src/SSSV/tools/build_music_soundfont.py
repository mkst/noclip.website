import argparse
import hashlib
import json
import math
import struct
import subprocess
import types
from pathlib import Path


PARSER_SHA256 = "3802cb6912db4f4d3b4e2310ad9cbfcb281295956d41055a316308c09d2104ba"
CODEC_SHA256 = "3e4d0cfeb4932c2325331aec83bac40d24064376b4fb5962afa159da290b01d2"
SOUNDFONT_SHA256 = "da7e71fd247f701886842d89e546d396eb087a51ed42f4be25b13649447b534a"


def checked_source(path, expected):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Unsupported tool revision: {path}")
    return data.decode()


def load_decoder(path):
    source = checked_source(path, CODEC_SHA256)
    old = "scale = (1 << scale_idx) if scale_idx < 12 else 0"
    if source.count(old) != 1:
        raise ValueError("Unsupported ADPCM scale handling")
    # SDK vdecode.c and the independent C decoder agree on scale 12.
    source = source.replace(old, "scale = 1 << scale_idx")
    module = types.ModuleType("sssv_adpcm_decoder")
    exec(compile(source, str(path), "exec"), module.__dict__)
    return module.adpcm_decode


def read_bank(parser, ctl, node):
    checked_source(parser, PARSER_SHA256)
    script = "const fs=require('fs');const {parseCtl}=require(process.argv[1]);process.stdout.write(JSON.stringify(parseCtl(fs.readFileSync(process.argv[2]),0)));"
    result = subprocess.run([node, "-e", script, str(parser.resolve()), str(ctl.resolve())], check=True, capture_output=True, text=True)
    bank = json.loads(result.stdout)
    if len(bank["banks"]) != 1 or len(bank["instruments"]) != 10 or len(bank["wavetables"]) != 69:
        raise ValueError("Unsupported SSSV music bank")
    return bank


pack = struct.pack


def name(s): return s.encode("ascii")[:19].ljust(20, b"\0")
def chunk(tag, data): return tag + pack("<I", len(data)) + data + b"\0" * (len(data) % 2)
def lst(tag, data): return chunk(b"LIST", tag + data)
def tc(microseconds): return max(-12000, min(8000, round(1200 * math.log2(max(1, microseconds) / 1e6))))
def atten(ratio): return max(0, min(1440, round(-200 * math.log10(max(1e-7, ratio)))))
def gen(op, value): return pack("<HH", op, value & 65535)


def build_soundfont(b, tbl, decode):
    samples = b''
    headers = b''
    sample_ids = {}
    for sid, (off, w) in enumerate(b['wavetables'].items()):
        if w['type'] != 0:
            raise ValueError('Unsupported music sample encoding')
        book = b['books'][str(w['waveInfo']['book'])]
        raw = bytes(book['book']['data'])
        coefs = list(struct.unpack('>' + str(len(raw) // 2) + 'h', raw))
        if book['order'] != 2 or len(coefs) != book['npredictors'] * book['order'] * 8:
            raise ValueError('Unsupported ADPCM codebook')
        size = w['len'] // 9 * 9
        if w['base'] < 0 or w['base'] + w['len'] > len(tbl):
            raise ValueError('Sample exceeds table')
        decoded = decode(tbl[w['base']:w['base'] + size], coefs, book['order'], book['npredictors'])
        if len(decoded) != size // 9 * 16:
            raise ValueError('Truncated decoded sample')
        pcm = struct.pack('<' + str(len(decoded)) + 'h', *decoded)
        start = len(samples) // 2
        end = start + len(pcm) // 2
        loop = b['loops'].get(str(w['waveInfo']['loop']))
        ls = start + (loop['start'] if loop else 0)
        le = start + (loop['end'] if loop else len(pcm) // 2)
        if not start <= ls < le <= end:
            raise ValueError('Invalid sample loop')
        # Match the pilot's nominal 32 kHz sample tuning and approximate SF2 envelopes.
        headers += pack('<20sIIIIIBbHH', name('sample_' + off), start, end, ls, le, 32000, 60, 0, 0, 1)
        samples += pcm + b'\x00' * 92
        sample_ids[off] = sid
    headers += pack('<20sIIIIIBbHH', name('EOS'), len(samples) // 2, len(samples) // 2, 0, 0, 0, 0, 0, 0, 0)
    phdr = b''
    pbag = b''
    pgen = b''
    inst = b''
    ibag = b''
    igen = b''
    bank = next(iter(b['banks'].values()))
    for program, offset in enumerate(bank['instArray']):
        instrument = b['instruments'][str(offset)]
        phdr += pack('<20sHHHIII', name('program_' + str(program)), program, 0, len(pbag) // 4, 0, 0, 0)
        pbag += pack('<HH', len(pgen) // 4, 0)
        pgen += gen(41, program)
        inst += pack('<20sH', name('instrument_' + str(program)), len(ibag) // 4)
        for so in instrument['soundArray']:
            s = b['sounds'][str(so)]
            k = b['keyMaps'][str(s['keyMap'])]
            e = b['envelopes'][str(s['envelope'])]
            w = b['wavetables'][str(s['wavetable'])]
            assert e['attackVolume'] == 127
            assert instrument['vibType'] == 0 and instrument['tremType'] == 0
            ibag += pack('<HH', len(igen) // 4, 0)
            igen += gen(43, k['keyMin'] | k['keyMax'] << 8) + gen(44, k['velocityMin'] | k['velocityMax'] << 8)
            detune = k['detune'] if k['detune'] < 128 else k['detune'] - 256
            igen += gen(51, math.trunc(detune / 100)) + gen(52, detune - math.trunc(detune / 100) * 100)
            igen += gen(17, round((s['samplePan'] - 64) / 63 * 500))
            igen += gen(48, atten(s['sampleVolume'] / 127 * instrument['volume'] / 127))
            igen += gen(34, tc(e['attackTime'])) + gen(36, tc(e['decayTime']))
            igen += gen(37, atten(e['decayVolume'] / 127)) + gen(38, tc(e['releaseTime']))
            igen += gen(58, k['keyBase']) + gen(54, 1 if w['waveInfo']['loop'] else 0)
            igen += gen(53, sample_ids[str(s['wavetable'])])
    phdr += pack('<20sHHHIII', name('EOP'), 0, 0, len(pbag) // 4, 0, 0, 0)
    pbag += pack('<HH', len(pgen) // 4, 0)
    pgen += gen(0, 0)
    inst += pack('<20sH', name('EOI'), len(ibag) // 4)
    ibag += pack('<HH', len(igen) // 4, 0)
    igen += gen(0, 0)
    info = lst(b'INFO', chunk(b'ifil', pack('<HH', 2, 1)) + chunk(b'isng', b'EMU8000\x00') + chunk(b'INAM', b'SSSV experimental preview\x00'))
    pdta = lst(b'pdta', b''.join((chunk(tag, data) for tag, data in [(b'phdr', phdr), (b'pbag', pbag), (b'pmod', b'\x00' * 10), (b'pgen', pgen), (b'inst', inst), (b'ibag', ibag), (b'imod', b'\x00' * 10), (b'igen', igen), (b'shdr', headers)])))
    result = b'sfbk' + info + lst(b'sdta', chunk(b'smpl', samples)) + pdta
    return chunk(b'RIFF', result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--bank-parser", type=Path, required=True)
    parser.add_argument("--codec", type=Path, required=True)
    parser.add_argument("--node", default="node")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    bank = read_bank(args.bank_parser, args.audio / "raw/bank_1.ctl", args.node)
    result = build_soundfont(bank, (args.audio / "raw/bank_1.tbl").read_bytes(), load_decoder(args.codec))
    if hashlib.sha256(result).hexdigest() != SOUNDFONT_SHA256:
        raise ValueError("Generated music soundfont differs from the validated SSSV reference")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(result)
    print(f"Built SSSV music soundfont: {len(result)} bytes, sha256 {hashlib.sha256(result).hexdigest()}")


if __name__ == "__main__":
    main()
