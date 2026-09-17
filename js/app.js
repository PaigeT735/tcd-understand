(function () {
  'use strict';

  let state = Store.load();
  const ui = {
    view: 'dashboard',
    open: new Set(),     // expanded rows: "readings:id", "homework:id", "class:id"
    editing: null,       // dashboard form: "readings:id", "new:readings", "class:id", "new:class", "dates:id", "new:dates"
    later: { readings: false, homework: false },
    today: D.today(),
    cal: { month: '', selected: '', form: null, view: null } // form: { isNew, store, id, date, back }, view: { store, id, occ }
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
  // Class first: the class is the heading, the task sits underneath.
  function headOf(it) { return it.module ? it.module : it.name; }
  function subOf(it) { return it.module ? it.name : ''; }
  function lowerFirst(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; }
  const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
    if (ui.cal.view && ui.cal.view.id === id) ui.cal.view = null;
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
    let when = SHORT_DAYS[D.parse(due).getDay()];
    if (status !== 'done') {
      if (due === ui.today) { cls.push('today'); when = 'Today'; }
      else if (due === D.addDays(ui.today, 1)) { when = 'Tomorrow'; }
      else if (due < ui.today) { cls.push('late'); when = 'Overdue'; }
    }
    return '<span class="' + cls.join(' ') + '" title="Due ' + D.long(due) + '"><span class="due-date">' + D.short(due) + '</span><span class="due-when">' + when + '</span></span>';
  }

  function detailHTML(list, it, c) {
    const wk = termWeek(D.mondayOf(ui.today));
    let rows = '';
    rows += '<dt>Class</dt><dd>' + (it.module ? esc(it.module) : '<span class="repeat-tag">Not set</span>') + '</dd>';
    rows += '<dt>Task</dt><dd>' + esc(it.name) + '</dd>';
    if (list === 'homework') rows += '<dt>Type</dt><dd>' + esc(typeLabel(list, it)) + '</dd>';
    if (it.schedule[wk]) rows += '<dt>This week</dt><dd>' + linkify(it.schedule[wk]) + '</dd>';
    if (it.schedule[wk + 1]) rows += '<dt>Next week</dt><dd>' + linkify(it.schedule[wk + 1]) + '</dd>';
    rows += '<dt>Where to find it</dt><dd>' + (it.source ? linkify(it.source) : '<span class="repeat-tag">Not added yet</span>') + '</dd>';
    if (it.details) rows += '<dt>Notes</dt><dd>' + linkify(it.details) + '</dd>';
    if (c.release) rows += '<dt>Released</dt><dd>' + esc(D.long(c.release)) + '</dd>';
    if (c.start) rows += '<dt>Starts</dt><dd>' + esc(D.long(c.start)) + '</dd>';
    rows += '<dt>Due</dt><dd>' + esc(D.long(c.due)) +
      ' <span class="repeat-tag">(' + (it.repeat ? esc(lowerFirst(R.describe(it, list))) : 'doesn’t repeat') + ')</span></dd>';
    rows += '<dd class="actions">' +
      '<button type="button" class="link" data-action="edit-task" data-list="' + list + '" data-id="' + it.id + '">Edit</button>' +
      '<button type="button" class="link danger" data-action="delete-item" data-store="' + list + '" data-id="' + it.id + '">Delete</button></dd>';
    return '<dl class="detail">' + rows + '</dl>';
  }

  const GRIP = '<svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true"><g fill="currentColor"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/></g></svg>';

  function rowHTML(list, it, group) {
    const key = list + ':' + it.id;
    const editing = ui.editing === key;
    const open = editing || ui.open.has(key);
    const c = cur(list, it);
    const status = statusOf(list, it);
    const st = STATUS[status];
    const body = editing
      ? Form.html({ context: list, draft: toDraft(list, it), isNew: false, store: list, id: it.id })
      : detailHTML(list, it, c);
    const label = headOf(it) + (subOf(it) ? ', ' + subOf(it) : '');
    return '<li class="task' + (status === 'done' ? ' done' : '') + (open ? ' open' : '') + '" data-id="' + it.id + '" data-key="' + key + '" data-group="' + group + '">' +
      '<div class="task-row">' +
        '<button type="button" class="grip" data-grip aria-label="Move ' + esc(label) + '. Use the up and down arrow keys." title="Drag to reorder">' + GRIP + '</button>' +
        '<button type="button" class="status-btn s-' + status + '" data-action="status" data-list="' + list + '" data-id="' + it.id + '" aria-haspopup="menu" aria-label="Status: ' + st.label + '. Change status" title="' + st.label + '"><span class="dot"></span></button>' +
        '<button type="button" class="task-main" data-action="toggle" aria-expanded="' + open + '">' +
          '<span class="task-name">' + esc(headOf(it)) + '</span>' +
          (subOf(it) ? '<span class="task-module">' + esc(subOf(it)) + '</span>' : '') +
        '</button>' +
        dueCell(it, c, status) +
        '<button type="button" class="chev" data-action="toggle" aria-expanded="' + open + '" aria-label="' + (open ? 'Hide' : 'Show') + ' details for ' + esc(headOf(it) + (subOf(it) ? ', ' + subOf(it) : '')) + '">' + CHEV + '</button>' +
      '</div>' +
      '<div class="reveal"><div class="reveal-inner">' + body + '</div></div>' +
    '</li>';
  }

  const STATUS_RANK = { doing: 0, todo: 1, done: 2 };

  // Automatic order: earliest due first; on the same day In progress, then
  // Not started. (Completed items are split off into their own group.)
  function autoSort(list, items) {
    return items.map(function (it, i) {
      return { it: it, i: i, due: cur(list, it).due, rank: STATUS_RANK[statusOf(list, it)], head: headOf(it).toLowerCase() };
    }).sort(function (a, b) {
      return a.due < b.due ? -1 : a.due > b.due ? 1 :
        (a.rank - b.rank) || (a.head < b.head ? -1 : a.head > b.head ? 1 : a.i - b.i);
    }).map(function (x) { return x.it; });
  }

  function hasCustomOrder(list) {
    return !!(state.order && Array.isArray(state.order[list]) && state.order[list].length);
  }

  // Once a list has been dragged, the saved order wins. Items that aren't in
  // it yet (new ones) are slotted in by due date.
  function ordered(list, items) {
    const auto = autoSort(list, items);
    if (!hasCustomOrder(list)) return auto;
    const pos = {};
    state.order[list].forEach(function (id, i) { pos[id] = i; });
    const placed = items.filter(function (it) { return pos[it.id] != null; })
      .sort(function (a, b) { return pos[a.id] - pos[b.id]; });
    auto.forEach(function (it) {
      if (pos[it.id] != null) return;
      const due = cur(list, it).due;
      const at = placed.findIndex(function (x) { return cur(list, x).due > due; });
      if (at < 0) placed.push(it); else placed.splice(at, 0, it);
    });
    return placed;
  }

  // Completed items always sit at the bottom of their group.
  function splitDone(list, items) {
    const all = ordered(list, items);
    return {
      active: all.filter(function (i) { return statusOf(list, i) !== 'done'; }),
      done: all.filter(function (i) { return statusOf(list, i) === 'done'; })
    };
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
    const adding = ui.editing === 'new:' + list;
    // An item being edited stays visible even if its dates move it to "later".
    const editingLater = later.some(function (it) { return ui.editing === list + ':' + it.id; });
    const showLater = ui.later[list] || editingLater;

    let html = '';
    if (!now.length && !adding) {
      html += '<li class="empty">No ' + LISTS[list].plural + ' due this week.' + (later.length ? '' : ' Add one below.') + '</li>';
    }
    const n = splitDone(list, now);
    n.active.forEach(function (it) { html += rowHTML(list, it, 'now'); });
    n.done.forEach(function (it) { html += rowHTML(list, it, 'now-done'); });
    if (later.length && showLater) {
      html += '<li class="later-head">Due later</li>';
      const l = splitDone(list, later);
      l.active.forEach(function (it) { html += rowHTML(list, it, 'later'); });
      l.done.forEach(function (it) { html += rowHTML(list, it, 'later-done'); });
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
    let right = '';
    if (hasCustomOrder(list)) {
      right += '<button type="button" class="link later-toggle" data-action="auto-sort" data-list="' + list + '" title="You’ve arranged this list by hand. Click to go back to automatic order.">Sort by due date</button>';
    }
    if (later.length && !editingLater) {
      right += '<button type="button" class="link later-toggle" data-action="toggle-later" data-list="' + list + '" aria-expanded="' + showLater + '">' +
        (showLater ? 'Hide later' : later.length + ' due later') + '</button>';
    }
    if (right) foot += '<span class="foot-right">' + right + '</span>';
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

  /* ---------- Reordering (drag, or arrow keys on the handle) ---------- */

  function saveOrderFromDOM(list) {
    const ul = $('[data-list="' + list + '"]');
    const shown = $$('li.task[data-id]', ul).map(function (li) { return li.dataset.id; });
    const rest = ordered(list, state[list]).map(function (it) { return it.id; })
      .filter(function (id) { return shown.indexOf(id) < 0; });
    state.order = state.order || {};
    state.order[list] = shown.concat(rest);
    save();
  }

  function siblingsOf(li) {
    return $$('li.task[data-group="' + li.dataset.group + '"]', li.parentElement);
  }

  function slide(el, fromTop) {
    if (reduceMotion.matches) return;
    const d = fromTop - el.getBoundingClientRect().top;
    if (Math.abs(d) > 1) el.animate([{ transform: 'translateY(' + d + 'px)' }, { transform: 'none' }], { duration: 160, easing: 'ease-out' });
  }

  let drag = null;

  document.addEventListener('pointerdown', function (e) {
    const grip = e.target.closest('[data-grip]');
    if (!grip || e.button > 0 || ui.editing) return;
    const li = grip.closest('li.task');
    if (siblingsOf(li).length < 2) return;
    e.preventDefault();
    closeMenu(false);
    try { grip.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    drag = { li: li, list: li.parentElement.dataset.list, startY: e.clientY, startTop: li.offsetTop, moved: false };
  });

  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.abs(dy) < 4) return;
      drag.moved = true;
      drag.li.classList.add('dragging');
      document.body.classList.add('is-dragging');
    }
    const li = drag.li;
    const top = drag.startTop + dy;
    const sibs = siblingsOf(li);
    const i = sibs.indexOf(li);
    const prev = sibs[i - 1], next = sibs[i + 1];
    if (prev && top < prev.offsetTop + prev.offsetHeight / 2) {
      const r = prev.getBoundingClientRect().top;
      li.parentElement.insertBefore(li, prev);
      slide(prev, r);
    } else if (next && top + li.offsetHeight > next.offsetTop + next.offsetHeight / 2) {
      const r = next.getBoundingClientRect().top;
      li.parentElement.insertBefore(next, li);
      slide(next, r);
    }
    li.style.transform = 'translateY(' + (top - li.offsetTop) + 'px)';
    if (e.clientY < 48) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 48) window.scrollBy(0, 12);
  });

  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    document.body.classList.remove('is-dragging');
    if (!d.moved) return;
    d.li.classList.remove('dragging');
    d.li.style.transform = '';
    saveOrderFromDOM(d.list);
    renderTasks(d.list);
    focusLater('[data-list="' + d.list + '"] li[data-id="' + d.li.dataset.id + '"] [data-grip]');
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  document.addEventListener('keydown', function (e) {
    const grip = e.target.closest && e.target.closest('[data-grip]');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const li = grip.closest('li.task');
    const sibs = siblingsOf(li);
    const i = sibs.indexOf(li);
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (j < 0 || j >= sibs.length) return;
    if (j < i) li.parentElement.insertBefore(li, sibs[j]);
    else li.parentElement.insertBefore(sibs[j], li);
    const list = li.parentElement.dataset.list;
    saveOrderFromDOM(list);
    renderTasks(list);
    focusLater('[data-list="' + list + '"] li[data-id="' + li.dataset.id + '"] [data-grip]');
  });

  /* ---------- Status menu ---------- */

  const menu = $('#status-menu');
  let menuTarget = null;
  let menuAnchor = null;

  function positionMenu() {
    const r = menuAnchor.getBoundingClientRect();
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = r.top - mh - 4;
    menu.style.top = Math.max(8, top) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8)) + 'px';
  }

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
    menuAnchor = btn;
    positionMenu();
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
    menuAnchor = null;
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
  function fullLabel(e) { return (e.module ? e.module + ': ' : '') + chipLabel(e); }

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
    let title = fullLabel(e);
    if (e.role === 'range') title += ' (' + roleText(e) + ')';
    else if (e.role === 'due' && R.isTask(e.store)) title += ', due ' + D.long(date);
    if (e.status) title += ', ' + STATUS[e.status].label.toLowerCase();
    let text;
    if (!showText) text = '<span class="sr">' + esc(chipLabel(e)) + '</span>';
    else if (e.module) {
      cls.push('two');
      const item = e.role === 'release' ? 'Released: ' + e.name : e.role === 'start' ? 'Starts: ' + e.name : e.name;
      text = '<span class="ev-c">' + esc(e.module) + '</span><span class="ev-i">' + esc(item) + '</span>';
    } else text = '<span class="ev-c">' + esc(chipLabel(e)) + '</span>';
    return '<button type="button" class="' + cls.join(' ') + '" data-action="cal-open" data-store="' + e.store + '" data-id="' + e.id + '" data-occ="' + esc(e.occ || '') + '" data-date="' + date + '" title="' + esc(title) + '">' +
      '<span class="mk" aria-hidden="true"></span><span class="ev-t">' + text + '</span></button>';
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
        const classes = group.map(function (x) { return x.module || x.name; }).filter(function (v, k, a) { return a.indexOf(v) === k; });
        out.push('<button type="button" class="ev two g-' + e.group + ' r-due' + (done === n ? ' is-done' : '') + '" data-action="cal-select" data-date="' + date + '" title="' +
          esc(label + (done ? ', ' + done + ' done' : '') + ': ' + group.map(fullLabel).join('; ')) + '">' +
          '<span class="mk" aria-hidden="true"></span><span class="ev-t"><span class="ev-c">' + label + '</span>' +
          '<span class="ev-i">' + esc(classes.join(', ')) + '</span></span></button>');
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
        const shown = chips.length <= 3 ? chips : chips.slice(0, 2);
        const more = chips.length - shown.length;
        grid += '<div class="' + cls.join(' ') + '" role="gridcell" data-action="cal-select" data-date="' + date + '">' +
          '<div class="cal-top"><button type="button" class="cal-day" data-action="cal-select" data-date="' + date + '" aria-label="' + D.long(date) + (items.length ? ', ' + items.length + ' item' + (items.length > 1 ? 's' : '') : '') + '"' +
            (date === ui.cal.selected ? ' aria-current="date"' : '') + '>' + dObj.getDate() + '</button>' +
          '<button type="button" class="cal-add" data-action="cal-add" data-date="' + date + '" aria-label="Add event on ' + D.short(date) + '">+</button></div>' +
          '<div class="cal-evs">' + shown.join('') +
          (more > 0 ? '<button type="button" class="ev-more" data-action="cal-select" data-date="' + date + '" aria-label="Show all ' + items.length + ' items on ' + D.short(date) + '">+' + more + ' more</button>' : '') +
          '</div></div>';
      }
      grid += '</div>';
    }
    grid += '</div>';
    $('#cal-main').innerHTML = head + grid;
    renderSide();
  }

  function typeName(e) { return e.group === 'maths' ? TYPES[e.type].label : GROUPS[e.group].label; }

  function agendaRow(e) {
    const head = e.module || chipLabel(e);
    const subText = e.module ? chipLabel(e) : typeName(e);
    const role = roleText(e);
    let lead;
    if (e.status) {
      const st = STATUS[e.status];
      lead = '<button type="button" class="status-btn s-' + e.status + '" data-action="status" data-list="' + e.store + '" data-id="' + e.id + '" aria-haspopup="menu" aria-label="Status: ' + st.label + '. Change status" title="' + st.label + '"><span class="dot"></span></button>';
    } else {
      lead = '<span class="ag-mk g-' + e.group + ' r-' + e.role + '" aria-hidden="true"><span class="mk"></span></span>';
    }
    return '<li class="ag-item' + (e.status === 'done' ? ' is-done' : '') + '">' + lead +
      '<button type="button" class="ag-main" data-action="cal-open" data-store="' + e.store + '" data-id="' + e.id + '" data-occ="' + esc(e.occ || '') + '" data-date="' + (e.occ || '') + '" title="' + esc(typeName(e)) + '">' +
        '<span class="ag-name">' + esc(head) + '</span>' +
        '<span class="ag-sub">' + (e.status ? '<span class="mk g-' + e.group + '" aria-hidden="true"></span>' : '') + esc(subText) + '</span></button>' +
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
    if (ui.cal.view) {
      const v = ui.cal.view;
      const it = find(v.store, v.id);
      if (!it) { ui.cal.view = null; return renderSide(); }
      side.innerHTML = viewHTML(v.store, it, v.occ);
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

  // Read-only details for one item, shown when it's clicked on the calendar.
  function viewHTML(store, it, occ) {
    const type = typeOf(store, it);
    const group = groupOf(type);
    const task = R.isTask(store);
    const head = task ? headOf(it) : nameOf(store, it);
    const c = cur(store, it);
    let rows = '';
    if (task && it.module) rows += '<dt>Task</dt><dd>' + esc(it.name) + '</dd>';
    if (store === 'dates') {
      const o = it.repeat && occ ? (R.list(it, store, occ, occ)[0] || c) : c;
      rows += '<dt>When</dt><dd>' + esc(o.end ? D.range(o.start, o.end, D.parse(ui.today).getFullYear()) : D.long(o.start)) + '</dd>';
    } else {
      const o = task && R.isAcademic(it) ? (R.list(it, store, occ || c.due, occ || c.due).filter(function (x) { return x.due === (occ || c.due); })[0] || c)
        : (it.repeat && occ ? { due: occ, start: it.start ? D.addDays(occ, D.diffDays(it.due, it.start)) : '' } : c);
      if (o.release) rows += '<dt>Released</dt><dd>' + esc(D.long(o.release)) + '</dd>';
      if (o.start) rows += '<dt>Starts</dt><dd>' + esc(D.long(o.start)) + '</dd>';
      rows += '<dt>' + (task ? 'Due' : 'Date') + '</dt><dd>' + esc(D.long(o.due)) + '</dd>';
    }
    rows += '<dt>Repeats</dt><dd>' + (it.repeat ? esc(R.describe(it, store)) : 'Doesn’t repeat') + '</dd>';
    if (task && it.source) rows += '<dt>Where to find it</dt><dd>' + linkify(it.source) + '</dd>';
    const note = task ? it.details : it.note;
    if (note) rows += '<dt>Notes</dt><dd>' + linkify(note) + '</dd>';
    if (task) {
      const st = statusOf(store, it);
      const isCurrent = !occ || occ === c.due;
      rows += '<dt>Status</dt><dd class="view-status">' +
        '<button type="button" class="status-btn s-' + st + '" data-action="status" data-list="' + store + '" data-id="' + it.id + '" aria-haspopup="menu" aria-label="Status: ' + STATUS[st].label + '. Change status"><span class="dot"></span></button>' +
        '<span>' + STATUS[st].label + (isCurrent ? '' : '<span class="repeat-tag"> (for the one due ' + esc(D.short(c.due)) + ')</span>') + '</span></dd>';
    }
    return '<div class="panel-head view-head"><div><p class="view-type"><span class="mk g-' + group + '" aria-hidden="true"></span>' + esc(TYPES[type].label) + '</p>' +
        '<h2>' + esc(head) + '</h2></div></div>' +
      '<dl class="detail view-detail">' + rows + '</dl>' +
      '<div class="form-actions view-actions"><button type="button" class="btn" data-action="cal-edit" data-store="' + store + '" data-id="' + it.id + '">Edit</button>' +
        '<button type="button" class="link danger" data-action="delete-item" data-store="' + store + '" data-id="' + it.id + '">Delete</button>' +
        '<span class="spacer"></span><button type="button" class="link" data-action="cal-back">Back to ' + esc(D.short(ui.cal.selected)) + '</button></div>';
  }

  function selectDay(date) {
    ui.cal.selected = date;
    ui.cal.form = null;
    ui.cal.view = null;
    const m = date.slice(0, 8) + '01';
    if (m !== ui.cal.month) ui.cal.month = m;
    renderCalendar();
  }

  function openCalView(view) {
    ui.cal.view = view;
    ui.cal.form = null;
    if (view.date && view.date !== ui.cal.selected) {
      ui.cal.selected = view.date;
      const m = view.date.slice(0, 8) + '01';
      if (m !== ui.cal.month) ui.cal.month = m;
    }
    renderCalendar();
    focusLater('#cal-side [data-action="cal-edit"]');
  }

  function closeCalForm() {
    const f = ui.cal.form;
    ui.cal.form = null;
    if (f && f.back) ui.cal.view = f.back;
    renderCalendar();
    focusLater(ui.cal.view ? '#cal-side [data-action="cal-edit"]' : '#cal-side .add-btn');
  }

  function openCalForm(form) {
    ui.cal.form = form;
    if (form.isNew) ui.cal.view = null;
    if (form.date) {
      ui.cal.selected = form.date;
      const m = form.date.slice(0, 8) + '01';
      if (m !== ui.cal.month) ui.cal.month = m;
    }
    renderCalendar();
    focusFirstField('#cal-side form');
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

  function renderClassOptions() {
    const names = {};
    state.classes.forEach(function (c) { names[c.name] = true; });
    TASKS.forEach(function (k) { state[k].forEach(function (it) { if (it.module) names[it.module] = true; }); });
    $('#class-options').innerHTML = Object.keys(names).sort().map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
  }

  function refresh(animate) {
    renderHeader();
    renderClassOptions();
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
    focusFirstField('#dashboard form[data-form]');
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
      if (!isNew) {
        ui.cal.view = { store: saved.store, id: saved.id, occ: '' };
        renderCalendar();
      }
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

  function focusFirstField(formSel) {
    const form = document.querySelector(formSel);
    if (!form) return;
    const field = Array.from(form.querySelectorAll('input[type="text"]')).find(function (i) { return !i.closest('[hidden]'); });
    if (field) field.focus();
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
      case 'auto-sort':
        if (state.order) delete state.order[el.dataset.list];
        save();
        renderTasks(el.dataset.list, true);
        toast('Sorted by due date.');
        focusLater('[data-action="add-task"][data-list="' + el.dataset.list + '"]');
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
        if (el.closest('#cal-side')) closeCalForm();
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
      case 'cal-open': openCalView({ store: el.dataset.store, id: el.dataset.id, occ: el.dataset.occ || '', date: el.dataset.date }); break;
      case 'cal-edit': {
        const back = ui.cal.view;
        ui.cal.view = null;
        openCalForm({ isNew: false, store: el.dataset.store, id: el.dataset.id, back: back });
        break;
      }
      case 'cal-back': ui.cal.view = null; renderCalendar(); focusLater('.cal-cell.is-selected .cal-day'); break;
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
    if (!form && ui.view === 'calendar' && ui.cal.view && !ui.cal.form) {
      ui.cal.view = null; renderCalendar(); focusLater('.cal-cell.is-selected .cal-day'); return;
    }
    if (!form) return;
    e.preventDefault();
    if (form.closest('#cal-side')) closeCalForm();
    else if (ui.editing) stopEditing();
  });

  window.addEventListener('resize', function () { closeMenu(false); });
  // While the page scrolls, the menu follows its button; it closes once the button is off screen.
  window.addEventListener('scroll', function () {
    if (menu.hidden || !menuAnchor) return;
    const r = menuAnchor.getBoundingClientRect();
    if (!menuAnchor.isConnected || r.bottom < 0 || r.top > window.innerHeight) closeMenu(false);
    else positionMenu();
  }, { passive: true });
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
