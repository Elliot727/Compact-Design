/** Pure editor-mode rules for the anatomy sheet (no DOM), so the UI wiring is testable. */

export interface AnatomySheet { markdown: string; anatomy: unknown; redlines?: unknown }

/** Body of "Download .json": always { anatomy, redlines? }; redlines is present only when the sheet was exported with the Redlines checkbox on. */
export function anatomyJson(sheet: AnatomySheet): { anatomy: unknown; redlines?: unknown } {
  return sheet.redlines === undefined ? { anatomy: sheet.anatomy } : { anatomy: sheet.anatomy, redlines: sheet.redlines };
}
export interface EditorModeView {
  label: string;
  /** In anatomy mode the import button is forced off; in JSON mode updateSummary() decides. */
  importLocked: boolean;
  importText?: string;
  downloadsHidden: boolean;
  /** Format only parses JSON, so it is hidden on a Markdown sheet. */
  formatHidden: boolean;
  /** The generic Download duplicates "Download .md" in anatomy mode. */
  genericDownloadHidden: boolean;
  summary?: { title: string; detail: string };
}

interface AnatomyTreeNode { children?: AnatomyTreeNode[] }
function countLayers(nodes: AnatomyTreeNode[]): number { return nodes.reduce((total, node) => total + 1 + countLayers(node.children || []), 0); }

export function editorModeView(sheet: AnatomySheet | null): EditorModeView {
  if (!sheet) return { label: "Design JSON", importLocked: false, downloadsHidden: true, formatHidden: false, genericDownloadHidden: false };
  const roots = Array.isArray(sheet.anatomy) ? (sheet.anatomy as AnatomyTreeNode[]) : [];
  const layers = countLayers(roots);
  return {
    label: "Anatomy (Markdown)",
    importLocked: true,
    importText: "Import unavailable for anatomy",
    downloadsHidden: false,
    formatHidden: true,
    genericDownloadHidden: true,
    summary: {
      title: "Anatomy sheet",
      detail: `${roots.length} canvas${roots.length === 1 ? "" : "es"} · ${layers} layer${layers === 1 ? "" : "s"} · Markdown, not importable — edit, Clear or paste JSON to import`
    }
  };
}

/** The held design/patch may only be imported outside anatomy mode. */
export function importableDocument<T>(sheet: AnatomySheet | null, held: T | null): T | null {
  return sheet ? null : held;
}
