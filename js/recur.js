/* Recurrence engine. Nothing here stores occurrences: every date is
   calculated from an item's rule, so repeats never duplicate.

   Two kinds of repeat:
   - Class schedule (repeat.preset === 'weekly' on a Reading / HW / Maths item).
     The item belongs to a weekly cycle and keeps a dueOffset from the start
     of each cycle. Reading and HW cycles start on Monday; Maths & Stats
     cycles start on Tuesday (released Wednesday, due the next Tuesday).
   - Everything else (daily, every 2 weeks, monthly, custom…) repeats from
     the item's own date. */
(function () {
  const CYCLES = {
    reading: { startDay: 1, resetName: 'Monday' },
    hw: { startDay: 1, resetName: 'Monday' },
    maths: { startDay: 2, resetName: 'Tuesday', releaseOffset: 1 }
  };
  const FIXED = {
    daily: { freq: 'daily', interval: 1, text: 'Repeats daily' },
    weekly: { freq: 'weekly', interval: 1, text: 'Repeats weekly' },
    biweekly: { freq: 'weekly', interval: 2, text: 'Repeats every 2 weeks' },
    monthly: { freq: 'monthly', interval: 1, text: 'Repeats monthly' },
    bimonthly: { freq: 'monthly', interval: 2, text: 'Repeats every 2 months' },
    yearly: { freq: 'yearly', interval: 1, text: 'Repeats yearly' }
  };
  const UNIT = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
  const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function isTask(store) { return store === 'readings' || store === 'homework'; }
  function cycleOf(it) { return CYCLES[it.kind] || CYCLES.hw; }

  // Start of the cycle containing iso (startDay uses JS numbering: 1 = Mon, 2 = Tue).
  function periodStart(iso, startDay) {
    const d = D.parse(iso).getDay();
    return D.addDays(iso, -((d - startDay + 7) % 7));
  }

  // The cycle a class-schedule due date belongs to. A Maths set due on a
  // Tuesday belongs to the cycle that began the Tuesday before.
  function periodForDue(kind, due) {
    const c = CYCLES[kind] || CYCLES.hw;
    return c.startDay === 2 ? periodStart(D.addDays(due, -1), 2) : periodStart(due, c.startDay);
  }

  function isAcademic(it) {
    return !!(it && it.kind && it.repeat && it.repeat.preset === 'weekly');
  }

  /* ---- Class schedule ---- */

  function academicAt(it, P) {
    const c = cycleOf(it);
    const o = {
      due: D.addDays(P, it.dueOffset),
      start: it.startOffset == null ? '' : D.addDays(P, it.startOffset)
    };
    if (c.releaseOffset != null) o.release = D.addDays(P, c.releaseOffset);
    return o;
  }

  function offsets(it) {
    const c = cycleOf(it);
    const list = [it.dueOffset];
    if (it.startOffset != null) list.push(it.startOffset);
    if (c.releaseOffset != null) list.push(c.releaseOffset);
    return { min: Math.min.apply(null, list), max: Math.max.apply(null, list) };
  }

  function lastPeriod(it) {
    const until = it.repeat.until;
    if (!until) return null;
    const weeks = Math.floor((D.diffDays(it.anchor, until) - it.dueOffset) / 7);
    return D.addDays(it.anchor, Math.max(0, weeks) * 7);
  }

  function academicList(it, from, to) {
    const c = cycleOf(it);
    const off = offsets(it);
    let P = periodStart(D.addDays(from, -off.max), c.startDay);
    if (P < it.anchor) P = it.anchor;
    const until = it.repeat.until;
    const out = [];
    for (let i = 0; i < 600; i++) {
      if (D.addDays(P, off.min) > to) break;
      const o = academicAt(it, P);
      if (until && o.due > until) break;
      out.push(o);
      P = D.addDays(P, 7);
    }
    return out;
  }

  function academicCurrent(it, today) {
    let P = periodStart(today, cycleOf(it).startDay);
    if (P < it.anchor) P = it.anchor;
    const last = lastPeriod(it);
    if (last && P > last) P = last;
    return academicAt(it, P);
  }

  /* ---- Custom repeats ---- */

  function ruleDates(anchor, rule, from, to) {
    const end = rule.until && rule.until < to ? rule.until : to;
    const out = [];
    if (end < anchor) return out;
    const n = Math.max(1, parseInt(rule.interval, 10) || 1);
    const days = (rule.days || []).slice().sort();

    if (rule.freq === 'daily' || (rule.freq === 'weekly' && !days.length)) {
      const step = rule.freq === 'daily' ? n : n * 7;
      let k = from > anchor ? Math.floor(D.diffDays(anchor, from) / step) : 0;
      for (let i = 0; i < 3000; i++, k++) {
        const d = D.addDays(anchor, k * step);
        if (d > end) break;
        if (d >= from) out.push(d);
      }
    } else if (rule.freq === 'weekly') {
      const mon0 = D.mondayOf(anchor);
      let w = from > anchor ? Math.floor(D.diffDays(mon0, D.mondayOf(from)) / (7 * n)) : 0;
      for (let i = 0; i < 1500; i++, w++) {
        const mon = D.addDays(mon0, w * 7 * n);
        if (mon > end) break;
        days.forEach(function (dd) {
          const d = D.addDays(mon, dd);
          if (d >= anchor && d >= from && d <= end) out.push(d);
        });
      }
    } else {
      const step = rule.freq === 'yearly' ? 12 * n : n;
      let k = 0;
      if (from > anchor) {
        const a = D.parse(anchor), f = D.parse(from);
        const months = (f.getFullYear() - a.getFullYear()) * 12 + f.getMonth() - a.getMonth();
        k = Math.max(0, Math.floor(months / step) - 1);
      }
      for (let i = 0; i < 1500; i++, k++) {
        const d = D.addMonths(anchor, k * step);
        if (d > end) break;
        if (d >= from) out.push(d);
      }
    }
    return out;
  }

  // Occurrences of `anchor` whose paired date (anchor + delta) may also fall in range.
  function spanList(anchor, delta, rule, from, to) {
    const lo = D.addDays(from, -Math.max(0, delta));
    const hi = D.addDays(to, Math.max(0, -delta));
    const dates = rule ? ruleDates(anchor, rule, lo, hi) : (anchor >= lo && anchor <= hi ? [anchor] : []);
    return dates.map(function (m) { return { main: m, other: D.addDays(m, delta) }; });
  }

  /* ---- Public API ---- */

  // All occurrences of an item that touch [from, to].
  function list(it, store, from, to) {
    if (isTask(store) && isAcademic(it)) return academicList(it, from, to);
    if (store === 'dates') {
      const span = it.end ? D.diffDays(it.start, it.end) : 0;
      return spanList(it.start, span, it.repeat, from, to).map(function (o) {
        return { start: o.main, end: it.end ? o.other : '' };
      });
    }
    const delta = it.start ? D.diffDays(it.due, it.start) : 0;
    return spanList(it.due, delta, it.repeat, from, to).map(function (o) {
      return { due: o.main, start: it.start ? o.other : '' };
    });
  }

  function single(it, store) {
    if (store === 'dates') return { start: it.start, end: it.end || '' };
    return { due: it.due, start: it.start || '' };
  }

  function endOf(o, store) { return store === 'dates' ? (o.end || o.start) : o.due; }

  // The occurrence that matters today: the class-week one for class schedules,
  // otherwise the next one that hasn't finished (or the last one if the repeat ended).
  function current(it, store, today) {
    if (isTask(store) && isAcademic(it)) return academicCurrent(it, today);
    if (!it.repeat) return single(it, store);
    const windows = [62, 800];
    for (let w = 0; w < windows.length; w++) {
      const found = list(it, store, today, D.addDays(today, windows[w]))
        .filter(function (o) { return endOf(o, store) >= today; })[0];
      if (found) return found;
    }
    const u = it.repeat.until && it.repeat.until < today ? it.repeat.until : today;
    const past = list(it, store, D.addDays(u, -800), u);
    return past.length ? past[past.length - 1] : single(it, store);
  }

  // Whether the repeat has run out before `date`.
  function endedBefore(it, store, date) {
    if (!it.repeat || !it.repeat.until) return false;
    return it.repeat.until < date;
  }

  function describe(it, store) {
    if (!it.repeat) return '';
    if (isTask(store) && isAcademic(it)) {
      const c = cycleOf(it);
      let t = 'Resets every ' + c.resetName;
      if (it.repeat.until) t += ' until ' + D.short(it.repeat.until);
      return t;
    }
    const r = it.repeat;
    let t;
    if (FIXED[r.preset]) t = FIXED[r.preset].text;
    else {
      const n = Math.max(1, parseInt(r.interval, 10) || 1);
      const unit = UNIT[r.freq] || 'day';
      t = 'Repeats every ' + (n === 1 ? unit : n + ' ' + unit + 's');
      if (r.freq === 'weekly' && r.days && r.days.length) {
        t += ' on ' + r.days.slice().sort().map(function (d) { return SHORT_DAYS[d]; }).join(', ');
      }
    }
    if (r.until) t += ' until ' + D.short(r.until);
    return t;
  }

  window.R = { CYCLES, FIXED, periodStart, periodForDue, isAcademic, isTask, list, current, describe, endedBefore, ruleDates };
})();
