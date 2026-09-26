ALTER TABLE worker_passwords ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE worker_passwords ADD COLUMN temporary_expires_at TEXT;

CREATE INDEX IF NOT EXISTS worker_passwords_temporary_idx
  ON worker_passwords(temporary_expires_at);
