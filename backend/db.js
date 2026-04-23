// db.js - Database initialization and seeding
//
// Uses sql.js (pure-JS SQLite compiled to WebAssembly). We wrap it behind a
// tiny compatibility layer that exposes the subset of the better-sqlite3 API
// the server actually uses: db.prepare(sql).{run|get|all}(params), db.exec(sql),
// db.pragma(s). Callers must `await ready` before touching `db`.
//
// Persistence: sql.js runs fully in memory. We persist by writing the DB file
// to disk (registration.db) on every schema-changing call. Fine for a demo.

const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'registration.db');

let SQL = null;
let rawDb = null;

function persist() {
  if (!rawDb) return;
  fs.writeFileSync(DB_PATH, Buffer.from(rawDb.export()));
}

// Accept either a single params-object (named params) or positional args, so
// server.js can call `.run(':id', ...)` or `.run(1, 2, 3)` interchangeably.
function flattenArgs(args) {
  if (args.length === 0) return [];
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const out = {};
    for (const k of Object.keys(args[0])) {
      out[':' + k] = args[0][k];
      out['@' + k] = args[0][k];
      out['$' + k] = args[0][k];
    }
    return out;
  }
  return args;
}

// better-sqlite3-compatible wrapper around sql.js. Methods are safe to call
// only *after* the `ready` promise below has resolved.
const db = {
  prepare(sql) {
    return {
      run: (...args) => {
        const params = flattenArgs(args);
        const stmt = rawDb.prepare(sql);
        try { stmt.run(params); } finally { stmt.free(); }
        const changes = rawDb.getRowsModified();
        const lastRow = rawDb.exec('SELECT last_insert_rowid() AS id')[0];
        const lastId = lastRow ? lastRow.values[0][0] : 0;
        persist();
        return { changes, lastInsertRowid: lastId };
      },
      get: (...args) => {
        const params = flattenArgs(args);
        const stmt = rawDb.prepare(sql);
        try {
          stmt.bind(params);
          if (stmt.step()) return stmt.getAsObject();
          return undefined;
        } finally { stmt.free(); }
      },
      all: (...args) => {
        const params = flattenArgs(args);
        const stmt = rawDb.prepare(sql);
        const rows = [];
        try {
          stmt.bind(params);
          while (stmt.step()) rows.push(stmt.getAsObject());
        } finally { stmt.free(); }
        return rows;
      },
    };
  },
  exec(sql) { rawDb.exec(sql); persist(); },
  pragma(p) { try { rawDb.exec(`PRAGMA ${p}`); } catch (_) { /* no-op */ } },
};

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','professor')),
      full_name TEXT NOT NULL,
      student_id TEXT,
      classification TEXT,
      program TEXT,
      department TEXT,
      title TEXT,
      max_credits INTEGER DEFAULT 15
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      department TEXT NOT NULL,
      credits INTEGER NOT NULL,
      schedule TEXT NOT NULL,
      location TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      instructor_id INTEGER,
      FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, course_id),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      professor_id INTEGER NOT NULL,
      stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, professor_id),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (professor_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function seedIfEmpty() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) return;

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const insertUser = (row) => db.prepare(`
    INSERT INTO users (username, password_hash, role, full_name, student_id, classification, program, department, title, max_credits)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.username, row.password_hash, row.role, row.full_name, row.student_id,
         row.classification, row.program, row.department, row.title, row.max_credits);

  const student1Id = insertUser({
    username: 'student1', password_hash: hash('password123'), role: 'student',
    full_name: 'Saleh Mohaidat', student_id: 'VCU20260017',
    classification: 'Junior', program: 'Information Systems',
    department: null, title: null, max_credits: 15
  }).lastInsertRowid;

  insertUser({
    username: 'student2', password_hash: hash('password123'), role: 'student',
    full_name: 'Javad Edjlali', student_id: 'VCU20260042',
    classification: 'Senior', program: 'Computer Science',
    department: null, title: null, max_credits: 15
  });

  const prof1Id = insertUser({
    username: 'prof1', password_hash: hash('password123'), role: 'professor',
    full_name: 'Dr. Williams', student_id: null,
    classification: null, program: null,
    department: 'Information Systems', title: 'Associate Professor', max_credits: null
  }).lastInsertRowid;

  const prof2Id = insertUser({
    username: 'prof2', password_hash: hash('password123'), role: 'professor',
    full_name: 'Prof. Hernandez', student_id: null,
    classification: null, program: null,
    department: 'Information Systems', title: 'Assistant Professor', max_credits: null
  }).lastInsertRowid;

  const prof3Id = insertUser({
    username: 'prof3', password_hash: hash('password123'), role: 'professor',
    full_name: 'Dr. Patel', student_id: null,
    classification: null, program: null,
    department: 'Mathematics', title: 'Professor', max_credits: null
  }).lastInsertRowid;

  // Preserves the Sprint 1 catalog verbatim so the registration flow still
  // works the same. Three courses are left unassigned-by-professor so we can
  // demo "Sign up to teach" without needing to add more seed data.
  const coursesSeed = [
    { code:'INFO 450', title:'Systems Analysis and Design', description:'Introduces methods used to analyze business needs, gather requirements, and design information systems that solve organizational problems.', department:'Information Systems', credits:3, schedule:'Mon/Wed 11:00 AM - 12:15 PM', location:'Snead Hall 210', capacity:3, instructor_id: prof1Id },
    { code:'INFO 465', title:'Database Systems', description:'Covers relational database design, SQL, normalization, data modeling, and the use of database systems to support business applications.', department:'Information Systems', credits:3, schedule:'Tue/Thu 9:30 AM - 10:45 AM', location:'Snead Hall 115', capacity:4, instructor_id: prof2Id },
    { code:'MATH 200', title:'Calculus I', description:'Studies limits, derivatives, and applications of calculus to solve quantitative and real-world problems.', department:'Mathematics', credits:4, schedule:'Mon/Wed/Fri 1:00 PM - 1:50 PM', location:'Temple Building 302', capacity:4, instructor_id: prof3Id },
    { code:'ENGL 215', title:'Reading Film', description:'Explores film as a cultural and literary medium through analysis of narrative structure, visual language, and critical interpretation.', department:'English', credits:3, schedule:'Tue/Thu 1:00 PM - 2:15 PM', location:'Hibbs Hall 203', capacity:2, instructor_id: null },
    { code:'ACCT 203', title:'Introduction to Accounting', description:'Provides a foundation in financial accounting concepts, statements, and reporting used in business decision making.', department:'Accounting', credits:3, schedule:'Mon/Wed 2:00 PM - 3:15 PM', location:'Snead Hall 340', capacity:3, instructor_id: null },
    { code:'MGMT 310', title:'Managing People in Organizations', description:'Examines leadership, organizational behavior, teamwork, motivation, and workplace communication within modern organizations.', department:'Management', credits:3, schedule:'Tue/Thu 3:30 PM - 4:45 PM', location:'Snead Hall 275', capacity:2, instructor_id: null },
    { code:'ECON 210', title:'Principles of Macroeconomics', description:'Introduces national income, inflation, unemployment, monetary policy, fiscal policy, and broader economic performance.', department:'Economics', credits:3, schedule:'Mon/Wed 9:30 AM - 10:45 AM', location:'Academic Learning Commons 1204', capacity:3, instructor_id: null },
    { code:'STAT 210', title:'Basic Practice of Statistics', description:'Focuses on data analysis, probability, distributions, hypothesis testing, and statistical reasoning for practical business and research use.', department:'Statistics', credits:3, schedule:'Fri 10:00 AM - 12:30 PM', location:'Temple Building 118', capacity:2, instructor_id: null }
  ];

  for (const c of coursesSeed) {
    db.prepare(`
      INSERT INTO courses (code, title, description, department, credits, schedule, location, capacity, instructor_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(c.code, c.title, c.description, c.department, c.credits, c.schedule, c.location, c.capacity, c.instructor_id);
  }

  // Pre-enroll student1 into two courses so the schedule view is never
  // empty on the first login (mirrors the Sprint 1 default experience).
  const info450 = db.prepare('SELECT id FROM courses WHERE code = ?').get('INFO 450').id;
  const econ210 = db.prepare('SELECT id FROM courses WHERE code = ?').get('ECON 210').id;
  db.prepare('INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)').run(student1Id, info450);
  db.prepare('INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)').run(student1Id, econ210);

  console.log('[db] Seeded initial users and courses.');
}

// Kick off async init and expose a promise the server awaits before listen().
const ready = (async () => {
  const wasmPath = path.join(require.resolve('sql.js'), '..', 'sql-wasm.wasm');
  const wasmBin = fs.readFileSync(wasmPath);
  SQL = await initSqlJs({ wasmBinary: wasmBin });
  rawDb = fs.existsSync(DB_PATH)
    ? new SQL.Database(new Uint8Array(fs.readFileSync(DB_PATH)))
    : new SQL.Database();
  initSchema();
  seedIfEmpty();
})();

module.exports = { db, ready };
