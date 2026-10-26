/**
 * Redline spec: for each container, its declared padding and the spacing
 * between neighbouring children (child order, n-1 pairs), each value checked
 * against the document's FLOAT tokens. Pure: no host API.
 *
 * Rules
 * - Positions are page-absolute after normalize(), so neighbours are measured
 *   with measureSpacing() on their position/size boxes. Rotated layers are
 *   measured by their stored box (same caveat as the Figma spacing readout).
 * - Hidden children and layoutPositioning ABSOLUTE children are skipped; the
 *   pair is formed from the remaining children in order. Hidden containers and
 *   instances (leaves) produce no entry.
 * - On-token: a value is on-token when its field is bound (bindings), when it
 *   is 0, or when it equals a FLOAT variable value in any mode of
 *   document.variables. The check is "vs exported FLOAT tokens": the Figma
 *   export only carries variables the selection uses.
 * - Auto-layout (HORIZONTAL / VERTICAL): each gap carries the declared
 *   itemSpacing as `expected`; `mismatch` is set when the signed primary-axis
 *   gap differs from it by more than 0.5 px. SPACE_BETWEEN gaps are never
 *   flagged. Wrapping and GRID layouts are skipped with a note.
 */
import { measureSpacing, roundPx, type Spacing, type SpacingBox } from "./spacing";
import type { InternalDocument, InternalNode } from "./types";

export interface RedlinePadding { l: number; t: number; r: number; b: number; offToken: Array<"l" | "t" | "r" | "b"> }
export interface RedlineGap {
  from: string; to: string;
  spacing: Spacing;
  /** Declared auto-layout itemSpacing (auto-layout containers only). */
  expected?: number;
  /** Measured primary-axis gap differs from `expected` by more than 0.5 px. */
  mismatch?: true;
  offToken: boolean;
}
export interface RedlineContainer {
  id: string; name: string;
  /** Declared auto-layout padding; absent for containers without auto-layout. */
  padding?: RedlinePadding;
  gaps: RedlineGap[];
  notes?: string[];
}

export const REDLINE_TOKEN_LABEL = "vs exported FLOAT tokens";
export const REDLINE_TOKEN_NOTE = "On-token means bound, 0, or equal to a FLOAT token value (any mode) — vs exported FLOAT tokens, which only include tokens the selection uses.";
export const REDLINE_NO_TOKENS_NOTE = "No FLOAT tokens in the export: every unbound non-zero value is flagged off-token.";
export const REDLINE_WRAP_NOTE = "Wrapping layout: gaps not measured.";
export const REDLINE_GRID_NOTE = "Grid layout: gaps not measured.";

const CONTAINER_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "GROUP", "SECTION", "BOOLEAN_OPERATION"]);
const TOLERANCE = 0.5;

/** All numeric FLOAT values (default and every mode) across document.variables. */
export function floatTokenValues(doc: InternalDocument): number[] {
  const values = new Set<number>();
  for (const collection of doc.variables || []) for (const variable of collection.items || []) {
    if (variable.type !== "FLOAT") continue;
    for (const value of [variable.value, ...Object.values(variable.values || {})]) if (typeof value === "number" && Number.isFinite(value)) values.add(roundPx(value));
  }
  return [...values];
}

const box = (node: InternalNode): SpacingBox | null => {
  const { position, size } = node.properties;
  const values = [position?.x, position?.y, size?.width, size?.height];
  return values.every((value) => typeof value === "number" && Number.isFinite(value)) ? { x: position.x, y: position.y, width: size.width, height: size.height } : null;
};

function container(node: InternalNode, tokens: number[]): RedlineContainer {
  const p = node.properties;
  const bindings = p.bindings || {};
  const onToken = (value: number, field?: string): boolean => (field !== undefined && Boolean(bindings[field])) || roundPx(value) === 0 || tokens.includes(roundPx(value));
  const out: RedlineContainer = { id: node.id, name: node.name, gaps: [] };
  const notes: string[] = [];
  const layout = p.layout;
  const auto = layout?.direction === "HORIZONTAL" || layout?.direction === "VERTICAL" ? layout.direction : undefined;
  if (layout?.direction) {
    const pad = layout.padding || {};
    const sides = { l: pad.left ?? 0, t: pad.top ?? 0, r: pad.right ?? 0, b: pad.bottom ?? 0 };
    const fields = { l: "paddingLeft", t: "paddingTop", r: "paddingRight", b: "paddingBottom" } as const;
    out.padding = { l: roundPx(sides.l), t: roundPx(sides.t), r: roundPx(sides.r), b: roundPx(sides.b), offToken: (["l", "t", "r", "b"] as const).filter((side) => !onToken(sides[side], fields[side])) };
  }
  if (layout?.direction === "GRID") notes.push(REDLINE_GRID_NOTE);
  else if (auto && layout?.wrap) notes.push(REDLINE_WRAP_NOTE);
  else {
    const flow = node.children.filter((child) => child.properties.visible !== false && child.properties.layoutPositioning !== "ABSOLUTE");
    const spaceBetween = layout?.primaryAxisAlignItems === "SPACE_BETWEEN";
    const expected = auto && typeof layout?.itemSpacing === "number" ? layout.itemSpacing : undefined;
    for (let index = 1; index < flow.length; index++) {
      const [prev, next] = [flow[index - 1], flow[index]];
      const [a, b] = [box(prev), box(next)];
      if (!a || !b) { notes.push(`${prev.name} → ${next.name}: size or position is mixed, not measured.`); continue; }
      const spacing = measureSpacing(a, b);
      const gap: RedlineGap = { from: prev.id, to: next.id, spacing, offToken: false };
      if (auto) {
        if (expected !== undefined) gap.expected = roundPx(expected);
        if (!spaceBetween) {
          const measured = auto === "HORIZONTAL" ? b.x - (a.x + a.width) : b.y - (a.y + a.height);
          if (expected !== undefined && Math.abs(measured - expected) > TOLERANCE) gap.mismatch = true;
          if (expected !== undefined) gap.offToken = !onToken(expected, "itemSpacing");
        }
      } else if (spacing.kind === "apart") {
        gap.offToken = spacing.axes.some((axis) => !onToken(spacing[axis]));
      }
      out.gaps.push(gap);
    }
  }
  if (notes.length) out.notes = notes;
  return out;
}

/** One RedlineContainer per visible container (frame, component, group, section…) in document order, depth-first. */
export function redlines(doc: InternalDocument): RedlineContainer[] {
  const tokens = floatTokenValues(doc);
  const result: RedlineContainer[] = [];
  const visit = (node: InternalNode): void => {
    if (node.properties.visible === false || node.type === "INSTANCE") return;
    if (CONTAINER_TYPES.has(node.type) || node.properties.layout?.direction) result.push(container(node, tokens));
    node.children.forEach(visit);
  };
  doc.nodes.forEach(visit);
  return result;
}

const md = (value: string): string => value.replace(/([\\*_`|[\]<>])/g, "\\$1");

function spacingText(spacing: Spacing): string {
  if (spacing.kind === "inset") return `inset L ${spacing.left} · R ${spacing.right} · T ${spacing.top} · B ${spacing.bottom}`;
  if (spacing.kind === "overlap") return `overlap H ${-spacing.h} · V ${-spacing.v}`;
  return spacing.axes.map((axis) => `${axis.toUpperCase()} ${spacing[axis]}`).join(" · ");
}

/** Markdown lines for the "Redlines" section (heading included). */
export function redlinesMarkdown(doc: InternalDocument): string[] {
  const containers = redlines(doc);
  const names = new Map<string, string>();
  const index = (node: InternalNode): void => { names.set(node.id, node.name); node.children.forEach(index); };
  doc.nodes.forEach(index);
  const lines = ["## Redlines", "", `_Off-token check ${REDLINE_TOKEN_LABEL}. ${REDLINE_TOKEN_NOTE}_`, ""];
  if (!floatTokenValues(doc).length) lines.push(`- ${REDLINE_NO_TOKENS_NOTE}`, "");
  if (!containers.length) return [...lines, "_None._", ""];
  for (const c of containers) {
    lines.push(`- **${md(c.name)}**`);
    if (c.padding) {
      const p = c.padding;
      lines.push(`  - padding L ${p.l} · T ${p.t} · R ${p.r} · B ${p.b} px${p.offToken.length ? ` ⚠ off-token ${p.offToken.map((side) => side.toUpperCase()).join(", ")}` : ""}`);
    }
    for (const gap of c.gaps) {
      const flags: string[] = [];
      if (gap.mismatch) flags.push(`⚠ ≠ itemSpacing ${gap.expected}`);
      if (gap.offToken) flags.push("⚠ off-token");
      const expected = gap.expected !== undefined && !gap.mismatch ? ` (itemSpacing ${gap.expected})` : "";
      lines.push(`  - ${md(names.get(gap.from) || gap.from)} → ${md(names.get(gap.to) || gap.to)}: ${spacingText(gap.spacing)} px${expected}${flags.length ? ` ${flags.join(" ")}` : ""}`);
    }
    if (!c.gaps.length && !c.notes) lines.push("  - no neighbouring layers");
    for (const note of c.notes || []) lines.push(`  - ${md(note)}`);
  }
  return [...lines, ""];
}
