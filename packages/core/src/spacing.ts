/** Pure spacing geometry between two page-space boxes. Shared by the Figma spacing readout and redlines(). No host API. */

export interface SpacingBox { x: number; y: number; width: number; height: number }

/** Boxes are disjoint (or touching). Axes whose ranges overlap report 0; only axes listed in `axes` have a real gap. */
export interface SpacingApart { kind: "apart"; h: number; v: number; axes: Array<"h" | "v"> }
/** Boxes intersect on both axes without containment. Amounts are negative (overlap depth per axis). */
export interface SpacingOverlap { kind: "overlap"; h: number; v: number }
/** One box contains the other (identical boxes included). Distances from the inner edges to the outer edges. */
export interface SpacingInset { kind: "inset"; left: number; right: number; top: number; bottom: number }
export type Spacing = SpacingApart | SpacingOverlap | SpacingInset;

/** Round to at most 2 decimals and normalise -0 to 0. */
export function roundPx(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function contains(outer: SpacingBox, inner: SpacingBox): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

/** Signed gap along one axis: positive = space between, 0 = touching, negative = overlap depth. */
function axisGap(aStart: number, aSize: number, bStart: number, bSize: number): number {
  return Math.max(aStart, bStart) - Math.min(aStart + aSize, bStart + bSize);
}

/** Symmetric: measureSpacing(a, b) deep-equals measureSpacing(b, a). */
export function measureSpacing(a: SpacingBox, b: SpacingBox): Spacing {
  const aOuter = contains(a, b);
  if (aOuter || contains(b, a)) {
    const [outer, inner] = aOuter ? [a, b] : [b, a];
    return {
      kind: "inset",
      left: roundPx(inner.x - outer.x),
      right: roundPx(outer.x + outer.width - (inner.x + inner.width)),
      top: roundPx(inner.y - outer.y),
      bottom: roundPx(outer.y + outer.height - (inner.y + inner.height))
    };
  }
  const h = axisGap(a.x, a.width, b.x, b.width);
  const v = axisGap(a.y, a.height, b.y, b.height);
  if (h < 0 && v < 0) return { kind: "overlap", h: roundPx(h), v: roundPx(v) };
  const axes: Array<"h" | "v"> = [];
  if (h >= 0) axes.push("h");
  if (v >= 0) axes.push("v");
  return { kind: "apart", h: roundPx(Math.max(h, 0)), v: roundPx(Math.max(v, 0)), axes };
}
