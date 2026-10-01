/**
 * shared.js
 * Single reference file for all shared logic:
 *   - MATERIAL_CONFIG  (fabric categories, fields, autocomplete)
 *   - HW_MATERIALS     (hardware component definitions)
 *   - Date validation & workday arithmetic
 *   - Tier calculation engine
 *   - PDF state embedding (via PDF-lib CDN)
 *   - PDF state extraction from uploaded file
 *   - localStorage helpers
 *
 * Requires PDF-lib to be loaded before this script:
 *   <script src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
 */

/* =================================================================
   MATERIAL CONFIG
   Fabric/cover category definitions used by the planner form.
================================================================= */
var MATERIAL_CONFIG = {

  interiorFunctions: ['Liner', 'Panels', 'Pockets', 'CC Slot', 'Pen Loop'],

  categories: [
    'Bookcloth', 'Linen/Paper', 'Wood', 'Rockboard', 'Metal',
    'Leather', 'Acrylic', 'Carbonite', '4C Litho', 'Other'
  ],

  fields: {
    Bookcloth: {
      interior: true,
      printTemplate: function(v) { return [v.vendor, v.productLine, v.color, v.decoration].filter(Boolean).join(' '); },
      inputs: [
        { id: 'vendor',      placeholder: 'Vendor',       autocomplete: ['Majilite', 'LBS', 'Fifield', 'KFL Synt3'] },
        { id: 'productLine', placeholder: 'Product Line' },
        { id: 'color',       placeholder: 'Color' },
        { id: 'decoration',  placeholder: 'Decoration',   type: 'decoration' }
      ]
    },
    'Linen/Paper': {
      interior: true,
      printTemplate: function(v) { return [v.vendor, v.productLine, v.color].filter(Boolean).join(' '); },
      inputs: [
        { id: 'vendor',      placeholder: 'Vendor', autocomplete: ['Holliston','LBS','Neenah','Pointe International','PVC Tech','Koroseal','Wolf Gordon'] },
        { id: 'productLine', placeholder: 'Product Line' },
        { id: 'color',       placeholder: 'Color' }
      ]
    },
    Wood: {
      interior: false,
      printTemplate: function(v) { var s = v.type || ''; if (v.finish) s += ' — finish: ' + v.finish; return s; },
      inputs: [
        { id: 'type',   placeholder: 'Type',   autocomplete: ['Russian Birch','Bamboo','Oak','Other'] },
        { id: 'finish', placeholder: 'Finish' }
      ]
    },
    Rockboard: {
      interior: false,
      printTemplate: function(v) { return v.color || ''; },
      inputs: [
        { id: 'color', placeholder: 'Color', autocomplete: [
          'Ash','Begonia','Black','Blue Brush','Breeze','Brown','Bullion','Carribean','Cherry',
          'Covered Bridge','Croquet','Dino','Grey Brush','Grey Linen','Himalayan','Lathe','Maple',
          'Midnight','Ocean','Pavement','Pineapple','Red','RedTrexx','Scworill','Slate','Stainless',
          'Storm','Tan','Thickett','Timber','Tuscan Marble','Walnut','White Speckle','White White','Yellow'
        ]}
      ]
    },
    Metal: {
      interior: false,
      printTemplate: function(v) { var s = v.type || ''; if (v.finish) s += ' — finish: ' + v.finish; return s; },
      inputs: [
        { id: 'type',   placeholder: 'Type',   autocomplete: ['Aluminum','Copper','Brass'] },
        { id: 'finish', placeholder: 'Finish', autocomplete: ['Plain','Brushed','Regular Dip','Dip with Patina'] }
      ]
    },
    Leather: {
      interior: false,
      printTemplate: function(v) { return [v.productLine, v.weight, v.color, v.id].filter(Boolean).join(' '); },
      inputs: [
        { id: 'productLine', placeholder: 'Product Line', autocomplete: [
          'Water Buffalo','Matte Chrome Tanned Water Buffalo','Chrome Tanned Water Buffalo',
          'Bridle','Western Crunch','Oil Tan','Pioneer Chrome Tan','Mellowtan','Roughman','Napa Excel'
        ]},
        { id: 'weight', placeholder: 'Weight', autocomplete: ['2/3 oz.','3/4 oz.','4/5 oz.','5/6 oz.','6/7 oz.','8/9 oz.','9/10 oz.'] },
        { id: 'color',  placeholder: 'Color' },
        { id: 'id',     placeholder: 'ID' }
      ]
    },
    Acrylic: {
      interior: false,
      printTemplate: function(v) { return [v.type, v.color].filter(Boolean).join(' '); },
      inputs: [
        { id: 'type',  placeholder: 'Type' },
        { id: 'color', placeholder: 'Color' }
      ]
    },
    Carbonite: {
      interior: false,
      printTemplate: function(v) { return [v.carbonite]; },
      inputs: [{ id: 'carbonite', placeholder: 'Carbonite' }]
    },
    '4C Litho': {
      interior: true,
      printTemplate: function(v) { return [v.type, v.finish].filter(Boolean).join(' / '); },
      inputs: [
        { id: 'type',   placeholder: 'Type' },
        { id: 'finish', placeholder: 'Finish' }
      ]
    },
    Other: {
      interior: true,
      printTemplate: function(v) { return [v.other]; },
      inputs: [{ id: 'other', placeholder: 'Describe the Material' }]
    }
  }
};

/* =================================================================
   CONSTANTS
================================================================= */
var TIER_INFO = {
  1: { label: 'TIER 1 — FAST TRACK', days: 15,  cls: 't1' },
  2: { label: 'TIER 2 — STANDARD',   days: 25,  cls: 't2' },
  3: { label: 'TIER 3 — COMPLEX',    days: 40,  cls: 't3' },
  4: { label: 'TIER 4 — TBD',        days: null, cls: 't4' }
};

var HW_MATERIALS = [
  { id: 'magnets',         label: 'Magnets',               fields: [{ ph: 'Qty', w: 55 }, { ph: 'Color / Style', w: 120 }, { ph: 'Size', w: 80 }] },
  { id: 'elastic-cords',   label: 'Elastic Cords / Loops', fields: [{ ph: 'Qty', w: 55 }, { ph: 'Color / Style', w: 120 }, { ph: 'Size', w: 80 }] },
  { id: 'eyelets',         label: 'Eyelets',               fields: [{ ph: 'Qty', w: 55 }, { ph: 'Size', w: 80 }, { ph: 'Color', w: 90 }] },
  { id: 'o-rings',         label: 'O-Rings',               fields: [{ ph: 'Qty', w: 55 }, { ph: 'Description', w: 200 }] },
  { id: 'ring-binder',     label: 'Ring Binder',           fields: [{ ph: 'Qty', w: 50 }, { ph: '# of Rings', w: 80 }, { ph: 'Color', w: 90 }, { ph: 'Description / Size', w: 130 }] },
  { id: 'bands',           label: 'Bands',                 fields: [{ ph: 'Qty', w: 55 }, { ph: 'Size', w: 80 }, { ph: 'Color', w: 90 }] },
  { id: 'clips',           label: 'Clips',                 fields: [{ ph: 'Qty', w: 55 }, { ph: 'Color', w: 90 }] },
  { id: 'romark',          label: 'Rowmark',               fields: [{ ph: 'Sheet Qty', w: 70 }, { ph: 'Size', w: 80 }, { ph: 'Color', w: 90 }, { ph: 'Thickness', w: 90 }] },
  { id: 'rivets',          label: 'Rivets',                fields: [{ ph: 'Qty', w: 55 }] },
  { id: 'plastic-sleeves', label: 'Plastic Sleeves',       fields: [{ ph: 'Qty', w: 55 }, { ph: 'Type / Size', w: 140 }] },
  { id: 'snaps',           label: 'Snaps',                 fields: [{ ph: 'Qty', w: 55 }, { ph: 'Line', w: 80 }, { ph: 'Type', w: 100 }] },
  { id: 'screw-posts',     label: 'Screw Posts',           fields: [{ ph: 'Qty', w: 55 }, { ph: 'Color', w: 90 }, { ph: 'Size', w: 80 }] },
  { id: 'custom-hardware', label: 'Custom Hardware',       fields: [{ ph: 'Qty', w: 55 }, { ph: 'Description', w: 220 }] }
];

var STATUS_OPTS =
  '<option value="in-house">In-house and available</option>' +
  '<option value="ordered-in-stock">Ordered — in-stock at vendor</option>' +
  '<option value="not-in-stock">Ordered — NOT yet in-stock</option>';

/* Embedded attachment filename used inside the PDF */
var PDF_STATE_FILENAME = 'pp-state.json';

/* =================================================================
   DATE HELPERS
================================================================= */
function validateDate(input) {
  var val = input.value.trim();
  if (!val) { input.classList.remove('date-invalid'); input.title = ''; return true; }
  var ok = /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/\d{4}$/.test(val);
  input.classList.toggle('date-invalid', !ok);
  input.title = ok ? '' : 'Use MM/DD/YYYY format';
  return ok;
}

function addWorkdays(dateStr, numDays) {
  var m = dateStr.match(/^(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4})$/);
  if (!m) return '';
  var d = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
  if (isNaN(d.getTime())) return '';
  var added = 0;
  while (added < numDays) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  var mo = d.getMonth() + 1, dy = d.getDate(), yr = d.getFullYear();
  return (mo < 10 ? '0' + mo : mo) + '/' + (dy < 10 ? '0' + dy : dy) + '/' + yr;
}

function todayString() {
  var t = new Date();
  var mo = t.getMonth() + 1, dy = t.getDate(), yr = t.getFullYear();
  return (mo < 10 ? '0' + mo : mo) + '/' + (dy < 10 ? '0' + dy : dy) + '/' + yr;
}

/* =================================================================
   TIER CALCULATION
   mode: 'planner' | 'coordinator'
   state: the collectState() object
================================================================= */
function determineTierFromState(state, mode) {
  var reasons = [], tier = 1;
  function escalate(n, txt) { if (n > tier) tier = n; reasons.push({ level: n, text: txt }); }

  var qty = parseInt(state.orderQty) || 0;
  if      (qty > 1000) escalate(4, 'Quantity (' + qty + ') exceeds 1,000');
  else if (qty > 250)  escalate(3, 'Quantity (' + qty + ') exceeds 250');
  else if (qty > 100)  escalate(2, 'Quantity (' + qty + ') exceeds 100');

  /* Material availability — only in coordinator mode */
  if (mode === 'coordinator') {
    if (state.leatherInclude) {
      var ls = state.leatherStatus || 'in-house';
      if      (ls === 'not-in-stock')     escalate(4, 'Leather: ordered, NOT yet in-stock');
      else if (ls === 'ordered-in-stock') escalate(2, 'Leather: ordered (in-stock at vendor)');
    }
    if (state.fabric && state.fabric.include) {
      var fs = state.fabric.status || 'in-house';
      if      (fs === 'not-in-stock')     escalate(4, 'Fabric: ordered, NOT yet in-stock');
      else if (fs === 'ordered-in-stock') escalate(2, 'Fabric: ordered (in-stock at vendor)');
    }
    (state.hardware || []).forEach(function(hw) {
      if (!hw.active) return;
      var hs = hw.status || 'in-house';
      var mat = HW_MATERIALS.find(function(m) { return m.id === hw.id; });
      var lbl = mat ? mat.label : hw.id;
      if      (hs === 'not-in-stock')     escalate(4, lbl + ': ordered, NOT yet in-stock');
      else if (hs === 'ordered-in-stock') escalate(2, lbl + ': ordered (in-stock at vendor)');
    });
  }

  /* Departments */
  var d = state.depts || {};
  if (d.flatbed)  escalate(3, 'Flatbed Print required');
  if (d.woodshop) escalate(3, 'Wood Shop required');
  if (d.offset)   escalate(2, 'Offset Print required');
  if (d.sewing)   escalate(2, 'Sewing required');
  if (d.metal) {
    if (state.metalTippin) escalate(2, 'Metal Shop — Tip In Only');
    else                   escalate(3, 'Metal Shop — Full');
  }

  /* Interior */
  var ic = state.interior || {};
  if (ic.cbInclude) {
    if (ic.cbPanels === '5+')      escalate(3, 'Corners: 5+ panels');
    if (ic.cbType   === 'nonstd')  escalate(3, 'Corners: non-standard');
  }
  if (ic.tabsInclude) {
    if (ic.tabsPanels === '5+')    escalate(3, 'Tabs: 5+ panels');
    if (ic.tabsType   === 'nonstd') escalate(3, 'Tabs: non-standard');
  }
  if (ic.pocketsInclude) {
    if (ic.pocketsType === 'nonstd') escalate(3, 'Pockets: non-standard');
  }

  return { tier: tier, reasons: reasons };
}

/* =================================================================
   CHECKLIST BUILDER
   Returns array of items that need coordinator follow-up:
   ordered materials, items needing staging/pulling, etc.
================================================================= */
function buildChecklist(state) {
  var items = [];

  /* Leather */
  if (state.leatherInclude) {
    var ls = state.leatherStatus || 'in-house';
    if (ls === 'not-in-stock' || ls === 'ordered-in-stock') {
      items.push({ id: 'leather', label: 'Leather', status: ls, arrived: false });
    } else {
      items.push({ id: 'leather', label: 'Leather — stage / pull', status: 'in-house', arrived: false });
    }
  }

  /* Fabric */
  if (state.fabric && state.fabric.include) {
    var fs  = state.fabric.status || 'in-house';
    var fab = state.fabric;
    var fabLabel = 'Fabric' + (fab.category ? ' — ' + fab.category : '');
    if (fs === 'not-in-stock' || fs === 'ordered-in-stock') {
      items.push({ id: 'fabric', label: fabLabel, status: fs, arrived: false });
    } else {
      items.push({ id: 'fabric', label: fabLabel + ' — stage / pull', status: 'in-house', arrived: false });
    }
  }

  /* Hardware */
  (state.hardware || []).forEach(function(hw) {
    if (!hw.active) return;
    var mat = HW_MATERIALS.find(function(m) { return m.id === hw.id; });
    var lbl = mat ? mat.label : hw.id;
    var hs  = hw.status || 'in-house';
    if (hs === 'not-in-stock' || hs === 'ordered-in-stock') {
      items.push({ id: 'hw-' + hw.id, label: lbl, status: hs, arrived: false });
    } else {
      items.push({ id: 'hw-' + hw.id, label: lbl + ' — stage / pull', status: 'in-house', arrived: false });
    }
  });

  /* Departments — mark as needing completion */
  var d = state.depts || {};
  var deptNames = {
    deboss:   'Deboss',
    offset:   'Offset Print',
    flatbed:  'Flatbed Print',
    sewing:   'Sewing',
    woodshop: 'Wood Shop',
    metal:    'Metal Shop'
  };
  Object.keys(deptNames).forEach(function(k) {
    if (d[k]) items.push({ id: 'dept-' + k, label: deptNames[k] + ' — schedule & confirm', status: 'dept', arrived: false });
  });

  /* Interior components */
  var ic = state.interior || {};
  if (ic.cbInclude)      items.push({ id: 'int-cb',      label: 'Corners — stage / pull', status: 'in-house', arrived: false });
  if (ic.pocketsInclude) items.push({ id: 'int-pockets', label: 'Pockets — stage / pull',             status: 'in-house', arrived: false });
  if (ic.tabsInclude)    items.push({ id: 'int-tabs',    label: 'Tabs — stage / pull',                status: 'in-house', arrived: false });

  return items;
}

/* =================================================================
   PDF STATE EMBEDDING
   Generates a formatted PDF and embeds the state JSON as an attachment.
   Returns a Promise that resolves with the PDF bytes (Uint8Array).
================================================================= */
async function embedStatePDF(state, pdfType) {
  var { PDFDocument, rgb, StandardFonts } = PDFLib;

  var pdfDoc = await PDFDocument.create();
  var page   = pdfDoc.addPage([792, 1224]);
  var { width, height } = page.getSize();

  var fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  var fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  /* ── Greyscale palette ── */
  var cInk     = rgb(0.149, 0.149, 0.149);
  var cGray700 = rgb(0.267, 0.267, 0.267);
  var cGray600 = rgb(0.333, 0.333, 0.333);
  var cGray500 = rgb(0.400, 0.400, 0.400);
  var cGray400 = rgb(0.533, 0.533, 0.533);
  var cGray300 = rgb(0.667, 0.667, 0.667);
  var cGray200 = rgb(0.733, 0.733, 0.733);
  var cGray150 = rgb(0.800, 0.800, 0.800);
  var cGray100 = rgb(0.867, 0.867, 0.867);
  var cGray50  = rgb(0.933, 0.933, 0.933);
  var cGray25  = rgb(0.957, 0.957, 0.957);
  var cBand    = rgb(0.900, 0.900, 0.900);
  var cWhite   = rgb(1, 1, 1);

  /* ── Tier badge colors — only colored element ── */
  var cTier = {
    t1: { bg: rgb(0.910, 0.969, 0.941), border: rgb(0.153, 0.682, 0.376), text: rgb(0.153, 0.682, 0.376) },
    t2: { bg: rgb(0.929, 0.957, 1.000), border: rgb(0.141, 0.443, 0.639), text: rgb(0.141, 0.443, 0.639) },
    t3: { bg: rgb(1.000, 0.973, 0.882), border: rgb(0.902, 0.722, 0.000), text: rgb(0.627, 0.490, 0.000) },
    t4: { bg: rgb(0.992, 0.910, 0.910), border: rgb(0.753, 0.224, 0.169), text: rgb(0.753, 0.224, 0.169) }
  };

  var pad = 40;
  var cW  = width - pad * 2;
  var y   = height - pad;   /* start inside top margin */

  var ti = TIER_INFO[state.tierCalc] || TIER_INFO[1];
  var tc = cTier[ti.cls] || cTier.t1;

  /* ─────────────────────────────────────────────
     HEADER — white background, no dark banner
     Status shown as small pill next to title
     ───────────────────────────────────────────── */

  /* Status pill config */
  var statusLabel = { planned: 'PLANNED', reviewed: 'REVIEWED', approved: 'APPROVED' }[pdfType] || 'PLANNED';
  var statusSub   = { planned: 'Material Planning', reviewed: 'Availability Review', approved: 'Authorized for Production' }[pdfType] || '';

  /* Title */
  page.drawText('PREPRODUCTION MATERIALS LIST', { x: pad, y: y - 4, size: 18, font: fontBold, color: cInk });

  /* Status pill (right-aligned, top row) */
  var pillTxt = statusLabel;
  var pillW   = fontBold.widthOfTextAtSize(pillTxt, 8) + 14;
  var pillX   = width - pad - pillW;
  var pillY   = y + 2;
  page.drawRectangle({ x: pillX, y: pillY - 16, width: pillW, height: 16, color: cGray700 });
  page.drawText(pillTxt, { x: pillX + 7, y: pillY - 12, size: 8, font: fontBold, color: cWhite });

  /* Generation date under pill */
  var stamp = 'Generated ' + todayString();
  var stampW = fontReg.widthOfTextAtSize(stamp, 7);
  page.drawText(stamp, { x: width - pad - stampW, y: pillY - 26, size: 7, font: fontReg, color: cGray300 });

  y -= 28;

  /* Job fields row */
  var hFields = [
    { label: 'JOB ORDER #', val: state.jobOrder     || '--' },
    { label: 'QTY',         val: state.orderQty     || '--' },
    { label: "DATE REC'D",  val: state.dateReceived || '--' }
  ];
  hFields.forEach(function(f, i) {
    var fx = pad + i * 140;
    page.drawText(f.val,   { x: fx, y: y - 4,  size: 11, font: fontBold, color: cInk });
    page.drawText(f.label, { x: fx, y: y - 17, size: 7,  font: fontReg,  color: cGray400 });
  });

  y -= 28;

  /* Header bottom rule */
  page.drawLine({ start: { x: pad, y: y }, end: { x: width - pad, y: y }, thickness: 1.5, color: cInk });
  y -= 20;

  /* ─────────────────────────────────────────────
     HELPERS
     ───────────────────────────────────────────── */

  /* Section band — INSET, not edge-to-edge */
  function bandHeader(label) {
    y -= 6;
    page.drawRectangle({ x: pad, y: y - 20, width: cW, height: 20, color: cBand });
    page.drawText(label.toUpperCase(), { x: pad + 8, y: y - 14, size: 7.5, font: fontBold, color: cGray600 });
    y -= 26;
  }

  /* Item heading */
  function itemLabel(text) {
    if (y < 60) return;
    page.drawText(text, { x: pad + 6, y: y, size: 10, font: fontBold, color: cInk });
    y -= 17;
  }

  /* Spec detail row */
  function subRow(lbl, val) {
    if (y < 60 || !val) return;
    page.drawText(lbl,         { x: pad + 18, y: y, size: 8, font: fontReg, color: cGray400 });
    page.drawText(String(val), { x: pad + 130, y: y, size: 8, font: fontReg, color: cInk });
    y -= 13;
  }

  /* Separator between items in a section */
  function itemSep() {
    if (y < 60) return;
    y -= 5;
    page.drawLine({ start: { x: pad + 6, y: y }, end: { x: width - pad - 6, y: y }, thickness: 0.5, color: cGray100 });
    y -= 8;
  }

  /* Availability pill */
  function availRow(statusVal) {
    if (y < 60 || !statusVal) return;
    var labels = { 'in-house': 'In-house and available', 'ordered-in-stock': 'Ordered -- in-stock at vendor', 'not-in-stock': 'Ordered -- NOT yet in-stock' };
    var txt   = labels[statusVal] || statusVal;
    var pillW = fontBold.widthOfTextAtSize(txt, 7) + 14;
    page.drawRectangle({ x: pad + 18, y: y - 11, width: pillW, height: 13, color: cGray25, borderColor: cGray200, borderWidth: 0.75 });
    page.drawText(txt, { x: pad + 25, y: y - 9, size: 7, font: fontBold, color: cGray600 });
    y -= 19;
  }

  /* ─────────────────────────────────────────────
     COVER MATERIALS
     ───────────────────────────────────────────── */
  var hasCover = state.leatherInclude || (state.fabric && state.fabric.include);
  if (hasCover) {
    bandHeader('Cover Materials');
    if (state.leatherInclude) {
      itemLabel('Leather');
      if (pdfType !== 'planned') availRow(state.leatherStatus);
      if (state.fabric && state.fabric.include) itemSep();
    }
    var fab = state.fabric || {};
    if (fab.include) {
      itemLabel('Fabric / Cover Material');
      if (fab.category) subRow('Category:', fab.category);
      if (fab.family)   subRow('Family:',   fab.family);
      if (fab.rows && fab.rows.length > 0) {
        fab.rows.forEach(function(r) {
          if (r.vendor)      subRow('Vendor:',      r.vendor);
          if (r.productLine) subRow('Product Line:', r.productLine);
          if (r.color)       subRow('Color:',        r.color);
          if (r.decoration)  subRow('Decoration:',   r.decoration);
          if (r.qty)         subRow('Qty:',           r.qty + (r.unit ? ' ' + r.unit : ''));
        });
      } else if (fab.fields) {
        Object.keys(fab.fields).forEach(function(k) { if (fab.fields[k]) subRow(k + ':', fab.fields[k]); });
        if (fab.qty) subRow('Qty:', fab.qty + (fab.unit ? ' ' + fab.unit : ''));
      }
      if (pdfType !== 'planned') {
        availRow(fab.status);
        if ((fab.status === 'ordered-in-stock' || fab.status === 'not-in-stock') && fab.dateOrdered) subRow('Date Ordered:', fab.dateOrdered);
        if ((fab.status === 'ordered-in-stock' || fab.status === 'not-in-stock') && fab.po)          subRow('PO #:', fab.po);
      }
    }
    y -= 8;
  }

  /* ─────────────────────────────────────────────
     HARDWARE & COMPONENTS
     ───────────────────────────────────────────── */
  var activeHw = (state.hardware || []).filter(function(h) { return h.active; });
  if (activeHw.length > 0) {
    bandHeader('Hardware & Components');
    activeHw.forEach(function(hw, i) {
      var mat = HW_MATERIALS.find(function(m) { return m.id === hw.id; });
      itemLabel(mat ? mat.label : hw.id);
      if (mat && mat.fields && hw.fields) {
        mat.fields.forEach(function(f, fi) { if (hw.fields[fi]) subRow(f.ph + ':', hw.fields[fi]); });
      }
      if (pdfType !== 'planned') availRow(hw.status);
      if (i < activeHw.length - 1) itemSep();
    });
    y -= 8;
  }

  /* ─────────────────────────────────────────────
     PRODUCTION DEPARTMENTS
     ───────────────────────────────────────────── */
  var d = state.depts || {};
  var activeDepts = Object.keys(d).filter(function(k) { return d[k]; });
  if (activeDepts.length > 0) {
    bandHeader('Production Departments');
    var deptNames = { deboss: 'Deboss', offset: 'Offset Print', flatbed: 'Flatbed Print', sewing: 'Sewing', woodshop: 'Wood Shop', metal: 'Metal Shop' };
    var chipCols = 3, chipGap = 10;
    var chipW = (cW - chipGap * (chipCols - 1)) / chipCols;
    var chipH = 28, chipCol = 0, chipRowY = y;
    activeDepts.forEach(function(k) {
      var cx = pad + chipCol * (chipW + chipGap);
      var lbl = deptNames[k] || k;
      if (k === 'metal' && state.metalTippin) lbl += ' (Tippin Only)';
      page.drawRectangle({ x: cx, y: chipRowY - chipH, width: chipW, height: chipH, color: cGray25, borderColor: cGray200, borderWidth: 0.75 });
      page.drawText(lbl, { x: cx + 10, y: chipRowY - 18, size: 9, font: fontBold, color: cGray700 });
      chipCol++;
      if (chipCol >= chipCols) { chipCol = 0; chipRowY -= (chipH + chipGap); }
    });
    y = (chipCol > 0 ? chipRowY - chipH - chipGap : chipRowY) - 10;
  }

  /* ─────────────────────────────────────────────
     INTERIOR COMPONENTS
     ───────────────────────────────────────────── */
  var ic = state.interior || {};
  var hasInterior = ic.cbInclude || ic.pocketsInclude || ic.tabsInclude;
  if (hasInterior) {
    bandHeader('Interior Components');
    if (ic.cbInclude) {
      itemLabel('Black Corner Boards');
      if (ic.cbPanels) subRow('Panels:', ic.cbPanels);
      subRow('Type:', ic.cbType === 'nonstd' ? 'Non-Standard' : 'Standard');
      if (ic.pocketsInclude || ic.tabsInclude) itemSep();
    }
    if (ic.pocketsInclude) {
      itemLabel('Pockets');
      subRow('Type:', ic.pocketsType === 'nonstd' ? 'Non-Standard' : 'Standard');
      if (ic.tabsInclude) itemSep();
    }
    if (ic.tabsInclude) itemLabel('Tabs');
    y -= 8;
  }

  /* ─────────────────────────────────────────────
     LEAD TIME — due date + tier badge, both tier-colored
     ───────────────────────────────────────────── */
  bandHeader('Lead Time Assessment');
  var dueW = 130, rowH = 58, gapX = 12;
  var tierBadgeW = cW - dueW - gapX;

  page.drawRectangle({ x: pad, y: y - rowH, width: dueW, height: rowH, color: tc.bg, borderColor: tc.border, borderWidth: 1.5 });
  page.drawText('DUE DATE', { x: pad + 10, y: y - 16, size: 7, font: fontBold, color: tc.text });
  var dueVal = state.dueDateCalc || (state.dateReceived && ti.days ? addWorkdays(state.dateReceived, ti.days) : '--');
  page.drawText(String(dueVal), { x: pad + 10, y: y - 40, size: 16, font: fontBold, color: tc.text });

  var bx = pad + dueW + gapX;
  page.drawRectangle({ x: bx, y: y - rowH, width: tierBadgeW, height: rowH, color: tc.bg, borderColor: tc.border, borderWidth: 1.5 });
  page.drawText(ti.label, { x: bx + 14, y: y - 22, size: 15, font: fontBold, color: tc.text });
  page.drawText(ti.days ? ti.days + ' Work Days' : 'To be determined', { x: bx + 14, y: y - 42, size: 10, font: fontReg, color: tc.text });
  y -= rowH + 12;

  /* ─────────────────────────────────────────────
     NOTES
     ───────────────────────────────────────────── */
  if (state.notes && state.notes.trim()) {
    bandHeader('Notes');
    var nWords = state.notes.split(/\s+/);
    var nLine = '', nMaxW = cW - 12;
    nWords.forEach(function(w) {
      var test = nLine ? nLine + ' ' + w : w;
      if (fontReg.widthOfTextAtSize(test, 9) > nMaxW) {
        if (y > 60) { page.drawText(nLine, { x: pad + 6, y: y, size: 9, font: fontReg, color: cGray700 }); y -= 14; }
        nLine = w;
      } else { nLine = test; }
    });
    if (nLine && y > 60) { page.drawText(nLine, { x: pad + 6, y: y, size: 9, font: fontReg, color: cGray700 }); y -= 14; }
    y -= 8;
  }

  /* ─────────────────────────────────────────────
     CHECKLIST (reviewed / approved)
     ───────────────────────────────────────────── */
  if ((pdfType === 'reviewed' || pdfType === 'approved') && state.checklist && state.checklist.length > 0) {
    var cl = state.checklist;
    var done = cl.filter(function(i) { return i.arrived; }).length;
    bandHeader('Checklist');
    var progTxt = done + ' / ' + cl.length + ' complete';
    page.drawText(progTxt, { x: width - pad - fontBold.widthOfTextAtSize(progTxt, 8), y: y + 6, size: 8, font: fontBold, color: cGray400 });
    var sPillLabels = { 'in-house': 'In-House', 'ordered-in-stock': 'Ordered', 'not-in-stock': 'Not in Stock', 'dept': 'Dept' };
    cl.forEach(function(item) {
      if (y < 60) return;
      var cbS = 10;
      if (item.arrived) {
        page.drawRectangle({ x: pad + 6, y: y - cbS, width: cbS, height: cbS, color: cGray700 });
        page.drawLine({ start: { x: pad + 7.5, y: y - 6 },   end: { x: pad + 9.5, y: y - 4 },  thickness: 1.2, color: cWhite });
        page.drawLine({ start: { x: pad + 9.5, y: y - 4 },   end: { x: pad + 13.5, y: y - 9 }, thickness: 1.2, color: cWhite });
      } else {
        page.drawRectangle({ x: pad + 6, y: y - cbS, width: cbS, height: cbS, color: cWhite, borderColor: cGray300, borderWidth: 0.75 });
      }
      var sText = sPillLabels[item.status] || item.status;
      var sPW   = fontBold.widthOfTextAtSize(sText, 7) + 10;
      page.drawRectangle({ x: width - pad - sPW, y: y - 11, width: sPW, height: 13, color: cGray25, borderColor: cGray200, borderWidth: 0.5 });
      page.drawText(sText, { x: width - pad - sPW + 5, y: y - 9, size: 7, font: fontBold, color: cGray600 });
      page.drawText(item.label, { x: pad + 22, y: y, size: 9, font: fontReg, color: item.arrived ? cGray300 : cInk });
      y -= 19;
      page.drawLine({ start: { x: pad, y: y }, end: { x: width - pad, y: y }, thickness: 0.35, color: cGray100 });
      y -= 5;
    });
    y -= 6;
  }

  /* ─────────────────────────────────────────────
     SIGN-OFF (approved only)
     ───────────────────────────────────────────── */
  if (pdfType === 'approved' && state.signoff) {
    bandHeader('Sign-Off');
    page.drawRectangle({ x: pad, y: y - 28, width: cW, height: 28, color: cGray25, borderColor: cGray300, borderWidth: 1.25 });
    page.drawText('ALL ORDER COMPONENTS IN-HOUSE -- AUTHORIZED FOR PRODUCTION', { x: pad + 12, y: y - 18, size: 9, font: fontBold, color: cInk });
    y -= 38;
    subRow('Material Handler:', state.signoff.name || '--');
    subRow('Date:', state.signoff.date || '--');
    y -= 18;
    page.drawLine({ start: { x: pad, y: y - 20 },       end: { x: pad + 220, y: y - 20 }, thickness: 1, color: cInk });
    page.drawLine({ start: { x: pad + 240, y: y - 20 }, end: { x: pad + 340, y: y - 20 }, thickness: 1, color: cInk });
    page.drawText('Signature', { x: pad,       y: y - 30, size: 7, font: fontReg, color: cGray300 });
    page.drawText('Date',      { x: pad + 240, y: y - 30, size: 7, font: fontReg, color: cGray300 });
  }

  /* ─────────────────────────────────────────────
     EMBED STATE JSON
     ───────────────────────────────────────────── */
  var jsonStr = JSON.stringify(state);
  pdfDoc.setSubject('pp-state:' + jsonStr);
  try {
    var jsonBytes = new TextEncoder().encode(jsonStr);
    await pdfDoc.attach(jsonBytes, PDF_STATE_FILENAME, {
      mimeType: 'application/json', description: 'Preproduction form state',
      creationDate: new Date(), modificationDate: new Date()
    });
  } catch(e) { /* Non-critical */ }

  return await pdfDoc.save();
}


/* =================================================================
   PDF STATE EXTRACTION
   Supports two PDF formats:
     A) New (@media print): state is base64-encoded between %%CS%% markers
        in white text in the page body. Extracted via pdf.js (handles
        compressed content streams).
     B) Legacy (pdf-lib): state JSON is in the PDF Subject info field,
        preceded by "pp-state:".

   Returns a Promise that resolves with the parsed state object,
   or rejects if no valid state is found.
================================================================= */

/* Lazily loads pdf.js from CDN — called once, safe to call multiple times */
var _pdfjsReady = false;
function _ensurePdfJs(cb) {
  if (_pdfjsReady) { cb(); return; }
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.onload = function () {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    _pdfjsReady = true;
    cb();
  };
  s.onerror = function () { cb(new Error('Could not load PDF reader — check your internet connection.')); };
  document.head.appendChild(s);
}

function extractStateFromPDF(file) {
  return new Promise(function (resolve, reject) {
    _ensurePdfJs(function (loadErr) {
      if (loadErr) { reject(loadErr); return; }

      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read file.')); };
      reader.onload = function (ev) {
        var data = new Uint8Array(ev.target.result);

        /* ── Strategy A: %%CS%%base64%%CS%% via pdf.js text extraction ── */
        pdfjsLib.getDocument({ data: data }).promise
          .then(function (pdf) {
            var pageNums = [];
            for (var i = 1; i <= pdf.numPages; i++) pageNums.push(i);
            return Promise.all(pageNums.map(function (n) {
              return pdf.getPage(n).then(function (p) { return p.getTextContent(); });
            }));
          })
          .then(function (pages) {
            var full = pages
              .flatMap(function (p) { return p.items.map(function (it) { return it.str; }); })
              .join('');
            var m = full.match(/%%CS%%([\s\S]+?)%%CS%%/);
            if (m) {
              try {
                var json = decodeURIComponent(escape(atob(m[1].replace(/\s/g, ''))));
                resolve(JSON.parse(json));
                return;
              } catch (eA) {
                console.warn('%%CS%% decode failed:', eA.message);
              }
            }

            /* ── Strategy B: legacy pp-state: in Subject field ── */
            if (typeof PDFLib !== 'undefined') {
              PDFLib.PDFDocument.load(data.buffer, { ignoreEncryption: true })
                .then(function (pdfDoc) {
                  var subject = pdfDoc.getSubject();
                  if (subject && subject.startsWith('pp-state:')) {
                    try { resolve(JSON.parse(subject.slice(9))); return; }
                    catch (eB) { /* fall through */ }
                  }
                  reject(new Error('No state data found in this PDF. Make sure it was exported from the Preproduction tool.'));
                })
                .catch(function () {
                  reject(new Error('No state data found in this PDF. Make sure it was exported from the Preproduction tool.'));
                });
            } else {
              reject(new Error('No state data found in this PDF. Make sure it was exported from the Preproduction tool.'));
            }
          })
          .catch(function () {
            reject(new Error('Could not parse this PDF.'));
          });
      };
      reader.readAsArrayBuffer(file);
    });
  });
}

/* =================================================================
   ROLE / LOCALSTORAGE HELPERS
================================================================= */
var LS_ROLE_KEY     = 'pp_role';
var LS_JOB_PREFIX   = 'pp_job_';
var LS_ACTIVE_JOBS  = 'pp_active_jobs';

function getRole()          { return localStorage.getItem(LS_ROLE_KEY) || null; }
function setRole(role)      { localStorage.setItem(LS_ROLE_KEY, role); }

function saveJobState(jobOrder, state) {
  localStorage.setItem(LS_JOB_PREFIX + jobOrder, JSON.stringify(state));
  /* Track the list of active job IDs */
  var ids = getActiveJobIds();
  if (ids.indexOf(jobOrder) === -1) ids.push(jobOrder);
  localStorage.setItem(LS_ACTIVE_JOBS, JSON.stringify(ids));
}

function loadJobState(jobOrder) {
  var raw = localStorage.getItem(LS_JOB_PREFIX + jobOrder);
  return raw ? JSON.parse(raw) : null;
}

function getActiveJobIds() {
  var raw = localStorage.getItem(LS_ACTIVE_JOBS);
  return raw ? JSON.parse(raw) : [];
}

function removeJobState(jobOrder) {
  localStorage.removeItem(LS_JOB_PREFIX + jobOrder);
  var ids = getActiveJobIds().filter(function(id) { return id !== jobOrder; });
  localStorage.setItem(LS_ACTIVE_JOBS, JSON.stringify(ids));
}

/* =================================================================
   TRIGGER PDF DOWNLOAD
================================================================= */
function downloadPDF(bytes, filename) {
  var blob = new Blob([bytes], { type: 'application/pdf' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}
