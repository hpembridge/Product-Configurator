/* =====================================================================
   HARDWARE FIELDS — the MCS's hardware inputs, from data/catalog.js
   ---------------------------------------------------------------------
   One hardware item = one .hw-group: a labelled input per catalog field
   for that hardware type, plus Qty/ea. Used two ways in mcs/index.html:

     - inside the binding cards (Menu Cord, Screwposts, Ring Binder,
       Clips, Bands), in place of the old free-text "Size / Color"
     - on "+ Hardware" cards under Customizations, for every hardware
       type that is not a binding option (catalog isBinding !== true)

   Fields, labels and suggestions all come from data/catalog.js — the one
   hardware list for the MCS and the BLC. Suggestions are
   hardwareSuggest() in engines/catalog.js: combination-aware when the
   type has combinations, its option list when not. Suggestions only:
   anything can be typed (a one-off is always allowed).

   Markup: <template>s hwGroupTemplate / hwFieldTemplate / hwCardTemplate
   in index.html. Styles: the .hw-* block in index.html's <style>.
   Classic script (not a module) because index.html's main script is one;
   it reads window.mcsCatalog, set by the catalog module at the bottom of
   index.html.

   Angular: HardwareGroup becomes a component taking a hardware type;
   suggest() becomes a pure function next to comboOptions().
   ===================================================================== */
(function () {
  var uid = 0;
  var tpl = function (id) { return document.getElementById(id).content.firstElementChild.cloneNode(true); };
  var lc = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };

  function catalog() { return window.mcsCatalog || null; }
  function hwType(id) {
    var c = catalog();
    return c ? (c.hardware || []).filter(function (h) { return h.id === id && h.active !== false; })[0] || null : null;
  }

  /* What a field offers — hardwareSuggest() in engines/catalog.js, the
     same function the BLC uses. The catalog module at the bottom of
     index.html puts it on window, since this is a classic script. */
  function suggest(type, fieldId, values) {
    return window.hardwareSuggest ? window.hardwareSuggest(type, fieldId, values) : [];
  }

  function readGroup(group) {
    var v = {};
    group.querySelectorAll('[data-hw-field]').forEach(function (i) { v[i.dataset.hwField] = i.value; });
    return v;
  }
  function refresh(group, except) {
    var type = hwType(group.dataset.hwType);
    if (!type) return;
    var vals = readGroup(group);
    group.querySelectorAll('[data-hw-field]').forEach(function (inp) {
      var id = inp.dataset.hwField;
      if (id === 'qtyEa' || id === except || !inp._dl) return;
      inp._dl.replaceChildren.apply(inp._dl, suggest(type, id, vals).map(function (o) { return new Option(o); }));
    });
  }

  /* Build one hardware item into `host`. `title` is optional (Menu Cord
     has two items, Cord and Eyelets, so each gets a sub-heading). */
  function mountGroup(host, typeId, opts) {
    opts = opts || {};
    var type = hwType(typeId);
    var group = tpl('hwGroupTemplate');
    group.dataset.hwType = typeId;
    var title = group.querySelector('.hw-group__title');
    if (opts.title) title.textContent = opts.title; else title.remove();
    var fieldsHost = group.querySelector('.hw-group__fields');
    var fields = type ? type.fields : [{ id: 'desc', label: 'Description' }];   // type missing from the catalog: free text
    fields.forEach(function (f) {
      var cell = tpl('hwFieldTemplate');
      cell.querySelector('.lab').textContent = f.label || f.id;
      var inp = cell.querySelector('input');
      inp.dataset.hwField = f.id;
      var dl = document.createElement('datalist');
      dl.id = 'hw-dl-' + (++uid);
      cell.appendChild(dl);
      inp.setAttribute('list', dl.id);
      inp._dl = dl;
      fieldsHost.appendChild(cell);
    });
    var qty = tpl('hwFieldTemplate');
    qty.classList.add('hw-field--qty');
    qty.querySelector('.lab').textContent = (type && type.qtyLabel && type.qtyLabel !== 'Qty' ? type.qtyLabel : 'Qty') + '/ea';
    var qi = qty.querySelector('input');
    qi.dataset.hwField = 'qtyEa';
    qi.setAttribute('inputmode', 'numeric');
    fieldsHost.appendChild(qty);

    group.addEventListener('input', function (e) { if (e.target.dataset.hwField) refresh(group, e.target.dataset.hwField); });
    group.addEventListener('focusin', function (e) { if (e.target.dataset.hwField) refresh(group, e.target.dataset.hwField); });
    host.appendChild(group);
    refresh(group, null);
    return group;
  }

  function fillGroup(group, values) {
    values = values || {};
    group.querySelectorAll('[data-hw-field]').forEach(function (inp) {
      var v = values[inp.dataset.hwField];
      if (v != null) inp.value = v;
    });
    refresh(group, null);
  }

  /* { typeId: { fieldId: value, qtyEa } } for every group under `el`. */
  function readAll(el) {
    var out = {};
    el.querySelectorAll('.hw-group').forEach(function (g) { out[g.dataset.hwType] = readGroup(g); });
    return out;
  }

  /* Everything "+ Hardware" offers: active, not a binding option. */
  function nonBindingTypes() {
    var c = catalog();
    return c ? (c.hardware || [])
      .filter(function (h) { return h.active !== false && h.isBinding !== true; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0) || a.label.localeCompare(b.label); }) : [];
  }

  window.mcsHardware = {
    mountGroup: mountGroup, fillGroup: fillGroup, readGroup: readGroup, readAll: readAll,
    nonBindingTypes: nonBindingTypes, type: hwType, suggest: suggest,
  };
})();
