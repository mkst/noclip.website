import * as UI from "../ui.js";
import type { ViewerRenderInput } from "../viewer.js";
import { colorNewFromRGBA8, colorToCSS } from "../Color.js";
import type { Color } from "../Color.js";
import { DebugDrawFlags } from "../gfx/helpers/DebugDraw.js";
import type { DebugDraw } from "../gfx/helpers/DebugDraw.js";
import { createGroundSnappedPathDisplayVariants, createPathDisplayVariants, describePathEntity, PATH_GROUND_CLEARANCE } from "./paths.js";
import type { PathAnalysis, PathDisplayRole, PathDisplayVariant, PathInfo } from "./paths.js";
import type { LevelMapEntry } from "./level.js";

const PATH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path d="M5 19L9 8L16 14L19 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <g fill="currentColor"><circle cx="5" cy="19" r="2.5"/><circle cx="9" cy="8" r="2"/><circle cx="16" cy="14" r="2"/><circle cx="19" cy="5" r="2.5"/></g>
</svg>`;

const STYLES: { role: PathDisplayRole; label: string; color: Color }[] = [
    { role: "camera", label: "Camera", color: colorNewFromRGBA8(0x50DBFFFF) },
    { role: "animal", label: "Animal", color: colorNewFromRGBA8(0xFFBE50FF) },
    { role: "object", label: "Object", color: colorNewFromRGBA8(0xF080DDFF) },
    { role: "unresolved", label: "Unresolved (raw)", color: colorNewFromRGBA8(0xDBDBDBFF) },
    { role: "unclassified", label: "Unclassified (raw)", color: colorNewFromRGBA8(0x909CA8FF) },
];

function pathTitle(info: PathInfo): string {
    return `P${info.path.index}: ${info.roles.join(" / ") || "unclassified"} (${info.path.waypoints.length} points)`;
}

export class PathOverlay {
    public enabled = false;
    public labels = true;
    public waypoints = false;
    public throughGeometry = false;
    public snapLandAnimals = false;
    public selectedPath: number | null = null;
    public roles = new Set<PathDisplayRole>(STYLES.map((style) => style.role));
    private authoredVariants: PathDisplayVariant[];
    private snappedVariants: PathDisplayVariant[];

    constructor(private analysis: PathAnalysis, map: readonly LevelMapEntry[]) {
        this.authoredVariants = createPathDisplayVariants(analysis);
        this.snappedVariants = createGroundSnappedPathDisplayVariants(analysis, map);
    }

    public get variants(): readonly PathDisplayVariant[] {
        return this.snapLandAnimals ? this.snappedVariants : this.authoredVariants;
    }

    public createPanel(): UI.Panel {
        const panel = new UI.Panel();
        panel.customHeaderBackgroundColor = UI.COOL_BLUE_COLOR;
        panel.setTitle(PATH_ICON, "Paths");
        const checkbox = (label: string, value: boolean, onchange: (checked: boolean) => void): UI.Checkbox => {
            const control = new UI.Checkbox(label, value);
            control.onchanged = () => onchange(control.checked);
            panel.contents.appendChild(control.elem);
            return control;
        };
        checkbox("Show Paths", this.enabled, (checked) => this.enabled = checked);

        const note = document.createElement("p");
        note.textContent = this.analysis.paths.length !== 0
            ? "Control points, not movement trajectories. Colours show possible uses. Raw paths have unresolved or unidentified consumers."
            : "This level has no waypoint paths.";
        note.style.fontSize = "0.85em";
        panel.contents.appendChild(note);

        for (const style of STYLES) {
            const count = this.authoredVariants.filter((variant) => variant.role === style.role).length;
            const control = checkbox(`${style.label} (${count})`, this.roles.has(style.role), (checked) => {
                if (checked)
                    this.roles.add(style.role);
                else
                    this.roles.delete(style.role);
                updateDetails();
            });
            control.elem.style.borderLeft = `4px solid ${colorToCSS(style.color)}`;
            control.elem.style.paddingLeft = "6px";
        }
        checkbox("Path Labels", this.labels, (checked) => this.labels = checked);
        checkbox("Waypoint Markers / Indices", this.waypoints, (checked) => this.waypoints = checked);
        checkbox("Show Through Geometry (Dimmed)", this.throughGeometry, (checked) => this.throughGeometry = checked);
        checkbox("Snap Land-Animal Waypoints to Ground", this.snapLandAnimals, (checked) => {
            this.snapLandAnimals = checked;
            updateDetails();
        });
        const groundNote = document.createElement("p");
        groundNote.textContent = `Ground snapping is a viewer projection onto base terrain (+${PATH_GROUND_CLEARANCE} units). Bridges, platforms and water are not sampled. Connecting lines remain straight.`;
        groundNote.style.fontSize = "0.85em";
        panel.contents.appendChild(groundNote);

        const selectionLabel = document.createElement("label");
        selectionLabel.textContent = "Path ";
        const selection = document.createElement("select");
        selection.setAttribute("aria-label", "Path");
        selection.style.cssText = "width:100%;padding:4px;background:#303030;color:white;font:inherit";
        const all = document.createElement("option");
        all.value = "all";
        all.textContent = "All paths";
        selection.appendChild(all);
        for (const info of this.analysis.paths) {
            const option = document.createElement("option");
            option.value = String(info.path.index);
            option.textContent = pathTitle(info);
            selection.appendChild(option);
        }
        selectionLabel.appendChild(selection);
        panel.contents.appendChild(selectionLabel);

        const details = document.createElement("div");
        details.style.cssText = "font-size:0.85em;white-space:pre-wrap;overflow-wrap:anywhere;height:10em;overflow-y:auto;margin-top:8px;user-select:text";
        const updateDetails = (): void => {
            const info = this.analysis.paths.find((path) => path.path.index === this.selectedPath);
            if (info === undefined) {
                details.textContent = "Select a path to inspect its command references and consumers.";
                return;
            }
            const lines = [pathTitle(info), "Storage order is not necessarily travel direction."];
            if (!info.roles.some((role) => this.roles.has(role)) && (info.roles.length !== 0 || !this.roles.has("unclassified")))
                lines.push("Hidden by the role filters.");
            if (info.uses.length === 0)
                lines.push("No identified command reference. Raw coordinates shown.");
            for (const use of info.uses) {
                const source = use.source;
                const owner = source === null ? "script source unresolved"
                    : `${describePathEntity(source.entity)}, ${source.activation} script (base ${source.scriptBase}, cursor ${source.initialCursor})`;
                const target = use.target === null ? use.role === "camera" ? "camera" : "target unresolved"
                    : describePathEntity(use.target);
                const assignment = source?.assignmentCommandIndex === undefined ? "" : ` assigned by command ${source.assignmentCommandIndex}`;
                lines.push(`Command ${use.commandIndex}: ${use.role}; ${owner}${assignment}; target: ${target}.`);
                if (use.role === "unresolved" && source === null)
                    lines.push("No assigned script trace reached this reference. It may be unused or beyond unsupported behaviour.");
            }
            if (this.snapLandAnimals) {
                const projected = this.variants.filter((variant) => variant.pathId === info.path.index && variant.animalProjection !== undefined);
                if (projected.length === 0 && info.roles.includes("animal"))
                    lines.push("No positively identified land-animal consumers; authored heights retained.");
                for (const variant of projected) {
                    const projection = variant.animalProjection!;
                    const consumers = projection.consumers.map((target) => describePathEntity(target)).join(", ");
                    if (projection.kind === "ground") {
                        lines.push(`Land-animal ground projection: ${consumers}.`);
                        lines.push(`${variant.points.length - projection.unsampledIndices.length}/${variant.points.length} points snapped to base terrain +${PATH_GROUND_CLEARANCE}.`);
                        if (projection.unsampledIndices.length !== 0)
                            lines.push(`Unsampled waypoint indices (authored heights retained): ${projection.unsampledIndices.join(", ")}.`);
                    } else {
                        lines.push(`Separate authored-height animal view for air/swim/unknown consumers: ${consumers || "target unresolved"}.`);
                    }
                }
            }
            details.textContent = lines.join("\n");
        };
        selection.onchange = () => {
            this.selectedPath = selection.value === "all" ? null : Number(selection.value);
            updateDetails();
        };
        updateDetails();
        panel.contents.appendChild(details);

        if (this.analysis.invalidUses.length !== 0) {
            const diagnostics = document.createElement("details");
            const summary = document.createElement("summary");
            const unique = new Set(this.analysis.invalidUses.map((use) => `Command ${use.commandIndex}: missing path ${use.pathId}`));
            summary.textContent = `${unique.size} invalid path reference(s), excluded`;
            diagnostics.appendChild(summary);
            const text = document.createElement("div");
            text.style.whiteSpace = "pre-wrap";
            text.textContent = Array.from(unique).join("\n");
            diagnostics.appendChild(text);
            panel.contents.appendChild(diagnostics);
        }
        const incomplete = this.analysis.diagnostics.filter((diagnostic) => diagnostic.kind !== "invalid-path");
        if (incomplete.length !== 0) {
            const diagnostics = document.createElement("details");
            const summary = document.createElement("summary");
            summary.textContent = `${incomplete.length} script analysis diagnostic(s)`;
            diagnostics.appendChild(summary);
            const reasons = new Map<string, number>();
            for (const diagnostic of incomplete)
                reasons.set(diagnostic.message, (reasons.get(diagnostic.message) ?? 0) + 1);
            const text = document.createElement("div");
            text.style.cssText = "font-size:0.85em;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text";
            text.textContent = Array.from(reasons, ([reason, count]) => `${count}: ${reason}`).join("\n");
            diagnostics.appendChild(text);
            panel.contents.appendChild(diagnostics);
        }
        return panel;
    }

    private drawLabel(draw: DebugDraw, input: ViewerRenderInput, text: string, point: [number, number, number], color: Color, flags: DebugDrawFlags, row: number = 0): void {
        const view = input.camera.viewMatrix;
        const depth = -(view[2] * point[0] + view[6] * point[1] + view[10] * point[2] + view[14]);
        if (depth <= 0)
            return;
        const fontSize = 28 * (input.camera.isOrthographic ? 1 : depth) / (input.backbufferHeight * Math.abs(input.camera.projectionMatrix[5]));
        const position: [number, number, number] = [point[0], point[1] + fontSize * (1.2 + row * 1.4), point[2]];
        draw.drawWorldText(text, position, color, { flags, fontSize, textAlign: "center" });
    }

    public draw(draw: DebugDraw, input: ViewerRenderInput): void {
        if (!this.enabled)
            return;
        const options = { flags: this.throughGeometry ? DebugDrawFlags.DepthTint : DebugDrawFlags.WorldSpace };
        for (const variant of this.variants) {
            if (!this.roles.has(variant.role) || (this.selectedPath !== null && variant.pathId !== this.selectedPath))
                continue;
            const style = STYLES.find((style) => style.role === variant.role)!;
            const points = variant.points;
            for (let i = 1; i < points.length; i++)
                draw.drawLine(points[i - 1], points[i], style.color, undefined, options);
            if (points.length === 0)
                continue;
            draw.drawLocator(points[0], 12, style.color, options);
            if (points.length > 1)
                draw.drawSphereLine(points[points.length - 1], 12, style.color, 12, options);
            if (this.labels) {
                const projectionLabel = variant.animalProjection?.kind === "ground" ? " land ground projection"
                    : variant.animalProjection?.kind === "authored" ? " air/swim/unknown authored"
                    : variant.role === "unresolved" || variant.role === "unclassified" ? " raw" : "";
                const row = 1 + STYLES.findIndex((entry) => entry.role === variant.role) + (variant.animalProjection?.kind === "authored" ? STYLES.length : 0);
                this.drawLabel(draw, input, `P${variant.pathId} ${variant.role}${projectionLabel} (${points.length} points)`, points[0], style.color, options.flags, row);
            }
            if (this.waypoints) {
                for (let i = 0; i < points.length; i++) {
                    draw.drawLocator(points[i], 6, style.color, options);
                    const end = i === 0 ? " first" : i === points.length - 1 ? " last" : "";
                    this.drawLabel(draw, input, `${i}${end}`, points[i], style.color, options.flags);
                }
            }
        }
    }
}
