# Smart Roster Management System

Plan, generate, check and fix monthly rosters across brands, processes and pods.
Core idea: a **process** has an operating calendar (when coverage is needed). An **employee** has a work schedule (when they work). The engine compares the two and reports every gap.

## Run it
```
npm run install:all
npm test                      # 11 tests for the engine and API
cd client && npm run build && cd ..
npm start                     # http://localhost:4000  (sample data loads automatically)
```
Live reload while developing: run `npm start` (API) and `cd client && npm run dev` (UI on :5173).
Optional MongoDB: copy `.env.example`, set `MONGODB_URI`. Without it a local JSON file is used.

## Deploy (Render, free)
1. Push to GitHub.
2. Render > New > Blueprint (uses `render.yaml`), or New Web Service with build `npm run build` and start `npm start`.
3. Add a free MongoDB Atlas database and set `MONGODB_URI`, so data survives restarts.

## Where the logic lives
- `server/src/engine/rules.js`: operating calendars, required staff, lookups
- `server/src/engine/generate.js`: roster generator
- `server/src/engine/validate.js`: all checks, coverage table, backup suggestions
- `server/src/engine/changes.js`: manual edit and new leave, with before/after impact
- `server/src/app.js`: REST API. `client/`: React UI. `server/test/`: tests.

## Assumptions
- One shift per day. A person either works or does not. Shift timings are out of scope.
- Weeks run Monday to Sunday. Each person gets 1 weekly off per week (editable per employee).
- A day when none of a person's processes operate (for example Sunday for a Sunday-off process) counts as their weekly off.
- Leave and comp-off count as rest for that week.
- Public holidays apply to everyone and are editable. Working on one earns a comp-off credit (shown on the employee view). Comp-offs are scheduled by the manager.
- An employee covers all their assigned processes on any day they work.
- Pod leads are employees. In the sample data they have no brand and act as backups.
- Month-edge weeks with fewer than 5 days in the month need no weekly off in this month (assumed to fall in the neighbouring month). Known limit.
- Hard rules: coverage, leave respected, weekly off. Soft rules: preferred off day, no 7+ days in a row, spread of offs.
- Sample data: 25 brands, 20 with one employee (80%), 5 with 2 or 3. 37 employees, 4 pods. Zest Foods is a 365-day brand with one person, on purpose, to show a gap.

## Tell us how you think

**1. How are employees, brands, processes and pods modelled?**
A brand has many processes. A process belongs to one brand and holds its rules: operating calendar, minimum staff, and optional special-day overrides. An employee belongs to one pod and has a list of processes they work on. So one person can work on many processes and brands, and one process can have many people. A pod has a lead, who is also an employee. The brands an employee serves are found through their processes, so no data is repeated.

**2. How does it generate a roster and check the constraints?**
Step 1 fills the fixed facts: leave, comp-off, holidays, and days when all of a person's processes are closed. Step 2 gives each person their weekly off. People in single-employee brands go first because they have the fewest choices. For each candidate day it prefers: first, a day that causes no coverage gap; second, the person's preferred day; third, a day with fewer offs already, to spread them out. A separate validator then checks the finished roster from scratch: coverage per process per day, leave conflicts, weekly offs, preferences, long streaks. The generator never decides whether a roster is valid. Only the validator does, so manual edits go through the same checks.

**3. Single-employee brands versus brands with several employees?**
There is no special code. Both are a process with a list of employees and a minimum. With one employee, any weekly off on an operating day gives a gap, so the system flags it. With several employees, the generator staggers their offs so the minimum is still met. Sunday-off processes work with one person because Sunday is their natural off.

**4. What if the only employee of a brand is unavailable on a required day?**
The coverage check shows 0 working against 1 required on that date and names who is away and why. The Problems panel then lists backups: first people already on that process, then the same brand, same pod, floaters, and others. People on leave or comp-off are never suggested. Calling in someone on their weekly off is one click, and the tool states the cost (they lose an off, so give a comp-off later). Backups not assigned to the process are shown as text only, because calling them in would not fix the gap until they are added to the process.

**5. How does it handle conflicting requirements or too few staff?**
Hard rules always beat soft ones. If the rules cannot all be met, the generator still produces its best roster, but the validator marks every broken hard rule as an error with the date, the process and the reason. The header shows "N problems to fix". It never says a roster is fine when it is not.

**6. What is automated and what is left to people?**
Automated: first-draft roster, all checks, the impact of every change, backup suggestions. Human: approving leave, choosing and applying a backup, accepting a gap, and changing rules and staffing. A computer can find a gap, but accepting its cost (taking away someone's off day) is a people decision with real consequences.

**7. If the team and brand count doubled?**
(a) Store each record in its own collection with indexes, instead of one MongoDB document. (b) Generate by pod or by connected group of processes, and re-plan only what changed. (c) Replace the greedy generator with a proper solver (constraint programming) for fairness and tight cases. (d) Add logins and roles for pod leads. (e) Run generation as a background job.

**8. With one more week, what first?**
Cross-month planning: read the neighbouring month so month-edge weeks and long streaks are exact. Then an approval flow and comparing two alternative rosters, then notifications when a published roster changes, and a fairness report on weekend work.

## Not built
Approval workflow, notifications, alternative-plan comparison, shift timings, logins, cross-month weeks. The MongoDB store is written but only the JSON-file path was tested.

## Demo video script (3 to 5 minutes)
1. Setup page: show employees, a brand with one person, a brand with three, and the three calendar types. (45s)
2. Roster: generate December 2026. Show colours, holidays, Sunday-off brands. (45s)
3. Brand view, Zest Foods: red coverage cells, read the problem and backup options. Click "Call in" and read the impact box. (60s)
4. Add a leave for a single-employee brand and watch the new gap appear. Cancel it on Setup > leaves. (45s)
5. Edit a cell by hand to break a rule and show the instant validation. (30s)
6. Setup: change a process calendar, regenerate, show the roster change with no code change. Export CSV. (45s)

## Approach note (for the email)
The system separates a process's operating calendar from each employee's schedule. One validator measures coverage per process per day and explains every gap. A simple, explainable generator drafts the roster, and all manual edits and leave changes go through the same validator, which shows the exact impact and suggests backups. Rules are data editable in the UI, so new brands and processes need no code.
