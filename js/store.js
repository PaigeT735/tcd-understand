/* Persistence layer. Everything goes through load() and save(), so this
   file is the only one to change when a backend is added later. */
(function () {
  const KEY = 'tcd-understand:v1'; // storage key kept so existing data carries over
  const TASKS = ['readings', 'homework'];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function valid(s) {
    return !!s && typeof s === 'object' &&
      Array.isArray(s.readings) && Array.isArray(s.homework) &&
      Array.isArray(s.classes) && Array.isArray(s.dates);
  }

  function cleanRepeat(r) {
    if (!r || typeof r !== 'object') return null;
    return {
      preset: r.preset || 'custom',
      freq: ['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq) ? r.freq : 'weekly',
      interval: Math.max(1, parseInt(r.interval, 10) || 1),
      days: Array.isArray(r.days) ? r.days.filter(function (d) { return d >= 0 && d <= 6; }) : [],
      until: D.isValid(r.until) ? r.until : ''
    };
  }

  // Version 1 stored a single "weekOf" and a recurring flag per item.
  function fromV1(s) {
    const seed = window.SEED;
    const today = D.today();
    const weekOf = D.isValid(s.weekOf) ? s.weekOf : D.mondayOf(today);
    const sameWeek = weekOf === D.mondayOf(today);
    TASKS.forEach(function (k) {
      s[k] = s[k].map(function (it) {
        const isSeed = String(it.id).indexOf('-') > 0;
        const n = {
          id: it.id, name: it.name || '', module: it.module || '',
          source: it.source || '', details: it.details || '', schedule: it.schedule || {},
          status: it.status || 'todo', statusOn: '',
          kind: k === 'readings' ? 'reading' : (/math|stat/i.test(it.module || '') ? 'maths' : 'hw'),
          subject: '', start: '', due: '', dueOffset: 0, startOffset: null, anchor: '', repeat: null
        };
        if (n.kind === 'maths') n.subject = 'Math';
        if (it.recurring !== false) {
          const monday = isSeed ? seed.term.start : weekOf;
          n.repeat = { preset: 'weekly', freq: 'weekly', interval: 1, days: [], until: isSeed ? seed.term.repeatUntil : '' };
          if (n.kind === 'maths') {
            n.dueOffset = 7;                       // due Tuesday, not Monday
            n.anchor = D.addDays(monday, 1);
            if (isSeed) n.source = n.source.replace('following Monday', 'following Tuesday');
          } else {
            n.dueOffset = Number.isFinite(it.dueOffset) ? it.dueOffset : 6;
            n.anchor = monday;
          }
        } else {
          n.due = D.isValid(it.dueDate) ? it.dueDate : D.addDays(weekOf, 6);
        }
        if (sameWeek) n.statusOn = R.current(n, k, today).due;
        return n;
      });
    });
    s.dates.forEach(function (d) { d.repeat = null; });
    s.classes.forEach(function (c) {
      (c.components || []).forEach(function (p) {
        if (c.id === 'c-maths' && p.note === 'Due Mondays') p.note = 'Due Tuesdays';
      });
    });
    s.events = [];
    s.lastSeen = today;
    delete s.weekOf;
    s.version = 2;
    return s;
  }

  function normalise(s) {
    const seed = window.SEED;
    if (s.version !== 2) s = fromV1(s);
    s.term = Object.assign({}, seed.term, s.term || {});
    s.settings = Object.assign({ theme: 'system' }, s.settings || {});
    s.events = Array.isArray(s.events) ? s.events : [];
    s.order = s.order && typeof s.order === 'object' ? s.order : {};
    TASKS.forEach(function (k) {
      if (!Array.isArray(s.order[k])) delete s.order[k];
      else s.order[k] = s.order[k].filter(function (id) { return typeof id === 'string'; });
    });
    TASKS.forEach(function (k) {
      s[k] = s[k].filter(function (it) { return it && it.id; });
      s[k].forEach(function (it) {
        it.status = ['todo', 'doing', 'done'].includes(it.status) ? it.status : 'todo';
        it.statusOn = it.statusOn || '';
        it.schedule = it.schedule || {};
        it.kind = ['reading', 'hw', 'maths'].includes(it.kind) ? it.kind : (k === 'readings' ? 'reading' : 'hw');
        it.subject = it.subject || '';
        it.start = D.isValid(it.start) ? it.start : '';
        it.repeat = cleanRepeat(it.repeat);
        it.dueOffset = Number.isFinite(it.dueOffset) ? it.dueOffset : 6;
        it.startOffset = Number.isFinite(it.startOffset) ? it.startOffset : null;
        if (R.isAcademic(it)) {
          const day = R.CYCLES[it.kind].startDay;
          const base = D.isValid(it.anchor) ? it.anchor : D.mondayOf(D.today());
          it.anchor = R.periodStart(base, day);
        } else if (!D.isValid(it.due)) {
          it.due = D.today();
        }
      });
    });
    s.dates = s.dates.filter(function (d) { return d && d.id && D.isValid(d.start); });
    s.dates.forEach(function (d) {
      d.end = D.isValid(d.end) && d.end > d.start ? d.end : '';
      d.note = d.note || '';
      d.repeat = cleanRepeat(d.repeat);
    });
    s.events = s.events.filter(function (e) { return e && e.id && D.isValid(e.due); });
    s.events.forEach(function (e) {
      e.start = D.isValid(e.start) && e.start < e.due ? e.start : '';
      e.note = e.note || '';
      e.repeat = cleanRepeat(e.repeat);
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
    s.lastSeen = D.today();
    return normalise(s);
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

  window.Store = { load, save, valid, normalise, clone, KEY };
})();
