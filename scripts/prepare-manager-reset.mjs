import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const literal = value => `CAST(X'${Buffer.from(value, "utf8").toString("hex")}' AS TEXT)`;
const accountHash = username => createHash("sha256").update("account:" + username).digest("hex");

export function prepareManagerReset({ username, password }, salt = randomBytes(16)) {
  const normalized = typeof username === "string" ? username.trim().toLowerCase() : "";
  if (!/^[a-z0-9._-]{2,32}$/.test(normalized)) throw new Error("INVALID_USERNAME");
  if (typeof password !== "string" || password.length < 8 || password.length > 128) throw new Error("INVALID_PASSWORD");
  const safeSalt = Buffer.from(salt);
  if (safeSalt.length !== 16) throw new Error("INVALID_SALT");
  const derived = pbkdf2Sync(password, safeSalt, 100_000, 32, "sha256").toString("hex");
  const name = literal(normalized);
  return `-- One-time Manager credential rehash for Cloudflare PBKDF2 limit. Do NOT commit.
-- Applies only if this is still the single active Manager in the initial D1.
UPDATE user_credentials
SET password_salt='${safeSalt.toString("hex")}',password_hash='${derived}',
    failed_count=0,locked_until=0,
    updated_at=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE username=${name}
AND (SELECT COUNT(*) FROM users)=1
AND EXISTS(SELECT 1 FROM users WHERE id=user_credentials.user_id AND role='manager' AND active=1);
DELETE FROM auth_attempts WHERE identifier='${accountHash(normalized)}'
AND (SELECT COUNT(*) FROM users)=1;
DELETE FROM auth_sessions WHERE user_id IN (
  SELECT u.id FROM users u JOIN user_credentials c ON c.user_id=u.id
  WHERE c.username=${name} AND u.role='manager' AND u.active=1
) AND (SELECT COUNT(*) FROM users)=1;
SELECT c.username,u.role,u.active,length(c.password_hash) AS hash_length
FROM user_credentials c JOIN users u ON u.id=c.user_id WHERE c.username=${name};
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { username: { type:"string" } }, strict:true });
    if (process.stdin.isTTY) throw new Error("STDIN");
    const chunks=[];let length=0;
    for await (const chunk of process.stdin) {
      length+=chunk.length;
      if(length>1024) throw new Error("LENGTH");
      chunks.push(Buffer.from(chunk));
    }
    const password=Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/,"");
    const sql=prepareManagerReset({ username:values.username, password });
    const target=fileURLToPath(new URL("../.local/manager-ex-credential-rehash.sql",import.meta.url));
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,sql,{mode:0o600,flag:"wx"});
    console.log("Prepared .local/manager-ex-credential-rehash.sql (salted hash only).");
    console.log("No changes to Cloudflare D1. Do not commit this file.");
  } catch(error) {
    let reason="Preparation failed. No D1 changes.";
    if(error?.code==="EEXIST") reason="Reset file already exists. Have the operator review it; no D1 changes.";
    else if(error?.message==="INVALID_USERNAME") reason="Username must be 2–32 letters/numbers/dots/dashes/underscores. No D1 changes.";
    else if(error?.message==="INVALID_PASSWORD") reason="Password must be 8–128 characters. No D1 changes.";
    else if(error?.message==="STDIN") reason="Use reset-manager-password.ps1 for the secure prompt. No D1 changes.";
    console.error(reason); process.exitCode=1;
  }
}
