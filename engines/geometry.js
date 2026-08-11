/* =====================================================================
   GEOMETRY ENGINE — 00-PL-PC
   ---------------------------------------------------------------------
   Insert sizes, panel caps, binding offsets, cut dimensions.
   Extracted from configurator.html (2026-08-10) ahead of the interface
   rebuild. Behaviour-preserving — every formula is the one that was
   running, only de-globalised from `S.ref` to an explicit `ref` argument.

   Of note: cutSize() did not previously exist as a function. It lived
   inside a paint() closure nested in renderBindery, which meant the one
   piece of arithmetic the bindery half of this tool exists to produce
   could not be called from a report, a test, or anywhere else. That is
   the main thing this file fixes.

   `ref` shape:
     offsets   { [hardwareTypeId]: { vertical: Number, horizontal: Number } }
               (Firestore settings/offsets → byBindingType; absent is fine)
   ===================================================================== */

/* Lifted from BC-00 (bindery-calculator.js state.settings.offsets).
   Vertical/horizontal per binding type, added twice — once each side — to
   the insert size to get the cut dimension. Merge-plan decision 11: global
   default owned by Bindery and the Creative lead, with a per-job override.

   BC-00 keyed these by its own binding names. Three map onto hardware types
   that actually exist here; the other two (interiorBoards, slidePocket)
   belong to corners, tabs and pockets, which are deferred. Anything unmapped
   falls back to the 0.25 BC-00 uses for most groups. */
export const OFFSET_DEFAULTS = {
  'ring-binder':   { vertical: 0.25, horizontal: 0.375 },   // BC-00 "rings"
  'screw-posts':   { vertical: 0.25, horizontal: 0.375 },   // BC-00 "screwpost"
  'elastic-cords': { vertical: 0.5,  horizontal: 0.25  },   // BC-00 "cord"
  _fallback:       { vertical: 0.25, horizontal: 0.25  },
};

export const globalOffset = (typeId, ref = {}) =>
  (ref.offsets || {})[typeId] || OFFSET_DEFAULTS[typeId] || OFFSET_DEFAULTS._fallback;

/* Per-job override wins over the global default, per dimension. An override
   of '' or null falls through to the global — only a real number overrides,
   so clearing the field restores the default rather than zeroing the offset. */
export function effOffset(job, typeId, ref = {}) {
  const g = globalOffset(typeId, ref);
  const o = (job.offsetOverrides || {})[typeId] || {};
  return {
    vertical:   o.vertical   != null && o.vertical   !== '' ? +o.vertical   : g.vertical,
    horizontal: o.horizontal != null && o.horizontal !== '' ? +o.horizontal : g.horizontal,
  };
}

/* Insert sizes are linked to the job by default — one size the whole piece is
   built around, because that is the normal case. BC-00 carries a separate
   insertSize per binding type, so unlinking has to stay possible.

   NOTE: jobInsert mutates `job` when the field is absent, seeding it with a
   blank record. That was the original behaviour and is preserved deliberately
   so this extraction stays behaviour-preserving — but a getter with a write
   side-effect is a trap, and the rebuild should seed this at job creation
   instead and make this a pure read. */
export function jobInsert(job) {
  return job.insertSize || (job.insertSize = { width: '', height: '', inserts: '', carriers: '' });
}

export const rowInsert = (job, row) =>
  (row && row.linkInsert === false && row.insertSize) ? row.insertSize : jobInsert(job);

export const fmtInsert = i => (i && i.width && i.height) ? `${i.width} × ${i.height}` : 'not set';

// Merge-plan decision 15: each panel has two sides, so the shared cap is
// panelCount × 2 — pooled across interior boards, wrapped and Lexide panels.
export const panelCap = job => (parseInt(job.panelCount, 10) || 0) * 2;

/* Trailing-zero trim: 10.000 → "10", 10.250 → "10.25", 200.000 → "200".
   The regex only matches a run of zeros that reaches end-of-string, optionally
   preceded by the decimal point, so it never eats significant digits. */
export const trimNum = n => n.toFixed(3).replace(/\.?0+$/, '');

/* THE CUT SIZE. Insert dimension plus the offset applied to both sides, so the
   cut grows by twice the offset in each direction.

   Returns null when the insert size is not yet set — the caller decides how to
   say "needs an insert size"; this does not invent a number. `row` is the
   binding row for this type, used only to resolve a possibly-unlinked insert. */
export function cutSize(job, typeId, ref = {}, row = null) {
  const ins = rowInsert(job, row || (job.binding || []).find(b => b.typeId === typeId));
  const w = parseFloat(ins.width), h = parseFloat(ins.height);
  if (!isFinite(w) || !isFinite(h)) return null;
  const o = effOffset(job, typeId, ref);
  return { width: w + 2 * o.horizontal, height: h + 2 * o.vertical };
}

export const fmtCutSize = c => c ? `${trimNum(c.width)} × ${trimNum(c.height)}` : null;

/* Every distinct binding type on the job, which is the set that gets an offset
   row. Mirrors BC-00's definedOffsetGroups() — types not on the job do not
   get offsets, because there is nothing to cut. */
export const offsetGroups = job => [...new Set((job.binding || []).map(b => b.typeId))];
