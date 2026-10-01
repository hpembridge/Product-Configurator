# Product Configurator — Project Context

Written 2026-09-30. Context for anyone (people or agents) working in this repo: what the tool is, and what Healey is trying to do with it. Rules for *how* to write code are in `CLAUDE.md`. This file covers *what* and *why*.

---

## 1. What this is

Cleveland Menu specifies each custom menu job more than once, in separate tools that don't talk to each other. This repo (`00-PL-PC`) is where two of those tools are being brought together, so that one job's configuration flows from Creative to Bindery without being typed in twice.

| Tool | Folder | Who uses it | What it does |
|---|---|---|---|
| **MCS** — Menu Construction Sheet | `mcs/` | Creative (designers) | Specifies how the menu is built: job header, stage (Proof / Prototype / Production), sizes, exterior + interior materials, interior functions, customizations, binding, decoration, notes. Output is a printed PDF. |
| **BLC** — Bindery Leadtime Calculator (titled "Preproduction Materials List") | `blc/` | Bindery | **Planner** enters cover materials, hardware, production departments and interior components, and gets a lead-time tier and due date. |
| **Reference Data** | `material-import.html` | Healey | Maintains the shared catalog (materials imported from the fabrics spreadsheet, hardware, decorations, departments, escalation rules). Exports `data/catalog.js`. |

Supporting code:
- `engines/` — pure-function math pulled out of an earlier prototype: `lead-time.js` (departments, tier, workdays), `geometry.js` (inserts, offsets, cut sizes), `catalog.js` (material naming and search), `catalog-store.js` + `catalog-serialize.js` (the in-memory catalog behind Reference Data). `verify.mjs` checks the engines still match the original logic.
- `data/catalog.js` — generated catalog file: 1,245 materials (bookcloth 1,078, leather 132, rockboard 35), 12 hardware types, 7 decorations, 6 departments, 4 escalation tiers.
- `hardware-config.js` — record of where each hardware definition was pulled from.
- `shared/` — PL-SHARED design-token submodule.
- `Product Configuration-merge-plan.md` — the original merge plan (2026-08-05). **It assumes Firebase, which has since been dropped.** Its analysis of the three tools still holds; its data model, phasing and multi-user plans don't.

### How it got here
- MCS and BLC were separate repos (`00-PL-MCS`, `00-PL-BLC`). They were copied in unchanged on 2026-09-30: MCS from `main` (not the unmerged `feature/insert-sizes` branch), BLC from `main`. The original repos still exist next to this one.
- A Firebase-backed configurator with a jobs board was tried and **removed** (2026-09-30). Firebase won't work for this. `configurator.html` and `export-catalog.html` were deleted, and Reference Data no longer has any Firebase code.
- MCS and BLC don't read `data/catalog.js` yet. Each still has its own hardcoded reference lists.

---

## 2. What Healey wants to do next

Five improvements, in no fixed order. Each one lists the current state and the decisions it depends on. **Ask Healey about any decision marked open. Don't guess.**

### 2.1 Exterior and interior materials tables work the same in both tools
- **Done:** one shared component, `components/materials/` (`materials.html` markup + templates, `materials.css`, `materials.js`). Both `mcs/index.html` and `blc/planner.html` mount it; the BLC turns on the Qty and Unit columns (`showQty: true`), the MCS leaves them off.
- **Data:** categories, fields and autocomplete come from `data/catalog.js` through `materialOptions()` / `comboOptions()` in `engines/catalog.js`. Autocomplete is combination-aware: each field only suggests values that exist together with whatever is typed in the row's other fields. Pages using the component must be served over http (the catalog is an ES module).
- **State:** `materialsSection.getState()` / `setState()` — `{ ext, int, fnCards, ccInt }`, values stored by field id. MCS sheets saved before the component (positional `s.ext` / `s.int`) are converted on load using `mcs/material-config.js`, which is kept only for that.
- **Open:** the interior-category rule (bookcloth, 4C Litho, other) is a constant in `engines/catalog.js`, since the catalog has no interior flag; "Carbonite" and "Other" are added there because they are not catalog categories yet.

### 2.2 MCS uses localStorage the way BLC does
- **BLC today:** saves a draft per job (`pp_planner_job_<jobOrder>`, `pp_planner_active_jobs`, and coordinator equivalents `pp_job_<jobOrder>`, `pp_active_jobs`). Saves when the job # field loses focus; the draft is removed once the job's PDF is saved.
- **MCS today:** saves only `mcs_designer` and the accent colour. Everything else lives on the page, and the saved PDF is the only record. `captureFormState()` / `restoreFormState()` already exist, so most of the work is wiring them up.
- **Open:** key naming, when to save (on change vs. on blur), how to list or reopen saved jobs, and when a draft gets cleared.

### 2.3 Hardware options come to MCS
- **BLC today:** `HW_PLANNER_CONFIG` in `planner.html` (13 types, each with fields and suggestion lists; columns are Type, Details, Qty/ea and Total). The coordinator has its own copy that has drifted, and `shared.js` has an older `HW_MATERIALS`.
- **Catalog:** 12 hardware types. Five are flagged as binding: bands, clips, elastic-cords, ring-binder and screw-posts. The others are custom-hardware, eyelets, magnets, o-rings, plastic-sleeves, rivets and snaps.
- **MCS today:** no hardware section, but its Binding cards (Corners, Tabs, Menu Cord, Screwposts, Ring Binder, Clips, Bands, Other) overlap heavily with the hardware list.
- **Decided 2026-10-01:** Binding cards stay. Menu Cord, Screwposts, Ring Binder, Clips and Bands now show their catalog hardware fields (suggestions from the catalog, combination-aware) plus Qty/ea, in place of the free-text Size / Color. Non-binding hardware (`isBinding !== true`) is added from **+ Hardware** under Customizations, one card per item, with Qty/ea. All visible fields are required. Code: `mcs/hardware-fields.js`; saved as `s.bind[key].hw` and `s.hw`; both go to the BLC in `s.blc.hardware` with `qtyEa`.
- **Decided 2026-10-01:** the catalog is the one hardware list for both tools. The BLC's `HW_PLANNER_CONFIG` is now filled from `data/catalog.js` (`hardwareTypes()` / `hardwareSuggest()` in `engines/catalog.js`, shared with the MCS). Old BLC drafts and PDFs are converted on load (`upgradeHwFields()` in `blc/planner.html`); a Rowmark hardware row comes back as Custom Hardware. Catalog hardware was cleaned up the same day: eyelet combinations un-swapped; field ids renamed to say what they hold (elastic-cords `closureColor` / `closureStyle` / `length`, ring-binder `rings` / `model`, plastic-sleeves `type` / `size`); combination values spelled one way; each combination type's option lists now match its combinations.

### 2.4 Production departments are tied to MCS decoration options
- **BLC today:** six departments hardcoded as toggles: deboss, offset, flatbed, sewing, woodshop, metal (metal also has a Tip-in only / Full choice). They push the tier up: offset and sewing → T2; flatbed and woodshop → T3; metal tip-in → T2, full → T3.
- **MCS today:** decorations are Deboss, Emboss, Diecut Window, Laser-Cut / Engrave, Color Print and Other (`DECOR` in `mcs/index.html`). None of them carry a department.
- **Catalog already has the mapping:** deboss→deboss, colorprint→flatbed, laser→woodshop, sewing→sewing. Diecut, Emboss and Other have **no department**. Material categories are also tagged: 4C Litho→offset, Acrylic / Rockboard / Wood→woodshop, Metal→metal. `engines/lead-time.js` (`inferDepartments`, `computeTier`) already works departments out from these tags.
- **Open:** departments for Diecut, Emboss and Other; whether Color Print splits into offset vs. flatbed; how metal tip-in vs. full is captured; whether designers see the departments or they only reach Bindery.

### 2.5 Download from MCS, upload into BLC
- **Today:** both tools save their state inside the printed PDF (base64 JSON between `%%CS%%` markers, read back with pdf.js). But the state shapes differ (MCS `v:1`, BLC `version:4`), and BLC can only read PDFs in the **coordinator**, not the planner.
- **This is the handoff between departments.**
- **Open:** file format (JSON download, the existing PDF embed, or both); what BLC does with fields it doesn't have; which BLC role receives it (planner, coordinator, or a merged view); versioning when MCS is re-exported after changes.

---

## 3. Other things to know

- **Coordinator role:** the merge plan proposed dropping BLC's coordinator (availability, arrivals checklist, sign-off). It was ported unchanged. Whether it stays is **open**.
- **Insert sizes:** a dynamic insert table (inserts auto-create binding cards) exists only on `00-PL-MCS`'s `feature/insert-sizes` branch. Use it as reference if insert work comes up, but it's older than `main`.
- **Specs** in `mcs/specs/` (insert sizes, cover size calculator, decoration–material linkage) are 2026-06-11 drafts waiting on Colin. The decoration–material linkage spec ("Apply To" on each decoration card, a read-only Decoration column on each material row) is closely related to §2.1 and §2.4.
- **Tokens:** neither MCS nor BLC uses PL-SHARED tokens yet. BLC ships its own `shared.css` and MCS has one inline `<style>` block. Moving them onto `shared/css/design-tokens.css` is unbudgeted work. Flag undefined tokens, don't invent values.
- **External dependencies:** pdf.js 3.11.174 from cdnjs (both tools, loaded on demand); a Font Awesome kit (BLC); Google Sans Flex (Reference Data).
- **Lead-time tiers:** T1 Fast Track 15 working days, T2 Standard 25, T3 Complex 40, T4 TBD (no date). Quantity also escalates: >100 → T2, >250 → T3, >1000 → T4.

---

## 4. Working agreements

- **Ask Healey** before any product, shop-floor or scope decision, anything marked open above, and before expanding scope beyond the task at hand.
- **Plain communication, no preamble.** Structured, field-by-field output for documentation.
- **Match existing naming conventions** in the file you're working in.
- **Don't commit** unless asked.
- **Original repos** (`../00-PL-MCS`, `../00-PL-BLC`) are reference only. Don't edit them.
