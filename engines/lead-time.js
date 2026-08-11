/* =====================================================================
   LEAD TIME ENGINE — 00-PL-PC
   ---------------------------------------------------------------------
   Extracted verbatim from configurator.html (2026-08-10) ahead of the
   interface rebuild. Behaviour-preserving: no rule was changed, only
   de-globalised. Where the original read the module-level `S.ref`, these
   functions take a `ref` argument instead, so the same code runs in the
   configurator, in a report, in a test, or in Node.

   Origin: BLC's determineTierFromState() + TIER_INFO + addWorkdays(),
   reworked so the rules are authored as data in Reference Data rather
   than hardcoded. Nothing here is stored on the job — tier and due date
   are derived on read. See merge plan §4.

   `ref` shape (every array may be empty; missing keys are tolerated):
     departments  [{ id, label, order }]
     decorations  [{ id, label, departments: [deptId] }]
     hardware     [{ id, label, isBinding }]
     materials    [{ id, categoryId }]
     matcats      { [categoryId]: { departments: [deptId] } }
     escalation   [{ id: '1'|'2'|'3'|'4', label, leadDays, rules: [...] }]

   A rule is one of:
     { type: 'qty',        op: '>' | '≥', value: Number }
     { type: 'department', id: deptId, qualifier?: String }
     { type: 'decoration', id: decorationId }
     { type: 'binding',    id: hardwareId }
     { type: 'condition',  text: String, gap?: String }
   ===================================================================== */

const arr = v => Array.isArray(v) ? v : [];

/* Which departments this job pulls in, and what put them there.
   Returns Map<departmentId, reasons[]> — the reasons are what makes the
   tier readout auditable rather than magic (merge plan §6). */
export function inferDepartments(job, ref = {}) {
  const hits = new Map();
  const add = (id, why) => { if (!hits.has(id)) hits.set(id, []); hits.get(id).push(why); };

  arr(job.decorations).forEach(d => {
    const def = arr(ref.decorations).find(x => x.id === d.typeId);
    arr(def?.departments).forEach(dep => add(dep, `${def.label} decoration`));
  });
  arr(job.materials).forEach(m => {
    if (!m.materialId) return;
    const mat = arr(ref.materials).find(x => x.id === m.materialId);
    if (!mat) return;
    arr((ref.matcats || {})[mat.categoryId]?.departments).forEach(dep =>
      add(dep, `${mat.categoryId} material`));
  });
  return hits;
}

/* Tip-in comes off the Diecut Window decoration's Tip-In field, so it is
   answerable from the record without asking Creative about the shop floor. */
export function tipInOnly(job) {
  const dc = arr(job.decorations).find(d => d.typeId === 'diecut');
  return !!dc && String(dc.values?.tipIn || '').toLowerCase() === 'yes';
}

/* A department rule can carry a qualifier — today only Metal Shop does, split
   by whether the job is tip-in only. Any other qualifier returns null and is
   reported as unevaluated rather than quietly assumed true.

   ORDER MATTERS AND IS NOT ACCIDENTAL. The tier-3 qualifier reads
   "full metal work (Tip-In not set)" — it contains the substring "tip-in"
   while meaning its exact opposite. The negative phrasings MUST be tested
   before the bare mention or tier 3 silently becomes tier 2. */
export function qualifierHolds(rule, job) {
  const q = (rule.qualifier || '').toLowerCase();
  if (!q) return true;
  if (q.includes('full') || q.includes('not set')) return !tipInOnly(job);
  if (q.includes('tip-in only') || q.includes('tip-in')) return tipInOnly(job);
  return null;   // unknown qualifier — do not guess
}

/* Config in, tier + qualifying factors out.
   Returns { tier, label, leadDays, reasons, unevaluated, depts }.
   `leadDays` is null for tier 4 — that is "TBD", not zero, and callers have
   to render a real state for it rather than computing a date (merge plan §4). */
export function computeTier(job, ref = {}) {
  const depts = inferDepartments(job, ref);
  const reasons = [], unevaluated = [];
  let tier = 1;
  const fire = (n, text) => { if (n > tier) tier = n; reasons.push({ level: n, text }); };

  arr(ref.escalation).forEach(t => {
    const level = parseInt(t.id, 10);
    arr(t.rules).forEach(r => {
      if (r.type === 'qty') {
        const q = parseInt(job.quantity, 10) || 0;
        const ok = r.op === '≥' ? q >= r.value : q > r.value;
        if (ok) fire(level, `Quantity (${q.toLocaleString()}) ${r.op || '>'} ${Number(r.value).toLocaleString()}`);
      } else if (r.type === 'department') {
        if (!depts.has(r.id)) return;
        const label = arr(ref.departments).find(d => d.id === r.id)?.label || r.id;
        const held = qualifierHolds(r, job);
        if (held === true) fire(level, `${label} required${r.qualifier ? ` — ${r.qualifier}` : ''}`);
        else if (held === null) unevaluated.push(`${label} — “${r.qualifier}” can’t be evaluated from the record`);
      } else if (r.type === 'decoration') {
        if (arr(job.decorations).some(d => d.typeId === r.id))
          fire(level, (arr(ref.decorations).find(d => d.id === r.id)?.label || r.id) + ' specified');
      } else if (r.type === 'binding') {
        if (arr(job.binding).some(b => b.typeId === r.id))
          fire(level, (arr(ref.hardware).find(h => h.id === r.id)?.label || r.id) + ' binding');
      } else if (r.type === 'condition') {
        unevaluated.push(r.text + (r.gap ? ` — ${r.gap}` : ''));
      }
    });
  });

  const bucket = arr(ref.escalation).find(t => parseInt(t.id, 10) === tier);
  return { tier, label: bucket?.label || '', leadDays: bucket?.leadDays ?? null,
           reasons, unevaluated: [...new Set(unevaluated)], depts };
}

/* BLC's addWorkdays: weekdays only. Holidays are not modelled here, and were
   not modelled in BLC either — worth fixing, but fixing it is a change to the
   promise the shop makes, not a refactor. */
export function addWorkdays(from, days) {
  const d = new Date(from.getTime());
  let left = days;
  while (left > 0) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) left--; }
  return d;
}

/* The clock starts when Bindery opens the job, not when Creative configures
   it. Before that stamp exists there is a duration but no date — this returns
   null for that case rather than inventing one from today. */
export function dueDate(job, ref = {}) {
  const { leadDays } = computeTier(job, ref);
  if (leadDays == null || !job.binderyStartedAt) return null;
  return addWorkdays(new Date(job.binderyStartedAt), leadDays);
}

export const fmtDate = d =>
  d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
