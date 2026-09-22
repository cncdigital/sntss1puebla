CREATE TABLE IF NOT EXISTS google_drive_oauth_client_configuration (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  client_id TEXT NOT NULL,
  encrypted_client_secret TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  configured_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
