-- One-time temporary Manager handoff; regular users remain unaffected.
CREATE TABLE temporary_accounts (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL CHECK(expires_at > 0),
  used_at INTEGER CHECK(used_at IS NULL OR used_at > 0)
);
CREATE INDEX temporary_accounts_expires ON temporary_accounts(expires_at);
