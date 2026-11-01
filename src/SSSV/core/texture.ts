import ArrayBufferSlice from "../../ArrayBufferSlice.js";
import * as RDP from "../../Common/N64/RDP.js";
import { decodeTex_I4, decodeTex_I8, decodeTex_IA16, decodeTex_RGBA16, ImageFormat, ImageSize, TexCM } from "../../Common/N64/Image.js";

const TEXTURE_WIDTH = 32;
const TEXTURE_HEIGHT = 32;
const MIPMAP_TRAILER_SIZE = 0xE;

function mipmapTextureSize(width: number, height: number): number {
    let size = MIPMAP_TRAILER_SIZE;
    let w = width;
    let h = height;
    while (w > 0 && h > 0) {
        size += w * h * 2;
        w = Math.floor(w / 2);
        h = Math.floor(h / 2);
    }
    return size;
}

export function parseMipmapBank(data: ArrayBufferSlice, format: 'rgba16' | 'ia16', bankName: string): RDP.Texture[] {
    const textureSize = mipmapTextureSize(TEXTURE_WIDTH, TEXTURE_HEIGHT);
    const textureCount = Math.floor(data.byteLength / textureSize);
    const textures: RDP.Texture[] = [];
    const view = data.createDataView();

    for (let i = 0; i < textureCount; i++) {
        const imageOffset = i * textureSize;
        const imageSize = TEXTURE_WIDTH * TEXTURE_HEIGHT * 2;
        const pixels = new Uint8Array(TEXTURE_WIDTH * TEXTURE_HEIGHT * 4);

        if (format === 'rgba16')
            decodeTex_RGBA16(pixels, view, imageOffset, TEXTURE_WIDTH, TEXTURE_HEIGHT, 0, true);
        else
            decodeTex_IA16(pixels, view, imageOffset, TEXTURE_WIDTH, TEXTURE_HEIGHT, 0, true);

        const tile = new RDP.TileState();
        tile.set(format === 'rgba16' ? ImageFormat.G_IM_FMT_RGBA : ImageFormat.G_IM_FMT_IA, ImageSize.G_IM_SIZ_16b, 0, 0, 0,
            TexCM.WRAP, 5, 0, TexCM.WRAP, 5, 0);
        tile.setSize(0, 0, (TEXTURE_WIDTH - 1) * 4, (TEXTURE_HEIGHT - 1) * 4);

        const texture = new RDP.Texture(tile, imageOffset, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT, pixels);
        texture.name = `${bankName}/${i.toString(16).padStart(2, '0')}`;
        textures.push(texture);

        if (imageOffset + imageSize > data.byteLength)
            break;
    }

    return textures;
}

export function parseI8Texture(data: ArrayBufferSlice, width: number, height: number, name: string, offset: number = 0): RDP.Texture {
    const pixels = new Uint8Array(width * height * 4);
    decodeTex_I8(pixels, data.createDataView(), offset, width, height);

    const tile = new RDP.TileState();
    tile.set(ImageFormat.G_IM_FMT_I, ImageSize.G_IM_SIZ_8b, 0, 0, 0, TexCM.WRAP, 0, 0, TexCM.WRAP, 0, 0);
    tile.setSize(0, 0, (width - 1) * 4, (height - 1) * 4);

    const texture = new RDP.Texture(tile, 0, 0, width, height, pixels);
    texture.name = name;
    return texture;
}

export function parseI4Texture(data: ArrayBufferSlice, width: number, height: number, name: string, offset: number = 0, cm: TexCM = TexCM.CLAMP): RDP.Texture {
    const pixels = new Uint8Array(width * height * 4);
    decodeTex_I4(pixels, data.createDataView(), offset, width, height);

    const maskS = Math.round(Math.log2(width));
    const maskT = Math.round(Math.log2(height));
    const tile = new RDP.TileState();
    tile.set(ImageFormat.G_IM_FMT_I, ImageSize.G_IM_SIZ_4b, 0, 0, 0, cm, maskT, 0, cm, maskS, 0);
    tile.setSize(0, 0, (width - 1) * 4, (height - 1) * 4);

    const texture = new RDP.Texture(tile, offset, 0, width, height, pixels);
    texture.name = name;
    return texture;
}

export function parseIA16Texture(data: ArrayBufferSlice, offset: number, width: number, height: number, name: string, cm: TexCM = TexCM.WRAP, deinterleave: boolean = false): RDP.Texture {
    const pixels = new Uint8Array(width * height * 4);
    decodeTex_IA16(pixels, data.createDataView(), offset, width, height, 0, deinterleave);

    const maskS = Math.round(Math.log2(width));
    const maskT = Math.round(Math.log2(height));
    const tile = new RDP.TileState();
    tile.set(ImageFormat.G_IM_FMT_IA, ImageSize.G_IM_SIZ_16b, 0, 0, 0, cm, maskT, 0, cm, maskS, 0);
    tile.setSize(0, 0, (width - 1) * 4, (height - 1) * 4);

    const texture = new RDP.Texture(tile, offset, 0, width, height, pixels);
    texture.name = name;
    return texture;
}

export function parseRGBA16Texture(data: ArrayBufferSlice, offset: number, width: number, height: number, name: string): RDP.Texture {
    const pixels = new Uint8Array(width * height * 4);
    decodeTex_RGBA16(pixels, data.createDataView(), offset, width, height);

    const tile = new RDP.TileState();
    const maskS = Math.round(Math.log2(width));
    const maskT = Math.round(Math.log2(height));
    tile.set(ImageFormat.G_IM_FMT_RGBA, ImageSize.G_IM_SIZ_16b, 0, 0, 0, TexCM.WRAP, maskT, 0, TexCM.WRAP, maskS, 0);
    tile.setSize(0, 0, (width - 1) * 4, (height - 1) * 4);

    const texture = new RDP.Texture(tile, offset, 0, width, height, pixels);
    texture.name = name;
    return texture;
}

const REGULAR_TEXTURE_WIDTH = 32;
const REGULAR_TEXTURE_HEIGHT = 32;
const REGULAR_RGBA16_SIZE = REGULAR_TEXTURE_WIDTH * REGULAR_TEXTURE_HEIGHT * 2;
const REGULAR_I4_SIZE = (REGULAR_TEXTURE_WIDTH * REGULAR_TEXTURE_HEIGHT) / 2;
const REGULAR_TEXTURE_SIZE = REGULAR_RGBA16_SIZE + REGULAR_I4_SIZE;

export function parseRegularBank(data: ArrayBufferSlice, bankName: string): RDP.Texture[] {
    const count = Math.floor(data.byteLength / REGULAR_TEXTURE_SIZE);
    const colorBase = 0;
    const alphaBase = count * REGULAR_RGBA16_SIZE;
    const view = data.createDataView();
    const textures: RDP.Texture[] = [];

    for (let i = 0; i < count; i++) {
        const pixels = new Uint8Array(REGULAR_TEXTURE_WIDTH * REGULAR_TEXTURE_HEIGHT * 4);
        decodeTex_RGBA16(pixels, view, colorBase + i * REGULAR_RGBA16_SIZE, REGULAR_TEXTURE_WIDTH, REGULAR_TEXTURE_HEIGHT);

        const alphaPixels = new Uint8Array(REGULAR_TEXTURE_WIDTH * REGULAR_TEXTURE_HEIGHT * 4);
        decodeTex_I4(alphaPixels, view, alphaBase + i * REGULAR_I4_SIZE, REGULAR_TEXTURE_WIDTH, REGULAR_TEXTURE_HEIGHT);
        for (let p = 0; p < REGULAR_TEXTURE_WIDTH * REGULAR_TEXTURE_HEIGHT; p++)
            pixels[p * 4 + 3] = alphaPixels[p * 4];

        const tile = new RDP.TileState();
        tile.set(ImageFormat.G_IM_FMT_RGBA, ImageSize.G_IM_SIZ_16b, 0, 0, 0, TexCM.WRAP, 5, 0, TexCM.WRAP, 5, 0);
        tile.setSize(0, 0, (REGULAR_TEXTURE_WIDTH - 1) * 4, (REGULAR_TEXTURE_HEIGHT - 1) * 4);

        const texture = new RDP.Texture(tile, i * REGULAR_TEXTURE_SIZE, 0, REGULAR_TEXTURE_WIDTH, REGULAR_TEXTURE_HEIGHT, pixels);
        texture.name = `${bankName}/${i.toString(16).padStart(2, '0')}`;
        textures.push(texture);
    }
    return textures;
}
