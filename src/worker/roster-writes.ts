import type { User, Role } from "../shared/contracts";
import type { Env } from "./types";
import { managerGuard, plannerGuard } from "./job-projection";
import { ApiError, conflict, isConstraint, unavailable } from "./errors";
import { findUser, findLine } from "./reads";
import { hashPassword } from "./auth";

async function write(db: D1Database, statement: D1PreparedStatement) {
  try {
    const results = await db.batch([
      statement,
      db.prepare("UPDATE org_settings SET revision=revision+1 WHERE id=1 AND changes()=1"),
    ]);
    if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) throw conflict();
  } catch (error) {
    if (isConstraint(error)) throw conflict();
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}

export async function createUser(env: Env, actor: User,
  data: { username: string; name: string; role: Role; password: string }, at: number) {
  if (!/^[1-9][0-9]{0,3}$/.test(env.USER_LIMIT)) throw unavailable();
  const budget=Number(env.USER_LIMIT);
  const id=crypto.randomUUID();
  const hash=await hashPassword(data.password);
  try {
    const results=await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id,email,name,role,active,created_at,updated_at)
        SELECT ?,?,?,?,1,?,? WHERE ${managerGuard} AND (SELECT COUNT(*) FROM users)<?`)
        .bind(id,id+"@job-task.invalid",data.name,data.role,at,at,actor.id,budget),
      env.DB.prepare(`INSERT INTO user_credentials(user_id,username,password_salt,password_hash,updated_at)
        SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=?)`)
        .bind(id,data.username,hash.salt,hash.hash,at,id),
      env.DB.prepare("UPDATE org_settings SET revision=revision+1 WHERE id=1 AND changes()=1"),
    ]);
    if(results[0]?.meta.changes!==1||results[1]?.meta.changes!==1||results[2]?.meta.changes!==1)throw conflict();
  }catch(error){if(isConstraint(error))throw conflict();if(error instanceof ApiError)throw error;throw unavailable();}
  return findUser(env.DB,id);
}

export async function updateUser(db: D1Database, actor: User, id: string,
  data: { expectedVersion: number; name?: string; role?: Role; active?: boolean }, at: number) {
  const active = data.active === undefined ? null : Number(data.active);
  await write(db, db.prepare(`UPDATE users AS target SET name=COALESCE(?,name),role=COALESCE(?,role),
    active=COALESCE(?,active),version=version+1,updated_at=?
    WHERE id=? AND version=? AND ${managerGuard}
    AND (?!=target.id OR COALESCE(?,target.active)=1)
    AND (target.role!='manager' OR (COALESCE(?,target.role)='manager' AND COALESCE(?,target.active)=1)
      OR (SELECT COUNT(*) FROM users WHERE role='manager' AND active=1)>1)`)
    .bind(data.name ?? null, data.role ?? null, active, at, id, data.expectedVersion,
      actor.id, actor.id, active, data.role ?? null, active));
  return findUser(db, id);
}

export async function updateOwnName(db: D1Database, actor: User, name: string, expectedVersion: number, at: number) {
  await write(db, db.prepare(`UPDATE users SET name=?,version=version+1,updated_at=?
    WHERE id=? AND active=1 AND version=?`).bind(name,at,actor.id,expectedVersion));
  return findUser(db, actor.id);
}

export async function deleteTemporaryUser(db:D1Database,actor:User,targetId:string) {
  if(targetId===actor.id)throw conflict();
  const allowed=await db.prepare(`SELECT u.id FROM users u
    JOIN temporary_accounts t ON t.user_id=u.id
    WHERE u.id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND role='manager')
    AND (SELECT COUNT(*) FROM users WHERE active=1 AND role='manager' AND id!=?)>=1`)
    .bind(targetId,actor.id,targetId).first();
  if(!allowed)throw conflict();
  try {
    await db.prepare("DELETE FROM users WHERE id=? AND EXISTS(SELECT 1 FROM temporary_accounts WHERE user_id=users.id)")
      .bind(targetId).run();
    if(await db.prepare("SELECT id FROM users WHERE id=?").bind(targetId).first())throw conflict();
    await db.prepare("UPDATE org_settings SET revision=revision+1 WHERE id=1").run();
  }catch(error){if(isConstraint(error))throw conflict();if(error instanceof ApiError)throw error;throw unavailable();}
}

export async function createLine(db: D1Database, actor: User, data: { code: string; name: string }) {
  const id = crypto.randomUUID();
  await write(db, db.prepare(`INSERT INTO production_lines (id,code,name)
    SELECT ?,?,? WHERE ${plannerGuard}`).bind(id, data.code, data.name, actor.id));
  return findLine(db, actor, id);
}

export async function updateLine(db: D1Database, actor: User, id: string, data: { name?: string; active?: boolean }) {
  const active = data.active === undefined ? null : Number(data.active);
  await write(db, db.prepare(`UPDATE production_lines SET name=COALESCE(?,name),active=COALESCE(?,active)
    WHERE id=? AND ${managerGuard}`).bind(data.name ?? null, active, id, actor.id));
  return findLine(db, actor, id);
}

export async function changeMember(db: D1Database, actor: User, lineId: string, userId: string, add: boolean) {
  const member = await findUser(db, userId);
  if (add && (!member.active || (member.role !== "line_leader" && member.role !== "assistant"))) throw conflict();
  const existing = await findLine(db, actor, lineId);
  if (existing.memberIds.includes(userId) === add) return existing;
  const statement = add
    ? db.prepare(`INSERT INTO line_members (line_id,user_id) SELECT ?,? WHERE ${managerGuard}
      AND EXISTS (SELECT 1 FROM users WHERE id=? AND active=1 AND role IN ('line_leader','assistant'))
      AND EXISTS (SELECT 1 FROM production_lines WHERE id=? AND active=1)`).bind(lineId, userId, actor.id, userId, lineId)
    : db.prepare(`DELETE FROM line_members WHERE line_id=? AND user_id=? AND ${managerGuard}`).bind(lineId, userId, actor.id);
  await write(db, statement);
  return findLine(db, actor, lineId);
}
