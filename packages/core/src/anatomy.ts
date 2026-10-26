/**
 * Anatomy sheet: a read-only, tool-agnostic description of a document's layer
 * tree (role, size, layout, sizing, token bindings, style refs, component /
 * instance info) plus a Markdown rendering for handoff docs. Pure: no host API.
 *
 * Resolution rules
 * - bindings: the key is matched against document.variables by id first, then
 *   by name (same rule as validate). Resolved entries carry the variable name,
 *   collection and type; unresolved entries keep the raw key and resolved:false.
 * - styleRefs: matched against document.styles by id first, then by name.
 *   Unresolved entries keep the raw ref and resolved:false.
 * - instance.componentId is resolved to the component's name when the
 *   component is in the document; otherwise the id is kept and flagged.
 *
 * Edges: instances are leaves (their sublayers are not exported). Component
 * SLOT properties are skipped by the exporter, so they never appear here.
 * Non-numeric (mixed/missing) sizes, gaps and padding render as "mixed".
 */
import { redlinesMarkdown } from "./redlines";
import type { DesignLayout, InternalDocument, InternalNode, StyleDefinition, VariableCollectionDefinition, VariableDefinition } from "./types";

export interface AnatomyRef { ref: string; name: string; resolved: boolean }
export interface AnatomyBinding extends AnatomyRef { collection?: string; type?: VariableDefinition["type"] }
export interface AnatomyStyleRef extends AnatomyRef { type?: StyleDefinition["type"] }
export interface AnatomyLayout {
  direction: "HORIZONTAL" | "VERTICAL" | "GRID" | "MIXED";
  gap?: number | "mixed"; crossGap?: number | "mixed";
  /** [top, right, bottom, left]; a missing side is 0, a non-numeric side is "mixed". */
  padding?: Array<number | "mixed">;
  wrap?: boolean; primaryAlign?: string; counterAlign?: string;
}
export interface AnatomySizing { horizontal?: string; vertical?: string; positioning?: "ABSOLUTE"; grow?: number }
export interface AnatomyComponent { variantAxes?: Record<string, string[]>; variant?: Record<string, string>; properties?: string[] }
export interface AnatomyInstance { componentId?: string; componentName?: string; resolved: boolean; properties?: Record<string, string | boolean> }
export interface AnatomyNode {
  id: string; name: string;
  /** Lower-cased node type (frame, text, instance, …). */
  role: string;
  size: { width: number | "mixed"; height: number | "mixed" };
  hidden?: true;
  layout?: AnatomyLayout;
  sizing?: AnatomySizing;
  bindings?: Record<string, AnatomyBinding>;
  styles?: Record<string, AnatomyStyleRef>;
  component?: AnatomyComponent;
  instance?: AnatomyInstance;
  children: AnatomyNode[];
}
export interface AnatomyMarkdownOptions {
  title?: string; warnings?: string[];
  /** Append a "Redlines" section (padding and neighbour gaps, checked vs exported FLOAT tokens). */
  redlines?: boolean;
}

const round = (value: number): number => { const rounded = Math.round(value * 100) / 100; return rounded === 0 ? 0 : rounded; };
const num = (value: unknown): number | "mixed" => (typeof value === "number" && Number.isFinite(value) ? round(value) : "mixed");

export interface Resources {
  variable: (key: string) => { variable: VariableDefinition; collection: VariableCollectionDefinition } | null;
  style: (key: string) => StyleDefinition | null;
  component: (id: string) => InternalNode | null;
}

/** Depth-first walk over every node (instances included, their exported children too); `visit` returning false skips the subtree. Shared by anatomy and systemInventory. */
export function walkNodes(doc: InternalDocument, visit: (node: InternalNode) => void | false): void {
  // Returning false from visit skips that node's subtree.
  const step = (node: InternalNode): void => { if (visit(node) === false) return; node.children.forEach(step); };
  doc.nodes.forEach(step);
}

/** id-then-name lookups for variables, styles and components (also used by systemInventory). */
export function resources(doc: InternalDocument): Resources {
  const components = new Map<string, InternalNode>();
  walkNodes(doc, (node) => { if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") components.set(node.id, node); });
  return {
    variable: (key) => {
      for (const by of ["id", "name"] as const) for (const collection of doc.variables || []) {
        const variable = (collection.items || []).find((item) => item[by] === key);
        if (variable) return { variable, collection };
      }
      return null;
    },
    style: (key) => (doc.styles || []).find((style) => style.id === key) || (doc.styles || []).find((style) => style.name === key) || null,
    component: (id) => components.get(id) || null
  };
}

/** Gap / cross gap / padding reading shared with systemInventory. Non-numeric values come back as "mixed". */
export function layoutOf(layout: DesignLayout | undefined): AnatomyLayout | undefined {
  if (!layout?.direction) return undefined;
  const direction = (["HORIZONTAL", "VERTICAL", "GRID"] as const).find((entry) => entry === layout.direction) || "MIXED";
  const result: AnatomyLayout = { direction };
  if (layout.itemSpacing !== undefined) result.gap = num(layout.itemSpacing);
  if (layout.counterAxisSpacing !== undefined) result.crossGap = num(layout.counterAxisSpacing);
  if (layout.padding) { const p = layout.padding; result.padding = [p.top, p.right, p.bottom, p.left].map((side) => (side === undefined ? 0 : num(side))); }
  if (layout.wrap) result.wrap = true;
  if (layout.primaryAxisAlignItems) result.primaryAlign = layout.primaryAxisAlignItems;
  if (layout.counterAxisAlignItems) result.counterAlign = layout.counterAxisAlignItems;
  return result;
}

function anatomyNode(node: InternalNode, res: Resources): AnatomyNode {
  const p = node.properties;
  const out: AnatomyNode = { id: node.id, name: node.name, role: String(node.type).toLowerCase(), size: { width: num(p.size?.width), height: num(p.size?.height) }, children: [] };
  if (p.visible === false) out.hidden = true;
  const layout = layoutOf(p.layout);
  if (layout) out.layout = layout;
  const sizing: AnatomySizing = {};
  if (p.layoutSizingHorizontal) sizing.horizontal = p.layoutSizingHorizontal;
  if (p.layoutSizingVertical) sizing.vertical = p.layoutSizingVertical;
  if (p.layoutPositioning === "ABSOLUTE") sizing.positioning = "ABSOLUTE";
  if (typeof p.layoutGrow === "number" && p.layoutGrow > 0) sizing.grow = p.layoutGrow;
  if (Object.keys(sizing).length) out.sizing = sizing;
  if (p.bindings && Object.keys(p.bindings).length) {
    out.bindings = Object.fromEntries(Object.entries(p.bindings).map(([field, key]) => {
      const hit = res.variable(key);
      return [field, hit ? { ref: key, name: hit.variable.name, collection: hit.collection.name, type: hit.variable.type, resolved: true } : { ref: key, name: key, resolved: false }];
    }));
  }
  if (p.styleRefs && Object.keys(p.styleRefs).length) {
    out.styles = Object.fromEntries(Object.entries(p.styleRefs).map(([field, key]) => {
      const style = res.style(key);
      return [field, style ? { ref: key, name: style.name, type: style.type, resolved: true } : { ref: key, name: key, resolved: false }];
    }));
  }
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    const component: AnatomyComponent = {};
    if (p.variantAxes && Object.keys(p.variantAxes).length) component.variantAxes = p.variantAxes;
    if (p.variant && Object.keys(p.variant).length) component.variant = p.variant;
    if (p.componentProperties?.length) component.properties = p.componentProperties.map((entry) => entry.name);
    out.component = component;
  }
  if (node.type === "INSTANCE") {
    // Instances are leaves: their sublayers belong to the main component and are not exported.
    const main = p.componentId ? res.component(p.componentId) : null;
    const instance: AnatomyInstance = { resolved: Boolean(main) };
    if (p.componentId) instance.componentId = p.componentId;
    if (main) instance.componentName = main.name;
    if (p.instanceProperties && Object.keys(p.instanceProperties).length) {
      instance.properties = Object.fromEntries(Object.entries(p.instanceProperties).map(([key, value]) => [key, typeof value === "object" && value ? `{var ${value.id}}` : value]));
    }
    out.instance = instance;
    return out;
  }
  out.children = node.children.map((child) => anatomyNode(child, res));
  return out;
}

/** One AnatomyNode per canvas (document.nodes), each with its full subtree. */
export function anatomy(doc: InternalDocument): AnatomyNode[] {
  const res = resources(doc);
  return doc.nodes.map((node) => anatomyNode(node, res));
}

const md = (value: string): string => value.replace(/([\\*_`|[\]<>])/g, "\\$1");
const px = (value: number | "mixed"): string => String(value);
const flag = (ref: AnatomyRef): string => (ref.resolved ? md(ref.name) : `${md(ref.name)} ⚠ unresolved`);

function nodeLine(node: AnatomyNode): string {
  const parts = [`**${md(node.name)}** (${node.role}, ${px(node.size.width)}×${px(node.size.height)})`];
  if (node.hidden) parts.push("hidden");
  if (node.layout) {
    const l = node.layout;
    let text = l.direction;
    if (l.gap !== undefined) text += l.direction === "GRID" && l.crossGap !== undefined ? ` gap ${l.gap}×${l.crossGap}` : ` gap ${l.gap}`;
    if (l.direction !== "GRID" && l.wrap) text += ` wrap${l.crossGap !== undefined ? ` ${l.crossGap}` : ""}`;
    parts.push(text);
    if (l.padding) parts.push(`pad ${l.padding.join("/")}`);
  }
  if (node.sizing) {
    const s = node.sizing;
    if (s.horizontal || s.vertical) parts.push(`W ${(s.horizontal || "—").toLowerCase()} / H ${(s.vertical || "—").toLowerCase()}`);
    if (s.grow) parts.push(`grow ${s.grow}`);
    if (s.positioning) parts.push("absolute");
  }
  for (const [field, ref] of Object.entries(node.bindings || {})) parts.push(`${md(field)}→${flag(ref)}`);
  for (const [field, ref] of Object.entries(node.styles || {})) parts.push(`${md(field)} style→${flag(ref)}`);
  if (node.component) {
    const c = node.component;
    let text = "component";
    if (c.variantAxes) text += ` axes ${Object.entries(c.variantAxes).map(([axis, options]) => `${md(axis)}=${options.map(md).join("|")}`).join(", ")}`;
    if (c.variant) text += ` variant ${Object.entries(c.variant).map(([axis, option]) => `${md(axis)}=${md(option)}`).join(", ")}`;
    if (c.properties) text += ` props ${c.properties.map(md).join(", ")}`;
    parts.push(text);
  }
  if (node.instance) {
    const i = node.instance;
    let text = `instance of ${i.resolved ? md(i.componentName || "") : `${md(i.componentId || "?")} ⚠ unresolved`}`;
    if (i.properties) text += ` {${Object.entries(i.properties).map(([key, value]) => `${md(key)}=${md(String(value))}`).join(", ")}}`;
    parts.push(text);
  }
  return parts.join(" · ");
}

interface Usage { label: string; extra: string[]; resolved: boolean; users: string[] }
function collectUsage(nodes: AnatomyNode[], pick: (node: AnatomyNode) => Record<string, AnatomyBinding | AnatomyStyleRef> | undefined, extra: (ref: AnatomyBinding & AnatomyStyleRef) => string[]): Usage[] {
  const map = new Map<string, Usage>();
  const visit = (node: AnatomyNode): void => {
    for (const [field, ref] of Object.entries(pick(node) || {})) {
      const key = `${ref.resolved}:${ref.name}`;
      const usage = map.get(key) || { label: ref.name, extra: extra(ref as AnatomyBinding & AnatomyStyleRef), resolved: ref.resolved, users: [] };
      const user = `${node.name} (${field})`;
      if (!usage.users.includes(user)) usage.users.push(user);
      map.set(key, usage);
    }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return [...map.values()];
}

const cell = (value: string): string => md(value).replace(/\n/g, " ");
function table(title: string, header: string[], rows: Usage[]): string[] {
  const lines = [`## ${title}`, ""];
  if (!rows.length) return [...lines, "_None._", ""];
  lines.push(`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${cell(row.label)}${row.resolved ? "" : " ⚠ unresolved"} | ${row.extra.map(cell).join(" | ")} | ${row.users.map(cell).join(", ")} |`);
  return [...lines, ""];
}

/** First line of every Notes section: component SLOT properties are skipped on export, so they never reach the document. */
export const ANATOMY_SLOT_NOTE = "Slots are not shown: the Figma export skips them.";

/**
 * Markdown anatomy sheet: one "##" section per canvas with an indented
 * bullet tree (2 spaces per level), then "Tokens used" and "Styles used"
 * tables, then "Notes": the slot caveat first, then any warnings (e.g.
 * flattened instances), then "Redlines" when options.redlines is set. Unresolved bindings/styles/components are marked "⚠ unresolved".
 */
export function anatomyMarkdown(doc: InternalDocument, options: AnatomyMarkdownOptions = {}): string {
  const roots = anatomy(doc);
  const lines: string[] = [`# ${md(options.title || "Anatomy")}`, ""];
  for (const root of roots) {
    lines.push(`## ${md(root.name)}`, "");
    const walk = (node: AnatomyNode, depth: number): void => { lines.push(`${"  ".repeat(depth)}- ${nodeLine(node)}`); node.children.forEach((child) => walk(child, depth + 1)); };
    walk(root, 0);
    lines.push("");
  }
  lines.push(...table("Tokens used", ["Token", "Collection", "Type", "Used by"], collectUsage(roots, (node) => node.bindings, (ref) => [ref.collection || "—", ref.type || "—"])));
  lines.push(...table("Styles used", ["Style", "Type", "Used by"], collectUsage(roots, (node) => node.styles, (ref) => [ref.type || "—"])));
  lines.push("## Notes", "", `- ${ANATOMY_SLOT_NOTE}`, ...(options.warnings || []).map((warning) => `- ${md(warning)}`), "");
  if (options.redlines) lines.push(...redlinesMarkdown(doc));
  return `${lines.join("\n").trimEnd()}\n`;
}
