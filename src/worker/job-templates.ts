import { z } from "zod";
import { jobTemplateSchema, type User } from "../shared/contracts";
import { managerGuard, plannerGuard } from "./job-projection";
import { ApiError, conflict, isConstraint, output, unavailable, notFound } from "./errors";

const templateRow = z.strictObject({
  id: z.uuid(), name: z.string(), active: z.union([z.literal(0),z.literal(1)]),
  version: z.int(), createdAt: z.int(), updatedAt: z.int(),
  lineIdsJson: z.string(),
});
const columns = `t.id,t.name,t.active,t.version,t.created_at AS createdAt,t.updated_at AS updatedAt,
  (SELECT COALESCE(json_group_array(m.line_id),'[]') FROM job_template_lines m
    WHERE m.template_id=t.id AND (?=1 OR EXISTS
      (SELECT 1 FROM line_members lm WHERE lm.line_id=m.line_id AND lm.user_id=?))) AS lineIdsJson`;

const parse = (row: unknown) => {
  const data = output(templateRow, row);
  let ids: unknown;
  try { ids = JSON.parse(data.lineIdsJson); }
  catch { throw unavailable(); }
  return output(jobTemplateSchema, {
    id: data.id, name: data.name, active: data.active === 1, version: data.version,
    createdAt: data.createdAt, updatedAt: data.updatedAt,
    lineIds: output(z.array(z.uuid()), ids).sort(),
  });
};

export async function jobTemplates(db: D1Database, actor: User) {
  const planner = actor.role === "manager" || actor.role === "supervisor";
  const manager = actor.role === "manager";
  const result = await db.prepare(`SELECT ${columns} FROM job_templates t
    WHERE (t.active=1 OR ?=1)
    AND (?=1 OR EXISTS
      (SELECT 1 FROM job_template_lines m
       JOIN production_lines line ON line.id=m.line_id AND line.active=1
       JOIN line_members member ON member.line_id=m.line_id AND member.user_id=?
       WHERE m.template_id=t.id))
    ORDER BY t.active DESC,t.name COLLATE NOCASE,t.id`)
    .bind(Number(planner), actor.id, Number(manager), Number(planner), actor.id).all<unknown>();
  return result.results.map(parse);
}
async function template(db: D1Database, id: string, actor: User) {
  const row = await db.prepare(`SELECT ${columns} FROM job_templates t WHERE t.id=?`)
    .bind(1, actor.id, id).first<unknown>();
  if (!row) throw notFound();
  return parse(row);
}

// A zero-row guarded update must fail the batch before line assignments can be changed.
// The NOT NULL sentinel forces D1 to roll back the whole transaction on a missed guard.
async function write(db: D1Database, statement: D1PreparedStatement, mapping: D1PreparedStatement[]) {
  try {
    const results = await db.batch([
      statement,
      db.prepare("INSERT INTO job_template_lines(template_id,line_id) SELECT NULL,NULL WHERE changes()!=1"),
      ...mapping,
      db.prepare("UPDATE org_settings SET revision=revision+1 WHERE id=1"),
    ]);
    if (results[0]?.meta.changes !== 1 || results[results.length - 1]?.meta.changes !== 1) throw conflict();
  } catch (error) {
    if (isConstraint(error)) throw conflict();
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}
function lineGuard(lineIds: string[] | undefined) {
  if (lineIds === undefined || lineIds.length === 0) return { sql: "1=1", bindings: [] };
  return {
    sql: `(SELECT COUNT(*) FROM production_lines WHERE active=1 AND id IN (${lineIds.map(() => "?").join(",")}))=?`,
    bindings: [...lineIds, lineIds.length],
  };
}
const inserts = (db: D1Database, id: string, lineIds: string[]) =>
  lineIds.map(lineId => db.prepare("INSERT INTO job_template_lines (template_id,line_id) VALUES (?,?)").bind(id,lineId));

export async function createJobTemplate(db: D1Database, actor: User,
  data: { name: string; lineIds?: string[] }, at: number) {
  const id = crypto.randomUUID();
  const lineIds = data.lineIds ?? [];
  const guard = lineGuard(lineIds);
  await write(db, db.prepare(`INSERT INTO job_templates (id,name,created_at,updated_at)
    SELECT ?,?,?,? WHERE ${plannerGuard} AND ${guard.sql}`)
    .bind(id,data.name,at,at,actor.id,...guard.bindings), inserts(db,id,lineIds));
  return template(db,id,actor);
}
export async function updateJobTemplate(db: D1Database, actor: User, id: string,
  data: { expectedVersion: number; name?: string; active?: boolean; lineIds?: string[] }, at: number) {
  const guard = lineGuard(data.lineIds);
  const mapping = data.lineIds === undefined ? [] : [
    db.prepare("DELETE FROM job_template_lines WHERE template_id=?").bind(id),
    ...inserts(db,id,data.lineIds),
  ];
  await write(db, db.prepare(`UPDATE job_templates SET name=COALESCE(?,name),
    active=COALESCE(?,active),version=version+1,updated_at=?
    WHERE id=? AND version=? AND ${managerGuard} AND ${guard.sql}`)
    .bind(data.name ?? null, data.active === undefined ? null : Number(data.active),
      at, id, data.expectedVersion, actor.id, ...guard.bindings), mapping);
  return template(db,id,actor);
}
