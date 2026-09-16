(function () {
  'use strict';

  let state = Store.load();
  const ui = {
    open: new Set(),     // expanded rows: "readings:id", "homework:id", "class:id"
    editing: null,       // "readings:id", "new:readings", "class:id", "new:class", "date:id", "new:date"
    today: D.today()
  };

  const STATUS = {
    todo: { label: 'Not started', key: 'Red' },
    doing: { label: 'In progress', key: 'Yellow' },
    done: { label: 'Completed', key: 'Green' }
  };
  const LISTS = {
    readings: { singular: 'reading', title: 'Reading' },
    homework: { singular: 'homework', title: 'Homework' }
  };
  const CHEV = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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

  /* ---------- Weeks ---------- */

  function syncWeek() {
    ui.today = D.today();
    const current = D.mondayOf(ui.today);
    if (!state.weekOf) state.weekOf = current;
    if (state.weekOf === current) return false;

    if (state.weekOf < current) {
      ['readings', 'homework'].forEach(function (k) {
        state[k] = state[k].filter(function (it) {
          return it.recurring || it.status !== 'done'; // finished one-off items drop off
        });
        state[k].forEach(function (it) { if (it.recurring) it.status = 'todo'; });
      });
      state.weekOf = current;
      save();
      return 'reset';
    }
    state.weekOf = current; // clock moved backwards: follow it without wiping progress
    save();
    return 'moved';
  }

  function termWeek(monday) {
    return Math.floor(D.diffDays(state.term.start, monday) / 7) + 1;
  }

  function dueOf(it) {
    return it.recurring ? D.addDays(state.weekOf, it.dueOffset) : it.dueDate;
  }

  /* ---------- Header ---------- */

  function renderHeader() {
    const t = state.term;
    const wk = termWeek(state.weekOf);
    const sunday = D.addDays(state.weekOf, 6);
    let title;
    if (wk < 1) title = 'Before term';
    else if (wk > t.weeks) title = 'After teaching';
    else if (wk === t.readingWeek) title = 'Reading Week';
    else title = 'Week ' + wk;

    $('#term-name').textContent = t.name;
    $('#term-week').textContent = title;
    const sameMonth = D.parse(state.weekOf).getMonth() === D.parse(sunday).getMonth();
    $('#term-range').textContent = D.short(state.weekOf) + '–' + (sameMonth ? D.parse(sunday).getDate() : D.short(sunday));

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
    const all = state.readings.concat(state.homework);
    const done = all.filter(function (i) { return i.status === 'done'; }).length;
    $('#week-progress').textContent = all.length ? done + ' of ' + all.length + ' done this week' : 'Nothing due this week';

    const dark = effectiveTheme() === 'dark';
    const btn = $('#theme-toggle');
    btn.textContent = dark ? 'Light mode' : 'Dark mode';
    btn.setAttribute('aria-label', 'Switch to ' + (dark ? 'light' : 'dark') + ' mode');
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

  function orderedItems(list) {
    const items = state[list];
    return items.filter(function (i) { return i.status !== 'done'; })
      .concat(items.filter(function (i) { return i.status === 'done'; }));
  }

  function dueCell(it) {
    const due = dueOf(it);
    if (!due) return '<span class="task-due">—</span>';
    const cls = ['task-due'];
    let title = D.long(due);
    if (it.status !== 'done') {
      if (due === ui.today) { cls.push('today'); title += ' (today)'; }
      else if (due < ui.today) { cls.push('late'); title += ' (overdue)'; }
    }
    return '<span class="' + cls.join(' ') + '" title="' + title + '">' + D.short(due) + '</span>';
  }

  function detailHTML(list, it) {
    const wk = termWeek(state.weekOf);
    const due = dueOf(it);
    let rows = '';
    if (it.module) rows += '<dt>Module</dt><dd>' + esc(it.module) + '</dd>';
    rows += '<dt>What</dt><dd>' + esc(it.name) + '</dd>';
    if (it.schedule[wk]) rows += '<dt>This week</dt><dd>' + linkify(it.schedule[wk]) + '</dd>';
    if (it.schedule[wk + 1]) rows += '<dt>Next week</dt><dd>' + linkify(it.schedule[wk + 1]) + '</dd>';
    rows += '<dt>Where to find it</dt><dd>' + (it.source ? linkify(it.source) : '<span class="repeat-tag">Not added yet</span>') + '</dd>';
    if (it.details) rows += '<dt>Notes</dt><dd>' + linkify(it.details) + '</dd>';
    rows += '<dt>Due</dt><dd>' + (due ? esc(D.long(due)) : '—') +
      ' <span class="repeat-tag">(' + (it.recurring ? 'repeats every ' + D.weekday(due) : 'one-off') + ')</span></dd>';
    rows += '<dd class="actions">' +
      '<button type="button" class="link" data-action="edit-task" data-list="' + list + '" data-id="' + it.id + '">Edit</button>' +
      '<button type="button" class="link danger" data-action="delete-task" data-list="' + list + '" data-id="' + it.id + '">Delete</button></dd>';
    return '<dl class="detail">' + rows + '</dl>';
  }

  function scheduleText(schedule) {
    return Object.keys(schedule).map(Number).sort(function (a, b) { return a - b; })
      .map(function (k) { return k + ': ' + schedule[k]; }).join('\n');
  }
  function parseSchedule(text) {
    const out = {};
    text.split('\n').forEach(function (line) {
      const m = line.match(/^\s*(?:w(?:ee)?k?\s*)?(\d{1,2})\s*[:.\-–]\s*(.+?)\s*$/i);
      if (m) out[Number(m[1])] = m[2];
    });
    return out;
  }

  function taskFormHTML(list, it, isNew) {
    const meta = LISTS[list];
    const due = it ? dueOf(it) : defaultDue();
    const v = it || { name: '', module: '', source: '', details: '', schedule: {}, recurring: true };
    const where = list === 'readings' ? 'Where to find it' : 'Where to find it / submit it';
    return '<form class="form' + (isNew ? ' new' : '') + '" data-form="task" data-list="' + list + '" data-id="' + (it ? it.id : '') + '" novalidate>' +
      '<label class="full">' + meta.title + ' name<input type="text" name="name" value="' + esc(v.name) + '" required placeholder="' + (list === 'readings' ? 'e.g. Varian chapters' : 'e.g. Problem set') + '"></label>' +
      '<label>Module<input type="text" name="module" value="' + esc(v.module) + '" placeholder="e.g. Economics A"></label>' +
      '<label>Due date<input type="date" name="due" value="' + esc(due) + '" required></label>' +
      '<label class="check full"><input type="checkbox" name="recurring"' + (v.recurring ? ' checked' : '') + '> Repeats every week on this day</label>' +
      '<label class="full">' + where + '<textarea name="source" rows="2" placeholder="Blackboard, library, a link…">' + esc(v.source) + '</textarea></label>' +
      '<label class="full">Notes<textarea name="details" rows="2">' + esc(v.details) + '</textarea></label>' +
      '<label class="full">Week-by-week (optional)<textarea name="schedule" rows="3" placeholder="3: S&S Ch 8 & 9">' + esc(scheduleText(v.schedule)) + '</textarea>' +
      '<span class="hint">One line per term week. The current week’s line shows when you open this item.</span></label>' +
      '<div class="form-actions"><button type="submit" class="btn primary">' + (isNew ? 'Add ' + meta.singular : 'Save changes') + '</button>' +
      '<button type="button" class="btn" data-action="cancel-edit">Cancel</button></div>' +
      '</form>';
  }

  function defaultDue() {
    const sunday = D.addDays(state.weekOf, 6);
    return ui.today > sunday ? ui.today : sunday;
  }

  function renderTasks(list, animate) {
    const ul = $('[data-list="' + list + '"]');
    const before = {};
    if (animate && !reduceMotion.matches) {
      $$('li[data-id]', ul).forEach(function (li) { before[li.dataset.id] = li.getBoundingClientRect().top; });
    }

    const items = orderedItems(list);
    let html = '';
    if (!items.length && ui.editing !== 'new:' + list) {
      html = '<li class="empty">No ' + (list === 'readings' ? 'readings' : 'homework') + ' this week. Add one below.</li>';
    }
    items.forEach(function (it) {
      const key = list + ':' + it.id;
      const editing = ui.editing === key;
      const open = editing || ui.open.has(key);
      const st = STATUS[it.status];
      html += '<li class="task' + (it.status === 'done' ? ' done' : '') + (open ? ' open' : '') + '" data-id="' + it.id + '" data-key="' + key + '">' +
        '<div class="task-row">' +
          '<button type="button" class="status-btn s-' + it.status + '" data-action="status" data-list="' + list + '" data-id="' + it.id + '" aria-haspopup="menu" aria-label="Status: ' + st.label + '. Change status" title="' + st.label + '"><span class="dot"></span></button>' +
          '<button type="button" class="task-main" data-action="toggle" aria-expanded="' + open + '">' +
            '<span class="task-name">' + esc(it.name) + '</span>' +
            (it.module ? '<span class="task-module">' + esc(it.module) + '</span>' : '') +
          '</button>' +
          dueCell(it) +
          '<button type="button" class="chev" data-action="toggle" aria-expanded="' + open + '" aria-label="' + (open ? 'Hide' : 'Show') + ' details for ' + esc(it.name) + '">' + CHEV + '</button>' +
        '</div>' +
        '<div class="reveal"><div class="reveal-inner">' + (editing ? taskFormHTML(list, it, false) : detailHTML(list, it)) + '</div></div>' +
      '</li>';
    });
    if (ui.editing === 'new:' + list) html += '<li class="new-item">' + taskFormHTML(list, null, true) + '</li>';
    ul.innerHTML = html;

    const done = state[list].filter(function (i) { return i.status === 'done'; }).length;
    $('[data-count="' + list + '"]').textContent = state[list].length ? done + ' of ' + state[list].length + ' done' : '';
    $('[data-foot="' + list + '"]').innerHTML = ui.editing === 'new:' + list ? '' :
      '<button type="button" class="add-btn" data-action="add-task" data-list="' + list + '"><span class="plus" aria-hidden="true">+</span> Add ' + LISTS[list].singular + '</button>';

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

  function saveTask(form) {
    const list = form.dataset.list;
    const f = form.elements;
    const name = f.name.value.trim();
    const due = f.due.value;
    $$('.field-error', form).forEach(function (e) { e.remove(); });
    let error = '';
    if (!name) error = 'Add a name.';
    else if (!D.isValid(due)) error = 'Pick a due date.';
    if (error) {
      form.querySelector('.form-actions').insertAdjacentHTML('beforebegin', '<p class="field-error">' + error + '</p>');
      (name ? f.due : f.name).focus();
      return;
    }
    const recurring = f.recurring.checked;
    const data = {
      name: name,
      module: f.module.value.trim(),
      source: f.source.value.trim(),
      details: f.details.value.trim(),
      schedule: parseSchedule(f.schedule.value),
      recurring: recurring,
      dueOffset: recurring ? D.diffDays(state.weekOf, due) : 6,
      dueDate: recurring ? '' : due
    };
    let id = form.dataset.id;
    if (id) {
      Object.assign(state[list].find(function (i) { return i.id === id; }), data);
    } else {
      id = uid(list[0]);
      state[list].push(Object.assign({ id: id, status: 'todo' }, data));
    }
    ui.editing = null;
    save();
    renderTasks(list, !form.dataset.id);
    renderHeader();
    focusLater('[data-list="' + list + '"] li[data-id="' + id + '"] .task-main');
  }

  function deleteTask(list, id) {
    const idx = state[list].findIndex(function (i) { return i.id === id; });
    if (idx < 0) return;
    const [item] = state[list].splice(idx, 1);
    ui.open.delete(list + ':' + id);
    save();
    renderTasks(list, true);
    renderHeader();
    toast('Deleted “' + item.name + '”', function () {
      state[list].splice(Math.min(idx, state[list].length), 0, item);
      save();
      renderTasks(list, true);
      renderHeader();
    });
  }

  /* ---------- Status menu ---------- */

  const menu = $('#status-menu');
  let menuTarget = null;

  function openMenu(btn) {
    const it = state[btn.dataset.list].find(function (i) { return i.id === btn.dataset.id; });
    if (!it) return;
    menuTarget = { list: btn.dataset.list, id: it.id };
    menu.innerHTML = ['todo', 'doing', 'done'].map(function (s) {
      return '<button type="button" role="menuitemradio" data-status="' + s + '" aria-checked="' + (it.status === s) + '">' +
        '<span class="dot s-' + s + '"></span>' + STATUS[s].label + '<span class="key">' + STATUS[s].key + '</span></button>';
    }).join('');
    menu.hidden = false;
    const r = btn.getBoundingClientRect();
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = r.top - mh - 4;
    menu.style.top = Math.max(8, top) + 'px';
    menu.style.left = Math.min(r.left, window.innerWidth - mw - 8) + 'px';
    const current = menu.querySelector('[aria-checked="true"]');
    (current || menu.firstElementChild).focus();
  }

  function closeMenu(refocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (refocus && menuTarget) focusLater('[data-list="' + menuTarget.list + '"] li[data-id="' + menuTarget.id + '"] .status-btn');
    menuTarget = null;
  }

  function setStatus(status) {
    if (!menuTarget) return;
    const t = menuTarget;
    const it = state[t.list].find(function (i) { return i.id === t.id; });
    closeMenu(false);
    if (it && it.status !== status) {
      it.status = status;
      save();
      renderTasks(t.list, true);
      renderHeader();
    }
    focusLater('[data-list="' + t.list + '"] li[data-id="' + t.id + '"] .status-btn');
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
      const c = state.classes.find(function (x) { return x.id === id; });
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

  function sortedDates() {
    return state.dates.slice().sort(function (a, b) {
      return a.start < b.start ? -1 : a.start > b.start ? 1 : (a.end || a.start) < (b.end || b.start) ? -1 : 1;
    });
  }

  function relText(d) {
    const end = d.end || d.start;
    if (end < ui.today) return '';
    if (d.start <= ui.today) return d.end && d.end !== d.start ? 'Now' : 'Today';
    const n = D.diffDays(ui.today, d.start);
    if (n === 1) return 'Tomorrow';
    if (n < 14) return 'In ' + n + ' days';
    return 'In ' + Math.round(n / 7) + ' weeks';
  }

  function dateFormHTML(d) {
    const v = d || { title: '', start: ui.today, end: '', note: '' };
    return '<form class="form date-form' + (d ? '' : ' new') + '" data-form="date" data-id="' + (d ? d.id : '') + '" novalidate>' +
      '<label class="full">What’s happening<input type="text" name="title" value="' + esc(v.title) + '" placeholder="e.g. Essay due" required></label>' +
      '<label>Date<input type="date" name="start" value="' + esc(v.start) + '" required></label>' +
      '<label>End date (for a range)<input type="date" name="end" value="' + esc(v.end) + '"></label>' +
      '<label class="full">Note<input type="text" name="note" value="' + esc(v.note) + '" placeholder="Optional"></label>' +
      '<div class="form-actions"><button type="submit" class="btn primary">' + (d ? 'Save changes' : 'Add date') + '</button>' +
      '<button type="button" class="btn" data-action="cancel-edit">Cancel</button></div></form>';
  }

  function renderDates() {
    const ul = $('#dates');
    const year = D.parse(ui.today).getFullYear();
    const list = sortedDates();
    const next = list.find(function (d) { return d.start > ui.today; });
    let html = '';
    if (!list.length && ui.editing !== 'new:date') html = '<li class="empty">No dates yet. Add one below.</li>';
    list.forEach(function (d) {
      if (ui.editing === 'date:' + d.id) { html += '<li class="date-item" data-id="' + d.id + '">' + dateFormHTML(d) + '</li>'; return; }
      const end = d.end || d.start;
      const cls = ['date-item'];
      if (end < ui.today) cls.push('past');
      else if (d.start <= ui.today) cls.push('current');
      if (next && d.start === next.start) cls.push('next');
      html += '<li class="' + cls.join(' ') + '" data-id="' + d.id + '"><div class="date-row">' +
        '<span class="date-when">' + esc(D.range(d.start, d.end, year)) + '</span>' +
        '<span><span class="date-title">' + esc(d.title) + '</span>' + (d.note ? '<span class="date-note">' + esc(d.note) + '</span>' : '') + '</span>' +
        '<span class="date-side"><span class="rel">' + relText(d) + '</span><span class="date-actions">' +
          '<button type="button" class="link" data-action="edit-date" data-id="' + d.id + '" aria-label="Edit ' + esc(d.title) + '">Edit</button>' +
          '<button type="button" class="link danger" data-action="delete-date" data-id="' + d.id + '" aria-label="Delete ' + esc(d.title) + '">Delete</button>' +
        '</span></span></div></li>';
    });
    if (ui.editing === 'new:date') html += '<li class="new-item">' + dateFormHTML(null) + '</li>';
    ul.innerHTML = html;
    const upcoming = list.filter(function (d) { return (d.end || d.start) >= ui.today; }).length;
    $('#dates-meta').textContent = upcoming + ' upcoming';
    $('#dates-foot').innerHTML = ui.editing === 'new:date' ? '' :
      '<button type="button" class="add-btn" data-action="add-date"><span class="plus" aria-hidden="true">+</span> Add date</button>';
  }

  function saveDate(form) {
    const f = form.elements;
    const title = f.title.value.trim();
    const start = f.start.value;
    let end = f.end.value;
    $$('.field-error', form).forEach(function (e) { e.remove(); });
    let bad = '';
    if (!title) bad = 'Add a title.';
    else if (!D.isValid(start)) bad = 'Pick a date.';
    else if (end && !D.isValid(end)) bad = 'The end date isn’t valid.';
    else if (end && end < start) bad = 'The end date must be after the start date.';
    if (bad) {
      form.querySelector('.form-actions').insertAdjacentHTML('beforebegin', '<p class="field-error">' + bad + '</p>');
      return;
    }
    if (end === start) end = '';
    const data = { title: title, start: start, end: end, note: f.note.value.trim() };
    let id = form.dataset.id;
    if (id) Object.assign(state.dates.find(function (d) { return d.id === id; }), data);
    else { id = uid('d'); state.dates.push(Object.assign({ id: id }, data)); }
    ui.editing = null;
    save();
    renderDates();
    focusLater('#dates li[data-id="' + id + '"] [data-action="edit-date"]');
  }

  function deleteDate(id) {
    const idx = state.dates.findIndex(function (d) { return d.id === id; });
    if (idx < 0) return;
    const [d] = state.dates.splice(idx, 1);
    save();
    renderDates();
    toast('Deleted “' + d.title + '”', function () {
      state.dates.splice(idx, 0, d);
      save();
      renderDates();
    });
  }

  /* ---------- Editing coordination ---------- */

  function startEditing(key) {
    const prev = ui.editing;
    ui.editing = key;
    rerenderFor(prev);
    rerenderFor(key);
    const first = document.querySelector('form[data-form] input[type="text"]');
    if (first) first.focus();
  }
  function stopEditing() {
    const prev = ui.editing;
    ui.editing = null;
    rerenderFor(prev);
    if (prev) {
      const [kind, id] = prev.split(':');
      if (id && kind === 'class') focusLater('#classes li[data-id="' + id + '"] .class-name');
      else if (id && kind === 'date') focusLater('#dates li[data-id="' + id + '"] [data-action="edit-date"]');
      else if (id && kind !== 'new') focusLater('[data-list="' + kind + '"] li[data-id="' + id + '"] .task-main');
      else if (kind === 'new') focusLater('[data-action^="add-"]' + (id === 'class' ? '[data-action="add-class"]' : id === 'date' ? '[data-action="add-date"]' : '[data-list="' + id + '"]'));
    }
  }
  function rerenderFor(key) {
    if (!key) return;
    const [kind, id] = key.split(':');
    const target = kind === 'new' ? id : kind;
    if (target === 'readings' || target === 'homework') renderTasks(target);
    else if (target === 'class') renderClasses();
    else if (target === 'date') renderDates();
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
      case 'edit-task': startEditing(el.dataset.list + ':' + el.dataset.id); break;
      case 'delete-task': deleteTask(el.dataset.list, el.dataset.id); break;
      case 'add-task': startEditing('new:' + el.dataset.list); break;
      case 'cancel-edit': stopEditing(); break;
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
      case 'add-date': startEditing('new:date'); break;
      case 'edit-date': startEditing('date:' + el.dataset.id); break;
      case 'delete-date': deleteDate(el.dataset.id); break;
    }
  });

  document.addEventListener('submit', function (e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === 'task') saveTask(form);
    else if (form.dataset.form === 'class') saveClass(form);
    else if (form.dataset.form === 'date') saveDate(form);
  });

  document.addEventListener('input', function (e) {
    if (e.target.name === 'pweight') updateLiveTotal(e.target.closest('form'));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!menu.hidden) { closeMenu(true); return; }
      if (ui.editing && e.target.closest('form[data-form]')) { e.preventDefault(); stopEditing(); }
    }
  });

  window.addEventListener('resize', function () { closeMenu(false); });
  window.addEventListener('scroll', function () { closeMenu(false); }, { passive: true });

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
      syncWeek();
      applyTheme();
      save();
      ui.open.clear(); ui.editing = null;
      renderAll();
      toast('Backup imported.');
    });
  });

  /* Keep the week in step with the calendar while the page stays open. */
  function tick() {
    const prevToday = ui.today;
    const result = syncWeek();
    if (!result && prevToday === ui.today) return;
    if (ui.editing) { renderHeader(); return; } // don't wipe a form mid-edit
    renderAll();
    if (result === 'reset') toast('New week. Your lists have been reset.');
  }
  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  window.addEventListener('focus', tick);

  // Another tab changed the data.
  window.addEventListener('storage', function (e) {
    if (e.key !== Store.KEY || !e.newValue || ui.editing) return;
    try { state = Store.normalise(JSON.parse(e.newValue)); applyTheme(); renderAll(); } catch (err) { /* ignore */ }
  });

  function renderAll() {
    renderHeader();
    renderTasks('readings');
    renderTasks('homework');
    renderClasses();
    renderDates();
  }

  applyTheme();
  const initial = syncWeek();
  save();
  renderAll();
  if (initial === 'reset') toast('New week. Your lists have been reset.');
})();
