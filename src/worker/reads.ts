import { z } from "zod";
import { userSchema, lineSchema, jobSchema, jobEventSchema, revisionSchema, uuidSchema, roleSchema, instantSchema, versionSchema, type User } from "../shared/contracts";
import { output, notFound, forbidden } from "./errors";
import { jobJson, readPermission } from "./job-projection";

const dbUser = z.strictObject({ id: uuidSchema, username: z.string(), name: z.string().trim().min(1).max(100), role: roleSchema, active: z.union([z.literal(0), z.literal(1)]).transform(Boolean), version: versionSchema, createdAt: instantSchema, updatedAt: instantSchema }).pipe(userSchema);
const userColumns = "u.id, c.username, u.name, u.role, u.active, u.version, u.created_at AS createdAt,u.updated_at AS updatedAt";
const jsonRow = z.strictObject({ json: z.string() });

export function parseJobRow(value: unknown) {
  return output(jobSchema, JSON.parse(output(jsonRow, value).json));
}

export async function revision(db: D1Database) {
  const row = output(z.strictObject({ revision: revisionSchema }), await db.prepare("SELECT revision FROM org_settings WHERE id=1").first<unknown>());
  return row.revision;
}
export async function findUserByUsername(db: D1Database, username: string): Promise<User | null> {
  const row = await db.prepare(`SELECT ${userColumns} FROM users u JOIN user_credentials c ON c.user_id=u.id WHERE c.username=?`).bind(username).first<unknown>();
  return row === null ? null : output(dbUser, row);
}
export async function findUser(db: D1Database, id: string): Promise<User> {
  const row = await db.prepare(`SELECT ${userColumns} FROM users u JOIN user_credentials c ON c.user_id=u.id WHERE u.id=?`).bind(id).first<unknown>();
  if (row === null) throw notFound();
  return output(dbUser, row);
}
export async function users(db: D1Database): Promise<User[]> {
  const result = await db.prepare(`SELECT ${userColumns} FROM users u JOIN user_credentials c ON c.user_id=u.id ORDER BY u.name,u.id`).all<unknown>();
  return output(z.array(dbUser), result.results);
}

export async function lines(db: D1Database, actor: User) {
  const result = await db.prepare(`SELECT l.id,l.code,l.name,l.active,
    COALESCE((SELECT json_group_array(m.user_id) FROM line_members m WHERE m.line_id=l.id),'[]') AS members
    FROM production_lines l WHERE EXISTS (SELECT 1 FROM users a WHERE a.id=? AND a.active=1 AND
    (a.role IN ('manager','supervisor') OR EXISTS (SELECT 1 FROM line_members m WHERE m.line_id=l.id AND m.user_id=a.id)))
    ORDER BY l.code,l.id`).bind(actor.id).all<unknown>();
  const rows = output(z.array(z.strictObject({ id: z.string(), code: z.string(), name: z.string(), active: z.union([z.literal(0), z.literal(1)]), members: z.string() })), result.results);
  return rows.map((row) => output(lineSchema, { id: row.id, code: row.code, name: row.name, active: Boolean(row.active), memberIds: JSON.parse(row.members) }));
}
export async function findLine(db: D1Database, actor: User, id: string) {
  const found = (await lines(db, actor)).find((line) => line.id === id);
  if (!found) throw notFound();
  return found;
}
export async function assertLineAccess(db: D1Database, actor: User, lineId: string) {
  if (!(await lines(db, actor)).some((line) => line.id === lineId)) throw forbidden();
}

export async function findJob(db: D1Database, actor: User, id: string, at: number) {
  const row = await db.prepare(`SELECT ${jobJson(at)} AS json FROM jobs j WHERE j.id=? AND ${readPermission}`).bind(id, actor.id).first<unknown>();
  if (row === null) throw notFound();
  return parseJobRow(row);
}

export async function events(db: D1Database, actor: User, jobId: string, at: number) {
  await findJob(db, actor, jobId, at);
  const result = await db.prepare(`SELECT e.id,e.event_type AS eventType,e.happened_at AS happenedAt,e.version,
    u.id AS actorId,u.name AS actorName FROM job_events e JOIN users u ON u.id=e.actor_id
    JOIN jobs j ON j.id=e.job_id WHERE j.id=? AND ${readPermission} ORDER BY e.version`).bind(jobId, actor.id).all<unknown>();
  const rows = output(z.array(z.strictObject({ id: z.string(), eventType: z.string(), happenedAt: z.number(), version: z.number(), actorId: z.string(), actorName: z.string() })), result.results);
  return rows.map(({ actorId, actorName, ...event }) => output(jobEventSchema, { ...event, actor: { id: actorId, name: actorName } }));
}
