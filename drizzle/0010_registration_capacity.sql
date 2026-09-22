ALTER TABLE verification_documents ADD COLUMN client_upload_id TEXT;

ALTER TABLE beneficiaries ADD COLUMN client_reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS beneficiaries_application_client_reference_unique
  ON beneficiaries(application_id, client_reference)
  WHERE client_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS verification_documents_client_upload_id_unique
  ON verification_documents(client_upload_id)
  WHERE client_upload_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS registration_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket TEXT NOT NULL UNIQUE,
  matricula TEXT NOT NULL,
  application_id INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  files_total INTEGER NOT NULL DEFAULT 0,
  files_uploaded INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  admitted_at TEXT,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS registration_queue_status_created_idx
  ON registration_queue(status, created_at, id);

CREATE INDEX IF NOT EXISTS registration_queue_matricula_idx
  ON registration_queue(matricula, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS registration_queue_one_open_per_worker_idx
  ON registration_queue(matricula)
  WHERE status IN ('queued', 'active');
