/**
 * "Generate design system sheet": selection → normalize → systemInventory →
 * systemSheet → importDocument(REPLACE). Re-running replaces the previous sheet
 * (same root id), so a shrunken inventory leaves no stale tiles. The sheet has
 * no Components section, so no main components are looked up or instanced.
 */
import { normalize, systemInventory, systemSheet } from "@compact-design/core";
import { importDocument } from "./importer";

export const SYSTEM_SHEET_GAP = 160;

export interface SheetBox { x: number; y: number; width: number; height: number }

/** Right of the selection (union of root boxes) + 160, aligned to its top. */
export function systemSheetOrigin(boxes: SheetBox[]): { x: number; y: number } {
  if (!boxes.length) return { x: 0, y: 0 };
  return { x: Math.max(...boxes.map((box) => box.x + box.width)) + SYSTEM_SHEET_GAP, y: Math.min(...boxes.map((box) => box.y)) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "15 Oct 2026" in local time; the plugin owns the clock, core only prints what it is given. */
export const systemSheetDate = (date: Date): string => `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

export const systemSheetRootId = (sourceRootId: string): string => `system-sheet-${sourceRootId}`;

export async function generateSystemSheet(figmaRoots: SceneNode[], exported: unknown): Promise<{ root: SceneNode | null; warnings: string[] }> {
  const doc = normalize(exported);
  const inventory = systemInventory(doc);
  const sourceRootId = doc.nodes[0]?.id || "selection";
  const id = systemSheetRootId(sourceRootId);
  const sheet = systemSheet(inventory, {
    id,
    origin: systemSheetOrigin(figmaRoots.map((node) => ({ x: node.x, y: node.y, width: node.width, height: node.height }))),
    sourceName: figmaRoots[0]?.name || doc.nodes[0]?.name || "Selection",
    generatedAt: systemSheetDate(new Date())
  });
  // Safety net: anything new at the page's top level after this run, other than the sheet, is a stray.
  // Compared by node id, never object identity: Figma may hand back fresh wrapper objects for the same nodes.
  const page = figma.currentPage;
  const topLevelBefore = new Set<string>(page.children.map((node) => node.id));
  const { roots, warnings } = await importDocument(sheet, "REPLACE");
  const root = roots[0] || null;
  for (const node of [...page.children]) {
    if (topLevelBefore.has(node.id) || (root && node.id === root.id) || node.removed) continue;
    warnings.push(`Removed stray layer '${node.name}' left at the top level while building the sheet.`);
    node.remove();
  }
  return { root, warnings };
}
