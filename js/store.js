/* Persistence layer. Everything goes through load() and save(), so this
   file is the only one to change when a backend is added later. */
(function () {
  const KEY = 'tcd-understand:v1';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function valid(s) {
    return s && typeof s === 'object' &&
      Array.isArray(s.readings) && Array.isArray(s.homework) &&
      Array.isArray(s.classes) && Array.isArray(s.dates);
  }

  function normalise(s) {
    const seed = window.SEED;
    s.version = 1;
    s.term = Object.assign({}, seed.term, s.term || {});
    s.settings = Object.assign({ theme: 'system' }, s.settings || {});
    ['readings', 'homework'].forEach(function (k) {
      s[k].forEach(function (it) {
        it.status = ['todo', 'doing', 'done'].includes(it.status) ? it.status : 'todo';
        it.schedule = it.schedule || {};
        it.recurring = it.recurring !== false;
        it.dueOffset = Number.isFinite(it.dueOffset) ? it.dueOffset : 6;
        it.dueDate = it.dueDate || '';
      });
    });
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (valid(s)) return normalise(s);
      }
    } catch (e) { /* fall through to seed */ }
    const s = clone(window.SEED);
    s.weekOf = D.mondayOf(D.today());
    return normalise(s);
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

  window.Store = { load, save, valid, normalise, clone, KEY };
})();
