/* =====================================================================
   CATALOG LOOKUP — 00-PL-PC
   ---------------------------------------------------------------------
   Naming, describing and searching materials. Extracted from
   configurator.html (2026-08-10); the search predicate was previously
   inline in the material picker's oninput handler and could not be
   reused or tested.

   This file is where the catalog-as-config-file move lands. Today `ref`
   is whatever the configurator loaded out of Firestore; once the catalog
   becomes a versioned file, only the import at the call site changes —
   these functions do not care where the array came from. The snapshot
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
