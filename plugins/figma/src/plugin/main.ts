import { agentBundle, anatomy, anatomyMarkdown, normalize, redlines, type ImportMode, type InternalDocument, type InternalPatchDocument } from "@compact-design/core";
import { importDocument } from "./importer";
import { collectExportCandidates, exportSelection } from "./exporter";
import { planExport } from "./export-plan";
import { agentBundleFilename } from "./agent-bundle-file";
import { generateSystemSheet } from "./system-sheet";
import { applyPatch } from "./patch";
import { createResources, loadExistingResources } from "./resources";
import { formatSpacing, selectionSpacing } from "./spacing";

figma.showUI(__html__, { width: 560, height: 780, themeColors: true });

/** Spacing readout (selection, node and page changes): posts only when the formatted text changes, so selection churn never floods the UI. Lives as long as the plugin. */
let lastSpacingText: string | null = null;
const postSelectionSpacing = (): void => {
  const text = formatSpacing(selectionSpacing(figma.currentPage.selection));
  if (text === lastSpacingText) return;
  lastSpacingText = text;
  figma.ui.postMessage({ type: "selection-spacing", text });
};
figma.on("selectionchange", postSelectionSpacing);
// Live refresh: moving/resizing a selected layer fires nodechange on its page (documentchange would need loadAllPagesAsync under dynamic-page).
let spacingPage: PageNode = figma.currentPage;
spacingPage.on("nodechange", postSelectionSpacing);
figma.on("currentpagechange", () => {
  spacingPage.off("nodechange", postSelectionSpacing);
  spacingPage = figma.currentPage;
  spacingPage.on("nodechange", postSelectionSpacing);
  postSelectionSpacing();
});
postSelectionSpacing();

/** Shared by export-selection / export / export-anatomy: plan roots on the current page and export them. */
async function exportFromCurrentPage(message: { type?: string; scope?: "selection" | "page"; targetId?: string }): Promise<{ document: Awaited<ReturnType<typeof exportSelection>>["document"]; warnings: string[]; count: number; roots: SceneNode[] }> {
  const { candidates, nodes } = await collectExportCandidates(figma.currentPage);
  const plan = planExport(candidates, {
    scope: message.type === "export" && message.scope === "page" ? "page" : "selection",
    id: message.targetId,
    selectionIds: [...figma.currentPage.selection].map((node) => node.id)
  });
  const roots = plan.rootIds.flatMap((id) => {
    const node = nodes.get(id);
    return node ? [node] : [];
  });
  const result = await exportSelection(roots);
  return { document: result.document, warnings: [...plan.warnings, ...result.warnings], count: roots.length, roots };
}

figma.ui.onmessage = async (message: { type?: string; document?: InternalDocument; patch?: InternalPatchDocument; mode?: ImportMode; scope?: "selection" | "page"; targetId?: string; redlines?: boolean }) => {
  if (message.type === "export-selection" || message.type === "export") {
    try {
      const { document, warnings, count } = await exportFromCurrentPage(message);
      figma.ui.postMessage({ type: "export-complete", document, warnings });
      figma.notify(`Exported ${count} layer${count === 1 ? "" : "s"}`);
    } catch (error) { figma.ui.postMessage({ type: "export-error", message: error instanceof Error ? error.message : String(error) }); }
    return;
  }
  if (message.type === "export-anatomy") {
    try {
      const { document, warnings, count } = await exportFromCurrentPage(message);
      const internal = normalize(document);
      const withRedlines = message.redlines === true;
      figma.ui.postMessage({ type: "anatomy-complete", document, markdown: anatomyMarkdown(internal, { warnings, redlines: withRedlines }), anatomy: anatomy(internal), ...(withRedlines ? { redlines: redlines(internal) } : {}), warnings });
      figma.notify(`Anatomy for ${count} layer${count === 1 ? "" : "s"}`);
    } catch (error) { figma.ui.postMessage({ type: "export-error", message: error instanceof Error ? error.message : String(error) }); }
    return;
  }
  if (message.type === "export-system-sheet") {
    // Restore the original selection afterwards (never the sheet), so a second Generate cannot build a sheet of the sheet.
    const originalSelection = [...figma.currentPage.selection];
    try {
      const { document, warnings, roots } = await exportFromCurrentPage(message);
      if (!roots.length) throw new Error("Select at least one layer to build a design system sheet.");
      const sheetRoot = roots.find((node) => node.getPluginData("compactDesignId").startsWith("system-sheet-"));
      if (sheetRoot) throw new Error(`'${sheetRoot.name}' is a design system sheet. Select the original design (not a generated sheet) and try again.`);
      const result = await generateSystemSheet(roots, document);
      if (result.root) figma.viewport.scrollAndZoomIntoView([result.root]);
      figma.ui.postMessage({ type: "system-sheet-complete", rootId: result.root?.getPluginData("compactDesignId") || null, warnings: [...warnings, ...result.warnings] });
      figma.notify("Design system sheet generated");
    } catch (error) { figma.ui.postMessage({ type: "export-error", message: error instanceof Error ? error.message : String(error) }); }
    finally { figma.currentPage.selection = originalSelection.filter((node) => !node.removed); }
    return;
  }
  if (message.type === "export-agent-bundle") {
    try {
      const { document, warnings, count } = await exportFromCurrentPage(message);
      const bundle = agentBundle(document, { redlines: message.redlines === true });
      figma.ui.postMessage({ type: "agent-bundle-complete", bundle, filename: agentBundleFilename(document), warnings });
      figma.notify(`Agent bundle for ${count} layer${count === 1 ? "" : "s"}`);
    } catch (error) { figma.ui.postMessage({ type: "export-error", message: error instanceof Error ? error.message : String(error) }); }
    return;
  }
  if (message.type === "preview-import" && message.document) {
    try {
      const existing = new Set(figma.currentPage.findAll().map((node) => node.getPluginData("compactDesignId")).filter(Boolean));
      const matched = message.document.nodes.filter((node) => existing.has(node.id)).length;
      figma.ui.postMessage({ type: "preview-complete", matched, create: message.document.nodes.length - matched, totalExisting: existing.size });
    } catch (error) { figma.ui.postMessage({ type: "preview-error", message: error instanceof Error ? error.message : String(error) }); }
    return;
  }
  if (message.type === "apply-patch" && message.patch) {
    const resources = await loadExistingResources();
    const context = { sourceNodes: new Map<string, SceneNode>(), componentPropertyKeys: new Map<string, Map<string, string>>(), componentPropertyTypes: new Map<string, Map<string, string>>(), resources, createdNodes: [] as SceneNode[] };
    try {
      const { affected, warnings } = await applyPatch(message.patch, context);
      figma.currentPage.selection = affected; if (affected.length) figma.viewport.scrollAndZoomIntoView(affected);
      figma.ui.postMessage({ type: "patch-complete", count: affected.length, warnings });
    } catch (error) { for (const node of [...context.createdNodes].reverse()) if (!node.removed) node.remove(); figma.ui.postMessage({ type: "import-error", message: error instanceof Error ? error.message : String(error) }); }
    return;
  }
  if (message.type !== "import-json" || !message.document) return;
  try {
    const { roots, warnings, created, replaced } = await importDocument(message.document, message.mode || "CREATE");
    figma.currentPage.selection = roots;
    figma.viewport.scrollAndZoomIntoView(roots);
    figma.ui.postMessage({ type: "import-complete", count: roots.length, warnings, created, replaced });
    figma.notify(`Imported ${roots.length} canvas${roots.length === 1 ? "" : "es"}`);
  } catch (error) {
    figma.ui.postMessage({ type: "import-error", message: error instanceof Error ? error.message : String(error) });
  }
};
