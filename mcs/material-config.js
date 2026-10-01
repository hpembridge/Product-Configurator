/**
 * material-config.js
 *
 * All material category and field definitions for the Menu Construction Sheet.
 * Edit this file to add/remove categories, change field labels, or update autocomplete lists.
 *
 * Top-level shape:
 *   MATERIAL_CONFIG.categories        — ordered list of all category names
 *   MATERIAL_CONFIG.interiorFunctions — multi-select options for the interior Function column
 *   MATERIAL_CONFIG.fields[catName]   — per-category config:
 *     {
 *       interior:      bool      — true = appears in interior category dropdown; false = ext only
 *       printTemplate: function  — receives object of { fieldId: value } strings;
 *                                  returns formatted string shown on print in place of inputs
 *       inputs:        array     — field definitions for the Material column:
 *         {
 *           id:           string    — unique key within this category (used for state capture)
 *           placeholder:  string    — input placeholder text (acts as label)
 *           autocomplete: string[]  (optional) freeform input with autocomplete suggestions
 *           type: 'decoration'      (optional) renders as a button that reveals an input on click
 *         }
 *     }
 */

var MATERIAL_CONFIG = {

  /* ─── INTERIOR FUNCTION OPTIONS ─────────────────────────────────
     Multi-select choices shown in the Function column of interior rows.
  ─────────────────────────────────────────────────────────────────── */
  interiorFunctions: [
    'Liner',
    'Panels',
    'Pockets',
    'CC Slot',
    'Pen Loop', 
    'Other'
  ],

  /* ─── CATEGORY LIST ──────────────────────────────────────────────
     Ordered list of all categories. Controls dropdown order.
     Exterior uses all; interior uses only those with interior: true.
  ─────────────────────────────────────────────────────────────────── */
  categories: [
    'Bookcloth',
    'Wood',
    'Rockboard',
    'Metal',
    'Leather',
    'Acrylic',
    'Carbonite',
    '4C Litho',
    'Other'
  ],

  /* ─── FIELD DEFINITIONS ──────────────────────────────────────────
     One entry per category.
  ─────────────────────────────────────────────────────────────────── */
  fields: {

    Bookcloth: {
      interior: true,
      printTemplate: function(v) {
        return [v.vendor, v.productLine, v.color, v.decoration].filter(Boolean).join(' ');
      },
      inputs: [
        {
          id: 'vendor',
          placeholder: 'Vendor',
          autocomplete: [
            'Majilite',
            'LBS',
            'Fifield',
            'KFL Synt3',
          ]
        },
        {
          id: 'productLine',
          placeholder: 'Product Line'
        },
        {
          id: 'color',
          placeholder: 'Color'
        },
        {
          id: 'decoration',
          placeholder: 'Decoration',
          type: 'decoration'
        }
      ]
    },

    Wood: {
      interior: false,
      printTemplate: function(v) {
        var s = v.type || '';
        if (v.finish) s += ' — finish: ' + v.finish;
        return s;
      },
      inputs: [
        {
          id: 'type',
          placeholder: 'Type',
          autocomplete: [
            'Russian Birch',
            'Bamboo',
            'Oak',
            'Other'
          ]
        },
        {
          id: 'finish',
          placeholder: 'Finish'
        }
      ]
    },

    Rockboard: {
      interior: false,
      printTemplate: function(v) {
        return v.color || '';
      },
      inputs: [
        {
          id: 'color',
          placeholder: 'Color',
          autocomplete: [
            'CMRB Ash',
            'CMRB Begonia',
            'CMRB Black',
            'CMRB Blue Brush',
            'CMRB Breeze',
            'CMRB Brown',
            'CMRB Bullion',
            'CMRB Carribean',
            'CMRB Cherry',
            'CMRB Covered Bridge',
            'CMRB Croquet',
            'CMRB Dino',
            'CMRB Grey Brush',
            'CMRB Grey Linen',
            'CMRB Himalayan',
            'CMRB Lathe',
            'CMRB Maple',
            'CMRB Midnight',
            'CMRB Ocean',
            'CMRB Pavement',
            'CMRB Pineapple',
            'CMRB Red',
            'CMRB RedTrexx',
            'CMRB Scworill',
            'CMRB Slate',
            'CMRB Snow Owl',
            'CMRB Stainless',
            'CMRB Storm',
            'CMRB Tan',
            'CMRB Thickett',
            'CMRB Timber',
            'CMRB Tuscan Marble',
            'CMRB Walnut',
            'CMRB White Speckle',
            'CMRB White White',
            'CMRB Yellow'
          ]
        }
      ]
    },

    Metal: {
      interior: false,
      printTemplate: function(v) {
        var s = v.type || '';
        if (v.finish) s += ' — finish: ' + v.finish;
        return s;
      },
      inputs: [
        {
          id: 'type',
          placeholder: 'Type',
          autocomplete: [
            'Aluminum',
            'Copper',
            'Brass'
          ]
        },
        {
          id: 'finish',
          placeholder: 'Finish',
          autocomplete: [
            'Plain',
            'Brushed',
            'Regular Dip',
            'Dip with Patina'
          ]
        }
      ]
    },

    Leather: {
      interior: false,
      printTemplate: function(v) {
        return [v.productLine, v.weight, v.color, v.id].filter(Boolean).join(' ');
      },
      inputs: [
        {
          id: 'productLine',
          placeholder: 'Product Line',
          autocomplete: [
            'Water Buffalo',
            'Matte Chrome Tanned Water Buffalo',
            'Chrome Tanned Water Buffalo',
            'Bridle',
            'Western Crunch',
            'Oil Tan',
            'Pioneer Chrome Tan',
            'Mellowtan',
            'Roughman',
            'Napa Excel'
          ]
        },
        {
          id: 'weight',
          placeholder: 'Weight',
          autocomplete: [
            '2/3 oz.',
            '3/4 oz.',
            '4/5 oz.',
            '5/6 oz.',
            '6/7 oz.',
            '8/9 oz.',
            '9/10 oz.'
          ]
        },
        {
          id: 'color',
          placeholder: 'Color'
        },
        {
          id: 'id',
          placeholder: 'ID'
        }
      ]
    },

    Acrylic: {
      interior: false,
      printTemplate: function(v) {
        return [v.type, v.color].filter(Boolean).join(' ');
      },
      inputs: [
        { id: 'type', placeholder: 'Type' },
        { id: 'color', placeholder: 'Color' }
      ]
    },

    Carbonite: {
      interior: false,
      printTemplate: function(v) {
        return [v.carbonite];
      },
      inputs: [
        { id: 'carbonite', placeholder: 'Carbonite' },
      ]
    },

    '4C Litho': {
      interior: true,
      printTemplate: function(v) {
        return [v.type, v.finish].filter(Boolean).join(' / ');
      },
      inputs: [
        { id: 'type',   placeholder: 'Type'  },
        { id: 'finish', placeholder: 'Finish' },
      ]
    },

    Other: {
      interior: true,
      printTemplate: function(v) {
        return [v.other];
      },
      inputs: [
        { id: 'other', placeholder: 'Describe the Material' },
      ]
    },
  }
};
