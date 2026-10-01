/* =====================================================================
   CATALOG FOLDER — 00-PL-PC
   ---------------------------------------------------------------------
   Saves Reference Data straight into data/catalog.js on disk, so edits
   are real the moment they are made instead of waiting for an export.
   Same pattern as the Product Management Tool's vault save file:

     - Connect a folder once (File System Access API, Chrome / Edge).
       The handle is kept in IndexedDB, so a reload only needs a click
       to re-grant access, not a re-pick.
     - Autosave: 1.5s after the last edit, never later than 10s after
       the first unsaved one. ⌘S saves now.
     - Conflict check: before every write the file's CATALOG_VERSION is
       read back. If it is not the version this page last loaded or
       wrote, something else changed the file (a git pull, another tab)
       and autosave stops and asks instead of overwriting.

   Pick either the Product Configurator folder (the file is found at
   data/catalog.js) or the data folder itself.

   No DOM in here. The page renders `state` however it likes and passes
   in what to write.

   USAGE
     import { createCatalogSaver } from './catalog-folder.js';
     const saver = createCatalogSaver({
       serialize:   () => STORE.serialize(),          // text to write
       baseVersion: () => STORE.baselineVersion,      // version on disk
       rebase:      () => STORE.rebase(),             // after a write
       isDirty:     () => STORE.pending().total > 0,
       onState:     state => render(state),
     });
     await saver.restore();     // on boot
     saver.connect();           // from a click — picker or re-grant
     saver.schedule();          // after every edit
     saver.saveNow();           // ⌘S
     saver.overwrite();         // resolve a conflict in this tab's favour
   ===================================================================== */

const IDB_NAME = 'plpc-catalog-folder';
const IDB_STORE = 'handles';
const IDB_KEY = 'dir';
const AUTOSAVE_IDLE = 1500, AUTOSAVE_MAX = 10000;

/* ------------------------------------------------------- IndexedDB */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet() {
  try {
    const db = await idb();
    return await new Promise(res => {
      const q = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    });
  } catch { return null; }
}
async function idbSet(v) {
  try {
    const db = await idb();
    await new Promise(res => {
      const t = db.transaction(IDB_STORE, 'readwrite');
      t.objectStore(IDB_STORE).put(v, IDB_KEY);
      t.oncomplete = res; t.onerror = res;
    });
  } catch { /* the folder still works this session; it just won't be remembered */ }
}

/* --------------------------------------------------- file helpers */
/* The Product Configurator folder holds data/catalog.js; the data
   folder holds catalog.js. Either is accepted. */
async function findCatalog(dir) {
  try { const d = await dir.getDirectoryHandle('data'); return { file: await d.getFileHandle('catalog.js'), path: dir.name + '/data/catalog.js' }; }
  catch { /* not the project folder */ }
  try { return { file: await dir.getFileHandle('catalog.js'), path: dir.name + '/catalog.js' }; }
  catch { return null; }
}
/* The version line the serialiser writes: export const CATALOG_VERSION = "162aebe"; */
export function versionOf(text) {
  const m = /CATALOG_VERSION\s*=\s*["']([^"']+)["']/.exec(text || '');
  return m ? m[1] : null;
}
async function readVersion(file) {
  return versionOf(await (await file.getFile()).text());
}

/* --------------------------------------------------------- saver */
export function createCatalogSaver({ serialize, baseVersion, rebase, isDirty, onState = () => {} }) {
  const state = {
    supported: typeof window !== 'undefined' && !!window.showDirectoryPicker,
    dir: null, file: null, path: '',
    needsPermission: false,
    saving: false, lastSavedAt: 0,
    autosave: true,
    conflict: null,          // { diskVersion } when the file moved underneath us
    error: '',
  };
  let timer = null, firstAt = 0;
  const emit = () => { try { onState({ ...state, connected: connected(), dirty: isDirty() }); } catch {} };
  const connected = () => !!state.file && !state.needsPermission;

  async function attach(dir) {
    const found = await findCatalog(dir);
    if (!found) {
      state.error = `No data/catalog.js in “${dir.name}”. Pick the Product Configurator folder.`;
      emit(); return false;
    }
    state.dir = dir; state.file = found.file; state.path = found.path;
    state.needsPermission = false; state.error = '';
    await checkDisk();
    emit();
    if (!state.conflict) schedule();
    return true;
  }

  /* Is the file on disk the one this page is working from? */
  async function checkDisk() {
    try {
      const v = await readVersion(state.file);
      state.conflict = v && v !== baseVersion() ? { diskVersion: v } : null;
    } catch (e) { state.error = e.message; }
  }

  /* On boot: reuse the remembered folder if the browser still allows it. */
  async function restore() {
    if (!state.supported) { emit(); return; }
    const dir = await idbGet();
    if (!dir) { emit(); return; }
    state.dir = dir;
    let perm = 'prompt';
    try { perm = await dir.queryPermission({ mode: 'readwrite' }); } catch {}
    if (perm === 'granted') await attach(dir);
    else { state.needsPermission = true; emit(); }
  }

  /* From a click. Re-grant a remembered folder, or pick a new one. */
  async function connect({ pick = false } = {}) {
    if (!state.supported) return;
    try {
      if (state.dir && state.needsPermission && !pick) {
        const p = await state.dir.requestPermission({ mode: 'readwrite' });
        if (p === 'granted') { await attach(state.dir); return; }
      }
      const dir = await window.showDirectoryPicker({ id: 'plpc-catalog', mode: 'readwrite' });
      if (await attach(dir)) await idbSet(dir);
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // picker closed
      state.error = e.message; emit();
    }
  }

  function schedule() {
    emit();
    if (!state.autosave || state.conflict || state.saving || !connected()) return;
    if (!isDirty()) { clearTimeout(timer); timer = null; firstAt = 0; return; }
    const now = Date.now();
    if (!firstAt) firstAt = now;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; firstAt = 0; save(); },
      Math.max(0, Math.min(AUTOSAVE_IDLE, firstAt + AUTOSAVE_MAX - now)));
  }

  async function save({ force = false } = {}) {
    if (state.saving || !connected() || (!isDirty() && !force)) return false;
    state.saving = true; emit();
    try {
      if (!force) {
        await checkDisk();
        if (state.conflict) { state.saving = false; emit(); return false; }
      }
      const w = await state.file.createWritable();
      await w.write(serialize());
      await w.close();
      rebase();                       // the file is the new baseline
      state.conflict = null; state.error = '';
      state.lastSavedAt = Date.now();
      state.saving = false; emit();
      return true;
    } catch (e) {
      state.saving = false; state.autosave = false;
      state.error = e.message || 'Could not write the file.';
      emit(); return false;
    }
  }

  async function flush() {
    if (!timer) return;
    clearTimeout(timer); timer = null; firstAt = 0;
    await save();
  }

  /* Leaving the tab is the last chance to get an edit onto disk. */
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('pagehide', () => { flush(); });
  }

  return {
    get state() { return { ...state, connected: connected(), dirty: isDirty() }; },
    restore, connect, schedule, flush,
    saveNow: () => { state.autosave = true; return save(); },
    overwrite: () => { state.conflict = null; state.autosave = true; return save({ force: true }); },
    pauseAutosave: () => { state.autosave = false; clearTimeout(timer); timer = null; emit(); },
  };
}
