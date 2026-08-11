/* =====================================================================
   CATALOG STORE — 00-PL-PC
   ---------------------------------------------------------------------
   An in-memory catalog with a Firestore-shaped facade in front of it.

   WHY A FACADE INSTEAD OF A REWRITE
   material-import.html talks to Firestore through exactly one seam:
     S.fb = fs;  S.db = getFirestore(app);
   and then uses a small, consistent slice of the API — collection, doc,
   getDocs, query, where, writeBatch, setDoc, deleteDoc, serverTimestamp.
   Swapping what sits behind that seam converts the whole tool to the file
   backend with a handful of changed lines instead of a rewrite of eight
   call sites, which is both less work and far less risk in a 2,700-line
   file whose diff logic is the valuable part.

   THE ONE BEHAVIOURAL CHANGE THAT MATTERS
   Firestore writes were durable the instant they committed. These are NOT.
   Every write lands in memory and in a localStorage draft; nothing reaches
   disk until someone exports catalog.js and commits it. That is inherent
   to the file model, not an implementation shortcut — so the caller MUST
   surface pending-change state prominently. `pending()` exists for that.

   TWO CONSEQUENCES WORTH KNOWING
   - The draft is per-browser. Two people editing the catalog at once will
     produce divergent drafts and whoever commits last wins. Firestore
     merged concurrent edits; a file cannot.
   - Deletes really delete. Job records store ids that point in here, so a
     removed record makes a job render "no longer exists in reference
     data". removedIds() reports them so the export can say so out loud.
   ===================================================================== */

import { build, emit, clean } from './catalog-serialize.js';

const DRAFT_KEY = 'plpc_catalog_draft';

/* Firestore collection name → the array on the catalog bundle.
   `settings` is special: one document, `offsets`, holding byBindingType. */
const COLL = {
  materials: 'materials', hardware: 'hardware', decorations: 'decorations',
  departments: 'departments', escalation: 'escalation',
  materialCategories: 'materialCategories',
};

const deep = o => JSON.parse(JSON.stringify(o));

export function createStore(catalog, { onChange } = {}) {
  /* Baseline is the file as shipped — never mutated. Everything the tool
     changes happens to `work`, and the difference between the two is what
     the user has staged but not yet committed. */
  const baseline = {
    materials: deep(catalog.materials || []),
    hardware: deep(catalog.hardware || []),
    decorations: deep(catalog.decorations || []),
    departments: deep(catalog.departments || []),
    escalation: deep(catalog.escalation || []),
    materialCategories: deep(Object.values(catalog.matcats || {})),
    offsets: deep(catalog.offsets || {}),
  };
  let work = deep(baseline);
  const removed = { };   // collection -> Set of ids removed

  /* ------------------------------------------------------------- draft */
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ base: catalog.version, work, at: Date.now() })); }
    catch (e) { /* quota — the in-memory copy is still correct */ }
    /* Fires on every mutation so the caller can keep "N unsaved changes" honest.
       Routed through here rather than left to call sites because a missed call
       site would show a clean state over a dirty catalog — the exact failure
       that loses someone's afternoon of edits. */
    if (onChange) { try { onChange(); } catch {} }
  }
  function loadDraft() {
    let d; try { d = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; }
    if (!d || !d.work) return null;
    /* A draft taken against a different catalog version cannot be safely
       replayed — the file moved underneath it. Report it rather than
       silently resurrecting edits onto data the user has since replaced. */
    if (d.base !== catalog.version) return { stale: true, base: d.base, at: d.at };
    work = d.work;
    return { stale: false, at: d.at };
  }
  const discardDraft = () => { work = deep(baseline); Object.keys(removed).forEach(k => delete removed[k]);
                               try { localStorage.removeItem(DRAFT_KEY); } catch {} };

  /* --------------------------------------------------------- accessors */
  const list = name => {
    if (name === 'settings') return [{ id: 'offsets', byBindingType: work.offsets }];
    return work[COLL[name]] || [];
  };
  const findIdx = (name, id) => list(name).findIndex(r => r.id === id);

  function put(name, id, payload, merge) {
    if (name === 'settings') {
      if (id === 'offsets') work.offsets = merge ? { ...work.offsets, ...(payload.byBindingType || {}) }
                                                 : (payload.byBindingType || {});
      saveDraft(); return;
    }
    const arr = work[COLL[name]];
    if (!arr) return;
    const i = arr.findIndex(r => r.id === id);
    const body = clean({ ...payload });          // drops metadata + timestamp sentinels
    if (i < 0) arr.push({ id, ...body });
    else arr[i] = merge ? { ...arr[i], ...body, id } : { id, ...body };
    if (removed[name]) removed[name].delete(id);
    saveDraft();
  }

  function remove(name, id) {
    const arr = work[COLL[name]];
    if (!arr) return;
    const i = arr.findIndex(r => r.id === id);
    if (i >= 0) arr.splice(i, 1);
    (removed[name] = removed[name] || new Set()).add(id);
    saveDraft();
  }

  /* ------------------------------------------------------ change report */
  function pending() {
    const out = { total: 0, byCollection: {}, removed: {} };
    Object.keys(COLL).forEach(name => {
      const b = new Map(baseline[COLL[name]].map(r => [r.id, JSON.stringify(r)]));
      const w = new Map(list(name).map(r => [r.id, JSON.stringify(r)]));
      let added = 0, changed = 0, gone = 0;
      w.forEach((v, k) => { if (!b.has(k)) added++; else if (b.get(k) !== v) changed++; });
      b.forEach((_, k) => { if (!w.has(k)) gone++; });
      if (added || changed || gone) {
        out.byCollection[name] = { added, changed, removed: gone };
        out.total += added + changed + gone;
      }
    });
    if (JSON.stringify(baseline.offsets) !== JSON.stringify(work.offsets)) {
      out.byCollection.offsets = { added: 0, changed: 1, removed: 0 }; out.total++;
    }
    Object.keys(removed).forEach(k => { if (removed[k].size) out.removed[k] = [...removed[k]]; });
    return out;
  }

  const snapshot = () => deep(work);
  const serialize = () => emit(build(work));
  const version = () => build(work).version;

  /* ============================================================
     THE FACADE — enough of the Firestore modular API for this tool.
     Refs are plain descriptors; nothing here talks to a network.
     ============================================================ */
  const collection = (_db, name) => ({ __coll: name });
  const doc = (_db, name, id) => ({ __coll: name, __id: id });
  const where = (field, op, value) => ({ field, op, value });
  const query = (ref, ...cs) => ({ __coll: ref.__coll, __where: cs });

  const matches = (r, cs) => (cs || []).every(c => {
    if (c.op === '==') return r[c.field] === c.value;
    if (c.op === '!=') return r[c.field] !== c.value;
    if (c.op === 'in') return Array.isArray(c.value) && c.value.includes(r[c.field]);
    return true;   // unsupported operator — do not silently filter everything out
  });

  async function getDocs(ref) {
    const rows = list(ref.__coll).filter(r => matches(r, ref.__where));
    return {
      size: rows.length,
      empty: rows.length === 0,
      docs: rows.map(r => ({ id: r.id, data: () => { const { id, ...rest } = r; return deep(rest); } })),
      forEach(fn) { this.docs.forEach(fn); },
    };
  }

  async function setDoc(ref, payload, opts = {}) { put(ref.__coll, ref.__id, payload, !!opts.merge); }
  async function deleteDoc(ref) { remove(ref.__coll, ref.__id); }

  function writeBatch() {
    const ops = [];
    return {
      set(ref, payload, opts = {}) { ops.push(['set', ref, payload, !!opts.merge]); return this; },
      update(ref, payload) { ops.push(['set', ref, payload, true]); return this; },
      delete(ref) { ops.push(['del', ref]); return this; },
      async commit() {
        ops.forEach(([kind, ref, payload, merge]) =>
          kind === 'del' ? remove(ref.__coll, ref.__id) : put(ref.__coll, ref.__id, payload, merge));
      },
    };
  }

  /* Kept so callers can go on writing `updatedAt: serverTimestamp()` without
     change. The sentinel is recognised and dropped by clean() — the catalog
     file carries no timestamps by design. */
  const serverTimestamp = () => ({ __serverTimestamp: true });

  return {
    // facade — assign to S.fb, with any truthy value as S.db
    fb: { collection, doc, where, query, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp },
    db: { __catalogStore: true },
    // store API
    list, put, remove, pending, snapshot, serialize, version,
    baselineVersion: catalog.version,
    loadDraft, saveDraft, discardDraft,
    removedIds: () => { const o = {}; Object.keys(removed).forEach(k => { if (removed[k].size) o[k] = [...removed[k]]; }); return o; },
  };
}
