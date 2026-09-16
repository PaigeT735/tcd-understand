/* Date helpers. All dates are handled as local "YYYY-MM-DD" strings so
   time zones and daylight saving never shift a due date. */
(function () {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(n) { return String(n).padStart(2, '0'); }

  function toISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parse(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
  }

  function isValid(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    return toISO(parse(iso)) === iso;
  }

  // "Today" can be overridden with ?today=YYYY-MM-DD for testing the weekly reset.
  function today() {
    const q = new URLSearchParams(location.search).get('today');
    if (q && isValid(q)) return q;
    return toISO(new Date());
  }

  function addDays(iso, n) {
    const d = parse(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function diffDays(a, b) { // b - a, in whole days
    return Math.round((parse(b) - parse(a)) / 86400000);
  }

  function mondayOf(iso) {
    const d = parse(iso);
    const offset = (d.getDay() + 6) % 7; // Monday = 0
    return addDays(iso, -offset);
  }

  function ordinal(n) {
    const s = n % 100;
    if (s >= 11 && s <= 13) return n + 'th';
    return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  }

  // "Sep 16"
  function short(iso) {
    const d = parse(iso);
    return MONTHS[d.getMonth()] + ' ' + d.getDate();
  }

  // "Wednesday, Sep 16"
  function long(iso) {
    const d = parse(iso);
    return DAYS[d.getDay()] + ', ' + short(iso);
  }

  function weekday(iso) { return DAYS[parse(iso).getDay()]; }

  // "Sep 15th", "Oct 26th–30th", "Sep 15th–Oct 20th", "Jan 18th, 2027"
  function range(start, end, refYear) {
    const a = parse(start);
    const yearA = a.getFullYear();
    const first = MONTHS[a.getMonth()] + ' ' + ordinal(a.getDate());
    if (!end || end === start) {
      return first + (yearA !== refYear ? ', ' + yearA : '');
    }
    const b = parse(end);
    const yearB = b.getFullYear();
    let second;
    if (a.getMonth() === b.getMonth() && yearA === yearB) second = ordinal(b.getDate());
    else second = MONTHS[b.getMonth()] + ' ' + ordinal(b.getDate());
    if (yearA !== yearB) {
      return first + ', ' + yearA + '–' + second + ', ' + yearB;
    }
    return first + '–' + second + (yearA !== refYear ? ', ' + yearA : '');
  }

  window.D = { toISO, parse, isValid, today, addDays, diffDays, mondayOf, short, long, weekday, range, ordinal };
})();
