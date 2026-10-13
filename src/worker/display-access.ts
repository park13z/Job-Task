import { z } from "zod";
import { ApiError, forbidden, notFound, output } from "./errors";
import { findUser, lines } from "./reads";
import { liveJobs } from "./live-queries";
import type { Env } from "./types";
import type { User } from "../shared/contracts";

const COOKIE = "__Host-jt_display";
const LOCAL_COOKIE = "jt_local_display";
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const bytes = (value: string) => new TextEncoder().encode(value);
const hex = (value: Uint8Array) => [...value].map(v => v.toString(16).padStart(2, "0")).join("");
async function hash(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value))));
}
function local(request: Request, env: Env) {
  const url = new URL(request.url);
  return env.LOCAL_HTTP_SESSION === "true" && url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}
function cookieName(request: Request, env: Env) { return local(request, env) ? LOCAL_COOKIE : COOKIE; }
function readToken(request: Request, env: Env) {
  const prefix = cookieName(request, env) + "=";
  const value = request.headers.get("Cookie")?.split(";").map(v => v.trim())
    .find(v => v.startsWith(prefix))?.slice(prefix.length);
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}
export function setDisplayCookie(request: Request, env: Env, token: string) {
  return `${cookieName(request, env)}=${token}; Path=/; ${local(request, env) ? "" : "Secure; "}HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}
type State = "pending" | "approved" | "rejected" | "revoked";
type Device = { id: string; status: State };
async function lookup(db: D1Database, request: Request, env: Env) {
  const token = readToken(request, env);
  if (!token) return null;
  return db.prepare("SELECT id,status FROM display_devices WHERE token_hash=?")
    .bind(await hash(token)).first<Device>();
}
export async function displayStatus(db: D1Database, request: Request, env: Env) {
  return { status: (await lookup(db, request, env))?.status ?? "unregistered" };
}
export async function requestDisplay(db: D1Database, request: Request, env: Env, now: number) {
  const existing = await lookup(db, request, env);
  if (existing?.status === "pending" || existing?.status === "approved") {
    return { status: existing.status, token: readToken(request, env)! };
  }
  const origin = new URL(request.url).host;
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const ipHash = await hash(origin + ":" + ip);
  const count = await db.prepare("SELECT count(*) AS n FROM display_devices WHERE ip_hash=? AND created_at>?")
    .bind(ipHash, now - 60 * 60 * 1000).first<{n:number}>();
  if ((count?.n ?? 0) >= 5) throw new ApiError(403, "FORBIDDEN", "Too many display requests. Contact the Manager.");
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare(`INSERT INTO display_devices(id,token_hash,ip_hash,browser,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),await hash(token),ipHash,
      (request.headers.get("User-Agent") ?? "Unknown browser").slice(0,160),
      "pending",now,now).run();
  return { status: "pending" as const, token };
}
export async function approvedDisplay(db: D1Database, request: Request, env: Env) {
  if ((await lookup(db, request, env))?.status !== "approved") throw forbidden();
}
export async function displaySnapshot(db: D1Database, request: Request, env: Env, now: number) {
  await approvedDisplay(db, request, env);
  // Use the same server-side Live query and line projection as the regular Manager.
  // Browser display cookies are never accepted by the employee API.
  const row = await db.prepare("SELECT id FROM users WHERE active=1 AND role='manager' ORDER BY id LIMIT 1").first<{ id: string }>();
  if (!row) throw forbidden();
  const actor = await findUser(db, row.id);
  const [live, visible] = await Promise.all([liveJobs(db, actor, now), lines(db, actor)]);
  return { live, lines: visible.map(line => ({ ...line, memberIds: [] })) };
}
const listedDevice = z.strictObject({
  id: z.uuid(), status: z.enum(["pending","approved","rejected","revoked"]),
  browser: z.string(), createdAt: z.int(), updatedAt: z.int(),
  approvedAt: z.int().nullable(), approvedBy: z.string().nullable(),
});
export async function listDisplays(db: D1Database) {
  const rows = await db.prepare(`SELECT d.id,d.status,d.browser,d.created_at AS createdAt,
    d.updated_at AS updatedAt,d.approved_at AS approvedAt,u.name AS approvedBy
    FROM display_devices d LEFT JOIN users u ON u.id=d.approved_by
    ORDER BY CASE d.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,d.created_at DESC LIMIT 100`).all<unknown>();
  return { devices: output(z.array(listedDevice), rows.results) };
}
export async function decideDisplay(db: D1Database, actor: User, id: string, action: "approve"|"reject"|"revoke", now: number) {
  if (actor.role !== "manager") throw forbidden();
  const next = action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked";
  const previous = action === "revoke" ? "approved" : "pending";
  const updated = await db.prepare(`UPDATE display_devices SET status=?,updated_at=?,
    approved_by=CASE WHEN ?='approve' THEN ? ELSE approved_by END,
    approved_at=CASE WHEN ?='approve' THEN ? ELSE approved_at END
    WHERE id=? AND status=?`).bind(next,now,action,actor.id,action,now,id,previous).run();
  if (updated.meta.changes !== 1) throw notFound();
}
