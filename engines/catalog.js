/* =====================================================================
   CATALOG LOOKUP — 00-PL-PC
   ---------------------------------------------------------------------
   Naming, describing and searching materials. Extracted from
   configurator.html (2026-08-10); the search predicate was previously
   inline in the material picker's oninput handler and could not be
   reused or tested.

   `ref` is the catalog imported from data/catalog.js. These functions
   do not care where the array came from. The snapshot
   helper at the bottom is the piece that has to exist before that move
   is safe.
   ===================================================================== */

const arr = v => Array.isArray(v) ? v : [];

/* The short code a human uses to refer to a material — RV032, RB29, MA50.
   Falls back to the document id, which for imported rows is built from the
   category's keyFields and is therefore stable across re-imports. */
export const materialKey = m =>
  [m.vendor, m.swatchNumber, m.itemId].filter(Boolean).join(' ') || m.id;

/* The human-readable line. Field order is deliberate — vendor and product
   line first because that is how the shop asks for material. */
export const describeMaterial = m =>
  [m.vendor, m.productLine, m.family, m.color, m.name, m.weight].filter(Boolean).join(' · ') || m.id;

export const findMaterial = (ref, id) =>
  id ? arr(ref.materials).find(m => m.id === id) || null : null;

/* The picker's search. Substring match across every string field on the
   record, active materials only, capped.

   Worth naming for the rebuild: this is a linear scan over ~1,100 records
   doing Object.values() on each, on every keystroke, matching anything
   anywhere. It is fast enough today and it is also why searching "black"
   returns leather, bookcloth and rockboard interleaved with no way to
   narrow. Category faceting probably beats making this cleverer. */
export function searchMaterials(ref, query, limit = 40) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  return arr(ref.materials)
    .filter(m => m.active !== false &&
      Object.values(m).some(v => typeof v === 'string' && v.toLowerCase().includes(q)))
    .slice(0, limit);
}

/* ---------------------------------------------------------------------
   NAME VARIANTS — one swatch sold under more than one name.

   The fabrics spreadsheet writes these as " / " inside the cell. LB211 is
   Family "Allure / Pearl Linen", Color "Wheat / Prairie Wheat": the same
   physical swatch is Allure Wheat or Pearl Linen Prairie Wheat. It stays
   ONE record with one id (jobs point at it and vendor + swatch # is the
   key); only what the MCS / BLC offer is split.

   Rules (decided 2026-10-01):
   - Only a slash with spaces either side splits. A bare slash is part of
     a real value — KFL colours "E266/M", every leather weight "2/3 oz.".
   - Only NAME_VARIANT_FIELDS split.
   - Names pair by position: the 1st family goes with the 1st colour.
   - A field with a single name goes with every variant ("Allure /
     Arrestox" + "Paprika" → Allure Paprika, Arrestox Paprika).
   - Counts that don't line up (2 families, 3 colours) can't be paired.
     The record is offered unsplit and flagged in the CSV import's review.
   - A job saves the name the designer picked, not the combined cell.
   --------------------------------------------------------------------- */
export const NAME_VARIANT_FIELDS = ['family', 'color'];
const VARIANT_SEP = /\s+\/\s+/;

export const splitNames = v => typeof v === 'string' && VARIANT_SEP.test(v)
  ? v.split(VARIANT_SEP).map(x => x.trim()).filter(Boolean) : null;

/* -> { variants: [record, ...], mismatch: null | { fieldId: count } }
   Each variant is a shallow copy of the record (same id) with the split
   fields set to one name each. A record with nothing to split comes back
   as a single variant: itself. */
export function nameVariants(m) {
  const parts = {};
  NAME_VARIANT_FIELDS.forEach(f => { const p = splitNames(m[f]); if (p && p.length > 1) parts[f] = p; });
  const counts = [...new Set(Object.values(parts).map(p => p.length))];
  if (!counts.length) return { variants: [m], mismatch: null };
  if (counts.length > 1) {
    const mismatch = {};
    Object.entries(parts).forEach(([f, p]) => { mismatch[f] = p.length; });
    return { variants: [m], mismatch };
  }
  const variants = [];
  for (let i = 0; i < counts[0]; i++) {
    const v = { ...m };
    Object.entries(parts).forEach(([f, p]) => { v[f] = p[i]; });
    variants.push(v);
  }
  return { variants, mismatch: null };
}

/* ---------------------------------------------------------------------
   HARDWARE OPTIONS — what a hardware field offers.

   The catalog is the one hardware list for the MCS and the BLC
   (decided 2026-10-01; the BLC's own HW_PLANNER_CONFIG is gone).

   hardwareTypes(ref)                 active types, in catalog order
   hardwareSuggest(type, fieldId, values)
     A type with combinations (Reference Data → Edit hardware,
     "Dependent combinations") offers only the values that exist
     together with what is already typed in the item's other fields —
     a case-insensitive substring match, like comboOptions(). A type
     without combinations offers the field's own option list.
     Suggestions only: anything can still be typed.
   --------------------------------------------------------------------- */
export function hardwareTypes(ref) {
  return arr(ref.hardware).filter(h => h.active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.label).localeCompare(b.label));
}

export function hardwareSuggest(type, fieldId, values = {}) {
  if (!type) return [];
  const field = arr(type.fields).find(f => f.id === fieldId) || {};
  const combos = arr(type.combos);
  if (!combos.length) return arr(field.options).slice();
  const want = Object.keys(values)
    .filter(k => k !== fieldId && arr(type.fields).some(f => f.id === k) && String(values[k] || '').trim())
    .map(k => [k, String(values[k]).trim().toLowerCase()]);
  const out = new Set();
  combos.forEach(r => {
    if (r[fieldId] && want.every(([k, v]) => String(r[k] || '').toLowerCase().includes(v))) out.add(r[fieldId]);
  });
  return [...out].sort(numericSort);
}

/* ---------------------------------------------------------------------
   SNAPSHOT — not yet wired in, deliberately.

   Jobs currently store only `materialId` and resolve it against whatever
   catalog is loaded at render time. That is already a latent bug (reprint
   a job from six months ago and it renders against today's catalog), and
   it becomes a real one the moment the catalog is a versioned file that
   can drop a row.

   The fix is for the job to carry a copy of the fields it actually depends
   on, with the id kept for re-linking. Left here as the shape to adopt
   rather than applied, because writing it into job records is a schema
   decision that belongs with the rebuild, not with a refactor.
   --------------------------------------------------------------------- */
export const SNAPSHOT_FIELDS = ['vendor', 'swatchNumber', 'itemId', 'productLine',
                               'family', 'color', 'name', 'weight',
                               'categoryId', 'rollWidth', 'patternSensitive'];

export function snapshotMaterial(m, catalogVersion = null) {
  if (!m) return null;
  const snap = { materialId: m.id, key: materialKey(m), label: describeMaterial(m) };
  SNAPSHOT_FIELDS.forEach(f => { if (m[f] != null && m[f] !== '') snap[f] = m[f]; });
  if (catalogVersion) snap.catalogVersion = catalogVersion;
  return snap;
}

/* ---------------------------------------------------------------------
   MATERIAL OPTIONS — what a material-table row offers the user.

   Turns the catalog into
     { categories: [{ id, label, interior, fields: [{ id, label, options }], rows }] }
   one entry per material category, one input per field, `options` the
   distinct values in the catalog, and `rows` the active catalog records
   reduced to those fields — which is what comboOptions() filters.
   Used by components/materials (the section shared by mcs/ and blc/).

   Things the catalog does not carry, handled here so callers don't guess:
   - Category labels. Derived from the id ("4c-litho" -> "4C Litho").
   - Field order and labels. Order follows FIELD_ORDER (how the shop asks for
     material); labels match CATEGORY_SCHEMAS in material-import.html.
     A field this file has not heard of is still offered — appended last,
     labelled from its id — so a new column in the spreadsheet import shows
     up instead of silently vanishing.
   - Fields for categories with no materials in the catalog yet. They get
     a single Name field: with no records there is no ID to pick.
   - Name variants. A material sold under two names ("Allure / Pearl
     Linen") becomes one row per name pair — see nameVariants() above.
   - Which categories can be used on the interior. Copied from
     MATERIAL_CONFIG in mcs/material-config.js (interior: true).
   - Categories MCS has always offered that the catalog has no record of yet
     (EXTRA_CATEGORIES). Dropping them would take a choice away from the
     designers; they go once Reference Data has records for them.
   --------------------------------------------------------------------- */
const FIELD_ORDER = ['vendor', 'productLine', 'family', 'weight', 'color', 'decoration',
                     'swatchNumber', 'itemId', 'vendorId', 'name'];
const FIELD_LABELS = { swatchNumber: 'Swatch #', itemId: 'ID', vendorId: 'Vendor ID' };
/* Bookkeeping and tool-owned columns — never something a planner types. */
const NON_FIELDS = new Set(['active', 'categoryId', 'id', 'source', 'sourceFile', 'notes',
                            'rollWidth', 'patternSensitive', 'decorationEligible',
                            'importedAt', 'createdAt', 'updatedAt', 'lastEditedAt']);
const INTERIOR_CATEGORIES = ['bookcloth', '4c-litho', 'other'];
const EXTRA_CATEGORIES = ['carbonite', 'other'];

export const categoryLabel = id => String(id).split('-')
  .map(w => /^\d+[a-z]$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))
  .join(' ');

const fieldLabel = id => FIELD_LABELS[id] ||
  id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

const fieldRank = id => { const i = FIELD_ORDER.indexOf(id); return i < 0 ? FIELD_ORDER.length : i; };

const numericSort = (a, b) => a.localeCompare(b, undefined, { numeric: true });

export function materialOptions(ref) {
  const mats = arr(ref.materials).filter(m => m.active !== false);
  /* The CATALOG bundle indexes categories as `matcats` (id -> record); the raw
     export calls them `materialCategories` (array). Accept either. */
  const cats = ref.matcats ? Object.keys(ref.matcats) : arr(ref.materialCategories).map(c => c.id);
  const ids = new Set(cats);
  mats.forEach(m => m.categoryId && ids.add(m.categoryId));
  EXTRA_CATEGORIES.forEach(id => ids.add(id));

  return {
    categories: [...ids].map(id => {
      const recs = mats.filter(m => m.categoryId === id);
      const keys = new Set();
      recs.forEach(m => Object.keys(m).forEach(k => { if (!NON_FIELDS.has(k)) keys.add(k); }));
      /* A category with nothing in the catalog yet has nothing to pick, so
         it gets one free-text Name — no ID field (decided 2026-10-01). */
      const fieldIds = keys.size ? [...keys] : ['name'];
      fieldIds.sort((a, b) => fieldRank(a) - fieldRank(b) || a.localeCompare(b));
      /* One row per name variant, so a split name is offered on its own
         and combination-aware autocomplete pairs it correctly. */
      const rows = recs.flatMap(m => nameVariants(m).variants).map(m => {
        const r = {};
        fieldIds.forEach(f => { r[f] = typeof m[f] === 'string' ? m[f].trim() : ''; });
        return r;
      });
      return {
        id, label: categoryLabel(id), interior: INTERIOR_CATEGORIES.includes(id),
        fields: fieldIds.map(f => ({
          id: f, label: fieldLabel(f),
          options: [...new Set(rows.map(r => r[f]).filter(Boolean))].sort(numericSort),
        })),
        rows,
      };
    }).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/* Autocomplete that respects what is already filled in.

   `rows` is a category's rows (from materialOptions), `values` is what the
   user has typed so far, keyed by field id, and `fieldId` is the field being
   completed. Returns the distinct values of `fieldId` among the rows that
   match every OTHER non-empty value — so after "Majilite" in Vendor, Product
   Line offers only Majilite's product lines.

   A typed value matches as a case-insensitive substring, not an exact match,
   so a half-typed "Maj" still narrows the other fields instead of emptying
   them. The field's own text is ignored: it is being typed, and the browser
   filters on that itself. */
export function comboOptions(rows, values, fieldId) {
  const want = Object.keys(values || {})
    .filter(k => k !== fieldId && String(values[k] || '').trim())
    .map(k => [k, String(values[k]).trim().toLowerCase()]);
  const out = new Set();
  arr(rows).forEach(r => {
    if (r[fieldId] && want.every(([k, v]) => String(r[k] || '').toLowerCase().includes(v))) out.add(r[fieldId]);
  });
  return [...out].sort(numericSort);
}
