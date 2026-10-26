/**
 * Design system sheet: renders a SystemInventory as an importable spec board —
 * one root FRAME (vertical auto-layout) holding a header and the sections
 * Colours, Type, Spacing, Radius, Effects. Pure: no host API, never reads the
 * clock (the host passes sourceName and generatedAt). No Components section:
 * inventory.components stays available to JSON/MCP consumers but is not drawn.
 *
 * - Visuals come from SHEET_THEME (sheet-theme.ts); this file holds no hex
 *   literal, so the only colours it emits besides the theme are inventory values.
 * - Layout: a fixed 12-column grid (theme column + gutter) inside the page
 *   margin. Each section = title, one-line note, thin divider, then its body;
 *   an empty section reads "None in this frame".
 * - Renderers: colour swatch cards (bound group first, then raw; inventory order
 *   kept inside each group), type specimen rows in the exact font, spacing ruler
 *   rows (bar = value × SPACING_SCALE, clamped to the track), radius squares
 *   (radius clamped to half the side) and effect cards carrying the effect.
 * - Token pills: bound = accent pill with the token name, raw = muted "Raw"
 *   pill, unresolved ref = amber "Unresolved" note next to the pill.
 * - Ids are `<id>-<section>-<index>[-part]` (index = inventory index), all
 *   prefixed by options.id, so a re-run with the same options yields the same
 *   ids (stable; REPLACE-friendly).
 */
import { normalizeDocument } from "./normalize";
import { SHEET_THEME } from "./sheet-theme";
import type { InventoryEntry, InventoryToken, InventoryTypeValue, SystemInventory } from "./system-inventory";
import type { DesignEffect, InternalDocument, InternalNode, LetterSpacing, LineHeight } from "./types";

export interface SystemSheetOptions {
  id: string;
  origin: { x: number; y: number };
  /** Name of the selected root frame; the sheet's title. */
  sourceName: string;
  /** Display date supplied by the host (core never reads the clock). */
  generatedAt: string;
}

export const SYSTEM_SHEET_SECTIONS = ["Colours", "Type", "Spacing", "Radius", "Effects"] as const;

const T = SHEET_THEME;
const C = T.colour;
/** Width of `cols` grid columns including the gutters between them. */
export const sheetSpan = (cols: number): number => cols * T.grid.column + (cols - 1) * T.space.gridGutter;
const CONTENT_WIDTH = sheetSpan(T.grid.columns);
const PAGE_WIDTH = CONTENT_WIDTH + 2 * T.space.pageMargin;
const CARD_WIDTH = sheetSpan(2);
/** Spacing ruler: px of bar per px of spacing. */
export const SPACING_SCALE = 2;
const RULER_PAD = 24;
const RULER_LABEL = sheetSpan(3);
const RULER_USES = 72;
/** Track (max bar length) inside the spacing card. */
export const SPACING_TRACK = CONTENT_WIDTH - 2 * RULER_PAD - RULER_LABEL - RULER_USES - 2 * T.space.gridGutter;
export const RADIUS_SAMPLE = 64;
export const EFFECT_SAMPLE = 96;
const SAMPLE_SENTENCE = "The quick brown fox jumps";

export const sheetSpacingBar = (value: number): number => Math.max(1, Math.min(SPACING_TRACK, Math.round(Math.abs(value) * SPACING_SCALE)));
export const sheetRadiusSample = (value: number): number => Math.min(RADIUS_SAMPLE / 2, Math.max(0, value));

export interface SheetTokenPill { kind: "bound" | "raw"; text: string; unresolved: boolean }

/** How a value's token is labelled on the sheet: bound pill with the token name, or a "Raw" pill. */
export function systemSheetTokenPill(token: InventoryToken | undefined): SheetTokenPill {
  if (!token) return { kind: "raw", text: "Raw", unresolved: false };
  return { kind: "bound", text: token.name, unresolved: !token.resolved };
}

type Compact = Record<string, unknown>;
interface Font { style: string; size: number }
const lh = (size: number): number => Math.round(size * 1.4);
const estWidth = (value: string, size: number, mono = false): number => Math.ceil(value.length * size * (mono ? 0.62 : 0.56));

function text(id: string, value: string, font: Font, fill: string = C.text, options: { mono?: boolean; width?: number; name?: string; lines?: number } = {}): Compact {
  const family = options.mono ? T.font.mono : T.font.family;
  const width = options.width;
  return {
    id, name: options.name ?? value, type: "TEXT", text: value, fill,
    font: { family, style: font.style, size: font.size }, lineHeight: { unit: "PIXELS", value: lh(font.size) },
    w: width ?? estWidth(value, font.size, options.mono), h: lh(font.size) * (options.lines ?? 1),
    textAutoResize: width ? "HEIGHT" : "WIDTH_AND_HEIGHT",
    layoutSizingHorizontal: width ? "FIXED" : "HUG", layoutSizingVertical: "HUG"
  };
}

interface FrameOptions { gap?: number; pad?: [number, number, number, number]; fill?: string; radius?: number; width?: number; wrap?: boolean; rowGap?: number; align?: "MIN" | "CENTER"; stroke?: string; extra?: Compact }
function frame(id: string, name: string, direction: "HORIZONTAL" | "VERTICAL", children: Compact[], o: FrameOptions = {}): Compact {
  const [top, right, bottom, left] = o.pad ?? [0, 0, 0, 0];
  const fixedW = o.width !== undefined;
  const horizontalMode = fixedW ? "FIXED" : "HUG";
  return {
    id, name, type: "FRAME", w: o.width ?? 1, h: 1,
    ...(o.fill ? { fill: o.fill } : { fills: [] }),
    ...(o.radius ? { cornerRadius: o.radius } : {}),
    ...(o.stroke ? { stroke: o.stroke, strokeWeight: 1, strokeAlign: "INSIDE" } : {}),
    layout: {
      direction, itemSpacing: o.gap ?? 0, padding: { top, right, bottom, left },
      ...(o.wrap ? { wrap: true, counterAxisSpacing: o.rowGap ?? o.gap ?? 0 } : {}),
      counterAxisAlignItems: o.align ?? "MIN",
      primaryAxisSizingMode: direction === "HORIZONTAL" ? (fixedW ? "FIXED" : "AUTO") : "AUTO",
      counterAxisSizingMode: direction === "VERTICAL" ? (fixedW ? "FIXED" : "AUTO") : "AUTO"
    },
    layoutSizingHorizontal: horizontalMode, layoutSizingVertical: "HUG",
    children, ...(o.extra ?? {})
  };
}

const rect = (id: string, name: string, w: number, h: number, fill: string, extra: Compact = {}): Compact => ({ id, name, type: "RECTANGLE", w, h, fill, layoutSizingHorizontal: "FIXED", layoutSizingVertical: "FIXED", ...extra });

/** Bottom-up size estimate for hug frames, so the HTML preview and Figma's first paint are close. */
function measure(node: Compact): { w: number; h: number } {
  const children = (node.children as Compact[] | undefined) ?? [];
  const sizes = children.map(measure);
  const layout = node.layout as { direction?: string; itemSpacing: number; counterAxisSpacing?: number; wrap?: boolean; padding: { top: number; right: number; bottom: number; left: number } } | undefined;
  if (node.type === "TEXT" && node.textAutoResize === "HEIGHT" && !String(node.text).includes("\n")) {
    const font = node.font as { size: number; family: string };
    const lines = Math.max(1, Math.ceil(estWidth(String(node.text), font.size, font.family === T.font.mono) / (node.w as number)));
    node.h = lines * (node.h as number);
  }
  if (layout?.direction) {
    const { padding: p, itemSpacing: gap } = layout;
    const fixedW = node.layoutSizingHorizontal === "FIXED";
    let w: number, h: number;
    if (layout.direction === "VERTICAL") {
      w = Math.max(0, ...sizes.map((s) => s.w)); h = sizes.reduce((sum, s) => sum + s.h, 0) + gap * Math.max(0, sizes.length - 1);
    } else if (layout.wrap && fixedW) {
      const inner = (node.w as number) - p.left - p.right; let x = 0, rowH = 0; h = 0; w = inner;
      sizes.forEach((s, index) => { if (index && x + s.w > inner) { h += rowH + (layout.counterAxisSpacing ?? gap); x = 0; rowH = 0; } x += s.w + gap; rowH = Math.max(rowH, s.h); });
      h += rowH;
    } else {
      w = sizes.reduce((sum, s) => sum + s.w, 0) + gap * Math.max(0, sizes.length - 1); h = Math.max(0, ...sizes.map((s) => s.h));
    }
    if (!fixedW) node.w = Math.ceil(w + p.left + p.right);
    if (node.layoutSizingVertical === "HUG") node.h = Math.ceil(h + p.top + p.bottom);
  }
  return { w: node.w as number, h: node.h as number };
}

/** Split a token name into lines of at most maxChars, breaking after "/" or "-" where possible (never mid-word unless a part is longer than a line). */
export function breakTokenName(name: string, maxChars: number): string[] {
  if (name.length <= maxChars) return [name];
  const parts = name.match(/[^/-]+[/-]?|[/-]/g) ?? [name];
  const lines: string[] = [];
  let line = "";
  for (let part of parts) {
    while (part.length > maxChars) { if (line) { lines.push(line); line = ""; } lines.push(part.slice(0, maxChars)); part = part.slice(maxChars); }
    if (line && line.length + part.length > maxChars) { lines.push(line); line = ""; }
    line += part;
  }
  if (line) lines.push(line);
  return lines;
}

/** Token pill; a name wider than maxWidth wraps inside a fixed-width pill (softer corners) instead of overflowing. */
function pill(id: string, token: InventoryToken | undefined, maxWidth: number): Compact {
  const label = systemSheetTokenPill(token);
  const bound = label.kind === "bound";
  const inner = maxWidth - 16;
  const lines = breakTokenName(label.text, Math.floor(inner / (T.type.label.size * 0.56)));
  const wraps = lines.length > 1;
  const chip = frame(`${id}-pill`, bound ? `Token: ${label.text}` : "Raw", "HORIZONTAL", [
    text(`${id}-pill-text`, lines.join("\n"), T.type.label, bound ? C.accent : C.muted, wraps ? { width: inner, name: label.text, lines: lines.length } : {})
  ], { pad: [2, 8, 2, 8], fill: bound ? C.accentTint : C.rawTint, radius: wraps ? 6 : T.pillRadius, ...(wraps ? { width: maxWidth } : {}) });
  if (!label.unresolved) return chip;
  return frame(`${id}-token`, "Token", "VERTICAL", [
    chip,
    frame(`${id}-unresolved`, "Unresolved", "HORIZONTAL", [text(`${id}-unresolved-text`, "Unresolved", T.type.label, C.warning)], { pad: [2, 8, 2, 8], fill: C.warningTint, radius: T.pillRadius })
  ], { gap: 4 });
}

const uses = (count: number): string => `${count} use${count === 1 ? "" : "s"}`;
const usesText = (id: string, count: number): Compact => text(`${id}-uses`, uses(count), T.type.caption, C.muted);
const tileName = <V>(valueText: string, entry: InventoryEntry<V>): string => `${valueText} · ${entry.token ? `bound ${entry.token.name}` : "raw"}`;

function section(id: string, title: string, note: string, body: Compact[]): Compact {
  return frame(id, title, "VERTICAL", [
    frame(`${id}-header`, `${title} header`, "VERTICAL", [
      text(`${id}-title`, title, T.type.sectionHeading),
      text(`${id}-note`, note, T.type.body, C.muted)
    ], { gap: 4 }),
    rect(`${id}-divider`, "Divider", CONTENT_WIDTH, 1, C.divider),
    ...(body.length ? body : [text(`${id}-none`, "None in this frame", T.type.body, C.muted)])
  ], { gap: 20, width: CONTENT_WIDTH });
}

const cardRow = (id: string, name: string, cards: Compact[]): Compact => frame(id, name, "HORIZONTAL", cards, { gap: T.space.gridGutter, wrap: true, rowGap: T.space.gridGutter, width: CONTENT_WIDTH });

function colourCard(tid: string, entry: InventoryEntry<string>): Compact {
  const pad = T.space.cardPadding;
  return frame(tid, tileName(entry.value, entry), "VERTICAL", [
    rect(`${tid}-swatch`, "Swatch", CARD_WIDTH, 96, entry.value, { cornerRadii: [T.cardRadius, T.cardRadius, 0, 0] }),
    frame(`${tid}-info`, "Info", "VERTICAL", [
      text(`${tid}-value`, entry.value, T.type.monoValue, C.text, { mono: true }),
      pill(tid, entry.token, CARD_WIDTH - 2 * pad),
      usesText(tid, entry.count)
    ], { gap: 8, pad: [12, pad, pad, pad], width: CARD_WIDTH })
  ], { fill: C.card, radius: T.cardRadius, stroke: C.divider, width: CARD_WIDTH });
}

function coloursBody(base: string, colours: Array<InventoryEntry<string>>): Compact[] {
  const groups: Array<[string, string, Array<[number, InventoryEntry<string>]>]> = [
    ["bound", "Bound to tokens", colours.map((entry, index): [number, InventoryEntry<string>] => [index, entry]).filter(([, entry]) => entry.token)],
    ["raw", "Raw values", colours.map((entry, index): [number, InventoryEntry<string>] => [index, entry]).filter(([, entry]) => !entry.token)]
  ];
  return groups.filter(([, , items]) => items.length).map(([key, label, items]) => frame(`${base}-${key}`, label, "VERTICAL", [
    text(`${base}-${key}-heading`, `${label} · ${items.length}`, T.type.subheading, C.muted),
    cardRow(`${base}-${key}-cards`, `${label} cards`, items.map(([index, entry]) => colourCard(`${base}-${index}`, entry)))
  ], { gap: 12, width: CONTENT_WIDTH }));
}

const num = (value: number | undefined): string => String(Math.round((value ?? 0) * 100) / 100);
const lineHeightText = (value: LineHeight | undefined): string => !value || value.unit === "AUTO" ? "auto" : value.unit === "PIXELS" ? `${num(value.value)} px` : `${num(value.value)}%`;
const letterSpacingText = (value: LetterSpacing | undefined): string => !value || !num(value.value) || num(value.value) === "0" ? "0" : value.unit === "PIXELS" ? `${num(value.value)} px` : `${num(value.value)}%`;
export const sheetTypeMeta = (v: InventoryTypeValue): string => `${v.family} · ${v.style} · ${v.size} px · Line height ${lineHeightText(v.lineHeight)} · Letter spacing ${letterSpacingText(v.letterSpacing)}`;

function typeRow(tid: string, entry: InventoryEntry<InventoryTypeValue>): Compact {
  const v = entry.value;
  const pad = 24;
  const specimenWidth = CONTENT_WIDTH - 2 * pad - RULER_LABEL - T.space.gridGutter;
  const sample: Compact = {
    id: `${tid}-sample`, name: "Specimen", type: "TEXT", text: SAMPLE_SENTENCE, fill: C.text,
    font: { family: v.family, style: v.style, size: v.size },
    ...(v.lineHeight && v.lineHeight.unit !== "AUTO" ? { lineHeight: v.lineHeight } : {}),
    ...(v.letterSpacing ? { letterSpacing: v.letterSpacing } : {}),
    w: specimenWidth,
    h: v.lineHeight?.unit === "PIXELS" && v.lineHeight.value ? v.lineHeight.value : v.lineHeight?.unit === "PERCENT" && v.lineHeight.value ? Math.round(v.size * v.lineHeight.value / 100) : Math.round(v.size * 1.25),
    textAutoResize: "HEIGHT", layoutSizingHorizontal: "FIXED", layoutSizingVertical: "HUG"
  };
  return frame(tid, tileName(`${v.family} ${v.style} ${v.size}`, entry), "HORIZONTAL", [
    frame(`${tid}-spec`, "Spec", "VERTICAL", [
      text(`${tid}-name`, entry.token ? entry.token.name : `${v.family} ${v.style}`, T.type.subheading, C.text, { width: RULER_LABEL }),
      pill(tid, entry.token, RULER_LABEL),
      usesText(tid, entry.count)
    ], { gap: 8, width: RULER_LABEL }),
    frame(`${tid}-specimen`, "Specimen column", "VERTICAL", [
      sample,
      text(`${tid}-meta`, sheetTypeMeta(v), T.type.caption, C.muted, { mono: true, width: specimenWidth })
    ], { gap: 8, width: specimenWidth })
  ], { gap: T.space.gridGutter, pad: [pad, pad, pad, pad], fill: C.card, radius: T.cardRadius, stroke: C.divider, width: CONTENT_WIDTH });
}

function spacingCard(base: string, spacing: Array<InventoryEntry<number>>): Compact[] {
  if (!spacing.length) return [];
  const rows = spacing.map((entry, index) => {
    const tid = `${base}-${index}`;
    return frame(tid, tileName(`${entry.value} px`, entry), "HORIZONTAL", [
      frame(`${tid}-label`, "Label", "HORIZONTAL", [
        text(`${tid}-value`, `${entry.value} px`, T.type.monoValue, C.text, { mono: true, width: 56 }),
        pill(tid, entry.token, RULER_LABEL - 68)
      ], { gap: 12, width: RULER_LABEL, align: "CENTER" }),
      frame(`${tid}-track`, "Track", "HORIZONTAL", [
        rect(`${tid}-bar`, "Bar", sheetSpacingBar(entry.value), 12, C.accent, { cornerRadius: 3 })
      ], { width: SPACING_TRACK, fill: C.rawTint, radius: 3 }),
      text(`${tid}-uses`, uses(entry.count), T.type.caption, C.muted, { width: RULER_USES })
    ], { gap: T.space.gridGutter, width: CONTENT_WIDTH - 2 * RULER_PAD, align: "CENTER" });
  });
  return [frame(`${base}-ruler`, "Ruler", "VERTICAL", rows, { gap: 16, pad: [RULER_PAD, RULER_PAD, RULER_PAD, RULER_PAD], fill: C.card, radius: T.cardRadius, stroke: C.divider, width: CONTENT_WIDTH })];
}

function radiusCard(tid: string, entry: InventoryEntry<number>): Compact {
  const pad = T.space.cardPadding;
  return frame(tid, tileName(`${entry.value} px`, entry), "VERTICAL", [
    rect(`${tid}-sample`, "Corner sample", RADIUS_SAMPLE, RADIUS_SAMPLE, C.accentTint, { cornerRadius: sheetRadiusSample(entry.value), stroke: C.accent, strokeWeight: 1.5, strokeAlign: "INSIDE" }),
    text(`${tid}-value`, `${entry.value} px`, T.type.monoValue, C.text, { mono: true }),
    pill(tid, entry.token, CARD_WIDTH - 2 * pad),
    usesText(tid, entry.count)
  ], { gap: 8, pad: [pad, pad, pad, pad], fill: C.card, radius: T.cardRadius, stroke: C.divider, width: CARD_WIDTH });
}

const r2 = (value: number): number => Math.round(value * 100) / 100;
const effectText = (effect: DesignEffect): string => [effect.type, effect.offset ? `${r2(effect.offset.x)},${r2(effect.offset.y)}` : "", effect.radius !== undefined ? `r${r2(effect.radius)}` : "", effect.spread ? `s${r2(effect.spread)}` : ""].filter(Boolean).join(" ");

function effectCard(tid: string, entry: InventoryEntry<DesignEffect>): Compact {
  const pad = T.space.cardPadding;
  const inner = CARD_WIDTH - 2 * pad;
  const side = (inner - EFFECT_SAMPLE) / 2;
  const stage = frame(`${tid}-stage`, "Stage", "VERTICAL", [
    rect(`${tid}-sample`, "Effect sample", EFFECT_SAMPLE, EFFECT_SAMPLE, C.card, { cornerRadius: T.cardRadius })
  ], { pad: [20, side, 20, side], width: inner, fill: C.background, radius: 8, align: "CENTER" });
  return frame(tid, tileName(effectText(entry.value), entry), "VERTICAL", [
    stage,
    text(`${tid}-value`, effectText(entry.value), T.type.monoValue, C.text, { mono: true, width: inner }),
    pill(tid, entry.token, inner),
    usesText(tid, entry.count)
  ], { gap: 8, pad: [pad, pad, pad, pad], fill: C.card, radius: T.cardRadius, stroke: C.divider, width: CARD_WIDTH });
}

function header(id: string, inventory: SystemInventory, options: SystemSheetOptions): Compact {
  const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);
  const stats: Array<[string, number, string]> = [
    ["colours", inventory.colours.length, plural(inventory.colours.length, "Colour", "Colours")],
    ["type", inventory.type.length, plural(inventory.type.length, "Type style", "Type styles")],
    ["spacing", inventory.spacing.length, plural(inventory.spacing.length, "Spacing value", "Spacing values")],
    ["radius", inventory.radius.length, plural(inventory.radius.length, "Radius", "Radii")],
    ["effects", inventory.effects.length, plural(inventory.effects.length, "Effect", "Effects")]
  ];
  const pad = T.space.cardPadding;
  return frame(`${id}-header`, "Header", "VERTICAL", [
    text(`${id}-eyebrow`, "DESIGN SYSTEM", T.type.eyebrow, C.accent),
    text(`${id}-title`, options.sourceName, T.type.title, C.text, { width: CONTENT_WIDTH }),
    text(`${id}-generated`, `Generated ${options.generatedAt}`, T.type.body, C.muted),
    frame(`${id}-counts`, "Counts", "HORIZONTAL", stats.map(([key, count, label]) => frame(`${id}-count-${key}`, `${count} ${label}`, "VERTICAL", [
      text(`${id}-count-${key}-value`, String(count), T.type.stat),
      text(`${id}-count-${key}-label`, label, T.type.caption, C.muted)
    ], { gap: 2, pad: [pad, pad, pad, pad], fill: C.card, radius: T.cardRadius, stroke: C.divider, width: CARD_WIDTH })), { gap: T.space.gridGutter, width: CONTENT_WIDTH, extra: { layoutSizingHorizontal: "FIXED" } })
  ], { gap: 8, width: CONTENT_WIDTH });
}

export function systemSheet(inventory: SystemInventory, options: SystemSheetOptions): InternalDocument {
  const { id } = options;
  const sid = (name: string): string => `${id}-${name.toLowerCase()}`;
  const effectSamples = new Map<string, DesignEffect>();
  const sections: Compact[] = [
    section(sid("Colours"), "Colours", "Solid colours used in this frame. Token-bound colours first, then raw values.", coloursBody(sid("Colours"), inventory.colours)),
    section(sid("Type"), "Type", "Text styles in use, each set in its exact font, size and line height.",
      inventory.type.map((entry, index) => typeRow(`${sid("Type")}-${index}`, entry))),
    section(sid("Spacing"), "Spacing", `Gaps and padding in use. Bars are drawn at ${SPACING_SCALE}× scale.`, spacingCard(sid("Spacing"), inventory.spacing)),
    section(sid("Radius"), "Radius", "Corner radii in use, shown on a 64 px square.",
      inventory.radius.length ? [cardRow(`${sid("Radius")}-cards`, "Radius cards", inventory.radius.map((entry, index) => radiusCard(`${sid("Radius")}-${index}`, entry)))] : []),
    section(sid("Effects"), "Effects", "Shadows and blurs in use, applied to a white card.",
      inventory.effects.length ? [cardRow(`${sid("Effects")}-cards`, "Effect cards", inventory.effects.map((entry, index) => {
        const tid = `${sid("Effects")}-${index}`;
        effectSamples.set(`${tid}-sample`, entry.value);
        return effectCard(tid, entry);
      }))] : [])
  ];
  const m = T.space.pageMargin;
  const root = frame(id, "Design system sheet", "VERTICAL", [header(id, inventory, options), ...sections], { gap: T.space.sectionGutter, pad: [m, m, m, m], fill: C.background, width: PAGE_WIDTH });
  Object.assign(root, { x: 0, y: 0, layoutSizingHorizontal: "FIXED", layoutSizingVertical: "HUG" });
  measure(root);
  // Build through normalize (absolute positions from the origin), then lift the root out of its wrapper canvas.
  const wrapper = normalizeDocument({ canvas: { id: `${id}-wrapper`, name: "wrapper", x: options.origin.x, y: options.origin.y, width: 1, height: 1 }, nodes: [root] });
  const sheet = wrapper.nodes[0].children[0];
  const inject = (node: InternalNode): void => { const effect = effectSamples.get(node.id); if (effect) node.properties.styles.effects = [{ ...effect }]; node.children.forEach(inject); };
  inject(sheet);
  return { nodes: [sheet], styles: [], variables: [] };
}
