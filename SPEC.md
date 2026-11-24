# Lifetracker: Specification

A personal, offline-first tracker (PWA) for one user. All data stays on the device.
Build one unit at a time, in the order below unless I say otherwise.

## Common rules for all data
- Every record has: `id` (random UUID), `createdAt`, `updatedAt` (ISO timestamps).
- Dates are 'YYYY-MM-DD' and times are 'HH:MM' (24h), in Asia/Kolkata time.
- Money is stored as integer paise (₹1 = 100) and shown as ₹ with Indian digit grouping.
- Every entry can be edited and deleted. Deleting asks "Are you sure?" or offers Undo.
- Values that can be calculated (totals, durations, averages) are worked out on screen, not stored.

---

## CORE: shared foundation
| Code | Unit |
|---|---|
| CORE-1 | Styles and UI kit: CSS variables, cards, buttons, inputs, lists, empty states, light/dark mode |
| CORE-2 | Storage helper (`core/storage.js`): one IndexedDB database, a store per module, add/get/update/delete/list-by-date, versioning and migrations |
| CORE-3 | App shell: home screen, bottom navigation, simple router, per-module screens load in place |
| CORE-4 | Dates and formatting helpers: Kolkata dates, ₹ formatting, metric unit formatting |
| CORE-5 | PWA offline: manifest, icons, service worker, "Install app" prompt, works with no internet |
| CORE-6 | Charts: local Chart.js plus one wrapper for bar/line charts in the house style |
| CORE-7 | Backup: export all data to one JSON file, import it back (with a preview and confirmation); "Export to Excel" button (one sheet per module, including a "Medical log" sheet with every visit field) as an extra manual backup. The Google Sync link and key are never included. |
| CORE-8 | Settings screen: per-module goals and preferences in one place, plus "Customise menu" (see below). Keeps the Google Sync section added by SHEETS-SYNC. |
| CORE-9 | Notifications helper (`core/notify.js`): permission request, show a notification, in-app banner fallback |
| HOME-1 | Today dashboard: one card per module summarising today (water, sleep, food, spend, tasks due) |

**CORE-8 "Customise menu" (part of the Settings screen):**
- Home is always first and More is always last on the bottom bar.
- I choose which 4 modules appear in the bottom bar and reorder them with up/down arrows.
- Modules I don't pick go into the More panel.
- The same up/down arrows also set the order of the module cards on the home screen.
- My choice is saved in storage, so it stays after closing the app.
- A "Reset to default" button brings back the original menu (Water, Food, Money, Tasks) and card order.

---

## SHEETS-SYNC: automatic copy of every entry to my Google Sheets
Goal: every add, edit and delete is copied to a Google Sheet in my own Google account, so I never
have to think about backups. Reliability and security come before features. Keep it simple.

**How it works**
- Built into `core/storage.js` (CORE-2), so every module, now and future, syncs with no extra work.
  After an entry is safely saved on the phone, a note "send this" goes into a waiting list (outbox)
  that is also stored on the phone. The outbox keeps only the latest version of each entry.
- The outbox is sent to a Google Apps Script web app that runs in my Google account
  (no Google Cloud project, no "Sign in with Google" button). Works from the installed phone app.
- The phone always saves first. If I'm offline or sync fails, the app works normally and the outbox
  is sent automatically when the app is open and back online (on app open, on reconnect, after each change).
- Every record has `id`, `createdAt`, `updatedAt` (already true since CORE-2). The Sheet uses the ID:
  an edit updates the same row, a delete removes it, and sending twice never makes duplicates.
- Settings rows are never synced (they hold the secret key).

**Sheets and Drive**
- One Google Sheet file per year ("LifeTracker 2026"), created automatically, inside a "LifeTracker"
  folder in my Drive. An entry goes into the year of its date; library items with no date
  (foods, categories, books) go into the year they were created. If an edit moves an entry
  to another year, it is removed from the old year's file.
- Exactly 8 tabs, one per module: Water, Sleep, Weight, Food, Expenses, Tasks, Reading, Medical log.
  (Later: "Gym log" added in GYM-1 and "Refills" in REF-1, making 10.)
  Modules that save more than one kind of thing share their tab, with a "Type" column first:
  Food (Food log / Food library / Recipe), Expenses (Expense / Category),
  Reading (Book / Check-in / Weekly reflection). Medical log holds only visits, one row each.
  Anything a future unit stores that doesn't fit these goes into an "Other" tab.
- Readable column names (e.g. "Amount (ml)", "Amount (₹)"), dates as DD-MM-YYYY, times as HH:MM,
  money in rupees, lists (e.g. recipe ingredients) as readable text, links to other entries shown by
  name (e.g. the book or person name, not its ID). ID, Created and Updated columns last.
  Future modules get sensible column names automatically.
- Medical log attachments (photos/PDFs of reports, prescriptions, bills): photos are shrunk on the
  phone before upload; PDFs are sent as they are (up to a size limit). Files are saved in
  "LifeTracker/Reports" in Drive; the Sheet stores only the links.
  The Apps Script supports this now; the app side is built with the Medical log units (MED-3).

**Status icon (title bar)**
- ✅ synced / ⏳ X waiting / ⚠️ problem. Tapping it explains in plain words what's wrong
  (no internet, wrong key, link not working, Google error) with a "Try again" button.

**Settings → Google Sync** (a minimal Settings screen now; CORE-8 adds the rest later)
- Paste the Apps Script link and secret key; "Connect" tests them.
- Shows "Connected: name@gmail.com ✅".
- "Change account": step-by-step guide to set up the script in another Google account, paste its
  link and key, then upload all existing data to that account's Sheets.
- "Sync everything now": re-uploads all data. Safe anytime; never makes duplicates.
- Reminder to keep the Sheets and folder private (never "Anyone with the link").

**Security (the GitHub repo is public)**
- The Apps Script link and secret key are never in the code or on GitHub. I paste them into
  Settings and they're stored only on my phone. They are left out of backups/exports (CORE-7).
- The secret key is stored in the script's own private settings (Script Properties), not in its code,
  so the script code itself can safely live in the repo.
- Every request must carry the correct key or it is rejected. Anything that doesn't look like a
  valid entry (unknown tab, bad ID, wrong shapes, too big) is rejected. Text that could act as a
  spreadsheet formula is stored as plain text.
- Write-only: the script only accepts entries. It never sends my data back; its replies contain only
  "ok"/error, counts and the connected email. A leaked link reveals nothing.
- Narrowest Google permission: only files and folders the script itself creates (`drive.file`),
  plus seeing my own email address. Not my whole Drive.
- Release rule (CLAUDE.md): before every release, scan all files for links, keys, emails or
  secrets and stop if one is found.

| Code | Unit |
|---|---|
| SHEETS-SYNC | Outbox in storage, sync engine, status icon, Settings → Google Sync, Apps Script code, setup guide |

---

## WATER: water intake
**Entry:** `date`, `time`, `amountMl` (number).
**Settings:** `dailyGoalMl` (default 2500), `quickAmounts` (default 250, 500, 750 ml).

| Code | Unit |
|---|---|
| WTR-1 | Log water: quick-add buttons and a custom amount; today's list; delete/undo |
| WTR-2 | Today's progress toward the goal (progress bar or ring, ml and %) |
| WTR-3 | History: bar chart of the last 7 and 30 days with a goal line; streak of goal days |

---

## SLEEP: bed and wake time only
**Entry:** `date` (the morning you woke up), `bedTime` ('YYYY-MM-DD HH:MM'), `wakeTime` ('YYYY-MM-DD HH:MM').
Duration is calculated and must handle sleep past midnight correctly. One entry per night.
**Settings:** `targetHours` (default 8).

| Code | Unit |
|---|---|
| SLP-1 | Log a night: bed time and wake time (defaults to last night), edit/delete |
| SLP-2 | History: duration chart for 14/30 days, average duration, average bed and wake time |

---

## WEIGHT: daily weight
**Entry:** `date`, `weightKg` (1 decimal place). One per day; logging again replaces that day's value.
**Settings:** `heightCm` (optional, for BMI), `goalKg` (optional).

| Code | Unit |
|---|---|
| WGT-1 | Log today's weight; list of entries; edit/delete |
| WGT-2 | Chart: daily weight plus 7-day average line, 30/90/365-day views, change since start |
| WGT-3 | BMI (if height is set) and progress toward the goal |

---

## FOOD: macros and micros, library first
Foods are saved once in a personal library, then logged by picking from it.

**Food (library item):**
- `name`, `brand` (optional), `favourite` (yes/no)
- `servingName` (e.g. "1 katori", "1 roti") and `servingGrams`
- Nutrients per 100 g:
  - Macros: `kcal`, `proteinG`, `carbsG`, `fatG`, `fibreG`, `sugarG`, `satFatG`
  - Micros: `sodiumMg`, `potassiumMg`, `calciumMg`, `ironMg`, `magnesiumMg`, `zincMg`,
    `vitAUg`, `vitB12Ug`, `vitCMg`, `vitDUg`, `folateUg`
- Any nutrient can be left blank (blank means unknown, not zero).
- The user can enter values "per serving" instead; the app converts them to per 100 g.
  `enteredPer` ('100g' / 'serving', added in FOOD-1) only remembers which way they were typed,
  so editing shows them the same way.
- Your own extra nutrients (added 24 Nov 2026): a shared list in food settings, `customMicros`
  (`id`, `name`, `unit` mg / µg / g). Each food keeps their values per 100 g in `extraNutrients`
  ({ nutrient id: number }); blank ones are left out. Deleting a nutrient removes its values from every food.

**Recipe (optional, FOOD-5):** `name`, a list of `{ foodId, grams }`, `servings`. Nutrients are calculated.
Built in FOOD-5: the list is saved as `ingredients`. A nutrient is known only if every ingredient has it.
Logging a recipe saves `recipeId` (instead of `foodId`) and the same copy of nutrients as a food.

**Log entry:** `date`, `time`, `meal` (breakfast / lunch / dinner / snack), `foodId` or `recipeId`,
`quantity`, `quantityUnit` ('g' or 'serving'), plus a saved copy of the calculated nutrients
so that editing the library later doesn't change past days.
Added in FOOD-2: the copy is the same nutrient fields as a food (for the amount eaten, blank = unknown)
plus `extraNutrients`, and the entry also keeps `foodName`, `servingName`, `servingGrams` and `grams`
(total grams eaten), so it still shows correctly if the food is later changed or deleted.

**Settings:** daily targets for kcal, protein, carbs, fat, fibre and any micros the user chooses.
Added in FOOD-3: `targets` ({ kcal, proteinG, carbsG, fatG, fibreG }; null = no target), suggested
2,000 kcal, 60 g protein, 250 g carbs, 65 g fat, 30 g fibre until the user saves their own.
Added in FOOD-4: the same `targets` also hold optional micro targets, built-in ones by key (e.g. `ironMg`)
and your own extra nutrients by their id. No suggested values; empty = no target.

| Code | Unit |
|---|---|
| FOOD-1 | Food library: add, edit, delete, search, favourites, per-serving to per-100 g conversion |
| FOOD-2 | Log food: pick from the library (search, favourites, recent), choose meal and quantity |
| FOOD-3 | Today's macros: totals per meal and per day versus targets |
| FOOD-4 | Today's micros: totals versus targets, with unknown values clearly marked |
| FOOD-5 | Recipes: combine library foods into one item you can log |
| FOOD-6 | History: kcal and protein charts for 7/30 days, daily averages |

---

## MONEY: expenses
**Expense:** `date`, `amountPaise`, `category`, `paymentMethod` (UPI / cash / card / other), `note` (optional).
**Category:** `name`, `icon` (emoji), `monthlyBudgetPaise` (optional).
Default categories: Food, Groceries, Transport, Bills, Shopping, Health, Entertainment, Other.

| Code | Unit |
|---|---|
| MON-1 | Add expense (quick form, amount first); list grouped by day; edit/delete |
| MON-2 | Categories: add/edit/delete, choose an icon |
| MON-3 | Monthly summary: total, per-category totals, compare to last month |
| MON-4 | Charts: spend by category (month) and spend by day/month over time |
| MON-5 | Budgets: monthly budget per category with "spent / left" bars |
| MON-6 | Export expenses for a chosen month to an Excel file (.xlsx): a colourful Summary tab you understand in seconds, plus all expenses |

---

## TASKS: to-do with reminders
**Task:** `title`, `notes` (optional), `dueDate` (optional), `dueTime` (optional),
`reminderAt` (optional 'YYYY-MM-DD HH:MM'), `repeat` (none / daily / weekly / monthly),
`priority` (low / normal / high), `done` (yes/no), `doneAt`.
Completing a repeating task creates the next one automatically.

Note on reminders: a web app without an internet server cannot promise alerts when it is fully closed.
So reminders show as a phone notification when the app is open or recently used, overdue reminders
appear as a banner whenever the app opens, and any task can be saved to the phone calendar (.ics file)
for a guaranteed alert.

| Code | Unit |
|---|---|
| TSK-1 | Add, edit, complete, delete tasks; lists for Today, Upcoming, No date, Done |
| TSK-2 | Due dates, priority and repeating tasks |
| TSK-3 | Reminders: notification when due, overdue banner on app open |
| TSK-4 | "Add to calendar" button that downloads an .ics file for the task |

---

## READING: check-in every 3rd day and weekly reflection
**Book:** `title`, `author`, `totalPages`, `format` (paper / ebook / audio), `status`
(reading / wishlist / paused / finished / dropped), `startDate`, `finishDate` (optional), `rating` (1 to 5, optional).
A wishlist book has no `startDate`, and its `totalPages` is optional.
Optional people details (added 24 Nov 2026, so I remember to give credit and get books back):
`suggestedBy` (name), `lendType` ('' / lent / gifted / borrowed / gift), `lendPerson`, `lendDate`,
`lendBackDate` (only for lent and borrowed). Shown in a "Lent, gifted & suggested" card.

**Check-in (every 3rd day):** `date`, `bookId`, `currentPage`, `minutesRead` (optional), `note` (optional).
The app shows "Check-in due" when 3 or more days have passed since the last check-in.

**Weekly reflection (weeks run Monday to Sunday, prompted on Sunday):** `weekStart` (Monday's date),
`bookIds`, `keyIdea`, `howIUsedIt`, `weekRating` (1 to 5), `nextWeekGoal`.

| Code | Unit |
|---|---|
| RDG-1 | Books: add, edit, change status, list of current and finished books |
| RDG-2 | Check-ins: log page progress, "due" reminder after 3 days, progress % per book |
| RDG-3 | Weekly reflection: Sunday prompt, form, list of past reflections |
| RDG-4 | Stats: pages per week chart, books finished this year, check-in streak |

---

## MEDICAL: Medical log 🩺 (visits for me and my family)
A simple record of every medical visit for me and my family, plus easy insights on how often
we visit and how much we spend. (Replaced the planned "Blood tests" module on 24 Nov 2026.)
Folder `medical/`, screen `#/medical`, rose accent (`mod-medical`).

**Visit (drawer `visits`):**
- `date` (required)
- `personId` (required): who the visit was for. Default "Me".
- `typeId` (required): the kind of visit.
- `place` (optional): doctor / clinic / lab name. Names used before are suggested while typing.
- `costPaise` (optional)
- `attachments` (optional): one or more PDFs or photos (reports, prescriptions, bills). Photos are
  shrunk before saving. They sync to the "LifeTracker/Reports" Drive folder; the Sheet stores only the links.
- `note` (optional, free text): reason for the visit, symptoms, what the doctor said, medicines, anything.

**Settings:**
- `people`: a list of `{ id, name }`, starting with "Me". I can add family members (e.g. Mom, Son),
  rename or remove them. Renaming updates every visit (visits keep the id, not the name).
- `types`: a list of `{ id, name }`, starting with Blood test, Dentist, Paediatrician, General physician,
  General check-up, Other. I can add my own (e.g. Eye check-up, Physiotherapy), rename or remove them.
- A person or type that still has visits can't be removed (a friendly message says why).

**Log screen (tab "Log"):**
- All visits, newest first, each showing date, person, type, place and cost.
- Tap a visit to view, edit or delete it (Undo) and open its attachments.
- Filters: person, type, year. A search box searches place names and notes.
- A big "+ Add visit" button.

**Insights screen (tab "Insights"):** light and simple: numbers, small bars and short sentences, no complex charts.
- Year selector (defaults to the current year).
- Total medical spend for the year, with last year's total beside it.
- Spend by person and spend by type: sorted lists with a small horizontal bar next to each amount.
- Visit count table: rows = type, columns = person, cells = visits that year
  (e.g. "General physician — Me: 8, Son: 3").
- Average cost per visit for each type (only visits with a cost count).
- Last visit per person per type (e.g. "Dentist — Me — last visit 14 months ago").
- Insight cards from simple rules (no AI), for example:
  "You visited a general physician 8 times this year, 3 more than last year.",
  "Son's paediatrician visits went down from 6 to 2.", "Medical spend is up 40% compared to last year.",
  "It's been over 12 months since your last dentist visit.", "Most visits happened in July–August."
  Show only the 3–5 most useful, and only with enough data (at least 2 visits of a type).

**Sync and export:** Google Sheet tab "Medical log", one row per visit, with a column for every field
(Date, Person, Type, Doctor / clinic / lab, Cost (₹), Attachments as links, Note), names shown instead of IDs.
The Excel export (CORE-7) includes a "Medical log" sheet.

| Code | Unit |
|---|---|
| MED-1 | People and visit types: add, rename, remove (defaults "Me" and the 6 types above) |
| MED-2 | Add / edit / delete a visit (with Undo): date, person, type, place with suggestions, cost, note |
| MED-3 | Attachments: add PDFs/photos (photos shrunk), open them, upload to Drive "LifeTracker/Reports" with only the links in the Sheet |
| MED-4 | Log screen: all visits newest first, filters by person / type / year, search, big "+ Add visit" button |
| MED-5 | Insights: year selector, total spend vs last year, spend by person and by type with small bars, visit count table, average cost per type, last visit per person per type |
| MED-6 | Insight cards: 3–5 plain-language rule-based insights, shown only when there's enough data |

---

## GYM: Gym log 🏋️ (added 25 Nov 2026)
Log workouts, see what I did last time, celebrate personal records.
Folder `gym/`, screen `#/gym`, its own pastel accent (`mod-gym`, a soft coral), emoji 🏋️.

**Session (drawer `gymSessions`):** `date`, `typeId`, `durationMin` (optional), `note` (optional).
**Exercise in a session (drawer `gymSets`, one record per exercise done):** `sessionId`, `exerciseId`, `order`, and
- strength: `sets`, `reps`, `weightKg` (1 decimal place; blank = bodyweight)
- cardio: `durationMin`, `distanceKm` (optional, 2 decimal places)
**Exercise library (drawer `gymExercises`):** `name`, `kind` ('strength' / 'cardio'). Names are suggested while
typing so the same exercise is always called the same thing (needed for "last time" and records).
**Routine (drawer `gymRoutines`):** `name`, `typeId`, `items` (a list of `{ exerciseId, sets, reps, weightKg,
durationMin, distanceKm }`).
**Settings:** `types` (`{ id, name }` list, starting with Strength, Cardio, Yoga, Sports, Other; I can add,
rename, remove my own; a type still in use can't be removed), `weeklyGoal` (workouts per week, default 3).

**Rules**
- "Last time": while adding an exercise, show the most recent earlier time I did it
  (e.g. "Last time, 21 Nov: 3 × 10 @ 40 kg" or "Last time, 19 Nov: 25 min, 4.2 km").
- Personal record 🏆: strength = heaviest weight ever for that exercise; cardio = longest distance.
  Beating it shows a cheerful "New record!" badge on save, and the badge stays on that entry in the list.
- Weeks run Monday to Sunday. Gym streak = weeks in a row that reached the weekly goal
  (the current week counts once it's reached).
- Everything calculated (records, streaks, counts) is worked out on screen, not stored.

**Sync and export:** Google Sheet tab "Gym log" with a "Type" column first (Session / Exercise / Exercise library /
Routine) and a column for every field (Date, Type of workout, Duration (min), Note, Session (date + type),
Exercise, Kind, Sets, Reps, Weight (kg), Distance (km), Routine name, Routine items as readable text), names
instead of IDs. Same add / edit / delete / offline outbox / no duplicates as every other module (built into storage).
The Apps Script gets "Gym log" added to its tab list; existing yearly files get the tab added automatically the
first time a Gym row arrives, nothing else in them changes. (After this unit I must paste the new Code.gs into
Google once.) The Excel export (CORE-7) gets a "Gym log" sheet automatically.
The Sheet has no Summary tab, so no Sheet summaries are added.

| Code | Unit |
|---|---|
| GYM-1 | Gym screen, accent and 🏋️ in the Customise menu / More and Home tiles; workout types (defaults + my own); add / edit / delete a session (Undo); sessions list newest first; "Gym log" Sheet tab and Excel sheet |
| GYM-2 | Exercises inside a session: exercise library with name suggestions, strength (sets, reps, kg) or cardio (min, km), add / edit / delete / reorder |
| GYM-3 | "Last time" hint while adding an exercise |
| GYM-4 | Personal record 🏆 badge when I beat my best (on save and in the list) |
| GYM-5 | Routines: save a session as a routine, edit / delete routines, start a new session from one in one tap |
| GYM-6 | Insights: workouts per week chart (last 12 weeks), gym streak with weekly goal (goal in Settings), most-trained exercises list |
| GYM-7 | Home "Today" card: worked out today or not, workouts this week vs goal, streak |

---

## REFILLS: Refills 🔄 (added 25 Nov 2026)
Regular things I buy again and again (gas cylinder, rice, milk, water can, internet plan) and what they
cost me per day. Folder `refills/`, screen `#/refills`, its own pastel accent (`mod-refills`, a soft teal), emoji 🔄.

**Item (drawer `refillItems`):** `name`, `unit` (can / kg / litre / pack / month, or my own typed unit),
`categoryId` (a Money category), `remind` (yes/no), `remindDaysBefore` (default 1).
**Refill (drawer `refills`):** `itemId`, `date`, `quantity` (number, decimals allowed),
`pricePerUnitPaise`, `vendor` (optional; names used before are suggested), `note` (optional),
`paymentMethod` (UPI / cash / card / other, same as Money, because the matching expense needs it),
`expenseId` (the linked Money expense), `taskId` (the linked reminder task, if any).
Total = quantity × price per unit, rounded to whole paise; worked out on screen, not stored.

**Worked out per item (needs at least 2 refills, otherwise "Not enough data yet")**
- Average days a refill lasts: average gap between refill dates (last 6 refills).
- Cost per day: money spent on those refills (all but the newest) ÷ days between the first and the newest.
- Price change: price per unit now vs the first and the previous refill (₹ and %), with a small line chart.
- Expected next refill: last refill date + average days ("in 4 days" / "2 days late").
- Optional reminder: a task in Tasks ("🔄 Refill Gas cylinder", due on the expected date minus `remindDaysBefore`).
  Logging the next refill marks it done and makes the next one; switching the reminder off deletes it.

**"Daily cost of living" card:** total cost per day of all items that have enough data, and per month (× 30),
with a short list of each item's share.

**Link to Money (no double counting, no duplicates)**
- Saving a refill also saves one expense in Money: date, total, the item's category, payment method,
  note "🔄 Refill: <item> (<quantity> <unit>)", and new optional fields `source: 'refill'` and `refillId`.
  Old expenses don't change and need no migration.
- Editing the refill updates that same expense; deleting it removes it (Undo brings both back).
- In Money, a refill expense shows a 🔄 Refill tag. Opening it says "This comes from Refills" with a button to
  edit it there, so the two can never disagree.
- On opening Refills, a quick check repairs any refill whose expense is missing and removes any extra copy.
- Money totals count each refill once (as its expense). The refill baseline below is only a guide line,
  never added on top.

**Money daily spend view (new Money screen):** a bar chart of actual spend per day (last 30 days, from expenses)
with a flat "regular refills per day" line from the Daily cost of living, plus the average daily spend.
Because Money can't import from Refills, the cost-per-day maths lives in one small shared helper in `core/`.

**Sync and export:** Google Sheet tab "Refills" with a "Type" column first (Item / Refill) and a column for every
field (Item, Unit, Money category, Reminder, Days before, Date, Quantity, Price per unit (₹), Total (₹), Vendor,
Payment method, Note), names instead of IDs; the matching expenses still go to the Expenses tab as usual.
Same sync rules, Apps Script tab list, automatic new tab in existing yearly files and Excel sheet as Gym.
The Sheet has no Summary tab, so no Sheet summaries are added.

| Code | Unit |
|---|---|
| REF-1 | Refills screen, accent and 🔄 in the Customise menu / More and Home tiles; items: add / edit / delete (name, unit incl. my own, Money category); "Refills" Sheet tab and Excel sheet |
| REF-2 | Log a refill: date, quantity, price per unit, live total, vendor with suggestions, payment method, note; refills list per item; edit / delete (Undo) |
| REF-3 | Money link: each refill creates / updates / removes its matching expense tagged 🔄 Refill; refill expenses in Money open in Refills; repair check for missing or duplicate links |
| REF-4 | Per-item numbers: average days a refill lasts, cost per day, price change with a small chart, expected next refill date |
| REF-5 | Optional next-refill reminder per item, kept as a task in Tasks |
| REF-6 | "Daily cost of living" card (per day and per month) and a Home "Today" card (next refill due, daily cost) |
| REF-7 | Money daily spend view: actual spend per day chart with the "regular refills per day" line, from a shared helper in `core/` |

---

## Suggested build order
CORE-1 → CORE-2 → CORE-3 → CORE-4 → CORE-5 → WTR-1 → SHEETS-SYNC → WTR-2 → CORE-6 → WTR-3 → WGT-1…3 →
SLP-1…2 → MON-1…6 → TSK-1…2 → CORE-9 → TSK-3…4 → RDG-1…4 → FOOD-1…6 → MED-1…6 →
CORE-7 → CORE-8 → HOME-1 → HOME-SUMMARY → GYM-1…7 → REF-1…7

---

## HOME-SUMMARY: richer home screen (build after all modules)
Replaces the "Your daily summary will appear here ✨" placeholder card and adds to the home screen.
Everything is worked out from saved data on screen; nothing new is stored.

| Code | Unit |
|---|---|
| HOME-SUMMARY | Streak chip; today's progress rings (water, calories, sleep); mini 7-day chart; rule-based encouraging message from my own data; live stats on each module card; reading check-in banner; floating quick-add "+" button |
