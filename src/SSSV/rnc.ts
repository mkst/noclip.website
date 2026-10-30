import ArrayBufferSlice from "../ArrayBufferSlice.js";
import { assert } from "../util.js";

const RNC_HEADER_LENGTH = 18;
const RNC_MAGIC = 0x524E43; // "RNC"

class HuffmanEntry {
    public code: number = 0;
    public codeLen: number = 0;
}

class RNC1Unpacker {
    private inputPtr: number = 0;
    private outputPtr: number = 0;
    private bitBuff: number = 0;
    private bitBuffBits: number = 0;

    constructor(private input: Uint8Array, private output: Uint8Array) {
    }

    private readWordLE(offset: number): number {
        const b0 = offset + 0 < this.input.length ? this.input[offset + 0] : 0;
        const b1 = offset + 1 < this.input.length ? this.input[offset + 1] : 0;
        const b2 = offset + 2 < this.input.length ? this.input[offset + 2] : 0;
        const b3 = offset + 3 < this.input.length ? this.input[offset + 3] : 0;
        return ((b3 << 24) | (b2 << 16) | (b1 << 8) | (b0 << 0)) >>> 0;
    }

    private inputBits(n: number): number {
        if (this.bitBuffBits < n) {
            const newBits = this.readWordLE(this.inputPtr);
            this.bitBuff = (((newBits << this.bitBuffBits) | (this.bitBuff & ((1 << this.bitBuffBits) - 1))) >>> 0);
            this.inputPtr += 2;
            this.bitBuffBits += 16;
        }

        const bits = this.bitBuff & ((1 << n) - 1);
        this.bitBuff >>>= n;
        this.bitBuffBits -= n;
        return bits;
    }

    private static swapBits(inBits: number, n: number): number {
        let outBits = 0;
        for (let i = 0; i < n; i++) {
            outBits <<= 1;
            if (inBits & 1)
                outBits |= 1;
            inBits >>>= 1;
        }
        return outBits;
    }

    private static makeHuffmanCodes(table: HuffmanEntry[], n: number): void {
        let huffBits = 1;
        let huffCode = 0;
        let huffBase = 0x80000000;

        while (huffBits <= 16) {
            for (let i = 0; i < n; i++) {
                if (table[i].codeLen === huffBits) {
                    table[i].code = RNC1Unpacker.swapBits(Math.floor(huffCode / huffBase), huffBits);
                    huffCode = (huffCode + huffBase) >>> 0;
                }
            }
            huffBits++;
            huffBase >>>= 1;
        }
    }

    private inputHuffmanTable(table: HuffmanEntry[]): void {
        for (let i = 0; i < 16; i++) {
            table[i].code = 0;
            table[i].codeLen = 0;
        }

        const n = Math.min(this.inputBits(5), 16);
        if (n !== 0) {
            for (let i = 0; i < n; i++)
                table[i].codeLen = this.inputBits(4);
            RNC1Unpacker.makeHuffmanCodes(table, n);
        }
    }

    private inputValue(table: HuffmanEntry[]): number {
        let i = 0;
        for (; i < 16; i++) {
            const entry = table[i];
            if (entry.codeLen !== 0 && entry.code === (this.bitBuff & ((1 << entry.codeLen) - 1)))
                break;
        }

        assert(i < 16, "RNC: invalid Huffman code");
        this.inputBits(table[i].codeLen);

        if (i < 2)
            return i;

        return this.inputBits(i - 1) | (1 << (i - 1));
    }

    public unpack(): void {
        const rawTable = Array.from({ length: 16 }, () => new HuffmanEntry());
        const posTable = Array.from({ length: 16 }, () => new HuffmanEntry());
        const lenTable = Array.from({ length: 16 }, () => new HuffmanEntry());

        this.inputBits(2);

        while (this.outputPtr < this.output.length) {
            this.inputHuffmanTable(rawTable);
            this.inputHuffmanTable(posTable);
            this.inputHuffmanTable(lenTable);

            const count = this.inputBits(16);

            for (let i = 0; i < count; i++) {
                if (i > 0) {
                    const ptr = this.inputValue(posTable) + 1;
                    const length = this.inputValue(lenTable) + 2;
                    for (let j = 0; j < length; j++) {
                        const src = this.outputPtr - ptr;
                        assert(src >= 0, "RNC: invalid back-reference");
                        if (this.outputPtr < this.output.length)
                            this.output[this.outputPtr] = this.output[src];
                        this.outputPtr++;
                    }
                }

                const length = this.inputValue(rawTable);
                for (let j = 0; j < length; j++) {
                    if (this.outputPtr < this.output.length)
                        this.output[this.outputPtr] = this.input[this.inputPtr];
                    this.outputPtr++;
                    this.inputPtr++;
                }

                const newBits = this.readWordLE(this.inputPtr);
                this.bitBuff = (((newBits << this.bitBuffBits) | (this.bitBuff & ((1 << this.bitBuffBits) - 1))) >>> 0);
            }
        }
    }
}

export function isRNC(data: ArrayBufferSlice): boolean {
    return data.byteLength >= RNC_HEADER_LENGTH && (data.createDataView().getUint32(0, false) >>> 8) === RNC_MAGIC;
}

export function decompressRNC(data: ArrayBufferSlice): ArrayBufferSlice {
    assert(isRNC(data), "RNC: invalid header");

    const view = data.createDataView();
    const method = view.getUint8(3);
    const uncompressedSize = view.getUint32(4, false);

    assert(method === 1, `RNC: unsupported method ${method}`);

    const input = data.createTypedArray(Uint8Array, RNC_HEADER_LENGTH);
    const output = new Uint8Array(uncompressedSize);
    const unpacker = new RNC1Unpacker(input, output);
    unpacker.unpack();

    return new ArrayBufferSlice(output.buffer);
}
