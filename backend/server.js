// server.js - Express API for Sprint 2 Course Registration System
//
// Responsibilities:
//   - Serve the frontend (static files from ../frontend)
//   - Expose REST endpoints for auth, courses, enrollments, ratings, and professor actions
//   - Enforce role-based access control on protected routes
//   - Preserve Sprint 1 business rules: seat availability, credit limit (15),
//     duplicate-registration block, schedule conflict detection.

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { db, ready } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'sprint2-demo-secret-change-in-prod';
const MAX_CREDITS_DEFAULT = 15;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ────────────────────────────────────────────────────────────────────────────
// Auth middleware
// ────────────────────────────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `This action requires a ${role} account.` });
    }
    next();
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Schedule-conflict helper (ported straight from the Sprint 1 JS)
// ────────────────────────────────────────────────────────────────────────────
function convertTimeToMinutes(timeStr) {
  const [time, meridiem] = timeStr.trim().split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}
function parseScheduleBlocks(schedule) {
  const [daysPart] = schedule.split(' ');
  const days = daysPart.split('/');
  const times = schedule.substring(daysPart.length + 1).split(' - ');
  return days.map(day => ({ day, start: convertTimeToMinutes(times[0]), end: convertTimeToMinutes(times[1]) }));
}
function blocksConflict(a, b) {
  return a.some(x => b.some(y => x.day === y.day && x.start < y.end && x.end > y.start));
}

// Returns course rows with a computed `enrolled` count and `instructor_name`.
function listCourses() {
  return db.prepare(`
    SELECT c.*,
           COALESCE(u.full_name, 'Unassigned') AS instructor_name,
           (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrolled
    FROM courses c
    LEFT JOIN users u ON u.id = c.instructor_id
    ORDER BY c.code
  `).all();
}
function getCourseById(id) {
  return db.prepare(`
    SELECT c.*,
           COALESCE(u.full_name, 'Unassigned') AS instructor_name,
           (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrolled
    FROM courses c
    LEFT JOIN users u ON u.id = c.instructor_id
    WHERE c.id = ?
  `).get(id);
}

// ────────────────────────────────────────────────────────────────────────────
// AUTH
// ────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials.' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({
    token,
    user: {
      id: user.id, username: user.username, role: user.role,
      full_name: user.full_name, student_id: user.student_id,
      classification: user.classification, program: user.program,
      department: user.department, title: user.title,
      max_credits: user.max_credits
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password, role, full_name, program, department, title, classification } = req.body || {};
  if (!username || !password || !role || !full_name) {
    return res.status(400).json({ error: 'Username, password, role, and full name are required.' });
  }
  if (!['student', 'professor'].includes(role)) {
    return res.status(400).json({ error: 'Role must be student or professor.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'That username is already taken.' });

  // Generate a VCU-style student id for newly-registered students.
  const studentId = role === 'student'
    ? 'VCU' + (2026_0000 + Math.floor(Math.random() * 9999)).toString()
    : null;

  const info = db.prepare(`
    INSERT INTO users (username, password_hash, role, full_name, student_id, classification, program, department, title, max_credits)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    username,
    bcrypt.hashSync(password, 10),
    role,
    full_name,
    studentId,
    role === 'student' ? (classification || 'Freshman') : null,
    role === 'student' ? (program || 'Undeclared') : null,
    role === 'professor' ? (department || 'General Studies') : null,
    role === 'professor' ? (title || 'Instructor') : null,
    role === 'student' ? MAX_CREDITS_DEFAULT : null
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.status(201).json({
    token,
    user: {
      id: user.id, username: user.username, role: user.role,
      full_name: user.full_name, student_id: user.student_id,
      classification: user.classification, program: user.program,
      department: user.department, title: user.title,
      max_credits: user.max_credits
    }
  });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({
    id: user.id, username: user.username, role: user.role,
    full_name: user.full_name, student_id: user.student_id,
    classification: user.classification, program: user.program,
    department: user.department, title: user.title,
    max_credits: user.max_credits
  });
});

// ────────────────────────────────────────────────────────────────────────────
// COURSES (public reads; writes restricted)
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/courses', (req, res) => {
  res.json(listCourses());
});

app.get('/api/courses/:id', (req, res) => {
  const c = getCourseById(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Course not found.' });
  res.json(c);
});

// Unassigned courses (for professors to claim)
app.get('/api/courses/unassigned/list', authRequired, requireRole('professor'), (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, 0 AS enrolled, 'Unassigned' AS instructor_name
    FROM courses c WHERE c.instructor_id IS NULL ORDER BY c.code
  `).all();
  // Hydrate enrolled counts (they might already have enrollments if a student
  // joined before the course was vacated; keep numbers accurate).
  for (const row of rows) {
    row.enrolled = db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE course_id = ?').get(row.id).n;
  }
  res.json(rows);
});

// Claim an unassigned course
app.post('/api/courses/:id/claim', authRequired, requireRole('professor'), (req, res) => {
  const courseId = Number(req.params.id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  if (course.instructor_id) return res.status(409).json({ error: 'This course already has an instructor.' });
  db.prepare('UPDATE courses SET instructor_id = ? WHERE id = ?').run(req.user.id, courseId);
  res.json(getCourseById(courseId));
});

// Professor creates a brand-new course (auto-assigned to them)
app.post('/api/courses', authRequired, requireRole('professor'), (req, res) => {
  const { code, title, description, department, credits, schedule, location, capacity } = req.body || {};
  const errs = [];
  if (!code) errs.push('code');
  if (!title) errs.push('title');
  if (!department) errs.push('department');
  if (!credits || credits < 1) errs.push('credits');
  if (!schedule) errs.push('schedule');
  if (!location) errs.push('location');
  if (!capacity || capacity < 1) errs.push('capacity');
  if (errs.length) return res.status(400).json({ error: `Missing or invalid: ${errs.join(', ')}` });

  // Try to parse schedule; if it fails, reject with a friendly message.
  try { parseScheduleBlocks(schedule); }
  catch { return res.status(400).json({ error: 'Schedule must look like "Mon/Wed 10:00 AM - 11:15 AM".' }); }

  const dup = db.prepare('SELECT id FROM courses WHERE code = ?').get(code);
  if (dup) return res.status(409).json({ error: 'A course with that code already exists.' });

  const info = db.prepare(`
    INSERT INTO courses (code, title, description, department, credits, schedule, location, capacity, instructor_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(code, title, description || '', department, credits, schedule, location, capacity, req.user.id);

  res.status(201).json(getCourseById(info.lastInsertRowid));
});

// ────────────────────────────────────────────────────────────────────────────
// ENROLLMENTS (students)
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/me/enrollments', authRequired, requireRole('student'), (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
           COALESCE(u.full_name, 'Unassigned') AS instructor_name,
           (SELECT COUNT(*) FROM enrollments e2 WHERE e2.course_id = c.id) AS enrolled
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN users u ON u.id = c.instructor_id
    WHERE e.student_id = ?
    ORDER BY c.code
  `).all(req.user.id);
  res.json(rows);
});

app.post('/api/me/enrollments', authRequired, requireRole('student'), (req, res) => {
  const courseId = Number(req.body?.course_id);
  if (!courseId) return res.status(400).json({ error: 'course_id is required.' });

  const course = getCourseById(courseId);
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  // Rule 1: No duplicate enrollment
  const already = db.prepare('SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?')
    .get(req.user.id, courseId);
  if (already) return res.status(409).json({ error: 'You are already registered for this course.' });

  // Rule 2: Seats available
  if (course.enrolled >= course.capacity) {
    return res.status(409).json({ error: 'This course is full, so registration is currently closed.' });
  }

  // Rule 3: Credit limit
  const me = db.prepare('SELECT max_credits FROM users WHERE id = ?').get(req.user.id);
  const maxCredits = me?.max_credits ?? MAX_CREDITS_DEFAULT;
  const currentCredits = db.prepare(`
    SELECT COALESCE(SUM(c.credits), 0) AS n
    FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE e.student_id = ?
  `).get(req.user.id).n;
  if (currentCredits + course.credits > maxCredits) {
    return res.status(409).json({ error: `Adding this class would exceed the ${maxCredits}-credit limit.` });
  }

  // Rule 4: Schedule conflict
  const existing = db.prepare(`
    SELECT c.schedule FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE e.student_id = ?
  `).all(req.user.id);
  const newBlocks = parseScheduleBlocks(course.schedule);
  const conflict = existing.some(r => blocksConflict(newBlocks, parseScheduleBlocks(r.schedule)));
  if (conflict) {
    return res.status(409).json({ error: 'This class conflicts with one of your currently registered courses.' });
  }

  db.prepare('INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)').run(req.user.id, courseId);
  res.status(201).json(getCourseById(courseId));
});

app.delete('/api/me/enrollments/:courseId', authRequired, requireRole('student'), (req, res) => {
  const courseId = Number(req.params.courseId);
  const info = db.prepare('DELETE FROM enrollments WHERE student_id = ? AND course_id = ?').run(req.user.id, courseId);
  if (info.changes === 0) return res.status(404).json({ error: 'You are not registered for this course.' });
  res.json({ ok: true, course: getCourseById(courseId) });
});

// ────────────────────────────────────────────────────────────────────────────
// PROFESSOR DASHBOARDS
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/me/teaching', authRequired, requireRole('professor'), (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
           (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrolled
    FROM courses c WHERE c.instructor_id = ? ORDER BY c.code
  `).all(req.user.id);
  res.json(rows);
});

app.get('/api/courses/:id/roster', authRequired, requireRole('professor'), (req, res) => {
  const courseId = Number(req.params.id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  if (course.instructor_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only view the roster for courses you teach.' });
  }
  const students = db.prepare(`
    SELECT u.id, u.full_name, u.student_id, u.classification, u.program
    FROM enrollments e JOIN users u ON u.id = e.student_id
    WHERE e.course_id = ? ORDER BY u.full_name
  `).all(courseId);
  res.json({ course: getCourseById(courseId), students });
});

// ────────────────────────────────────────────────────────────────────────────
// RATINGS (student → professor)
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/professors', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.full_name, u.department, u.title,
           (SELECT ROUND(AVG(r.stars), 2) FROM ratings r WHERE r.professor_id = u.id) AS avg_rating,
           (SELECT COUNT(*) FROM ratings r WHERE r.professor_id = u.id) AS rating_count
    FROM users u WHERE u.role = 'professor' ORDER BY u.full_name
  `).all();
  res.json(rows);
});

app.get('/api/professors/:id/ratings', (req, res) => {
  const profId = Number(req.params.id);
  const rows = db.prepare(`
    SELECT r.id, r.stars, r.comment, r.created_at, u.full_name AS student_name
    FROM ratings r JOIN users u ON u.id = r.student_id
    WHERE r.professor_id = ? ORDER BY r.created_at DESC
  `).all(profId);
  res.json(rows);
});

app.post('/api/professors/:id/ratings', authRequired, requireRole('student'), (req, res) => {
  const profId = Number(req.params.id);
  const { stars, comment } = req.body || {};
  const starsInt = Number(stars);
  if (!starsInt || starsInt < 1 || starsInt > 5) {
    return res.status(400).json({ error: 'Stars must be an integer from 1 to 5.' });
  }
  const prof = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'professor'`).get(profId);
  if (!prof) return res.status(404).json({ error: 'Professor not found.' });
  // Upsert: a student gets one rating per professor.
  db.prepare(`
    INSERT INTO ratings (student_id, professor_id, stars, comment) VALUES (?, ?, ?, ?)
    ON CONFLICT(student_id, professor_id) DO UPDATE SET stars=excluded.stars, comment=excluded.comment, created_at=datetime('now')
  `).run(req.user.id, profId, starsInt, comment || null);
  res.json({ ok: true });
});

// SPA fallback — any unknown non-API path returns index.html so deep links work.
app.get(/^(?!\/api).*/, (req, res, next) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'), err => err && next(err));
});

ready
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] Running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] Failed to initialize database:', err);
    process.exit(1);
  });
