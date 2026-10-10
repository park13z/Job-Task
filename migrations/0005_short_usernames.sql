CREATE TABLE user_credentials_short (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(username) BETWEEN 2 AND 32 AND username NOT GLOB '*[^a-z0-9._-]*'),
  password_salt TEXT NOT NULL CHECK(length(password_salt)=32),
  password_hash TEXT NOT NULL CHECK(length(password_hash)=64),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK(failed_count>=0),
  locked_until INTEGER NOT NULL DEFAULT 0 CHECK(locked_until>=0),
  updated_at INTEGER NOT NULL CHECK(updated_at>=0)
);
INSERT INTO user_credentials_short(user_id,username,password_salt,password_hash,failed_count,locked_until,updated_at)
SELECT user_id,username,password_salt,password_hash,failed_count,locked_until,updated_at FROM user_credentials;
DROP TABLE user_credentials;
ALTER TABLE user_credentials_short RENAME TO user_credentials;
