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
