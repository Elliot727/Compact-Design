# `@compact-design/html`

Renders a Compact Design document as one HTML file. Same language as the Figma plugin, a browser as the surface.

Validation, normalization, and patches stay in [`@compact-design/core`](../core/README.md). This package maps the canonical document onto CSS. It is a private workspace package.

```bash
npm run build -w @compact-design/html
npm run test -w @compact-design/html
```

## Render

```ts
import { render, renderDocument, RenderError } from "@compact-design/html";

const { html, css, body } = render(input, {
  title: "Northstar",
  background: "#d8d4cb"
});
```

`render` validates with core, then returns:

| Field | Contents |
|---|---|
| `html` | A complete document: doctype, font links, the stylesheet, the body, and a small runtime script |
| `css` | The stylesheet alone |
| `body` | The markup alone |

`renderDocument` skips validation and expects an `InternalDocument` you already normalized.

`render` throws `RenderError` when the input is invalid or when it is a patch. `error.issues` holds the core issues (`path`, `message`, and the rest of a `RepairIssue`). Patches edit an existing document. They are not a page.

Options:

| Option | Default |
|---|---|
| `title` | The first canvas name, or `Compact Design` |
| `background` | `#d8d4cb` |

## What the page does

- Auto Layout becomes flex or grid. Frames without layout keep parent-relative coordinates.
- Variables and bindings resolve to CSS colours. A `SET_VARIABLE_MODE` reaction switches modes in the page.
- `ON_CLICK` navigation becomes in-page links. `AFTER_TIMEOUT` and `BACK` use the runtime script.
- Fills, strokes, gradients, shadows, text runs, masks, sticky scroll chrome, and vector strokes are painted in CSS and SVG.
- Fonts that are not web-safe are loaded from Google Fonts.

Open the `html` string, or the file from the CLI, in a browser. There is no screenshot step.

## CLI

Build once, then from the repository root:

```bash
npm run render -- examples/design-language-showcase.json -o /tmp/northstar.html
npm run render -- examples/prototype-basic-sample.json -o /tmp/prototype.html --title "Prototype"
```

Omit `-o` to write the page to stdout.

```text
npm run render -- <document.json> [-o out.html] [--title Title]
```

The script resolves the input from the current directory, then from the repository root. It creates missing parent directories for `-o`. A patch file, or any document core rejects, prints each issue and exits 1.

## Development

Source is `src/render.ts` and `src/css.ts`. Tests are `tests/html.test.ts` and run with `node --test` after the build. The package depends only on `@compact-design/core`.

## License

[Mozilla Public License 2.0](./LICENSE).
