# TCD Understand

A weekly dashboard for Michaelmas Term 2026: readings, homework, grade breakdowns and key dates.

It is a plain static site (HTML, CSS, JavaScript). There's no build step and nothing to install.

## Run it locally

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

Then visit http://localhost:8000

## How it works

- Data is saved in your browser (localStorage), so each browser/device has its own copy.
  Use **Export backup** / **Import backup** in the footer to move data between them.
- The **Calendar** button (bottom left) opens the calendar at `#calendar`. It reads the same data as the dashboard, so edits in one show up in the other.
- Weekly Reading and Weekly HW set to repeat **Weekly** follow the class week: they reset to "Not started" every Monday.
  Math and Statistics items follow the problem-set week instead: released Wednesday, due Tuesday, reset every Tuesday.
- Other repeats (daily, every 2 weeks, monthly, yearly, custom) repeat from the item's own date.
- Weekly Reading and Weekly HW sort automatically: earliest due first; on the same day, In progress before Not started; completed items at the bottom.
  Each list has two sections, This week and Due later. Drag an item by its handle (or, with a mouse, by its text) to reorder it or move it
  between sections; the highlighted slot shows where it will land. Keyboard: focus the handle and use the arrow keys. Each item's details
  also have a "Move to This week / Due later" button. Your order and section choices are saved; a repeating item returns to its usual
  section when its next cycle starts. New items slot in by due date, and completed items stay at the bottom of their section.
  "Sort by due date" in the list's footer switches back to automatic order and sections.
- Nothing is copied when a week rolls over. Each status is saved against the due date it was set for, so a new cycle simply starts as "Not started".
  Completed one-off items drop off the dashboard the week after they were due but stay on the calendar.
- To preview a different day, add `?today=YYYY-MM-DD` to the URL (e.g. `?today=2026-09-23`). Viewing a date doesn't change saved data.

## Files

- `index.html`: page structure
- `css/styles.css`: all styling, including light and dark mode
- `js/dates.js`: date formatting and week maths
- `js/recur.js`: repeat rules and class-week cycles (works out every occurrence)
- `js/seed.js`: starting data from the term context file
- `js/store.js`: saving, loading and upgrading older saved data (swap this out to add a backend later)
- `js/form.js`: the shared add/edit form, including "Does this repeat?"
- `js/app.js`: dashboard, calendar and interactions

## Deploy

Import the GitHub repo into Vercel. Framework preset: **Other**. Leave the build command and output directory empty.
