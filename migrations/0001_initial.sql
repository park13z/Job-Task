PRAGMA foreign_keys = ON;

CREATE TABLE org_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  timezone TEXT NOT NULL DEFAULT 'America/Toronto' CHECK (timezone = 'America/Toronto'),
  week_start INTEGER NOT NULL DEFAULT 1 CHECK (week_start = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision) = 'integer' AND revision >= 0)
);
INSERT INTO org_settings (id) VALUES (1);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND instr(email, '@') > 1),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  role TEXT NOT NULL CHECK (role IN ('manager', 'supervisor', 'line_leader', 'assistant')),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (typeof(version) = 'integer' AND version >= 1),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer' AND updated_at >= created_at)
);

CREATE TABLE production_lines (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) BETWEEN 1 AND 40),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE line_members (
  line_id TEXT NOT NULL REFERENCES production_lines(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (line_id, user_id)
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200 AND length(title) <= 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  target_skids INTEGER CHECK (target_skids IS NULL OR (typeof(target_skids) = 'integer' AND target_skids > 0)),
  day_order INTEGER NOT NULL CHECK (typeof(day_order) = 'integer' AND day_order > 0),
  work_date TEXT NOT NULL CHECK (
    length(work_date) = 10 AND work_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND substr(work_date, 1, 4) BETWEEN '0001' AND '9999'
    AND coalesce(date(work_date, '+0 days') = work_date, 0)
  ),
  line_id TEXT NOT NULL REFERENCES production_lines(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'paused', 'done')),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer' AND updated_at >= created_at),
  started_at INTEGER CHECK (started_at IS NULL OR (typeof(started_at) = 'integer' AND started_at >= created_at)),
  completed_at INTEGER CHECK (completed_at IS NULL OR (typeof(completed_at) = 'integer' AND completed_at >= started_at)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (typeof(version) = 'integer' AND version >= 1),
  operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) > 0),
  CHECK (
    (status = 'todo' AND started_at IS NULL AND completed_at IS NULL)
    OR (status IN ('in_progress', 'paused') AND started_at IS NOT NULL AND completed_at IS NULL AND updated_at >= started_at)
    OR (status = 'done' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND updated_at >= completed_at)
  )
);

CREATE TABLE work_intervals (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  job_id TEXT NOT NULL REFERENCES jobs(id),
  opened_at INTEGER NOT NULL CHECK (typeof(opened_at) = 'integer' AND opened_at >= 0),
  closed_at INTEGER CHECK (closed_at IS NULL OR (typeof(closed_at) = 'integer' AND closed_at >= opened_at)),
  opened_by TEXT NOT NULL REFERENCES users(id),
  closed_by TEXT REFERENCES users(id),
  open_operation_id TEXT NOT NULL UNIQUE CHECK (length(open_operation_id) > 0),
  close_operation_id TEXT UNIQUE,
  CHECK ((closed_at IS NULL AND closed_by IS NULL AND close_operation_id IS NULL)
    OR (closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_operation_id IS NOT NULL))
);
CREATE UNIQUE INDEX work_intervals_one_open_per_job ON work_intervals(job_id) WHERE closed_at IS NULL;

CREATE TABLE job_events (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  job_id TEXT NOT NULL REFERENCES jobs(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'edited', 'started', 'paused', 'resumed', 'completed')),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 1),
  previous_state TEXT CHECK (previous_state IS NULL OR json_valid(previous_state)),
  new_state TEXT NOT NULL CHECK (json_valid(new_state)),
  happened_at INTEGER NOT NULL CHECK (typeof(happened_at) = 'integer' AND happened_at >= 0),
  operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) > 0),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  UNIQUE (job_id, version)
);

CREATE INDEX jobs_work_date_id ON jobs(work_date, id);
CREATE UNIQUE INDEX jobs_work_date_day_order ON jobs(work_date, day_order);
CREATE INDEX jobs_line_work_date_id ON jobs(line_id, work_date, id);
CREATE INDEX line_members_user_line ON line_members(user_id, line_id);
CREATE INDEX work_intervals_job_opened ON work_intervals(job_id, opened_at);
CREATE INDEX job_events_job_time ON job_events(job_id, happened_at, id);
