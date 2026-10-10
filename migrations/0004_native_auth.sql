-- Additive first-party password login. No data migration or default credentials.
CREATE TABLE user_credentials (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(username) BETWEEN 3 AND 32 AND username NOT GLOB '*[^a-z0-9._-]*'),
  password_salt TEXT NOT NULL CHECK(length(password_salt)=32),
  password_hash TEXT NOT NULL CHECK(length(password_hash)=64),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK(failed_count>=0),
  locked_until INTEGER NOT NULL DEFAULT 0 CHECK(locked_until>=0),
  updated_at INTEGER NOT NULL CHECK(updated_at>=0)
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL CHECK(created_at>=0),
  expires_at INTEGER NOT NULL CHECK(expires_at>created_at)
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiration ON auth_sessions(expires_at);
CREATE TABLE auth_attempts (
  identifier TEXT PRIMARY KEY NOT NULL CHECK(length(identifier)=64),
  count INTEGER NOT NULL DEFAULT 0 CHECK(count>=0),
  window_started INTEGER NOT NULL CHECK(window_started>=0)
);
