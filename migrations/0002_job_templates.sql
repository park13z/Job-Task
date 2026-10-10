CREATE TABLE job_templates (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 200 AND length(name) <= 200),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (typeof(version)='integer' AND version >= 1),
  created_at INTEGER NOT NULL CHECK (typeof(created_at)='integer' AND created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (typeof(updated_at)='integer' AND updated_at >= created_at)
);
CREATE INDEX job_templates_active_name ON job_templates(active,name);
