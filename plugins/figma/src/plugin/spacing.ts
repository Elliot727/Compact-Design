/** "Select 2 layers" spacing readout. Geometry lives in @compact-design/core; this file adds the selection rule and UI text. No Figma API access. */
import { measureSpacing, type Spacing, type SpacingBox } from "@compact-design/core";

export { measureSpacing, roundPx } from "@compact-design/core";
export type { Spacing, SpacingApart, SpacingBox, SpacingInset, SpacingOverlap } from "@compact-design/core";

export interface SpacingHint { kind: "hint"; message: string }
export type SelectionSpacing = Spacing | SpacingHint;

export const SPACING_HINT = "Select exactly 2 layers";

/** Measures exactly two layers by absoluteBoundingBox (page coordinates, so nesting is irrelevant). */
export function selectionSpacing(selection: ReadonlyArray<{ absoluteBoundingBox: SpacingBox | null }>): SelectionSpacing {
  if (selection.length !== 2) return { kind: "hint", message: SPACING_HINT };
  const [a, b] = [selection[0].absoluteBoundingBox, selection[1].absoluteBoundingBox];
  if (!a || !b) return { kind: "hint", message: SPACING_HINT };
  return measureSpacing(a, b);
}

/** UI text. Overlap is reported as a positive depth, never as a negative gap. */
export function formatSpacing(spacing: SelectionSpacing): string {
  if (spacing.kind === "hint") return spacing.message;
  if (spacing.kind === "inset") return `Inset L ${spacing.left} · R ${spacing.right} · T ${spacing.top} · B ${spacing.bottom} px`;
  if (spacing.kind === "overlap") return `Overlapping by H ${-spacing.h} px · V ${-spacing.v} px`;
  if (spacing.axes.length === 1) return spacing.axes[0] === "h" ? `H ${spacing.h} px` : `V ${spacing.v} px`;
  return `H ${spacing.h} px · V ${spacing.v} px`;
}
