import { expect, it } from "vitest";
import { createFixture, TEST_PASSWORD } from "./harness/fixture";

it("rejects missing, forged or expired session cookies", async () => {
  const f=await createFixture();
  try{
    expect((await f.request("/api/me",{user:null})).status).toBe(401);
    expect((await f.request("/api/me",{token:"not-a-valid-token"})).status).toBe(401);
    const expired=await f.token("manager",{expiresIn:-60});
    expect((await f.request("/api/me",{token:expired})).status).toBe(401);
    expect((await f.request("/api/me",{user:"manager"})).status).toBe(200);
    const missing=await f.request("/api/missing");
    expect(missing.status).toBe(404);
  }finally{await f.close();}
});
it("username and password login gives HttpOnly session and logout revokes it",async()=>{
  const f=await createFixture();
  try{
    const wrong=await f.request("/api/auth/login",{user:null,body:{username:"manager",password:"wrong"}});
    expect(wrong.status).toBe(401);
    const response=await f.request("/api/auth/login",{user:null,body:{username:"manager",password:TEST_PASSWORD}});
    expect(response.status).toBe(200);
    const cookie=response.headers.get("set-cookie")??"";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    const token=cookie.match(/__Host-jt_session=([A-Za-z0-9_-]{43})/)?.[1];
    expect(token).toBeTruthy();
    expect((await f.request("/api/me",{token})).status).toBe(200);
    expect((await f.request("/api/auth/logout",{token,body:{}})).status).toBe(200);
    expect((await f.request("/api/me",{token})).status).toBe(401);
  }finally{await f.close();}
});
it("keeps ordinary sessions valid for persistent Live displays while retaining revocation", async () => {
  const f = await createFixture();
  try {
    const signedIn = await f.request("/api/auth/login", {user:null,body:{username:"manager",password:TEST_PASSWORD}});
    expect(signedIn.status).toBe(200);
    const originalCookie = signedIn.headers.get("set-cookie") ?? "";
    expect(originalCookie).toContain("Max-Age=34560000");
    expect(originalCookie).toContain("Secure");
    expect(originalCookie).toContain("HttpOnly");
    const token = originalCookie.match(/__Host-jt_session=([A-Za-z0-9_-]{43})/)?.[1];
    expect(token).toBeTruthy();
    const row = await f.database.prepare("SELECT expires_at FROM auth_sessions WHERE token_hash=?")
      .bind((await import("node:crypto")).createHash("sha256").update(token!).digest("hex"))
      .first<{expires_at:number}>();
    expect(row?.expires_at).toBe(253402300799000);
    const response = await f.request("/api/live", {token});
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=34560000");
    expect(response.headers.get("set-cookie")).toContain("__Host-jt_session="+token);
    const logout = await f.request("/api/auth/logout", {token,body:{}});
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await f.request("/api/me", {token})).status).toBe(401);
  } finally { await f.close(); }
});
it("enables an HTTP-only LAN development cookie only with explicit local opt-in",async()=>{
  const f=await createFixture({localHttpSession:true});
  try{
    const response=await f.request("/api/auth/login",{user:null,body:{username:"manager",password:TEST_PASSWORD}});
    expect(response.status).toBe(200);
    const cookie=response.headers.get("set-cookie")??"";
    expect(cookie).toContain("jt_local_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(cookie).not.toContain("__Host-jt_session");
    const token=cookie.match(/jt_local_session=([A-Za-z0-9_-]{43})/)?.[1];
    expect(token).toBeTruthy();
    const headers={Cookie:"jt_local_session="+token};
    expect((await f.request("/api/me",{user:null,headers})).status).toBe(200);
    expect((await f.request("/api/me",{user:null,headers:{Cookie:"__Host-jt_session="+token}})).status).toBe(401);
    const logout=await f.request("/api/auth/logout",{user:null,headers,body:{}});
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("jt_local_session=; Path=/;");
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await f.request("/api/me",{user:null,headers})).status).toBe(401);
  }finally{await f.close();}
});
it("rejects missing/mismatched origin or wrong media type before writes",async()=>{
  const f=await createFixture();
  try{
    const body={username:"extra",name:"Extra",role:"assistant",password:"LongUserPass123!"};
    for(const [headers,status] of [
      [{Origin:""},403],
      [{Origin:"https://attacker.invalid"},403],
      [{"Content-Type":"text/plain"},415],
    ] as const){
      expect((await f.request("/api/users",{user:"manager",body,headers})).status).toBe(status);
    }
    expect((await f.database.prepare("SELECT COUNT(*) AS n FROM users").first<{n:number}>())?.n).toBe(8);
  }finally{await f.close();}
});

it("allows each signed-in user to change only their own display name", async () => {
  const f = await createFixture();
  try {
    const update = async (user: "manager" | "assistant", body: unknown) =>
      f.request("/api/me", { user, method: "PATCH", body });
    const saved = await update("assistant", { name: "Team Assistant", expectedVersion: 1 });
    expect(saved.status, await saved.clone().text()).toBe(200);
    const result = await saved.json() as { data: { user: { username: string; name: string; role: string; version: number } } };
    expect(result.data.user).toMatchObject({ username: "assistant", name: "Team Assistant", role: "assistant", version: 2 });
    const me = await f.request("/api/me", { user: "assistant" });
    expect((await me.json() as { data: { user: { name: string } } }).data.user.name).toBe("Team Assistant");
    expect((await update("assistant", { name: "Stale", expectedVersion: 1 })).status).toBe(409);
    expect((await update("assistant", { name: "Hijack", expectedVersion: 2, username: "manager" })).status).toBe(400);
    expect((await update("assistant", { name: "Hijack", expectedVersion: 2, role: "manager" })).status).toBe(400);
    expect((await f.request("/api/me", { user: null, method: "PATCH", body: { name: "Nobody", expectedVersion: 1 } })).status).toBe(401);
    expect((await update("manager", { name: "Ex Manager", expectedVersion: 1 })).status).toBe(200);
    const original = await f.database.prepare("SELECT username FROM user_credentials WHERE user_id=?")
      .bind("00000000-0000-4000-8000-000000000001").first<{username:string}>();
    expect(original?.username).toBe("manager");
  } finally { await f.close(); }
});

it("enforces one-use temporary Manager session and account removal",async()=>{
 const f=await createFixture();
 try{
  const create=await f.request("/api/users",{user:"manager",body:{username:"temp",name:"Temporary Manager",role:"manager",password:TEST_PASSWORD}});
  expect(create.status).toBe(201);
  const json=await create.json() as {data:{user:{id:string}}};
  const id=json.data.user.id;
  await f.database.prepare("INSERT INTO temporary_accounts(user_id,expires_at) VALUES(?,?)").bind(id,Date.now()+3600000).run();
  const signin=()=>f.request("/api/auth/login",{user:null,body:{username:"temp",password:TEST_PASSWORD}});
  const first=await signin();
  expect(first.status).toBe(200);
  expect((await signin()).status).toBe(401);
  const t=first.headers.get("set-cookie")?.match(/__Host-jt_session=([A-Za-z0-9_-]{43})/)?.[1];
  expect((await f.request("/api/me",{token:t})).status).toBe(200);
  expect((await f.request("/api/users/"+id,{token:t,method:"DELETE",body:{}})).status).toBe(409);
  const removed=await f.request("/api/users/"+id,{user:"manager",method:"DELETE",body:{}});
  const rows=await f.database.prepare("SELECT COUNT(*) AS n FROM users WHERE id=?").bind(id).first<{n:number}>();
  expect(rows?.n,await removed.text()).toBe(0);
  expect(removed.status).toBe(200);
  expect((await f.request("/api/me",{token:t})).status).toBe(401);
 }finally{await f.close();}
});

it("temporary Manager session expires and normal users cannot be removed through Temp cleanup",async()=>{
 const f=await createFixture();
 try{
  expect((await f.request("/api/users/00000000-0000-4000-8000-000000000005",{user:"manager",method:"DELETE",body:{}})).status).toBe(409);
  const created=await f.request("/api/users",{user:"manager",body:{username:"temp",name:"Temporary",role:"manager",password:TEST_PASSWORD}});
  const obj=await created.json() as {data:{user:{id:string}}};
  const id=obj.data.user.id;
  await f.database.prepare("INSERT INTO temporary_accounts(user_id,expires_at) VALUES(?,?)").bind(id,Date.now()+10000).run();
  const first=await f.request("/api/auth/login",{user:null,body:{username:"temp",password:TEST_PASSWORD}});
  expect(first.status).toBe(200);
  const t=first.headers.get("set-cookie")?.match(/__Host-jt_session=([A-Za-z0-9_-]{43})/)?.[1];
  expect((await f.request("/api/me",{token:t})).status).toBe(200);
  await f.database.prepare("UPDATE temporary_accounts SET expires_at=? WHERE user_id=?").bind(Date.now()-1,id).run();
  expect((await f.request("/api/me",{token:t})).status).toBe(401);
 }finally{await f.close();}
});
