# Examples

Working Compact Design documents for the current schema. Each file sets `"$schema": "../spec/compact-design.schema.json"`, so an editor can complete properties against [`spec/compact-design.schema.json`](../spec/compact-design.schema.json).

There is no older dialect in this folder. If a file fails validation, the schema or core has moved, and the file should be updated to match.

## Which file

| File | Use it when you want |
|---|---|
| [`design-language-showcase.json`](./design-language-showcase.json) | The widest sample: a 1600×1200 Northstar dashboard with tokens, styles, Auto Layout, type, charts, vectors, and components. Start here, and point a model here. Walkthrough: [showcase guide](../docs/SHOWCASE-GUIDE.md). |
| [`prototype-basic-sample.json`](./prototype-basic-sample.json) | Three screens. Navigation, back, open-URL, and a timed reaction, one action per reaction. |
| [`image-fill-sample.json`](./image-fill-sample.json) | Remote image fills and image sizing. |
| [`local-image-sample.json`](./local-image-sample.json) | A `file:` image fill. In the plugin, **Add images** and pick a file with the same name before import. |
| [`html-theme-switch-sample.json`](./html-theme-switch-sample.json) | A small page whose Light/Dark variables switch in the HTML renderer. |
| [`update-patch-theme-sample.json`](./update-patch-theme-sample.json) | Light and Dark variable modes, bindings, and an explicit theme. Import this before the patch sample. |
| [`update-patch-sample.json`](./update-patch-sample.json) | A patch, not a full document. `set` and `append` against ids from the theme sample. |

## Try one in Figma

1. From the repo root: `npm install && npm run build`.
2. Import [`plugins/figma/manifest.json`](../plugins/figma/manifest.json) as a development plugin and run it.
3. Drop the JSON file onto the uploader.
4. Confirm preflight is clean, then **Create Figma design**.

For the pair of update samples, import `update-patch-theme-sample.json` with **Create Figma design**, then paste `update-patch-sample.json`. The button becomes **Apply JSON patch**. The patch addresses ids created by the theme sample, so the order matters.

## Try one in a browser

```bash
npm run render -- examples/design-language-showcase.json -o /tmp/northstar.html
npm run render -- examples/prototype-basic-sample.json -o /tmp/prototype.html
npm run render -- examples/html-theme-switch-sample.json -o /tmp/theme.html
```

`update-patch-sample.json` is a patch. The HTML renderer rejects it. Import the theme sample, or render `html-theme-switch-sample.json`, to see modes in a page.

## Check the folder

```bash
npm run check
jq empty examples/*.json spec/compact-design.schema.json
```

`jq empty` only checks that each file is JSON. `npm run check` is what runs core against the language, including the fixture in `packages/core/tests`.
