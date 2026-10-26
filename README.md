# Compact Design

Compact Design JSON is a design language written for people and for models. One JSON document describes canvases, layers, tokens, components, and prototypes. This repository validates that document, then turns it into native Figma layers or a standalone HTML page.

```text
Compact Design JSON
        │
        ▼
@compact-design/core
  parse → schema → normalize → semantic checks → lint / patch
        │
        ├─ plugins/figma     native Figma layers
        ├─ packages/html     one HTML file
        └─ packages/mcp      the same pipeline, driven by a model
```

Adapters depend on core. Core does not import Figma, the DOM, or an adapter.

`@compact-design/core`, `@compact-design/html`, and `@compact-design/mcp` are private workspace packages in this repository. They are not published to npm.

## Pick a path

| You want to… | Do this |
|---|---|
| Draw in Figma from a JSON file | [Import the plugin](./plugins/figma/README.md), paste or drop a file, choose **Create Figma design** |
| See the same file in a browser | `npm run render -- examples/design-language-showcase.json -o /tmp/preview.html` |
| Let a model write and import the file | Keep the plugin open in Figma Desktop and run [`npm run mcp`](./packages/mcp/README.md) |
| Learn the language | [Language reference](./docs/DESIGN-LANGUAGE.md) and the [schema](./spec/compact-design.schema.json) |
| Copy a working document | [Examples](./examples/README.md) |

## Repository

```text
packages/core/     language engine: validate, normalize, lint, patch
packages/html/     HTML and CSS adapter
packages/mcp/      MCP server and localhost bridge to the plugin
plugins/figma/     Figma plugin (manifest, controller, UI)
spec/              Draft 2020-12 JSON Schema, the source of truth
examples/          maintained documents for the current schema
docs/              language reference and the showcase walkthrough
```

There is one schema. Documents do not carry a schema version. Put `"$schema": "../spec/compact-design.schema.json"` on a file when you want editor completion. Cross-node rules (unique ids, component references, prototype destinations) are enforced by core, on top of the schema.

Authoring stays compact: hex fills, angle gradients, `HUG` / `FILL`, elevation presets, shorthand shadows, variables, styles, components, images, and patches. Core expands that into one canonical document before an adapter reads it.

## Setup

Node 18 or newer.

```bash
npm install
npm run check
```

`npm run check` typechecks, tests, lints, and builds every workspace. `npm install` installs Lefthook: lint and typecheck run before a commit that touches code or JSON, and `npm run check` runs again before push. GitHub Actions runs that same check on pull requests and on pushes to `main` ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)), on Node 24.

| Command | What it does |
|---|---|
| `npm run build` | Build core, HTML, MCP, and the Figma plugin |
| `npm test` | Run every workspace test |
| `npm run typecheck` | Typecheck every workspace |
| `npm run lint` | Boundary checks: core stays free of Figma, adapters go through core |
| `npm run watch:figma` | Rebuild the plugin while you edit it |
| `npm run render -- <file> -o out.html` | Write a preview page |
| `npm run mcp` | Start the MCP server on `http://localhost:18791` |

## Figma, from a clean checkout

1. `npm install && npm run build`
2. Figma Desktop → **Plugins → Development → Import plugin from manifest…**
3. Choose [`plugins/figma/manifest.json`](./plugins/figma/manifest.json). In Figma the plugin is **Compact Design Importer**.
4. Run it on a file. Drop [`examples/design-language-showcase.json`](./examples/design-language-showcase.json) onto the uploader, or paste it.
5. When preflight is clean, choose **Create Figma design**.

Generated plugin files land in `plugins/figma/dist/`. After a rebuild, reload the plugin in Figma Desktop before you try it again. Browser Figma cannot reach the local MCP bridge.

Every imported canvas and layer stores its JSON `id` as plugin data. Those ids are how **Update matching design**, **Replace matching canvases**, and JSON patches find the same layers later. Give any layer you expect to edit again an explicit id.

## HTML preview

```bash
npm run build
npm run render -- examples/prototype-basic-sample.json -o /tmp/prototype.html --title "Prototype"
```

Open the file in a browser. Details are in the [HTML adapter README](./packages/html/README.md).

## A model, end to end

1. Build, then start the server: `npm run mcp`.
2. Point the client at `node packages/mcp/scripts/cli.mjs` in this checkout. Config samples are in the [MCP README](./packages/mcp/README.md).
3. Open the plugin in **Figma Desktop** and leave the window open. The status line should read **MCP connected**.
4. The model should call `get_language`, write JSON, `validate`, then `figma_import`.

Paste into the plugin still works. MCP is the same importer without the clipboard. The plugin is the only code that calls `figma.*`.

## Where behavior lives

| Concern | Owner |
|---|---|
| Schema, normalization, semantic checks, lint, patch planning | `packages/core` |
| CSS layout, paints, in-page prototype behavior | `packages/html` |
| Fonts, images, variables, components, prototypes, rollback, export back to JSON | `plugins/figma` |
| Tool protocol and the localhost bridge | `packages/mcp` |

## Read next

- [Language reference](./docs/DESIGN-LANGUAGE.md)
- [Showcase guide](./docs/SHOWCASE-GUIDE.md)
- [Schema](./spec/compact-design.schema.json)
- [Examples](./examples/README.md)
- [Core](./packages/core/README.md)
- [HTML adapter](./packages/html/README.md)
- [MCP server](./packages/mcp/README.md)
- [Figma plugin](./plugins/figma/README.md)

## License

[Mozilla Public License 2.0](./LICENSE).
