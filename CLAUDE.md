# Product Configurator

Prototype merging MCS (`mcs/`) and BLC (`blc/`). Background: `Product Configuration-merge-plan.md`.

## Prototype rules (Angular handoff)

- Persistence is localStorage only, no backend — with one exception: Reference Data (`material-import.html`) saves straight into `data/catalog.js` through the File System Access API once the folder is connected (`catalog-folder.js`, Chrome/Edge; same pattern as the Product Management Tool's vault save). localStorage still holds the unsaved draft.
- Spreadsheet-style editing uses `components/data-grid/` (ported from the Rollout Manager grid). Reuse it rather than building another grid.
- Markup stays static HTML. No UI generated with `innerHTML`.
- Styles use tokens from `shared/css/design-tokens.css` (PL-SHARED submodule). Never invent a value; flag missing tokens.
- Math lives in `engines/` as pure functions, no DOM. Run `node engines/verify.mjs` after any change there.
- TODO(Healey): add the remaining Angular handoff rules.

## File ownership

Two subagents editing the same file overwrite each other, so they run one at a time.

- **designer** owns HTML markup and CSS (`*.html` structure, `*.css`).
- **developer** owns JS (`engines/`, `data/`, `*.js`, inline `<script>` blocks).
- Need a change in a file you don't own? Ask for it in your final report.

Workflow: main session runs the designer → shows Healey the open questions → runs the developer with the designer's markup handoff → shows Healey the developer's questions.

## Five improvements

TODO(Healey): paste the five improvements here.

## Exploration findings

TODO(Healey): paste the findings here.
