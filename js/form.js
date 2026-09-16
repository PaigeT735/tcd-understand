/* One form for every dated item: Weekly Reading, Weekly HW, Essential Dates
   and Calendar events all use it, so they save the same way. */
(function () {
  const TYPES = {
    reading: { label: 'Reading', store: 'readings', kind: 'reading', academic: true },
    hw: { label: 'Weekly HW', store: 'homework', kind: 'hw', academic: true },
    math: { label: 'Math', store: 'homework', kind: 'maths', subject: 'Math', academic: true },
    stats: { label: 'Statistics', store: 'homework', kind: 'maths', subject: 'Statistics', academic: true },
    essential: { label: 'Essential date', store: 'dates' },
    other: { label: 'Other', store: 'events' }
  };
  const CONTEXT = {
    readings: { types: ['reading'], name: 'Reading name', placeholder: 'e.g. Varian chapters', add: 'Add reading' },
    homework: { types: ['hw', 'math', 'stats'], name: 'Homework name', placeholder: 'e.g. Problem set', add: 'Add homework' },
    dates: { types: ['essential'], name: 'What’s happening', placeholder: 'e.g. Essay due', add: 'Add date' },
    calendar: { types: ['reading', 'hw', 'math', 'stats', 'essential', 'other'], name: 'Event name', placeholder: 'e.g. Microeconomics essay', add: 'Add event' }
  };
  const PRESETS = ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'yearly', 'custom'];
  const PRESET_LABEL = {
    none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', biweekly: 'Every 2 weeks',
    monthly: 'Monthly', bimonthly: 'Every 2 months', yearly: 'Yearly', custom: 'Custom…'
  };
  const UNITS = [['days', 'day'], ['weeks', 'week'], ['months', 'month'], ['years', 'year']];
  const UNIT_FREQ = { days: 'daily', weeks: 'weekly', months: 'monthly', years: 'yearly' };
  const FREQ_UNIT = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' };
  const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function option(value, label, selected) {
    return '<option value="' + value + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  function emptyRepeat() { return { on: false, preset: 'weekly', interval: 1, unit: 'weeks', days: [], until: '' }; }

  function repeatToDraft(r) {
    if (!r) return emptyRepeat();
    return {
      on: true,
      preset: r.preset in PRESET_LABEL ? r.preset : 'custom',
      interval: r.interval || 1,
      unit: FREQ_UNIT[r.freq] || 'weeks',
      days: (r.days || []).slice(),
      until: r.until || ''
    };
  }

  function draftToRepeat(d) {
    if (!d.on) return null;
    if (R.FIXED[d.preset]) {
      const f = R.FIXED[d.preset];
      return { preset: d.preset, freq: f.freq, interval: f.interval, days: [], until: d.until };
    }
    return {
      preset: 'custom', freq: UNIT_FREQ[d.unit] || 'weekly',
      interval: Math.max(1, d.interval), days: d.unit === 'weeks' ? d.days : [], until: d.until
    };
  }

  function repeatHTML(r) {
    return '<fieldset class="repeat full"><legend>Does this repeat?</legend>' +
      '<div class="choice">' +
        '<label><input type="radio" name="rep" value="no"' + (r.on ? '' : ' checked') + '> No</label>' +
        '<label><input type="radio" name="rep" value="yes"' + (r.on ? ' checked' : '') + '> Yes</label>' +
      '</div>' +
      '<div class="rep-body" data-show="rep-yes">' +
        '<div class="rep-line"><span class="rep-label">Repeats</span><span class="rep-ctrl"><select name="preset" aria-label="Repeats">' +
          PRESETS.map(function (p) { return option(p, PRESET_LABEL[p], r.preset); }).join('') + '</select></span></div>' +
        '<div class="rep-line" data-show="custom"><span class="rep-label">Every</span><span class="rep-ctrl">' +
          '<input type="number" name="interval" min="1" max="99" value="' + esc(r.interval) + '" aria-label="How often">' +
          '<select name="unit" aria-label="Unit">' + UNITS.map(function (u) { return option(u[0], u[0], r.unit); }).join('') + '</select></span></div>' +
        '<div class="rep-line" data-show="custom-weeks"><span class="rep-label">On</span><span class="rep-ctrl days">' +
          LETTERS.map(function (l, i) {
            return '<label class="day" title="' + DAY_NAMES[i] + '"><input type="checkbox" name="days" value="' + i + '"' +
              (r.days.indexOf(i) >= 0 ? ' checked' : '') + ' aria-label="' + DAY_NAMES[i] + '"><span>' + l + '</span></label>';
          }).join('') + '</span></div>' +
        '<p class="hint" data-show="class-weekly">Follows the class week: resets to Not started every Monday.</p>' +
        '<p class="hint" data-show="maths-weekly">Released Wednesday, due Tuesday. Resets to Not started every Tuesday.</p>' +
        '<div class="rep-line"><span class="rep-label">Ends</span><span class="rep-ctrl">' +
          '<label><input type="radio" name="ends" value="never"' + (r.until ? '' : ' checked') + '> Never</label>' +
          '<span class="ends-on"><label><input type="radio" name="ends" value="on"' + (r.until ? ' checked' : '') + '> On</label>' +
          '<input type="date" name="until" value="' + esc(r.until) + '" aria-label="Repeat end date"></span></span></div>' +
      '</div></fieldset>';
  }

  /* o = { context, draft, isNew, store, id } */
  function html(o) {
    const c = CONTEXT[o.context];
    const d = o.draft;
    const multi = c.types.length > 1;
    let h = '<form class="form' + (o.isNew && o.context !== 'calendar' ? ' new' : '') + '" data-form="item" data-context="' + o.context +
      '" data-store="' + esc(o.store || '') + '" data-id="' + esc(o.id || '') + '" novalidate>';
    h += '<label class="full">' + c.name + '<input type="text" name="name" value="' + esc(d.name) + '" required placeholder="' + esc(c.placeholder) + '"></label>';
    if (multi) {
      h += '<label>Type<select name="type">' + c.types.map(function (t) { return option(t, TYPES[t].label, d.type); }).join('') + '</select></label>';
    } else {
      h += '<input type="hidden" name="type" value="' + c.types[0] + '">';
    }
    if (c.types.some(function (t) { return TYPES[t].academic; })) {
      h += '<label data-show="academic"' + (multi ? '' : ' class="full"') + '>Module<input type="text" name="module" value="' + esc(d.module) + '" placeholder="e.g. Economics A"></label>';
    }
    h += '<label><span data-show="not-essential">Start date (optional)</span><span data-show="essential">From (optional, for a range)</span>' +
      '<input type="date" name="start" value="' + esc(d.start) + '"></label>';
    h += '<label><span data-show="not-essential">Due date</span><span data-show="essential">Date</span>' +
      '<input type="date" name="due" value="' + esc(d.due) + '" required></label>';
    h += repeatHTML(d.repeat);
    if (c.types.some(function (t) { return TYPES[t].academic; })) {
      h += '<label class="full" data-show="academic">Where to find it<textarea name="source" rows="2" placeholder="Blackboard, library, a link…">' + esc(d.source) + '</textarea></label>';
    }
    h += '<label class="full">Notes<textarea name="note" rows="2">' + esc(d.note) + '</textarea></label>';
    if (c.types.some(function (t) { return TYPES[t].academic; })) {
      h += '<details class="full more" data-show="academic"' + (d.schedule ? ' open' : '') + '><summary>Week-by-week notes</summary>' +
        '<textarea name="schedule" rows="3" placeholder="3: S&S Ch 8 & 9" aria-label="Week-by-week notes">' + esc(d.schedule) + '</textarea>' +
        '<span class="hint">One line per term week. The current week’s line shows when you open the item.</span></details>';
    }
    if (!o.isNew && d.repeat.on && o.context === 'calendar') {
      h += '<p class="hint full">Changes apply to every repeat.</p>';
    }
    h += '<div class="form-actions"><button type="submit" class="btn primary">' + (o.isNew ? c.add : 'Save changes') + '</button>' +
      '<button type="button" class="btn" data-action="cancel-edit">Cancel</button>';
    if (!o.isNew && o.context === 'calendar') {
      h += '<span class="spacer"></span><button type="button" class="link danger" data-action="delete-item" data-store="' + esc(o.store) + '" data-id="' + esc(o.id) + '">Delete</button>';
    }
    h += '</div></form>';
    return h;
  }

  // Show/hide parts of the form to match the current choices.
  function update(form, changed) {
    const f = form.elements;
    const name = changed && changed.name;
    if (name === 'preset' && f.preset.value === 'none') {
      checkRadio(form, 'rep', 'no');
      f.preset.value = 'weekly';
    }
    if (name === 'until' && f.until.value) checkRadio(form, 'ends', 'on');
    if (name === 'ends' && radio(form, 'ends') === 'never') f.until.value = '';
    if (name === 'ends' && radio(form, 'ends') === 'on') f.until.focus();
    if ((name === 'preset' || name === 'unit' || name === 'rep') && f.preset.value === 'custom' && f.unit.value === 'weeks') {
      const boxes = Array.from(form.querySelectorAll('input[name="days"]'));
      if (!boxes.some(function (b) { return b.checked; }) && D.isValid(f.due.value)) boxes[D.dayIndex(f.due.value)].checked = true;
    }

    const type = f.type.value;
    const T = TYPES[type];
    const rep = radio(form, 'rep') === 'yes';
    const preset = f.preset.value;
    const cond = {
      academic: !!T.academic,
      essential: type === 'essential',
      'not-essential': type !== 'essential',
      'rep-yes': rep,
      custom: preset === 'custom',
      'custom-weeks': preset === 'custom' && f.unit.value === 'weeks',
      'class-weekly': !!T.academic && T.kind !== 'maths' && preset === 'weekly',
      'maths-weekly': T.kind === 'maths' && preset === 'weekly'
    };
    form.querySelectorAll('[data-show]').forEach(function (el) { el.hidden = !cond[el.dataset.show]; });
    f.until.classList.toggle('dim', radio(form, 'ends') !== 'on');
    const n = parseInt(f.interval.value, 10) || 0;
    Array.from(f.unit.options).forEach(function (op, i) { op.textContent = n === 1 ? UNITS[i][1] : UNITS[i][0]; });
  }

  function radio(form, name) {
    const el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }
  function checkRadio(form, name, value) {
    const el = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }

  function fail(msg, field) { return { error: msg, field: field }; }

  // Returns { draft } or { error, field }.
  function read(form) {
    const f = form.elements;
    const type = f.type.value;
    const T = TYPES[type];
    const draft = {
      type: type,
      name: f.name.value.trim(),
      module: T.academic && f.module ? f.module.value.trim() : '',
      source: T.academic && f.source ? f.source.value.trim() : '',
      schedule: T.academic && f.schedule ? f.schedule.value : '',
      note: f.note.value.trim(),
      start: f.start.value,
      due: f.due.value,
      repeat: {
        on: radio(form, 'rep') === 'yes',
        preset: f.preset.value,
        interval: parseInt(f.interval.value, 10),
        unit: f.unit.value,
        days: Array.from(form.querySelectorAll('input[name="days"]:checked')).map(function (b) { return Number(b.value); }),
        until: radio(form, 'ends') === 'on' ? f.until.value : ''
      }
    };
    const essential = type === 'essential';
    if (!draft.name) return fail('Add a name.', 'name');
    if (!D.isValid(draft.due)) return fail(essential ? 'Pick a date.' : 'Pick a due date.', 'due');
    if (draft.start && !D.isValid(draft.start)) return fail('The start date isn’t valid.', 'start');
    if (draft.start === draft.due) draft.start = '';
    if (draft.start && draft.start > draft.due) {
      return fail(essential ? 'The range has to start before its last day.' : 'The start date has to be on or before the due date.', 'start');
    }
    const r = draft.repeat;
    if (r.on) {
      if (r.preset === 'custom' && !(r.interval >= 1 && r.interval <= 99)) return fail('Enter how often it repeats (1–99).', 'interval');
      if (radio(form, 'ends') === 'on' && !D.isValid(r.until)) return fail('Pick the date the repeat ends.', 'until');
      if (r.until && r.until < (draft.start || draft.due)) return fail('The repeat can’t end before the first date.', 'until');
      if (r.preset === 'custom' && r.unit === 'weeks' && !r.days.length) r.days = [D.dayIndex(draft.due)];
      if (!(r.interval >= 1)) r.interval = 1;
    }
    return { draft: draft };
  }

  function scheduleText(schedule) {
    return Object.keys(schedule || {}).map(Number).sort(function (a, b) { return a - b; })
      .map(function (k) { return k + ': ' + schedule[k]; }).join('\n');
  }
  function parseSchedule(text) {
    const out = {};
    String(text || '').split('\n').forEach(function (line) {
      const m = line.match(/^\s*(?:w(?:ee)?k?\s*)?(\d{1,2})\s*[:.\-–]\s*(.+?)\s*$/i);
      if (m) out[Number(m[1])] = m[2];
    });
    return out;
  }

  window.Form = { TYPES, CONTEXT, html, update, read, emptyRepeat, repeatToDraft, draftToRepeat, scheduleText, parseSchedule };
})();
