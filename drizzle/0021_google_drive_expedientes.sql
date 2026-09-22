ALTER TABLE verification_documents
  ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'r2';

ALTER TABLE verification_documents
  ADD COLUMN drive_file_id TEXT;

ALTER TABLE verification_documents
  ADD COLUMN drive_folder_id TEXT;

ALTER TABLE verification_documents
  ADD COLUMN content_sha256 TEXT;

ALTER TABLE verification_documents
  ADD COLUMN legacy_storage_key TEXT;

ALTER TABLE verification_documents
  ADD COLUMN legacy_cleanup_pending INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS verification_documents_storage_provider_idx
  ON verification_documents(storage_provider,kind);

CREATE INDEX IF NOT EXISTS verification_documents_drive_file_idx
  ON verification_documents(drive_file_id);

CREATE TABLE IF NOT EXISTS google_drive_configuration (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  encrypted_refresh_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  account_email TEXT,
  account_name TEXT,
  root_folder_id TEXT NOT NULL,
  root_folder_name TEXT NOT NULL DEFAULT 'Expedientes Credencial SNTSS1',
  connected_by TEXT,
  connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS google_drive_oauth_states (
  state TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS google_drive_oauth_states_expires_idx
  ON google_drive_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS document_storage_cleanup_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_provider TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  drive_file_id TEXT,
  reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(storage_provider,storage_key)
);

CREATE INDEX IF NOT EXISTS document_storage_cleanup_attempts_idx
  ON document_storage_cleanup_queue(attempts,updated_at);
