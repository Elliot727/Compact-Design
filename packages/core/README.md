# `@compact-design/core`

The language engine for Compact Design JSON. It parses a document, checks it against [`spec/compact-design.schema.json`](../../spec/compact-design.schema.json), expands authoring shorthand into one canonical tree, lints that tree, and applies patches. The Figma plugin and the HTML renderer both call this package. Nothing in core calls `figma.*`, touches the DOM, or imports `@figma/plugin-typings`.

This package is private to the monorepo. From the repository root:

```bash
npm run build -w @compact-design/core
npm run test -w @compact-design/core
npm run typecheck -w @compact-design/core
```

`build` regenerates the schema module from `spec/compact-design.schema.json`, then emits `dist/`. Edit the spec file. Do not hand-edit the generated module.

## Pipeline

```text
JSON
  → parse          JSON text to a value
  → validate       Draft 2020-12 schema, then semantic checks
  → normalize      shorthand becomes the canonical document
  → lint           advisory quality findings on that document
  → applyPatch     a second document form: operations against stable ids
```

A full document and a patch are the only two top-level shapes. A patch looks like `{ "patch": { "operations": [ ... ] } }` and may also carry `variables` and `styles`, which are upserted before the operations run.

`validate` never throws. `normalize` throws on input it cannot expand. `applyPatch` throws `PatchError` when an operation or the resulting document is invalid. `validatePatch` runs the same checks and returns the issues instead of throwing.

## Call it

```ts
import {
  validate,
  validatePatch,
  normalize,
  lint,
  normalizePatch,
  applyPatch,
  indexDocument,
  schema
} from "@compact-design/core";
```

### Validate a document

Schema first, then cross-node rules: unique ids, component references, bindings, styles, variants, prototype destinations.

```ts
const result = validate(input);

if (!result.valid) {
  for (const issue of result.issues) {
    // severity, code, path, message, suggestion?
    console.log(issue.path, issue.message);
  }
} else if (result.document) {
  console.log(result.document.nodes);
} else if (result.patch) {
  console.log(result.patch.operations);
}
```

Issues use `severity` (`ERROR`, `WARNING`, `INFO`), `code`, `path`, `message`, and an optional `suggestion`.

### Normalize

```ts
const document = normalize({
  canvas: { width: 320, height: 240 },
  nodes: [{ type: "RECTANGLE", w: 100, h: 40, fill: "#6C5CFF" }]
});
```

The authoring form stays short. The canonical form is what adapters read: expanded layout, paints, fonts, and defaults. Adapters should consume `InternalDocument`, not the raw JSON.

### Lint

```ts
const findings = lint(document);
```

Lint does not decide whether a document is valid. Findings are advisory, except a missing prototype destination, which is reported as an error here as well as during validation.

| Code | What it catches |
|---|---|
| `LOW_CONTRAST` | Text below roughly 4.5:1, or 3:1 at 24px and up |
| `SMALL_TOUCH_TARGET` | A control or prototype target under 44×44 |
| `INCONSISTENT_SPACING` | Padding or gap off a 4px scale |
| `MISSING_AUTO_LAYOUT` | Children lined up in a row or column with no Auto Layout |
| `TEXT_OVERFLOW` | Fixed text box likely too small for its string |
| `BROKEN_PROTOTYPE_DESTINATION` | `NAVIGATE`, `SWAP`, `OVERLAY`, `SCROLL_TO`, or `CHANGE_TO` points at a missing id |
| `REPEATED_DETACHED_ELEMENTS` | Three or more similar children that are still raw frames |
| `MISSING_COMPONENT_USAGE` | A repeated pattern with no instances |
| `DUPLICATE_UNBOUND_COLOUR` | The same hex used three or more times with no variable binding |

### Patch

```ts
const patch = normalizePatch({
  patch: {
    operations: [
      { op: "set", id: "title", set: { text: "Updated" } }
    ]
  }
});

const { document: updated, affectedIds, warnings } = applyPatch(document, patch);
```

`validatePatch(document, patch)` is the safe form: it returns `{ valid, issues, document, affectedIds, warnings }` and ignores problems that were already in the input document. Only issues the patch introduces fail the check.

Operations:

| Op | Effect |
|---|---|
| `set` | Change listed keys on one id. Layout, padding, font, and constraints deep-merge. Fills, strokes, effects, text runs, and corner radii replace. `x` / `y` are parent-relative. Unknown keys are errors. |
| `remove` | Delete a node. |
| `append` | Add a child at the end of a parent. |
| `insert` | Add a child at an index. |
| `move` | Reparent or reorder. Keeps parent-relative position. |
| `duplicate` | Clone a subtree. Requires `id` and `idSuffix`. |
| `wrap` / `unwrap` | Group siblings into a frame, or dissolve a frame or group. |
| `componentize` | Promote a frame to a component, with optional properties and instance copies. |

`set` of `bindings`, `styleRefs`, `variableModes`, `instanceProperties`, `componentPropertyReferences`, `componentProperties`, `variantAxes`, and `variant` shallow-merges. `null` clears a field where that is allowed. `prototype` replaces the whole reaction list. `[]` clears it.

A patch may also include top-level `variables` and `styles`. They are upserted before operations, so later ops can bind to tokens declared in the same patch. Mode 0 is never renamed by a patch.

Core returns a new document. Cloning Figma nodes and rolling them back on failure is the Figma adapter's job.

### Look up ids

```ts
const index = indexDocument(document);
const node = index.byId.get("title");
```

### Schema object

```ts
schema.$schema; // "https://json-schema.org/draft/2020-12/schema"
```

`schema` is generated from [`spec/compact-design.schema.json`](../../spec/compact-design.schema.json) at build time. The language reference is [`docs/DESIGN-LANGUAGE.md`](../../docs/DESIGN-LANGUAGE.md).

## Also exported for adapters

These stay in core so Figma and HTML cannot drift apart:

| Export | Used for |
|---|---|
| `anatomy`, `anatomyMarkdown` | Handoff sheet: tree, layout, sizing, tokens, styles |
| `redlines`, `redlinesMarkdown` | Padding and neighbour gaps against FLOAT tokens |
| `systemInventory`, `systemSheet` | Design-system sheet drawn from a selection |
| `agentBundle` | `*.agent.json` pack for a model: document, anatomy, id map, patch template |
| `measureSpacing` | Gap, overlap, or inset between two boxes |
| `applyResourceUpsert`, `matchStyle`, `matchVariable` | Token upsert shared with the Figma adapter |

## Boundary

Core owns the language. An adapter owns the surface: Figma node APIs, fonts, image bytes, CSS, and plugin data. A new adapter should call `validate` or `normalize`, then walk `InternalDocument`. It should not reimplement the schema.

Lint in this repo rejects `any` and imports that reach into core internals (`../shared`, `./normalize`, `./validate`, `./lint`). Public entry is `@compact-design/core`.

## License

[Mozilla Public License 2.0](./LICENSE).
