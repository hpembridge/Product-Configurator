# Platinum — Consolidated Product Configuration Tool

**Plan draft · 2026-08-05 · Healey**

Merging `00-PL-MCS` (Menu Construction Sheet), `00-PL-BLC` (Preproduction Materials List), and `PL-BC-00` (Bindery Calculator) into one Firebase-backed tool with two interfaces.

Suggested repo name: `PL-PC-00` — Product Configuration.

---

## 1. The thesis

Today the same job gets specified three times, in three tools, and nothing persists properly. MCS and BLC base64-encode their state into the printed PDF between `%%CS%%` sentinels and read it back with `pdf.js` — one person, one file, no history, no queue. BC-00 doesn't even do that: its state is in-memory only and vanishes on refresh.

The merge is one change with a lot of consequences: **one job record in Firestore, two interfaces onto it, and every number derived rather than re-entered.**

- Creative configures the product. Bindery consumes that configuration.
- Lead time is calculated from the configuration, not entered.
- Material yield is calculated from the configuration plus three bindery-owned inputs.
- The PDF becomes output only. All the state-embedding machinery goes away.

Everything below follows from that.

---

## 2. What each tool contributes

| Source | Keep | Drop |
|---|---|---|
| **00-PL-MCS** | The entire configuration surface — job info, insert/cover sizes, exterior + interior materials, interior functions, binding hardware, decoration. The two-tier validation model (hard blocks vs. "Save Anyway" soft warnings). The stage toggle. | PDF-as-storage, drag-to-load rehydration, `pdf.js` |
| **00-PL-BLC** | The lead-time engine: `determineTierFromState()` escalation rules, `TIER_INFO` (T1=15, T2=25, T3=40 workdays), `addWorkdays()` weekday math. Vendor/color autocomplete lists. | Coordinator role entirely — availability status, arrival checklist, sign-off, the whole PDF round-trip between roles |
| **PL-BC-00** | The yield engine: application→material mapping, cut-dimension derivation, roll tiling, waste. The roll cross-section diagram (9 `APPLICATIONS`, 54" default roll). The pull report. | `mock-data.js` seeding, in-memory-only state |

Three things worth doing while everything is in pieces:

- **Reference data is fragmented, and worse than it looks.** Materials: MCS's `MATERIAL_CONFIG` has 10 categories with vendor/color autocompletes; BLC's planner has `COVER_MATERIAL_TYPES` with only leather and bookcloth in a different field shape; and BLC's `shared.js` carries a third `MATERIAL_CONFIG` that is entirely dead code. Hardware is worse — `HW_MATERIALS` (`{ph, w}`), `HW_PLANNER_CONFIG` (`{id, label, list, options}`), and a third inline copy in `coordinator.html` labeled "mirrors planner's HW_PLANNER_CONFIG" that has already diverged by dropping every autocomplete array. **Three live hardware configs, two incompatible material vocabularies.** Reconciling these into **Firestore reference data** — one source, editable without a deploy — is a real task with real decisions in it, not a tidy-up.
- **Port MCS from `feature/insert-sizes`, not `main`.** The dynamic insert table with binding auto-creation is built on that unmerged branch; `main` still has three static text boxes for Cover Size / Insert Size / Insert Count. The branch is the better starting point.
- **Decide on `cover-visualizer.html` explicitly.** Nothing links to it, but there's an active `Cover-Visualizer` branch and it's an open item on BC-00's own handoff list. It's a call to make, not a cleanup to assume — and it connects to the "visualizer → schematic" note on your board.

---

## 3. Data model, roughly

One document per job. Live record only — current state plus who last edited it, no version history.

```
job/{id}
  header       job number, product description, customer, mgmt group,
               quantity, stage, dates
  construction sizes, inserts, panel count, boards, exterior[],
               interior[], functions[], binding{}, decoration{}
  yield        materialWrap, centerGap        ← bindery-editable
  materials[]  per-material: name, applications[], rollSize,
               orientation, patternSensitive
  meta         lastEditedBy, lastEditedAt
```

**Field-level ownership, enforced in Firestore security rules.** Creative writes `header` and `construction`. Bindery writes `yield` and `materials[]` and nothing else. This is the cleanest expression of what you described and it's cheap to enforce at the database rather than hoping the UI holds the line.

**Derived values are never stored as truth** — tier, due date, cut list, yardage, waste are all computed from the record on read. If they're cached for list views, they're cached with an explicit "recomputed at" and treated as disposable.

---

## 4. Three engines

The important structural move: pull the math out of the pages. Three modules, pure functions of the job record, no DOM, independently testable, called by both interfaces and by every report.

**Configuration model + validation.** Owns the schema, the conditional field logic, and the hard/soft validation split from MCS.

**Lead time engine.** Config in, tier + due date out. Two gaps to close here.

*Missing inputs.* BLC's tier rules escalate on **order quantity** (>1000→T4, >250→T3, >100→T2) and on **production departments** (flatbed/woodshop→T3, offset/sewing→T2, metal tip-in→T2, full metal→T3) — and MCS's captured state carries neither. So either departments become explicit fields, or they're **inferred** from what Creative already enters: wood or rockboard core → woodshop, 4C Litho → offset/flatbed, deboss/emboss decoration → deboss, metal category → metal. Inference is better because it keeps Creative from having to know the shop floor, but the mapping has to be written down and agreed to. Two carve-outs: `sewing` has no obvious signal in MCS's state, and **nothing in the configuration can distinguish metal tip-in from full metal work** — that T2/T3 discriminator needs an explicit field. Quantity almost certainly comes from the job record.

*T4 has no due date, and almost nothing triggers it anymore.* `TIER_INFO` gives T4 `days: null` — it's "TBD," not a number, so the UI needs a real state for "we can't commit a date yet." And deprecating the Coordinator removes every material-availability escalation (`not-in-stock`→T4, `ordered-in-stock`→T2), which means **T4 now fires only on quantity over 1000.** Worth confirming that's the intent rather than an accident of dropping the role.

**Yield engine.** Config + wrap + gap → cut dimensions → roll tiling → yardage and waste. Ports BC-00's formulas as-is to start. Note plainly: **BC-00's cut math is flagged in its own source as illustrative placeholder.** Calibrating it is not a polish item, it's the acceptance test — see §7.

---

## 5. The two interfaces

Both are the same shape: search across the top, status lanes on the left, a job card, and an INPUTS panel that fills the rest.

**Creative** — lanes: `PROOFING` / `PROTOTYPING`, plus a read-only lane for jobs released to production. INPUTS is the configurator. A live tier and due-date estimate sits alongside it so a designer can see the lead-time consequence of a material choice while they're making it.

**Bindery** — lanes: `INCOMING` / `IN PRODUCTION`. INPUTS is a read-only configuration summary, the two editable yield fields, and per-application material assignment. Alongside: the material yield table, the roll cross-section, and the lead time assessment block.

Job card content, from the board: job number, product description, customer name, management group.

---

## 6. Reports

Four, all generated from the record, all print-first, none of them storage.

- **Menu construction sheet** (Creative) — the MCS print view, essentially as it exists
- **Hardware sheet** (Creative) — binding hardware pull, extracted from what's currently buried in BLC's planner
- **Lead time calculation report** (Bindery) — tier, due date, and the qualifying factors that drove the escalation, so the number is auditable rather than magic
- **Comparison pull report** (Bindery) — see below

---

## 7. The comparison pull report is the validation instrument

This one isn't a production feature. It compares this tool's yield output against the existing pull-report calculator on the same job, so you can measure whether the new material-yield math is actually more efficient than what the shop runs today. The old calculator stays.

That makes it the thing that decides whether the yield engine ships, which argues for building it earlier than its position on the board suggests — as soon as the yield engine produces numbers, run both tools in parallel on real jobs and compare. It's also the only mechanism you have for calibrating BC-00's placeholder formulas.

---

## 8. Phasing

**Phase 0 — Lock decisions and schema.** Resolve §9. Write the job schema and the department-inference mapping. Decide the stack (see below). No UI.

**Phase 1 — Firebase foundation.** Auth, the `job` collection, security rules with field-level ownership, reference data (materials, hardware, vendors) moved into Firestore. Both interfaces get search + lanes + cards + create/move, operating on the header only. Small, boring, and it proves the multi-user story before the complicated part lands on top of it.

**Phase 2 — Port the configurator.** The big one. MCS's configuration surface and validation onto the live record, from the `feature/insert-sizes` branch, and onto PL-SHARED tokens. At the end of this phase Creative can do its whole job in the new tool and the PDF-as-storage machinery is gone.

**Phase 3 — Lead time.** Engine port, department inference, live estimate in the Creative panel, lead time calculation report on the Bindery side.

**Phase 4 — Yield + Bindery interface.** Engine port, wrap and center gap, material assignment, yield table, roll diagram. **Plus the comparison pull report and a parallel run** — this phase isn't done when the numbers render, it's done when they've been checked against the current calculator.

**Phase 5 — Reports and finish.** Menu construction sheet, hardware sheet, print polish.

Backlog, noted from the board and deliberately not in v1: multiple cover materials, board gated on woodshop core, carrier support, visualizer → schematic.

---

## 9. Open decisions

**Release to production — explicit action or driven by the stage toggle?** Your own answer was "tbd." Worth deciding in Phase 0, because it determines whether Creative can silently push an unfinished spec into Bindery's queue. The middle path: the toggle drives the lane, but moving to Production runs validation and requires a confirmation, so it's one click but not an accident. Creative keeps a read-only view afterward.

**Where does the job header come from?** BC-00 reads job number, name, quantity, panel count, and binding types from Job Maintenance via `MOCK_PRODUCTION_CONFIG` and never writes back. Does this tool own the header, or read it from `PL-JM`? Lead time needs quantity, so this can't stay vague past Phase 0.

**Stack.** Firebase is settled; the framework question isn't. Staying vanilla is genuinely viable — `00-MENULAW` already runs Firestore with modular v10 ESM imported straight from `gstatic.com` under `<script type="module">`, no bundler, using exactly the `signInAnonymously` + `onSnapshot` realtime pattern this tool needs. And the `loader.js` + `data-include` fragment pattern from `PL-JM-1.25` and `PL-BC-00` already gives you componentization without tooling. 00-INTAKE's README says "Avoid introducing frameworks or build tools" — a preference, worth respecting, but it's one repo's coding standards and shouldn't be treated as settling the question by itself. The real cost of vanilla is hand-rolled state binding across an app meaningfully larger than any of these.

**Retokenizing MCS and BLC.** Not a decision so much as unbudgeted work. Of the nine tool repos, MCS and BLC are the only two with **zero** references to `design-tokens.css` — BLC ships its own 18KB `shared.css` instead. They're also the two contributing the most code to this merge, so "port the configurator" quietly includes "move it onto PL-SHARED." Worth sizing before Phase 2 rather than discovering mid-port.

**Concurrent editing.** Multiple creative users on a live-record-only model is last-write-wins. Firestore's realtime listeners make stale views unlikely rather than impossible. Cheapest mitigation: per-field writes instead of whole-document saves, plus a visible "editing now" presence indicator. Worth a decision, not worth a locking system.
