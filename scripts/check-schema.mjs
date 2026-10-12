import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const db = new DatabaseSync(':memory:');
let checks = 0;
const check = (name, run) => {
  run();
  checks += 1;
  console.log(`PASS ${name}`);
};
const one = (sql, ...values) => db.prepare(sql).get(...values);
const count = (table) => one(`SELECT count(*) AS n FROM ${table}`).n;
const snapshot = () => ({
  job: one("SELECT * FROM jobs WHERE id='j1'"),
  intervals: db.prepare("SELECT * FROM work_intervals WHERE job_id='j1' ORDER BY opened_at").all(),
  events: db.prepare("SELECT * FROM job_events WHERE job_id='j1' ORDER BY version").all(),
  revision: one('SELECT revision FROM org_settings WHERE id=1').revision,
});
const insertUser = (id, role) => db.prepare(
  'INSERT INTO users (id,email,name,role,active,created_at,updated_at) VALUES (?,?,?,?,1,0,0)'
).run(id, `${id}@example.test`, id, role);
const createJob = (id, line, order = 1) => {
  db.prepare(`INSERT INTO jobs
    (id,title,description,target_skids,day_order,work_date,line_id,created_by,status,created_at,updated_at,version,operation_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, 'Pack 8x341g LOB Sugar 2 skids', '', 2, order, '2026-10-08', line, 'supervisor', 'todo', 0, 0, 1, `create-${id}`);
};
const action = ({ kind, actor, at, version, op, hash, jobId = 'j1' }) => {
  hash ??= createHash('sha256').update(JSON.stringify({ actor, method: 'POST', path: `/api/jobs/${jobId}/${kind}`, key: op, body: { expectedVersion: version } })).digest('hex');
  const previous = { start: 'todo', pause: 'in_progress', resume: 'paused', done: 'in_progress' }[kind];
  const next = { start: 'in_progress', pause: 'paused', resume: 'in_progress', done: 'done' }[kind];
  const eventType = { start: 'started', pause: 'paused', resume: 'resumed', done: 'completed' }[kind];
  const existing = one('SELECT actor_id,request_hash FROM job_events WHERE operation_id=?', op);
  if (existing) {
    if (existing.actor_id !== actor || existing.request_hash !== hash) return 'idempotency_conflict';
    return 'replay';
  }
  db.exec('BEGIN');
  try {
    const update = db.prepare(`UPDATE jobs SET status=?, updated_at=?, version=version+1, operation_id=?,
      started_at=CASE WHEN ?='start' THEN ? ELSE started_at END,
      completed_at=CASE WHEN ?='done' THEN ? ELSE completed_at END
      WHERE id=? AND version=? AND status=? AND updated_at<=?
        AND (NOT (? IN ('start','resume')) OR NOT EXISTS (
          SELECT 1 FROM jobs occupied WHERE occupied.line_id=jobs.line_id
          AND occupied.status='in_progress' AND occupied.id<>jobs.id
        ))
        AND EXISTS (SELECT 1 FROM users u JOIN production_lines l ON l.id=jobs.line_id
          WHERE u.id=? AND u.active=1 AND l.active=1
          AND (u.role IN ('manager','supervisor') OR
            (u.role IN ('line_leader','assistant') AND EXISTS
              (SELECT 1 FROM line_members m WHERE m.user_id=u.id AND m.line_id=jobs.line_id))))`)
      .run(next, at, op, kind, at, kind, at, jobId, version, previous, at, kind, actor);
    if (update.changes !== 1) {
      db.exec('ROLLBACK');
      return 'conflict';
    }
    if (kind === 'start' || kind === 'resume') {
      db.prepare(`INSERT INTO work_intervals
        (id,job_id,opened_at,opened_by,open_operation_id)
        SELECT ?,id,?, ?,? FROM jobs WHERE id=? AND operation_id=? AND version=?`)
        .run(`interval-${op}`, at, actor, op, jobId, op, version + 1);
    } else {
      db.prepare(`UPDATE work_intervals SET closed_at=?,closed_by=?,close_operation_id=?
        WHERE job_id=? AND closed_at IS NULL AND opened_at<=?
          AND EXISTS (SELECT 1 FROM jobs WHERE id=? AND operation_id=? AND version=?)`)
        .run(at, actor, op, jobId, at, jobId, op, version + 1);
    }
    const requiredInterval = kind === 'start' || kind === 'resume'
      ? 'EXISTS (SELECT 1 FROM work_intervals WHERE job_id=jobs.id AND open_operation_id=? AND closed_at IS NULL)'
      : 'EXISTS (SELECT 1 FROM work_intervals WHERE job_id=jobs.id AND close_operation_id=? AND closed_at=?)';
    const intervalArgs = kind === 'start' || kind === 'resume' ? [op] : [op, at];
    db.prepare(`INSERT INTO job_events
      (id,job_id,actor_id,event_type,version,previous_state,new_state,happened_at,operation_id,request_hash)
      VALUES (?, (SELECT id FROM jobs WHERE id=? AND operation_id=? AND version=? AND ${requiredInterval}),
        ?,?,?,json_object('status',?),json_object('status',?),?,?,?)`)
      .run(`event-${op}`, jobId, op, version + 1, ...intervalArgs,
        actor, eventType, version + 1, previous, next, at, op, hash);
    db.prepare(`UPDATE org_settings SET revision=revision+1 WHERE id=1
      AND EXISTS (SELECT 1 FROM job_events WHERE operation_id=? AND version=?)`)
      .run(op, version + 1);
    db.exec('COMMIT');
    return 'applied';
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};
const activeMs = (jobId, now) => one(`SELECT COALESCE(SUM(COALESCE(closed_at,?)-opened_at),0) AS ms
  FROM work_intervals WHERE job_id=?`, now, jobId).ms;

try {
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0007_single_active_job_per_line.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0008_queue_management.sql', import.meta.url), 'utf8'));
  check('actual migration tables and foreign keys', () => {
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(x => x.name),
      ['job_events', 'jobs', 'line_members', 'org_settings', 'production_lines', 'queue_actions', 'users', 'work_intervals']);
    assert.equal(one('PRAGMA foreign_keys').foreign_keys, 1);
  });
  check('Toronto settings and indexes', () => {
    assert.equal(one('SELECT timezone FROM org_settings').timezone, 'America/Toronto');
    assert.equal(one('SELECT revision FROM org_settings').revision, 0);
    const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(x => x.name));
    for (const name of ['jobs_work_date_day_order', 'work_intervals_one_open_per_job', 'job_events_job_time', 'jobs_one_in_progress_per_line', 'jobs_queue_lookup', 'queue_actions_date']) assert.ok(indexes.has(name));
  });
  for (const [id, role] of [['manager', 'manager'], ['supervisor', 'supervisor'], ['leader', 'line_leader'], ['assistant', 'assistant'], ['outsider', 'assistant']]) insertUser(id, role);
  db.prepare("INSERT INTO production_lines (id,code,name) VALUES ('line1','CKT2A/B','CKT2A/B')").run();
  db.prepare("INSERT INTO production_lines (id,code,name) VALUES ('line2','CKT1A','CKT1A')").run();
  for (const id of ['leader', 'assistant']) db.prepare("INSERT INTO line_members (line_id,user_id) VALUES ('line1',?)").run(id);
  createJob('j1', 'line1');
  check('day order is unique across lines on each work date', () => {
    assert.equal(one("SELECT code FROM production_lines WHERE id='line1'").code, 'CKT2A/B');
    assert.throws(() => createJob('same-order', 'line1'), /UNIQUE constraint failed/);
    assert.throws(() => createJob('same-order-other-line', 'line2'), /UNIQUE constraint failed/);
    createJob('other-line', 'line2', 2);
    assert.deepEqual(db.prepare("SELECT id FROM jobs WHERE work_date='2026-10-08' ORDER BY work_date,day_order,id").all().map(x => x.id), ['j1', 'other-line']);
  });
  check('invalid job fields and foreign key', () => {
    assert.throws(() => createJob('bad-line', 'missing', 99), /FOREIGN KEY constraint failed/);
    assert.throws(() => db.prepare("UPDATE jobs SET work_date='2026-02-30' WHERE id='j1'").run(), /CHECK constraint failed/);
    assert.throws(() => db.prepare("UPDATE jobs SET target_skids=0 WHERE id='j1'").run(), /CHECK constraint failed/);
    assert.throws(() => db.prepare("UPDATE jobs SET status='cancelled' WHERE id='j1'").run(), /CHECK constraint failed/);
  });
  check('unauthorized line leaves no changes', () => {
    const before = snapshot();
    assert.equal(action({ kind: 'start', actor: 'outsider', at: 1000, version: 1, op: 'outsider' }), 'conflict');
    assert.deepEqual(snapshot(), before);
  });
  check('manager and supervisor can act on every active line', () => {
    createJob('planner-job', 'line2', 9);
    assert.equal(action({ kind: 'start', actor: 'manager', at: 1000, version: 1, op: 'planner-start', jobId: 'planner-job' }), 'applied');
    assert.equal(action({ kind: 'pause', actor: 'supervisor', at: 2000, version: 2, op: 'planner-pause', jobId: 'planner-job' }), 'applied');
    assert.equal(action({ kind: 'resume', actor: 'manager', at: 3000, version: 3, op: 'planner-resume', jobId: 'planner-job' }), 'applied');
    assert.equal(action({ kind: 'done', actor: 'supervisor', at: 4000, version: 4, op: 'planner-done', jobId: 'planner-job' }), 'applied');
  });
  check('leader start, assistant pause, resume and done yield 90 minutes', () => {
    const hour = 60 * 60 * 1000;
    const eight = 8 * hour, nine = 9 * hour, nineThirty = nine + hour / 2, ten = 10 * hour;
    assert.equal(action({ kind: 'start', actor: 'leader', at: eight, version: 1, op: 'start1' }), 'applied');
    let before = snapshot();
    assert.equal(action({ kind: 'start', actor: 'leader', at: eight + 1, version: 2, op: 'double-start' }), 'conflict');
    assert.equal(action({ kind: 'resume', actor: 'assistant', at: eight + 1, version: 2, op: 'resume-active' }), 'conflict');
    assert.deepEqual(snapshot(), before);
    assert.equal(action({ kind: 'pause', actor: 'assistant', at: nine, version: 2, op: 'pause1' }), 'applied');
    assert.equal(activeMs('j1', nine), 60 * 60 * 1000);
    assert.equal(activeMs('j1', nineThirty), 60 * 60 * 1000);
    before = snapshot();
    assert.equal(action({ kind: 'pause', actor: 'assistant', at: nine + 1, version: 3, op: 'double-pause' }), 'conflict');
    assert.equal(action({ kind: 'done', actor: 'leader', at: nine + 1, version: 3, op: 'done-paused' }), 'conflict');
    assert.deepEqual(snapshot(), before);
    assert.equal(action({ kind: 'resume', actor: 'assistant', at: nineThirty, version: 3, op: 'resume1' }), 'applied');
    assert.equal(action({ kind: 'done', actor: 'leader', at: ten, version: 4, op: 'done1' }), 'applied');
    assert.equal(activeMs('j1', ten), 90 * 60 * 1000);
    assert.equal(one("SELECT started_at FROM jobs WHERE id='j1'").started_at, eight);
    assert.equal(one("SELECT completed_at FROM jobs WHERE id='j1'").completed_at, ten);
    assert.equal(one("SELECT COUNT(*) AS n FROM work_intervals WHERE job_id='j1'").n, 2);
    assert.equal(one('SELECT revision FROM org_settings').revision, 8);
  });
  check('revoked account and removed membership block guarded action', () => {
    createJob('revoked', 'line1', 6);
    const before = one("SELECT * FROM jobs WHERE id='revoked'");
    const revision = one('SELECT revision FROM org_settings').revision;
    db.prepare("UPDATE users SET active=0 WHERE id='leader'").run();
    assert.equal(action({ kind: 'start', actor: 'leader', at: 1000, version: 1, op: 'inactive', jobId: 'revoked' }), 'conflict');
    db.prepare("UPDATE users SET active=1 WHERE id='leader'").run();
    db.prepare("DELETE FROM line_members WHERE line_id='line1' AND user_id='leader'").run();
    assert.equal(action({ kind: 'start', actor: 'leader', at: 1000, version: 1, op: 'removed', jobId: 'revoked' }), 'conflict');
    assert.deepEqual(one("SELECT * FROM jobs WHERE id='revoked'"), before);
    assert.equal(one("SELECT count(*) AS n FROM job_events WHERE job_id='revoked'").n, 0);
    assert.equal(one("SELECT count(*) AS n FROM work_intervals WHERE job_id='revoked'").n, 0);
    assert.equal(one('SELECT revision FROM org_settings').revision, revision);
    db.prepare("INSERT INTO line_members (line_id,user_id) VALUES ('line1','leader')").run();
  });
  check('replay, changed hash, stale and double action change nothing', () => {
    const before = snapshot();
    assert.equal(action({ kind: 'done', actor: 'leader', at: 10 * 3600000, version: 4, op: 'done1' }), 'replay');
    assert.equal(action({ kind: 'pause', actor: 'leader', at: 10 * 3600000, version: 4, op: 'done1' }), 'idempotency_conflict');
    assert.equal(action({ kind: 'done', actor: 'assistant', at: 10 * 3600000, version: 4, op: 'done1' }), 'idempotency_conflict');
    assert.equal(action({ kind: 'done', actor: 'leader', at: 10 * 3600000, version: 4, op: 'done1', hash: 'b'.repeat(64) }), 'idempotency_conflict');
    assert.equal(action({ kind: 'pause', actor: 'leader', at: 11 * 3600000, version: 5, op: 'double' }), 'conflict');
    assert.equal(action({ kind: 'start', actor: 'leader', at: 11 * 3600000, version: 1, op: 'stale' }), 'conflict');
    assert.deepEqual(snapshot(), before);
  });
  check('missing interval rolls back successful job CAS', () => {
    createJob('missing-interval', 'line1', 3);
    db.prepare("UPDATE jobs SET status='in_progress',started_at=1000,updated_at=1000,version=2,operation_id='seed' WHERE id='missing-interval'").run();
    const before = one("SELECT * FROM jobs WHERE id='missing-interval'");
    const revision = one('SELECT revision FROM org_settings').revision;
    assert.throws(() => action({ kind: 'pause', actor: 'leader', at: 2000, version: 2, op: 'missing', jobId: 'missing-interval' }), /NOT NULL constraint failed/);
    assert.deepEqual(one("SELECT * FROM jobs WHERE id='missing-interval'"), before);
    assert.equal(one("SELECT count(*) AS n FROM job_events WHERE job_id='missing-interval'").n, 0);
    assert.equal(one('SELECT revision FROM org_settings').revision, revision);
    db.prepare("UPDATE jobs SET status='paused' WHERE id='missing-interval'").run();
  });
  check('bad audit rolls back interval and job update', () => {
    createJob('bad-audit', 'line1', 4);
    const before = one("SELECT * FROM jobs WHERE id='bad-audit'");
    assert.throws(() => action({ kind: 'start', actor: 'leader', at: 1000, version: 1, op: 'bad-audit', hash: 'bad', jobId: 'bad-audit' }), /CHECK constraint failed/);
    assert.deepEqual(one("SELECT * FROM jobs WHERE id='bad-audit'"), before);
    assert.equal(one("SELECT count(*) AS n FROM work_intervals WHERE job_id='bad-audit'").n, 0);
  });
  check('unique open interval and multiple cycles', () => {
    createJob('cycles', 'line1', 5);
    assert.equal(action({ kind: 'start', actor: 'leader', at: 1000, version: 1, op: 'c1', jobId: 'cycles' }), 'applied');
    assert.throws(() => db.prepare(`INSERT INTO work_intervals (id,job_id,opened_at,opened_by,open_operation_id)
      VALUES ('duplicate','cycles',1001,'assistant','duplicate')`).run(), /UNIQUE constraint failed/);
    assert.equal(action({ kind: 'pause', actor: 'assistant', at: 2000, version: 2, op: 'c2', jobId: 'cycles' }), 'applied');
    assert.equal(action({ kind: 'resume', actor: 'leader', at: 3000, version: 3, op: 'c3', jobId: 'cycles' }), 'applied');
    assert.equal(action({ kind: 'pause', actor: 'assistant', at: 4000, version: 4, op: 'c4', jobId: 'cycles' }), 'applied');
    assert.equal(action({ kind: 'resume', actor: 'assistant', at: 5000, version: 5, op: 'c5', jobId: 'cycles' }), 'applied');
    assert.equal(action({ kind: 'done', actor: 'leader', at: 6000, version: 6, op: 'c6', jobId: 'cycles' }), 'applied');
    assert.equal(activeMs('cycles', 6000), 3000);
  });
  check('Toronto fall and spring repeated or skipped wall hour each remain 60 minutes', () => {
    assert.equal(Date.parse('2026-11-01T06:30:00Z') - Date.parse('2026-11-01T05:30:00Z'), 3600000);
    assert.equal(Date.parse('2026-03-08T07:30:00Z') - Date.parse('2026-03-08T06:30:00Z'), 3600000);
    const toronto = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
    assert.equal(toronto('2026-11-01T05:30:00Z'), '01:30');
    assert.equal(toronto('2026-11-01T06:30:00Z'), '01:30');
    assert.equal(toronto('2026-03-08T06:30:00Z'), '01:30');
    assert.equal(toronto('2026-03-08T07:30:00Z'), '03:30');
  });
  check('foreign key integrity', () => assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []));
  console.log(`${checks} local SQLite design checks passed. D1, auth, browser and runtime remain unverified.`);
} finally {
  db.close();
}
