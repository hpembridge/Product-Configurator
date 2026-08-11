/* Behaviour-preservation check for the 2026-08-10 engine extraction.
   The ORIGINAL inline implementations are pasted below verbatim from
   configurator.html@HEAD (reading a module-level S.ref, as they did).
   Both are run over the same fixtures and every field is compared. */

import { computeTier as newTier, inferDepartments as newDepts,
         qualifierHolds as newQual, addWorkdays as newAddWorkdays } from './lead-time.js';
import { effOffset as newEffOffset, cutSize as newCutSize,
         panelCap as newPanelCap, trimNum, OFFSET_DEFAULTS } from './geometry.js';

/* ============ ORIGINAL CODE, VERBATIM ============ */
let S = { ref: {} };

function inferDepartments(job) {
  const hits = new Map();
  const add = (id, why) => { if (!hits.has(id)) hits.set(id, []); hits.get(id).push(why); };
  (job.decorations || []).forEach(d => {
    const def = S.ref.decorations.find(x => x.id === d.typeId);
    (def?.departments || []).forEach(dep => add(dep, `${def.label} decoration`));
  });
  (job.materials || []).forEach(m => {
    if (!m.materialId) return;
    const mat = S.ref.materials.find(x => x.id === m.materialId);
    if (!mat) return;
    (S.ref.matcats[mat.categoryId]?.departments || []).forEach(dep =>
      add(dep, `${mat.categoryId} material`));
  });
  return hits;
}
function tipInOnly(job) {
  const dc = (job.decorations || []).find(d => d.typeId === 'diecut');
  return !!dc && String(dc.values?.tipIn || '').toLowerCase() === 'yes';
}
function qualifierHolds(rule, job) {
  const q = (rule.qualifier || '').toLowerCase();
  if (!q) return true;
  if (q.includes('full') || q.includes('not set')) return !tipInOnly(job);
  if (q.includes('tip-in only') || q.includes('tip-in'))  return tipInOnly(job);
  return null;
}
function computeTier(job) {
  const depts = inferDepartments(job);
  const reasons = [], unevaluated = [];
  let tier = 1;
  const fire = (n, text) => { if (n > tier) tier = n; reasons.push({ level: n, text }); };
  S.ref.escalation.forEach(t => {
    const level = parseInt(t.id, 10);
    (t.rules || []).forEach(r => {
      if (r.type === 'qty') {
        const q = parseInt(job.quantity, 10) || 0;
        const ok = r.op === '≥' ? q >= r.value : q > r.value;
        if (ok) fire(level, `Quantity (${q.toLocaleString()}) ${r.op || '>'} ${Number(r.value).toLocaleString()}`);
      } else if (r.type === 'department') {
        if (!depts.has(r.id)) return;
        const label = S.ref.departments.find(d => d.id === r.id)?.label || r.id;
        const held = qualifierHolds(r, job);
        if (held === true) fire(level, `${label} required${r.qualifier ? ` — ${r.qualifier}` : ''}`);
        else if (held === null) unevaluated.push(`${label} — “${r.qualifier}” can’t be evaluated from the record`);
      } else if (r.type === 'decoration') {
        if ((job.decorations || []).some(d => d.typeId === r.id))
          fire(level, (S.ref.decorations.find(d => d.id === r.id)?.label || r.id) + ' specified');
      } else if (r.type === 'binding') {
        if ((job.binding || []).some(b => b.typeId === r.id))
          fire(level, (S.ref.hardware.find(h => h.id === r.id)?.label || r.id) + ' binding');
      } else if (r.type === 'condition') {
        unevaluated.push(r.text + (r.gap ? ` — ${r.gap}` : ''));
      }
    });
  });
  const bucket = S.ref.escalation.find(t => parseInt(t.id, 10) === tier);
  return { tier, label: bucket?.label || '', leadDays: bucket?.leadDays ?? null,
           reasons, unevaluated: [...new Set(unevaluated)], depts };
}
function addWorkdays(from, days) {
  const d = new Date(from.getTime());
  let left = days;
  while (left > 0) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) left--; }
  return d;
}
const OLD_OFFSET_DEFAULTS = {
  'ring-binder':   { vertical: 0.25, horizontal: 0.375 },
  'screw-posts':   { vertical: 0.25, horizontal: 0.375 },
  'elastic-cords': { vertical: 0.5,  horizontal: 0.25  },
  _fallback:       { vertical: 0.25, horizontal: 0.25  },
};
const globalOffset = id => S.ref.offsets[id] || OLD_OFFSET_DEFAULTS[id] || OLD_OFFSET_DEFAULTS._fallback;
const effOffset = (job, id) => {
  const g = globalOffset(id), o = (job.offsetOverrides || {})[id] || {};
  return { vertical:   o.vertical   != null && o.vertical   !== '' ? +o.vertical   : g.vertical,
           horizontal: o.horizontal != null && o.horizontal !== '' ? +o.horizontal : g.horizontal };
};
const jobInsert = job => job.insertSize || (job.insertSize = { width: '', height: '', inserts: '', carriers: '' });
const rowInsert = (job, row) => (row.linkInsert === false && row.insertSize) ? row.insertSize : jobInsert(job);
const panelCap = job => (parseInt(job.panelCount, 10) || 0) * 2;
// the paint() closure, inlined as it appeared in renderBindery
function oldCutText(job, id) {
  const ins = rowInsert(job, (job.binding || []).find(b => b.typeId === id));
  const e2 = effOffset(job, id);
  const w = parseFloat(ins.width), h = parseFloat(ins.height);
  return (isFinite(w) && isFinite(h))
    ? `${(w + 2 * e2.horizontal).toFixed(3).replace(/\.?0+$/, '')} × ${(h + 2 * e2.vertical).toFixed(3).replace(/\.?0+$/, '')}`
    : null;
}

/* ============ FIXTURES ============ */
const REF = {
  departments: [
    { id: 'woodshop', label: 'Wood Shop' }, { id: 'metal', label: 'Metal Shop' },
    { id: 'offset', label: 'Offset' }, { id: 'deboss', label: 'Deboss' }, { id: 'sewing', label: 'Sewing' },
  ],
  decorations: [
    { id: 'diecut',  label: 'Diecut Window', departments: ['metal'] },
    { id: 'deboss',  label: 'Deboss',        departments: ['deboss'] },
    { id: 'foil',    label: 'Foil Stamp',    departments: [] },
  ],
  hardware: [
    { id: 'ring-binder', label: 'Ring Binder', isBinding: true },
    { id: 'screw-posts', label: 'Screw Posts', isBinding: true },
    { id: 'elastic-cords', label: 'Elastic Cords / Loops', isBinding: true },
  ],
  materials: [
    { id: 'RV032', categoryId: 'leather',   vendor: 'Rex', color: 'Black' },
    { id: 'RB29',  categoryId: 'rockboard', name: 'Slate' },
    { id: 'W07',   categoryId: 'wood',      name: 'Walnut' },
    { id: 'MA50',  categoryId: 'bookcloth', vendor: 'Majilite', swatchNumber: '50' },
  ],
  matcats: {
    leather:   { departments: [] },
    rockboard: { departments: ['woodshop'] },
    wood:      { departments: ['woodshop'] },
    bookcloth: { departments: [] },
    '4c-litho':{ departments: ['offset'] },
  },
  escalation: [
    { id: '1', label: 'Standard', leadDays: 15, rules: [] },
    { id: '2', label: 'Extended', leadDays: 25, rules: [
      { type: 'qty', op: '>', value: 100 },
      { type: 'department', id: 'offset' },
      { type: 'department', id: 'sewing' },
      { type: 'department', id: 'metal', qualifier: 'metal tip-in only' },
    ] },
    { id: '3', label: 'Long', leadDays: 40, rules: [
      { type: 'qty', op: '>', value: 250 },
      { type: 'department', id: 'woodshop' },
      { type: 'department', id: 'metal', qualifier: 'full metal work (Tip-In not set)' },
      { type: 'decoration', id: 'deboss' },
      { type: 'binding', id: 'screw-posts' },
      { type: 'condition', text: 'Sewing has no signal in the record', gap: 'needs an explicit field' },
    ] },
    { id: '4', label: 'TBD', leadDays: null, rules: [{ type: 'qty', op: '>', value: 1000 }] },
  ],
  offsets: { 'ring-binder': { vertical: 0.3, horizontal: 0.4 } },
};

const JOBS = [
  { name: 'empty', job: {} },
  { name: 'floor tier', job: { quantity: '50', materials: [{ materialId: 'MA50' }], binding: [], decorations: [] } },
  { name: 'qty 101 → T2', job: { quantity: '101' } },
  { name: 'qty 251 → T3', job: { quantity: '251' } },
  { name: 'qty 1001 → T4 (null leadDays)', job: { quantity: '1001' } },
  { name: 'qty exactly 1000', job: { quantity: '1000' } },
  { name: 'qty non-numeric', job: { quantity: 'lots' } },
  { name: 'woodshop via rockboard', job: { quantity: '10', materials: [{ materialId: 'RB29' }] } },
  { name: 'woodshop via wood', job: { quantity: '10', materials: [{ materialId: 'W07' }] } },
  { name: 'THE QUALIFIER TRAP — diecut, tipIn=yes → metal T2',
    job: { quantity: '10', decorations: [{ typeId: 'diecut', values: { tipIn: 'yes' } }] } },
  { name: 'THE QUALIFIER TRAP — diecut, tipIn unset → full metal T3',
    job: { quantity: '10', decorations: [{ typeId: 'diecut', values: {} }] } },
  { name: 'diecut tipIn=YES uppercase', job: { quantity: '10', decorations: [{ typeId: 'diecut', values: { tipIn: 'YES' } }] } },
  { name: 'diecut tipIn=no', job: { quantity: '10', decorations: [{ typeId: 'diecut', values: { tipIn: 'no' } }] } },
  { name: 'deboss decoration → T3', job: { quantity: '10', decorations: [{ typeId: 'deboss' }] } },
  { name: 'screw-posts binding → T3', job: { quantity: '10', binding: [{ typeId: 'screw-posts' }] } },
  { name: 'unknown material id', job: { quantity: '10', materials: [{ materialId: 'NOPE' }] } },
  { name: 'material slot with no id', job: { quantity: '10', materials: [{ localName: 'one-off' }] } },
  { name: 'unknown decoration id', job: { quantity: '10', decorations: [{ typeId: 'ghost' }] } },
  { name: 'everything at once', job: { quantity: '1200', materials: [{ materialId: 'W07' }, { materialId: 'RB29' }],
      decorations: [{ typeId: 'diecut', values: {} }, { typeId: 'deboss' }], binding: [{ typeId: 'screw-posts' }] } },
];

const GEO_JOBS = [
  { name: 'linked insert, ring-binder (ref override)', typeId: 'ring-binder',
    job: { insertSize: { width: '8.5', height: '11' }, binding: [{ typeId: 'ring-binder' }] } },
  { name: 'screw-posts, defaults', typeId: 'screw-posts',
    job: { insertSize: { width: '8.5', height: '11' }, binding: [{ typeId: 'screw-posts' }] } },
  { name: 'unmapped type → fallback', typeId: 'bands',
    job: { insertSize: { width: '6', height: '9' }, binding: [{ typeId: 'bands' }] } },
  { name: 'per-job override', typeId: 'screw-posts',
    job: { insertSize: { width: '8.5', height: '11' }, binding: [{ typeId: 'screw-posts' }],
           offsetOverrides: { 'screw-posts': { vertical: '1', horizontal: '0.5' } } } },
  { name: 'override blank string falls through', typeId: 'screw-posts',
    job: { insertSize: { width: '8.5', height: '11' }, binding: [{ typeId: 'screw-posts' }],
           offsetOverrides: { 'screw-posts': { vertical: '', horizontal: '0.5' } } } },
  { name: 'override zero is honoured', typeId: 'screw-posts',
    job: { insertSize: { width: '8.5', height: '11' }, binding: [{ typeId: 'screw-posts' }],
           offsetOverrides: { 'screw-posts': { vertical: '0', horizontal: '0' } } } },
  { name: 'unlinked row insert', typeId: 'ring-binder',
    job: { insertSize: { width: '8.5', height: '11' },
           binding: [{ typeId: 'ring-binder', linkInsert: false, insertSize: { width: '5', height: '7' } }] } },
  { name: 'no insert size → null', typeId: 'ring-binder',
    job: { binding: [{ typeId: 'ring-binder' }] } },
  { name: 'fractional insert', typeId: 'ring-binder',
    job: { insertSize: { width: '8.375', height: '10.75' }, binding: [{ typeId: 'ring-binder' }] } },
];

/* ============ COMPARE ============ */
const clone = o => JSON.parse(JSON.stringify(o));
const norm = t => ({ ...t, depts: [...t.depts.entries()].map(([k, v]) => [k, v]).sort() });
let pass = 0, fail = 0;
const check = (name, a, b) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { pass++; }
  else { fail++; console.log(`  ✗ ${name}\n      old: ${A}\n      new: ${B}`); }
};

console.log('\nTIER ENGINE — original vs extracted');
S.ref = REF;
for (const { name, job } of JOBS) {
  check(name, norm(computeTier(clone(job))), norm(newTier(clone(job), REF)));
}

console.log('\nGEOMETRY — original vs extracted');
for (const { name, job, typeId } of GEO_JOBS) {
  const oldTxt = oldCutText(clone(job), typeId);
  const c = newCutSize(clone(job), typeId, REF);
  const newTxt = c ? `${trimNum(c.width)} × ${trimNum(c.height)}` : null;
  check(name + ' [cut]', oldTxt, newTxt);
  check(name + ' [offset]', effOffset(clone(job), typeId), newEffOffset(clone(job), typeId, REF));
}

console.log('\nPANEL CAP + WORKDAYS');
for (const pc of [undefined, '0', '3', '12', 'abc', 7]) check('panelCap ' + pc, panelCap({ panelCount: pc }), newPanelCap({ panelCount: pc }));
// Fri 2026-08-07 + 1 workday = Mon 2026-08-10; +15 = Fri 2026-08-28
for (const [start, days] of [['2026-08-07', 1], ['2026-08-07', 15], ['2026-08-10', 25], ['2026-08-08', 40], ['2026-08-07', 0]]) {
  const d = new Date(start + 'T12:00:00');
  check(`addWorkdays ${start}+${days}`, addWorkdays(d, days).toISOString(), newAddWorkdays(d, days).toISOString());
}

console.log('\nOFFSET_DEFAULTS table identical');
check('defaults', OLD_OFFSET_DEFAULTS, OFFSET_DEFAULTS);

console.log(`\n${fail === 0 ? '✓ ALL MATCH' : '✗ DIVERGENCE'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
