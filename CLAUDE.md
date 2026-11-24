# Lifetracker: rules for Claude Code

I am not a coder. Explain things briefly, in plain words, with no jargon.
Before any work, read SPEC.md (features and unit codes) and PROGRESS.md (what's done).

## Tech (do not change)
- Plain HTML, CSS and vanilla JavaScript with ES modules (`<script type="module">`).
- No build tools, no npm, no frameworks, no TypeScript, no bundlers.
- All data is stored in IndexedDB and accessed ONLY through `core/storage.js`.
  Modules never touch IndexedDB or localStorage directly.
- Charts use Chart.js saved locally at `core/vendor/chart.umd.min.js`, loaded only through `core/charts.js`.
- Nothing loads from the internet: no CDNs, online web fonts, icon libraries or outside APIs.
  Use the font saved locally in `core/fonts/` (with system fallbacks), emoji and inline SVG icons.
- The app must work fully offline as a PWA (`manifest.webmanifest` and `sw.js` in the root).
  Every time you add a file, add it to the service worker cache list and bump the cache version.

## Locale
- Currency is ₹. Store money as whole paise (integers) and show it with Intl.NumberFormat('en-IN'), e.g. ₹1,23,456.50.
- Timezone is Asia/Kolkata. Store dates as 'YYYY-MM-DD' and times as 'HH:MM' (24h) in Kolkata time.
  Show dates as "23 Nov 2026". Use only the helpers in `core/dates.js`.
- Metric units only: kg, cm, ml/L, g/mg/µg, kcal.

## Design
- Mobile-first: design for a 360px-wide phone first, then let it scale up.
- Cute, soft and friendly, with one consistent style:
  - Soft pastel colours. Each module has its own pastel accent (water baby blue, sleep lavender,
    weight mint, food peach, money butter yellow, tasks pink, reading sage, medical log rose).
    A module screen adds the class `mod-<module>` to its root to use its accent.
  - Extra-rounded cards, pill-shaped buttons, soft gentle shadows instead of hard lines or borders.
  - Friendly rounded font (Nunito, saved locally in `core/fonts/`, with rounded system fallbacks).
  - Module emoji on headings: 💧 water, 😴 sleep, ⚖️ weight, 🍱 food, 💸 money, ✅ tasks,
    📚 reading, 🩺 medical log (use `modules`, `badge()` or `card({ module })` from `core/ui.js`).
  - Small bounce when a button is tapped (switched off if the phone asks for reduced motion).
  - Always readable: dark text on pastel fills, good contrast in light and dark mode.
- All colours, spacing, radii and font sizes are CSS variables in `core/styles.css`.
  Modules don't invent their own colours or components.
- Reuse the shared cards, buttons, inputs, lists and empty states from `core/ui.js`.
- Tap targets are at least 44px. Support light and dark mode with prefers-color-scheme.

## Folder structure
```
index.html  manifest.webmanifest  sw.js  icons/
core/     storage.js dates.js format.js ui.js router.js charts.js notify.js sync.js settings.js styles.css vendor/ fonts/
google-apps-script/   Code.gs appsscript.json   (pasted into Google by hand; never contains secrets)
water/  sleep/  weight/  food/  money/  tasks/  reading/  medical/
```
- Each module folder has `index.js` (its screens). Add `module.css` only if really needed.
- Modules may import from `core/`, never from each other.

## Working rules
1. Build ONLY the unit I name (e.g. "do WTR-1"). Don't start the next unit or add extras.
   If something else seems needed, tell me and ask first.
2. Edit existing files in place. Make the smallest change that does the job.
3. Never rewrite, restructure or "tidy up" code that already works.
4. Never change how saved data is structured without telling me. If you must, add a
   migration in `core/storage.js` so my existing data is kept.
5. If something is unclear, ask me one short question instead of guessing.
6. Keep explanations short and non-technical. Don't show me code unless I ask.

## Uploading (the app is live at https://lifetracker73-creator.github.io/lifetracker/)
- "commit it" (and the commit at the end of a unit) only saves on my laptop. NEVER push unless I say "release".
- Never upload personal data, backups or exports. `.gitignore` is an allowlist (everything is ignored
  except app code, icons, fonts and these docs); check `git status` before every commit.
- `PRIVATE.md` (on my laptop only, ignored by git) lists words that must never be public. Read it for
  scans, but never copy anything from it into another file, a commit message or the chat.
- A local privacy guard (`.git/hooks/privacy-check.sh`, never uploaded) runs before every commit.
  If it blocks a commit, fix the content. Never skip it (no `--no-verify`), and never weaken it.
- Sample/test data must always be clearly fake ("Test Person", "Dr Example", round numbers like 70 kg
  or ₹500), in code, placeholders, docs and commit messages.
- When I say "release":
  1. Full privacy scan (like the first audit). Stop if anything is found and tell me what and where.
     - Run `sh .git/hooks/privacy-check.sh full`: every file that will be uploaded, every past commit
       on all branches/tags, commit messages and author names/emails.
     - It checks: everything in PRIVATE.md (any case, partial words too), my computer username,
       emails other than noreply ones, phone numbers, PIN codes, Apps Script / Google Sheet / Drive /
       Docs links, secret keys like `ABCD-EFGH-JKLM-…`, tokens, passwords, API/private keys and paths
       with a username.
     - Also check: real-looking personal data in sample data, comments and docs; hidden metadata in
       new images/PDFs; that no backups, exports, Excel/CSV, PDFs, screenshots, PRIVATE.md or
       `.claude/` files are tracked; that the git author is the neutral noreply one.
     - Only these are allowed: the app's own GitHub/GitHub Pages links, the link pattern and Google
       permission addresses in the sync code, licence links in `core/fonts/OFL.txt`, and made-up
       examples like `name@gmail.com`.
  2. Show me the release preview: the exact list of files that will be uploaded (new/changed),
     a plain-words summary of what changed, the new version number, and "privacy scan ✅ clean".
  3. WAIT for me to type "yes". Anything else means don't release.
  4. Bump `CACHE_VERSION` in `sw.js` by 1 and check every app file is in its list.
  5. Commit with the message: `Release v<number>: <short description>`.
  6. Push to GitHub (`git push origin main`).
  7. Check the live link shows the new `CACHE_VERSION` (it can take 1–2 minutes), then scan what is
     actually live on GitHub and GitHub Pages the same way and confirm ✅.
  8. Tell me: open the app on my phone with internet and tap "New version available — tap to refresh".

## At the end of every unit
1. Give me a 3-step "How to test" checklist I can follow in my phone or browser.
2. Update PROGRESS.md with the unit code, date, what was built, and any known issues.
3. Make a git commit with the message: `<UNIT CODE>: <short description>`.
