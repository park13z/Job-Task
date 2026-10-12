import { z } from "zod";
import { ApiError, forbidden, unavailable } from "./errors";
import { findUser, findUserByUsername } from "./reads";
import type { Env } from "./types";
import type { User } from "../shared/contracts";

// Cloudflare Workers WebCrypto PBKDF2 supports a maximum of 100,000 iterations.
const ITERATIONS = 100_000;
const TEMP_SESSION_MS = 12 * 60 * 60 * 1000;
// Ordinary sessions have no application-level time limit. Browsers cap cookie
// persistence (often at 400 days), so authenticated requests renew the cookie.
const PERSISTENT_SESSION_EXPIRES_AT = 253402300799000; // 9999-12-31 UTC
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const COOKIE = "__Host-jt_session";
const bytes = (v: string) => new TextEncoder().encode(v);
const hex = (v: Uint8Array) => [...v].map(x => x.toString(16).padStart(2,"0")).join("");
function decode(value: string) {
  if (!/^[0-9a-f]+$/.test(value) || value.length % 2) throw unavailable();
  return Uint8Array.from(value.match(/../g) ?? [], item => Number.parseInt(item,16));
}
async function sha256(value: string) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes(value)))); }
async function derive(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", bytes(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations: ITERATIONS },
    key,
    256,
  );
  return hex(new Uint8Array(derived));
}
export const passwordSchema=z.string().min(8).max(128);
export async function hashPassword(password: string) {
  passwordSchema.parse(password);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  return {salt:hex(salt),hash:await derive(password,salt)};
}
async function verify(password: string,salt: string,stored: string) {
  const calculated=decode(await derive(password,decode(salt)));
  const expected=decode(stored);
  let different=calculated.length ^ expected.length;
  for(let i=0;i<32;i++)different|=(calculated[i]??0)^(expected[i]??0);
  return different===0;
}
const sessionRow=z.strictObject({user_id:z.uuid(),expires_at:z.number().int()});
const credentialRow=z.strictObject({password_salt:z.string(),password_hash:z.string(),failed_count:z.number().int(),locked_until:z.number().int()});
const invalid=()=>new ApiError(401,"UNAUTHENTICATED","Invalid username or password.");
const LOCAL_COOKIE = "jt_local_session";
// Explicit opt-in for trusted local HTTP testing only. Production always uses the Secure __Host- cookie.
function useLocalHttpCookie(request: Request, env?: Env) {
  if (env?.LOCAL_HTTP_SESSION !== "true") return false;
  const url = new URL(request.url);
  if (url.protocol !== "http:") return false;
  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  return octets[0] === 10 || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
}
function cookieName(request: Request, env?: Env) {
  return useLocalHttpCookie(request, env) ? LOCAL_COOKIE : COOKIE;
}
function cookieValue(request: Request, env: Env | undefined, token: string, age = COOKIE_MAX_AGE_SECONDS) {
  const local = useLocalHttpCookie(request, env);
  return `${local ? LOCAL_COOKIE : COOKIE}=${token}; Path=/; ${local ? "" : "Secure; "}HttpOnly; SameSite=Lax; Max-Age=${age}`;
}
export const clearCookie = (request: Request, env: Env) => cookieValue(request, env, "", 0);
function cookie(request: Request, env: Env) {
  const name = cookieName(request, env);
  const all = request.headers.get("cookie") ?? "";
  const raw = all.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="))?.slice(name.length + 1);
  return raw && /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;
}
// Refresh browser persistence on authenticated API traffic (not on logout).
export function renewSessionCookie(request: Request, env: Env) {
  const token = cookie(request, env);
  return token ? cookieValue(request, env, token) : null;
}
export async function authenticate(request:Request,env:Env):Promise<User> {
  const token=cookie(request, env);
  if(!token)throw new ApiError(401,"UNAUTHENTICATED","Sign in to continue.");
  const row=await env.DB.prepare(`SELECT s.user_id,s.expires_at FROM auth_sessions s
    LEFT JOIN temporary_accounts t ON t.user_id=s.user_id
    WHERE s.token_hash=? AND (t.user_id IS NULL OR t.expires_at>?)`)
    .bind(await sha256(token),Date.now()).first<unknown>();
  if(!row)throw new ApiError(401,"UNAUTHENTICATED","Session expired. Sign in again.");
  const session=sessionRow.parse(row);
  if(session.expires_at<=Date.now())throw new ApiError(401,"UNAUTHENTICATED","Session expired. Sign in again.");
  const user=await findUser(env.DB,session.user_id).catch(()=>null);
  if(!user?.active)throw forbidden();
  return user;
}
// 5 failed logins per account / 15 minutes; 30 per connecting IP / 15 minutes.
// No trusting user-supplied x-forwarded-for headers.
async function throttle(db:D1Database, username:string,request:Request,at:number) {
  const ip=request.headers.get("cf-connecting-ip")??"unknown";
  const keys=[{key:await sha256("account:"+username),limit:5},{key:await sha256("ip:"+ip),limit:30}];
  for(const {key,limit} of keys) {
    const row=await db.prepare("SELECT count,window_started FROM auth_attempts WHERE identifier=?")
      .bind(key).first<{count:number;window_started:number}>();
    if(row && at-row.window_started<900000 && row.count>=limit)throw invalid();
  }
  return keys;
}
async function fail(db:D1Database,keys:{key:string;limit:number}[],at:number) {
  for(const {key} of keys)await db.prepare(`INSERT INTO auth_attempts(identifier,count,window_started) VALUES (?,1,?)
    ON CONFLICT(identifier) DO UPDATE SET
    count=CASE WHEN ?-window_started>=900000 THEN 1 ELSE count+1 END,
    window_started=CASE WHEN ?-window_started>=900000 THEN ? ELSE window_started END`)
    .bind(key,at,at,at,at).run();
}
export async function login(db:D1Database,request:Request,username:string,password:string,at:number,env?:Env) {
  let stage="throttle";
  try {
    const keys=await throttle(db,username,request,at);
    stage="user-lookup";
    const user=await findUserByUsername(db,username);
    stage="credentials";
    const credential=user?.active?await db.prepare("SELECT password_salt,password_hash,failed_count,locked_until FROM user_credentials WHERE user_id=?")
      .bind(user.id).first<unknown>():null;
    const cred=credential?credentialRow.parse(credential):null;
    stage="password-check";
    if(!cred || cred.locked_until>at || !(await verify(password,cred.password_salt,cred.password_hash))) {
      await fail(db,keys,at);
      throw invalid();
    }
    stage="session";
    const temporary=await db.prepare("SELECT expires_at,used_at FROM temporary_accounts WHERE user_id=?")
      .bind(user!.id).first<{expires_at:number;used_at:number|null}>();
    if(temporary && (temporary.used_at!==null || temporary.expires_at<=at)) throw invalid();
    const token=hex(crypto.getRandomValues(new Uint8Array(32)));
    const cookieToken=Uint8Array.from(token.match(/../g)??[],v=>Number.parseInt(v,16));
    // Base64url gives a fixed-width, unguessable cookie token.
    const raw=btoa(String.fromCharCode(...cookieToken)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
    if (temporary) {
      const expires=Math.min(at+TEMP_SESSION_MS,temporary.expires_at);
      const result=await db.batch([
        db.prepare("UPDATE temporary_accounts SET used_at=? WHERE user_id=? AND used_at IS NULL AND expires_at>?")
          .bind(at,user!.id,at),
        db.prepare(`INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at)
          SELECT ?,?,?,? WHERE EXISTS (
            SELECT 1 FROM temporary_accounts
            WHERE user_id=? AND used_at=? AND expires_at>?
          )`).bind(await sha256(raw),user!.id,at,expires,user!.id,at,at),
      ]);
      if(result[0]?.meta.changes!==1||result[1]?.meta.changes!==1)throw invalid();
      return {cookie:cookieValue(request,env,raw,Math.max(1,Math.floor((expires-at)/1000))),user:user!};
    }
    await db.batch([
      db.prepare("INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)")
        .bind(await sha256(raw),user!.id,at,PERSISTENT_SESSION_EXPIRES_AT),
      db.prepare("DELETE FROM auth_attempts WHERE identifier=?").bind(keys[0].key),
    ]);
    return {cookie:cookieValue(request,env,raw),user:user!};
  } catch (error) {
    // Diagnostic contains only the stage and error class, never username or credentials.
    if (!(error instanceof ApiError && error.status < 500)) {
      console.error("Job Task login error",stage,error instanceof ApiError?error.code:error instanceof Error?error.name:"unknown");
    }
    throw error;
  }
}
export async function logout(db:D1Database,request:Request,env:Env) {
  const token=cookie(request, env);
  if(token)await db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(await sha256(token)).run();
}
export async function changePassword(db:D1Database,user:User,oldPassword:string,newPassword:string,at:number) {
  const cred=await db.prepare("SELECT password_salt,password_hash FROM user_credentials WHERE user_id=?")
    .bind(user.id).first<{password_salt:string;password_hash:string}>();
  if(!cred||!(await verify(oldPassword,cred.password_salt,cred.password_hash)))throw invalid();
  const next=await hashPassword(newPassword);
  await db.batch([
    db.prepare("UPDATE user_credentials SET password_salt=?,password_hash=?,failed_count=0,locked_until=0,updated_at=? WHERE user_id=?")
      .bind(next.salt,next.hash,at,user.id),
    db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(user.id),
  ]);
}
export async function setUserPassword(db:D1Database,userId:string,password:string,at:number) {
  const hash=await hashPassword(password);
  await db.batch([
    db.prepare(`UPDATE user_credentials SET password_salt=?,password_hash=?,
      failed_count=0,locked_until=0,updated_at=? WHERE user_id=?`)
      .bind(hash.salt,hash.hash,at,userId),
    db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(userId),
  ]);
}
export function requireManager(actor:User) {if(actor.role!=="manager")throw forbidden();}
export function requirePlanner(actor:User) {if(actor.role!=="manager"&&actor.role!=="supervisor")throw forbidden();}
