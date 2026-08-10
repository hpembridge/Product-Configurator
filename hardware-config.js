/* =====================================================================
   HARDWARE_TYPES — consolidated hardware reference for 00-PL-PC
   ---------------------------------------------------------------------
   Pulled from BLC, which carries the most complete hardware definitions
   of the three tools. BLC actually has TWO hardware configs that had
   drifted apart, so this merges them:

     - planner.html  -> HW_PLANNER_CONFIG   real option lists (part
                        numbers, colors, sizes). The valuable one.
     - reference/shared.js -> HW_MATERIALS  field labels + print column
                        widths, but every option list is missing.
                        coordinator.html reads this one, which is why
                        the Coordinator screen has no autocomplete.

   Where the two disagreed on field labels, planner.html wins — its
   labels are the ones attached to real option data.

   MCS's BINDING config contributed two fields BLC never had (see
   screw-posts below). Everything else in MCS was a thinner subset.

   Shape mirrors CATEGORY_SCHEMAS in material-import.html:
     id       stable key, also the Firestore doc id if these get stored
     label    what Creative sees
     qtyLabel unit for the quantity column (per-each unless noted)
     fields   descriptive attributes; options[] drives the datalist
     source   which tool the definition came from
     note     anything a human needs to decide or verify

   Options are SUGGESTIONS, not a closed list — every field stays
   free-text so a one-off doesn't block a job, same rule as materials.
   ===================================================================== */

const HARDWARE_TYPES = [
  {
    id: 'magnets', label: 'Magnets', qtyLabel: 'Qty',
    source: 'BLC planner',
    fields: [
      { id: 'desc', label: 'Description', options: [
        'BX081-N52 — 1/2" × 1" | 1/16" thick',
        'D62-N52 — 3/8" round | 1/8" thick',
      ] },
    ],
    note: 'shared.js splits this into Color/Style + Size; planner keeps one Description holding the part number. Kept as one field — the part number is what actually gets ordered.',
  },
  {
    id: 'elastic-cords', label: 'Elastic Cords / Loops', qtyLabel: 'Qty',
    source: 'BLC planner',
    fields: [
      { id: 'color',  label: 'Color',  options: ['Black', 'Gold', 'White'] },
      { id: 'style',  label: 'Style',  options: ['Silver Barb', 'Gold Barb', 'Silver Ball', 'Gold Ball'] },
      { id: 'length', label: 'Length', options: ['5"', '5.5"', '6"', '6.5"', '7.5"', '8"', '8.5"', '9"', '9.5"', '10"', '11"'] },
    ],
  },
  {
    id: 'eyelets', label: 'Eyelets', qtyLabel: 'Qty',
    source: 'BLC planner',
    fields: [
      { id: 'size',  label: 'Size',  options: ['3/16"', '1/4"'] },
      { id: 'color', label: 'Color', options: ['Brass', 'Nickel', 'Black', 'Copper'] },
    ],
    note: 'MCS bundles eyelets under "Menu Cord" as a sub-field. Here they stay their own line item — they are ordered and pulled separately. See the menu-cord entry below.',
  },
  {
    id: 'o-rings', label: 'O-Rings', qtyLabel: 'Qty',
    source: 'BLC planner',
    fields: [{ id: 'desc', label: 'Description' }],
    note: 'Free text in both tools — no option list exists anywhere. Candidate for Dave/Tim to enumerate.',
  },
  {
    id: 'ring-binder', label: 'Ring Binder', qtyLabel: 'Qty',
    source: 'BLC planner',
    fields: [
      { id: 'model', label: 'Model', options: [
        '2-ring — 0916-3102',
        '3-ring — 15mm short — STR212-3-13',
        '3-ring — 15mm long — STR277-3-13',
        '3-ring — 1/2" short — IM85N',
        '3-ring — 1/2" long — 0905-7101',
        '3-ring — 3/4" short — IN87N',
        '3-ring — 3/4" long — 0975-7101',
      ] },
    ],
    note: 'shared.js exposes separate "# of Rings" and "Color" columns; planner folds both into the model string. Model wins — ring count is implied by it and colour was never populated.',
  },
  {
    id: 'bands', label: 'Bands', qtyLabel: 'Qty',
    source: 'BLC planner',
    fields: [
      { id: 'color', label: 'Color', options: ['Black', 'Blue', 'Red', 'Orange', 'White'] },
      { id: 'size',  label: 'Size',  options: ['106', '35A', '74'] },
    ],
  },
  {
    id: 'clips', label: 'Clips', qtyLabel: 'Qty',
    source: 'BLC planner',
    fields: [
      { id: 'color', label: 'Color', options: ['Black', 'Antique Brass', 'Nickel'] },
    ],
  },
  {
    id: 'rowmark', label: 'Rowmark', qtyLabel: 'Sheet Qty',
    source: 'BLC planner',
    fields: [
      { id: 'size',      label: 'Size' },
      { id: 'color',     label: 'Color' },
      { id: 'thickness', label: 'Thickness' },
    ],
    note: 'ID CHANGED: both BLC configs spell this "romark". Corrected here — nothing depends on the old spelling in a fresh database. Counted in sheets, not each. Engraved/laser-cut work on Rowmark (and on acrylic, rockboard, wood) is what raises the woodshop department flag, so this line feeds tier escalation. No option lists exist yet.',
  },
  {
    id: 'rivets', label: 'Rivets', qtyLabel: 'Qty',
    source: 'BLC planner',
    fields: [{ id: 'desc', label: 'Description' }],
    note: 'shared.js has qty only, no description field at all. Planner is the more complete of the two.',
  },
  {
    id: 'plastic-sleeves', label: 'Plastic Sleeves', qtyLabel: 'Qty',
    source: 'BLC planner',
    fields: [
      { id: 'type', label: 'Type / Size', options: [
        '3-Hole 8.5×11 Stock', '3-Hole 8.5×14', 'Spiral', 'Custom',
      ] },
    ],
  },
  {
    id: 'snaps', label: 'Snaps', qtyLabel: 'Qty',
    source: 'BLC planner',
    fields: [
      { id: 'line', label: 'Line', options: ['20', '24'] },
      { id: 'type', label: 'Type / Finish', options: [
        'Black (9mm)', 'Shiny Brass Plate', 'Gun Metal Matte', 'Shiny Nickel Plate',
        'Antique Brass Plate', 'Antique Nickel Plate', 'Antique Copper Plate', 'Themed',
      ] },
    ],
  },
  {
    id: 'screw-posts', label: 'Screw Posts', qtyLabel: 'Qty',
    source: 'BLC planner + MCS',
    fields: [
      { id: 'color', label: 'Color', options: ['Aluminum', 'Antique Brass', 'Bronze', 'Black'] },
      { id: 'size',  label: 'Size',  options: ['1/8"', '3/16"', '1/4"', '3/8"', '1/2"', '5/8"'] },
      { id: 'distanceApart', label: 'Distance Apart' },
      { id: 'application',   label: 'Application' },
    ],
    note: 'The only place MCS beat BLC. MCS carries "Distance Apart" and an "Application" field with a MECH toggle that swaps the input to an interior-material picker. Both pulled in; the MECH conditional is UI behaviour to reimplement, not data.',
  },
  {
    id: 'menu-cord', label: 'Menu Cord', qtyLabel: 'Qty',
    source: 'MCS',
    fields: [
      { id: 'cord', label: 'Cord' },
    ],
    note: 'NEEDS A DECISION. Exists only in MCS (BINDING.cord), where it pairs a Cord field with an Eyelets field. BLC has no cord line at all — closest is elastic-cords. Ask Colin on 8/11 whether menu cord is genuinely distinct from elastic cord, or whether MCS is just naming the same thing differently. If distinct, it needs an option list. Provisional until then.',
  },
  {
    id: 'custom-hardware', label: 'Custom Hardware', qtyLabel: 'Qty',
    source: 'BLC planner',
    fields: [{ id: 'desc', label: 'Description' }],
    note: 'The free-text escape hatch. Job-local by definition — never enters a shared hardware catalog.',
  },
];

/* Availability status — from shared.js STATUS_OPTS. Bindery-owned field.
   Drives the "ordered, not yet in stock" escalation. */
const HARDWARE_STATUS = [
  { value: 'in-house',         label: 'In-house and available' },
  { value: 'ordered-in-stock', label: 'Ordered — in-stock at vendor' },
  { value: 'not-in-stock',     label: 'Ordered — NOT yet in-stock' },
];

/* Total qty = per-each qty × order qty (BLC planner's updateHwTotals).
   Rowmark is the exception — sheets are figured, not multiplied per menu. */

const HARDWARE_MAP = Object.fromEntries(HARDWARE_TYPES.map(h => [h.id, h]));

export { HARDWARE_TYPES, HARDWARE_STATUS, HARDWARE_MAP };
