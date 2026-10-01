/* =====================================================================
   CATALOG SERIALISER — 00-PL-PC
   ---------------------------------------------------------------------
   Turns catalog data into the text of data/catalog.js.

   Kept out of material-import.html on purpose, so any future caller
   reuses this instead of carrying its own copy. Copies drift — which is
   precisely how this project ended up with three divergent hardware
   configs and two incompatible material vocabularies.

   THE INVARIANT: identical data must produce identical bytes. Records are
   sorted by id, object keys are sorted, and nothing is derived from the
   clock. That is what makes "empty git diff = nothing changed" true, and
   an export that violates it makes the version history worthless.
   ===================================================================== */

// Write metadata. Stripped — it would churn every record on every
// export and bury the real changes.
export const DROP_FIELDS = new Set(['createdAt', 'updatedAt', 'importedAt', 'lastEditedAt']);

/* Recursively drop metadata, strip undefined, sort object keys.
   Timestamp objects (and the store's serverTimestamp sentinel) collapse to null
   and are then dropped by the key filter above. */
export function clean(v) {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') {
    if (typeof v.toDate === 'function') return null;
    if (v.__serverTimestamp) return null;
    const out = {};
    Object.keys(v).sort().forEach(k => {
      if (DROP_FIELDS.has(k)) return;
      const c = clean(v[k]);
      if (c !== undefined) out[k] = c;
    });
    return out;
  }
  return v === undefined ? undefined : v;
}

export const byId = (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true });

/* FNV-1a. Not security — a stable fingerprint so the same data always carries
   the same version string, in any browser, on any day. */
export function fingerprint(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).padStart(7, '0').slice(0, 7);
}

export function build(raw) {
  const d = {
    materials:   (raw.materials   || []).map(clean).sort(byId),
    hardware:    (raw.hardware    || []).map(clean).sort(byId),
    decorations: (raw.decorations || []).map(clean).sort(byId),
    departments: (raw.departments || []).map(clean).sort(byId),
    escalation:  (raw.escalation  || []).map(clean).sort(byId),
    materialCategories: (raw.materialCategories || []).map(clean).sort(byId),
    offsets: clean(raw.offsets || {}),
  };
  /* Version is a PURE CONTENT FINGERPRINT — no date, no clock. A date prefix
     would change the version on an unchanged catalog exported a day later, and
     a generated-at timestamp would churn two lines on every single export.
     Either one breaks the guarantee this whole format exists to provide. */
  return { ...d, version: fingerprint(JSON.stringify(d)) };
}

// One record per line: readable, and a one-field change is a one-line diff.
const rows = a => a.length ? '[\n' + a.map(r => '  ' + JSON.stringify(r)).join(',\n') + ',\n]' : '[]';
const obj = o => Object.keys(o).length ? JSON.stringify(o, Object.keys(o).sort(), 2) : '{}';

export function emit(d) {
  return `/* =====================================================================
   CATALOG — GENERATED FILE, DO NOT EDIT BY HAND
   ---------------------------------------------------------------------
   Cut from the Reference Data tool. To change anything here, change it
   there and re-export — a hand edit will be silently overwritten by the
   next export and the diff will lie.

   version      ${d.version}   (content fingerprint — same data, same version)

   Records are sorted by id and keys are sorted, and nothing here is derived
   from the clock, so an unchanged catalog re-exports BYTE-IDENTICAL. An empty
   git diff therefore means nothing changed, and the commit date is the export
   date. Write metadata (createdAt / updatedAt) is stripped on
   purpose — it would churn every record on every export and bury the real
   changes.
   ===================================================================== */

export const CATALOG_VERSION = ${JSON.stringify(d.version)};

export const materials = ${rows(d.materials)};

export const hardware = ${rows(d.hardware)};

export const decorations = ${rows(d.decorations)};

export const departments = ${rows(d.departments)};

/* Escalation rules are business policy, not catalog. Editing these changes the
   promised lead time on every open job, because tier and due date are computed
   on read and never stored. That is exactly why they belong in a versioned
   file — and why the tier should be frozen onto a job when it is released to
   production, so a rule change cannot silently move a date already promised. */
export const escalation = ${rows(d.escalation)};

export const materialCategories = ${rows(d.materialCategories)};

/* Binding offsets. The one honest edge case in the file-vs-database split: if
   Bindery tunes these from shop-floor experience they may want them editable
   without a deploy. Shipped here for now; per-job overrides live on the job
   record either way. */
export const offsets = ${obj(d.offsets)};

/* Indexed form — materialCategories is looked up by id at every call site. */
export const materialCategoriesById = Object.fromEntries(materialCategories.map(c => [c.id, c]));

/* The bundle the configurator loads. Shape matches what loadAll() used to
   assemble out of seven getDocs calls, so the call site is a one-line import. */
export const CATALOG = {
  version: CATALOG_VERSION,
  materials, hardware, decorations, departments, escalation,
  matcats: materialCategoriesById,
  offsets,
};

export default CATALOG;
`;
}

/* Convenience for callers that just want the text. */
export const serialize = raw => emit(build(raw));
