-- Additive mapping: legacy saved jobs remain unassigned until a Manager chooses production lines.
CREATE TABLE job_template_lines (
  template_id TEXT NOT NULL REFERENCES job_templates(id) ON DELETE CASCADE,
  line_id TEXT NOT NULL REFERENCES production_lines(id) ON DELETE RESTRICT,
  PRIMARY KEY (template_id, line_id)
);
CREATE INDEX job_template_lines_by_line ON job_template_lines(line_id, template_id);
