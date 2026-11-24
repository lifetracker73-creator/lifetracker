# Lifetracker: Progress

## CORE-1: Styles and UI kit (23 Nov 2026)
**Built**
- `core/styles.css`: all colours, spacing, corner rounding and text sizes as CSS variables;
  light and dark sets that follow the phone setting; system fonts only.
- `core/ui.js`: shared pieces — card, button (primary / secondary / ghost / danger, with
  optional icon), labelled input (text, number, date, time, textarea, select) with an error
  message, list and list row (title, subtitle, right-side text, action buttons, tappable),
  empty state, and a few inline SVG icons.
- `index.html`: a sample page showing every piece. CORE-3 will replace it with the real home screen.
- Checked at 360px wide in light and dark mode: no sideways scrolling, all tap areas ≥ 44px.

**Update (23 Nov 2026): cute pastel restyle**
- Soft pastel colours with one pastel accent per module (class `mod-<module>`), extra-rounded
  cards, pill buttons, soft shadows instead of borders and divider lines, a small bounce on tap
  (off when the phone asks for reduced motion), and dark text on pastels for contrast in both modes.
- `core/ui.js`: new `modules` list (emoji + name), `badge()`, `card({ module })` adds the emoji
  to the title, `emptyState({ emoji })`.
- Sample page now shows all 8 module colours.
- CLAUDE.md design rules updated so every future unit uses this style.

**Update (23 Nov 2026): Nunito font saved locally**
- `core/fonts/Nunito-Variable.ttf` (277 KB, one file for all weights) from Google's official
  Nunito project, with its free licence in `core/fonts/OFL.txt`. Loaded from `core/styles.css`.

**Known issues**
- CORE-5 must add `core/fonts/Nunito-Variable.ttf` to the offline cache list (no `sw.js` yet).
- The page must be opened through a local web server (e.g. http://localhost:...), not by
  double-clicking the file, because browsers block this kind of script from plain files.
- Not yet offline or installable (that is CORE-5), so `sw.js` doesn't exist yet.

## CORE-2: Storage helper (23 Nov 2026)
**Built**
- `core/storage.js`: one on-device database called `lifetracker` (version 1) with one drawer per kind
  of data: water, sleep, weight, foods, foodLog, recipes, expenses, categories, tasks, books,
  checkins, reflections, markers, reports, plus a settings drawer with one row per module.
- Actions: `add`, `get`, `update`, `remove` (gives back the deleted entry), `restore` (for Undo),
  `list`, `listByDate`, `listByDateRange`, `getSettings` (fills in defaults) and `saveSettings`.
- Every new entry automatically gets a random ID plus "created" and "updated" times.
- Dated drawers can be searched by date: most use `date`, tasks use `dueDate`, books use `startDate`
  and reflections use `weekStart`.
- Safe upgrades: a numbered list of upgrade steps. Future changes add a new step, so saved data is kept.
- Sample page has a temporary "Storage check (CORE-2)" card. It saves a test entry, then checks,
  changes, deletes, restores and removes it, leaving nothing behind. All checks pass.

**Known issues**
- The storage check card is temporary; CORE-3 replaces the sample page.
- Nothing is backed up off the phone yet (that is CORE-7). Clearing the browser's site data deletes it.

**Update (23 Nov 2026): temporary test notes box**
- A "Test notes" box (type a note, save it, see saved notes) was added to the sample page to try
  saving real data, tested, then removed. It was never committed; the sample page is unchanged.
- Leftover: any notes saved during the test stay in the settings storage under `_testNotes`.
  They are unused and harmless, and can be cleared later if wanted.

## CORE-3: App shell (23 Nov 2026)
**Built**
- `index.html` is now the real app (the sample page and storage check are gone): a title bar showing
  the current screen's emoji and name, the screen area, and a bottom menu bar.
- Bottom menu bar: 🏠 Home, 💧 Water, 🍱 Food, 💸 Money, ✅ Tasks and 🌈 More. The open screen's button
  lights up in its module colour. "More" opens a panel with 😴 Sleep, ⚖️ Weight, 📚 Reading and
  🩸 Blood tests (close it with ✕, by tapping outside, or Back/Escape).
- `core/router.js`: each screen has its own address (e.g. `#/water`), so Back and refresh work.
  A module's file loads only when first opened. Unknown addresses go home. Each module's
  `index.js` exports `render(root, { path })`.
- Home screen: a greeting and one pastel tile per module. (The "today" summary is HOME-1.)
- Each module folder has a starter `index.js` showing a "Coming soon" card in its colour.
- `core/styles.css`: styles for the title bar, menu bar, More panel and tiles. `core/ui.js`: new ✕ icon.
- Checked at 360px wide in light and dark mode: all 8 screens open, no sideways scrolling,
  menu buttons 56px tall, no errors.

**Known issues**
- CORE-5 must add `core/router.js` and the 8 module `index.js` files to the offline cache list.

**Update (23 Nov 2026): home screen polish**
- 20px space between content and the screen edges everywhere. The bottom menu bar now floats
  with a gap on all sides instead of touching the edges.
- Greeting by time of day in Kolkata ("Good morning / afternoon / evening", with ☀️ 🌤️ 🌙),
  plus your name if one is saved, and today's date below it (e.g. "Monday, 23 Nov 2026").
- Placeholder card "Your daily summary will appear here ✨" above the module tiles.
- Dark mode uses slightly softer pastels (dark text stays readable). Phones show 2 tiles per row.
- `core/dates.js` started early with 3 helpers (today's date, current hour, show a date);
  CORE-4 adds the rest.
- SPEC.md: new unit HOME-SUMMARY added at the end of the build order.

**Known issues**
- There's no way to type your name yet: it's read from a "profile" settings row that CORE-8
  (Settings screen) should add a box for. Until then the greeting has no name.
- CORE-5 must also add `core/dates.js` to the offline cache list.

## Spec update (23 Nov 2026): Customise menu planned for CORE-8
- SPEC.md: the Settings unit (CORE-8) now includes "Customise menu". Home stays first and More last;
  I pick 4 modules for the bottom bar and order them with up/down arrows; the rest go into More;
  the same arrows set the home card order; the choice is saved; "Reset to default" brings back
  Water, Food, Money, Tasks. Not built yet.
- Reminder for CORE-8: also add a box to type your name for the home greeting.

## CORE-4: Dates and formatting helpers (23 Nov 2026)
**Built**
- `core/dates.js` finished (the 3 existing helpers are unchanged). New helpers, all in Kolkata time:
  yesterday, current time and date-time, add/subtract days, days between two dates, Monday of the
  week, "is it Sunday", first/last day of a month, a list of dates in a range, and nice display of
  months ("Nov 2026"), times ("6:15 am") and date-times ("23 Nov 2026, 6:15 am").
- Sleep: works out minutes asleep from bed time to wake time, correct past midnight
  (23:30 → 06:15 = 6 h 45 m), and shows durations as "6 h 45 m".
- New `core/format.js`: paise → ₹ with Indian grouping (₹1,23,456.50; whole rupees show as ₹500),
  typed amounts → whole paise ("1,23,456.50", "₹ 99"; rejects negatives and 3+ decimals), and
  metric units: ml/L, kg (1 decimal), cm, kcal, g, mg, µg. Blank (unknown) values show as "—".
- Tested 58 tricky examples (month ends, new year, leap years, midnight, crore amounts): all pass.
  Home screen still works with no errors. No screens or saved data changed.

**Known issues**
- Decided (23 Nov 2026): times are shown in 12-hour style ("11:30 pm") and stored as 24h.
- CORE-5 must also add `core/format.js` to the offline cache list.

## CORE-5: Offline app and install (23 Nov 2026)
**Built**
- `manifest.webmanifest`: app name "Lifetracker", cream background, full-screen phone look,
  opens on Home.
- `icons/`: a cute smiley face on a lavender-to-pink background, at the sizes phones need
  (192, 512, a round-shape-safe 512 for Android, 180 for iPhone, 32 for the browser tab).
- `sw.js` (offline helper, cache version 1): saves every app file on the phone (page, all `core/`
  files, the Nunito font, the 8 module screens, icons) so the app opens with no internet. Opening
  any address gives the saved app. When a new version is saved, the app reloads itself once.
- `index.html`: links the manifest and icons and turns on the offline helper. When the phone offers
  to install the app, a "📲 Install app" button shows on Home. It disappears after it's tapped or
  the app is installed. iPhones don't offer this; use Share → "Add to Home Screen".
- `core/styles.css`: hides the empty install spot so it leaves no gap.
- Checked in the built-in browser at 360px wide, light and dark: manifest and all icons load,
  the install button appears, is 44px tall, opens the install offer and then hides, all 9 screens
  open, no sideways scrolling.

**Known issues**
- Offline confirmed on the phone (23 Nov 2026): installed from the live link, opened in airplane
  mode, and every screen worked. (The browser built into Claude's app can't run offline helpers,
  so future offline checks need a phone or normal Chrome.)
- Rule from now on: every new file goes into the list in `sw.js` and `CACHE_VERSION` goes up by 1.
- Leftover test notes under `_testNotes` in settings (from CORE-2) are still there, harmless.

## Hosting (23 Nov 2026)
- The app is online with GitHub Pages: https://lifetracker73-creator.github.io/lifetracker/
  (code at https://github.com/lifetracker73-creator/lifetracker, branch `main`, folder `/ (root)`).
- Installed on the phone from that link. Uploading a new version (git push) updates the phone
  app the next time it's opened with internet. Saved data stays on each device and is never uploaded.

## Release v2: update message, release rule, upload safety (23 Nov 2026)
**Built**
- "✨ New version available — tap to refresh" message floats above the bottom menu bar when a new
  version has downloaded. Tapping it switches to the new version and reloads. New versions no longer
  switch over on their own. The app looks for a new version each time it comes back on screen.
- `sw.js`: cache version 2; a new version now waits until the message is tapped.
- `.gitignore`: backups, exports (.csv, .ics, backup .json), secret files and computer clutter
  can never be uploaded to GitHub. Your tracker data lives inside the phone/browser, never in this folder.
- CLAUDE.md: "Uploading" rules. "commit it" saves on the laptop only; "release" bumps the cache
  version, commits and uploads to GitHub.
- Checked at 360px, light and dark: message sits just above the menu bar, no sideways scrolling.

**Known issues**
- The message can't be tested in Claude's built-in browser (it can't run offline helpers). It will
  first appear on the phone at the next release after this one.
- This one time, the phone switches to v2 only after the app is fully closed and reopened, because
  the v1 app on the phone doesn't have the message yet.
- Every commit so far shows the email address saved in git, and GitHub shows it publicly.

## WTR-1: Log water (23 Nov 2026)
**Built**
- 💧 Water screen (baby blue): quick-add buttons for 250, 500 and 750 ml (one tap saves today's
  date, the Kolkata time and the amount). The amounts come from water settings, so CORE-8 can change them.
- "Other amount (ml)" box with an Add button. It accepts whole numbers from 1 to 5,000 ml and shows a
  friendly message otherwise.
- "Today" list, newest first, showing amount and time (e.g. "300 ml · 7:24 pm"), with a friendly
  empty message. Each row has a delete button.
- Deleting shows "Deleted 300 ml · Undo" above the menu bar for 5 seconds; Undo puts it back.
- New shared pieces: `toast()` in `core/ui.js` (short message with a button, reusable by every
  module for Undo) and `.btn-row` in `core/styles.css` (equal-width buttons on one line).
- Checked at 360px, light and dark: add, error message, delete and Undo all work, no sideways
  scrolling, all buttons ≥ 44px, no errors.

**Known issues**
- No new files, so `sw.js` didn't need changing; the phone gets this at the next "release".
- Today's total and goal progress come in WTR-2. Editing an entry isn't part of WTR-1 (delete and re-add).

## Moved to a new GitHub account (23 Nov 2026)
- The project now lives on the account `lifetracker73-creator`; new link:
  https://lifetracker73-creator.github.io/lifetracker/
- Git history was restarted with one first commit, saved under the account's private
  GitHub "noreply" email, so no personal email is in the project or its history.
- Known issue: data logged on the old link stays with the old link (a different web address);
  it doesn't carry over. The app has to be installed again on the phone from the new link.

## SHEETS-SYNC: automatic copy to Google Sheets (24 Nov 2026)
**Built**
- Every add, change, delete and Undo in any module (now and future) is saved on the phone first,
  then copied to a Google Sheet in my Google account. Nothing extra is needed per module.
- `core/storage.js`: new "outbox" drawer (database version 2, a safe upgrade; existing data untouched).
  It's written together with each entry, so no change can be missed, and keeps only the latest
  change of each entry. Settings are never synced.
- `core/sync.js`: sends the outbox in batches when the app opens, comes back on screen, comes back
  online, and shortly after each change. Retries on its own (30 s up to 10 min). Turns entries into
  readable rows: column names like "Amount (ml)" / "Amount (₹)", dates as 23-11-2026, money in
  rupees, linked items shown by name, lists as readable text.
- Status icon in the title bar: ✅ synced / ⏳ X waiting / ⚠️ problem. Tapping it explains in plain
  words, with "Try again" and "Settings".
- ⚙️ Settings screen (from More, `core/settings.js`): Google Sync section with link + key + Connect,
  "Connected: …@gmail.com ✅", "Sync everything now", "Change account" (with steps), privacy reminder.
  CORE-8 adds the rest of Settings later.
- `google-apps-script/` (Code.gs + appsscript.json): the script pasted into Google. Write-only,
  checks a secret key kept in Google's Script Properties, rejects anything that isn't a valid
  entry, saves text as plain text (never as a formula), uses the narrowest permission (only
  files it creates + my email). Creates "LifeTracker/LifeTracker <year>" files with 8 tabs, India
  region; mixed tabs have a "Type" column. Ready to save blood test photos/PDFs in
  "LifeTracker/Reports" (the app side comes with BLD-2).
- `sw.js`: cache version 3 with the 2 new files. CLAUDE.md: secret scan added as step 1 of "release".
- Set up in my Google account and tested from the laptop with real Google: connect,
  new entry, delete, offline then back online, "Sync everything now" (no duplicates). All passed.
  Edit, wrong key, broken link and offline were also tested with a pretend Google endpoint.

**Known issues**
- The phone app gets this only at the next "release"; then connect it in Settings with the same
  link and key.
- The laptop test entries live only in the laptop browser (localhost), not on the phone.
- Change account is untested (needs a second Google account).
- If the Apps Script project is ever re-created, it can't see the old files (narrow permission), so it
  makes a new LifeTracker folder; "Sync everything now" refills it.
- If the outbox ever has an entry Google refuses, sync stops with ⚠️ until fixed (data stays safe on the phone).
- CORE-7 (Backup) must leave out the Google Sync link and key, and add "Export to Excel".

## Plan decision (24 Nov 2026): release once, when the whole app is built
- All remaining units are built and committed on the laptop first; the phone gets them in one
  "release" at the end. Until then, entries made on the phone have no Google backup.
- After that release: on the phone, open More → ⚙️ Settings → Google Sync, paste the same Apps Script
  link and type the key, tap Connect. Everything logged so far is then uploaded.

## WTR-2: Today's water progress (24 Nov 2026)
**Built**
- 💧 Water screen: new "Today's progress" card at the top with a soft baby-blue bar that fills
  toward the daily goal (2.5 L for now; changeable in Settings with CORE-8).
- Under the bar: "1.25 L of 2.5 L" and "50%", plus "1.25 L to go" or "Goal reached! 🎉".
  The bar stops at full above the goal, but the % keeps counting (e.g. 130%).
- Updates straight away after adding, deleting or Undo. The total is worked out on screen;
  saved data is unchanged.
- New shared piece `progressBar()` in `core/ui.js` (with its styles in `core/styles.css`), in the
  module's colour, so later units (goals, budgets, reading) can reuse it. Screen readers hear it as a progress bar.
- Checked at 360px, light and dark: 0%, 20%, 50%, 100% and 130% all show correctly, delete and Undo
  update it, no sideways scrolling, no new errors.

**Known issues**
- Amounts of 1,000 ml or more show in litres (e.g. "1.25 L"), using the existing shared ml/L format.
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".
- Python on this laptop is broken (the "py"/"python" commands fail), so the test used a small
  temporary PowerShell web server instead.

## Laptop always shows the newest version (24 Nov 2026)
- `sw.js` (cache version 4): when the app is opened on the laptop (localhost / 127.0.0.1), it always
  loads the newest files, so every change shows after a normal reload. It uses the saved copy only
  if the laptop's web server isn't running. The phone and the live link work exactly as before.
- One time only: in laptop Chrome, tap "New version available — tap to refresh" (or close and reopen
  the tab) so this new helper takes over.

## CORE-6: Charts (24 Nov 2026)
**Built**
- `core/vendor/chart.umd.min.js`: the free chart tool Chart.js (version 4.4.7, MIT licence), saved
  in the app so charts work offline. Downloaded once; the download site's note was removed,
  Chart.js's own licence note kept.
- New `core/charts.js`: the only file that uses the chart tool. Modules call `barChart()` or
  `lineChart()` with dates and numbers and get a chart in the house style: Nunito font, the module's
  pastel colour, rounded bars, a soft pastel wash under lines, soft grid, no hard borders.
- Extras ready for later units: a dashed goal line with a small label (water goal, sleep target,
  weight goal), a second softer dashed line for averages (weight 7-day average) with a small
  legend, dates shown as "23 Nov" (full date when tapped), gaps for days with no data,
  numbers shown with the module's own format (e.g. "2.5 L", "72.0 kg").
- Redraws in the new colours when the phone switches light/dark; no animation when the phone asks
  for reduced motion; screen readers hear a short summary (date range, lowest and highest).
- `core/styles.css`: small `.chart-box` style. `sw.js`: cache version 5 with the 2 new files.
- Checked with a temporary sample page at 360px, light and dark: bar chart (30 days with goal line),
  line chart with average, and an empty chart all draw correctly, no sideways scrolling, no errors.
  The sample page was only a temporary file and is not in the app. Home screen still opens.

**Known issues**
- No charts in the app yet; the first one comes with WTR-3.
- The chart file contains two web links in its licence notes (chartjs.org and a GitHub page). The
  release secret scan will find them; they are harmless licence/credit links, not secrets.
  Decided (24 Nov 2026): keep them, and don't add them to the allowed list yet. At the final
  "release", Claude reminds me briefly what they are and I approve or decline then.
- The phone gets this at the final "release".

## WTR-3: Water history and streak (24 Nov 2026)
**Built**
- 💧 Water screen: new "History" card (baby blue) under the Today list.
- "Days to show" pill buttons: 7, 14, 21 and 30 (changed from the spec's 7/30, as asked). The chosen one
  lights up; it opens on 7. The buttons show just the number, because "7 days" doesn't fit four across
  on a 360px phone.
- Bar chart of each day's total water, with a dashed "Goal" line at the daily goal. Days with nothing
  logged show as empty (a gap, not zero).
- Streak line under the chart: "🔥 5-day streak of goal days", counting days in a row that reached the
  goal. An unfinished today doesn't break the streak; it is added once today's goal is reached. With no
  streak: "Reach your goal today to start a streak 💪".
- Chart and streak update straight away after adding, deleting or Undo. Everything is worked out on
  screen; saved data is unchanged.
- Checked at 360px, light and dark, with pretend entries over 30 days (removed afterwards): all 4
  views, streak 4 → 5 on reaching today's goal, delete back to 4, Undo back to 5, empty chart and
  no-streak message, no sideways scrolling, no new errors.

**Known issues**
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".
- The 30-day view shows a date label about every 8 days to fit the phone; tap a bar to see its full date.

## WGT-1: Log weight (24 Nov 2026)
**Built**
- ⚖️ Weight screen (mint): "Today's weight (kg)" box with a Save button. Accepts 20–300 kg (a comma
  works as the decimal point too) and rounds to 1 decimal (72.46 → 72.5). Anything else gets a friendly message.
- One weight per day: saving again replaces today's value. When today has a weight, the box shows it,
  the button says "Update", and a note says "Saved for today: 72.1 kg ✨".
- "Entries" list of all weights, newest first ("72.1 kg · Today · 24 Nov 2026"), with a friendly empty message.
- Each row has edit (opens a weight box in the row with Cancel / Save) and delete. Deleting shows
  "Deleted 72.1 kg · Undo" for 5 seconds. If that day got a new weight before Undo, the new one is kept
  and a short message says so (still one per day).
- Checked at 360px, light and dark, with pretend entries (removed afterwards, nothing sent to Google):
  bad value message, rounding, replace today, edit, delete and Undo all work, no sideways scrolling,
  buttons ≥ 44px, no new errors.

**Known issues**
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".
- Only the weight can be edited, not the date. Past days can't be logged yet (only today).

## WGT-2: Weight chart (24 Nov 2026)
**Built**
- ⚖️ Weight screen: new "History" card (mint) under the Entries list.
- "Days to show" pill buttons: 30, 90 and 365. The chosen one lights up; it opens on 30.
- Line chart of daily weight with a soft wash under it, plus a softer dashed "7-day average" line
  (the average of the weights logged in the 7 days up to each day) and a small legend. Days with no
  weight are skipped (the line joins across them).
- Under the chart: "📉 −2.4 kg since 25 Oct 2026" (or 📈 +… / ➖ No change), comparing the first and
  latest weights in the chosen view. With fewer than 2 weights in view: "Log a few more days to see your change ✨".
- Updates straight away after saving, editing, deleting or Undo. Worked out on screen; saved data unchanged.
- `core/charts.js`: line charts with more than 60 days now hide the dots (line only), so the 90 and
  365-day views don't look crowded. Shorter charts are unchanged; bar charts (water) are unaffected.
- Checked at 360px, light and dark, with 67 pretend weights over 100 days (removed afterwards; Google
  Sync isn't set up in the test browser, so nothing was sent): all 3 views, change line, delete and Undo,
  empty state, no sideways scrolling, no new errors.

**Known issues**
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".
- The 365-day view always shows a full year, so with only a few months of weights most of it is empty.
- With a long list of weights, you have to scroll past the Entries list to reach the chart.

## WGT-3: BMI and goal progress (24 Nov 2026)
**Built**
- ⚖️ Weight screen: new "My height & goal" card at the bottom. Height can be typed in **cm** or
  **feet + inches** (pill buttons to switch; switching converts what's typed). Goal weight in kg.
  Both are optional; leaving a box empty clears it. Accepts heights of 100–250 cm (3 ft 4 in to 8 ft 2 in).
- New "BMI & goal" card under "Log weight":
  - BMI from the latest weight, e.g. "BMI 23.4 · Healthy" (bands: Underweight under 18.5, Healthy
    18.5–24.9, Overweight 25–29.9, Obese 30+), with the height shown both ways ("170 cm (5 ft 7 in)").
    No height: "Add your height below to see your BMI ✨".
  - Goal progress: a mint bar from the first-ever weight to the goal, "4.0 kg to go · 50%", or
    "Goal reached! 🎉". Works for losing or gaining. No goal: "Set a goal weight below…".
- Updates straight away after saving, editing, deleting or Undo, and after saving height/goal.
- Saved data: weight settings now hold `heightCm` (always in cm), `goalKg` and a new `heightUnit`
  ('cm' or 'ftin', only remembers how you like to type height). Weights themselves are unchanged.
- Checked at 360px, light and dark, with pretend weights (removed afterwards; Google Sync isn't set up
  in the test browser, so nothing was sent): feet + inches and cm, unit switch, error messages,
  goal reached, clearing, delete and Undo, no sideways scrolling, buttons ≥ 44px, no new errors.

**Known issues**
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".
- Feet + inches are shown rounded to the nearest inch. Height and goal move to the full Settings
  screen with CORE-8 (they stay in the same saved place, so nothing is lost).

## SLP-1: Log a night (24 Nov 2026)
**Built**
- 😴 Sleep screen (lavender), four cards:
  - **Bedtime**: "🌙 Going to bed" saves the bed time now and shows "😴 Sleeping since 11:15 pm" with
    "☀️ I'm awake" (saves the night, "Good morning ☀️ You slept 7 h 30 m") and Cancel.
  - **Log a night**: bed date + time and wake date + time, starting on last night (11:00 pm → 7:00 am;
    before 7 am it starts on the night before). Shows "You slept 8 h 💤" before saving. Friendly
    messages if wake isn't after bed, the night is over 24 hours, or the wake time is in the future.
  - **Nights** list, newest first ("7 h 30 m · 11:00 pm → 7:00 am · 23 Nov 2026"), with edit (all four
    boxes in the row) and delete with "Deleted 7 h 30 m · Undo".
  - **Wake-up cut-off** (my extra request): a time, 10:00 am to start with; leave empty to switch off.
    If "Going to bed" was tapped and "I'm awake" forgotten, the night is saved with the wake time at the
    cut-off (the first cut-off after bed time), marked "⏰ auto wake", with a message to edit if needed.
- One entry per night, filed under the morning you woke up; saving a night for a morning that already
  has one replaces it (the button says "Update" and a note warns). Editing can't move a night onto a
  morning that already has one.
- Saved data: sleep entries are `date`, `bedTime`, `wakeTime` as in the spec, plus a new `autoWake`
  (Yes/No; shown as an "Auto wake" column in Google Sheets). Editing a night sets it back to No.
  Sleep settings now also hold `wakeCutoff` and `pendingBedTime` (the bed time while a night is open;
  settings are never synced). Nothing existing was changed.
- `core/styles.css`: new shared `.field-row` (date box wider than time box) so dates aren't cut off at 360px.
- Checked at 360px, light and dark, with pretend nights (removed afterwards; Google Sync isn't set up in
  the test browser): save, replace, all 3 error messages, bed → awake, forgotten wake → auto 10:00 am,
  edit, edit clash, delete and Undo, cut-off off/on, no sideways scrolling, buttons ≥ 44px, no new errors.

**Known issues**
- The automatic wake time is filled in when the 😴 Sleep screen is opened (or while it's open), not
  while the app is closed. The time saved is still the cut-off, so nothing is lost; it just reaches
  Google Sheets once the Sleep screen is opened. (HOME-1 could also do this from the home screen.)
- Tapping "I'm awake" after the cut-off has passed saves the cut-off time, not the actual time; edit it if needed.
- The cut-off setting moves to the full Settings screen with CORE-8 (same saved place, nothing lost).
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".

**Update (24 Nov 2026): Sleep buttons on the Home screen**
- 🏠 Home now has a small 😴 Sleep card at the top, so sleep is logged without opening the Sleep screen:
  - From 10 pm to 6 am (and no night open): "🌙 Going to bed" (message "Good night 🌙" with Undo).
  - While a night is open: "😴 Sleeping since 10:30 pm", and from the first 6 am after bed time an
    "☀️ I'm awake" button. Tapping it works out the sleep (bed → awake) and saves the night
    ("Good morning ☀️ You slept 8 h 15 m").
  - At other times (6 am–10 pm with no night open) the card is hidden.
  - The wake-up cut-off now also works from Home: a forgotten "I'm awake" is filled in when Home opens.
  - The card updates by itself every minute while Home is open (e.g. at 10 pm and 6 am).
- The 😴 Sleep screen keeps its Bedtime card (any time of day), the manual "Log a night" form and the list.
  "Going to bed" there now also offers Undo.
- `sleep/index.js` gives the Home screen its card (`homeCard`); `index.html` shows it;
  `core/styles.css` new `.home-sleep` so a hidden card leaves no gap. No saved-data changes, no new files.
- Checked at 360px, light and dark, with a pretend clock and pretend nights (removed afterwards): 3 pm and
  9:59 pm hidden, 10:30 pm bed, Undo, 4 am "from 6 am" note, 6:45 am awake → 8 h 15 m saved, forgotten
  wake → auto 10:00 am from Home, Sleep screen still works, no sideways scrolling, no new errors.

**Known issues**
- Between 10 pm and 6 am, "I'm awake" isn't on Home (e.g. waking at 5:30 am); use the 😴 Sleep screen then.
- Going to bed before 10 pm also needs the 😴 Sleep screen.

## SLP-2: Sleep history (24 Nov 2026)
**Built**
- 😴 Sleep screen: new "History" card (lavender) under the Nights list.
- "Days to show" pill buttons: 7, 14 and 30 (7 added to the spec's 14/30, as asked). The chosen one
  lights up; it opens on 7.
- Bar chart of hours slept each night (filed under the morning you woke up), with a dashed "Target"
  line at 8 h (sleep settings, so CORE-8 can change it). Nights with nothing logged show as gaps.
  The side axis reads "0 h, 5 h, 10 h"; tapping a bar shows e.g. "7 h 30 m".
- Under the chart: average sleep ("7 h 22 m"), average bedtime ("11:36 pm") and average wake time
  ("6:58 am") for the nights in the chosen view, plus "From 6 nights in the last 7 days."
  Bedtimes either side of midnight average correctly (11:30 pm and 12:30 am → 12:00 am, not noon).
  With no nights in view: "Log a few nights to see your averages ✨".
- Updates straight away after saving, editing, deleting, Undo, "I'm awake" or an auto wake.
  Worked out on screen; saved data unchanged.
- Checked at 360px, light and dark, with 19 pretend nights over 25 days (removed afterwards, with their
  waiting Google Sync changes; Google Sync isn't set up in the test browser): all 3 views, averages
  checked by hand, delete and Undo, empty message, no sideways scrolling, buttons 44px, no new errors.

**Known issues**
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".
- With a long Nights list, you have to scroll past it to reach the History card.

## MON-1: Add expense (24 Nov 2026)
**Built**
- 💸 Money screen (butter yellow), two cards:
  - **Add expense**: Amount (₹) first, then Category and "Paid by" (UPI / Cash / Card / Other) side by
    side, Date (today to start with) and an optional Note. After saving, the amount and note clear and
    category, payment and date stay, ready for the next one ("Saved ₹250 · 🍔 Food ✨").
    Friendly messages for an empty, zero, wrongly typed (e.g. 12.345) or huge (over ₹1 crore) amount
    and for a future date. Amounts like "1,23,456.50" are accepted.
  - **Expenses** list grouped by day, newest first; each day heading shows its total
    ("Today · 24 Nov 2026 … ₹1,23,706.50"). Rows read "🍔 Food · UPI · lunch … ₹250".
    Tap a row to edit all five boxes (Cancel / Save); the bin button deletes with "Deleted ₹250 · Undo".
- 8 starter categories (🍔 Food, 🛒 Groceries, 🚌 Transport, 🧾 Bills, 🛍️ Shopping, 💊 Health,
  🎬 Entertainment, 📦 Other) are saved once, the first time the Money screen opens. A note in money
  settings (`categoriesSeeded`) stops them coming back if you delete them all later (MON-2).
- Saved data: expenses are `date`, `amountPaise`, `category`, `paymentMethod`, `note` as in the spec;
  `category` holds the category's ID so renaming a category later won't break old expenses.
  Categories are `name`, `icon`, `monthlyBudgetPaise` (empty for now). Nothing existing was changed.
- Google Sheets shows the category's name (not its ID) in the Expenses tab (`core/sync.js`).
- `core/styles.css`: new shared `.list-group__title` (a heading with a total over a group of rows).
- Checked at 360px, light and dark, with pretend expenses (removed afterwards, with their waiting Google
  Sync changes; Google Sync isn't set up in the test browser): all 4 error messages, save, day totals,
  edit (moved to another day), delete and Undo, no sideways scrolling, all boxes and buttons ≥ 44px.

**Known issues**
- The list shows every expense ever; with many months it gets long (MON-3 adds a monthly view).
- If a category is deleted later (MON-2), its expenses show "❓ Unknown category" until changed.
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".

## MON-2: Categories (24 Nov 2026)
**Built**
- 💸 Money screen: new "Categories" card (butter yellow) under the Expenses list.
  - **Add a category**: a name box, an icon picker with 24 ready-made emoji to tap, and "Or type your own
    emoji" for any other. Friendly messages for an empty name, a name over 30 letters, a name you already
    have (any capital letters), or more than one emoji / not an emoji.
  - **List** of all categories (oldest first) with how many expenses use each ("2 expenses"). Tap a row or
    the pencil to edit name and icon in the row (Cancel / Save); the bin deletes with
    "Deleted 🐾 Pet care (used by 2 expenses) · Undo".
- Renaming or changing an icon shows straight away on old expenses (they're linked by ID). Deleted
  categories leave their expenses as "❓ Unknown category" until Undo or a new category is picked.
- The Add expense category choices update straight away after any change. If every category is deleted,
  saving an expense asks you to add a category first.
- New shared `.emoji-grid` style in `core/styles.css` (5 emoji buttons per row at 360px, each ≥ 44px).
- Saved data unchanged: categories are `name`, `icon`, `monthlyBudgetPaise` as before.
- Checked at 360px, light and dark, with pretend categories and expenses (removed afterwards, with their
  waiting Google Sync changes): all error messages, add, edit (incl. clash with another name), rename shows
  on expenses, delete and Undo, counts update after adding/deleting expenses, no sideways scrolling,
  all buttons and boxes ≥ 44px, no new errors.

**Known issues**
- With many expenses, you have to scroll past the Expenses list to reach Categories.
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".

**Update (24 Nov 2026): clearer edit rows**
- `core/styles.css`: boxes and secondary buttons (e.g. Cancel, unselected emoji) inside a list row now use
  the card colour, so they stand out from the row's pale background. This helps every edit row in the
  app (weight, sleep, expenses, categories). Checked at 360px in light and dark.

## MON-3: Monthly summary (24 Nov 2026)
**Built**
- 💸 Money screen: new "This month" card (butter yellow) between "Add expense" and the Expenses list.
- ◀ ▶ buttons around the month name ("Nov 2026") to look back at earlier months; ▶ is greyed out on the
  current month.
- The month's total in large text ("₹2,250.50") and "4 expenses in Nov 2026" (or "No expenses in Nov 2026 yet").
- Compared with the month before: "📈 ₹450.50 more than Oct 2026", "📉 … less than …" or "➖ Same as …".
  If the month before has no expenses: "No expenses in Oct 2026 to compare with."
- One row per category, biggest first: emoji and name, share of the month and count ("56% · 1 expense"),
  and its total. Expenses with a deleted category are counted under "❓ Unknown category".
- Updates straight away after adding, editing (also moving an expense to another month), deleting, Undo
  and renaming a category. Worked out on screen; saved data unchanged.
- `core/styles.css`: new small `.month-nav` style (◀ month ▶ in one row).
- Checked at 360px, light and dark, with 7 pretend expenses over Sep–Nov (removed afterwards, with their
  waiting Google Sync changes): totals and differences checked by hand, all months back to an empty one,
  ▶ stops at this month, delete and Undo, edit moving to October, category rename, no sideways scrolling,
  buttons 44px, no new errors.

**Known issues**
- For the current month, the comparison is this month so far against the whole of last month, so early
  in the month it usually says "less".
- Percentages are rounded, so they can add up to 99% or 101%.
- Months show the way the shared date helper writes them, so September is "Sept 2026".
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".

## MON-4: Money charts (24 Nov 2026)
**Built**
- 💸 Money screen: new "Charts" card (butter yellow) under "This month". It follows the month picked
  there with ◀ ▶.
- **By category**: one sideways bar per category for that month, biggest first ("🧾 Bills", "🛒 Groceries"…),
  with ₹ along the bottom. Tap a bar to see its total ("₹899.50"). A month with no expenses shows
  "No expenses in Aug 2026 to show yet." instead.
- **Over time**: "Days" / "Months" pill buttons. Days = a bar for each day of that month (up to today);
  Months = the 12 months up to that month ("Dec … Nov", full month name when tapped).
- Updates straight away after adding, editing, deleting, Undo and renaming a category. Worked out on
  screen; saved data unchanged.
- `core/charts.js`: bar charts can now lie sideways (`horizontal: true`), labels can be months
  ('2026-11' → "Nov") or any text (shortened with "…" after 14 letters, full when tapped), and a chart's
  height can change on update. Water, weight and sleep charts are unchanged (water re-checked).
- Checked at 360px, light and dark, with 11 pretend expenses over Dec 2025–Nov 2026 (removed afterwards,
  with their waiting Google Sync changes): totals checked by hand, both views, ◀ ▶ incl. an empty month
  and back, delete and Undo, no sideways scrolling, no new errors.

**Known issues**
- Month labels on the axis are just the month ("Dec", "Jan"), so the year shows only when a bar is tapped.
- Days with no spending show as no bar (₹0).
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".

## MON-5: Budgets (24 Nov 2026)
**Built**
- 💸 Money screen: new "Budgets" card (butter yellow) under "This month". It follows the month picked
  there with ◀ ▶. The same budget counts for every month.
- Every category is listed. Tap a category (or its pencil) to set or change its monthly budget in the row
  (Cancel / Save). Leave the box empty to have no budget. "Remove budget" takes it off, with Undo.
  Friendly messages for a wrongly typed, zero or huge amount.
- Categories with a budget come first, each with "₹2,150.50 spent of ₹3,000 · ₹849.50 left" and a soft bar.
  When over: "⚠️ ₹400 over budget" and the bar turns soft coral. Categories without a budget say
  "No budget · tap to set one" (plus what was spent, if anything).
- At the top: all budgets together ("₹449.50 left", "₹3,550.50 spent of ₹4,000 budget in Nov 2026") with a bar.
  Only categories that have a budget count here.
- Saved data unchanged: the budget goes in the category's existing `monthlyBudgetPaise` (empty = none).
  Deleting a category and tapping Undo brings its budget back. Budgets sync to Google Sheets like before.
- `core/styles.css`: bars can show "over" in soft coral (`.progress--over`); slimmer bars inside list rows.
- Checked at 360px, light and dark, with 6 pretend expenses and budgets over Oct–Nov (removed afterwards,
  and the waiting Google Sync list put back exactly as it was): totals checked by hand, set / change /
  empty box / remove + Undo, wrong amount message, ◀ to Oct, category delete + Undo keeps the budget,
  no sideways scrolling, buttons ≥ 44px, no new errors.

**Known issues**
- Changing a budget also changes it for past months (there is one budget per category, not one per month).
- The Budgets list shows every category, so with many categories it gets long.
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".

## MON-6: Export a month to Excel (24 Nov 2026)
**Built**
- Changed from the spec's CSV to a real Excel file (.xlsx), as asked, so it can have colours and be
  understood in 15–20 seconds. SPEC.md updated.
- 💸 Money screen: new "Export" card under Charts. It follows the month picked in "This month" with ◀ ▶.
  "⬇️ Download Nov 2026 (Excel)" saves `lifetracker-expenses-2026-11.xlsx` to Downloads, with a message.
  A month with no expenses shows "No expenses in Sept 2026 to export." and the button is greyed out.
- **Summary tab** (no grid lines, butter-yellow headings): big total; number of expenses; compared with
  last month (green if less, red if more); daily average; biggest expense; top category; budgets left/over.
  Then three small tables with coloured bars made of █ blocks: "Where the money went" (category, amount,
  share %, count, total row), "Budgets" (budget, spent, % used, a green or red bar with ₹ left/over; only
  if a budget is set) and "How you paid" (UPI / Cash / Card / Other).
- **Expenses tab**: every expense, oldest first: Date ("01 Nov 2026"), Amount (₹), Category, Paid by, Note,
  with a total row, the header row frozen and filter buttons. Amounts are real numbers (Excel can add
  them up) shown with Indian grouping (₹1,23,45,678.90); dates are real dates.
- New `core/xlsx.js`: a small Excel file maker built into the app (no outside library, works offline),
  using the colours from `core/styles.css`. CORE-7's "Export to Excel" can reuse it. Text from the app is
  always saved as plain text, so a note like "=SUM(A1)" can't act as a formula.
- `sw.js`: cache version 6 with the new file.
- Checked: the file opens in real Excel on this laptop with no repair message; all values, ₹ crore
  grouping, dates, colours and bars checked. Money screen checked at 360px in light and dark mode:
  Nov, Oct and an empty Sept, button 44px tall, no sideways scrolling, no new errors. The 13 pretend
  expenses and 2 budgets were removed afterwards, and the waiting Google Sync list put back to its 12 entries.

**Known issues**
- Not yet opened in Google Sheets or a phone spreadsheet app (should work: it's a standard Excel file).
  If Google Sheets shows the ₹ amounts oddly, tell me.
- The bars are made of █ blocks (they work everywhere); there are no Excel charts in the file.
- On iPhone, the file may open in a preview first; use Share → Save to Files.
- The phone gets this at the final "release".

**Update (24 Nov 2026): export any dates**
- The Export card now has two pill buttons: "Month" (as before) and "Pick dates" (From and To boxes,
  starting on this month so far). "⬇️ Download (Excel)" saves e.g.
  `lifetracker-expenses-2026-09-01-to-2026-11-24.xlsx`, with the same colourful Summary tab and Expenses tab.
- For picked dates, the comparison is with the same number of days just before (e.g. 1–15 Nov vs
  17–31 Oct). Daily average counts the days picked (up to today). If the dates cover more than one month,
  a "📅 Month by month" table with bars is added.
- Friendly messages for a future date, "To" before "From", and dates with no expenses.
- Saved data unchanged; no new files.
- Checked: a Sep–Nov file opened in real Excel with correct totals, daily average, month-by-month table
  and comparison; Money screen at 360px in light and dark mode, all boxes and buttons ≥ 44px, no sideways
  scrolling. The 11 pretend expenses were removed and the waiting Google Sync list is back to its 12 entries.

**Known issues**
- Budgets are monthly, so the Budgets table appears only in "Month" exports, not for picked dates.

## TSK-1: Tasks (24 Nov 2026)
**Built**
- ✅ Tasks screen, "Add a task" card: task name, optional due date (with quick "Today", "Tomorrow" and
  "No date" pills) and optional notes. A friendly message if the name is left empty. After adding, the
  list it went into opens so you see it.
- "My tasks" card with four pill buttons (2 × 2 on a phone): **Today** (due today plus overdue, marked
  "⚠️ Overdue"), **Upcoming** (later dates, soonest first), **No date** and **Done** (newest first,
  crossed out, with when it was done). A small line shows e.g. "2 to do · 1 overdue". Each list has its
  own friendly empty message. Long task names wrap instead of being cut off.
- Tap the circle to tick a task off ("Done! 🎉" with Undo); tap the tick in Done to bring it back.
- Tap a task to edit it in place (Cancel / Save); if its date changes list, a message says where it went.
- 🗑️ deletes with Undo.
- Saved fields: `title`, `notes`, `dueDate` (or empty), `done`, `doneAt` ('YYYY-MM-DD HH:MM'). Due time,
  priority and repeating come in TSK-2.
- `core/storage.js`: "list everything" used to skip records with no date (it would have hidden tasks with
  no due date). Fixed; other modules get exactly the same results and order as before. Saved data unchanged.
- `core/ui.js`: two new icons (circle, tick). `core/styles.css`: done rows, wrapping rows, 2 × 2 button grid.
- `sw.js`: cache version 7.
- Checked at 360px in light and dark mode: add, empty-name message, tick + Undo, untick + Undo, edit
  (moved to Upcoming), delete + Undo; all buttons and boxes ≥ 44px, no sideways scrolling. The 4 pretend
  tasks were removed and the waiting Google Sync list is back to its 12 entries.

**Known issues**
- The built-in preview browser on this laptop refuses to start the offline helper for any file (a limit of
  that browser, not the app); everything else worked there. Offline use is unchanged in real browsers.
- The phone gets this at the final "release".

## TSK-2: Due time, priority and repeating tasks (24 Nov 2026)
**Built**
- ✅ Tasks screen, add form and edit row: an optional **Time** box beside the due date (in the edit row
  they sit on separate lines so nothing is cut off), **Priority** pills (Low / Normal / High, Normal to
  start) and **Repeat** pills (None / Daily / Weekly / Monthly, 2 × 2). After adding, they go back to Normal / None.
- A time needs a date: "Pick a due date too, or clear the time." The "No date" pill also clears the time.
  A repeating task with no date starts today.
- Rows show e.g. "🔴 High · Due today · 7:30 am · 🔁 Weekly"; low tasks show "Low". High tasks go to the top
  of Today, Upcoming and No date, then soonest date; on the same day, tasks with a time come first, earliest first.
- Ticking off a repeating task adds the next one ("Done! 🎉 Next one: 1 Dec 2026"), with the same time,
  priority, notes and repeat. Undo takes the next one away again. The next date is always after today, so
  ticking off an old overdue task doesn't make another overdue one. Monthly on the 31st → last day of a
  shorter month. Ticking, unticking and ticking again doesn't make a second copy.
- Saved data: tasks now also have `dueTime` ('HH:MM' or empty), `priority` ('low' / 'normal' / 'high') and
  `repeat` ('none' / 'daily' / 'weekly' / 'monthly'), as in the spec. Older tasks without them count as
  Normal, no repeat; nothing needed converting. Google Sheets gets "Due time", "Priority" and "Repeat" columns.
- Checked at 360px in light and dark mode: time-without-date message, add with all options, sorting,
  repeating weekly / daily / monthly (31 Oct → 30 Nov), Undo removes the next one, no duplicate, edit
  (priority and time), all buttons and boxes ≥ 44px, no sideways scrolling. The pretend tasks were removed
  and the waiting Google Sync list is back to its 12 entries.

**Known issues**
- Monthly repeats can drift after a short month (31 Oct → 30 Nov → 30 Dec), because each one follows the last.
- Priority and repeat show in Google Sheets as plain words in lowercase ("high", "weekly").
- No new files, so `sw.js` didn't need changing; the phone gets this at the final "release".

## CORE-9: Notifications helper (24 Nov 2026)
**Built**
- New `core/notify.js`, a helper any module can use (TSK-3 reminders will be the first):
  - tells whether notifications are On / Off / Blocked / Not available here
  - asks the phone for permission, only after a button is tapped (never by itself on opening)
  - shows a phone notification with a title, short message, emoji and the screen to open when tapped.
    On phones it goes through the offline helper (`sw.js`), which Android needs.
- Backup banner: if notifications are off, blocked or not available (e.g. iPhone outside the installed app),
  the same message shows as a soft rounded banner at the top of the app, with ✕ to close it and an optional
  "Open" button that goes to the right screen. The same message can't show twice (it replaces itself).
  Banners stay until closed, even when changing screens.
- `sw.js`: tapping a phone notification brings the app forward on the right screen (or opens it).
  Cache version 8 with the new file.
- ⚙️ Settings: new "🔔 Notifications" card showing the state in plain words, "🔔 Turn on notifications"
  (only when Off) and "Send a test". Blocked and Not available explain what to do.
- `core/styles.css`: banner styles (small slide-in, off when the phone asks for reduced motion), and a fix so a
  hidden button really disappears. This also fixes "Change account" in Google Sync, which stayed visible
  after being tapped.
- No saved data changed; nothing new is stored.
- Checked at 360px in light and dark mode: Blocked state text, Send a test → banner, tapping twice gives one
  banner, "Open" goes to Tasks, ✕ closes, close button 44px, no sideways scrolling. The "On" path was
  checked with a pretend notification system (it shows a notification, not a banner).

**Known issues**
- The preview browser on this laptop has notifications blocked and can't run the offline helper, so a real
  phone notification and tapping it haven't been seen yet; check on the phone after the final "release".
- Notifications only appear while the app is open or recently used (no internet server), as SPEC.md says.
  TSK-3 adds the actual task reminders and the overdue banner.
- The phone gets this at the final "release".

## TSK-3: Task reminders (24 Nov 2026)
**Built**
- ✅ Tasks screen, add form and edit row: new "🔔 Reminder" pills: None, At due time, 10 min before,
  1 hour before, Custom. Custom shows "Remind me on" + "At" boxes (starting on the due date, or today).
  The set choices need a due date and time ("Pick a due date and time too, or choose Custom."). A new or
  changed reminder can't be in the past ("That reminder time has already passed.").
- Saving a task with a reminder asks the phone for notification permission, if it hasn't been asked yet.
- Task rows show the reminder, e.g. "Due today · 10:00 am · 🔔 9:00 am" (with the date if it's another day).
- While the app is open, reminders are checked every 30 seconds and whenever the app comes back on screen.
  A reminder that has just come due (within 5 minutes) shows as a phone notification "⏰ Pay rent · Due today
  · 7:30 pm" that opens Tasks when tapped, or as a banner if notifications are off or blocked.
- Reminders that passed while the app was closed show on opening as one banner: "⏰ 2 missed reminders"
  with the task names (up to 3, then "and 2 more") and an "Open" button to Tasks.
- Each reminder shows only once. Changing a task's reminder makes it count as new. Done tasks never remind.
- Repeating tasks: the next one keeps the same gap (10 min before 7:30 pm → 10 min before 7:30 pm next time).
- Saved data: tasks now use `reminderAt` ('YYYY-MM-DD HH:MM' or empty), as in the spec (Google Sheets gets a
  "Reminder at" column automatically). Tasks settings have a new `remindersShown` (which reminders were
  already shown; settings are never synced). Older tasks have no reminder; nothing needed converting.
- `index.html` starts the reminder checker when the app opens (from `tasks/index.js`). No new files.
- Checked at 360px-wide phone size in light and dark mode, with pretend tasks and a reminder set 2 minutes
  back: both error messages, Custom boxes, at-due-time/10 min/1 hour saved correctly, reminder banner,
  "2 missed reminders" banner, no repeat after reopening, weekly repeat carries the reminder (25 Nov 9:15 am →
  2 Dec 9:15 am), editing picks the right pill, done task is tidied away, no sideways scrolling. The pretend
  tasks were removed and the waiting Google Sync list is back to its 12 entries.

**Known issues**
- Reminders only fire while the app is open or recently used (no internet server), as SPEC.md says. A reminder
  missed while closed shows in the "missed" banner on the next opening. TSK-4 (calendar file) gives guaranteed alerts.
- The preview browser has notifications blocked, so only the banner was seen; check the real phone
  notification after the final "release".
- A reminder that passes while a task is deleted and then brought back with Undo may show again once.
- The phone gets this at the final "release".

## TSK-4: Add to calendar (24 Nov 2026)
**Built**
- ✅ Tasks: each not-done task with a due date has a small 📅 calendar button next to the bin. Tapping it saves
  an .ics file (named after the task, e.g. "Pay rent.ics") to Downloads; opening it adds the task to the
  phone's calendar, which alerts even when Lifetracker is closed. A message says "Saved … · open it to add to
  your calendar 📅".
- The edit row has an "Add to calendar" button that uses what's in the boxes right now (no need to save first).
  Without a due date it says "Give the task a due date first 📅".
- What goes into the calendar: the task name (with ✅) and notes; a task with a time becomes a 30-minute event,
  a date only becomes an all-day event. The alarm is the task's reminder (e.g. 10 min before), or at the due time
  if it has none (9:00 am for all-day tasks). Repeating tasks repeat in the calendar too (daily / weekly /
  monthly; a monthly task on the 29th–31st falls back to a shorter month's last day, like the app).
- Times are India time, written so any calendar shows them correctly. The same task always gets the same
  event ID, so some calendars update the event instead of adding a second one.
- `core/ui.js`: new small calendar icon. No new files, no saved data changed, nothing new stored.
- Checked at 360px in dark mode with pretend tasks: timed monthly task (7:30 pm → correct time, alarm 10 min
  before, commas/semicolons/line breaks in the name and notes handled), all-day task (alarm 9:00 am), edit row
  with a changed date (31 Dec → "last day of the month" repeat), undated task message, very long Hindi name
  (lines split correctly), no sideways scrolling. Pretend tasks removed; Google Sync waiting list is back to 12.

**Known issues**
- The file couldn't be opened in a real calendar from the preview browser; check on the phone after the final
  "release". On Android, open the downloaded file and pick your calendar app (Google Calendar may ask which
  account). On iPhone, tap the download, then "Add to Calendar".
- The calendar event is a copy: later changes or ticking the task off in Lifetracker don't change it. Tapping
  📅 again after a change may update it or add a second event, depending on the calendar app.
- Some calendar apps ignore alarms in imported files and use their own default alert instead.
- The phone gets this at the final "release".

### TSK-4 update: Google Calendar choice (24 Nov 2026)
- Tapping 📅 on a task now shows "📅 Add to calendar" under it with two buttons: **Google Calendar** and
  **Calendar file (any calendar)**. Tapping 📅 again, another task or another list closes it. The edit row shows
  the same two buttons (using what's in the boxes now).
- Google Calendar opens calendar.google.com (or the Google Calendar app) with the task's name, date and time
  (India time), notes and repeat filled in; tap Save there. It needs internet, and Google can't take the
  reminder this way, so it uses your calendar's usual alert. The calendar file still keeps the exact reminder
  and works offline (on the laptop it opens in Outlook because that's the laptop's calendar app).
- Checked at 360px in dark mode with a pretend task: both buttons, the Google link (timed and all-day, monthly
  repeat, notes), the file download, no sideways scrolling. Pretend task removed (this preview had an empty Google Sync waiting list, and it is empty again).
- Known issue: the release secret scan only allows certain links, so `calendar.google.com` in `tasks/index.js`
  needs to be on the allowed list (CLAUDE.md) or the release will stop on it.

## RDG-1: Books (24 Nov 2026)
**Built**
- 📚 Reading screen: "Add a book" card (title, author, total pages, format 📖 paper / 📱 ebook / 🎧 audio,
  "Add to" Reading now or Wishlist, start date filled with today). Title is needed; pages are needed except
  for the wishlist and must be a whole number from 1 to 20,000.
- Lists: **Reading now**, **Wishlist** (asked for by you; each book has a "Start" button that moves it to
  Reading now with today's start date), **Finished** (finish date and ⭐ rating shown), and **Paused & dropped**
  (only shows when it has books).
- Tap a book to edit it: every detail, any status, start date, and (when Finished) finish date and optional
  1–5 ⭐ rating. Dates fill in with today when a status needs them; dates can't be in the future and the
  finish date can't be before the start. "Delete book" in the edit box, or the bin on the row, with Undo.
- Saved data: uses the existing books store; one new status value, "wishlist" (SPEC.md updated). No change
  to how data is stored, no new files, so the offline list stays the same. Copied to the "Reading" tab of
  Google Sheets like everything else.
- Checked at 360px in light and dark mode with pretend books: all errors, wishlist → Start, edit to Finished
  with rating, paused, delete + Undo, long Hindi title, no sideways scrolling. Pretend books removed (this
  preview's Google Sync waiting list was empty and is empty again).

**Known issues**
- Long titles are cut short with "…" in the lists (same as other screens); tap the book to see it all.
- A wishlist book started without a page count asks for pages the next time you edit and save it.
- The phone gets this at the final "release".

## RDG-2: Check-ins (24 Nov 2026)
**Built**
- 📚 Reading screen: new "Check in" card at the top (above "Reading now"; "Add a book" moved below them, since
  checking in is the everyday job). Pick a book you're reading now, then Date (today to start with), "Page I'm on",
  optional minutes read and note. A line under the book shows "Last time: p. 60 of 300 · 20% · 5 days ago".
  With no book on the go it says so instead.
- Friendly messages for a page past the book's last page (or not a whole number), a future date, a date before
  you started the book, and minutes that aren't 1–1,440.
- One check-in per book per day: checking in again that day replaces the first ("Updated: p. 150 of 300 · 50% 📚").
  Reaching the last page says "Last page! 🎉 Tap the book to mark it Finished."
- "Reading now" rows: a sage progress bar from the latest check-in and a line "p. 150 of 300 · 50% · today"
  (or "No check-ins yet"). "📌 Check-in due" shows when 3 or more days have passed since the last check-in
  (or since the start date if there's none).
- Tap a book: under its edit boxes, "📍 Check-ins" lists them newest first ("p. 75 of 300 · 25%",
  "20 Nov 2026 · 20 min · Good start"). Tap one to edit it in place (can't move it onto a day that already has
  one); 🗑️ deletes with Undo.
- Deleting a book also deletes its check-ins; Undo brings both back.
- Saved data: check-ins use the existing drawer with `date`, `bookId`, `currentPage`, `minutesRead` (or empty),
  `note`, as in the spec. They copy to the "Reading" tab in Google Sheets (type "Check-in", book shown by name).
  Nothing existing changed; no new files, so `sw.js` didn't need changing.
- Checked at 360px in light and dark mode with pretend books and check-ins (removed afterwards, with their
  waiting Google Sync changes; this was a fresh test browser): all error messages, save, same-day replace,
  due note on and off, edit + clash message, delete + Undo, book delete + Undo, no sideways scrolling,
  all boxes and buttons ≥ 44px, no errors.

**Known issues**
- Checking in again on the same day replaces everything for that day, so leaving minutes empty the second time
  clears the minutes from the first.
- Check-ins are for "Reading now" books only; paused or finished books' check-ins can still be seen and edited
  by tapping the book.
- The phone gets this at the final "release".

## RDG extra: lent, gifted & suggested books (24 Nov 2026)
Asked for after RDG-2 (not a separate unit in SPEC.md; the book details there were updated).
**Built**
- 📚 Reading, add form and every book's edit box: new optional "💡 Suggested by" name, and
  "🤝 Lent, gifted or borrowed?" with No / 📤 Lent to / 🎁 Gifted to / 📥 Borrowed from / 💝 Gift from.
  Choosing one shows a name box (labelled e.g. "Borrowed from (name)") and a date (today to start with);
  Lent and Borrowed also get "Got it back on" / "Gave it back on" (optional). Friendly messages for a missing
  name, a name over 60 letters, a future date, or a back date before the lend date.
- Book rows show a people line, e.g. "💡 Suggested by Priya · 📤 Lent to Rahul · 20 Nov 2026".
- New "Lent, gifted & suggested" card at the bottom, in groups (empty groups are hidden):
  📤 With someone else ("Got it back" button), 📥 To give back ("Gave it back" button), 🎁 Gifts,
  ↩️ Back home, and 💡 Suggested by (sorted by the person's name). Both buttons offer Undo.
  Tapping a row opens that book's edit box and scrolls to it.
- Saved data: books get 5 new optional fields: `suggestedBy`, `lendType`, `lendPerson`, `lendDate`,
  `lendBackDate`. Older books simply have none (nothing to convert, no data changed). Google Sheets
  "Reading" tab gets columns "Suggested by", "Lent / gifted / borrowed", "Person", "Lent / gifted on", "Back on"
  (`core/sync.js` column names). No new files.
- Also: "Nothing on the go" now says "Add a book below" (the add form moved below in RDG-2).
- Checked at 360px in light and dark mode with pretend books (removed afterwards, with their waiting Google
  Sync changes): add with each type, missing-name and back-date messages, Got it back + Undo, Gave it back via
  edit, tapping a row opens the book, no sideways scrolling, all boxes and buttons ≥ 44px, no errors.

**Known issues**
- Only books in your lists can be lent or gifted; a book you never logged needs adding first (e.g. as Finished).
- One lend/gift at a time per book: lending a book that was a gift replaces the "Gift from" details.
- Lent/gifted types show in Google Sheets as lowercase words ("lent", "borrowed").
- The phone gets this at the final "release".

## RDG-3: Weekly reflection (24 Nov 2026)
**Built**
- 📚 Reading screen: new "Weekly reflection" card (sage), below Finished. Weeks run Monday to Sunday.
- **Sunday nudge:** on a Sunday with no reflection for this week yet, the card moves to the very top with
  "🌿 It's Sunday! Time to look back on your reading week ✨". Other days show a small line instead:
  "✅ This week's reflection is saved", "Missed last Sunday? You can still reflect on last week", or when the
  nudge comes.
- **Form:** Week (this week and the 11 before it, e.g. "Last week · 16–22 Nov 2026"; it opens on this week on
  Sunday, otherwise on last week if that one has no reflection yet), "📚 Books I read this week" as tap-to-pick
  pills (books checked in, being read, or finished that week; those checked in that week are already picked),
  💡 Key idea, 🛠️ How I used it (optional), 1–5 ⭐ for the week, 🎯 Next week's goal (optional).
  Friendly messages for a missing key idea or stars, and text over 2,000 letters.
- One reflection per week: picking a week that already has one fills the form with it, says so, and the button
  becomes "Update reflection".
- **Past reflections** list, newest first ("16–22 Nov 2026", books, key idea, ⭐ on the right). Tap one to edit it
  in place (can't move it onto a week that already has one); 🗑️ deletes with Undo.
- Saved data: reflections use the existing drawer with `weekStart`, `bookIds`, `keyIdea`, `howIUsedIt`,
  `weekRating`, `nextWeekGoal`, as in the spec. Nothing existing changed. Google Sheets "Reading" tab gets
  them as "Weekly reflection" with book names; `core/sync.js` names the column "How I used it".
- `core/styles.css`: new shared `.pill-wrap` (pill buttons that wrap onto more lines; long names end in "…").
  No new files, so `sw.js` didn't need changing.
- Checked at 360px in light and dark mode with pretend books, check-ins and reflections (a fresh test browser,
  cleared afterwards, including its Google Sync waiting list): both error messages, save, week already saved →
  update, edit + week clash message, delete + Undo, Sunday nudge (with a pretend Sunday clock), long book title,
  no sideways scrolling, all buttons and boxes ≥ 44px, no errors.

**Known issues**
- The Sunday nudge shows on the 📚 Reading screen only (a home-screen nudge could come with HOME-1/HOME-SUMMARY).
- Only the last 12 weeks can be picked for a new reflection.
- If a book is deleted, it disappears from the reflections that mention it (the rest of the reflection stays).
- The phone gets this at the final "release".

### Update (24 Nov 2026): longer writing boxes
- The boxes that hold paragraphs now take up to **20,000 letters** each (about 3,000 words), up from 2,000:
  weekly reflection (Key idea, How I used it, Next week's goal), task Notes, and the reading check-in Note
  (which had no limit before). 20,000 is the most the Google Sync script accepts in one box; anything longer
  would be refused by Google and stop syncing, so the app asks you to shorten it instead.
- Checked: 20,001 letters gives a friendly message in all three places; exactly 20,000 saves. Test data removed.
- Known issue: going higher (Google Sheets' own limit is 50,000 per cell) would need a change to
  `google-apps-script/Code.gs` and pasting it into Google again by hand.

## RDG-4: Reading stats (24 Nov 2026)
**Built**
- 📚 Reading screen: new "Stats" card (sage) under "Weekly reflection".
- **Pages read per week:** bar chart with "weeks to show" pills 4, 8 and 12 (opens on 4). Weeks run Monday to
  Sunday and each bar is labelled with its Monday ("9 Nov"). Pages come from check-ins: how far each check-in moved
  on from that book's check-in before (a book's first check-in counts from page 0; going back counts as 0).
  Under it: "320 pages in the last 4 weeks · about 80 a week", or a friendly message when there are none.
- **This year:** "📚 1 book finished in 2026" (Finished books with a finish date this year), plus pages read this
  year and the average ⭐ of those books (if any are rated).
- **Check-in streak:** "🔥 8 check-ins in a row on time": days with a check-in (any book), each no more than 3 days
  after the one before. It stays alive until a check-in is more than 3 days late; once one is due it adds
  "📌 check in today to keep it going". With no streak: "Check in to start a streak 💪".
- Updates straight away after check-ins, book changes, deletes and Undo. Worked out on screen; saved data unchanged,
  no new files, so `sw.js` didn't need changing.
- Checked at phone size (375px) in light and dark mode with 3 pretend books and 11 check-ins (removed afterwards,
  with their waiting Google Sync changes; fresh test browser): numbers checked by hand for 4 and 12 weeks, this year,
  streak, "due" note, streak broken, delete and Undo, empty state, buttons 44px, no sideways scrolling, no errors.

**Known issues**
- Pages are counted on the day of the check-in, so 3 days of reading logged in one check-in all land on that day
  (and in that day's week).
- A book read before you started using check-ins counts its first check-in's page as read that day.
- The phone gets this at the final "release".

## FOOD-1: Food library (24 Nov 2026)
**Built**
- 🍱 Food screen (peach), two cards:
  - **Add a food**: name, optional brand, a "⭐ Favourite" switch, optional serving ("1 katori") with its grams,
    then the nutrients. Calories, protein, carbs, fat, fibre, sugar and saturated fat are always shown, two boxes per
    line; the 11 vitamins and minerals are in a fold-out "Vitamins & minerals (optional)" part. Any box can be left
    empty (empty = unknown, not zero).
  - **"Per 100 g" / "Per serving" pills**: values can be typed from either column of a packet. Per serving needs the
    grams; the app saves everything per 100 g. Switching pills converts what's already typed. Editing a food shows
    the values the way they were typed.
  - **My foods**: search box (name or brand), "2 foods · 1 ⭐ favourite", favourites first then A–Z. Rows read
    "Poha · 1 katori · 150 g · 270 kcal" (or "58 kcal per 100 g" with no serving). Tap a food to edit everything in
    place (Cancel / Save), ☆ / ★ button makes it a favourite, 🗑️ deletes with Undo.
- Friendly messages: missing name, same food already saved (same name and brand, any capitals), serving without grams,
  grams not 0.1–5,000, not a number, over 900 kcal per 100 g, a nutrient heavier than the food, sugar more than carbs,
  saturated fat more than fat. A mistake in a vitamin box opens the fold-out.
- Saved data: foods use the existing food library drawer with the spec's fields (nutrients per 100 g, empty ones as
  blank). One new field `enteredPer` ('100g' or 'serving') only remembers how values were typed (SPEC.md updated).
  Copied to the "Food" tab in Google Sheets as "Food library". Nothing existing changed.
- `core/ui.js`: new star icons. `core/styles.css`: new shared `.field-grid` (two small boxes per line).
  No new files, so `sw.js` didn't need changing.
- Checked at 360px in light and dark mode with 2 pretend foods (removed afterwards, with their waiting Google Sync
  changes; the waiting list is back to 0): every error message, per-serving → per 100 g (270 kcal in 150 g → 180),
  edit shows per-serving values, pill switch converts, duplicate name, search and no-match message, favourite,
  delete + Undo, all buttons and boxes ≥ 44px, no sideways scrolling, no errors.

**Known issues**
- Switching the pills rounds to 2 decimals, so a value can shift very slightly (4.667 → 4.67).
- In Google Sheets the nutrient columns (e.g. "Protein (g)") are per 100 g, but the column names don't say so.
- Deleting a food will matter once FOOD-2 logs it: past log entries keep their own copy of the nutrients.
- The phone gets this at the final "release".

### FOOD-1 extra: your own vitamins and minerals (24 Nov 2026)
**Built**
- 🍱 Food, "Vitamins & minerals" fold-out (add form and edit box): a "＋ Add your own" button opens a name box and
  unit pills (mg / µg / g). The new nutrient gets a box straight away, in every open food form, without losing
  what's typed.
- New "My extra nutrients" card at the bottom: add one, list ("Selenium (µg) · In 2 foods"), tap or ✏️ to rename
  or change the unit in place, 🗑️ to delete. Deleting also takes its values off every food; Undo puts both back.
- Friendly messages: empty name, over 30 letters, a name already in the built-in list (e.g. "Sodium"), or one you
  already made (any capitals). Values work like the built-in ones: per 100 g or per serving, converted when the pills
  switch, and can't weigh more than the food.
- Saved data: food settings get `customMicros` (the list; settings are never synced) and each food gets an optional
  `extraNutrients` (values per 100 g, by nutrient). Existing foods have none; nothing needed converting. SPEC.md updated.
- `core/sync.js`: Google Sheets shows these in one "Extra nutrients" column as readable text,
  e.g. "Selenium (µg): 30, Omega-3 (g): 0.2".
- Checked at 360px in light and dark mode with a pretend egg and two pretend nutrients (removed afterwards; the
  waiting Google Sync list is back to 0): all 3 name messages, add from the fold-out and from the card, per-serving
  values saved per 100 g (15 µg in 50 g → 30), too-heavy message, rename and delete + Undo while a food's edit box
  was open, no sideways scrolling, no errors.

**Known issues**
- Changing a nutrient's unit keeps the numbers as they are (it doesn't convert mg ↔ µg); a note says so.
- Renaming a nutrient shows the new name in Google Sheets only when a food using it is saved again, or after
  "Sync everything now".
- Food settings now hold an empty `customMicros` list from testing; harmless.
- These extra nutrients get targets and daily totals with FOOD-4.

## FOOD-2: Log food (24 Nov 2026)
**Built**
- 🍱 Food screen: two new cards at the top, above the library ("Add a food" and "My foods" moved below them).
- **Log food**: meal pills (🌅 Breakfast / 🍛 Lunch / 🌙 Dinner / 🍪 Snack, 2 × 2), picked by time of day to start
  (5–11 am breakfast, 11 am–4 pm lunch, 7–11 pm dinner, otherwise snack). Then pick a food: a search box (name or
  brand) and "Recent / Favourites / All" pills. Recent = the last 8 different foods logged. Lists show up to 20
  foods ("search to find more"). Friendly empty messages for each.
- After picking: the food with a "Change" button, "Servings / Grams" pills (Servings only if the food has a serving
  size; switching converts, 1.5 katori → 225 g), the amount, and a live line "1.5 katori · 225 g · 405 kcal".
  Date and time start at now. Friendly messages for an empty or zero amount, over 50 servings or 5,000 g, and a
  future day or time. "Logged Poha · 405 kcal 🍱" with Undo.
- **Food log**: one day at a time with ◀ ▶ (▶ stops at today; it opens on today and jumps to the day just logged),
  grouped by meal, earliest first: "Poha · 1.5 katori · 225 g · 8:30 am … 405 kcal". Tap a row to edit meal, amount,
  date and time in place (Cancel / Save); 🗑️ deletes with Undo.
- Saved data (food log drawer): `date`, `time`, `meal`, `foodId`, `quantity`, `quantityUnit` ('g' or 'serving') as in
  the spec, plus a copy of every nutrient for the amount eaten (blank stays blank, your own extra nutrients too),
  `foodName`, `servingName`, `servingGrams` and `grams`. Editing or deleting the food later doesn't change past days;
  editing an entry's amount scales its own copy. SPEC.md updated. Nothing existing changed. Copied to the "Food" tab
  in Google Sheets as "Food log" with readable columns.
- `core/styles.css`: a hidden group of boxes now really disappears (this also fixes the "＋ Add your own" nutrient
  box from FOOD-1, which could show when it should be hidden). No new files, so `sw.js` didn't need changing.
- Checked at 360px in light and dark mode with 2 pretend foods and 3 pretend entries (removed afterwards; the
  waiting Google Sync list is back to 0): all error messages, servings ↔ grams, nutrient copy checked by hand
  (225 g Poha = 405 kcal, iron 5.6 mg, selenium 22.5 µg), yesterday via ◀ ▶, edit (meal + amount → kcal doubled),
  delete + Undo, deleting a library food keeps its past entries, no sideways scrolling, all buttons and boxes ≥ 44px.

**Known issues**
- The edit row can't change which food was eaten (delete it and log the right one).
- Totals per meal and per day against targets come with FOOD-3; for now each row shows only its own kcal.
- "Today · 24 Nov 2026" above the log wraps onto two lines on a 360px phone.
- The usual test servers on this laptop weren't running, so testing used a temporary one on port 8771 (stopped).
  Two pretend foods may be left in the old test browser at localhost:8765 (test browser only, not your data).
- The phone gets this at the final "release".

## FOOD-3: Today's macros (24 Nov 2026)
**Built**
- 🍱 Food screen, new **Today's macros** card (between "Log food" and "Food log"): calories, protein, carbs, fat and
  fibre, each as "42.5 g of 60 g" with a soft peach bar, the % and "17.5 g to go", "Target reached 🎉" or
  "20 g over target" (gentle, no red). It follows the day shown in the food log: going back with ◀ changes the title
  to "Macros · 23 Nov 2026".
- Unknown values: if some foods logged have a value left blank, the total says "at least 8 g" with a short note
  explaining it; if none of them have it, it says "Unknown". Blank is never counted as zero.
- **Totals per meal**: each meal heading in the food log shows "405 kcal · 12.5 g protein" ("405+ kcal" if some
  foods have no value, "?" if none do).
- New **My daily targets** card (below the food log): 5 boxes, two per line. Suggested 2,000 kcal, 60 g protein,
  250 g carbs, 65 g fat, 30 g fibre until you save your own. Leave a box empty for no target. "2,500" is read as
  2500. Friendly messages: not a number, 0 or less, under 500 kcal, over 10,000 kcal or 1,000 g.
- Saved data: food settings get `targets` (settings are never sent to Google Sheets). Nothing existing changed.
  SPEC.md updated. No new files, so `sw.js` didn't need changing.
- Checked at 360px in light and dark mode with 2 pretend entries, one with fibre left blank (removed afterwards,
  with their waiting Google Sync changes; test targets removed too): totals checked by hand, "at least", over
  target, every error message, targets kept after reload, previous day, all boxes ≥ 44px, no sideways scrolling.

**Known issues**
- Targets will also appear in the Settings screen when CORE-8 is built.
- In the food log (and other food boxes) "12,5" still means 12.5; only the targets boxes read the comma as thousands.
- The usual test servers on this laptop belong to other chats, so testing used the old test browser at
  localhost:8765. It still has 2 pretend foods (Poha, Milk) waiting for Google Sync there (test browser only).
- The phone gets this at the final "release".

## FOOD-4: Today's vitamins & minerals (24 Nov 2026)
**Built**
- 🍱 Food screen, new **Today's vitamins & minerals** card under "Today's macros". It follows the day shown in the
  food log (◀ ▶ changes the title to "Vitamins & minerals · 23 Nov 2026").
- Covers the 11 built-in ones (sodium, potassium, calcium, iron, magnesium, zinc, vitamins A, B12, C, D, folate) and
  your own extra nutrients (e.g. Selenium).
- Ones with a target: like the macros, "at least 5.6 mg of 18 mg" with a soft peach bar, %, and "12.4 mg to go",
  "Target reached 🎉" or "5.5 mg over target". If no food logged that day has a value: "Unknown" (no bar).
- Ones without a target: under "No target set", just the total ("Calcium · 100 mg").
- Unknown values clearly marked: "at least …" when some foods have that value blank (with a short note), and one line
  "❔ Unknown (no info in the foods logged): Sodium, Vitamin D, …" for the rest. Blank is never counted as zero.
- A day with nothing logged and no targets shows a friendly empty message.
- **My daily targets** card: new fold-out "Vitamins & minerals (optional)" with a box for each one (your own too; a new
  nutrient gets a box straight away, keeping what's typed). Empty = no target. No suggested values are filled in.
  Friendly messages for not a number, 0 or less, and too big (over 1,00,000, or 1,000 for a nutrient in g); a mistake
  opens the fold-out.
- Saved data: micro targets go into the existing food settings `targets` (built-in ones by name, e.g. `ironMg`; your
  own by the nutrient's ID). Settings are never sent to Google Sheets. Nothing existing changed; no new files, so
  `sw.js` didn't need changing.
- Checked at 360px in light and dark mode with 2 pretend entries and a pretend Selenium nutrient (fresh test browser
  on port 8772, database deleted afterwards): totals checked by hand, "at least", over target, Unknown target row,
  error message opens the fold-out, previous day with targets, new nutrient gets a box, boxes 44px, no sideways scrolling.

**Known issues**
- Changing a nutrient's unit (mg ↔ µg) keeps its target number as it is, like the food values.
- Deleting your own nutrient keeps its target in settings (unused), so Undo brings it back with its target.
- All 5 test-server slots belonged to other chats, so testing used a temporary server on port 8772 (stopped).
- The phone gets this at the final "release".

## FOOD-5: Recipes (24 Nov 2026)
**Built**
- 🍱 Food screen: new **My recipes** card (peach) under "My foods". Make a recipe: name, "Makes how many servings"
  (whole number 1–100), then add ingredients by picking a food from your library and typing its grams (the food's
  serving size shows as a hint, e.g. "1 katori = 150 g"). Adding the same food again changes its grams; 🗑️ removes
  an ingredient. A live line shows "Total 600 g · 738 kcal · 1 serving = 150 g · 185 kcal · 8.8 g protein".
- Friendly messages: missing name, over 60 letters, a recipe with that name already (any capitals), servings not a
  whole number 1–100, no ingredients, no food picked, grams empty / 0 / over 5,000, more than 50 ingredients.
- **Saved recipes** list (A–Z): "🍲 Dal chawal · 5 servings · 610 g · 166 kcal · 7 g protein each · 3 ingredients".
  Tap a recipe (or ✏️) to edit everything in place (Cancel / Save); 🗑️ deletes with Undo.
- A recipe's nutrients are worked out from your library foods, so changing a food updates the recipe. If a food in it
  is deleted, the recipe shows "⚠️ 1 missing food" and that ingredient shows "❓ Missing food (deleted)".
- **Log food**: the "Show" pills are now Recent / Favourites / 🍲 Recipes / All foods (2 × 2). Searching finds recipes
  too, and Recent includes recipes you logged. A recipe is logged by servings or grams like a food
  ("2 servings · 244 g · 331 kcal"), shows as "🍲 Dal chawal" in the food log, and counts in today's macros and
  vitamins & minerals.
- Saved data: recipes use the existing recipes drawer with `name`, `servings` and `ingredients` (a list of
  `{ foodId, grams }`), as in the spec (SPEC.md notes the name `ingredients`). A logged recipe saves `recipeId` instead
  of `foodId`, plus its own copy of the nutrients, so editing or deleting the recipe later doesn't change past days.
  Nothing existing changed. Google Sheets "Food" tab gets them as "Recipe" (already set up by SHEETS-SYNC).
  No new files, so `sw.js` didn't need changing.
- Checked at 360px in light and dark mode with 3 pretend foods and 2 pretend recipes (temporary test server on port
  8773, test database deleted afterwards): every error message, totals checked by hand (738 kcal ÷ 4 = 185),
  edit servings, recipe follows a food change, log 2 servings (servings ↔ grams converts), Recent and search show it,
  macros update, recipe delete + Undo (past log entry kept), deleted food → missing warning, no sideways scrolling,
  all buttons and boxes ≥ 44px, no new errors.

**Known issues**
- A nutrient counts as unknown for the whole recipe if any ingredient has it blank (e.g. one food without iron makes
  the recipe's iron "Unknown"), so blanks are never treated as zero.
- Ingredients are typed in grams only (the serving size is shown as a hint).
- Changing a recipe while it's picked in "Log food" needs "Change" and picking it again to use the new values.
- The phone gets this at the final "release".

## FOOD-6: Food history (24 Nov 2026)
**Built**
- 🍱 Food screen: new **History** card (peach) under the Food log, with "Days to show" pill buttons **7 days** and
  **30 days** (opens on 7; the chosen one lights up).
- **Calories per day** bar chart with a dashed "Target" line at your daily calorie target, and a **Protein per day**
  bar chart with its own target line. Days with nothing logged (or only unknown values) show as a gap, not zero.
  With no target saved, there's no line.
- Under the charts: "📊 Daily average: 1,970 kcal · 63 g protein (over 6 logged days)". Only days with food logged
  count, so empty days don't pull the average down; unknown (blank) values are left out, never counted as zero.
  With nothing logged: "Log food to see your daily averages for the last 7 days ✨".
- Charts and averages update straight away after logging, editing, deleting, Undo, or saving new targets
  (the target line moves). Everything is worked out on screen; saved data is unchanged. No new files, so `sw.js`
  didn't need changing.
- Checked at 360px in light and dark mode with 20 pretend entries over 20 days (removed afterwards; Google Sync isn't
  set up in the test browser, so nothing was sent): averages checked by hand for 7 and 30 days (9,850 ÷ 5 = 1,970),
  delete and Undo, target change 2,000 → 2,500 kcal, empty message, no sideways scrolling, no new errors.

**Known issues**
- "Logged days" counts every day with food logged; if a day's foods all have blank calories, that day is left out of
  the calorie average but still counted in the number of days shown.
- The 30-day view shows a date label about every 8 days to fit the phone; tap a bar to see its full date.
- The phone gets this at the final "release".

## Plan change (24 Nov 2026): Blood tests → 🩺 Medical log
**Changed**
- SPEC.md: the Blood tests section (markers, reference ranges, trend charts) is replaced by **Medical log**:
  a record of every medical visit for me and my family (date, person, type, doctor / clinic / lab, cost,
  attachments, note), a Log screen with filters and search, and an Insights tab (spend, visit counts,
  last visits, rule-based insight cards). New units MED-1…6 take the place of BLD-1…5 in the build order.
  Google Sheets tab and Excel export now say "Medical log".
- App: the module is now 🩺 Medical log everywhere (home tile, More panel, title bar), folder `medical/`,
  screen `#/medical`, same rose colour. It still shows "Coming soon" (the module itself isn't built yet).
- Saved data: database version 3 (safe upgrade) adds a `visits` drawer and removes the never-used
  `markers` and `reports` drawers. Nothing else is touched; checked on a fresh start and on an upgrade
  from version 2 (existing entries kept).
- Google Apps Script (`Code.gs`): the 8th tab is now "Medical log". Offline cache version 9.
- CLAUDE.md: module list, colour and folder name updated.

**Known issues**
- The updated `Code.gs` must be pasted into Google again before Medical log can sync (do it at release).
  The 2026 Sheet keeps its old, empty "Blood tests" tab; it can be deleted by hand. "Medical log" is
  created automatically on the first visit saved.
- The phone gets this at the final "release".

## MED-1: People and visit types (24 Nov 2026)
**Built**
- 🩺 Medical log screen now has a **People & visit types** card (rose accent) with two lists.
- People start with "Me"; visit types start with Blood test, Dentist, Paediatrician, General physician,
  General check-up and Other. The starter lists are saved once, the first time the screen opens,
  so removed ones never come back by themselves.
- Add, rename (tap the row or ✏️) and remove (🗑️, with Undo). Each row shows how many visits use it.
- Checks: no blank names, no duplicates (ignoring capitals), 30 letters at most.
- A person or type that still has visits can't be removed (a friendly message says why), and the last
  person / last type can't be removed either (a visit always needs one).
- Saved data: the lists live in the Medical log settings as `people` and `types` (each `{ id, name }`).
  Visits will keep only the id, so renaming updates every visit. Nothing else changed; no new files.

**Known issues**
- Settings aren't copied to Google Sheets; the Sheet will show names when visits are added (MED-2).
- Removing uses Undo instead of an "Are you sure?" question, the same as the rest of the app.

## MED-2: Add, edit and delete a visit (24 Nov 2026)
**Built**
- 🩺 Medical log screen now starts with an **Add a visit** card: date (today), who ("Me" first),
  visit type, doctor / clinic / lab, cost in ₹ and a note. Only date, who and type are needed.
- Doctor / clinic / lab suggests names you've used before while you type (newest first, no repeats).
- Checks: no future dates, cost like 500 or 99.50 (or blank), place 80 letters at most.
- A simple **Visits** list (newest first) shows type · person, date, place, note and cost.
  Tap a visit to edit it (with a Delete button there too); 🗑️ deletes with Undo.
- Renaming a person or type (MED-1 card) instantly updates the form and every visit in the list;
  the visit counts in the People & visit types card update after each save or delete.
- Google Sheets: the "Medical log" tab gets one row per visit with columns Date, Person, Type,
  Doctor / clinic / lab, Cost (₹), Note, showing names instead of codes.
- Saved data: visits go into the existing `visits` drawer as `{ date, personId, typeId, place,
  costPaise, note }`. No change to existing data and no new files.

**Known issues**
- After renaming a person or type, rows already in the Google Sheet keep the old name until that
  visit is changed again (or "🔄 Sync everything now" in Settings is tapped).
- Filters, search and the big "+ Add visit" button come in MED-4; attachments in MED-3.

## MED-3: Photos & PDFs on a visit (24 Nov 2026)
**Built**
- The visit form (add and edit) has a **Photos & PDFs** part with "📎 Add photo or PDF" (you can pick
  several at once, up to 10 per visit). Photos are made smaller on the phone (longest side 1600 px,
  JPG): a 4.9 MB test photo became 27 KB. PDFs are kept as they are, 15 MB at most. Other files get
  a friendly "only photos and PDFs" message.
- Each file shows a small preview (📄 for PDFs), its size and where it is: ⏳ Uploads when synced,
  ☁️ In Google Drive, or ⚠️ Google couldn't take this file. 🗑️ removes it from the visit (with Undo).
- Tap a file to open it: photos show inside the app, with "Open full size"; PDFs get "Open PDF";
  uploaded files also get "Open in Google Drive". The visit list shows 📎 and the number of files.
- Google: when connected and online, each new file is uploaded once to Drive "LifeTracker/Reports"
  (before the Sheet rows are sent). Its link is saved on the visit, and the "Medical log" tab gets an
  **Attachments** column with only the Drive links (never the files). Offline, it waits and retries.
  If Google refuses one file, that file is marked ⚠️ and everything else keeps syncing.
  The sync icon counts files waiting to upload as well.
- Saved data: database version 4 (safe upgrade) adds a **files** drawer for the photos/PDFs.
  Visits get a short list `attachments` (name, type, size, Drive link). Nothing else changed; tested
  on a fresh start and on an upgrade from version 3 (old visits and other entries kept).
- Files no visit uses any more (removed from a visit, or from a deleted visit) are cleared from the
  phone 10 minutes later, the next time Medical log opens, so Undo still works meanwhile.
- No new files, so `sw.js` didn't change. The Apps Script (`Code.gs`) already had the upload part.

**Known issues**
- Uploading was tested with a pretend Google; the real upload gets tested at release (after pasting
  the updated `Code.gs`).
- Removing a file or deleting a visit doesn't delete its copy in Google Drive (delete it there by hand).
- On an Android phone, "Open PDF" may save the PDF to Downloads instead of showing it;
  "Open in Google Drive" works once it's uploaded.
- Some phone photo formats (e.g. HEIC) may not open in the browser; then a message asks for JPG/PNG.
- The ⏳ / ☁️ labels in an open form update the next time the screen is opened.
- CORE-7 (Backup) must decide how to include these files (they can make the backup big).
