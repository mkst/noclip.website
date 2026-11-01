// Quarter of the source degree table used by SINB/COSB for object offsets and relative launches.
const sineQuarter = [0, 4, 8, 13, 17, 22, 26, 31, 35, 40, 44, 48, 53, 57, 61, 66, 70, 74, 79, 83, 87, 91, 95, 100, 104, 108, 112, 116, 120, 124, 127, 131, 135, 139, 143, 146, 150, 154, 157, 161, 164, 167, 171, 174, 177, 181, 184, 187, 190, 193, 196, 198, 201, 204, 207, 209, 212, 214, 217, 219, 221, 223, 226, 228, 230, 232, 233, 235, 237, 238, 240, 242, 243, 244, 246, 247, 248, 249, 250, 251, 252, 252, 253, 254, 254, 255, 255, 255, 255, 255, 256];
export function sinDegrees(angle: number): number {
    angle = ((angle % 360) + 360) % 360;
    if (angle <= 90) return sineQuarter[angle];
    if (angle <= 180) return sineQuarter[180 - angle];
    if (angle <= 270) return -sineQuarter[angle - 180];
    return -sineQuarter[360 - angle];
}


// Quarter of the source gSineTable256; retain its integer rounding.
const sine256Quarter = [0, 804, 1607, 2410, 3211, 4011, 4808, 5602, 6392, 7179, 7961, 8739, 9512, 10278, 11039, 11793, 12539, 13278, 14010, 14732, 15446, 16151, 16846, 17530, 18204, 18868, 19519, 20159, 20787, 21403, 22005, 22594, 23170, 23732, 24279, 24812, 25329, 25832, 26319, 26790, 27245, 27684, 28106, 28510, 28898, 29269, 29621, 29956, 30273, 30572, 30852, 31114, 31357, 31581, 31785, 31971, 32138, 32285, 32413, 32521, 32610, 32679, 32728, 32758, 32767];
const sineExceptions = new Map([[85, 28511], [92, 25330], [181, -31580], [213, -28511], [220, -25330], [246, -7962]]);
export const sin256 = (angle: number): number => {
    angle &= 255;
    const exception = sineExceptions.get(angle);
    if (exception !== undefined) return exception;
    const quadrant = angle >>> 6, index = angle & 63;
    return (quadrant >= 2 ? -1 : 1) * sine256Quarter[(quadrant & 1) ? 64 - index : index];
};
export const cos256 = (angle: number) => sin256(angle + 64);
