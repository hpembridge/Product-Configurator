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
       int: [{ cat, fields, fnArr: ['Liner', ...], qty?, unit? }],
       fnCards: [{ fn, data }],            // detail cards under the tables
       ccInt: boolean }                    // Standard CC Interior card
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
      if (sec === 'int') syncFunctionCards();
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
      if (checked.includes(fn)) desired.push({ rowId: tr.dataset.rowId, fn });
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

  function addCcInterior() {
    if (container_has_cc()) return;
    fnCards().append(tpl('cc-interior'));
    role(root, 'cc-add').disabled = true;
    changed();
  }
  function removeCcInterior() {
    const card = fnCards().querySelector('[data-cc-int]');
    if (card) card.remove();
    role(root, 'cc-add').disabled = false;
    changed();
  }
  const container_has_cc = () => !!fnCards().querySelector('[data-cc-int]');

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
    }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.materials__msd')) closeAllMsd(); });

  root.addEventListener('input', e => {
    const t = e.target;
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
      return { ext: rowsOf('ext').map(readRow), int: rowsOf('int').map(readRow), fnCards: cards, ccInt: container_has_cc() };
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
        (s.int || []).forEach(r => addRow('int', r));
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
        if (s.ccInt) addCcInterior();
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
      rowsOf('int').forEach(tr => {
        const checked = Array.from(role(tr, 'functions').querySelectorAll('input:checked')).map(i => i.value);
        fill(tr, checked.map(fn => {
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
