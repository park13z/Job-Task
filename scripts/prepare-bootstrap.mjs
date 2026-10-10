import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const inputSchema=z.strictObject({
  username:z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,32}$/),
  name:z.string().trim().min(1).max(100),
  password:z.string().min(8).max(128),
});
const quoted=value=>`CAST(X'${Buffer.from(value,"utf8").toString("hex")}' AS TEXT)`;

export function prepareBootstrap(input,id=randomUUID(),salt=randomBytes(16)) {
  const {username,name,password}=inputSchema.parse(input);
  z.uuid().parse(id);
  const safeSalt=Buffer.from(salt);
  if(safeSalt.length!==16)throw new Error("Invalid salt");
  const hash=Buffer.from(pbkdf2Sync(password,safeSalt,100000,32,"sha256")).toString("hex");
  const now="CAST(strftime('%s','now') AS INTEGER)*1000";
  // Legacy users.email is a NOT NULL internal column, but never accepts/stores a real email.
  const internalEmail=id+"@job-task.invalid";
  return `-- One-time, guarded first Manager only. DO NOT COMMIT; contains password hash.
INSERT INTO users (id,email,name,role,active,version,created_at,updated_at)
SELECT ${quoted(id)},${quoted(internalEmail)},${quoted(name)},'manager',1,1,${now},${now}
WHERE (SELECT COUNT(*) FROM users)=0 AND EXISTS(SELECT 1 FROM org_settings WHERE id=1);
INSERT INTO user_credentials (user_id,username,password_salt,password_hash,updated_at)
SELECT ${quoted(id)},${quoted(username)},'${safeSalt.toString("hex")}','${hash}',${now}
WHERE EXISTS(SELECT 1 FROM users WHERE id=${quoted(id)})
AND (SELECT COUNT(*) FROM user_credentials)=0;
SELECT u.name,u.role,c.username FROM users u JOIN user_credentials c ON c.user_id=u.id
WHERE u.id=${quoted(id)};
`;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const {values}=parseArgs({options:{username:{type:"string"},name:{type:"string"}},strict:true});
    if(process.stdin.isTTY)throw new Error("Supply the password securely via stdin using setup-first-manager.ps1.");
    const chunks=[];let bytes=0;
    for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>1024)throw new Error("Password input too long");chunks.push(Buffer.from(chunk));}
    const password=Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/,"");
    if(!password)throw new Error("EMPTY_PASSWORD");
    const sql=prepareBootstrap({username:values.username,name:values.name,password});
    const target=fileURLToPath(new URL("../.local/bootstrap-manager.sql",import.meta.url));
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,sql,{mode:0o600,flag:"wx"});
    console.log("Prepared .local/bootstrap-manager.sql (hash only). No D1 writes performed.");
    console.log("Apply only after 0001–0005 migrations and verify before sharing production URL.");
  }catch(error){
    let reason="Bootstrap preparation failed (no D1 writes performed).";
    if(error?.code==="EEXIST")reason="A bootstrap SQL file already exists. Review it before replacing; no D1 writes performed.";
    else if(error?.message==="EMPTY_PASSWORD")reason="No password received through secure stdin. No D1 writes performed.";
    else if(error instanceof z.ZodError){
      const fields=new Set(error.issues.map(issue=>String(issue.path[0])));
      if(fields.has("password"))reason="Password must contain 8 to 128 characters. No D1 writes performed.";
      else if(fields.has("username"))reason="Username must be 2 to 32 letters, numbers, dots, dashes, or underscores. No D1 writes performed.";
      else if(fields.has("name"))reason="Manager display name must contain 1 to 100 characters. No D1 writes performed.";
    }else if(error?.message==="Password input too long")reason="Secure input exceeded the permitted length. No D1 writes performed.";
    else if(error?.message==="Supply the password securely via stdin using setup-first-manager.ps1.")reason="Launch setup-first-manager.ps1 in PowerShell to enter the password securely. No D1 writes performed.";
    console.error(reason);process.exitCode=1;
  }
}
