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
