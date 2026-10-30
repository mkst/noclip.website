import { mat4, vec3 } from "gl-matrix";
import type { ReadonlyVec3 } from "gl-matrix";
import { particleProjectedHalfSize } from "./particles.js";
import type { Camera } from "../Camera.js";
import type { RSPSharedOutput } from "../BanjoKazooie/f3dex.js";
import { SSSVLayer } from "./terrain.js";
import type { SSSVDrawCall } from "./terrain.js";

export function rayTriangle(origin: ReadonlyVec3, direction: ReadonlyVec3, a: ReadonlyVec3, b: ReadonlyVec3, c: ReadonlyVec3): number | null {
    const ab = vec3.subtract(vec3.create(), b, a), ac = vec3.subtract(vec3.create(), c, a);
    const h = vec3.cross(vec3.create(), direction, ac), det = vec3.dot(ab, h);
    if (Math.abs(det) < 1e-8) return null;
    const s = vec3.subtract(vec3.create(), origin, a), u = vec3.dot(s, h) / det;
    if (u < 0 || u > 1) return null;
    const q = vec3.cross(vec3.create(), s, ab), v = vec3.dot(direction, q) / det;
    if (v < 0 || u + v > 1) return null;
    const distance = vec3.dot(ac, q) / det;
    return distance >= 0 ? distance : null;
}

export function pickButton(camera: Camera, ndcX: number, ndcY: number, output: RSPSharedOutput, calls: readonly SSSVDrawCall[], placementIndex: number): boolean {
    const inverse = mat4.invert(mat4.create(), camera.clipFromWorldMatrix);
    if (inverse === null) return false;
    const origin = vec3.fromValues(camera.worldMatrix[12], camera.worldMatrix[13], camera.worldMatrix[14]);
    const point = vec3.transformMat4(vec3.create(), [ndcX, ndcY, 0.5], inverse);
    const direction = vec3.normalize(vec3.create(), vec3.subtract(point, point, origin));
    let nearest = Infinity, selected = false;
    const vertices = [vec3.create(), vec3.create(), vec3.create()];
    for (const call of calls) {
        if (!call.visible || (call.translucent && call.switchBall === null) || ![SSSVLayer.Terrain, SSSVLayer.Objects].includes(call.layer)) continue;
        for (let i = 0; i < call.indexCount; i += 3) {
            for (let j = 0; j < 3; j++) {
                const v = output.vertices[output.indices[call.firstIndex + i + j]];
                vec3.set(vertices[j], v.x, v.y, v.z);
                if (call.switchBall !== null) {
                    const center = vec3.transformMat4(vec3.create(), call.center, camera.viewMatrix);
                    const depth = -center[2], fovY = 2 * Math.atan(1 / camera.projectionMatrix[5]) * 180 / Math.PI;
                    const half = particleProjectedHalfSize(call.switchBall.size, depth, fovY, 32) * depth / camera.projectionMatrix[5];
                    vec3.set(vertices[j], call.center[0] + half * (camera.worldMatrix[0] * v.x + camera.worldMatrix[4] * v.y),
                        call.center[1] + half * (camera.worldMatrix[1] * v.x + camera.worldMatrix[5] * v.y),
                        call.center[2] + half * (camera.worldMatrix[2] * v.x + camera.worldMatrix[6] * v.y));
                } else if (call.modelMatrix !== null) vec3.transformMat4(vertices[j], vertices[j], call.modelMatrix);
            }
            const distance = rayTriangle(origin, direction, vertices[0], vertices[1], vertices[2]);
            if (distance !== null && distance < nearest) { nearest = distance; selected = call.objectPlacementIndex === placementIndex; }
        }
    }
    return selected;
}

export class ButtonInput {
    private press: { x: number; y: number; moved: boolean } | null = null;
    constructor(private element: HTMLElement, private hit: (x: number, y: number) => boolean, private activate: () => void) {
        element.addEventListener('mousedown', this.down, true);
        window.addEventListener('mousemove', this.move);
        window.addEventListener('mouseup', this.up);
        window.addEventListener('blur', this.cancel);
    }
    private down = (e: MouseEvent): void => {
        if (e.button !== 0 || document.pointerLockElement !== null || !this.hit(e.clientX, e.clientY)) return;
        this.press = { x: e.clientX, y: e.clientY, moved: false };
        e.preventDefault(); e.stopImmediatePropagation();
    };
    private move = (e: MouseEvent): void => {
        if (this.press !== null && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 5) this.press.moved = true;
    };
    private up = (e: MouseEvent): void => {
        if (e.button !== 0 || this.press === null) return;
        const press = this.press; this.press = null;
        if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= 5 && this.hit(e.clientX, e.clientY)) this.activate();
    };
    private cancel = (): void => { this.press = null; };
    public destroy(): void {
        this.element.removeEventListener('mousedown', this.down, true);
        window.removeEventListener('mousemove', this.move); window.removeEventListener('mouseup', this.up); window.removeEventListener('blur', this.cancel);
        this.cancel();
    }
}
