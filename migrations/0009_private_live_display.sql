-- An approval is tied to a browser's private cookie, never to the permanent URL.
CREATE TABLE display_devices (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  ip_hash TEXT NOT NULL CHECK(length(ip_hash)=64),
  browser TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','revoked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  approved_by TEXT REFERENCES users(id),
  approved_at INTEGER
);
CREATE INDEX display_devices_by_status ON display_devices(status,created_at DESC);
CREATE INDEX display_devices_ip_window ON display_devices(ip_hash,created_at);
