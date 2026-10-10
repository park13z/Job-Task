import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const username = "temp";
const accountKey = createHash("sha256").update("account:" + username).digest("hex");

export function tempRearmSql(password, salt = randomBytes(16)) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new Error("PASSWORD_LENGTH");
  }
  const safeSalt = Buffer.from(salt);
  if (safeSalt.length !== 16) throw new Error("SALT");
  const hash = pbkdf2Sync(password, safeSalt, 100_000, 32, "sha256").toString("hex");
  const at = "CAST(strftime('%s','now') AS INTEGER)*1000";
  const guard = `EXISTS(SELECT 1 FROM users u JOIN user_credentials c ON c.user_id=u.id
    JOIN temporary_accounts t ON t.user_id=u.id WHERE c.username='temp' AND u.role='manager' AND u.active=1)
    AND (SELECT COUNT(*) FROM users WHERE role='manager' AND active=1)=1`;
  return `-- Temp Manager recovery only; contains a HASH, never plaintext. Keep in .local.
UPDATE user_credentials SET password_salt='${safeSalt.toString("hex")}',password_hash='${hash}',
  failed_count=0,locked_until=0,updated_at=${at}
WHERE username='temp' AND ${guard};
UPDATE temporary_accounts SET used_at=NULL,expires_at=${at}+3600000
WHERE user_id=(SELECT user_id FROM user_credentials WHERE username='temp') AND ${guard};
DELETE FROM auth_sessions WHERE user_id=(SELECT user_id FROM user_credentials WHERE username='temp');
DELETE FROM auth_attempts WHERE identifier='${accountKey}';
SELECT c.username,u.role,u.active,t.used_at,t.expires_at,length(c.password_hash) AS hash_length
FROM users u JOIN user_credentials c ON c.user_id=u.id
JOIN temporary_accounts t ON t.user_id=u.id WHERE c.username='temp';
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.stdin.isTTY) throw new Error("INPUT_REQUIRED");
    const chunks=[];let total=0;
    for await (const chunk of process.stdin) {
      total+=chunk.length;
      if (total>1024) throw new Error("PASSWORD_LENGTH");
      chunks.push(Buffer.from(chunk));
    }
    const password=Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/,"");
    const sql=tempRearmSql(password);
    const path=fileURLToPath(new URL("../.local/temp-manager-rearm.sql",import.meta.url));
    await mkdir(dirname(path),{recursive:true});
    await writeFile(path,sql,{mode:0o600,flag:"wx"});
    console.log("Prepared .local/temp-manager-rearm.sql (hash only). No D1 changes yet.");
  } catch(error) {
    const reason=error?.code==="EEXIST"
      ? "A Temp rearm file already exists; it must be reviewed before repeating."
      : error?.message==="PASSWORD_LENGTH" ? "Password must have 8–128 characters."
      : "Could not prepare Temp rearm with secure input.";
    console.error(reason + " No D1 changes performed.");process.exitCode=1;
  }
}
