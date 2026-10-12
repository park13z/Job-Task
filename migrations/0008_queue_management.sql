-- Queue positions are separate from the immutable weekly job number.
ALTER TABLE jobs ADD COLUMN queue_position INTEGER NOT NULL DEFAULT 0 CHECK (queue_position >= 0);
ALTER TABLE jobs ADD COLUMN inserted_number INTEGER CHECK (inserted_number IS NULL OR inserted_number > 0);
ALTER TABLE jobs ADD COLUMN cancelled_at INTEGER CHECK (cancelled_at IS NULL OR cancelled_at >= created_at);
UPDATE jobs SET queue_position = (SELECT COUNT(*) FROM jobs prior WHERE prior.work_date=jobs.work_date AND prior.line_id=jobs.line_id AND (prior.day_order<jobs.day_order OR (prior.day_order=jobs.day_order AND prior.id<=jobs.id)));
CREATE TABLE queue_actions (id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), request_hash TEXT NOT NULL CHECK(length(request_hash)=64), action TEXT NOT NULL CHECK(action IN ('insert','delete','cancel','recall','reorder')), job_id TEXT, work_date TEXT NOT NULL, line_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000), previous_order TEXT NOT NULL CHECK(json_valid(previous_order)), next_order TEXT NOT NULL CHECK(json_valid(next_order)), happened_at INTEGER NOT NULL);
CREATE INDEX queue_actions_date ON queue_actions(work_date,line_id,happened_at);
CREATE INDEX jobs_queue_lookup ON jobs(work_date,line_id,status,cancelled_at,queue_position);
