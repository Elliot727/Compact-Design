/**
 * System inventory: every colour, type style, spacing, radius, effect and
 * component a document actually uses, with usage counts, the node ids that use
 * each value, and a token label when one applies. Input for the design system
 * sheet (PR 2). Pure: no host API.
 *
 * Rules
 * - Counting: `count` is the number of distinct layers using the value — one
 *   use per layer per value (a frame with 16 px padding on all sides counts
 *   once for 16), and flattened instance sublayers (`I<instance>;<layer>…`) are
 *   keyed on the layer path after the first ";" so N copies of a component
 *   count their insides once (inventoryLayerKey). `nodeIds` still lists every
 *   node id that uses the value, so nodeIds.length can exceed count.
 * - Invisible things are skipped: a visible:false node and its whole subtree,
 *   paints with visible:false or opacity 0, effects with visible:false.
 * - Zero spacing (gap/padding 0) and zero radius are dropped.
 * - Components keep per-instance counts (every INSTANCE node is one use).
 * - Equal values are de-duplicated, but a token-bound use and a raw use of the
 *   same value are always separate entries (key = value + token).
 * - Token labels come from bindings (variables) or styleRefs (styles),
 *   resolved by id then name against doc.variables / doc.styles. Unresolved
 *   keys keep the raw key with resolved:false.
 *   colour: bindings.fill / bindings.stroke label the first paint; styleRefs.fill / .stroke label every paint
 *   type: styleRefs.text; effects: styleRefs.effect (every effect on the node); spacing: bindings itemSpacing, counterAxisSpacing, paddingTop/Right/Bottom/Left
 *   radius: bindings cornerRadius, topLeftRadius, topRightRadius, bottomRightRadius, bottomLeftRadius
 * - Gaps are read through anatomy's layoutOf(); padding from the raw sides, so
 *   unset sides are skipped (not counted as 0). Non-numeric values are skipped.
 * - Colours: SOLID paints only, as #RRGGBB (or #RRGGBBAA when alpha × paint opacity < 1).
 * - Sorting: spacing and radius ascending; type by size, largest first; colours
 *   and effects by usage (most used first); ties keep first-seen order.
 * - Components: every COMPONENT, plus every componentId an INSTANCE points at
 *   (nested instances included). A componentId with no COMPONENT in the
 *   document is listed with missing:true.
 */
import { layoutOf, resources, walkNodes, type Resources } from "./anatomy";
import type { DesignColor, DesignEffect, DesignPaint, InternalDocument, LetterSpacing, LineHeight } from "./types";

export interface InventoryToken { kind: "variable" | "style"; ref: string; name: string; resolved: boolean }
export interface InventoryEntry<V> { value: V; token?: InventoryToken; count: number; nodeIds: string[] }
export interface InventoryTypeValue { family: string; style: string; size: number; lineHeight?: LineHeight; letterSpacing?: LetterSpacing }
export interface InventoryComponent { id: string; name: string; missing?: true; instanceCount: number; instanceIds: string[] }
export interface SystemInventory {
  colours: Array<InventoryEntry<string>>;
  type: Array<InventoryEntry<InventoryTypeValue>>;
  spacing: Array<InventoryEntry<number>>;
  radius: Array<InventoryEntry<number>>;
  effects: Array<InventoryEntry<DesignEffect>>;
  components: InventoryComponent[];
}

const round = (value: number): number => { const rounded = Math.round(value * 100) / 100; return rounded === 0 ? 0 : rounded; };
const hex2 = (value: number): string => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0").toUpperCase();
/** DesignColor channels are 0–255 (normalize), alpha 0–1. Alpha byte appended only when alpha × opacity < 1. */
export function colourHex(color: DesignColor, opacity = 1): string {
  const alpha = (color.a ?? 1) * opacity;
  return `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}${alpha < 1 ? hex2(alpha * 255) : ""}`;
}

/** Stable JSON (sorted keys) so equal objects share a key. */
const stable = (value: unknown): string => JSON.stringify(value, (_key, entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry));

/**
 * The layer a use belongs to. Flattened instance sublayers have ids like
 * `I<instance>;<layer>[;<nested layer>…]`; everything after the first ";" is
 * the layer path inside the main component, so N copies of one component count
 * their insides once. Layers placed directly (no ";") are their own key.
 */
export function inventoryLayerKey(nodeId: string): string {
  const cut = nodeId.indexOf(";");
  return cut < 0 ? nodeId : `main:${nodeId.slice(cut + 1)}`;
}

class Bucket<V> {
  private entries = new Map<string, { entry: InventoryEntry<V>; layers: Set<string> }>();
  /** count = distinct layer keys using this value (one per layer, however many sides/paints); nodeIds lists every node id. */
  add(value: V, nodeId: string, token?: InventoryToken): void {
    const key = `${stable(value)}|${token ? `${token.kind}:${token.ref}` : ""}`;
    const slot = this.entries.get(key) || { entry: { value, ...(token ? { token } : {}), count: 0, nodeIds: [] }, layers: new Set<string>() };
    slot.layers.add(inventoryLayerKey(nodeId));
    slot.entry.count = slot.layers.size;
    if (!slot.entry.nodeIds.includes(nodeId)) slot.entry.nodeIds.push(nodeId);
    this.entries.set(key, slot);
  }
  list(): Array<InventoryEntry<V>> { return [...this.entries.values()].map(({ entry }) => entry); }
}

function tokenFor(res: Resources, kind: "variable" | "style", ref: string | undefined): InventoryToken | undefined {
  if (!ref) return undefined;
  const name = kind === "variable" ? res.variable(ref)?.variable.name : res.style(ref)?.name;
  return { kind, ref, name: name ?? ref, resolved: name !== undefined };
}

/** A paint counts only when shown: not visible:false and not opacity 0 (normalize keeps both on authored paint objects). */
const paintVisible = (paint: DesignPaint): boolean => (paint as DesignPaint & { visible?: boolean }).visible !== false && paint.opacity !== 0;

const byUsage = <V>(entries: Array<InventoryEntry<V>>): Array<InventoryEntry<V>> => entries.map((entry, index) => ({ entry, index })).sort((a, b) => b.entry.count - a.entry.count || a.index - b.index).map(({ entry }) => entry);
const ascending = (entries: Array<InventoryEntry<number>>): Array<InventoryEntry<number>> => entries.map((entry, index) => ({ entry, index })).sort((a, b) => a.entry.value - b.entry.value || a.index - b.index).map(({ entry }) => entry);

export function systemInventory(doc: InternalDocument): SystemInventory {
  const res = resources(doc);
  const colours = new Bucket<string>(), type = new Bucket<InventoryTypeValue>(), spacing = new Bucket<number>(), radius = new Bucket<number>(), effects = new Bucket<DesignEffect>();
  const components = new Map<string, InventoryComponent>();
  const component = (id: string, name: string): InventoryComponent => {
    const entry = components.get(id) || { id, name, instanceCount: 0, instanceIds: [] };
    components.set(id, entry);
    return entry;
  };
  const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

  walkNodes(doc, (node) => {
    const p = node.properties;
    if (p.visible === false) return false; // hidden layer: skip it and its whole subtree
    const bindings = p.bindings || {};
    const styleRefs = p.styleRefs || {};
    for (const field of ["fill", "stroke"] as const) {
      const paints: DesignPaint[] = (field === "fill" ? p.styles?.fills : p.styles?.strokes) || [];
      paints.forEach((paint, index) => {
        if (paint.type !== "SOLID" || !paint.color || !paintVisible(paint)) return;
        const token = (index === 0 ? tokenFor(res, "variable", bindings[field]) : undefined) || tokenFor(res, "style", styleRefs[field]);
        colours.add(colourHex(paint.color, paint.opacity ?? 1), node.id, token);
      });
    }
    if (p.font && numeric(p.font.size)) {
      const value: InventoryTypeValue = { family: p.font.family, style: p.font.style, size: round(p.font.size) };
      if (p.lineHeight) value.lineHeight = p.lineHeight;
      if (p.letterSpacing) value.letterSpacing = p.letterSpacing;
      type.add(value, node.id, tokenFor(res, "style", styleRefs.text));
    }
    const layout = layoutOf(p.layout);
    if (layout) {
      const read = (value: number | "mixed" | undefined, field: string): void => { if (numeric(value) && round(value) !== 0) spacing.add(value, node.id, tokenFor(res, "variable", bindings[field])); };
      read(layout.gap, "itemSpacing");
      read(layout.crossGap, "counterAxisSpacing");
      // Padding comes from the raw sides: layoutOf fills unset sides with 0 (right for anatomy), which would count a 0 nobody set.
      const pad = p.layout?.padding || {};
      read(pad.top, "paddingTop"); read(pad.right, "paddingRight"); read(pad.bottom, "paddingBottom"); read(pad.left, "paddingLeft");
    }
    if (numeric(p.cornerRadius)) { if (round(p.cornerRadius) !== 0) radius.add(round(p.cornerRadius), node.id, tokenFor(res, "variable", bindings.cornerRadius)); }
    else if (Array.isArray(p.cornerRadii)) p.cornerRadii.forEach((corner, index) => { if (numeric(corner) && round(corner) !== 0) radius.add(round(corner), node.id, tokenFor(res, "variable", bindings[["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"][index]])); });
    for (const effect of (p.styles?.effects || []).filter((entry) => entry.visible !== false)) effects.add(effect, node.id, tokenFor(res, "style", styleRefs.effect));
    if (node.type === "COMPONENT") component(node.id, node.name);
    if (node.type === "INSTANCE" && p.componentId) {
      const entry = component(p.componentId, res.component(p.componentId)?.name ?? p.componentId);
      entry.instanceCount++;
      entry.instanceIds.push(node.id);
    }
  });

  return {
    colours: byUsage(colours.list()),
    type: type.list().map((entry, index) => ({ entry, index })).sort((a, b) => b.entry.value.size - a.entry.value.size || a.index - b.index).map(({ entry }) => entry),
    spacing: ascending(spacing.list()),
    radius: ascending(radius.list()),
    effects: byUsage(effects.list()),
    components: [...components.values()].map((entry) => (res.component(entry.id) ? entry : { ...entry, missing: true as const }))
  };
}
