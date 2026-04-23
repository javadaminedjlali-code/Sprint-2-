/*
 * app.js — Sprint 2 Course Registration SPA
 *
 * Architecture:
 *   - Tiny hand-rolled SPA (no React) to keep deps zero and the build simple.
 *   - `state` holds auth + current view + selected IDs.
 *   - `api` wraps fetch with auto-auth headers and JSON handling.
 *   - `render()` is the single entry point: it picks a view function based on
 *     state.view and (for logged-in users) state.user.role, then paints #main.
 *   - The top nav is rebuilt every render so role changes (login/logout)
 *     immediately update the available items.
 *
 * Preserved from Sprint 1:
 *   - Same visual language (cards, pills, colors, spacing tokens).
 *   - Seat-status coloring (Open / Nearly Full / Closed).
 *   - The "registration check" criteria panel.
 *   - All validation is also enforced server-side, so the UI is never the only guard.
 */

// ═════════════════════════════════════════════════════════════════════════════
// STATE
// ═════════════════════════════════════════════════════════════════════════════
const state = {
  token: localStorage.getItem('token') || null,
  user:  JSON.parse(localStorage.getItem('user') || 'null'),
  view:  'login',            // current top-level view
  tab:   null,               // current inner tab within a view
  selectedCourseId: null,    // for student search detail pane
  selectedTeachCourseId: null, // for professor "my courses" detail pane
};

// ═════════════════════════════════════════════════════════════════════════════
// API CLIENT
// ═════════════════════════════════════════════════════════════════════════════
const api = {
  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  },
  get:  (p)     => api.request('GET',    p),
  post: (p, b)  => api.request('POST',   p, b),
  del:  (p)     => api.request('DELETE', p),
};

// ═════════════════════════════════════════════════════════════════════════════
// SESSION HELPERS
// ═════════════════════════════════════════════════════════════════════════════
function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}
function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// ═════════════════════════════════════════════════════════════════════════════
// UI HELPERS
// ═════════════════════════════════════════════════════════════════════════════
const $ = (sel) => document.querySelector(sel);
const main = () => document.getElementById('main');

function toast(type, msg, ms = 3200) {
  const host = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = `t ${type}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(12px)'; el.style.transition = 'all .2s'; }, ms - 200);
  setTimeout(() => el.remove(), ms);
}

// Escape to prevent HTML injection in rendered strings
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function seatsRemaining(c) { return c.capacity - c.enrolled; }
function seatStatus(c) {
  const r = seatsRemaining(c);
  if (r <= 0)      return { text: 'Closed',      cls: 'danger'  };
  if (r === 1)     return { text: 'Nearly Full', cls: 'warning' };
  return             { text: 'Open',        cls: 'success' };
}

// ─── Modal system ────────────────────────────────────────────────────────────
function openModal({ title, body, actions }) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" id="mbd">
      <div class="modal" role="dialog" aria-modal="true">
        <button class="close" id="mclose" aria-label="Close">&times;</button>
        <h3>${esc(title)}</h3>
        <div id="mbody"></div>
        <div class="actions" id="mactions"></div>
      </div>
    </div>`;
  const bodyEl = document.getElementById('mbody');
  if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
  const actionsEl = document.getElementById('mactions');
  (actions || [{ label: 'Close', kind: 'ghost', onClick: closeModal }]).forEach(a => {
    const b = document.createElement('button');
    b.className = `btn ${a.kind || ''}`;
    b.textContent = a.label;
    b.addEventListener('click', () => a.onClick?.());
    actionsEl.appendChild(b);
  });
  document.getElementById('mclose').addEventListener('click', closeModal);
  document.getElementById('mbd').addEventListener('click', (e) => {
    if (e.target.id === 'mbd') closeModal();
  });
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

// ═════════════════════════════════════════════════════════════════════════════
// NAVIGATION (role-aware)
// ═════════════════════════════════════════════════════════════════════════════
function renderNav() {
  const nav = document.getElementById('nav');
  const brandSub = document.getElementById('brandSub');
  nav.innerHTML = '';

  const add = (label, view, { active = false, kind = '' } = {}) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (active) b.classList.add('active');
    if (kind) b.dataset.kind = kind;
    b.addEventListener('click', () => navigate(view));
    nav.appendChild(b);
  };

  if (!state.user) {
    brandSub.textContent = 'Sprint 2 · Live Registration System';
    add('Login',    'login',    { active: state.view === 'login' });
    add('Register', 'register', { active: state.view === 'register' });
    return;
  }

  // Role chip
  const chip = document.createElement('span');
  chip.className = 'role-chip' + (state.user.role === 'professor' ? ' prof' : '');
  chip.textContent = state.user.role === 'professor' ? 'Professor' : 'Student';
  nav.appendChild(chip);

  brandSub.textContent = `Signed in as ${state.user.full_name}`;

  if (state.user.role === 'student') {
    add('Search Courses',      'student-search',   { active: state.view === 'student-search' });
    add('Register for Courses','student-register', { active: state.view === 'student-register' });
    add('Current Courses',     'student-schedule', { active: state.view === 'student-schedule' });
    add('Profile',             'student-profile',  { active: state.view === 'student-profile' });
    add('Rate Professors',     'student-rate',     { active: state.view === 'student-rate' });
  } else {
    add('My Courses',        'prof-my-courses', { active: state.view === 'prof-my-courses' });
    add('Enrolled Students', 'prof-enrolled',   { active: state.view === 'prof-enrolled' });
    add('Sign Up to Teach',  'prof-signup',     { active: state.view === 'prof-signup' });
    add('Profile',           'prof-profile',    { active: state.view === 'prof-profile' });
  }

  const sep = document.createElement('div');
  sep.className = 'sep';
  nav.appendChild(sep);

  const logoutBtn = document.createElement('button');
  logoutBtn.textContent = 'Logout';
  logoutBtn.addEventListener('click', () => {
    clearSession();
    state.view = 'login';
    toast('info', 'You have been logged out.');
    render();
  });
  nav.appendChild(logoutBtn);
}

function navigate(view) {
  state.view = view;
  state.selectedCourseId = null;
  state.selectedTeachCourseId = null;
  render();
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW: LOGIN
// ═════════════════════════════════════════════════════════════════════════════
function viewLogin() {
  main().innerHTML = `
    <section class="card hero">
      <span class="eyebrow">Sprint 2 · Multi-Role · Database-Backed</span>
      <h1>Course Registration System</h1>
      <p>Full-stack build on top of Sprint 1. Students search, register, manage their schedule, and rate instructors. Professors manage courses and view rosters. All data is persisted in SQLite with role-based access control.</p>
    </section>
    <div class="auth-wrap">
      <div class="auth-hero">
        <div>
          <h2>Welcome back</h2>
          <p>Log in to pick up where you left off. Your schedule, ratings, and rosters are saved across sessions.</p>
          <div class="feats">
            <div class="feat"><b>Role-aware nav</b>Menus change based on whether you log in as a student or professor.</div>
            <div class="feat"><b>Real-time seats</b>Enrollment counts update instantly when anyone adds or drops a class.</div>
            <div class="feat"><b>No-scroll layout</b>Tabs, modals, and split panes keep each page in one view.</div>
            <div class="feat"><b>Secure auth</b>Bcrypt-hashed passwords and JWT-protected APIs.</div>
          </div>
        </div>
        <div style="font-size:12px;opacity:.8">VCU CourseHub · Sprint 2 Demo Build</div>
      </div>
      <div class="card auth-panel">
        <h2>Sign in</h2>
        <p class="note">Use one of the seeded accounts below, or create a new one.</p>
        <form id="loginForm">
          <div class="form-row" style="gap:14px">
            <div><label>Username</label><input id="loginUsername" autocomplete="username" required /></div>
            <div><label>Password</label><input id="loginPassword" type="password" autocomplete="current-password" required /></div>
            <button class="btn" type="submit">Log In</button>
            <button class="btn ghost" type="button" id="toRegister">Create a new account</button>
          </div>
        </form>
        <div class="creds-hint">
          <b>Test credentials</b> (all use password <b>password123</b>)<br/>
          Students: <b>student1</b>, <b>student2</b> &nbsp;·&nbsp; Professors: <b>prof1</b>, <b>prof2</b>, <b>prof3</b>
        </div>
      </div>
    </div>`;

  $('#toRegister').addEventListener('click', () => navigate('register'));
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/api/auth/login', {
        username: $('#loginUsername').value.trim(),
        password: $('#loginPassword').value,
      });
      setSession(res.token, res.user);
      toast('success', `Welcome, ${res.user.full_name}!`);
      state.view = res.user.role === 'student' ? 'student-search' : 'prof-my-courses';
      render();
    } catch (err) {
      toast('error', err.message);
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW: REGISTER
// ═════════════════════════════════════════════════════════════════════════════
function viewRegister() {
  main().innerHTML = `
    <section class="card hero">
      <span class="eyebrow">Create Account</span>
      <h1>Join the registration system</h1>
      <p>Create an account as a student to register for classes, or as a professor to manage courses and rosters.</p>
    </section>
    <div class="auth-wrap">
      <div class="auth-hero">
        <div>
          <h2>New here?</h2>
          <p>Choose your role below. You can switch between accounts freely — this is a demo system and data resets are easy to trigger.</p>
          <div class="feats">
            <div class="feat"><b>Students get</b>Search, register, profile, professor ratings.</div>
            <div class="feat"><b>Professors get</b>Course creation, roster views, class claiming.</div>
          </div>
        </div>
      </div>
      <div class="card auth-panel">
        <h2>Create account</h2>
        <p class="note">Fields marked * are required.</p>
        <form id="registerForm">
          <div class="form-row cols-2">
            <div><label>Username *</label><input id="regUsername" required /></div>
            <div><label>Password *</label><input id="regPassword" type="password" required minlength="6" /></div>
          </div>
          <div class="form-row cols-2" style="margin-top:10px">
            <div><label>Full Name *</label><input id="regFullName" required /></div>
            <div>
              <label>Role *</label>
              <select id="regRole">
                <option value="student">Student</option>
                <option value="professor">Professor</option>
              </select>
            </div>
          </div>
          <div class="form-row cols-2" id="studentFields" style="margin-top:10px">
            <div><label>Program</label><input id="regProgram" placeholder="Information Systems" /></div>
            <div>
              <label>Classification</label>
              <select id="regClassification">
                <option>Freshman</option><option>Sophomore</option><option>Junior</option><option>Senior</option>
              </select>
            </div>
          </div>
          <div class="form-row cols-2" id="profFields" style="margin-top:10px;display:none">
            <div><label>Department</label><input id="regDepartment" placeholder="Information Systems" /></div>
            <div><label>Title</label><input id="regTitle" placeholder="Assistant Professor" /></div>
          </div>
          <div style="display:flex;gap:10px;margin-top:14px">
            <button class="btn" type="submit">Create Account</button>
            <button class="btn ghost" type="button" id="toLogin">Back to login</button>
          </div>
        </form>
      </div>
    </div>`;

  const roleSel = $('#regRole');
  const sf = $('#studentFields'), pf = $('#profFields');
  roleSel.addEventListener('change', () => {
    const isStudent = roleSel.value === 'student';
    sf.style.display = isStudent ? '' : 'none';
    pf.style.display = isStudent ? 'none' : '';
  });
  $('#toLogin').addEventListener('click', () => navigate('login'));
  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const role = roleSel.value;
      const payload = {
        username: $('#regUsername').value.trim(),
        password: $('#regPassword').value,
        full_name: $('#regFullName').value.trim(),
        role,
      };
      if (role === 'student') {
        payload.program = $('#regProgram').value.trim() || undefined;
        payload.classification = $('#regClassification').value;
      } else {
        payload.department = $('#regDepartment').value.trim() || undefined;
        payload.title = $('#regTitle').value.trim() || undefined;
      }
      const res = await api.post('/api/auth/register', payload);
      setSession(res.token, res.user);
      toast('success', 'Account created — welcome!');
      state.view = res.user.role === 'student' ? 'student-search' : 'prof-my-courses';
      render();
    } catch (err) {
      toast('error', err.message);
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW: STUDENT — SEARCH COURSES
// ═════════════════════════════════════════════════════════════════════════════
// The Search view is a split: left pane lists courses (scroll inside its pane),
// right pane shows details + add/drop actions. Matches Sprint 1 behavior.
async function viewStudentSearch() {
  main().innerHTML = `
    <section class="card section" style="padding:14px 18px">
      <div class="profile-top" style="margin:0">
        <div>
          <p class="profile-name" style="font-size:18px;margin-bottom:2px">Search Courses</p>
          <p class="profile-sub">Browse the full catalog. Click a course to see details and register.</p>
        </div>
        <div class="legend">
          <span class="pill success">Open</span>
          <span class="pill warning">Nearly Full</span>
          <span class="pill danger">Closed</span>
        </div>
      </div>
    </section>
    <div class="split">
      <section class="card section">
        <div class="form-row cols-2" style="gap:10px;margin-bottom:10px">
          <input id="searchInput" placeholder="Search by code, title, instructor, or keyword…" />
          <select id="deptFilter"><option value="">All Departments</option></select>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span id="resultsCount" style="color:var(--muted);font-size:13px">Loading…</span>
          <span style="color:var(--muted);font-size:13px">Click a card to view details</span>
        </div>
        <div class="scroll" style="flex:1;min-height:0">
          <div id="courseList" class="course-list"></div>
        </div>
      </section>
      <section class="card section">
        <h2 style="font-size:16px">Course Details</h2>
        <div class="scroll" style="flex:1;min-height:0">
          <div id="detailPane"></div>
        </div>
      </section>
    </div>`;

  let courses = [];
  let enrollments = [];
  try {
    [courses, enrollments] = await Promise.all([
      api.get('/api/courses'),
      api.get('/api/me/enrollments'),
    ]);
  } catch (err) {
    toast('error', err.message);
    return;
  }

  // Populate department dropdown
  const deptFilter = $('#deptFilter');
  [...new Set(courses.map(c => c.department))].sort().forEach(d => {
    const o = document.createElement('option');
    o.value = d; o.textContent = d;
    deptFilter.appendChild(o);
  });

  const registeredIds = () => new Set(enrollments.map(e => e.id));

  function matches() {
    const q = $('#searchInput').value.trim().toLowerCase();
    const dep = $('#deptFilter').value;
    return courses.filter(c => {
      const hay = [c.code, c.title, c.instructor_name, c.department, c.description].join(' ').toLowerCase();
      return (!dep || c.department === dep) && (!q || hay.includes(q));
    });
  }

  function renderList() {
    const filtered = matches();
    $('#resultsCount').textContent = `${filtered.length} course${filtered.length === 1 ? '' : 's'} found`;
    const regIds = registeredIds();
    const list = $('#courseList');
    if (!filtered.length) {
      list.innerHTML = `<div class="empty">No matching courses. Try a keyword like <b>database</b>, <b>accounting</b>, or an instructor name.</div>`;
      return;
    }
    list.innerHTML = filtered.map(c => {
      const s = seatStatus(c);
      const isReg = regIds.has(c.id);
      return `
        <article class="course-card ${state.selectedCourseId === c.id ? 'selected' : ''}" data-id="${c.id}">
          <div>
            <h3>${esc(c.code)} — ${esc(c.title)}</h3>
            <div class="meta">
              <span class="pill">${esc(c.instructor_name)}</span>
              <span class="pill">${esc(c.schedule)}</span>
              <span class="pill ${s.cls}">${s.text}</span>
              <span class="pill">${seatsRemaining(c)} of ${c.capacity} seats</span>
              <span class="pill">${c.credits} cr</span>
            </div>
            <p class="desc">${esc(c.description || '')}</p>
          </div>
          <div class="actions">
            ${isReg
              ? `<span class="pill success">Registered</span>`
              : `<button class="btn sm success" data-add="${c.id}" ${seatsRemaining(c) <= 0 ? 'disabled' : ''}>Quick Add</button>`
            }
          </div>
        </article>`;
    }).join('');

    list.querySelectorAll('.course-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-add]')) return;
        state.selectedCourseId = Number(card.dataset.id);
        renderList();
        renderDetail();
      });
    });
    list.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await addCourse(Number(btn.dataset.add));
      });
    });
  }

  function renderDetail() {
    const pane = $('#detailPane');
    if (!state.selectedCourseId) {
      pane.innerHTML = `
        <div class="empty">Select a course on the left to see its description, instructor, schedule, seat availability, and registration controls.</div>
        <div class="criteria" style="margin-top:12px">
          <h3>Rules enforced</h3>
          <ul>
            <li>Seat availability is checked on every add</li>
            <li>You can't register for the same course twice</li>
            <li>A 15-credit limit is enforced</li>
            <li>Schedule conflicts are blocked</li>
          </ul>
        </div>`;
      return;
    }
    const c = courses.find(x => x.id === state.selectedCourseId);
    if (!c) { pane.innerHTML = `<div class="empty">Course not found.</div>`; return; }
    const s = seatStatus(c);
    const isReg = registeredIds().has(c.id);

    pane.innerHTML = `
      <span class="detail-code">${esc(c.code)}</span>
      <h3 class="detail-title">${esc(c.title)}</h3>
      <div class="meta">
        <span class="pill ${s.cls}">${s.text}</span>
        <span class="pill">${seatsRemaining(c)} of ${c.capacity} seats available</span>
        <span class="pill">${c.credits} credits</span>
      </div>
      <div class="info-grid">
        <div class="info"><span class="label">Instructor</span><span class="value">${esc(c.instructor_name)}</span></div>
        <div class="info"><span class="label">Schedule</span><span class="value">${esc(c.schedule)}</span></div>
        <div class="info"><span class="label">Department</span><span class="value">${esc(c.department)}</span></div>
        <div class="info"><span class="label">Location</span><span class="value">${esc(c.location)}</span></div>
        <div class="info" style="grid-column:1/-1"><span class="label">Enrollment</span><span class="value">${c.enrolled} enrolled / ${c.capacity} total seats</span></div>
      </div>
      <p class="detail-desc">${esc(c.description || '')}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${isReg
          ? `<button class="btn danger" id="dropBtn">Drop Course</button>`
          : `<button class="btn success" id="addBtn" ${seatsRemaining(c) <= 0 ? 'disabled' : ''}>Add Course</button>`}
      </div>`;

    $('#addBtn')?.addEventListener('click', () => addCourse(c.id));
    $('#dropBtn')?.addEventListener('click', () => dropCourse(c.id));
  }

  async function addCourse(id) {
    try {
      await api.post('/api/me/enrollments', { course_id: id });
      // Refresh both lists from the server so seat counts are correct
      [courses, enrollments] = await Promise.all([api.get('/api/courses'), api.get('/api/me/enrollments')]);
      const c = courses.find(x => x.id === id);
      toast('success', `${c.code} — ${c.title} added to your schedule.`);
      renderList(); renderDetail();
    } catch (err) { toast('error', err.message); }
  }
  async function dropCourse(id) {
    try {
      await api.del(`/api/me/enrollments/${id}`);
      [courses, enrollments] = await Promise.all([api.get('/api/courses'), api.get('/api/me/enrollments')]);
      const c = courses.find(x => x.id === id);
      toast('warning', `${c.code} — ${c.title} dropped. Seat released back to the course.`);
      renderList(); renderDetail();
    } catch (err) { toast('error', err.message); }
  }

  $('#searchInput').addEventListener('input', renderList);
  $('#deptFilter').addEventListener('change', renderList);
  renderList();
  renderDetail();
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW: STUDENT — REGISTER FOR COURSES (eligible-only list with one-click add)
// ═════════════════════════════════════════════════════════════════════════════
async function viewStudentRegister() {
  main().innerHTML = `
    <section class="card section" style="padding:14px 18px">
      <div class="profile-top" style="margin:0">
        <div>
          <p class="profile-name" style="font-size:18px;margin-bottom:2px">Register for Courses</p>
          <p class="profile-sub">Eligible courses only. Full classes, duplicates, and schedule conflicts are filtered out.</p>
        </div>
        <div id="capSummary" class="legend"></div>
      </div>
    </section>
    <section class="card section">
      <div class="scroll" style="flex:1;min-height:0">
        <div id="eligibleList" class="course-list"></div>
      </div>
    </section>`;

  async function load() {
    let courses = [], mine = [];
    try {
      [courses, mine] = await Promise.all([api.get('/api/courses'), api.get('/api/me/enrollments')]);
    } catch (err) { toast('error', err.message); return; }

    const registeredIds = new Set(mine.map(e => e.id));
    const currentCredits = mine.reduce((s, c) => s + c.credits, 0);
    const maxCredits = state.user.max_credits ?? 15;

    $('#capSummary').innerHTML = `
      <span class="pill info">${mine.length} enrolled</span>
      <span class="pill info">${currentCredits}/${maxCredits} credits used</span>
    `;

    const eligible = courses.filter(c => {
      if (registeredIds.has(c.id)) return false;
      if (seatsRemaining(c) <= 0) return false;
      if (currentCredits + c.credits > maxCredits) return false;
      // Note: schedule conflicts are still enforced server-side at add time;
      // we could pre-filter here too, but showing a few ineligible-due-to-conflict
      // options would be noisy. Server gives a clear error if the user tries.
      return true;
    });

    const host = $('#eligibleList');
    if (!eligible.length) {
      host.innerHTML = `<div class="empty">No courses are currently eligible to add. You may be at the credit limit, or all remaining courses are full.</div>`;
      return;
    }
    host.innerHTML = eligible.map(c => {
      const s = seatStatus(c);
      return `
        <article class="course-card">
          <div>
            <h3>${esc(c.code)} — ${esc(c.title)}</h3>
            <div class="meta">
              <span class="pill">${esc(c.instructor_name)}</span>
              <span class="pill">${esc(c.schedule)}</span>
              <span class="pill ${s.cls}">${s.text} — ${seatsRemaining(c)} seats</span>
              <span class="pill">${c.credits} credits</span>
              <span class="pill">${esc(c.department)}</span>
            </div>
            <p class="desc">${esc(c.description || '')}</p>
          </div>
          <div class="actions">
            <button class="btn success sm" data-add="${c.id}">Register</button>
          </div>
        </article>`;
    }).join('');

    host.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.post('/api/me/enrollments', { course_id: Number(btn.dataset.add) });
          toast('success', 'Registered. Your schedule has been updated.');
          load();
        } catch (err) { toast('error', err.message); }
      });
    });
  }
  load();
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW: STUDENT — CURRENT COURSES (My Schedule)
// ═════════════════════════════════════════════════════════════════════════════
async function viewStudentSchedule() {
  main().innerHTML = `
    <section class="card section" style="padding:14px 18px">
      <div class="profile-top" style="margin:0">
        <div>
          <p class="profile-name" id="pn">My Schedule</p>
          <p class="profile-sub" id="ps">Loading…</p>
        </div>
      </div>
      <div class="stat-grid" style="margin-top:12px" id="statGrid"></div>
    </section>
    <section class="card section">
      <h2 style="font-size:16px">Registered Courses</h2>
      <div class="scroll" style="flex:1;min-height:0">
        <div id="regList" class="course-list"></div>
      </div>
    </section>`;

  const u = state.user;
  $('#pn').textContent = u.full_name;
  $('#ps').textContent = u.student_id
    ? `Student ID: ${u.student_id} · ${u.classification || ''} · ${u.program || ''}`
    : 'Student';

  let mine = [];
  try { mine = await api.get('/api/me/enrollments'); }
  catch (err) { toast('error', err.message); return; }
  const credits = mine.reduce((s, c) => s + c.credits, 0);
  const maxCredits = u.max_credits ?? 15;

  $('#statGrid').innerHTML = `
    <div class="stat"><span class="label">Registered</span><div class="big">${mine.length}</div></div>
    <div class="stat"><span class="label">Credits</span><div class="big">${credits}</div></div>
    <div class="stat"><span class="label">Credit Limit</span><div class="big">${maxCredits}</div></div>
    <div class="stat"><span class="label">Status</span><div class="big">${credits >= maxCredits ? 'Maxed' : 'Open'}</div></div>
  `;

  const host = $('#regList');
  if (!mine.length) {
    host.innerHTML = `<div class="empty">No courses yet. Head to <b>Search Courses</b> or <b>Register for Courses</b> to add classes.</div>`;
    return;
  }
  host.innerHTML = mine.map(c => `
    <article class="course-card">
      <div>
        <h3>${esc(c.code)} — ${esc(c.title)}</h3>
        <div class="meta">
          <span class="pill">${esc(c.schedule)}</span>
          <span class="pill">${c.credits} credits</span>
          <span class="pill">${esc(c.location)}</span>
          <span class="pill">Instructor: ${esc(c.instructor_name)}</span>
          <span class="pill">${esc(c.department)}</span>
        </div>
      </div>
      <div class="actions">
        <button class="btn danger sm" data-drop="${c.id}">Drop</button>
      </div>
    </article>`).join('');
  host.querySelectorAll('[data-drop]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.del(`/api/me/enrollments/${btn.dataset.drop}`);
        toast('warning', 'Course dropped. Seat released.');
        viewStudentSchedule();
      } catch (err) { toast('error', err.message); }
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW: STUDENT — PROFILE
// ═════════════════════════════════════════════════════════════════════════════
async function viewStudentProfile() {
  const u = state.user;
  main().innerHTML = `
    <section class="card section" style="padding:14px 18px">
      <div class="profile-top" style="margin:0">
        <div>
          <p class="profile-name">${esc(u.full_name)}</p>
          <p class="profile-sub">Student profile · All data is pulled live from the database.</p>
        </div>
      </div>
    </section>
    <section class="card section">
      <h2 style="font-size:16px">Account Details</h2>
      <div class="info-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="info"><span class="label">Full Name</span><span class="value">${esc(u.full_name)}</span></div>
        <div class="info"><span class="label">Username</span><span class="value">${esc(u.username)}</span></div>
        <div class="info"><span class="label">Student ID</span><span class="value">${esc(u.student_id || '—')}</span></div>
        <div class="info"><span class="label">Classification</span><span class="value">${esc(u.classification || '—')}</span></div>
        <div class="info"><span class="label">Program</span><span class="value">${esc(u.program || '—')}</span></div>
        <div class="info"><span class="label">Credit Limit</span><span class="value">${u.max_credits ?? 15}</span></div>
      </div>
      <h2 style="font-size:16px;margin-top:16px">Enrollment Summary</h2>
      <div id="summary" class="stat-grid"></div>
    </section>`;

  try {
    const mine = await api.get('/api/me/enrollments');
    const credits = mine.reduce((s, c) => s + c.credits, 0);
    const depts = new Set(mine.map(c => c.department));
    $('#summary').innerHTML = `
      <div class="stat"><span class="label">Courses</span><div class="big">${mine.length}</div></div>
      <div class="stat"><span class="label">Credits</span><div class="big">${credits}</div></div>
      <div class="stat"><span class="label">Departments</span><div class="big">${depts.size}</div></div>
      <div class="stat"><span class="label">Remaining Capacity</span><div class="big">${(u.max_credits ?? 15) - credits}</div></div>`;
  } catch (err) { toast('error', err.message); }
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW: STUDENT — RATE PROFESSORS
// ═════════════════════════════════════════════════════════════════════════════
async function viewStudentRate() {
  main().innerHTML = `
    <section class="card section" style="padding:14px 18px">
      <div class="profile-top" style="margin:0">
        <div>
          <p class="profile-name" style="font-size:18px;margin-bottom:2px">Rate Professors</p>
          <p class="profile-sub">Share feedback on your instructors. You can rate any professor once and update at any time.</p>
        </div>
      </div>
    </section>
    <section class="card section">
      <div class="scroll" style="flex:1;min-height:0">
        <table class="table" id="profTable">
          <thead><tr><th>Professor</th><th>Department</th><th>Title</th><th>Avg. Rating</th><th>Reviews</th><th style="text-align:right">Action</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </section>`;

  let profs = [];
  try { profs = await api.get('/api/professors'); }
  catch (err) { toast('error', err.message); return; }

  const tbody = $('#profTable tbody');
  tbody.innerHTML = profs.map(p => `
    <tr>
      <td><b>${esc(p.full_name)}</b></td>
      <td>${esc(p.department || '—')}</td>
      <td>${esc(p.title || '—')}</td>
      <td>${p.avg_rating != null ? `★ ${p.avg_rating}` : '<span style="color:var(--muted)">No ratings</span>'}</td>
      <td>${p.rating_count || 0}</td>
      <td style="text-align:right"><button class="btn sm" data-rate="${p.id}">Rate / View</button></td>
    </tr>`).join('');

  tbody.querySelectorAll('[data-rate]').forEach(btn => {
    btn.addEventListener('click', () => openRateModal(Number(btn.dataset.rate), profs.find(p => p.id === Number(btn.dataset.rate))));
  });
}

function openRateModal(profId, prof) {
  let stars = 5;
  const body = document.createElement('div');
  body.innerHTML = `
    <p style="margin:0 0 10px;color:var(--muted);font-size:13.5px">
      Rating <b>${esc(prof.full_name)}</b> (${esc(prof.department || '—')}).
      Your previous rating (if any) will be replaced.
    </p>
    <div class="stars" id="starPicker">
      ${[1,2,3,4,5].map(i => `<span class="s on" data-v="${i}">★</span>`).join('')}
    </div>
    <div style="margin-top:12px">
      <label>Comment (optional)</label>
      <textarea id="ratingComment" placeholder="What stood out about this instructor?"></textarea>
    </div>
    <div style="margin-top:12px">
      <label>Recent reviews</label>
      <div id="recentReviews" class="scroll" style="max-height:140px;border:1px solid var(--border);border-radius:10px;padding:8px">
        <div style="color:var(--muted);font-size:12.5px">Loading…</div>
      </div>
    </div>`;
  // Star picker behavior
  body.querySelectorAll('#starPicker .s').forEach(s => {
    s.addEventListener('click', () => {
      stars = Number(s.dataset.v);
      body.querySelectorAll('#starPicker .s').forEach(x => {
        x.classList.toggle('on', Number(x.dataset.v) <= stars);
      });
    });
  });
  openModal({
    title: 'Rate Professor',
    body,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: closeModal },
      { label: 'Submit Rating', kind: '', onClick: async () => {
        try {
          await api.post(`/api/professors/${profId}/ratings`, {
            stars, comment: body.querySelector('#ratingComment').value.trim() || null,
          });
          closeModal();
          toast('success', 'Rating saved. Thanks for the feedback!');
          viewStudentRate();
        } catch (err) { toast('error', err.message); }
      }},
    ],
  });
  // Populate recent reviews asynchronously
  api.get(`/api/professors/${profId}/ratings`).then(list => {
    const host = body.querySelector('#recentReviews');
    if (!list.length) { host.innerHTML = `<div style="color:var(--muted);font-size:12.5px">No reviews yet — you could be the first!</div>`; return; }
    host.innerHTML = list.slice(0, 10).map(r => `
      <div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px">
        <b>${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</b>
        <span style="color:var(--muted)">· ${esc(r.student_name)} · ${esc(r.created_at)}</span>
        ${r.comment ? `<div style="margin-top:2px">${esc(r.comment)}</div>` : ''}
      </div>`).join('');
  }).catch(() => {});
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW: PROFESSOR — MY COURSES (+ roster in split pane)
// ═════════════════════════════════════════════════════════════════════════════
async function viewProfMyCourses() {
  main().innerHTML = `
    <section class="card section" style="padding:14px 18px">
      <div class="profile-top" style="margin:0">
        <div>
          <p class="profile-name" style="font-size:18px;margin-bottom:2px">My Courses</p>
          <p class="profile-sub">Courses you teach. Select one to view its roster, or head to <b>Sign Up to Teach</b> to pick up more.</p>
        </div>
        <button class="btn sm" id="newCourseBtn">+ Create New Course</button>
      </div>
    </section>
    <div class="split">
      <section class="card section">
        <h2 style="font-size:16px">Your Teaching Load</h2>
        <div class="scroll" style="flex:1;min-height:0">
          <div id="teachList" class="course-list"></div>
        </div>
      </section>
      <section class="card section">
        <h2 style="font-size:16px">Course Details</h2>
        <div class="scroll" style="flex:1;min-height:0">
          <div id="teachDetail"></div>
        </div>
      </section>
    </div>`;

  $('#newCourseBtn').addEventListener('click', openCreateCourseModal);

  let mine = [];
  try { mine = await api.get('/api/me/teaching'); }
  catch (err) { toast('error', err.message); return; }

  const list = $('#teachList');
  if (!mine.length) {
    list.innerHTML = `<div class="empty">You aren't teaching any courses yet. Use <b>Sign Up to Teach</b> to claim an unassigned course, or <b>+ Create New Course</b> above.</div>`;
  } else {
    list.innerHTML = mine.map(c => `
      <article class="course-card ${state.selectedTeachCourseId === c.id ? 'selected' : ''}" data-id="${c.id}">
        <div>
          <h3>${esc(c.code)} — ${esc(c.title)}</h3>
          <div class="meta">
            <span class="pill">${esc(c.schedule)}</span>
            <span class="pill">${esc(c.location)}</span>
            <span class="pill info">${c.enrolled} / ${c.capacity} enrolled</span>
            <span class="pill">${c.credits} cr</span>
          </div>
        </div>
        <div class="actions"><button class="btn sm">View Roster</button></div>
      </article>`).join('');
    list.querySelectorAll('.course-card').forEach(card => {
      card.addEventListener('click', () => {
        state.selectedTeachCourseId = Number(card.dataset.id);
        viewProfMyCourses(); // re-render to refresh selection + roster
      });
    });
  }

  const detail = $('#teachDetail');
  if (!state.selectedTeachCourseId) {
    detail.innerHTML = `<div class="empty">Select a course to see its enrolled students and key details.</div>`;
    return;
  }
  try {
    const { course, students } = await api.get(`/api/courses/${state.selectedTeachCourseId}/roster`);
    detail.innerHTML = `
      <span class="detail-code">${esc(course.code)}</span>
      <h3 class="detail-title">${esc(course.title)}</h3>
      <div class="info-grid">
        <div class="info"><span class="label">Schedule</span><span class="value">${esc(course.schedule)}</span></div>
        <div class="info"><span class="label">Location</span><span class="value">${esc(course.location)}</span></div>
        <div class="info"><span class="label">Credits</span><span class="value">${course.credits}</span></div>
        <div class="info"><span class="label">Enrolled</span><span class="value">${course.enrolled} / ${course.capacity}</span></div>
      </div>
      <p class="detail-desc">${esc(course.description || '')}</p>
      <h4 style="margin:6px 0 8px;font-size:14px">Roster (${students.length})</h4>
      ${students.length
        ? `<table class="table">
            <thead><tr><th>Name</th><th>Student ID</th><th>Program</th><th>Year</th></tr></thead>
            <tbody>${students.map(s => `
              <tr>
                <td><b>${esc(s.full_name)}</b></td>
                <td>${esc(s.student_id || '—')}</td>
                <td>${esc(s.program || '—')}</td>
                <td>${esc(s.classification || '—')}</td>
              </tr>`).join('')}</tbody>
          </table>`
        : `<div class="empty">No students enrolled yet.</div>`}`;
  } catch (err) { detail.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW: PROFESSOR — ENROLLED STUDENTS (combined roster across all taught courses)
// ═════════════════════════════════════════════════════════════════════════════
async function viewProfEnrolled() {
  main().innerHTML = `
    <section class="card section" style="padding:14px 18px">
      <div class="profile-top" style="margin:0">
        <div>
          <p class="profile-name" style="font-size:18px;margin-bottom:2px">Enrolled Students</p>
          <p class="profile-sub">All students across every course you teach. Use the tabs to filter by course.</p>
        </div>
      </div>
    </section>
    <section class="card section">
      <div class="tabs" id="rosterTabs"></div>
      <div class="scroll" style="flex:1;min-height:0">
        <div id="rosterBody"></div>
      </div>
    </section>`;

  let mine = [];
  try { mine = await api.get('/api/me/teaching'); }
  catch (err) { toast('error', err.message); return; }

  if (!mine.length) {
    $('#rosterTabs').style.display = 'none';
    $('#rosterBody').innerHTML = `<div class="empty">You aren't teaching any courses yet.</div>`;
    return;
  }

  // Fetch all rosters in parallel
  const rosters = await Promise.all(
    mine.map(c => api.get(`/api/courses/${c.id}/roster`).catch(() => ({ course: c, students: [] })))
  );
  const tabs = $('#rosterTabs');
  const body = $('#rosterBody');

  // "All" tab aggregates everything; per-course tabs follow.
  const tabDefs = [
    { label: 'All Students', render: () => aggregateRender(rosters) },
    ...rosters.map((r) => ({
      label: r.course.code,
      render: () => singleRender(r),
    })),
  ];

  let activeIdx = 0;
  function setActive(i) {
    activeIdx = i;
    tabs.querySelectorAll('button').forEach((b, idx) => b.classList.toggle('active', idx === i));
    body.innerHTML = '';
    body.appendChild(tabDefs[i].render());
  }
  tabs.innerHTML = '';
  tabDefs.forEach((t, i) => {
    const b = document.createElement('button');
    b.textContent = t.label;
    b.addEventListener('click', () => setActive(i));
    tabs.appendChild(b);
  });
  setActive(0);

  function aggregateRender(rs) {
    const rows = [];
    rs.forEach(r => r.students.forEach(s => rows.push({ ...s, courseCode: r.course.code, courseTitle: r.course.title })));
    const host = document.createElement('div');
    if (!rows.length) { host.innerHTML = `<div class="empty">No students are enrolled in your courses yet.</div>`; return host; }
    host.innerHTML = `
      <table class="table">
        <thead><tr><th>Student</th><th>Student ID</th><th>Program</th><th>Year</th><th>Course</th></tr></thead>
        <tbody>
          ${rows.map(s => `
            <tr>
              <td><b>${esc(s.full_name)}</b></td>
              <td>${esc(s.student_id || '—')}</td>
              <td>${esc(s.program || '—')}</td>
              <td>${esc(s.classification || '—')}</td>
              <td><span class="pill info">${esc(s.courseCode)}</span> ${esc(s.courseTitle)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    return host;
  }
  function singleRender(r) {
    const host = document.createElement('div');
    if (!r.students.length) { host.innerHTML = `<div class="empty">No students enrolled in ${esc(r.course.code)} yet.</div>`; return host; }
    host.innerHTML = `
      <div style="margin-bottom:10px">
        <b>${esc(r.course.code)} — ${esc(r.course.title)}</b>
        <span class="pill info" style="margin-left:8px">${r.students.length} / ${r.course.capacity}</span>
        <span class="pill" style="margin-left:4px">${esc(r.course.schedule)}</span>
      </div>
      <table class="table">
        <thead><tr><th>Name</th><th>Student ID</th><th>Program</th><th>Year</th></tr></thead>
        <tbody>${r.students.map(s => `
          <tr>
            <td><b>${esc(s.full_name)}</b></td>
            <td>${esc(s.student_id || '—')}</td>
            <td>${esc(s.program || '—')}</td>
            <td>${esc(s.classification || '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    return host;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW: PROFESSOR — SIGN UP TO TEACH
// ═════════════════════════════════════════════════════════════════════════════
async function viewProfSignup() {
  main().innerHTML = `
    <section class="card section" style="padding:14px 18px">
      <div class="profile-top" style="margin:0">
        <div>
          <p class="profile-name" style="font-size:18px;margin-bottom:2px">Sign Up to Teach</p>
          <p class="profile-sub">Claim an unassigned course from the catalog, or create a brand-new one.</p>
        </div>
        <button class="btn" id="createCourseBtn">+ Create New Course</button>
      </div>
    </section>
    <section class="card section">
      <h2 style="font-size:16px">Unassigned Courses</h2>
      <div class="scroll" style="flex:1;min-height:0">
        <div id="unassignedList" class="course-list"></div>
      </div>
    </section>`;

  $('#createCourseBtn').addEventListener('click', openCreateCourseModal);

  let rows = [];
  try { rows = await api.get('/api/courses/unassigned/list'); }
  catch (err) { toast('error', err.message); return; }

  const host = $('#unassignedList');
  if (!rows.length) {
    host.innerHTML = `<div class="empty">Every catalog course already has an instructor. Create a new course above to add one.</div>`;
    return;
  }
  host.innerHTML = rows.map(c => `
    <article class="course-card">
      <div>
        <h3>${esc(c.code)} — ${esc(c.title)}</h3>
        <div class="meta">
          <span class="pill">${esc(c.schedule)}</span>
          <span class="pill">${esc(c.location)}</span>
          <span class="pill">${esc(c.department)}</span>
          <span class="pill info">${c.enrolled} / ${c.capacity} enrolled</span>
          <span class="pill">${c.credits} cr</span>
        </div>
        <p class="desc">${esc(c.description || '')}</p>
      </div>
      <div class="actions">
        <button class="btn success sm" data-claim="${c.id}">Sign up to teach</button>
      </div>
    </article>`).join('');
  host.querySelectorAll('[data-claim]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.post(`/api/courses/${btn.dataset.claim}/claim`);
        toast('success', 'You are now the instructor for this course.');
        viewProfSignup();
      } catch (err) { toast('error', err.message); }
    });
  });
}

function openCreateCourseModal() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-row cols-2">
      <div><label>Course Code *</label><input id="nc_code" placeholder="e.g., INFO 520" /></div>
      <div><label>Title *</label><input id="nc_title" /></div>
    </div>
    <div class="form-row cols-3" style="margin-top:10px">
      <div><label>Department *</label><input id="nc_dept" placeholder="Information Systems" /></div>
      <div><label>Credits *</label><input id="nc_credits" type="number" min="1" max="6" value="3" /></div>
      <div><label>Capacity *</label><input id="nc_cap" type="number" min="1" value="20" /></div>
    </div>
    <div class="form-row cols-2" style="margin-top:10px">
      <div><label>Schedule *</label><input id="nc_sched" placeholder="Mon/Wed 10:00 AM - 11:15 AM" /></div>
      <div><label>Location *</label><input id="nc_loc" placeholder="Snead Hall 301" /></div>
    </div>
    <div style="margin-top:10px">
      <label>Description</label>
      <textarea id="nc_desc" placeholder="Short description shown to students on search"></textarea>
    </div>
    <div style="margin-top:10px;color:var(--muted);font-size:12.5px">
      Schedule format tip: days separated by <code>/</code>, then a time range with AM/PM.
    </div>`;
  openModal({
    title: 'Create a New Course',
    body,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: closeModal },
      { label: 'Create', kind: '', onClick: async () => {
        try {
          await api.post('/api/courses', {
            code: body.querySelector('#nc_code').value.trim(),
            title: body.querySelector('#nc_title').value.trim(),
            department: body.querySelector('#nc_dept').value.trim(),
            credits: Number(body.querySelector('#nc_credits').value),
            capacity: Number(body.querySelector('#nc_cap').value),
            schedule: body.querySelector('#nc_sched').value.trim(),
            location: body.querySelector('#nc_loc').value.trim(),
            description: body.querySelector('#nc_desc').value.trim(),
          });
          closeModal();
          toast('success', 'Course created. You are now the assigned instructor.');
          // Return to my-courses so the professor sees their new course.
          navigate('prof-my-courses');
        } catch (err) { toast('error', err.message); }
      }},
    ],
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW: PROFESSOR — PROFILE
// ═════════════════════════════════════════════════════════════════════════════
async function viewProfProfile() {
  const u = state.user;
  main().innerHTML = `
    <section class="card section" style="padding:14px 18px">
      <div class="profile-top" style="margin:0">
        <div>
          <p class="profile-name">${esc(u.full_name)}</p>
          <p class="profile-sub">Professor profile · Ratings and teaching load are pulled live from the database.</p>
        </div>
      </div>
    </section>
    <section class="card section">
      <h2 style="font-size:16px">Account Details</h2>
      <div class="info-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="info"><span class="label">Full Name</span><span class="value">${esc(u.full_name)}</span></div>
        <div class="info"><span class="label">Username</span><span class="value">${esc(u.username)}</span></div>
        <div class="info"><span class="label">Title</span><span class="value">${esc(u.title || '—')}</span></div>
        <div class="info"><span class="label">Department</span><span class="value">${esc(u.department || '—')}</span></div>
      </div>
      <h2 style="font-size:16px;margin-top:16px">Teaching Summary</h2>
      <div id="teachSummary" class="stat-grid"></div>
      <h2 style="font-size:16px;margin-top:16px">Recent Student Ratings</h2>
      <div id="recentRatings"></div>
    </section>`;

  try {
    const [teaching, profs, ratings] = await Promise.all([
      api.get('/api/me/teaching'),
      api.get('/api/professors'),
      api.get(`/api/professors/${u.id}/ratings`),
    ]);
    const me = profs.find(p => p.id === u.id) || {};
    const totalStudents = teaching.reduce((s, c) => s + (c.enrolled || 0), 0);
    const totalSeats = teaching.reduce((s, c) => s + (c.capacity || 0), 0);
    $('#teachSummary').innerHTML = `
      <div class="stat"><span class="label">Courses</span><div class="big">${teaching.length}</div></div>
      <div class="stat"><span class="label">Enrolled Students</span><div class="big">${totalStudents}</div></div>
      <div class="stat"><span class="label">Seat Capacity</span><div class="big">${totalSeats}</div></div>
      <div class="stat"><span class="label">Avg. Rating</span><div class="big">${me.avg_rating != null ? `★ ${me.avg_rating}` : '—'}</div></div>`;
    $('#recentRatings').innerHTML = ratings.length
      ? ratings.slice(0, 5).map(r => `
        <div style="padding:10px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px">
          <b>${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</b>
          <span style="color:var(--muted);font-size:12.5px"> · ${esc(r.student_name)} · ${esc(r.created_at)}</span>
          ${r.comment ? `<div style="margin-top:4px;font-size:13.5px">${esc(r.comment)}</div>` : ''}
        </div>`).join('')
      : `<div class="empty">No ratings yet.</div>`;
  } catch (err) { toast('error', err.message); }
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUTER
// ═════════════════════════════════════════════════════════════════════════════
const views = {
  'login':            viewLogin,
  'register':         viewRegister,
  'student-search':   viewStudentSearch,
  'student-register': viewStudentRegister,
  'student-schedule': viewStudentSchedule,
  'student-profile':  viewStudentProfile,
  'student-rate':     viewStudentRate,
  'prof-my-courses':  viewProfMyCourses,
  'prof-enrolled':    viewProfEnrolled,
  'prof-signup':      viewProfSignup,
  'prof-profile':     viewProfProfile,
};

function render() {
  renderNav();
  const needsAuth = !['login', 'register'].includes(state.view);
  if (needsAuth && !state.user) state.view = 'login';
  if (!needsAuth && state.user) {
    state.view = state.user.role === 'student' ? 'student-search' : 'prof-my-courses';
  }
  const fn = views[state.view] || viewLogin;
  fn();
}

// Validate any existing token on load so a stale token doesn't leave us in a
// broken state. If /me succeeds, refresh the cached user; otherwise log out.
(async function bootstrap() {
  if (state.token) {
    try {
      const me = await api.get('/api/auth/me');
      state.user = me;
      localStorage.setItem('user', JSON.stringify(me));
      state.view = me.role === 'student' ? 'student-search' : 'prof-my-courses';
    } catch {
      clearSession();
      state.view = 'login';
    }
  }
  render();
})();
