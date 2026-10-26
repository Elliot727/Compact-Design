/** Pure filename rule for the agent bundle download. No Figma API access. */

/** "<first root name>.agent.json", slugged; "design.agent.json" when there is no usable name. */
export function agentBundleFilename(document: unknown): string {
  const doc = document as { canvas?: { name?: unknown }; canvases?: Array<{ name?: unknown }>; nodes?: Array<{ name?: unknown }> };
  const name = [doc.canvas?.name, doc.canvases?.[0]?.name, doc.nodes?.[0]?.name].find((entry) => typeof entry === "string" && entry.trim());
  const slug = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "design"}.agent.json`;
}
