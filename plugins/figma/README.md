# Compact Design Figma plugin

The Figma adapter for Compact Design JSON. It turns a validated document into native, editable layers, and it can read a selection back into that same JSON.

Figma calls this plugin **Compact Design Importer** ([`manifest.json`](./manifest.json)). The window uses the same name. Parsing, schema checks, normalization, lint, patch rules, anatomy, redlines, and the design-system sheet all come from [`@compact-design/core`](../../packages/core/README.md). This package owns only Figma: nodes, fonts, images, variables, components, prototypes, plugin data, rollback, and export.

It is a private workspace. It is not published to npm. Load it from a local manifest.

## Load it

From the repository root:

```bash
npm install
npm run build
```

In Figma Desktop: **Plugins → Development → Import plugin from manifest…** and choose [`plugins/figma/manifest.json`](./manifest.json). Then run **Compact Design Importer**.

`main` is `dist/code.js` and `ui` is `dist/ui.html`. While you edit the plugin, `npm run watch:figma` rebuilds those files. Reload the plugin in Figma Desktop after each rebuild. A stale plugin will not show new buttons or new patch behaviour.

`documentAccess` is `dynamic-page`. The manifest allows image fetches and `http://localhost:18791` for the MCP bridge.

## Import a document

1. Drop a `.json` file onto the uploader, or paste into **Design JSON**. **Browse** opens a file. **Add images** attaches local files for `file:` fills.
2. Read **Preflight checks**. Errors name a JSON path. **Copy repair JSON** puts a machine-readable issue list on the clipboard. **Format** pretty-prints the editor.
3. Pick a mode, then use the primary button.

| Mode | Button | When to use it |
|---|---|---|
| Create new | **Create Figma design** | First import. Refuses a canvas id that already exists on the page. |
| Update matching IDs | **Update matching design** | Rebuild matching canvases in their current stack position. New canvas ids are created. |
| Replace matching canvases | **Replace matching canvases** | Swap every matching canvas for the document you pasted. |

A document whose top-level key is `patch` switches the button to **Apply JSON patch**. The patch runs against layers this plugin imported earlier. It is one transaction: on failure, Figma restores the previous nodes and any tokens the patch touched.

Give every canvas and layer you will update an explicit `id`. The plugin stores that id as plugin data (`compactDesignId`). Generated fallback ids follow tree position and will not survive a rearrange.

Full-document update rebuilds a whole canvas. A patch changes one node at a time. Prefer a patch for a label, a fill, or a new child. The operation list and `set` merge rules are in the [language reference](../../docs/DESIGN-LANGUAGE.md).

## Read the file back

| Control | Result |
|---|---|
| **Export selection** | Compact Design JSON for the current selection, written into the editor. |
| **Export anatomy** | A Markdown handoff: layer tree, role, size, layout, sizing, token bindings, and style tables. |
| **Redlines** | With anatomy, adds padding and the gap to the next sibling, checked against exported FLOAT tokens. |
| **Download .md** / **Download .json** | Save the anatomy sheet. The JSON is `{ anatomy, redlines? }`. Redlines is included only when the checkbox was on. |
| **Export agent bundle** | A `*.agent.json` pack: document, anatomy, id maps, tokens, components, a patch template, and rules for a model. |
| **Generate design system sheet** | Draws a sheet of the colours, type, spacing, radius, and effects used by the selection, beside it on the canvas. |

While the editor is showing an anatomy sheet, import is disabled. Clear or replace the text to get back to a document.

**SPACING** at the bottom of the window measures two selected layers on their axis-aligned bounding boxes. It reports the gap, the overlap depth, or the inset when one box contains the other. Rotated layers use that axis-aligned box. Select exactly two layers.

## MCP

Start the server from the repo (`npm run mcp`) and leave this window open. The dot beside the title tracks the bridge:

| Label | Meaning |
|---|---|
| MCP idle · start @compact-design/mcp | Nothing has polled recently. |
| MCP connected · AI can import directly | The plugin heard the server within about 12 seconds. |
| MCP importing… | A tool is creating or editing layers. |

The UI polls `http://localhost:18791`. That is the default `COMPACT_DESIGN_MCP_PORT`. Browser Figma cannot poll localhost, so use Figma Desktop. Tool names and client config are in the [MCP README](../../packages/mcp/README.md).

## What this package will and will not do

It creates and updates native nodes, loads fonts, creates images, binds variables, applies styles, builds components and instances, writes reactions, and translates a selection back to Compact Design JSON. Import clones existing canvases first so a failed import restores the page.

Variant property definitions live on the parent component set. Reading them on a variant throws in Figma. `getComponentPropertyDefinitions` in `src/plugin/nodes.ts` routes those reads, and property add, edit, and delete, to the parent set.

Core stays the source of patch semantics. If a rule also exists in `packages/core`, change it there and call it. The lint script fails the build when this package imports `../shared`, `./normalize`, `./validate`, or `./lint` from core instead of `@compact-design/core`.

## Develop

```bash
npm run watch:figma
npm run test -w @compact-design/figma-plugin
npm run typecheck -w @compact-design/figma-plugin
```

The test script builds the plugin, bundles `tests/boundary.test.ts` with esbuild, and runs `node --test`. Those tests cover the core/Figma lockstep for patches, export ids, and the localhost poll. They mock the Figma API. They do not drive the Desktop app.

A change to `dist/code.js` is invisible until you reload the plugin.

## License

[Mozilla Public License 2.0](./LICENSE).
