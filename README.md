# Sprint 2 — Course Registration System

Full-stack multi-role web app built on top of the Sprint 1 prototype.
Node.js + Express backend, SQLite storage, vanilla-JS SPA frontend, JWT auth
with role-based access control. No vertical page scrolling — everything fits
in the viewport via tabs, modals, and split panes.

---

## Setup

Prereqs: Node.js 18+ (no native compilation needed — sql.js runs in pure JS).

```bash
cd sprint2/backend
npm install
npm start
```

The app will be live at **http://localhost:3000** — Express serves the API
*and* the frontend from the same port, so no separate dev server needed.

Optional env vars:

- `PORT` (default `3000`)
- `JWT_SECRET` (default dev secret; set in production)

The SQLite DB file `registration.db` is created next to `server.js` on first
launch and seeded automatically. Delete it to reset to a clean slate.

---

## Test credentials

All passwords are `password123`.

| Username   | Role      | Name              | Notes                                          |
|------------|-----------|-------------------|------------------------------------------------|
| `student1` | student   | Saleh Mohaidat    | VCU20260017, Junior, IS — pre-enrolled in 2 courses |
| `student2` | student   | Javad Edjlali     | VCU20260042, Senior, CS — no enrollments yet   |
| `prof1`    | professor | Dr. Williams      | Teaches INFO 450                               |
| `prof2`    | professor | Prof. Hernandez   | Teaches INFO 465                               |
| `prof3`    | professor | Dr. Patel         | Teaches MATH 200                               |

Unassigned courses (for the "Sign Up to Teach" demo): ENGL 215, ACCT 203,
MGMT 310, ECON 210, STAT 210.

---

## Demo walkthrough (~5 minutes)

**Student flow — `student1` / `password123`**

1. **Current Courses** — opens on 2 pre-seeded classes (INFO 450, ECON 210).
   Shows credits used / 15, schedule, instructor.
2. **Search Courses** — filter by department or keyword. Try "data" → INFO 465.
3. **Register for Courses** — add INFO 465. Success toast, credit counter updates.
4. **Show the guardrails** (any of these, server-enforced):
   - Try to add INFO 465 again → "Already registered."
   - Try to add MATH 200 + STAT 210 → "Exceed 15-credit limit."
   - Try to add a conflicting-time course → "Conflicts with a registered course."
5. **Rate Professors** — rate Dr. Williams 5 stars with a comment. Average updates live.
6. **Profile** — shows student ID, classification, program, current load.
7. **Logout**.

**Professor flow — `prof2` / `password123`**

1. **My Courses** — select INFO 465. Split pane shows the roster, including
   `student1` who just registered (proves the cross-role data flow works).
2. **Enrolled Students** — aggregate roster across all taught courses, filterable by tab.
3. **Sign Up to Teach** — claim ENGL 215 (becomes the instructor instantly).
4. **Create a course** — modal form, required fields, auto-assigned to this professor.
5. **Profile** — department, title, average rating, courses taught.

**New user registration** — from the login screen, anyone can create a new
student or professor account; dynamic form shows role-appropriate fields.

---

## What Sprint 2 adds on top of Sprint 1

| Area          | Sprint 1                    | Sprint 2                                           |
|---------------|-----------------------------|----------------------------------------------------|
| Users         | 1 hard-coded student        | Multi-user, student + professor roles              |
| Storage       | In-memory JS array          | SQLite (`sql.js`), persisted to `registration.db`  |
| Auth          | None                        | JWT + bcrypt, role-based middleware                |
| Nav           | Fixed tabs                  | Dynamic — different items per role                 |
| Layout        | Long scrolling page         | **No page scroll** — tabs / modals / split panes   |
| Professors    | N/A                         | Roster view, course creation, claim-to-teach       |
| Ratings       | N/A                         | 1–5 stars + comment, per-student upsert, averages  |

**All Sprint 1 business rules preserved and now enforced server-side:**
seat availability, 15-credit limit, duplicate-registration block,
schedule-conflict detection (same parsing rules, ported to server).

---

## Sprint 2 requirement checklist

- ✅ Multi-role authentication (student, professor) with distinct navigation
- ✅ Persistent database (SQLite) with 4 tables: `users`, `courses`, `enrollments`, `ratings`
- ✅ Student stories: search, register, drop, schedule, profile, rate
- ✅ Professor stories: view rosters, claim courses, create courses, see ratings
- ✅ Registration validation: seats, credits, conflicts, duplicates — all server-enforced
- ✅ Deep-linkable SPA with server-side fallback for clean URLs
- ✅ Single-command startup suitable for live demo

---

## File layout

```
sprint2/
├── README.md
├── backend/
│   ├── package.json          dependencies
│   ├── server.js             Express app, API routes, auth, business rules
│   └── db.js                 sql.js wrapper, schema, seed data
└── frontend/
    ├── index.html            SPA shell
    ├── styles.css            design tokens preserved from Sprint 1
    └── app.js                router, API client, 11 views
```

---

## API surface (brief)

- `POST /api/auth/login` · `POST /api/auth/register` · `GET /api/auth/me`
- `GET /api/courses` · `GET /api/courses/:id` · `POST /api/courses` (prof)
- `GET /api/courses/unassigned/list` · `POST /api/courses/:id/claim` (prof)
- `GET /api/me/enrollments` · `POST /api/me/enrollments` · `DELETE /api/me/enrollments/:courseId`
- `GET /api/me/teaching` · `GET /api/courses/:id/roster` (prof)
- `GET /api/professors` · `GET /api/professors/:id/ratings` · `POST /api/professors/:id/ratings`
