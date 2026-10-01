/* =====================================================================
   MATERIALS SECTION — behavior for the shared Exterior / Interior tables
   ---------------------------------------------------------------------
   Used by mcs/index.html and blc/planner.html. The markup is in
   materials.html, the styles in materials.css; this file only wires
   behavior: adding and removing rows, building each row's fields from the
   catalog, narrowing autocomplete to valid combinations, the interior
   Function multi-select and its detail cards, keyboard navigation,
   validation helpers, and reading / restoring state.

   USAGE (from a <script type="module"> on the page)

     import { mountMaterials } from '../components/materials/materials.js';
     const materials = await mountMaterials(document.getElementById('materials-mount'), {
       showQty: true,                   // BLC only — Qty and Unit columns
       showFunction: false,             // hide Function column + its cards (default true)
       onChange: m => { ... },          // any edit, add, remove or restore
       onCategory: id => { ... },       // a category was picked in a row
     });
     materials.getState();  materials.setState(saved);

   Categories, fields and autocomplete values come from data/catalog.js via
   materialOptions() / comboOptions() in engines/catalog.js.

   STATE SHAPE (what getState returns and setState accepts)
     { ext: [{ cat, fields: { vendor, productLine, ... }, fn, qty?, unit? }],
       int: [{ cat, fields, fnArr: ['Liner', ...], qty?, unit?,
               ccFns? }],                  // functions the Check Presenter card set
       fnCards: [{ fn, data }],            // detail cards under the tables
       ccInt: boolean,                     // a Check Presenter Interior card is present
       cc: { parts: [{ type: panel|angled|flat|ccpocket|ccslot|penloop,
                       count, location, size?, row? }] } | null }
                                           // row = position in int (-1: none)
   Sheets from before the card (ccInt only) open as the standard.
   `cat` is a catalog category id ('bookcloth', '4c-litho'). qty and unit
   exist only when mounted with showQty.
   ===================================================================== */
import { materialOptions, comboOptions, categoryLabel } from '../../engines/catalog.js';

const FN_ORDER = ['Liner', 'Panels', 'Pockets', 'CC Slot', 'Pen Loop'];
let uid = 0;

export async function mountMaterials(host, opts = {}) {
  const { showQty = false, onChange = () => {}, onCategory = () => {} } = opts;
  let showFunction = opts.showFunction !== false;

  /* ---- markup -------------------------------------------------------- */
  const res = await fetch(new URL('./materials.html', import.meta.url));
  if (!res.ok) throw new Error('materials.html: HTTP ' + res.status);
  host.innerHTML = await res.text();
  const root = host.querySelector('.materials');
  root.classList.toggle('materials--qty', showQty);
  root.classList.toggle('materials--no-fn', !showFunction);

  let options;
  try {
    const catalog = opts.catalog || (await import('../../data/catalog.js')).CATALOG;
    options = materialOptions(catalog);
  } catch (err) {
    root.querySelector('[data-role="catalog-warning"]').hidden = false;
    throw err;
  }

  /* ---- small helpers -------------------------------------------------- */
  const tpl = name => host.querySelector('template[data-tpl="' + name + '"]')
    .content.firstElementChild.cloneNode(true);
  const tbody = sec => root.querySelector('[data-rows="' + sec + '"]');
  const category = id => options.categories.find(c => c.id === id) || null;
  const role = (el, r) => el.querySelector('[data-role="' + r + '"]');
  const rowsOf = sec => Array.from(tbody(sec).children);
  const secOf = tr => tr.parentNode.dataset.rows;
  const fnCards = () => role(root, 'fn-cards');

  let suspended = false;
  const counts = () => ({ ext: tbody('ext').children.length, int: tbody('int').children.length });
  function changed() {
    if (suspended) return;
    host.dispatchEvent(new CustomEvent('materials:change', { detail: counts(), bubbles: true }));
    onChange(api);
  }

  /* ---- rows ----------------------------------------------------------- */
  function addRow(sec, data) {
    const tr = tpl('row-' + sec);
    const sel = role(tr, 'category');
    options.categories.forEach(c => {
      if (sec === 'int' && !c.interior) return;
      sel.append(new Option(c.label, c.id));
    });
    if (sec === 'int') tr.dataset.rowId = 'ir' + (++uid);
    tr._lists = [];
    showFields(tr, '');
    tbody(sec).append(tr);
    renumber(sec);
    if (data) fillRow(tr, data);
    changed();
    return tr;
  }

  function renumber(sec) {
    rowsOf(sec).forEach((tr, i) => { tr.querySelector('.materials__col-num').textContent = i + 1; });
  }

  function dropLists(tr) {
    (tr._lists || []).forEach(dl => dl.remove());
    tr._lists = [];
  }

  /* Rebuild the Material cell for a category: one input per catalog field,
     each with its own <datalist> that refreshLists() keeps narrowed. */
  function showFields(tr, catId) {
    dropLists(tr);
    const cell = role(tr, 'fields');
    cell.replaceChildren();
    const cat = category(catId);
    if (!cat) { cell.append(tpl('fields-empty')); updatePrint(tr); return; }
    cat.fields.forEach(f => {
      let inp;
      if (f.id === 'decoration') {
        const wrap = tpl('decoration');
        inp = wrap.querySelector('input');
        cell.append(wrap);
      } else {
        inp = tpl('field');
        inp.placeholder = f.label;
        inp.dataset.fieldId = f.id;
        cell.append(inp);
      }
      const dl = document.createElement('datalist');
      dl.id = 'materials-dl-' + (++uid);
      root.append(dl);
      tr._lists.push(dl);
      inp._dl = dl;
      inp.setAttribute('list', dl.id);
    });
    refreshLists(tr, null);
    syncDecoration(tr);
    updatePrint(tr);
  }

  const fieldInputs = tr => Array.from(tr.querySelectorAll('[data-role="field"]'));

  function fieldValues(tr) {
    const v = {};
    fieldInputs(tr).forEach(i => { if (!i.hidden) v[i.dataset.fieldId] = i.value; });
    return v;
  }

  /* Narrow every field's suggestions to combinations that exist in the
     catalog, given what is typed in the other fields. `except` is the field
     being typed in — its own suggestions don't depend on its own text. */
  function refreshLists(tr, except) {
    const cat = category(role(tr, 'category').value);
    if (!cat) return;
    const vals = fieldValues(tr);
    fieldInputs(tr).forEach(inp => {
      const id = inp.dataset.fieldId;
      if (id === except || !inp._dl) return;
      const opts = comboOptions(cat.rows, vals, id).map(v => {
        const o = document.createElement('option'); o.value = v; return o;
      });
      inp._dl.replaceChildren(...opts);
    });
  }

  /* When the values typed so far match catalog entries exactly, fill any
     empty field that has only one possible value — e.g. a swatch number
     fills in its vendor, product line, family and color. Runs on change
     (leaving a field or picking a suggestion), not on every keystroke.

     A field the user emptied on purpose is left empty (`_keepEmpty`, set in
     the input handler) — otherwise deleting a swatch # refills it straight
     away from the fields still filled. The hold lifts as soon as a value is
     typed into another field of the row, because that's a new combination
     and autofill should get a fresh look at it. */
  function fillUnique(tr) {
    const cat = category(role(tr, 'category').value);
    if (!cat) return;
    const typed = fieldInputs(tr).filter(i => !i.hidden && i.value.trim());
    if (!typed.length) return;
    const matches = cat.rows.filter(r => typed.every(i =>
      String(r[i.dataset.fieldId] || '').trim().toLowerCase() === i.value.trim().toLowerCase()));
    if (!matches.length) return;
    fieldInputs(tr).forEach(inp => {
      const id = inp.dataset.fieldId;
      if (inp.hidden || inp.value.trim() || inp._keepEmpty || id === 'decoration') return;
      const vals = new Set(matches.map(r => r[id]).filter(Boolean));
      if (vals.size === 1) inp.value = [...vals][0];
    });
    refreshLists(tr, null);
    syncDecoration(tr);
    updatePrint(tr);
  }

  /* Changing a field clears the fields after it that no longer go with it:
     Eclisse → Acero empties color 4651 and swatch 965, because no Acero
     has them; then fillUnique() gets a fresh look at the new combination.
     "After" is the field order on screen (vendor, product line, family,
     color, swatch #…). A downstream value is kept when it still fits
     everything before it, and always kept when it isn't a catalog value
     at all — a non-standard entry was typed on purpose. Decoration is
     left alone; syncDecoration() handles it. */
  function clearDownstream(tr, changedInp) {
    const cat = category(role(tr, 'category').value);
    if (!cat) return;
    const inputs = fieldInputs(tr).filter(i => !i.hidden);
    const at = inputs.indexOf(changedInp);
    if (at < 0) return;
    const lc = v => String(v || '').trim().toLowerCase();
    for (let k = at + 1; k < inputs.length; k++) {
      const inp = inputs[k], id = inp.dataset.fieldId, v = lc(inp.value);
      if (!v || id === 'decoration') continue;
      const field = cat.fields.find(f => f.id === id);
      if (!field || !field.options.some(o => lc(o) === v)) continue;   // non-standard: keep
      const before = inputs.slice(0, k).filter(i => i.dataset.fieldId !== 'decoration' && lc(i.value));
      const fits = cat.rows.some(r => lc(r[id]) === v &&
        before.every(i => lc(r[i.dataset.fieldId]) === lc(i.value)));
      if (!fits) inp.value = '';
    }
  }

  /* Decoration can only be added when Vendor is Majilite. */
  function syncDecoration(tr) {
    const btn = tr.querySelector('[data-action="decor-open"]');
    if (!btn) return;
    const vendor = tr.querySelector('[data-field-id="vendor"]');
    const ok = !!vendor && vendor.value.trim().toLowerCase() === 'majilite';
    btn.disabled = !ok;
    btn.title = ok ? 'Add Decoration' : 'Decoration only available for Majilite';
    if (!ok) {
      const dismiss = tr.querySelector('[data-action="decor-close"]');
      if (dismiss && !dismiss.hidden) closeDecoration(dismiss);
    }
  }
  function openDecoration(btn) {
    const wrap = btn.closest('.materials__decor');
    btn.hidden = true;
    const inp = wrap.querySelector('.materials__decor-input');
    inp.hidden = false;
    wrap.querySelector('[data-action="decor-close"]').hidden = false;
    inp.focus();
  }
  function closeDecoration(btn) {
    const wrap = btn.closest('.materials__decor');
    const inp = wrap.querySelector('.materials__decor-input');
    inp.value = ''; inp.hidden = true; btn.hidden = true;
    wrap.querySelector('[data-action="decor-open"]').hidden = false;
  }

  /* Print text: what a row says when the inputs are swapped for text.
     The field values in order, joined with spaces (as the MCS printed them),
     skipping a value that repeats the one before it — e.g. vendor and
     product line are both "Majilite" → "Majilite Finesse Black 992". */
  function updatePrint(tr) {
    const parts = [];
    fieldInputs(tr).forEach(i => {
      const v = i.hidden ? '' : i.value.trim();
      if (v && (!parts.length || parts[parts.length - 1].toLowerCase() !== v.toLowerCase())) parts.push(v);
    });
    role(tr, 'print').textContent = parts.join(' ');
  }

  function removeRow(tr) {
    const sec = secOf(tr);
    if (sec === 'ext' && tbody('ext').children.length <= 1) {
      fillRow(tr, { cat: '', fields: {}, fn: '', qty: '', unit: '' });   /* last exterior row: clear, don't remove */
    } else {
      dropLists(tr);
      tr.remove();
      renumber(sec);
      if (sec === 'int') { syncFunctionCards(); if (container_has_cc()) { ccOptions(); ccApply(); } }
    }
    changed();
  }

  /* ---- read / write one row ------------------------------------------- */
  function fillRow(tr, data) {
    const sec = secOf(tr);
    const sel = role(tr, 'category');
    if (data.cat && !Array.from(sel.options).some(o => o.value === data.cat)) {
      sel.append(new Option(categoryLabel(data.cat), data.cat));          /* saved category no longer offered — keep it */
    }
    sel.value = data.cat || '';
    showFields(tr, sel.value);

    const fields = Object.assign({}, data.fields || {});
    /* Saved when this category still had an ID field (dropped 2026-10-01
       for categories with nothing to pick): keep the ID in front of the
       name rather than lose it. */
    if (fields.itemId && !tr.querySelector('[data-field-id="itemId"]') && tr.querySelector('[data-field-id="name"]')) {
      fields.name = [fields.itemId, fields.name].filter(Boolean).join(' ');
      delete fields.itemId;
    }
    Object.keys(fields).forEach(id => {
      const inp = tr.querySelector('[data-field-id="' + id + '"]');
      if (!inp || !fields[id]) return;
      inp.value = fields[id];
      if (inp.classList.contains('materials__decor-input')) openDecoration(tr.querySelector('[data-action="decor-open"]'));
    });
    syncDecoration(tr);
    refreshLists(tr, null);

    if (sec === 'ext') {
      role(tr, 'function').value = data.fn || '';
    } else {
      const msd = role(tr, 'functions');
      const chosen = data.fnArr || [];
      msd.querySelectorAll('input').forEach(i => { i.checked = chosen.includes(i.value); });
      msdLabel(msd);
    }
    role(tr, 'qty').value = data.qty || '';
    role(tr, 'unit').value = data.unit || '';
    updatePrint(tr);
  }

  function readRow(tr) {
    const sec = secOf(tr);
    const fields = {};
    fieldInputs(tr).forEach(i => { if (!i.hidden) fields[i.dataset.fieldId] = i.value.trim(); });
    const row = { cat: role(tr, 'category').value, fields };
    if (sec === 'ext') row.fn = role(tr, 'function').value.trim();
    else row.fnArr = Array.from(role(tr, 'functions').querySelectorAll('input:checked')).map(i => i.value);
    if (showQty) { row.qty = role(tr, 'qty').value; row.unit = role(tr, 'unit').value; }
    if (sec === 'int' && (tr._ccAdded || []).length) row.ccFns = tr._ccAdded.slice();   /* set by the Check Presenter card */
    return row;
  }

  /* ---- multi-select dropdown (interior Function, Pockets type) -------- */
  function closeAllMsd() {
    root.querySelectorAll('.materials__msd-panel').forEach(p => { p.hidden = true; });
  }
  function msdToggle(btn) {
    const panel = btn.nextElementSibling;
    const wasOpen = !panel.hidden;
    closeAllMsd();
    panel.hidden = wasOpen;
  }
  function msdLabel(msd) {
    const checked = Array.from(msd.querySelectorAll('input:checked')).map(i => i.value);
    msd.querySelector('.materials__msd-val').textContent = checked.length ? checked.join(', ') : msd.dataset.placeholder;
  }
  function msdChange(input) {
    const msd = input.closest('.materials__msd');
    msdLabel(msd);
    if (input.type === 'radio') msd.querySelector('.materials__msd-panel').hidden = true;
    if (msd.dataset.role === 'functions') syncFunctionCards();
    changed();
  }

  /* ---- function detail cards ------------------------------------------ */
  function syncFunctionCards() {
    const container = fnCards();
    const desired = [];
    FN_ORDER.forEach(fn => rowsOf('int').forEach(tr => {
      const checked = Array.from(role(tr, 'functions').querySelectorAll('input:checked')).map(i => i.value);
      /* A Function the Check Presenter card set is detailed on the card. */
      if (checked.includes(fn) && !isCcLocked(tr, fn)) desired.push({ rowId: tr.dataset.rowId, fn });
    }));
    const find = d => container.querySelector('[data-fn="' + d.fn + '"][data-row-id="' + d.rowId + '"]');
    const keys = new Set(desired.map(d => d.fn + '::' + d.rowId));

    container.querySelectorAll('[data-fn][data-row-id]').forEach(card => {
      if (!keys.has(card.dataset.fn + '::' + card.dataset.rowId)) card.remove();
    });
    desired.forEach(d => {
      if (find(d)) return;
      const card = tpl('fn-' + d.fn);
      card.dataset.rowId = d.rowId;
      const group = 'materials-radio-' + (++uid);
      card.querySelectorAll('input[type="radio"]').forEach(r => { r.name = group; });
      container.append(card);
    });
    desired.forEach(d => { const c = find(d); if (c) container.append(c); });   /* display order */
    FN_ORDER.forEach(fn => {
      const cards = container.querySelectorAll('[data-fn="' + fn + '"][data-row-id]');
      cards.forEach((card, i) => {
        card.querySelector('.materials__fn-title').textContent = cards.length > 1 ? fn + ' ' + (i + 1) : fn;
      });
    });
  }

  /* ---- CHECK PRESENTER INTERIOR ---------------------------------------
     One card for the whole interior. It comes in as the standard and is
     changed with the add / remove buttons, so unused parts take no room.
     Each part has a count, location and size, and — except CC slots and
     pen loops — the interior material it is made of. Materials are defined
     in the Interior table; the card only picks one. Picking checks that
     part's Function on the row (Panel → Panels, any pocket → Pockets) and
     locks it there: the table stays the list production reads, and the
     row's own function card isn't asked for (the card has the details).
     CC slots and pen loops print under the interior table.
     Card → table only: removing a part un-checks what the card checked,
     never a Function someone ticked by hand. */
  const CC_TYPES = {
    panel:    { label: 'Panel',         fn: 'Panels',  size: true,  material: true },
    angled:   { label: 'Angled Pocket', fn: 'Pockets', size: true,  material: true },
    flat:     { label: 'Flat Pocket',   fn: 'Pockets', size: true,  material: true },
    ccpocket: { label: 'CC Pocket',     fn: 'Pockets', size: true,  material: true },
    ccslot:   { label: 'CC Slot',       fn: null,      size: false, material: false },
    penloop:  { label: 'Pen Loop',      fn: null,      size: true,  material: false },
  };
  const CC_STANDARD_SIZE = '4" x 2.5"';        // angled pocket
  const CC_STANDARD_PANEL = '4" x 8.5"';
  const ccCard = () => fnCards().querySelector('[data-cc-int]');
  const container_has_cc = () => !!ccCard();
  const rowById = id => rowsOf('int').find(tr => tr.dataset.rowId === id) || null;
  const rowLabel = tr => role(tr, 'print').textContent.trim();
  const ccParts = () => ccCard() ? Array.from(ccCard().querySelectorAll('.materials__cc-part')) : [];

  /* [{ type, count, location, size, row }] — row is the row id. */
  function ccRead() {
    return ccParts().map(el => {
      const p = { type: el.dataset.part };
      el.querySelectorAll('[data-cc-field]').forEach(i => { p[i.dataset.ccField] = i.value.trim(); });
      if (!CC_TYPES[p.type].material) delete p.row;
      return p;
    });
  }

  function ccAddPart(data) {
    const t = CC_TYPES[data.type];
    if (!t) return null;
    const el = tpl('cc-part');
    el.dataset.part = data.type;
    role(el, 'cc-name').textContent = t.label;
    if (!t.size) el.querySelector('[data-cc-field="size"]').classList.add('materials__cc-na');
    if (!t.material) el.querySelector('[data-cc-field="row"]').classList.add('materials__cc-na');
    role(ccCard(), 'cc-parts').append(el);
    ccOptions(el);
    ['count', 'location', 'size'].forEach(f => { if (data[f]) el.querySelector('[data-cc-field="' + f + '"]').value = data[f]; });
    ccLocation(el, !!data.location);
    const sel = el.querySelector('[data-cc-field="row"]');
    if (data.row && rowById(data.row)) sel.value = data.row;
    ccHead();
    return el;
  }
  /* Location opens from its button and closes (and clears) with ×. */
  function ccLocation(el, open, focus) {
    const field = el.querySelector('.materials__cc-loc-field');
    field.hidden = !open;
    el.querySelector('.materials__cc-loc-add').hidden = open;
    const inp = el.querySelector('[data-cc-field="location"]');
    if (!open) inp.value = '';
    else if (focus) inp.focus();
  }
  const ccHead = () => { const card = ccCard(); if (card) role(card, 'cc-head').hidden = !ccParts().length; };

  /* The Material lists: the interior rows that have a material. */
  function ccOptions(only) {
    const rows = rowsOf('int').filter(tr => rowLabel(tr));
    (only ? [only] : ccParts()).forEach(el => {
      const sel = el.querySelector('[data-cc-field="row"]');
      const keep = sel.value;
      sel.replaceChildren(new Option(rows.length ? 'Choose an interior material' : 'Add it to the Interior table first', ''),
        ...rows.map(tr => new Option((rowsOf('int').indexOf(tr) + 1) + ' · ' + rowLabel(tr), tr.dataset.rowId)));
      sel.value = rows.some(tr => tr.dataset.rowId === keep) ? keep : '';
    });
  }

  /* Put the card's parts onto the table: check + lock each part's
     Function on its row; undo whatever the card set before. */
  function ccApply() {
    rowsOf('int').forEach(tr => {
      const added = tr._ccAdded || [];
      role(tr, 'functions').querySelectorAll('input[data-cc-locked]').forEach(cb => {
        if (added.includes(cb.value)) cb.checked = false;
        cb.disabled = false;
        delete cb.dataset.ccLocked;
        cb.closest('.materials__msd-opt').classList.remove('is-cc-locked');
      });
      tr._ccAdded = [];
    });
    ccRead().forEach(p => {
      const fn = CC_TYPES[p.type].fn;
      const tr = fn && p.row && rowById(p.row);
      if (!tr) return;
      const cb = role(tr, 'functions').querySelector('input[value="' + fn + '"]');
      if (!cb) return;
      if (!cb.checked && !tr._ccAdded.includes(fn)) { cb.checked = true; tr._ccAdded.push(fn); }
      cb.dataset.ccLocked = '1';
      cb.disabled = true;
      cb.closest('.materials__msd-opt').classList.add('is-cc-locked');
    });
    rowsOf('int').forEach(tr => msdLabel(role(tr, 'functions')));
    syncFunctionCards();
    ccBadge();
  }
  const isCcLocked = (tr, fn) => !!role(tr, 'functions').querySelector('input[value="' + fn + '"][data-cc-locked]');

  /* Standard: one 4" x 8.5" Black Lexide panel, one Regular Black
     4" x 2.5" angled pocket and one CC slot — nothing else, no locations. */
  function ccBadge() {
    const card = ccCard(); if (!card) return;
    const parts = ccRead();
    const lc = v => String(v || '').replace(/\s+/g, '').toLowerCase();
    const on = (p, name) => { const tr = p.row && rowById(p.row); return !!tr && rowLabel(tr).toLowerCase() === name; };
    const one = p => !p.count || p.count === '1';
    const std = parts.length === 3 && !parts.some(p => p.location) &&
      parts.some(p => p.type === 'panel' && one(p) && on(p, 'black lexide') && lc(p.size) === lc(CC_STANDARD_PANEL)) &&
      parts.some(p => p.type === 'angled' && one(p) && on(p, 'regular black') && lc(p.size) === lc(CC_STANDARD_SIZE)) &&
      parts.some(p => p.type === 'ccslot' && one(p));
    const b = role(card, 'cc-badge');
    b.textContent = !parts.length ? 'Not set' : std ? 'Standard' : 'Non-standard';
    b.classList.toggle('is-custom', !!parts.length && !std);
  }

  /* The standard parts. Black Lexide and Regular Black are added to the
     Interior table if they aren't there yet. */
  function ccStandard() {
    const find = name => rowsOf('int').find(tr => rowLabel(tr).toLowerCase() === name.toLowerCase());
    const bl = find('Black Lexide') || addRow('int', { cat: 'other', fields: { name: 'Black Lexide' }, fnArr: [] });
    const rb = find('Regular Black') || addRow('int', { cat: 'other', fields: { name: 'Regular Black' }, fnArr: [] });
    role(ccCard(), 'cc-parts').replaceChildren();
    ccAddPart({ type: 'panel', count: '1', size: CC_STANDARD_PANEL, row: bl.dataset.rowId });
    ccAddPart({ type: 'angled', count: '1', size: CC_STANDARD_SIZE, row: rb.dataset.rowId });
    ccAddPart({ type: 'ccslot', count: '1' });
    ccApply();
  }

  /* No saved parts → the standard. */
  function addCcInterior(saved) {
    if (container_has_cc()) return;
    fnCards().prepend(tpl('cc-interior'));
    role(root, 'cc-add').disabled = true;
    if (saved) { saved.forEach(ccAddPart); ccApply(); }
    else ccStandard();
    changed();
  }
  function removeCcInterior() {
    const card = ccCard();
    if (card) card.remove();
    ccApply();          /* no card: un-checks and unlocks everything it set */
    role(root, 'cc-add').disabled = false;
    changed();
  }

  /* ---- events (delegated) --------------------------------------------- */
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'add-row':           addRow(btn.dataset.sec); break;
      case 'remove-row':        removeRow(btn.closest('tr')); break;
      case 'msd-toggle':        msdToggle(btn); break;
      case 'decor-open':        openDecoration(btn); changed(); break;
      case 'decor-close':       closeDecoration(btn); changed(); break;
      case 'add-cc-interior':   addCcInterior(); break;
      case 'remove-cc-interior': removeCcInterior(); break;
      case 'cc-standard':       ccStandard(); changed(); break;
      case 'cc-add-part': {
        const el = ccAddPart({ type: btn.dataset.part, count: '1' });
        ccApply(); changed();
        if (el) el.querySelector('[data-cc-field="count"]').focus();
        break;
      }
      case 'cc-loc-open':       ccLocation(btn.closest('.materials__cc-part'), true, true); break;
      case 'cc-loc-close':      ccLocation(btn.closest('.materials__cc-part'), false); ccBadge(); changed(); break;
      case 'cc-remove-part':    btn.closest('.materials__cc-part').remove(); ccHead(); ccApply(); changed(); break;
    }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.materials__msd')) closeAllMsd(); });

  root.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.ccField) { ccBadge(); changed(); return; }
    const tr = t.closest('tr.materials__row');
    if (tr && t.dataset.role === 'field') {
      /* Emptied by hand → stays empty. A value typed here → every field
         in the row is open to autofill again (see fillUnique). */
      if (!t.value.trim()) t._keepEmpty = true;
      else fieldInputs(tr).forEach(i => { i._keepEmpty = false; });
      refreshLists(tr, t.dataset.fieldId);
      if (t.dataset.fieldId === 'vendor') syncDecoration(tr);
      updatePrint(tr);
    }
    changed();
  });

  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.ccField) { if (t.dataset.ccField === 'row') ccApply(); else ccBadge(); changed(); return; }
    if (t.dataset.role === 'category') {
      const tr = t.closest('tr');
      showFields(tr, t.value);
      if (t.value) onCategory(t.value);
    } else if (t.closest('.materials__msd')) {
      msdChange(t);
      return;
    } else if (t.dataset.role === 'field') {
      clearDownstream(t.closest('tr'), t);
      fillUnique(t.closest('tr'));
    }
    changed();
  });

  /* Keyboard: the multi-select, then arrow / enter navigation between cells. */
  /* Material lists follow the Interior table: rebuilt when one is opened. */
  root.addEventListener('focusin', e => { if (e.target.dataset.ccField === 'row') ccOptions(e.target.closest('.materials__cc-part')); });
  root.addEventListener('keydown', e => {
    const t = e.target;
    if (t.matches('.materials__msd-btn')) msdBtnKeydown(e, t);
    else if (t.matches('.materials__msd-opt')) { msdOptKeydown(e, t); return; }
    cellNavKeydown(e, t);
  });

  function msdBtnKeydown(e, btn) {
    const panel = btn.nextElementSibling;
    const isOpen = !panel.hidden;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) msdToggle(btn);
      const first = panel.querySelector('.materials__msd-opt');
      if (first) first.focus();
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      panel.hidden = true;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!isOpen) msdToggle(btn);
      const letter = e.key.toLowerCase();
      const match = Array.from(panel.querySelectorAll('.materials__msd-opt'))
        .find(o => o.textContent.trim().toLowerCase().startsWith(letter));
      if (match) { e.preventDefault(); match.focus(); }
    }
  }
  function msdOptKeydown(e, label) {
    const panel = label.closest('.materials__msd-panel');
    const msd = label.closest('.materials__msd');
    const opts = Array.from(panel.querySelectorAll('.materials__msd-opt'));
    const idx = opts.indexOf(label);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < opts.length - 1) opts[idx + 1].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) opts[idx - 1].focus();
      else { panel.hidden = true; msd.querySelector('.materials__msd-btn').focus(); }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const inp = label.querySelector('input');
      if (inp.type === 'radio') { inp.checked = true; msdChange(inp); msd.querySelector('.materials__msd-btn').focus(); }
      else { inp.checked = !inp.checked; msdChange(inp); }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      panel.hidden = true; msd.querySelector('.materials__msd-btn').focus();
    } else if (e.key === 'Tab') {
      panel.hidden = true;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const letter = e.key.toLowerCase();
      for (let i = 1; i <= opts.length; i++) {
        const j = (idx + i) % opts.length;
        if (opts[j].textContent.trim().toLowerCase().startsWith(letter)) { e.preventDefault(); opts[j].focus(); break; }
      }
    }
  }
  function cellNavKeydown(e, t) {
    const inInput = t.matches('.materials__table input[type="text"]');
    const inMsd = t.matches('.materials__table .materials__msd-btn');
    if (!inInput && !inMsd) return;
    const td = t.closest('td');
    const tr = td.closest('tr');
    const colIdx = Array.from(tr.cells).indexOf(td);
    const rows = Array.from(tr.closest('tbody').rows);
    const rowIdx = rows.indexOf(tr);
    const focusables = Array.from(tr.querySelectorAll('input[type="text"]:not([hidden]), .materials__msd-btn'));
    const fi = focusables.indexOf(t);
    const panelClosed = inMsd && t.nextElementSibling.hidden;
    const focusCell = (r, col) => {
      const el = r.cells[col].querySelector('input[type="text"], .materials__msd-btn');
      if (el) el.focus();
    };
    if (e.key === 'ArrowDown' && !e.shiftKey) {
      if ((inInput || panelClosed) && rowIdx < rows.length - 1) { e.preventDefault(); focusCell(rows[rowIdx + 1], colIdx); }
    } else if (e.key === 'ArrowUp' && !e.shiftKey) {
      if ((inInput || panelClosed) && rowIdx > 0) { e.preventDefault(); focusCell(rows[rowIdx - 1], colIdx); }
    } else if (e.key === 'ArrowLeft') {
      const atStart = inInput && t.selectionStart === 0 && t.selectionEnd === 0;
      if ((atStart || panelClosed) && fi > 0) { e.preventDefault(); focusables[fi - 1].focus(); }
    } else if (e.key === 'ArrowRight') {
      const atEnd = inInput && t.selectionStart === t.value.length;
      if ((atEnd || panelClosed) && fi < focusables.length - 1) { e.preventDefault(); focusables[fi + 1].focus(); }
    } else if (e.key === 'Enter' && inInput) {
      if (fi < focusables.length - 1) { e.preventDefault(); focusables[fi + 1].focus(); }
      else if (rowIdx < rows.length - 1) {
        e.preventDefault();
        const el = rows[rowIdx + 1].querySelector('input[type="text"]:not([hidden]), .materials__msd-btn');
        if (el) el.focus();
      }
    }
  }

  /* ---- validation helpers (MCS's save checks use these) --------------- */
  /* One entry each for Category, "any material field filled" and Function.
     A row is incomplete when it has something but not all three. */
  function rowFields(tr) {
    const fn = !showFunction ? 'hidden'
      : secOf(tr) === 'ext'
        ? role(tr, 'function').value.trim()
        : (role(tr, 'functions').querySelector('input:checked') ? 'selected' : '');
    const anyField = fieldInputs(tr).some(i => !i.hidden && i.value.trim()) ? 'filled' : '';
    return [role(tr, 'category').value, anyField, fn];
  }
  const isEmpty = tr => rowFields(tr).every(v => v === '' || v === 'hidden');
  const isIncomplete = tr => {
    const vals = rowFields(tr);
    const filled = vals.filter(v => v !== '').length;
    return filled > 0 && filled < vals.length;
  };

  /* ---- public API ------------------------------------------------------ */
  const api = {
    categories: options.categories,
    counts,

    /* Everything the section holds, in the shape documented at the top. */
    getState() {
      const cards = Array.from(fnCards().querySelectorAll('[data-fn][data-row-id]')).map(card => {
        const data = {};
        card.querySelectorAll('input[data-fn-field]').forEach(i => { data[i.dataset.fnField] = i.value; });
        card.querySelectorAll('.materials__msd[data-fn-field]').forEach(m => {
          data[m.dataset.fnField] = Array.from(m.querySelectorAll('input:checked')).map(i => i.value);
        });
        return { fn: card.dataset.fn, data };
      });
      /* Check Presenter parts point at rows by position in the Interior table. */
      let cc = null;
      if (container_has_cc()) {
        const ids = rowsOf('int').map(tr => tr.dataset.rowId);
        cc = { parts: ccRead().map(p => 'row' in p ? Object.assign({}, p, { row: p.row ? ids.indexOf(p.row) : -1 }) : p) };
      }
      return { ext: rowsOf('ext').map(readRow), int: rowsOf('int').map(readRow), fnCards: cards, ccInt: container_has_cc(), cc };
    },

    /* Replace the section's contents. Missing pieces are simply empty. */
    setState(s) {
      s = s || {};
      suspended = true;
      try {
        rowsOf('ext').concat(rowsOf('int')).forEach(dropLists);
        tbody('ext').replaceChildren();
        tbody('int').replaceChildren();
        fnCards().replaceChildren();
        role(root, 'cc-add').disabled = false;

        (s.ext && s.ext.length ? s.ext : [null]).forEach(r => addRow('ext', r));
        /* Functions the Check Presenter card set come back from the card. */
        (s.int || []).forEach(r => addRow('int', r && r.ccFns
          ? Object.assign({}, r, { fnArr: (r.fnArr || []).filter(f => !r.ccFns.includes(f)) }) : r));
        syncFunctionCards();

        const cards = Array.from(fnCards().querySelectorAll('[data-fn][data-row-id]'));
        (s.fnCards || []).forEach((entry, i) => {
          const card = cards[i];
          if (!card || card.dataset.fn !== entry.fn) return;
          Object.keys(entry.data || {}).forEach(field => {
            const inp = card.querySelector('input[data-fn-field="' + field + '"]');
            if (inp) { inp.value = entry.data[field]; return; }
            const msd = card.querySelector('.materials__msd[data-fn-field="' + field + '"]');
            if (msd) {
              [].concat(entry.data[field] || []).forEach(v => {
                const i2 = v && msd.querySelector('input[value="' + v + '"]');
                if (i2) i2.checked = true;
              });
              msdLabel(msd);
            }
          });
        });
        if (s.cc && Array.isArray(s.cc.parts)) {
          const ids = rowsOf('int').map(tr => tr.dataset.rowId);
          addCcInterior(s.cc.parts.map(p => Object.assign({}, p, { row: p.row >= 0 ? ids[p.row] || '' : '' })));
        } else if (s.ccInt) {
          /* Saved with the old Standard CC Interior card: the standard. */
          addCcInterior();
        }
      } finally { suspended = false; }
      changed();
    },

    /* ---- for each page's own save checks ---- */
    validate() {
      const all = rowsOf('ext').concat(rowsOf('int'));
      return {
        hasExterior: rowsOf('ext').some(tr => role(tr, 'category').value !== ''),
        empty: all.filter(isEmpty).length,
        incomplete: all.filter(isIncomplete).length,
      };
    },
    removeEmptyRows() {
      rowsOf('ext').concat(rowsOf('int')).filter(isEmpty).forEach(tr => { dropLists(tr); tr.remove(); });
      renumber('ext'); renumber('int');
      syncFunctionCards();
      changed();
    },

    /* Printed text for each row that has one — the Tip-In / Underlay and
       Corners / Tabs autocomplete lists are built from this.
       sec: 'ext' | 'int' | undefined (both). fn: only interior rows with that
       Function checked (e.g. 'Corners'). */
    summaries(sec, fn) {
      const seen = new Set();
      let rows = sec ? rowsOf(sec) : rowsOf('ext').concat(rowsOf('int'));
      if (fn) rows = rows.filter(tr => secOf(tr) === 'int' &&
        !!role(tr, 'functions').querySelector('input[value="' + fn + '"]:checked'));
      rows.forEach(tr => {
        const t = role(tr, 'print').textContent.trim();
        if (t) seen.add(t);
      });
      return [...seen];
    },

    /* MCS print: write each row's functions into its Function cell, one
       list item each (interior ones with their card details: "Panels —
       wrapped interior boards · 8.5x11"), and mark the section so the cards
       are left off the page.
       Call right before printing. */
    preparePrint() {
      root.classList.add('materials--print-fold');
      const cardValues = card => Array.from(card.querySelectorAll('.materials__fn-input, .materials__msd')).map(el => {
        if (el.classList.contains('materials__msd')) {
          const v = el.querySelector('.materials__msd-val').textContent.trim();
          return v === (el.dataset.placeholder || '') ? '' : v;
        }
        return el.value.trim();
      }).filter(Boolean);
      const fill = (tr, items) => role(tr, 'fn-print').replaceChildren(...items.map(text => {
        const li = tpl('fn-print-item'); li.textContent = text; return li;
      }));
      const cc = ccRead();
      const ccItem = p => {
        const d = [p.size, p.location].filter(Boolean);
        return CC_TYPES[p.type].label + (p.count && p.count !== '1' ? ' ×' + p.count : '') + (d.length ? ' — ' + d.join(' · ') : '');
      };
      /* Interior rows: the functions set by hand. What the Check Presenter
         card set prints in its own section (ccPrintData), so a row used
         only by the card is left out of this table on paper. */
      rowsOf('int').forEach(tr => {
        const checked = Array.from(role(tr, 'functions').querySelectorAll('input:checked')).map(i => i.value);
        const own = checked.filter(fn => !isCcLocked(tr, fn));
        tr.classList.toggle('is-print-moved', checked.length > 0 && own.length === 0);
        fill(tr, own.map(fn => {
          const card = fnCards().querySelector('[data-fn="' + fn + '"][data-row-id="' + tr.dataset.rowId + '"]');
          const vals = card ? cardValues(card) : [];
          return fn + (vals.length ? ' — ' + vals.join(' · ') : '');
        }));
      });
      /* Exterior Function is free text: "Back Cover, sailcloth" is two. */
      rowsOf('ext').forEach(tr => {
        fill(tr, role(tr, 'function').value.split(',').map(x => x.trim()).filter(Boolean));
      });
    },

    /* The Check Presenter Interior as its own printed section (MCS):
       { status: 'Standard' | 'Non-standard', rows: [{ cat, material, items }] }
       — first the interior materials the card uses, each with its parts
       ("Angled Pocket — 4" x 2.5""), then the parts with no material
       (CC Slot, Pen Loop) with their size / location. null when there is
       no card. Call after preparePrint(). */
    ccPrintData() {
      if (!container_has_cc()) return null;
      ccBadge();
      const cc = ccRead();
      const detail = p => [p.size, p.location].filter(Boolean).join(' · ');
      const named = p => CC_TYPES[p.type].label + (p.count && p.count !== '1' ? ' ×' + p.count : '');
      const rows = [];
      rowsOf('int').forEach(tr => {
        const parts = cc.filter(p => CC_TYPES[p.type].fn && p.row === tr.dataset.rowId);
        if (!parts.length) return;
        const sel = role(tr, 'category');
        rows.push({
          cat: sel.value ? sel.selectedOptions[0].textContent.trim() : '',
          material: rowLabel(tr),
          items: parts.map(p => named(p) + (detail(p) ? ' — ' + detail(p) : '')),
        });
      });
      cc.filter(p => !CC_TYPES[p.type].fn || !rowById(p.row || '')).forEach(p => {
        rows.push({
          cat: '',
          material: named(p) + (CC_TYPES[p.type].material ? ' (material not set)' : ''),
          items: detail(p) ? [detail(p)] : [],
        });
      });
      return { status: role(ccCard(), 'cc-badge').textContent.trim(), rows };
    },

    /* Labelled rows for a page that prints its own layout (BLC). */
    describe() {
      const out = [];
      ['ext', 'int'].forEach(sec => rowsOf(sec).forEach((tr, i) => {
        const r = readRow(tr);
        const cat = category(r.cat);
        const pairs = Object.keys(r.fields).map(id => {
          const f = cat && cat.fields.find(x => x.id === id);
          return [f ? f.label : id, r.fields[id]];
        }).filter(p => p[1]);
        const fn = sec === 'ext' ? r.fn : r.fnArr.join(', ');
        if (fn && showFunction) pairs.push(['Function', fn]);
        if (showQty && r.qty) pairs.push(['Qty', r.qty + (r.unit ? ' ' + r.unit : '')]);
        out.push({ sec, index: i + 1, category: cat ? cat.label : r.cat, hasContent: !isEmpty(tr) || !!r.qty, pairs });
      }));
      return out;
    },

    /* Show or hide the Function column and the cards it creates. Values are
       kept while hidden, so turning it back on restores them. */
    setShowFunction(on) {
      showFunction = !!on;
      root.classList.toggle('materials--no-fn', !showFunction);
    },

    /* Catalog lookups, for converting older saved data. */
    fieldIds(catId) { const c = category(catId); return c ? c.fields.map(f => f.id) : []; },
    categoryIdFor(label) {
      const want = String(label || '').trim().toLowerCase();
      const c = options.categories.find(x => x.id === want || x.label.toLowerCase() === want);
      return c ? c.id : want.replace(/\s+/g, '-');
    },
  };

  api.setState({});     /* one blank exterior row, like a fresh sheet */
  return api;
}
