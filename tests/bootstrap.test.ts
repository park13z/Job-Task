import { expect,it } from "vitest";
import { prepareBootstrap } from "../scripts/prepare-bootstrap.mjs";
import { prepareManagerReset } from "../scripts/prepare-manager-reset.mjs";
import { tempRearmSql } from "../scripts/prepare-temp-rearm.mjs";
import { createFixture } from "./harness/fixture";

const id="20000000-0000-4000-8000-000000000001";
const pass="Abc12345";
async function apply(db:D1Database,sql:string){
  for(const statement of sql.split(/;\s*\n/).map(s=>s.trim()).filter(Boolean))
    await db.prepare(statement).run();
}
it("prepares salted, one-time Manager username and password credentials without plaintext",async()=>{
  const f=await createFixture({empty:true});
  try{
    const sql=prepareBootstrap({username:" Ex ",name:"Production Manager",password:pass},id);
    expect(sql).not.toContain(pass);
    expect(sql).not.toContain("@example.");
    await apply(f.database,sql);
    expect((await f.database.prepare("SELECT COUNT(*) AS n FROM users").first<{n:number}>())?.n).toBe(1);
    const row=await f.database.prepare("SELECT username,password_hash,password_salt FROM user_credentials")
      .first<{username:string;password_hash:string;password_salt:string}>();
    expect(row?.username).toBe("ex");
    expect(row?.password_hash).toHaveLength(64);
    expect(row?.password_salt).toHaveLength(32);
    const login=await f.request("/api/auth/login",{user:null,body:{username:"ex",password:pass}});
    expect(login.status).toBe(200);
    await apply(f.database,prepareBootstrap({username:"another",name:"Another",password:pass}));
    expect((await f.database.prepare("SELECT COUNT(*) AS n FROM users").first<{n:number}>())?.n).toBe(1);
  }finally{await f.close();}
});
it("refuses missing or unsafe bootstrap input",()=>{
  expect(()=>prepareBootstrap({username:"a",name:"Manager",password:pass})).toThrow();
  expect(()=>prepareBootstrap({username:"alice",name:"",password:pass})).toThrow();
  expect(()=>prepareBootstrap({username:"alice",name:"Manager",password:"1234567"})).toThrow();
  expect(()=>prepareBootstrap({username:"alice",name:"Manager",password:"Abc12345"})).not.toThrow();
  expect(()=>prepareBootstrap({username:"alice",name:"Manager",password:pass},"not-a-uuid")).toThrow();
});

it("re-hashes an existing single Manager's same password to Cloudflare-supported PBKDF2, revokes sessions", async () => {
  const f=await createFixture({empty:true});
  try {
    const existing="ExCurrentPassword8!";
    const candidate="ExCurrentPassword8!";
    await apply(f.database, prepareBootstrap({username:"Ex",name:"Manager",password:existing},id));
    const token=await f.database.prepare("SELECT token_hash FROM auth_sessions").first();
    expect(token).toBeNull();
    const session=await f.request("/api/auth/login",{user:null,body:{username:"ex",password:existing}});
    expect(session.status).toBe(200);
    const originalCookie=session.headers.get("set-cookie")?.match(/__Host-jt_session=([A-Za-z0-9_-]{43})/)?.[1];
    expect(originalCookie).toBeTruthy();
    const sql=prepareManagerReset({username:"Ex",password:candidate},Buffer.alloc(16,42));
    expect(sql).not.toContain(candidate);
    expect(sql).toContain("UPDATE user_credentials");
    await apply(f.database,sql);
    expect((await f.request("/api/me",{token:originalCookie})).status).toBe(401);
    expect((await f.request("/api/auth/login",{user:null,body:{username:"ex",password:candidate}})).status).toBe(200);
    expect((await f.database.prepare("SELECT COUNT(*) AS n FROM users").first<{n:number}>())?.n).toBe(1);
  } finally {await f.close();}
});

it("rearms single temporary Manager with new salted credential and creates one D1 session", async () => {
  const f=await createFixture({empty:true});
  try {
    const password="TempPrivatePassword2026!";
    await apply(f.database,prepareBootstrap({username:"temp",name:"Temporary Manager",password:"OldPasswordOnly8"},id));
    await f.database.prepare("INSERT INTO temporary_accounts (user_id,expires_at,used_at) VALUES (?,?,?)")
      .bind(id,Date.now()+600000,Date.now()-1000).run();
    expect((await f.request("/api/auth/login",{user:null,body:{username:"temp",password}})).status).toBe(401);
    const sql=tempRearmSql(password,Buffer.alloc(16,21));
    expect(sql).not.toContain(password);
    await apply(f.database,sql);
    const state=await f.database.prepare("SELECT used_at,expires_at FROM temporary_accounts WHERE user_id=?")
      .bind(id).first<{used_at:number|null;expires_at:number}>();
    expect(state?.used_at).toBeNull();
    expect(state?.expires_at).toBeGreaterThan(Date.now());
    const first=await f.request("/api/auth/login",{user:null,body:{username:"temp",password}});
    expect(first.status,await first.clone().text()).toBe(200);
    const cookie=first.headers.get("set-cookie")?.match(/__Host-jt_session=([A-Za-z0-9_-]{43})/)?.[1];
    expect(cookie).toBeTruthy();
    expect((await f.database.prepare("SELECT COUNT(*) AS n FROM auth_sessions").first<{n:number}>())?.n).toBe(1);
    expect((await f.request("/api/me",{token:cookie})).status).toBe(200);
    expect((await f.request("/api/auth/login",{user:null,body:{username:"temp",password}})).status).toBe(401);
  } finally { await f.close(); }
});
