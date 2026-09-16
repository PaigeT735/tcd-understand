(function () {
  'use strict';

  let state = Store.load();
  const ui = {
    view: 'dashboard',
    open: new Set(),     // expanded rows: "readings:id", "homework:id", "class:id"
    editing: null,       // dashboard form: "readings:id", "new:readings", "class:id", "new:class", "dates:id", "new:dates"
    later: { readings: false, homework: false },
    today: D.today(),
    cal: { month: '', selected: '', form: null } // form: { isNew, store, id, date }
  };
  ui.cal.selected = ui.today;
  ui.cal.month = ui.today.slice(0, 8) + '01';

  const TYPES = Form.TYPES;
  const TASKS = ['readings', 'homework'];
  const STATUS = {
    todo: { label: 'Not started', key: 'Red' },
    doing: { label: 'In progress', key: 'Yellow' },
    done: { label: 'Completed', key: 'Green' }
  };
  const LISTS = {
    readings: { singular: 'reading', plural: 'readings' },
    homework: { singular: 'homework', plural: 'homework' }
  };
  // Calendar colour groups, in the order they're listed within a day.
  const GROUPS = {
    essential: { label: 'Essential date', order: 0 },
    maths: { label: 'Maths & Stats', order: 1 },
    hw: { label: 'Homework', order: 2 },
    reading: { label: 'Reading', order: 3 },
    other: { label: 'Personal', order: 4 }
  };
  const CHEV = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHEV_L = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M9 3L5 7l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CAL_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="2.75" width="12.5" height="11.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M1.75 6.25h12.5M5 1.25v3M11 1.25v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function linkify(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)])/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function save() {
    if (!Store.save(state)) toast('Couldn’t save. Your browser storage may be full or blocked.');
  }
  function find(store, id) { return state[store].find(function (x) { return x.id === id; }); }

  /* ---------- Item helpers (shared by dashboard and calendar) ---------- */

  function cur(store, it) { return R.current(it, store, ui.today); }

  // Status belongs to one occurrence. When the current occurrence moves on
  // (Monday, or Tuesday for Maths & Stats), the item reads as Not started.
  function statusOf(store, it) {
    return it.statusOn && it.statusOn === cur(store, it).due ? it.status : 'todo';
  }

  function typeOf(store, it) {
    if (store === 'dates') return 'essential';
    if (store === 'events') return 'other';
    if (store === 'readings') return 'reading';
    if (it.kind === 'maths') return it.subject === 'Statistics' ? 'stats' : 'math';
    return 'hw';
  }
  function groupOf(type) { return type === 'math' || type === 'stats' ? 'maths' : (type === 'essential' || type === 'other' || type === 'hw' || type === 'reading' ? type : 'other'); }
  function nameOf(store, it) { return store === 'dates' ? it.title : it.name; }
  function typeLabel(store, it) {
    const t = typeOf(store, it);
    if (store === 'homework' && it.kind === 'maths') return it.subject ? it.subject + ' problem set' : 'Maths & Stats problem set';
    return TYPES[t].label;
  }

  // Where a task belongs on the dashboard: this week, later, or no longer relevant.
  function placement(store, it) {
    const weekMon = D.mondayOf(ui.today);
    const weekSun = D.addDays(weekMon, 6);
    const c = cur(store, it);
    if (!it.repeat && statusOf(store, it) === 'done' && c.due < weekMon) return 'hidden';
    if (it.repeat && R.endedBefore(it, store, ui.today) && c.due < weekMon) return 'hidden';
    if (R.isAcademic(it)) {
      const P = R.periodStart(ui.today, R.CYCLES[it.kind].startDay);
      return it.anchor <= P ? 'now' : 'later';
    }
    if (c.due <= weekSun || (c.start && c.start <= ui.today)) return 'now';
    return 'later';
  }

  function toDraft(store, it) {
    if (store === 'dates') {
      return {
        type: 'essential', name: it.title, module: '', source: '', schedule: '', note: it.note,
        start: it.end ? it.start : '', due: it.end || it.start, repeat: Form.repeatToDraft(it.repeat)
      };
    }
    if (store === 'events') {
      return {
        type: 'other', name: it.name, module: '', source: '', schedule: '', note: it.note,
        start: it.start, due: it.due, repeat: Form.repeatToDraft(it.repeat)
      };
    }
    const c = R.isAcademic(it) ? cur(store, it) : it;
    return {
      type: typeOf(store, it), name: it.name, module: it.module, source: it.source,
      schedule: Form.scheduleText(it.schedule), note: it.details,
      start: c.start || '', due: c.due, repeat: Form.repeatToDraft(it.repeat)
    };
  }

  function blankDraft(context, date) {
    const types = Form.CONTEXT[context].types;
    let due = date;
    if (!due) {
      const sunday = D.addDays(D.mondayOf(ui.today), 6);
      due = context === 'dates' ? ui.today : (ui.today > sunday ? ui.today : sunday);
    }
    return { type: types[0], name: '', module: '', source: '', schedule: '', note: '', start: '', due: due, repeat: Form.emptyRepeat() };
  }

  // Saves a draft to the right list, moving the item if its type changed.
  // One source of truth: dashboard and calendar both go through here.
  function saveDraft(draft, prevStore, prevId) {
    const T = TYPES[draft.type];
    const store = T.store;
    const prev = prevStore ? find(prevStore, prevId) : null;
    const id = prev ? prev.id : uid(store[0]);
    const repeat = Form.draftToRepeat(draft.repeat);
    let item;

    if (R.isTask(store)) {
      const wasActive = prev && R.isTask(prevStore) && statusOf(prevStore, prev) !== 'todo';
      item = {
        id: id,
        name: draft.name, module: draft.module, source: draft.source, details: draft.note,
        schedule: Form.parseSchedule(draft.schedule),
        kind: T.kind, subject: T.subject || '',
        status: prev && prev.status ? prev.status : 'todo', statusOn: prev && prev.statusOn ? prev.statusOn : '',
        start: '', due: '', dueOffset: 6, startOffset: null, anchor: '', repeat: repeat
      };
      if (R.isAcademic(item)) {
        const P = R.periodForDue(item.kind, draft.due);
        item.dueOffset = D.diffDays(P, draft.due);
        item.startOffset = draft.start ? D.diffDays(P, draft.start) : null;
        const keep = prev && R.isTask(prevStore) && R.isAcademic(prev) && prev.kind === item.kind && prev.anchor && prev.anchor < P;
        item.anchor = keep ? prev.anchor : P;
      } else {
        item.due = draft.due;
        item.start = draft.start;
      }
      item.statusOn = wasActive ? R.current(item, store, ui.today).due : (item.statusOn || '');
      if (!wasActive) item.status = 'todo';
    } else if (store === 'dates') {
      item = { id: id, title: draft.name, start: draft.start || draft.due, end: draft.start ? draft.due : '', note: draft.note, repeat: repeat };
    } else {
      item = { id: id, name: draft.name, start: draft.start, due: draft.due, note: draft.note, repeat: repeat };
    }

    if (prev && prevStore === store) {
      const idx = state[store].indexOf(prev);
      state[store][idx] = item;
    } else {
      if (prev) state[prevStore].splice(state[prevStore].indexOf(prev), 1);
      state[store].push(item);
    }
    save();
    return { store: store, id: id, item: item };
  }

  function deleteItem(store, id) {
    const idx = state[store].findIndex(function (x) { return x.id === id; });
    if (idx < 0) return;
    const removed = state[store].splice(idx, 1)[0];
    ui.open.delete(store + ':' + id);
    if (ui.editing === store + ':' + id) ui.editing = null;
    if (ui.cal.form && ui.cal.form.id === id) ui.cal.form = null;
    save();
    refresh(true);
    toast('Deleted “' + nameOf(store, removed) + '”', function () {
      state[store].splice(Math.min(idx, state[store].length), 0, removed);
      save();
      refresh(true);
    });
  }

  /* ---------- Header ---------- */

  function termWeek(monday) {
    return Math.floor(D.diffDays(state.term.start, monday) / 7) + 1;
  }

  function renderHeader() {
    const t = state.term;
    const monday = D.mondayOf(ui.today);
    const wk = termWeek(monday);
    const sunday = D.addDays(monday, 6);
    let title;
    if (wk < 1) title = 'Before term';
    else if (wk > t.weeks) title = 'After teaching';
    else if (wk === t.readingWeek) title = 'Reading Week';
    else title = 'Week ' + wk;

    $('#term-name').textContent = t.name;
    $('#term-week').textContent = title;
    const sameMonth = D.parse(monday).getMonth() === D.parse(sunday).getMonth();
    $('#term-range').textContent = D.short(monday) + '–' + (sameMonth ? D.parse(sunday).getDate() : D.short(sunday));

    let segs = '', labels = '';
    for (let i = 1; i <= t.weeks; i++) {
      const cls = ['tl-seg'];
      if (i === t.readingWeek) cls.push('break');
      if (i < wk) cls.push('past');
      if (i === wk) cls.push('now');
      const start = D.addDays(t.start, (i - 1) * 7);
      const name = i === t.readingWeek ? 'Reading Week' : 'Week ' + i;
      segs += '<span class="' + cls.join(' ') + '" title="' + name + ', from ' + D.short(start) + '"></span>';
      labels += '<span class="' + (i === wk ? 'now' : '') + '">' + (i === t.readingWeek ? 'RW' : i) + '</span>';
    }
    $('#timeline').innerHTML = '<div class="tl-track">' + segs + '</div><div class="tl-labels" aria-hidden="true">' + labels + '</div>';
    $('#timeline').setAttribute('aria-label', 'Term progress: ' + title + ' of ' + t.weeks);

    $('#today').textContent = D.long(ui.today);
    let total = 0, done = 0;
    TASKS.forEach(function (k) {
      state[k].forEach(function (it) {
        if (placement(k, it) !== 'now') return;
        total++;
        if (statusOf(k, it) === 'done') done++;
      });
    });
    $('#week-progress').textContent = total ? done + ' of ' + total + ' done this week' : 'Nothing due this week';

    const dark = effectiveTheme() === 'dark';
    const btn = $('#theme-toggle');
    btn.textContent = dark ? 'Light mode' : 'Dark mode';
    btn.setAttribute('aria-label', 'Switch to ' + (dark ? 'light' : 'dark') + ' mode');

    const nav = $('#nav-toggle');
    nav.innerHTML = ui.view === 'calendar' ? CHEV_L + '<span>Dashboard</span>' : CAL_ICON + '<span>Calendar</span>';
    nav.setAttribute('aria-label', ui.view === 'calendar' ? 'Back to dashboard' : 'Open calendar');
  }

  function effectiveTheme() {
    const pref = state.settings.theme;
    if (pref === 'light' || pref === 'dark') return pref;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme() {
    const pref = state.settings.theme;
    if (pref === 'light' || pref === 'dark') document.documentElement.dataset.theme = pref;
    else delete document.documentElement.dataset.theme;
  }

  /* ---------- Weekly Reading / Weekly HW ---------- */

  function dueCell(it, c, status) {
    const due = c.due;
    const cls = ['task-due'];
    let title = D.long(due);
    if (status !== 'done') {
      if (due === ui.today) { cls.push('today'); title += ' (today)'; }
      else if (due < ui.today) { cls.push('late'); title += ' (overdue)'; }
    }
    return '<span class="' + cls.join(' ') + '" title="' + title + '">' + D.short(due) + '</span>';
  }

  function detailHTML(list, it, c) {
    const wk = termWeek(D.mondayOf(ui.today));
    let rows = '';
    if (it.module) rows += '<dt>Module</dt><dd>' + esc(it.module) + '</dd>';
    rows += '<dt>What</dt><dd>' + esc(it.name) + '</dd>';
    if (list === 'homework') rows += '<dt>Type</dt><dd>' + esc(typeLabel(list, it)) + '</dd>';
    if (it.schedule[wk]) rows += '<dt>This week</dt><dd>' + linkify(it.schedule[wk]) + '</dd>';
    if (it.schedule[wk + 1]) rows += '<dt>Next week</dt><dd>' + linkify(it.schedule[wk + 1]) + '</dd>';
    rows += '<dt>Where to find it</dt><dd>' + (it.source ? linkify(it.source) : '<span class="repeat-tag">Not added yet</span>') + '</dd>';
    if (it.details) rows += '<dt>Notes</dt><dd>' + linkify(it.details) + '</dd>';
    if (c.release) rows += '<dt>Released</dt><dd>' + esc(D.long(c.release)) + '</dd>';
    if (c.start) rows += '<dt>Starts</dt><dd>' + esc(D.long(c.start)) + '</dd>';
    rows += '<dt>Due</dt><dd>' + esc(D.long(c.due)) +
      ' <span class="repeat-tag">(' + (it.repeat ? esc(R.describe(it, list).toLowerCase()) : 'one-off') + ')</span></dd>';
    rows += '<dd class="actions">' +
      '<button type="button" class="link" data-action="edit-task" data-list="' + list + '" data-id="' + it.id + '">Edit</button>' +
      '<button type="button" class="link danger" data-action="delete-item" data-store="' + list + '" data-id="' + it.id + '">Delete</button></dd>';
    return '<dl class="detail">' + rows + '</dl>';
  }

  function rowHTML(list, it) {
    const key = list + ':' + it.id;
    const editing = ui.editing === key;
    const open = editing || ui.open.has(key);
    const c = cur(list, it);
    const status = statusOf(list, it);
    const st = STATUS[status];
    const body = editing
      ? Form.html({ context: list, draft: toDraft(list, it), isNew: false, store: list, id: it.id })
      : detailHTML(list, it, c);
    return '<li class="task' + (status === 'done' ? ' done' : '') + (open ? ' open' : '') + '" data-id="' + it.id + '" data-key="' + key + '">' +
      '<div class="task-row">' +
        '<button type="button" class="status-btn s-' + status + '" data-action="status" data-list="' + list + '" data-id="' + it.id + '" aria-haspopup="menu" aria-label="Status: ' + st.label + '. Change status" title="' + st.label + '"><span class="dot"></span></button>' +
        '<button type="button" class="task-main" data-action="toggle" aria-expanded="' + open + '">' +
          '<span class="task-name">' + esc(it.name) + '</span>' +
          (it.module ? '<span class="task-module">' + esc(it.module) + '</span>' : '') +
        '</button>' +
        dueCell(it, c, status) +
        '<button type="button" class="chev" data-action="toggle" aria-expanded="' + open + '" aria-label="' + (open ? 'Hide' : 'Show') + ' details for ' + esc(it.name) + '">' + CHEV + '</button>' +
      '</div>' +
      '<div class="reveal"><div class="reveal-inner">' + body + '</div></div>' +
    '</li>';
  }

  function doneLast(list, items) {
    return items.filter(function (i) { return statusOf(list, i) !== 'done'; })
      .concat(items.filter(function (i) { return statusOf(list, i) === 'done'; }));
  }

  function renderTasks(list, animate) {
    const ul = $('[data-list="' + list + '"]');
    const before = {};
    if (animate && !reduceMotion.matches) {
      $$('li[data-id]', ul).forEach(function (li) { before[li.dataset.id] = li.getBoundingClientRect().top; });
    }

    const now = [], later = [];
    state[list].forEach(function (it) {
      const p = placement(list, it);
      if (p === 'now') now.push(it);
      else if (p === 'later') later.push(it);
    });
    later.sort(function (a, b) { return cur(list, a).due < cur(list, b).due ? -1 : 1; });
    const adding = ui.editing === 'new:' + list;
    // An item being edited stays visible even if its dates move it to "later".
    const editingLater = later.some(function (it) { return ui.editing === list + ':' + it.id; });
    const showLater = ui.later[list] || editingLater;

    let html = '';
    if (!now.length && !adding) {
      html += '<li class="empty">No ' + LISTS[list].plural + ' due this week.' + (later.length ? '' : ' Add one below.') + '</li>';
    }
    doneLast(list, now).forEach(function (it) { html += rowHTML(list, it); });
    if (later.length && showLater) {
      html += '<li class="later-head">Due later</li>';
      doneLast(list, later).forEach(function (it) { html += rowHTML(list, it); });
    }
    if (adding) {
      html += '<li class="new-item">' + Form.html({ context: list, draft: blankDraft(list), isNew: true }) + '</li>';
    }
    ul.innerHTML = html;
    $$('form[data-form="item"]', ul).forEach(function (f) { Form.update(f); });

    const done = now.filter(function (i) { return statusOf(list, i) === 'done'; }).length;
    $('[data-count="' + list + '"]').textContent = now.length ? done + ' of ' + now.length + ' done' : '';
    let foot = '';
    if (!adding) {
      foot += '<button type="button" class="add-btn" data-action="add-task" data-list="' + list + '"><span class="plus" aria-hidden="true">+</span> Add ' + LISTS[list].singular + '</button>';
    }
    if (later.length && !editingLater) {
      foot += '<button type="button" class="link later-toggle" data-action="toggle-later" data-list="' + list + '" aria-expanded="' + showLater + '">' +
        (showLater ? 'Hide later' : later.length + ' due later') + '</button>';
    }
    $('[data-foot="' + list + '"]').innerHTML = foot;

    if (animate && !reduceMotion.matches) {
      $$('li[data-id]', ul).forEach(function (li) {
        const prev = before[li.dataset.id];
        if (prev == null) return;
        const delta = prev - li.getBoundingClientRect().top;
        if (Math.abs(delta) > 1) {
          li.animate([{ transform: 'translateY(' + delta + 'px)' }, { transform: 'none' }],
            { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' });
        }
      });
    }
  }

  function toggleRow(li) {
    const key = li.dataset.key;
    if (ui.editing === key) return;
    const open = !ui.open.has(key);
    if (open) ui.open.add(key); else ui.open.delete(key);
    li.classList.toggle('open', open);
    $$('[data-action="toggle"], [data-action="class-toggle"]', li).forEach(function (b) {
      if (b.closest('li') !== li) return;
      b.setAttribute('aria-expanded', open);
      if (b.classList.contains('chev')) b.setAttribute('aria-label', b.getAttribute('aria-label').replace(/^(Show|Hide)/, open ? 'Hide' : 'Show'));
    });
  }

  /* ---------- Status menu ---------- */

  const menu = $('#status-menu');
  let menuTarget = null;

  function openMenu(btn) {
    const list = btn.dataset.list;
    const it = find(list, btn.dataset.id);
    if (!it) return;
    menuTarget = { list: list, id: it.id, view: ui.view };
    const status = statusOf(list, it);
    menu.innerHTML = ['todo', 'doing', 'done'].map(function (s) {
      return '<button type="button" role="menuitemradio" data-status="' + s + '" aria-checked="' + (status === s) + '">' +
        '<span class="dot s-' + s + '"></span>' + STATUS[s].label + '<span class="key">' + STATUS[s].key + '</span></button>';
    }).join('');
    menu.hidden = false;
    const r = btn.getBoundingClientRect();
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = r.top - mh - 4;
    menu.style.top = Math.max(8, top) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8)) + 'px';
    const current = menu.querySelector('[aria-checked="true"]');
    (current || menu.firstElementChild).focus();
  }

  function statusBtnSelector(t) {
    return (t.view === 'calendar' ? '#cal-side' : '[data-list="' + t.list + '"]') +
      ' [data-action="status"][data-list="' + t.list + '"][data-id="' + t.id + '"]';
  }

  function closeMenu(refocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (refocus && menuTarget) focusLater(statusBtnSelector(menuTarget));
    menuTarget = null;
  }

  function setStatus(status) {
    if (!menuTarget) return;
    const t = menuTarget;
    const it = find(t.list, t.id);
    closeMenu(false);
    if (it && statusOf(t.list, it) !== status) {
      it.status = status;
      it.statusOn = cur(t.list, it).due;
      save();
      if (ui.view === 'calendar') refresh();
      else { renderTasks(t.list, true); renderHeader(); }
    }
    focusLater(statusBtnSelector(t));
  }

  menu.addEventListener('click', function (e) {
    const b = e.target.closest('[data-status]');
    if (b) setStatus(b.dataset.status);
  });
  menu.addEventListener('keydown', function (e) {
    const items = $$('button', menu);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'Tab') { closeMenu(false); }
  });

  /* ---------- GradesComp ---------- */

  function total(c) { return c.components.reduce(function (s, p) { return s + (Number(p.weight) || 0); }, 0); }
  function fmtPct(n) { return (Math.round(n * 100) / 100) + '%'; }

  function classFormHTML(c) {
    const v = c || { name: '', components: [{ id: '', name: '', weight: '', note: '' }] };
    return '<form class="form class-form' + (c ? '' : ' new') + '" data-form="class" data-id="' + (c ? c.id : '') + '" novalidate>' +
      '<label class="full">Class name<input type="text" name="cname" value="' + esc(v.name) + '" placeholder="e.g. Microeconomics" required></label>' +
      '<div class="comp-edit"><div class="comp-edit-head" aria-hidden="true"><span>Component</span><span>Weight</span><span class="note-h">Note</span><span></span></div>' +
      v.components.map(compRowHTML).join('') + '</div>' +
      '<div class="full"><button type="button" class="add-btn" data-action="add-comp"><span class="plus" aria-hidden="true">+</span> Add component</button></div>' +
      '<div class="form-actions"><button type="submit" class="btn primary">' + (c ? 'Save changes' : 'Add class') + '</button>' +
      '<button type="button" class="btn" data-action="cancel-edit">Cancel</button><span class="spacer"></span>' +
      '<span class="class-sum" data-live-total></span></div>' +
      '</form>';
  }
  function compRowHTML(p) {
    return '<div class="comp-edit-row" data-comp="' + esc(p.id || '') + '">' +
      '<input type="text" aria-label="Component name" name="pname" value="' + esc(p.name) + '" placeholder="e.g. Final exam">' +
      '<span class="pct"><input type="number" aria-label="Weight in percent" name="pweight" min="0" max="100" step="any" value="' + esc(p.weight) + '" placeholder="0"></span>' +
      '<input type="text" class="note-input" aria-label="Note" name="pnote" value="' + esc(p.note || '') + '" placeholder="Optional">' +
      '<button type="button" class="icon-x" data-action="remove-comp" aria-label="Remove component">×</button></div>';
  }
  function updateLiveTotal(form) {
    const el = form.querySelector('[data-live-total]');
    if (!el) return;
    const sum = $$('input[name="pweight"]', form).reduce(function (s, i) { return s + (parseFloat(i.value) || 0); }, 0);
    el.textContent = 'Total ' + fmtPct(sum);
    el.classList.toggle('warn', Math.abs(sum - 100) > 0.001);
  }

  function renderClasses() {
    const ul = $('#classes');
    let html = '';
    if (!state.classes.length && ui.editing !== 'new:class') html = '<li class="empty">No classes yet. Add one below.</li>';
    state.classes.forEach(function (c) {
      const key = 'class:' + c.id;
      const editing = ui.editing === key;
      const open = editing || ui.open.has(key);
      const sum = total(c);
      const off = Math.abs(sum - 100) > 0.001;
      let body;
      if (editing) body = classFormHTML(c);
      else {
        const bar = c.components.map(function (p) {
          return '<span style="flex:' + (Number(p.weight) || 0) + '" title="' + esc(p.name) + ' ' + fmtPct(Number(p.weight) || 0) + '"></span>';
        }).join('') + (sum < 100 ? '<span class="gap" style="flex:' + (100 - sum) + '" title="Unaccounted ' + fmtPct(100 - sum) + '"></span>' : '');
        body = '<div class="class-body">' +
          (c.components.length ? '<div class="weight-bar" aria-hidden="true">' + bar + '</div>' : '') +
          '<ul class="comp-list">' + (c.components.length ? c.components.map(function (p) {
            return '<li><span>' + esc(p.name) + (p.note ? '<span class="comp-note">' + esc(p.note) + '</span>' : '') + '</span>' +
              '<span class="comp-weight">' + fmtPct(Number(p.weight) || 0) + '</span></li>';
          }).join('') : '<li><span class="comp-note">No components yet.</span></li>') + '</ul>' +
          '<div class="comp-total' + (off ? ' warn' : '') + '"><span>' + (off ? (sum < 100 ? fmtPct(100 - sum) + ' unaccounted for' : 'Adds up to more than 100%') : 'Total') + '</span><span>' + fmtPct(sum) + '</span></div>' +
          '<div class="class-actions"><button type="button" class="link" data-action="edit-class" data-id="' + c.id + '">Edit</button>' +
          '<button type="button" class="link danger" data-action="delete-class" data-id="' + c.id + '">Delete class</button></div>' +
          '</div>';
      }
      html += '<li class="class' + (open ? ' open' : '') + '" data-id="' + c.id + '" data-key="' + key + '">' +
        '<div class="class-row">' +
          '<button type="button" class="class-name" data-action="class-toggle" aria-expanded="' + open + '">' + esc(c.name) + '</button>' +
          '<span class="class-sum' + (off ? ' warn' : '') + '">' + (off ? fmtPct(sum) + ' listed' : '') + '</span>' +
          '<button type="button" class="chev" data-action="class-toggle" aria-expanded="' + open + '" aria-label="' + (open ? 'Hide' : 'Show') + ' breakdown for ' + esc(c.name) + '">' + CHEV + '</button>' +
        '</div>' +
        '<div class="reveal"><div class="reveal-inner">' + body + '</div></div></li>';
    });
    if (ui.editing === 'new:class') html += '<li class="new-item">' + classFormHTML(null) + '</li>';
    ul.innerHTML = html;
    $$('form[data-form="class"]', ul).forEach(updateLiveTotal);
    $('#grades-meta').textContent = state.classes.length + (state.classes.length === 1 ? ' class' : ' classes');
    $('#grades-foot').innerHTML = ui.editing === 'new:class' ? '' :
      '<button type="button" class="add-btn" data-action="add-class"><span class="plus" aria-hidden="true">+</span> Add class</button>';
  }

  function saveClass(form) {
    const name = form.elements.cname.value.trim();
    $$('.field-error', form).forEach(function (e) { e.remove(); });
    const comps = [];
    let bad = '';
    $$('.comp-edit-row', form).forEach(function (row) {
      const pn = row.querySelector('[name="pname"]').value.trim();
      const pw = row.querySelector('[name="pweight"]').value.trim();
      const note = row.querySelector('[name="pnote"]').value.trim();
      if (!pn && !pw && !note) return; // ignore blank rows
      const w = Number(pw);
      if (!pn) bad = bad || 'Every component needs a name.';
      else if (pw === '' || !Number.isFinite(w) || w < 0 || w > 100) bad = bad || 'Weights must be between 0 and 100.';
      comps.push({ id: row.dataset.comp || uid('p'), name: pn, weight: w, note: note });
    });
    if (!name) bad = 'Add a class name.';
    if (bad) {
      form.querySelector('.form-actions').insertAdjacentHTML('beforebegin', '<p class="field-error">' + bad + '</p>');
      return;
    }
    let id = form.dataset.id;
    if (id) {
      const c = find('classes', id);
      c.name = name; c.components = comps;
    } else {
      id = uid('c');
      state.classes.push({ id: id, name: name, components: comps });
    }
    ui.editing = null;
    ui.open.add('class:' + id);
    save();
    renderClasses();
    focusLater('#classes li[data-id="' + id + '"] .class-name');
  }

  function deleteClass(id) {
    const idx = state.classes.findIndex(function (c) { return c.id === id; });
    if (idx < 0) return;
    const [c] = state.classes.splice(idx, 1);
    save();
    renderClasses();
    toast('Deleted “' + c.name + '”', function () {
      state.classes.splice(Math.min(idx, state.classes.length), 0, c);
      save();
      renderClasses();
    });
  }

  /* ---------- Essential Dates ---------- */

  function relText(o) {
    const end = o.end || o.start;
    if (end < ui.today) return '';
    if (o.start <= ui.today) return o.end ? 'Now' : 'Today';
    const n = D.diffDays(ui.today, o.start);
    if (n === 1) return 'Tomorrow';
    if (n < 14) return 'In ' + n + ' days';
    return 'In ' + Math.round(n / 7) + ' weeks';
  }

  function renderDates() {
    const ul = $('#dates');
    const year = D.parse(ui.today).getFullYear();
    const list = state.dates.map(function (d) { return { d: d, o: cur('dates', d) }; }).sort(function (a, b) {
      const ea = a.o.end || a.o.start, eb = b.o.end || b.o.start;
      return a.o.start < b.o.start ? -1 : a.o.start > b.o.start ? 1 : ea < eb ? -1 : ea > eb ? 1 : 0;
    });
    const next = list.find(function (x) { return x.o.start > ui.today; });
    let html = '';
    if (!list.length && ui.editing !== 'new:dates') html = '<li class="empty">No dates yet. Add one below.</li>';
    list.forEach(function (x) {
      const d = x.d, o = x.o;
      if (ui.editing === 'dates:' + d.id) {
        html += '<li class="date-item" data-id="' + d.id + '">' + Form.html({ context: 'dates', draft: toDraft('dates', d), isNew: false, store: 'dates', id: d.id }) + '</li>';
        return;
      }
      const end = o.end || o.start;
      const cls = ['date-item'];
      if (end < ui.today) cls.push('past');
      else if (o.start <= ui.today) cls.push('current');
      if (next && o.start === next.o.start) cls.push('next');
      const sub = [d.note, d.repeat ? R.describe(d, 'dates') + '.' : ''].filter(Boolean).join(' ');
      html += '<li class="' + cls.join(' ') + '" data-id="' + d.id + '"><div class="date-row">' +
        '<span class="date-when">' + esc(D.range(o.start, o.end, year)) + '</span>' +
        '<span><span class="date-title">' + esc(d.title) + '</span>' + (sub ? '<span class="date-note">' + esc(sub) + '</span>' : '') + '</span>' +
        '<span class="date-side"><span class="rel">' + relText(o) + '</span><span class="date-actions">' +
          '<button type="button" class="link" data-action="edit-date" data-id="' + d.id + '" aria-label="Edit ' + esc(d.title) + '">Edit</button>' +
          '<button type="button" class="link danger" data-action="delete-item" data-store="dates" data-id="' + d.id + '" aria-label="Delete ' + esc(d.title) + '">Delete</button>' +
        '</span></span></div></li>';
    });
    if (ui.editing === 'new:dates') {
      html += '<li class="new-item">' + Form.html({ context: 'dates', draft: blankDraft('dates'), isNew: true }) + '</li>';
    }
    ul.innerHTML = html;
    $$('form[data-form="item"]', ul).forEach(function (f) { Form.update(f); });
    const upcoming = list.filter(function (x) { return (x.o.end || x.o.start) >= ui.today; }).length;
    $('#dates-meta').textContent = upcoming + ' upcoming';
    $('#dates-foot').innerHTML = ui.editing === 'new:dates' ? '' :
      '<button type="button" class="add-btn" data-action="add-date"><span class="plus" aria-hidden="true">+</span> Add date</button>';
  }

  /* ---------- Calendar ---------- */

  // Everything happening between two dates, calculated from the same lists
  // the dashboard uses.
  function collect(from, to) {
    const byDay = {};
    function add(date, e) {
      if (date < from || date > to) return;
      (byDay[date] = byDay[date] || []).push(e);
    }
    TASKS.forEach(function (store) {
      state[store].forEach(function (it) {
        const type = typeOf(store, it);
        const currentDue = cur(store, it).due;
        R.list(it, store, from, to).forEach(function (o) {
          const base = { store: store, id: it.id, type: type, group: groupOf(type), name: it.name, module: it.module, occ: o.due };
          const isCurrent = o.due === currentDue;
          add(o.due, Object.assign({ role: 'due', status: isCurrent ? statusOf(store, it) : null }, base));
          if (o.start && o.start !== o.due) add(o.start, Object.assign({ role: 'start' }, base));
          if (o.release && o.release !== o.due) add(o.release, Object.assign({ role: 'release' }, base));
        });
      });
    });
    state.dates.forEach(function (d) {
      R.list(d, 'dates', from, to).forEach(function (o) {
        const base = { store: 'dates', id: d.id, type: 'essential', group: 'essential', name: d.title, note: d.note, occ: o.start };
        if (!o.end) { add(o.start, Object.assign({ role: 'date' }, base)); return; }
        let day = o.start < from ? from : o.start;
        const last = o.end > to ? to : o.end;
        for (let i = 0; i < 400 && day <= last; i++, day = D.addDays(day, 1)) {
          add(day, Object.assign({ role: 'range', first: day === o.start, lastDay: day === o.end, rangeStart: o.start, rangeEnd: o.end }, base));
        }
      });
    });
    state.events.forEach(function (ev) {
      R.list(ev, 'events', from, to).forEach(function (o) {
        const base = { store: 'events', id: ev.id, type: 'other', group: 'other', name: ev.name, note: ev.note, occ: o.due };
        add(o.due, Object.assign({ role: 'due' }, base));
        if (o.start && o.start !== o.due) add(o.start, Object.assign({ role: 'start' }, base));
      });
    });
    const roleOrder = { range: 0, date: 0, due: 1, release: 2, start: 3 };
    Object.keys(byDay).forEach(function (k) {
      byDay[k].sort(function (a, b) {
        return (GROUPS[a.group].order - GROUPS[b.group].order) || (roleOrder[a.role] - roleOrder[b.role]) || (a.name < b.name ? -1 : 1);
      });
    });
    return byDay;
  }

  function chipLabel(e) {
    if (e.role === 'start') return 'Starts: ' + e.name;
    if (e.role === 'release') return 'Released: ' + e.name;
    return e.name;
  }

  function roleText(e) {
    if (e.role === 'start') return 'Starts';
    if (e.role === 'release') return 'Released';
    if (e.role === 'range') return D.range(e.rangeStart, e.rangeEnd, D.parse(ui.today).getFullYear());
    if (e.store === 'events' || e.store === 'dates') return '';
    return 'Due';
  }

  function chipHTML(e, date) {
    const cls = ['ev', 'g-' + e.group, 'r-' + e.role];
    if (e.status === 'done') cls.push('is-done');
    if (e.role === 'range') {
      if (e.first) cls.push('range-first');
      if (e.lastDay) cls.push('range-last');
    }
    const showText = e.role !== 'range' || e.first || D.dayIndex(date) === 0;
    const title = chipLabel(e) + (e.role === 'range' ? ' (' + roleText(e) + ')' : '') + (e.status ? ', ' + STATUS[e.status].label.toLowerCase() : '');
    return '<button type="button" class="' + cls.join(' ') + '" data-action="cal-open" data-store="' + e.store + '" data-id="' + e.id + '" data-date="' + date + '" title="' + esc(title) + '">' +
      '<span class="mk" aria-hidden="true"></span><span class="ev-t">' + (showText ? esc(chipLabel(e)) : '<span class="sr">' + esc(chipLabel(e)) + '</span>') + '</span></button>';
  }

  // Busy days (e.g. every Sunday) group three or more due items of one type
  // into a single line; the full list is in the side panel.
  function cellChips(items, date) {
    const counts = {};
    items.forEach(function (e) { if (e.role === 'due' && R.isTask(e.store)) counts[e.group] = (counts[e.group] || 0) + 1; });
    const seen = {};
    const out = [];
    items.forEach(function (e) {
      const n = counts[e.group] || 0;
      if (e.role === 'due' && R.isTask(e.store) && n >= 3) {
        if (seen[e.group]) return;
        seen[e.group] = true;
        const group = items.filter(function (x) { return x.group === e.group && x.role === 'due' && R.isTask(x.store); });
        const done = group.filter(function (x) { return x.status === 'done'; }).length;
        const noun = e.group === 'reading' ? 'readings' : e.group === 'maths' ? 'problem sets' : 'HW';
        const label = n + ' ' + noun + ' due';
        out.push('<button type="button" class="ev g-' + e.group + ' r-due' + (done === n ? ' is-done' : '') + '" data-action="cal-select" data-date="' + date + '" title="' +
          esc(label + (done ? ', ' + done + ' done' : '') + ': ' + group.map(function (x) { return x.name; }).join(', ')) + '">' +
          '<span class="mk" aria-hidden="true"></span><span class="ev-t">' + label + (done && done < n ? ' <span class="ev-sub">' + done + ' done</span>' : '') + '</span></button>');
        return;
      }
      out.push(chipHTML(e, date));
    });
    return out;
  }

  function renderCalendar() {
    const month = ui.cal.month;
    const gridStart = D.mondayOf(month);
    const gridEnd = D.addDays(gridStart, 41);
    const monthNum = D.parse(month).getMonth();
    const byDay = collect(gridStart, gridEnd);

    let head = '<div class="panel-head cal-head">' +
      '<div class="cal-nav">' +
        '<button type="button" class="icon-btn" data-action="cal-prev" aria-label="Previous month">' + CHEV_L + '</button>' +
        '<h2 id="cal-title" aria-live="polite">' + D.monthTitle(month) + '</h2>' +
        '<button type="button" class="icon-btn" data-action="cal-next" aria-label="Next month">' + CHEV + '</button>' +
        '<button type="button" class="btn small" data-action="cal-today">Today</button>' +
      '</div>' +
      '<button type="button" class="btn small" data-action="cal-add" data-date="' + ui.cal.selected + '"><span aria-hidden="true">+</span> Add event</button>' +
    '</div>';
    head += '<div class="cal-legend" aria-hidden="true">' + ['reading', 'hw', 'maths', 'essential', 'other'].map(function (g) {
      return '<span class="lg g-' + g + '"><span class="mk"></span>' + GROUPS[g].label + '</span>';
    }).join('') + '</div>';

    let grid = '<div class="cal-grid" role="grid" aria-labelledby="cal-title"><div class="cal-row cal-dow" role="row">' +
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (d) { return '<span role="columnheader">' + d + '</span>'; }).join('') + '</div>';
    for (let w = 0; w < 6; w++) {
      grid += '<div class="cal-row" role="row">';
      for (let i = 0; i < 7; i++) {
        const date = D.addDays(gridStart, w * 7 + i);
        const dObj = D.parse(date);
        const items = byDay[date] || [];
        const cls = ['cal-cell'];
        if (dObj.getMonth() !== monthNum) cls.push('out');
        if (date === ui.today) cls.push('is-today');
        if (date === ui.cal.selected) cls.push('is-selected');
        if (i >= 5) cls.push('weekend');
        const chips = cellChips(items, date);
        const shown = chips.slice(0, 3);
        const more = chips.length - shown.length;
        grid += '<div class="' + cls.join(' ') + '" role="gridcell" data-action="cal-select" data-date="' + date + '">' +
          '<div class="cal-top"><button type="button" class="cal-day" data-action="cal-select" data-date="' + date + '" aria-label="' + D.long(date) + (items.length ? ', ' + items.length + ' item' + (items.length > 1 ? 's' : '') : '') + '"' +
            (date === ui.cal.selected ? ' aria-current="date"' : '') + '>' + dObj.getDate() + '</button>' +
          '<button type="button" class="cal-add" data-action="cal-add" data-date="' + date + '" aria-label="Add event on ' + D.short(date) + '">+</button></div>' +
          '<div class="cal-evs">' + shown.join('') +
          (more > 0 ? '<button type="button" class="ev-more" data-action="cal-select" data-date="' + date + '">+' + more + ' more</button>' : '') +
          '</div></div>';
      }
      grid += '</div>';
    }
    grid += '</div>';
    $('#cal-main').innerHTML = head + grid;
    renderSide();
  }

  function agendaRow(e) {
    const sub = [GROUPS[e.group].label === 'Maths & Stats' ? TYPES[e.type].label : GROUPS[e.group].label];
    if (e.module) sub.push(e.module);
    const role = roleText(e);
    let lead;
    if (e.status) {
      const st = STATUS[e.status];
      lead = '<button type="button" class="status-btn s-' + e.status + '" data-action="status" data-list="' + e.store + '" data-id="' + e.id + '" aria-haspopup="menu" aria-label="Status: ' + st.label + '. Change status" title="' + st.label + '"><span class="dot"></span></button>';
    } else {
      lead = '<span class="ag-mk g-' + e.group + ' r-' + e.role + '" aria-hidden="true"><span class="mk"></span></span>';
    }
    return '<li class="ag-item' + (e.status === 'done' ? ' is-done' : '') + '">' + lead +
      '<button type="button" class="ag-main" data-action="cal-open" data-store="' + e.store + '" data-id="' + e.id + '" data-date="' + (e.occ || '') + '">' +
        '<span class="ag-name">' + esc(e.name) + '</span>' +
        '<span class="ag-sub">' + esc(sub.join(', ')) + '</span></button>' +
      '<span class="ag-role">' + esc(role) + '</span></li>';
  }

  function renderSide() {
    const side = $('#cal-side');
    const f = ui.cal.form;
    if (f) {
      const it = f.isNew ? null : find(f.store, f.id);
      if (!f.isNew && !it) { ui.cal.form = null; return renderSide(); }
      const draft = f.isNew ? blankDraft('calendar', f.date) : toDraft(f.store, it);
      side.innerHTML = '<div class="panel-head"><h2>' + (f.isNew ? 'New event' : 'Edit event') + '</h2>' +
        (f.isNew ? '<span class="panel-meta">' + esc(D.long(f.date)) + '</span>' : '') + '</div>' +
        Form.html({ context: 'calendar', draft: draft, isNew: f.isNew, store: f.store, id: f.id });
      Form.update($('form', side));
      return;
    }
    const sel = ui.cal.selected;
    const dayItems = (collect(sel, sel)[sel] || []);
    let h = '<div class="panel-head"><h2>' + esc(D.long(sel)) + '</h2><span class="panel-meta">' +
      (dayItems.length ? dayItems.length + (dayItems.length === 1 ? ' item' : ' items') : '') + '</span></div>';
    h += '<ul class="agenda">' + (dayItems.length ? dayItems.map(agendaRow).join('') : '<li class="empty">Nothing on this day.</li>') + '</ul>';
    h += '<div class="panel-foot"><button type="button" class="add-btn" data-action="cal-add" data-date="' + sel + '"><span class="plus" aria-hidden="true">+</span> Add event on ' + D.short(sel) + '</button></div>';

    const from = D.addDays(ui.today, 1), to = D.addDays(ui.today, 7);
    const upcoming = collect(from, to);
    const days = Object.keys(upcoming).sort();
    h += '<div class="upcoming"><h3>Next 7 days</h3>';
    if (!days.length) h += '<p class="empty">Nothing coming up.</p>';
    days.forEach(function (day) {
      const items = upcoming[day].filter(function (e) { return e.role !== 'range' || e.first; });
      if (!items.length) return;
      h += '<div class="up-day"><button type="button" class="up-date" data-action="cal-select" data-date="' + day + '">' + esc(D.long(day)) + '</button><ul class="agenda compact">' +
        items.map(agendaRow).join('') + '</ul></div>';
    });
    h += '</div>';
    side.innerHTML = h;
  }

  function selectDay(date) {
    ui.cal.selected = date;
    ui.cal.form = null;
    const m = date.slice(0, 8) + '01';
    if (m !== ui.cal.month) ui.cal.month = m;
    renderCalendar();
  }

  function openCalForm(form) {
    ui.cal.form = form;
    if (form.date) {
      ui.cal.selected = form.date;
      const m = form.date.slice(0, 8) + '01';
      if (m !== ui.cal.month) ui.cal.month = m;
    }
    renderCalendar();
    const first = $('#cal-side input[name="name"]');
    if (first) first.focus();
  }

  /* ---------- Views ---------- */

  function setView(view) {
    ui.view = view;
    closeMenu(false);
    $('#dashboard').hidden = view !== 'dashboard';
    $('#calendar').hidden = view !== 'calendar';
    document.title = view === 'calendar' ? 'Calendar | TCD Understand' : 'TCD Understand';
    refresh();
  }

  function routeFromHash() {
    setView(location.hash === '#calendar' ? 'calendar' : 'dashboard');
  }

  function refresh(animate) {
    renderHeader();
    if (ui.view === 'calendar') { renderCalendar(); return; }
    renderTasks('readings', animate);
    renderTasks('homework', animate);
    renderClasses();
    renderDates();
  }

  /* ---------- Editing coordination (dashboard) ---------- */

  function startEditing(key) {
    ui.editing = key;
    refresh();
    const first = document.querySelector('#dashboard form[data-form] input[type="text"]');
    if (first) first.focus();
  }
  function stopEditing() {
    const prev = ui.editing;
    ui.editing = null;
    refresh();
    if (!prev) return;
    const [kind, id] = prev.split(':');
    if (kind === 'class') focusLater('#classes li[data-id="' + id + '"] .class-name');
    else if (kind === 'dates') focusLater('#dates li[data-id="' + id + '"] [data-action="edit-date"]');
    else if (kind === 'readings' || kind === 'homework') focusLater('[data-list="' + kind + '"] li[data-id="' + id + '"] .task-main');
    else if (id === 'class') focusLater('[data-action="add-class"]');
    else if (id === 'dates') focusLater('[data-action="add-date"]');
    else focusLater('[data-action="add-task"][data-list="' + id + '"]');
  }

  function showError(form, res) {
    $$('.field-error', form).forEach(function (e) { e.remove(); });
    form.querySelector('.form-actions').insertAdjacentHTML('beforebegin', '<p class="field-error" role="alert">' + esc(res.error) + '</p>');
    const field = form.elements[res.field];
    if (field && field.focus) field.focus();
  }

  function submitItemForm(form) {
    const res = Form.read(form);
    if (res.error) { showError(form, res); return; }
    const ctx = form.dataset.context;
    const saved = saveDraft(res.draft, form.dataset.store || null, form.dataset.id || null);
    const isNew = !form.dataset.id;

    if (ctx === 'calendar') {
      ui.cal.form = null;
      selectDay(res.draft.start && res.draft.type === 'essential' ? res.draft.start : res.draft.due);
      toast((isNew ? 'Added “' : 'Saved “') + res.draft.name + '”' + (R.isTask(saved.store) ? ' to ' + (saved.store === 'readings' ? 'Weekly Reading' : 'Weekly HW') : '') + '.');
      return;
    }

    ui.editing = null;
    if (R.isTask(saved.store)) {
      if (placement(saved.store, saved.item) === 'later') {
        ui.later[saved.store] = true;
        if (isNew) toast('Added. It’s due ' + D.short(cur(saved.store, saved.item).due) + ', so it’s listed under Due later.');
      }
      ui.open.add(saved.store + ':' + saved.id);
      refresh(isNew);
      focusLater('[data-list="' + saved.store + '"] li[data-id="' + saved.id + '"] .task-main');
    } else {
      refresh();
      focusLater('#dates li[data-id="' + saved.id + '"] [data-action="edit-date"]');
    }
  }

  function focusLater(sel) {
    requestAnimationFrame(function () {
      const el = document.querySelector(sel);
      if (el) el.focus({ preventScroll: false });
    });
  }

  /* ---------- Toast ---------- */

  const toastEl = $('#toast');
  let toastTimer = null;
  function toast(msg, undo) {
    clearTimeout(toastTimer);
    toastEl.innerHTML = '<span></span>';
    toastEl.firstChild.textContent = msg;
    if (undo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Undo';
      b.addEventListener('click', function () { undo(); hideToast(); });
      toastEl.appendChild(b);
    }
    toastEl.hidden = false;
    toastTimer = setTimeout(hideToast, undo ? 7000 : 4000);
  }
  function hideToast() { toastEl.hidden = true; clearTimeout(toastTimer); }

  /* ---------- Events ---------- */

  document.addEventListener('click', function (e) {
    if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[data-action="status"]')) closeMenu(false);
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    switch (a) {
      case 'status':
        if (!menu.hidden && menuTarget && menuTarget.id === el.dataset.id) closeMenu(false);
        else openMenu(el);
        break;
      case 'toggle':
      case 'class-toggle':
        toggleRow(el.closest('li'));
        break;
      case 'toggle-later':
        ui.later[el.dataset.list] = !ui.later[el.dataset.list];
        renderTasks(el.dataset.list);
        focusLater('[data-action="toggle-later"][data-list="' + el.dataset.list + '"]');
        break;
      case 'edit-task': startEditing(el.dataset.list + ':' + el.dataset.id); break;
      case 'add-task': startEditing('new:' + el.dataset.list); break;
      case 'delete-item': deleteItem(el.dataset.store, el.dataset.id); break;
      case 'cancel-edit':
        if (el.closest('#cal-side')) { ui.cal.form = null; renderCalendar(); focusLater('#cal-side .add-btn'); }
        else stopEditing();
        break;
      case 'add-class': startEditing('new:class'); break;
      case 'edit-class': startEditing('class:' + el.dataset.id); break;
      case 'delete-class': deleteClass(el.dataset.id); break;
      case 'add-comp': {
        const form = el.closest('form');
        const wrap = form.querySelector('.comp-edit');
        wrap.insertAdjacentHTML('beforeend', compRowHTML({ id: '', name: '', weight: '', note: '' }));
        wrap.lastElementChild.querySelector('input').focus();
        updateLiveTotal(form);
        break;
      }
      case 'remove-comp': {
        const form = el.closest('form');
        const row = el.closest('.comp-edit-row');
        const next = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        if (next && next.classList.contains('comp-edit-row')) next.querySelector('input').focus();
        else form.querySelector('[data-action="add-comp"]').focus();
        updateLiveTotal(form);
        break;
      }
      case 'add-date': startEditing('new:dates'); break;
      case 'edit-date': startEditing('dates:' + el.dataset.id); break;
      case 'nav':
        if (ui.view === 'calendar') {
          if (location.hash) history.pushState(null, '', location.pathname + location.search);
          setView('dashboard');
        } else {
          location.hash = 'calendar';
        }
        break;
      case 'cal-prev':
      case 'cal-next':
        ui.cal.month = D.addMonths(ui.cal.month, a === 'cal-prev' ? -1 : 1);
        renderCalendar();
        focusLater('[data-action="' + a + '"]');
        break;
      case 'cal-today': selectDay(ui.today); focusLater('.cal-cell.is-selected .cal-day'); break;
      case 'cal-select':
        if (el.classList.contains('cal-cell') && e.target !== el && e.target.closest('.cal-cell') !== el) break;
        selectDay(el.dataset.date);
        if (el.classList.contains('cal-day') || el.classList.contains('up-date')) focusLater('.cal-cell.is-selected .cal-day');
        break;
      case 'cal-add': openCalForm({ isNew: true, date: el.dataset.date || ui.cal.selected }); break;
      case 'cal-open': openCalForm({ isNew: false, store: el.dataset.store, id: el.dataset.id, date: el.dataset.date }); break;
    }
  });

  document.addEventListener('submit', function (e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === 'item') submitItemForm(form);
    else if (form.dataset.form === 'class') saveClass(form);
  });

  function onFormChange(e) {
    const form = e.target.closest('form[data-form="item"]');
    if (form) Form.update(form, e.target);
    if (e.target.name === 'pweight') updateLiveTotal(e.target.closest('form'));
  }
  document.addEventListener('input', onFormChange);
  document.addEventListener('change', onFormChange);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!menu.hidden) { closeMenu(true); return; }
    const form = e.target.closest && e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    if (form.closest('#cal-side')) { ui.cal.form = null; renderCalendar(); focusLater('#cal-side .add-btn'); }
    else if (ui.editing) stopEditing();
  });

  window.addEventListener('resize', function () { closeMenu(false); });
  window.addEventListener('scroll', function () { closeMenu(false); }, { passive: true });
  window.addEventListener('hashchange', routeFromHash);
  window.addEventListener('popstate', routeFromHash);

  $('#theme-toggle').addEventListener('click', function () {
    state.settings.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
    applyTheme();
    save();
    renderHeader();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderHeader);

  $('#export').addEventListener('click', function () {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tcd-understand-backup-' + ui.today + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('#import').addEventListener('click', function () { $('#import-file').click(); });
  $('#import-file').addEventListener('change', function (e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then(function (text) {
      let data;
      try { data = JSON.parse(text); } catch (err) { data = null; }
      if (!Store.valid(data)) { toast('That file isn’t a TCD Understand backup.'); return; }
      if (!window.confirm('Replace everything on this page with the backup from “' + file.name + '”?')) return;
      state = Store.normalise(data);
      applyTheme();
      save();
      ui.open.clear(); ui.editing = null; ui.cal.form = null;
      refresh();
      toast('Backup imported.');
    });
  });

  /* Keep "today" in step with the calendar while the page stays open.
     Resets need no stored changes: statuses belong to a specific due date,
     so the new cycle simply starts as Not started. */
  function noteRollover(prev, now) {
    if (prev && prev < now) {
      if (D.mondayOf(prev) !== D.mondayOf(now)) toast('New week. Reading and homework have been reset.');
      else if (R.periodStart(prev, 2) !== R.periodStart(now, 2)) toast('New problem set week. Maths & Stats has been reset.');
    }
    if (state.lastSeen !== now) { state.lastSeen = now; save(); }
  }
  function tick() {
    const now = D.today();
    if (now === ui.today) return;
    const prev = ui.today;
    ui.today = now;
    noteRollover(prev, now);
    if (ui.editing || ui.cal.form) { renderHeader(); return; } // don't wipe a form mid-edit
    refresh();
  }
  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  window.addEventListener('focus', tick);

  // Another tab changed the data.
  window.addEventListener('storage', function (e) {
    if (e.key !== Store.KEY || !e.newValue || ui.editing || ui.cal.form) return;
    try { state = Store.normalise(JSON.parse(e.newValue)); applyTheme(); refresh(); } catch (err) { /* ignore */ }
  });

  applyTheme();
  save(); // stores migrated data straight away
  noteRollover(state.lastSeen, ui.today);
  routeFromHash();
})();
