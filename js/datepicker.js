/* Compact date picker. Date fields stay normal typeable inputs; the small
   calendar button next to each one opens this picker as an alternative. */
(function () {
  const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const CAL = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="2.75" width="12.5" height="11.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M1.75 6.25h12.5M5 1.25v3M11 1.25v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const PREV = '<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M9 3L5 7l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const NEXT = '<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const el = document.createElement('div');
  el.className = 'datepicker';
  el.id = 'date-picker';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Choose a date');
  el.hidden = true;
  document.body.appendChild(el);

  let input = null;   // the date input being filled
  let button = null;  // the button that opened the picker
  let month = '';     // first of the month on show
  let focusDate = ''; // day that has keyboard focus

  // Markup for a date field: the usual input plus the picker button.
  function field(name, value, extra) {
    return '<span class="date-field"><input type="date" name="' + name + '" value="' + (value || '') + '"' + (extra || '') + '>' +
      '<button type="button" class="date-btn" data-datepicker aria-label="Choose date from calendar" aria-haspopup="dialog" aria-expanded="false" title="Choose from calendar">' + CAL + '</button></span>';
  }

  function render() {
    const today = D.today();
    const selected = D.isValid(input.value) ? input.value : '';
    const start = D.mondayOf(month);
    const m = D.parse(month).getMonth();
    let h = '<div class="dp-head">' +
      '<button type="button" class="dp-nav" data-dp="prev" aria-label="Previous month">' + PREV + '</button>' +
      '<span class="dp-title" aria-live="polite">' + D.monthTitle(month) + '</span>' +
      '<button type="button" class="dp-nav" data-dp="next" aria-label="Next month">' + NEXT + '</button></div>';
    h += '<div class="dp-grid" role="grid">' + WEEKDAYS.map(function (d) { return '<span class="dp-dow" aria-hidden="true">' + d + '</span>'; }).join('');
    for (let i = 0; i < 42; i++) {
      const date = D.addDays(start, i);
      const cls = ['dp-day'];
      if (D.parse(date).getMonth() !== m) cls.push('out');
      if (date === today) cls.push('today');
      if (date === selected) cls.push('selected');
      h += '<button type="button" class="' + cls.join(' ') + '" data-dp="pick" data-date="' + date + '" tabindex="' + (date === focusDate ? '0' : '-1') + '"' +
        ' aria-label="' + D.long(date) + (date === today ? ', today' : '') + '"' + (date === selected ? ' aria-pressed="true"' : '') + '>' + D.parse(date).getDate() + '</button>';
    }
    h += '</div><div class="dp-foot"><button type="button" class="dp-link" data-dp="today">Today</button>' +
      (input.required ? '' : '<button type="button" class="dp-link" data-dp="clear">Clear</button>') + '</div>';
    el.innerHTML = h;
  }

  function place() {
    const r = button.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    let left = r.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    el.style.top = top + 'px';
    el.style.left = left + 'px';
  }

  function focusDay() {
    const b = el.querySelector('[data-date="' + focusDate + '"]');
    if (b) b.focus();
  }

  function open(btn) {
    close(false);
    button = btn;
    input = btn.parentElement.querySelector('input[type="date"]');
    const base = D.isValid(input.value) ? input.value : D.today();
    focusDate = base;
    month = base.slice(0, 8) + '01';
    el.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    render();
    place();
    focusDay();
  }

  function close(refocus) {
    if (el.hidden) return;
    el.hidden = true;
    if (button) {
      button.setAttribute('aria-expanded', 'false');
      if (refocus && button.isConnected) button.focus();
    }
    input = null;
    button = null;
  }

  function setValue(value) {
    const target = input;
    target.value = value;
    // Let the form react exactly as if the date had been typed.
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    close(false);
    target.focus();
  }

  function showMonth(iso, keepFocus) {
    month = iso.slice(0, 8) + '01';
    if (!keepFocus) {
      const day = Math.min(D.parse(focusDate).getDate(), new Date(D.parse(month).getFullYear(), D.parse(month).getMonth() + 1, 0).getDate());
      focusDate = month.slice(0, 8) + String(day).padStart(2, '0');
    }
    render();
    place();
  }

  function moveFocus(days) {
    focusDate = D.addDays(focusDate, days);
    if (focusDate.slice(0, 7) !== month.slice(0, 7)) month = focusDate.slice(0, 8) + '01';
    render();
    place();
    focusDay();
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-datepicker]');
    if (btn) {
      e.preventDefault();
      if (!el.hidden && button === btn) close(true);
      else open(btn);
      return;
    }
    if (el.hidden) return;
    const a = e.target.closest('[data-dp]');
    if (!a || !el.contains(a)) {
      if (!el.contains(e.target)) close(false);
      return;
    }
    const act = a.dataset.dp;
    if (act === 'prev' || act === 'next') {
      showMonth(D.addMonths(month, act === 'prev' ? -1 : 1));
      const nav = el.querySelector('[data-dp="' + act + '"]');
      if (nav) nav.focus();
    } else if (act === 'pick') setValue(a.dataset.date);
    else if (act === 'today') setValue(D.today());
    else if (act === 'clear') setValue('');
  });

  el.addEventListener('keydown', function (e) {
    const onDay = e.target.classList && e.target.classList.contains('dp-day');
    const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') {
      const items = Array.from(el.querySelectorAll('.dp-nav, .dp-day[tabindex="0"], .dp-link'));
      const i = items.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
      e.preventDefault();
      items[next].focus();
      return;
    }
    if (!onDay) return;
    if (keys[e.key] != null) { e.preventDefault(); moveFocus(keys[e.key]); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      focusDate = D.addMonths(focusDate, e.key === 'PageUp' ? -1 : 1);
      showMonth(focusDate, true);
      focusDay();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const idx = D.dayIndex(focusDate);
      moveFocus(e.key === 'Home' ? -idx : 6 - idx);
    }
  });

  window.addEventListener('resize', function () { close(false); });
  window.addEventListener('scroll', function () {
    if (el.hidden || !button) return;
    const r = button.getBoundingClientRect();
    if (!button.isConnected || r.bottom < 0 || r.top > window.innerHeight) close(false);
    else place();
  }, { passive: true });
  // If the form holding the field is re-rendered or removed, close the picker.
  new MutationObserver(function () { if (!el.hidden && input && !input.isConnected) close(false); })
    .observe(document.body, { childList: true, subtree: true });

  window.DatePicker = { field: field, open: open, close: close };
})();
