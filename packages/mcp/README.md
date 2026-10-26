# `@compact-design/mcp`

An MCP server that lets a model write Compact Design JSON, check it, and import it into the open Figma file.

```text
model
  → Compact Design JSON
  → this server (validate, lint, render)
  → http://localhost:18791
  → Compact Design plugin UI
  → figma.*
  → the open file
```

The server does not wrap Figma as a pile of `create_rectangle` tools. The model writes one document. The plugin is the only process that calls the Figma API. This package is private to the monorepo.

## Run it

From the repository root, after a build:

```bash
npm run build
npm run mcp
```

`npm run mcp` runs `node packages/mcp/scripts/cli.mjs`, which loads `packages/mcp/dist`. Rebuild after you change the server.

The plugin UI in **Figma Desktop** polls `http://localhost:18791`. Leave that window open. The status line switches from **MCP idle** to **MCP connected** after a poll within about 12 seconds, and to **MCP importing…** while a tool is in flight. Browser Figma cannot reach localhost.

The port is `COMPACT_DESIGN_MCP_PORT`, default `18791`. The plugin expects the default. Change both together if you move it.

## Client config

Use the path to this checkout. The working directory should be the repository root so relative example paths resolve.

Claude or Cursor:

```json
{
  "mcpServers": {
    "compact-design": {
      "command": "node",
      "args": ["packages/mcp/scripts/cli.mjs"]
    }
  }
}
```

Grok:

```toml
[mcp_servers.compact-design]
command = "node"
args = ["packages/mcp/scripts/cli.mjs"]
```

Protocol version is `2025-03-26`. The server name is `compact-design`.

## What the model should do

1. `get_language` before writing JSON.
2. Write a Compact Design document. The guide is the contract. Do not invent Figma plugin calls.
3. `validate`. Fix every `ERROR`. Each issue has `path`, `code`, `message`, and usually `suggestion`.
4. `lint` when the document is valid, if design quality matters. Lint does not block import.
5. `figma_status`. If the plugin is offline, ask the user to open it in Figma Desktop.
6. `figma_import` with `mode: "CREATE"` for a new design.

Later edits use `figma_patch` against the stable ids from the import, or `figma_export` to read the file back. `render_html` previews a document without touching Figma.

## Tools

Every `document` argument is a JSON object or a string of that JSON.

| Tool | Needs the plugin | Arguments |
|---|---|---|
| `get_language` | no | none |
| `validate` | no | `document` |
| `lint` | no | `document` |
| `render_html` | no | `document`, optional `title` |
| `figma_status` | no (reports whether the plugin has polled) | none |
| `figma_import` | yes | `document`, optional `mode`: `CREATE` (default), `UPDATE`, or `REPLACE` |
| `figma_patch` | yes | `document` — a patch, not a full design |
| `figma_export` | yes | optional `scope`: `selection` (default) or `page`. Optional `id` wins over `scope` and exports one layer by Compact Design id or Figma id. |

Import modes match the plugin:

| Mode | Behaviour |
|---|---|
| `CREATE` | Refuse a canvas id already on the current page. |
| `UPDATE` | Rebuild each matching canvas in place and create canvases that are new. |
| `REPLACE` | Replace every matching canvas with the document's definition. |

`figma_export` of a layer includes a main component that lives on the same page, so instances stay instances. A component on another page is flattened. Omitting both `scope` and `id` exports the current selection.

`figma_patch` applies `set`, `remove`, `append`, `insert`, `move`, `duplicate`, `wrap`, `unwrap`, and `componentize` in one transaction. The plugin rolls the canvas back if a later operation fails. Top-level `variables` and `styles` on the patch are upserted first. The full key rules are in the [language reference](../../docs/DESIGN-LANGUAGE.md).

Local images in a document (`file:name.png`) are embedded before import when the file is next to the process.

## Development

```bash
npm run build -w @compact-design/mcp
npm run test -w @compact-design/mcp
npm run lint -w @compact-design/mcp
```

Source is `src/`. The lint script rejects `@figma/plugin-typings`, `SceneNode`, `FrameNode`, `TextNode`, `PluginAPI`, `figma.`, and explicit `any`. If a change needs the Figma API, it belongs in [`plugins/figma`](../../plugins/figma/README.md).

## License

[Mozilla Public License 2.0](./LICENSE).
