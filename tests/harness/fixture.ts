import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

export const TEST_ORIGIN = "http://127.0.0.1:4173";
export const TEST_PASSWORD = "LocalTestPassword123!";
export const USERS = {
  manager: { id:"00000000-0000-4000-8000-000000000001", role:"manager" },
  supervisor: { id:"00000000-0000-4000-8000-000000000002",role:"supervisor" },
  supervisor2: { id:"00000000-0000-4000-8000-000000000003",role:"supervisor" },
  supervisor3: { id:"00000000-0000-4000-8000-000000000004",role:"supervisor" },
  leader: { id:"00000000-0000-4000-8000-000000000005",role:"line_leader" },
  assistant: { id:"00000000-0000-4000-8000-000000000006",role:"assistant" },
  outside: { id:"00000000-0000-4000-8000-000000000007",role:"line_leader" },
  inactive: { id:"00000000-0000-4000-8000-000000000008",role:"assistant" },
} as const;
export type TestUser = keyof typeof USERS;
export const LINES = {
  ckt1a: "10000000-0000-4000-8000-000000000001",
  ckt1b: "10000000-0000-4000-8000-000000000002",
  ckt2ab:"10000000-0000-4000-8000-000000000003",
} as const;
const salt="0123456789abcdef".repeat(2);
const passwordHash=Buffer.from(pbkdf2Sync(TEST_PASSWORD,Buffer.from(salt,"hex"),100_000,32,"sha256")).toString("hex");
const hash=(token:string)=>createHash("sha256").update(token).digest("hex");
type RequestOptions={user?:TestUser|null;method?:string;body?:unknown;key?:string;headers?:Record<string,string>;token?:string};
export async function createFixture(options:{seatBudget?:string;empty?:boolean;localHttpSession?:boolean}={}) {
  const localFixtureSession = options.localHttpSession === true;
  const mf=new Miniflare(convertV4MiniflareOptions({
    scriptPath:fileURLToPath(new URL("../../build/worker.js",import.meta.url)),
    modules:true,compatibilityDate:"2026-10-08",compatibilityFlags:["nodejs_compat"],d1Databases:{DB:"job-task-test"},
    bindings:{USER_LIMIT:options.seatBudget??"500", ...(options.localHttpSession ? {LOCAL_HTTP_SESSION:"true"} : {})},
  }));
  try {
    const database=await mf.getD1Database("DB");
    for(const file of ["0001_initial.sql","0002_job_templates.sql","0003_job_template_lines.sql","0004_native_auth.sql","0005_short_usernames.sql","0006_temporary_accounts.sql","0007_single_active_job_per_line.sql","0008_queue_management.sql","0009_private_live_display.sql"]){
      const sql=await readFile(new URL(`../../migrations/${file}`,import.meta.url),"utf8");
      for(const raw of sql.replace(/\r\n/g,"\n").split(/;\s*\n/)){
        // Strip all leading SQL comments before applying migrations, including
        // the documentation preceding CREATE UNIQUE INDEX in migration 0007.
        const statement = raw.replace(/^(?:\s*--[^\n]*(?:\n|$))+/g,"").trim();
        if(statement && !statement.startsWith("PRAGMA")) await database.prepare(statement).run();
      }
    }
    const tokens={} as Record<TestUser,string>;
    if(!options.empty){
      const now=Date.now()-86400000;
      for(const [username,user] of Object.entries(USERS) as [TestUser,typeof USERS[TestUser]][]){
        await database.prepare("INSERT INTO users(id,email,name,role,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
          .bind(user.id,username+"@job-task.invalid",username,user.role,username==="inactive"?0:1,now,now).run();
        await database.prepare("INSERT INTO user_credentials(user_id,username,password_salt,password_hash,updated_at) VALUES(?,?,?,?,?)")
          .bind(user.id,username,salt,passwordHash,now).run();
        const token=Buffer.from(randomBytes(32)).toString("base64url");
        tokens[username]=token;
        await database.prepare("INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)")
          .bind(hash(token),user.id,now,Date.now()+36e5).run();
      }
      for(const [name,id] of Object.entries(LINES)){
        const code=name==="ckt2ab"?"CKT2A/B":name.toUpperCase();
        await database.prepare("INSERT INTO production_lines(id,code,name) VALUES(?,?,?)").bind(id,code,code).run();
      }
      for(const [line,user] of [[LINES.ckt1a,USERS.leader.id],[LINES.ckt1a,USERS.assistant.id],
        [LINES.ckt1b,USERS.outside.id],[LINES.ckt2ab,USERS.leader.id]]){
        await database.prepare("INSERT INTO line_members(line_id,user_id) VALUES(?,?)").bind(line,user).run();
      }
    }
    async function token(user:TestUser="manager",claims:{expiresIn?:number}={}) {
      const raw=Buffer.from(randomBytes(32)).toString("base64url");
      await database.prepare("INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)")
        .bind(hash(raw),USERS[user].id,Date.now()-300000,Date.now()+(claims.expiresIn??3600)*1000).run();
      return raw;
    }
    async function request(path:string,options:RequestOptions={}) {
      const headers=new Headers(options.headers);
      const raw=options.token??(options.user===null?null:tokens[options.user??"manager"]);
      if(raw)headers.set("Cookie",(localFixtureSession ? "jt_local_session=" : "__Host-jt_session=")+raw);
      if(options.body!==undefined){
        if(!headers.has("Content-Type"))headers.set("Content-Type","application/json");
        if(!headers.has("Origin"))headers.set("Origin",TEST_ORIGIN);
      }
      if(options.key)headers.set("Idempotency-Key",options.key);
      return mf.dispatchFetch(`${TEST_ORIGIN}${path}`,{
        method:options.method??(options.body===undefined?"GET":"POST"),
        headers:Object.fromEntries(headers.entries()),
        body:options.body===undefined?undefined:JSON.stringify(options.body),
      });
    }
    return { database,tokens,token,request,close:()=>mf.dispose() };
  }catch(error){await mf.dispose();throw error;}
}
