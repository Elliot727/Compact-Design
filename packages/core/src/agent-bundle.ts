/**
 * Agent handoff bundle: one JSON file an LLM agent can work from without the
 * Figma file. Carries the exported document unchanged plus derived lookups
 * (anatomy, id maps, tokens, styles, components), a patch template and the
 * patching rules. Pure: no host API.
 *
 * ids
 * - byName: layer name → every id with that name (document order).
 * - byPath: "Canvas/Frame/Layer" → id. Each segment is a layer name with "/"
 *   and "\" escaped as "\/" and "\\", so a "/" inside a name never splits a
 *   segment. Repeated paths get "#2", "#3", … suffixes in document order
 *   (the first keeps the bare path); children hang off their parent's
 *   suffixed path ("Canvas/Card#2/Title"). Ids are values only, so "/" in an id is
 *   harmless. Layers inside instances are left out (instances are leaves).
 */
import { anatomy, type AnatomyNode } from "./anatomy";
import { normalizeDocument } from "./normalize";
import { redlines, type RedlineContainer } from "./redlines";
import type { ComponentPropertyType, InternalDocument, InternalNode, JsonValue, StyleDefinition, VariableAlias, VariableDefinition } from "./types";

export interface AgentBundleOptions { redlines?: boolean }
export interface AgentBundleToken { key: string; name: string; type: VariableDefinition["type"]; collection: string; values: Record<string, unknown> }
export interface AgentBundleStyle { id: string; name: string; type: StyleDefinition["type"] }
export interface AgentBundleComponent { id: string; name: string; type: "COMPONENT" | "COMPONENT_SET"; componentProperties: Array<{ name: string; type: ComponentPropertyType; defaultValue: string | boolean; options?: unknown }> }
export interface AgentBundleInstance { id: string; name: string; componentId?: string; instanceProperties: Record<string, string | boolean | VariableAlias> }
export interface AgentBundle<D = unknown> {
  version: 1;
  doc: D;
  anatomy: { anatomy: AnatomyNode[]; redlines?: RedlineContainer[] };
  ids: { byName: Record<string, string[]>; byPath: Record<string, string> };
  tokens: AgentBundleToken[];
  styles: AgentBundleStyle[];
  components: { definitions: AgentBundleComponent[]; instances: AgentBundleInstance[] };
  patchTemplate: { patch: { operations: Array<{ op: "set"; id: string; set: Record<string, never> }> } };
  rules: string[];
}

export const AGENT_BUNDLE_ID_PLACEHOLDER = "<id>";
export const AGENT_BUNDLE_RULES = [
  "Target layers by id, never by name",
  "x/y in patches are relative to the parent",
  "Run validatePatch before figma_patch"
] as const;

const segment = (name: string): string => name.replace(/[\\/]/g, (char) => `\\${char}`);

function idMaps(nodes: InternalNode[]): AgentBundle["ids"] {
  const byName: Record<string, string[]> = Object.create(null);
  const byPath: Record<string, string> = Object.create(null);
  const seen = new Map<string, number>();
  const visit = (node: InternalNode, parentPath: string): void => {
    (byName[node.name] ||= []).push(node.id);
    const base = parentPath ? `${parentPath}/${segment(node.name)}` : segment(node.name);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    let path = count === 1 ? base : `${base}#${count}`;
    // A literal "Name#2" layer could collide with a suffixed duplicate; keep bumping until free.
    for (let next = count; path in byPath; ) path = `${base}#${++next}`;
    byPath[path] = node.id;
    if (node.type === "INSTANCE") return;
    node.children.forEach((child) => visit(child, path));
  };
  nodes.forEach((node) => visit(node, ""));
  return { byName: { ...byName }, byPath: { ...byPath } };
}

function tokensOf(doc: InternalDocument): AgentBundleToken[] {
  return (doc.variables || []).flatMap((collection) => (collection.items || []).map((variable) => {
    const values: Record<string, unknown> = variable.values ? { ...variable.values } : variable.value !== undefined ? { [collection.modes?.[0] || "default"]: variable.value as JsonValue } : {};
    return { key: variable.id || variable.name, name: variable.name, type: variable.type, collection: collection.name, values };
  }));
}

function componentsOf(nodes: InternalNode[]): AgentBundle["components"] {
  const definitions: AgentBundleComponent[] = [];
  const instances: AgentBundleInstance[] = [];
  const visit = (node: InternalNode): void => {
    const p = node.properties;
    if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") definitions.push({ id: node.id, name: node.name, type: node.type, componentProperties: (p.componentProperties || []).map((entry) => ({ ...entry })) });
    if (node.type === "INSTANCE") { instances.push({ id: node.id, name: node.name, ...(p.componentId ? { componentId: p.componentId } : {}), instanceProperties: { ...(p.instanceProperties || {}) } }); return; }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return { definitions, instances };
}

/**
 * Build the bundle from an exported (compact) document. `doc` is returned as
 * given; everything else is derived from normalize(doc). Throws when the
 * document cannot be normalized (same as normalize).
 */
export function agentBundle<D>(doc: D, options: AgentBundleOptions = {}): AgentBundle<D> {
  const internal = normalizeDocument(doc);
  return {
    version: 1,
    doc,
    anatomy: options.redlines ? { anatomy: anatomy(internal), redlines: redlines(internal) } : { anatomy: anatomy(internal) },
    ids: idMaps(internal.nodes),
    tokens: tokensOf(internal),
    styles: (internal.styles || []).map((style) => ({ id: style.id || style.name, name: style.name, type: style.type })),
    components: componentsOf(internal.nodes),
    patchTemplate: { patch: { operations: [{ op: "set", id: AGENT_BUNDLE_ID_PLACEHOLDER, set: {} }] } },
    rules: [...AGENT_BUNDLE_RULES]
  };
}
