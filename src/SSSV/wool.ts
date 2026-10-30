import { SINE_TABLE_256 } from "./animal_matrix.js";

export interface WoolVertex {
    position: [number, number, number];
    normal: [number, number, number];
}

export const WOOL_VERTEX_COUNT = 52;
export const WOOL_ACTIVE_OFFSET = 0x29D0;
export const WOOL_REST_OFFSET = 0x2F28;

export function readWoolVertices(view: DataView): WoolVertex[] {
    return Array.from({ length: WOOL_VERTEX_COUNT }, (_, i) => {
        const offset = WOOL_REST_OFFSET + i * 16;
        return {
            position: [view.getInt16(offset, false), view.getInt16(offset + 2, false), view.getInt16(offset + 4, false)],
            normal: [view.getInt8(offset + 12), view.getInt8(offset + 13), view.getInt8(offset + 14)],
        };
    });
}

// func_803622DC: always sample the rest buffer, including for backwards seeks.
export function sampleWoolVertex(rest: WoolVertex, tick: number): WoolVertex {
    if (tick === 0) return rest; // Source's initial tick guard leaves the ROM buffer untouched.
    const phase = (((rest.position[0] << 1) & 0xFF) << 3) + (tick << 3);
    const sin = SINE_TABLE_256[phase & 0xFF] >> 7;
    const cos = SINE_TABLE_256[(phase + 64) & 0xFF] >> 7;
    const position = rest.position.map(v => (v + ((v * sin) >> 12)) << 16 >> 16) as WoolVertex["position"];
    const normal = [rest.normal[0] + (sin >> 2), rest.normal[1] + (cos >> 2), rest.normal[2] - (sin >> 2)];
    // The source stores sqrtf's result in s16 before dividing the normal components.
    const length = Math.trunc(Math.fround(Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2)));
    return { position, normal: normal.map(v => Math.trunc(v * 127 / length) << 24 >> 24) as WoolVertex["normal"] };
}
