-- Only one in-progress job may occupy a production line at any time.
-- The database enforces this atomically even for concurrent Start/Resume requests.
-- Paused/Done/To-do jobs do not occupy the line.
-- Existing duplicate active jobs must be reviewed before applying this migration;
-- CREATE INDEX intentionally fails instead of silently changing their statuses.
CREATE UNIQUE INDEX jobs_one_in_progress_per_line ON jobs(line_id) WHERE status='in_progress';
