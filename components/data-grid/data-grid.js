/* =====================================================================
   DATA GRID — behavior for the spreadsheet-style table
   ---------------------------------------------------------------------
   Ported from the Rollout Manager grid (Platinum/Rollout Manager,
   rollout-manager.html: buildTable, selection, cell editor, type-ahead,
   fill handle, copy / paste, context menus, toast). Same interaction
   model, same class names, so the two tools feel like one product:

     click            select a cell (shift-click / drag for a range)
     double-click,
     Enter, F2, typing edit the cell (typing replaces its value)
     Enter / Tab      save and move down / right; Esc cancels
     Delete           clear the selected cells
     ⌘C / ⌘V          copy / paste as tab-separated text (Excel, Sheets)
     drag the handle  fill the selection down or across
     ⌘Z / ⇧⌘Z         undo / redo (the page owns the history)
     right-click      cell menu (copy, clear) or row menu

   One difference from the source: selection repaints classes on the
   cells already on the page instead of rebuilding the table, because
   a material category runs to 1,000+ rows where the rollout had 94.

   Styles: data-grid.css. Markup: the host element plus the dg*Template
   <template>s on the page. The table itself is built here because its
   columns come from the data (each category has its own schema) — in
   Angular this file becomes the component class, the row and cell
   loops become @for blocks, and selection becomes a signal.

   USAGE
     import { createDataGrid, toast } from './components/data-grid/data-grid.js';
     const grid = createDataGrid(hostEl, {
       model,              // () => { rowHead, rows, cols, cellAt(rowKey, colKey) }
       applyValue,         // (rowKey, colKey, text) => '' | error message
       begin, commit,      // wrap a change: begin() before, commit() after
       undo, redo,
       addRow,             // { label, placeholder, validate(text), create(text) }
       rowDelete,          // { label, run(rowKey) }
       rowMenu,            // (rowKey) => [{ label, danger, note, run }]
       onSort,             // (colKey) => void — header clicked; page re-sorts and renders
     });
     grid.render();

   MODEL SHAPES
     model.sort { key, dir: 'asc' | 'desc' } | null — which header shows the sort
                                         ('__row' is the row-head column)
     row  { key, label, sub?, inactive? }
     col  { key, label, w?, num?, bool? }
     cell { value, display?, editable, bool?, checked?,
            options?, strict? }          // strict: only a listed value saves
   ===================================================================== */

const tpl = id => document.getElementById(id).content.firstElementChild.cloneNode(true);
const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;

/* ============================ TOAST ============================ */
let toastEl = null, toastT = null;
export function toast(msg, actionLabel, action) {
  toastEl && toastEl.remove(); clearTimeout(toastT);
  toastEl = tpl('dgToastTemplate');
  toastEl.querySelector('.toast__text').textContent = msg;
  const b = toastEl.querySelector('.toast__action');
  if (actionLabel) {
    b.textContent = actionLabel;
    b.onclick = () => { toastEl.remove(); toastEl = null; action(); };
  } else b.remove();
  document.body.appendChild(toastEl);
  toastT = setTimeout(() => { toastEl && toastEl.remove(); toastEl = null; }, 5200);
}

/* ============================ MENUS ============================ */
/* items: [{ label, run, danger }, { heading }, { note }, { divider }] */
let openMenu = null;
function closeMenu() { openMenu && openMenu.remove(); openMenu = null; }
function menu(x, y, items) {
  closeMenu();
  const m = tpl('dgMenuTemplate');
  items.forEach(it => {
    let n;
    if (it.heading) { n = tpl('dgMenuLabelTemplate'); n.textContent = it.heading; }
    else if (it.note) { n = tpl('dgMenuNoteTemplate'); n.textContent = it.note; }
    else if (it.divider) n = document.createElement('hr');
    else {
      n = tpl('dgMenuItemTemplate');
      n.textContent = it.label;
      if (it.danger) n.classList.add('danger');
      n.onclick = () => { closeMenu(); it.run(); };
    }
    m.appendChild(n);
  });
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  openMenu = m;
  const onDoc = ev => { if (!m.contains(ev.target)) closeMenu(); else setTimeout(() => document.addEventListener('mousedown', onDoc, { once: true }), 0); };
  setTimeout(() => document.addEventListener('mousedown', onDoc, { once: true }), 0);
}

/* ========================== TYPE-AHEAD ==========================
   Completes the rest of the first match inline and leaves it selected:
   keep typing and it recomputes, press Delete and you keep what you
   typed. Matches list under the cell; arrow keys walk them. With
   `strict`, nothing off the list saves (Rollout Manager's Job Type);
   without, the list is suggestions only. */
const matchOption = (opts, val) => {
  const v = String(val ?? '').trim().toLowerCase();
  return opts.find(o => o.toLowerCase() === v) || null;
};
function autocomplete(inp, td, opts, strict) {
  const list = tpl('dgAutocompleteTemplate');   // on <body>: a cell clips its overflow
  document.body.appendChild(list);
  let items = [], active = -1, query = inp.value, api;
  const starts = v => opts.filter(o => o.toLowerCase().startsWith(v.toLowerCase()));
  const holds = v => opts.filter(o => o.toLowerCase().includes(v.toLowerCase()));
  function place() {
    const r = td.getBoundingClientRect();
    list.style.left = r.left + 'px'; list.style.top = r.bottom + 'px'; list.style.minWidth = r.width + 'px';
  }
  function paint() {
    const v = query.trim();
    items = (v === '' ? opts.slice() : (starts(v).length ? starts(v) : holds(v))).slice(0, 50);
    list.replaceChildren();
    items.forEach((o, i) => {
      const b = tpl('dgAutocompleteItemTemplate');
      b.textContent = o;
      b.classList.toggle('is-active', i === active);
      b.onmousedown = e => { e.preventDefault(); inp.value = o; query = o; api.close(); api.onpick && api.onpick(); };
      list.appendChild(b);
    });
    list.classList.toggle('open', items.length > 0);
    inp.classList.toggle('editor--invalid', strict && v !== '' && items.length === 0);
    place();
  }
  function complete() {
    const v = query; if (!v) return;
    const hit = starts(v)[0];
    if (hit && hit.length > v.length) { inp.value = hit; inp.setSelectionRange(v.length, hit.length); }
  }
  function move(d) {
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    inp.value = items[active];
    inp.setSelectionRange(inp.value.length, inp.value.length);
    paint();
  }
  inp.addEventListener('input', e => {
    active = -1; query = inp.value;
    if (!/^delete/i.test(e.inputType || '')) complete();
    paint();
  });
  paint();
  api = {
    complete() { complete(); paint(); },
    close() { list.remove(); },
    onpick: null,
    onkeydown(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return true; }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return true; }
      return false;
    },
  };
  return api;
}

/* ============================ GRID ============================ */
export function createDataGrid(host, opts) {
  const { model, applyValue, begin, commit, undo, redo, addRow, rowDelete, rowMenu, onSort } = opts;
  let M = null;            // the compiled model: rows, cols, cellAt
  let sel = null;          // { r0, c0, r1, c1 } — r0/c0 is the anchor
  let editing = null;      // { r, c, seed }
  let fill = null, dragging = false;
  let tbody = null, theadRow = null;

  const norm = s => s && { r0: Math.min(s.r0, s.r1), r1: Math.max(s.r0, s.r1),
                           c0: Math.min(s.c0, s.c1), c1: Math.max(s.c0, s.c1) };
  const selectable = (r, c) => !!(M && M.rows[r] && M.cols[c]);
  const cellEl = (r, c) => host.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
  const cellAt = (r, c) => M.cellAt(M.rows[r].key, M.cols[c].key);
  const visible = () => host.offsetParent !== null;

  /* ---------------------------------------------------- render */
  function render() {
    closeMenu();
    M = model();
    if (sel) clampSel();
    host.replaceChildren(buildTable());
    paintSel();
    if (editing) mountEditor();
  }

  function buildTable() {
    const tbl = document.createElement('table');
    const colg = document.createElement('colgroup');
    const rh = document.createElement('col'); rh.className = 'col-rowhead'; colg.appendChild(rh);
    M.cols.forEach(c => { const col = document.createElement('col'); col.style.width = (c.w || 150) + 'px'; colg.appendChild(col); });
    tbl.appendChild(colg);

    /* Head: the row-head corner, then one pinned header per column. */
    const thead = document.createElement('thead');
    theadRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'hd hd-pinned';
    const cp = pad();
    const cl = document.createElement('span'); cl.className = 'hd-label'; cl.textContent = M.rowHead;
    cp.appendChild(cl); corner.appendChild(cp);
    sortable(corner, '__row', M.rowHead);
    theadRow.appendChild(corner);
    M.cols.forEach((c, ci) => {
      const th = document.createElement('th');
      th.className = 'hd hd-pinned' + (c.num ? ' hd-num' : '') + (c.bool ? ' hd-bool' : '');
      th.dataset.col = ci;
      th.title = c.title || c.label;
      const p = pad();
      const l = document.createElement('span'); l.className = 'hd-label'; l.textContent = c.label;
      p.appendChild(l);
      th.appendChild(p);
      sortable(th, c.key, c.title || c.label);
      theadRow.appendChild(th);
    });
    thead.appendChild(theadRow);
    tbl.appendChild(thead);

    tbody = document.createElement('tbody');
    M.rows.forEach((R, ri) => {
      const tr = document.createElement('tr');
      if (R.inactive) tr.classList.add('row-inactive');
      const th = document.createElement('th');
      th.className = 'hd';
      th.dataset.row = R.key;
      const p = pad();
      const l = document.createElement('span'); l.className = 'hd-label'; l.textContent = R.label;
      if (R.sub) { const s = document.createElement('span'); s.className = 'sub'; s.textContent = ' · ' + R.sub; l.appendChild(s); }
      p.appendChild(l);
      th.appendChild(p);
      if (rowDelete) {
        const b = tpl('dgRowDeleteTemplate');
        b.setAttribute('aria-label', rowDelete.label); b.title = rowDelete.label;
        b.onclick = ev => { ev.stopPropagation(); sel = null; rowDelete.run(R.key); };
        p.appendChild(b);
      }
      if (rowMenu) th.oncontextmenu = e => { e.preventDefault(); menu(e.clientX, e.clientY, rowMenu(R.key)); };
      tr.appendChild(th);

      M.cols.forEach((C, ci) => {
        const td = document.createElement('td');
        td.dataset.r = ri; td.dataset.c = ci;
        const cell = M.cellAt(R.key, C.key);
        const cls = ['cell'];
        if (C.num) cls.push('num');
        if (cell.bool) cls.push('bool');
        if (!cell.editable) cls.push('readonly');
        if (!cell.bool && !String(cell.display ?? cell.value ?? '').length) cls.push('is-empty');
        td.className = cls.join(' ');
        const v = document.createElement('span'); v.className = 'val';
        if (cell.bool) {
          const cb = tpl('dgCheckTemplate');
          cb.checked = !!cell.checked; cb.setAttribute('aria-label', C.label);
          v.appendChild(cb);
        } else v.textContent = cell.display ?? cell.value ?? '';
        td.appendChild(v);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    /* The house add affordance: a full-width row under the list. */
    if (addRow) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'add';
      th.appendChild(pad(addRow.label));
      th.onclick = () => { if (!th.querySelector('.editor')) addRowEntry(th); };
      tr.appendChild(th);
      const fillTd = document.createElement('td');
      fillTd.className = 'blank'; fillTd.colSpan = M.cols.length;
      tr.appendChild(fillTd);
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    return tbl;
  }
  /* Click a header to sort by it: ascending, descending, then back to
     the default order. The page owns the order (M.sort says which column
     and which way); the header only shows it and asks for the next one. */
  function sortable(th, key, title) {
    if (!onSort) return;
    const on = M.sort && M.sort.key === key ? M.sort.dir : '';
    th.classList.add('hd-sort');
    if (on) th.classList.add('is-sorted');
    th.setAttribute('aria-sort', on === 'asc' ? 'ascending' : on === 'desc' ? 'descending' : 'none');
    th.title = `${title} — click to sort` + (on === 'asc' ? ' (now A→Z)' : on === 'desc' ? ' (now Z→A)' : '');
    const icon = tpl('dgSortIconTemplate');
    icon.classList.add(on === 'asc' ? 'fa-sort-up' : on === 'desc' ? 'fa-sort-down' : 'fa-sort');
    th.querySelector('.cellpad').appendChild(icon);
    th.onclick = () => { sel = null; editing = null; onSort(key); };
  }
  function pad(text) {
    const s = document.createElement('span'); s.className = 'cellpad';
    if (text != null) s.textContent = text;
    return s;
  }

  /* ------------------------------------------------- selection */
  let painted = [];
  function paintSel() {
    painted.forEach(n => n.classList.remove('sel', 'anchor', 'e-t', 'e-b', 'e-l', 'e-r', 'hd-sel'));
    host.querySelectorAll('.handle').forEach(h => h.remove());
    painted = [];
    if (!sel || !M) return;
    const s = norm(sel);
    for (let r = s.r0; r <= s.r1; r++) {
      const rowTh = tbody && tbody.rows[r] && tbody.rows[r].cells[0];
      if (rowTh) { rowTh.classList.add('hd-sel'); painted.push(rowTh); }
      for (let c = s.c0; c <= s.c1; c++) {
        const td = cellEl(r, c); if (!td) continue;
        td.classList.add('sel');
        if (r === sel.r0 && c === sel.c0) td.classList.add('anchor');
        if (r === s.r0) td.classList.add('e-t');
        if (r === s.r1) td.classList.add('e-b');
        if (c === s.c0) td.classList.add('e-l');
        if (c === s.c1) td.classList.add('e-r');
        painted.push(td);
        if (r === s.r1 && c === s.c1 && !editing) {
          const h = document.createElement('div'); h.className = 'handle'; h.dataset.handle = '1';
          td.appendChild(h);
        }
      }
    }
    for (let c = s.c0; c <= s.c1; c++) {
      const th = theadRow && theadRow.cells[c + 1];
      if (th) { th.classList.add('hd-sel'); painted.push(th); }
    }
  }
  function setSel(r, c, extend) {
    if (!selectable(r, c)) return;
    if (extend && sel) { sel.r1 = r; sel.c1 = c; } else sel = { r0: r, c0: c, r1: r, c1: c };
    paintSel();
  }
  function moveSel(dr, dc, extend) {
    if (!sel) return;
    const r = Math.max(0, Math.min(M.rows.length - 1, (extend ? sel.r1 : sel.r0) + dr));
    const c = Math.max(0, Math.min(M.cols.length - 1, (extend ? sel.c1 : sel.c0) + dc));
    setSel(r, c, extend);
    const el = cellEl(r, c);
    el && el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function clampSel() {
    const s = norm(sel);
    if (!M.rows.length || !M.cols.length) { sel = null; return; }
    const r1 = Math.min(s.r1, M.rows.length - 1), c1 = Math.min(s.c1, M.cols.length - 1);
    sel = { r0: Math.min(s.r0, r1), c0: Math.min(s.c0, c1), r1, c1 };
  }

  /* --------------------------------------------------- editing */
  function startEdit(r, c, seed) {
    if (!selectable(r, c)) return;
    const cell = cellAt(r, c);
    if (!cell.editable) { cell.why && toast(cell.why); return; }
    if (cell.bool) { toggleBool(r, c); return; }
    editing = { r, c, seed };
    paintSel();
    mountEditor();
  }
  function toggleBool(r, c) {
    const cell = cellAt(r, c);
    if (!cell.bool || !cell.editable) return;
    change(() => applyValue(M.rows[r].key, M.cols[c].key, cell.checked ? '' : 'true'));
  }
  /* One undoable step around any batch of edits; reports refusals. */
  function change(fn) {
    begin();
    const errs = [];
    const ret = fn(err => err && errs.push(err));
    if (typeof ret === 'string' && ret) errs.push(ret);
    commit();
    if (errs.length) toast(errs.length === 1 ? errs[0] : `${errs[0]} (and ${errs.length - 1} more)`);
    return errs.length;
  }
  function mountEditor() {
    const td = cellEl(editing.r, editing.c);
    if (!td) { editing = null; return; }
    const C = M.cols[editing.c];
    const cell = cellAt(editing.r, editing.c);
    const opts = cell.options && cell.options.length ? cell.options : null;
    const inp = tpl('dgEditorTemplate');
    inp.value = editing.seed != null ? editing.seed : (cell.value ?? '');
    td.appendChild(inp);
    inp.focus();
    if (editing.seed != null) inp.setSelectionRange(inp.value.length, inp.value.length); else inp.select();
    const ac = opts ? autocomplete(inp, td, opts, !!cell.strict) : null;
    if (ac && editing.seed != null) ac.complete();

    const finish = (save, mv) => {
      if (!editing) return;
      let val = inp.value;
      const at = { r: editing.r, c: editing.c };
      if (save && opts && cell.strict) {
        const m = matchOption(opts, val);
        if (val.trim() !== '' && !m) {
          ac && ac.close(); editing = null; inp.remove(); paintSel();
          toast(`"${val.trim()}" is not a ${C.label.toLowerCase()}. Choose one of: ${opts.join(', ')}.`);
          return;
        }
        val = m || '';
      }
      ac && ac.close();
      editing = null;
      inp.onblur = null; inp.remove();
      if (save && String(val) !== String(cell.value ?? '')) change(() => applyValue(M.rows[at.r].key, C.key, val));
      else paintSel();
      if (mv) { sel = { r0: at.r, c0: at.c, r1: at.r, c1: at.c }; moveSel(mv[0], mv[1], false); }
    };
    inp.onblur = () => finish(true, null);
    inp.onkeydown = e => {
      e.stopPropagation();
      if (ac && ac.onkeydown(e)) return;
      if (e.key === 'Enter') { e.preventDefault(); finish(true, [1, 0]); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false, null); }
      else if (e.key === 'Tab') { e.preventDefault(); finish(true, [0, e.shiftKey ? -1 : 1]); }
    };
    if (ac) ac.onpick = () => finish(true, [1, 0]);
  }

  /* An entry typed into the add row: an .editor over "+ New …". Enter
     checks it with validate() (an error message, or ''); a valid value
     goes to create(). Esc or leaving the field cancels. */
  function addRowEntry(th) {
    const inp = tpl('dgEditorTemplate');
    inp.placeholder = addRow.placeholder || '';
    th.appendChild(inp); inp.focus();
    let done = false;
    const cancel = () => { if (done) return; done = true; inp.remove(); };
    inp.oninput = () => inp.classList.remove('editor--invalid');
    inp.onblur = cancel;
    inp.onkeydown = ev => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        const val = inp.value.trim(), err = addRow.validate(val);
        if (err) { inp.classList.add('editor--invalid'); toast(err); return; }
        done = true; inp.remove(); addRow.create(val);
      }
    };
  }

  function clearRange() {
    if (!sel) return;
    const s = norm(sel); let n = 0;
    change(report => {
      for (let r = s.r0; r <= s.r1; r++) for (let c = s.c0; c <= s.c1; c++) {
        const cell = cellAt(r, c);
        if (!cell.editable || String(cell.value ?? '') === '') continue;
        report(applyValue(M.rows[r].key, M.cols[c].key, '')); n++;
      }
    });
    if (n) toast(`Cleared ${plural(n, 'cell')}.`, 'Undo', undo);
  }

  /* ------------------------------------------------------ fill */
  function beginFill(e) { if (!sel) return; const s = norm(sel); fill = { src: s, r1: s.r1, c1: s.c1 }; e.preventDefault(); }
  function fillPreview(r, c) {
    const s = fill.src;
    const vert = Math.abs(r - s.r1) >= Math.abs(c - s.c1);
    fill.r1 = vert ? Math.max(s.r1, Math.min(r, M.rows.length - 1)) : s.r1;
    fill.c1 = vert ? s.c1 : Math.max(s.c1, Math.min(c, M.cols.length - 1));
    host.querySelectorAll('td.fillpreview').forEach(x => x.classList.remove('fillpreview'));
    for (let rr = s.r0; rr <= fill.r1; rr++) for (let cc = s.c0; cc <= fill.c1; cc++) {
      if (rr <= s.r1 && cc <= s.c1) continue;
      const td = cellEl(rr, cc); td && td.classList.add('fillpreview');
    }
  }
  function endFill() {
    const s = fill.src, { r1, c1 } = fill; fill = null;
    host.querySelectorAll('td.fillpreview').forEach(x => x.classList.remove('fillpreview'));
    if (r1 === s.r1 && c1 === s.c1) return;
    const h = s.r1 - s.r0 + 1, w = s.c1 - s.c0 + 1; let n = 0;
    const keys = [];   // rows can re-sort after an edit — address them by key
    for (let rr = s.r0; rr <= r1; rr++) for (let cc = s.c0; cc <= c1; cc++) {
      if (rr <= s.r1 && cc <= s.c1) continue;
      if (!cellAt(rr, cc).editable) continue;
      const src = cellAt(s.r0 + ((rr - s.r0) % h), s.c0 + ((cc - s.c0) % w));
      keys.push([M.rows[rr].key, M.cols[cc].key, src.value ?? '']);
    }
    change(report => keys.forEach(([rk, ck, v]) => { report(applyValue(rk, ck, v)); n++; }));
    sel = { r0: s.r0, c0: s.c0, r1, c1 }; clampSel(); paintSel();
    if (n) toast(`Filled ${plural(n, 'cell')}.`, 'Undo', undo);
  }

  /* ----------------------------------------------- copy / paste */
  function selTSV() {
    if (!sel) return '';
    const s = norm(sel), out = [];
    for (let r = s.r0; r <= s.r1; r++) {
      const row = [];
      for (let c = s.c0; c <= s.c1; c++) row.push(String(cellAt(r, c).value ?? ''));
      out.push(row.join('\t'));
    }
    return out.join('\n');
  }
  const active = () => visible() && !editing && sel;
  document.addEventListener('copy', e => {
    if (!active() || isTyping(e.target)) return;
    e.clipboardData.setData('text/plain', selTSV()); e.preventDefault(); toast('Copied.');
  });
  document.addEventListener('paste', e => {
    if (!active() || isTyping(e.target)) return;
    const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!txt) return;
    e.preventDefault();
    const grid = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t'));
    const s = norm(sel); let n = 0, skipped = 0;
    const keys = [];
    for (let i = 0; i < grid.length; i++) for (let j = 0; j < grid[i].length; j++) {
      const r = s.r0 + i, c = s.c0 + j;
      if (!selectable(r, c)) continue;
      if (!cellAt(r, c).editable) { skipped++; continue; }
      keys.push([M.rows[r].key, M.cols[c].key, grid[i][j]]);
    }
    change(report => keys.forEach(([rk, ck, v]) => { report(applyValue(rk, ck, v)); n++; }));
    sel = { r0: s.r0, c0: s.c0, r1: s.r0 + grid.length - 1, c1: s.c0 + Math.max(...grid.map(g => g.length)) - 1 };
    clampSel(); paintSel();
    toast(`Pasted ${plural(n, 'cell')}.` + (skipped ? ` ${skipped} skipped — read-only.` : ''), 'Undo', undo);
  });

  /* ----------------------------------------------------- mouse */
  host.addEventListener('mousedown', e => {
    if (e.target.closest('.hd-action, .editor')) return;
    if (e.target.dataset.handle) { beginFill(e); return; }
    const td = e.target.closest('td[data-r]');
    if (!td) return;
    const r = +td.dataset.r, c = +td.dataset.c;
    /* The checkbox is the control — clicking it toggles, and takes the
       selection with it so the keyboard carries on from there. */
    if (e.target.classList.contains('cell-check')) {
      e.preventDefault(); setSel(r, c, false); toggleBool(r, c); return;
    }
    /* Read off mousedown rather than dblclick, as in the source grid. */
    if (e.detail >= 2) {
      e.preventDefault();
      if (editing) { const inp = host.querySelector('.editor'); inp && inp.blur(); }
      setSel(r, c, false); startEdit(r, c, null); return;
    }
    if (e.button === 2) {
      const s = sel && norm(sel);
      if (!(s && r >= s.r0 && r <= s.r1 && c >= s.c0 && c <= s.c1)) setSel(r, c, false);
      return;
    }
    if (editing) { const inp = host.querySelector('.editor'); inp && inp.blur(); }
    /* Moving focus off whatever had it (the search box) lets the grid
       keyboard take over. */
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    setSel(r, c, e.shiftKey);
    dragging = true;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    const td = e.target.closest && e.target.closest('td[data-r]');
    if (!td || !host.contains(td)) return;
    const r = +td.dataset.r, c = +td.dataset.c;
    if (fill) { fillPreview(r, c); return; }
    if (!dragging || !sel) return;
    if (sel.r1 !== r || sel.c1 !== c) { sel.r1 = r; sel.c1 = c; paintSel(); }
  });
  document.addEventListener('mouseup', () => { dragging = false; if (fill) endFill(); });
  host.addEventListener('contextmenu', e => {
    const td = e.target.closest('td[data-r]'); if (!td || !sel) return;
    e.preventDefault();
    const s = norm(sel), count = (s.r1 - s.r0 + 1) * (s.c1 - s.c0 + 1);
    menu(e.clientX, e.clientY, [
      { label: 'Copy', run: () => {
          const tsv = selTSV();
          if (navigator.clipboard && navigator.clipboard.writeText)
            navigator.clipboard.writeText(tsv).then(() => toast('Copied.'), () => toast('Copy blocked by the browser. Use ⌘C.'));
          else toast('Use ⌘C to copy.');
        } },
      { label: count > 1 ? `Clear ${count} cells` : 'Clear', run: clearRange },
    ]);
  });

  /* -------------------------------------------------- keyboard */
  const isTyping = t => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
                         && !t.classList.contains('cell-check');
  document.addEventListener('keydown', e => {
    if (!visible() || editing || isTyping(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (!sel) return;
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault(); sel = { r0: 0, c0: 0, r1: M.rows.length - 1, c1: M.cols.length - 1 }; paintSel(); return;
    }
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); moveSel(-1, 0, e.shiftKey); return;
      case 'ArrowDown': e.preventDefault(); moveSel(1, 0, e.shiftKey); return;
      case 'ArrowLeft': e.preventDefault(); moveSel(0, -1, e.shiftKey); return;
      case 'ArrowRight': e.preventDefault(); moveSel(0, 1, e.shiftKey); return;
      case 'Tab': e.preventDefault(); moveSel(0, e.shiftKey ? -1 : 1, false); return;
      case ' ': case 'Enter': case 'F2': e.preventDefault(); startEdit(sel.r0, sel.c0, null); return;
      case 'Backspace': case 'Delete': e.preventDefault(); clearRange(); return;
      case 'Escape': sel = null; paintSel(); return;
    }
    if (e.key.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit(sel.r0, sel.c0, e.key); }
  });

  return {
    render,
    clearSelection() { sel = null; editing = null; paintSel(); },
    /* Put the add-row entry up from outside (a toolbar button). */
    startAddRow() { const th = host.querySelector('tbody th.add'); th && !th.querySelector('.editor') && (th.scrollIntoView({ block: 'nearest' }), addRowEntry(th)); },
  };
}
