/* Starting data, taken from the Michaelmas 2026 study context file.

   Class-schedule items (repeat.preset 'weekly' on a Reading/HW/Maths item)
   store dueOffset: days after the start of their weekly cycle.
   Reading and HW cycles start Monday (6 = Sunday).
   Maths & Stats cycles start Tuesday (1 = Wednesday release, 7 = next Tuesday).
   anchor is the first cycle the item appears in. */
(function () {
  const UNTIL = '2026-12-08'; // end of Week 12's problem-set cycle
  function classWeek(extra) {
    return Object.assign({
      subject: '', start: '', due: '', startOffset: null, status: 'todo', statusOn: '',
      repeat: { preset: 'weekly', freq: 'weekly', interval: 1, days: [], until: UNTIL }
    }, extra);
  }
  function reading(extra) { return classWeek(Object.assign({ kind: 'reading', dueOffset: 6, anchor: '2026-09-14' }, extra)); }
  function hw(extra) { return classWeek(Object.assign({ kind: 'hw', dueOffset: 6, anchor: '2026-09-14' }, extra)); }

window.SEED = {
  version: 2,
  term: {
    name: 'Michaelmas Term 2026',
    start: '2026-09-14',
    weeks: 12,
    readingWeek: 7,
    repeatUntil: UNTIL
  },
  readings: [
    reading({
      id: 'r-fin', name: 'Finance chapters', module: 'Intro to Finance',
      source: 'S&S chapters are on Blackboard. Brealey et al., Fundamentals of Corporate Finance (McGraw-Hill): hard copies in the library, ebook link on Blackboard.',
      details: '',
      schedule: {
        1: 'Brealey Ch 1 & 5; S&S Ch 1–3 (Intro to Finance; time value of money)',
        2: 'S&S Ch 8 (Annuities & perpetuities; bonds)',
        3: 'S&S Ch 8 & 9 (Bond valuation; equity)',
        4: 'S&S Ch 6 (Equity valuation; capital budgeting)',
        5: 'S&S Ch 6 (NPV and other techniques; cash flow analysis & DCF)',
        6: 'S&S Ch 12 & 13 (Return & risk; diversification & the CAPM)',
        7: 'Reading Week: revise Weeks 1–6 for the Nov 2 term test',
        8: 'S&S Ch 13 (Cost of debt & equity; WACC)',
        9: 'S&S Ch 13 (Cost of capital)',
        10: 'S&S Ch 15 (Debt policies; working capital management)',
        11: 'S&S Ch 16 (Dividend policy I & II)',
        12: 'S&S Ch 16 (Evidence on dividend policies; module round-up)'
      }
    }),
    reading({
      id: 'r-econ', name: 'Varian chapters', module: 'Economics A',
      source: 'Hal R. Varian, Intermediate Microeconomics with Calculus, 1st edition. Location not confirmed yet (check Blackboard or the library).',
      details: 'Chapters are assigned each week.',
      schedule: {}
    }),
    reading({
      id: 'r-ob', name: 'Bratton chapters + posted readings', module: 'Organisational Behaviour',
      source: 'Bratton (2015) on ProQuest: https://www.proquest.com/docview/2474617577/bookReader?accountid=14404&sourcetype=Books — extra weekly readings are posted on Blackboard.',
      details: 'The lecturer confirms the chapters each week.',
      schedule: {
        1: 'Ch 1, 2 & 3 (Intro to organisational psychology/behaviour)',
        2: 'Ch 4 & 5 (Personality, identity, perceptions & emotions)',
        3: 'Ch 6 & 7 (Motivation, learning & social capital)',
        4: 'Ch 12 (Leadership)',
        5: 'No chapters (revision, reflection and guest panel)',
        6: 'Ch 10 & 11 (Groups, teams & communication)',
        7: 'Reading Week: no OB tutorial',
        8: 'Ch 8 & 9 (Equality, diversity & people management)',
        9: 'Ch 17 (Organisational culture)',
        10: 'Ch 18 (Organisational change)',
        11: 'Ch 13 & 14 (Decision-making, ethics; power, politics & conflict)'
      }
    }),
    reading({
      id: 'r-ft', name: 'Financial Times', module: 'Intro to Finance',
      source: 'Free with your TCD login: https://www-ft-com.elib.tcd.ie/ — also via https://libguides.tcd.ie/az.php?q=financial%20times',
      details: 'Read regularly. App setup instructions are in a Blackboard announcement.',
      schedule: {}
    }),
    reading({
      id: 'r-econ-mag', name: 'The Economist', module: 'Intro to Finance',
      source: 'ProQuest: http://search.proquest.com/publication/417164 (link may need checking)',
      details: 'Read regularly.',
      schedule: {}
    })
  ],
  homework: [
    classWeek({
      id: 'h-maths', name: 'Problem set (graded)', module: 'Maths & Stats A',
      kind: 'maths', subject: 'Math', dueOffset: 7, anchor: '2026-09-15',
      source: 'Released every Wednesday, due the following Tuesday.',
      details: 'Counts toward 10% of the module. Include answers and full working. Office hours: Wednesdays 14:00–16:00, Arts Building room 3017.',
      schedule: {}
    }),
    hw({
      id: 'h-econ-ps', name: 'Problem set', module: 'Economics A',
      source: 'Blackboard (to confirm)', details: 'Separate from the weekly worksheet.', schedule: {}
    }),
    hw({
      id: 'h-econ-ws', name: 'Worksheet', module: 'Economics A',
      source: 'Blackboard (to confirm)', details: 'Separate from the weekly problem set.', schedule: {}
    }),
    hw({
      id: 'h-fin-q', name: 'Weekly questions', module: 'Intro to Finance',
      source: 'Blackboard', details: 'Questions on that week’s topic.', schedule: {}
    }),
    hw({
      id: 'h-fin-t', name: 'Practice test', module: 'Intro to Finance',
      source: 'Blackboard', details: 'Not graded, but good prep for the term test and final exam.', schedule: {}
    }),
    hw({
      id: 'h-span', name: 'Weekly homework', module: 'Spanish',
      source: 'Blackboard (to confirm)', details: 'May count toward the 50% continuous assessment (to confirm).', schedule: {}
    })
  ],
  classes: [
    { id: 'c-econ', name: 'Economics A', components: [
      { id: 'c1', name: 'Online midterm', weight: 30, note: 'Due by Nov 1' },
      { id: 'c2', name: 'Final exam (in person)', weight: 70, note: '' }
    ] },
    { id: 'c-fin', name: 'Intro to Finance', components: [
      { id: 'c1', name: 'In-class term test', weight: 20, note: 'Nov 2 (to confirm)' },
      { id: 'c2', name: 'End-of-year exam', weight: 80, note: '' }
    ] },
    { id: 'c-maths', name: 'Maths & Stats A', components: [
      { id: 'c1', name: 'In-person exam', weight: 90, note: '' },
      { id: 'c2', name: 'Weekly problem sets', weight: 10, note: 'Due Tuesdays' }
    ] },
    { id: 'c-ob', name: 'Organisational Behaviour', components: [
      { id: 'c1', name: 'End-of-year MCQ exam', weight: 50, note: '' },
      { id: 'c2', name: 'Group consultancy report', weight: 50, note: '2,500 words, Harvard referencing' }
    ] },
    { id: 'c-span', name: 'Spanish', components: [
      { id: 'c1', name: 'Written exam', weight: 50, note: 'April 2027' },
      { id: 'c2', name: 'Continuous assessment', weight: 50, note: '' }
    ] },
    { id: 'c-tech', name: 'Emergence of Technologies', components: [
      { id: 'c1', name: 'Quantum mechanics report + presentation', weight: 20, note: 'Due after Reading Week' },
      { id: 'c2', name: 'Group challenges (3 × 10%)', weight: 30, note: '' },
      { id: 'c3', name: 'Emerging technology podcast', weight: 15, note: '' },
      { id: 'c4', name: 'Reflective learning podcast', weight: 15, note: '' },
      { id: 'c5', name: 'Class tests', weight: 15, note: 'Not confirmed' }
    ] }
  ],
  dates: [
    { id: 'd1', title: 'Teaching starts', start: '2026-09-14', end: '', note: '', repeat: null },
    { id: 'd2', title: 'Reading Week', start: '2026-10-26', end: '2026-10-30', note: 'No classes. Oct 26 is a public holiday.', repeat: null },
    { id: 'd3', title: 'Economics A online midterm due (30%)', start: '2026-11-01', end: '', note: 'Do it during Reading Week.', repeat: null },
    { id: 'd4', title: 'Finance in-class term test (20%)', start: '2026-11-02', end: '', note: 'Date to confirm. Covers Weeks 1–6.', repeat: null },
    { id: 'd5', title: 'Teaching restarts', start: '2026-11-02', end: '', note: '', repeat: null },
    { id: 'd6', title: 'Teaching ends', start: '2026-12-04', end: '', note: '', repeat: null },
    { id: 'd7', title: 'Revision period', start: '2026-12-07', end: '2026-12-10', note: '', repeat: null },
    { id: 'd8', title: 'Semester 1 exams', start: '2026-12-11', end: '2026-12-22', note: 'Check the official exam timetable.', repeat: null },
    { id: 'd9', title: 'Hilary Term starts', start: '2027-01-18', end: '', note: '', repeat: null }
  ],
  events: [],
  settings: { theme: 'system' }
};
})();
