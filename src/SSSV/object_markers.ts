import { vec3 } from "gl-matrix";
import { RSP_Geometry, RSPSharedOutput, Vertex } from "../BanjoKazooie/f3dex.js";
import { colorNewFromRGBA } from "../Color.js";
import { mirrorZ } from "./level.js";
import type { LevelObjectPlacement } from "./level.js";
import type { LevelCommand } from "./paths.js";
import type { SSSVObjectData } from "./objects.js";
import { analyzeObjectRoles, describeObjectRoleReferences, OBJECT_ROLE_NAMES } from "./object_roles.js";
import type { ObjectRoleAnalysis } from "./object_roles.js";
import { readObjectVisibility } from "./object_startup.js";
import { COMBINE_UNTEXTURED, DP_OTHERMODE_H, RENDER_OPAQUE, SSSVDrawCall, SSSVLayer } from "./terrain.js";

export const HIDDEN_OBJECT_MARKER_COLOR = colorNewFromRGBA(0.25, 0.85, 1, 1);
export const UNRESOLVED_OBJECT_MARKER_COLOR = colorNewFromRGBA(1, 0.65, 0.15, 1);

export interface ObjectMarker {
    placementIndex: number;
    objectId: number;
    unresolved: boolean;
    roleAnalysis: ObjectRoleAnalysis;
    position: vec3;
    labelPosition: vec3;
    label: string;
}

const names: { [id: number]: string } = { 2: "Boulder", 23: "Flat block", 25: "Block", 28: "Fence post", 64: "Controller", 141: "Speaker" };
const radius = 16;

export function createObjectMarkers(placements: readonly LevelObjectPlacement[], table: ReadonlyMap<number, SSSVObjectData>, commands: readonly LevelCommand[]): ObjectMarker[] {
    const markers: ObjectMarker[] = [];
    for (const [placementIndex, placement] of placements.entries()) {
        const visibility = readObjectVisibility(placement, commands);
        if (!visibility.hidden && (visibility.resolved || (placement.unkC & 0x3F) !== 40)) continue;
        const entry = table.get(placement.id), scale = visibility.appearance?.scale ?? (entry?.scaleOverride || placement.scale || 2048);
        const y = placement.y + Math.floor((entry?.collideHeight ?? 0) * scale / 4096) + 24;
        const unresolved = !visibility.resolved;
        const name = names[placement.id] ?? `Object type ${placement.id}`;
        const roleAnalysis = analyzeObjectRoles(placement, entry, commands);
        const roles = roleAnalysis.roles.map(role => OBJECT_ROLE_NAMES[role]).join(", ");
        const references = describeObjectRoleReferences(roleAnalysis);
        markers.push({ placementIndex, objectId: placement.id, unresolved, roleAnalysis,
            position: vec3.fromValues(placement.x, y, mirrorZ(placement.z)),
            labelPosition: vec3.fromValues(placement.x, y + radius + 8, mirrorZ(placement.z)),
            label: `${unresolved ? "Unresolved" : "Hidden"}: ${name} #${placementIndex} · ${roles}${references ? ` · ${references}` : ""}` });
    }
    return markers;
}

export function buildObjectMarkers(output: RSPSharedOutput, markers: readonly ObjectMarker[]): SSSVDrawCall[] {
    if (markers.length === 0) return [];
    const call = new SSSVDrawCall();
    call.layer = SSSVLayer.ObjectMarkers; call.visible = false;
    call.SP_GeometryMode = RSP_Geometry.G_ZBUFFER | RSP_Geometry.G_SHADE | RSP_Geometry.G_SHADING_SMOOTH;
    call.SP_TextureState.set(false, 0, 0, 0, 0);
    call.DP_OtherModeH = DP_OTHERMODE_H; call.DP_OtherModeL = RENDER_OPAQUE; call.DP_Combine = COMBINE_UNTEXTURED;
    call.firstIndex = output.indices.length;
    const corners = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [0, -1, 0]];
    for (const marker of markers) {
        const base = output.vertices.length;
        const color = marker.unresolved ? UNRESOLVED_OBJECT_MARKER_COLOR : HIDDEN_OBJECT_MARKER_COLOR;
        for (const [x, y, z] of corners) {
            const v = new Vertex(), shade = 0.75 + 0.25 * y;
            v.x = marker.position[0] + x * radius; v.y = marker.position[1] + y * radius; v.z = marker.position[2] + z * radius;
            v.matrixIndex = 1; v.c0 = color.r * shade; v.c1 = color.g * shade; v.c2 = color.b * shade; v.a = 1;
            output.vertices.push(v);
        }
        for (let i = 0; i < 4; i++) {
            const a = base + 1 + i, b = base + 1 + (i + 1) % 4;
            output.indices.push(base, a, b, base + 5, b, a);
        }
    }
    call.indexCount = output.indices.length - call.firstIndex;
    return [call];
}
