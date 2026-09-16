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
- Every Monday, repeating readings and homework reset to "Not started" and their due dates move forward a week.
  One-off items that were completed are removed; unfinished ones stay.
- To preview a different day, add `?today=YYYY-MM-DD` to the URL (e.g. `?today=2026-09-23`).
  This changes the saved week too, so open the plain URL afterwards to return to today.

## Files

- `index.html`: page structure
- `css/styles.css`: all styling, including light and dark mode
- `js/dates.js`: date formatting and week maths
- `js/seed.js`: starting data from the term context file
- `js/store.js`: saving and loading (swap this out to add a backend later)
- `js/app.js`: rendering and interactions

## Deploy

Import the GitHub repo into Vercel. Framework preset: **Other**. Leave the build command and output directory empty.
