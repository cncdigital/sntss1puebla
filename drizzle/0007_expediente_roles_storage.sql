ALTER TABLE workers ADD COLUMN curp TEXT;
--> statement-breakpoint
ALTER TABLE workers ADD COLUMN email TEXT;
--> statement-breakpoint
ALTER TABLE workers ADD COLUMN phone TEXT;
--> statement-breakpoint
ALTER TABLE workers ADD COLUMN updated_at TEXT;
--> statement-breakpoint
UPDATE workers SET updated_at=CURRENT_TIMESTAMP WHERE updated_at IS NULL;
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN curp TEXT;
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN phone TEXT;
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN profile_photo_key TEXT;
--> statement-breakpoint
UPDATE applications SET profile_photo_key=photo_key WHERE profile_photo_key IS NULL AND photo_key IS NOT NULL;
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN document_status TEXT NOT NULL DEFAULT 'incomplete';
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN social_verified INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN social_email TEXT;
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN social_name TEXT;
--> statement-breakpoint
ALTER TABLE applications ADD COLUMN review_notes TEXT;
--> statement-breakpoint
ALTER TABLE beneficiaries ADD COLUMN curp TEXT;
--> statement-breakpoint
ALTER TABLE beneficiaries ADD COLUMN photo_key TEXT;
--> statement-breakpoint
ALTER TABLE beneficiaries ADD COLUMN document_status TEXT NOT NULL DEFAULT 'incomplete';
--> statement-breakpoint
ALTER TABLE beneficiaries ADD COLUMN document_reason TEXT;
--> statement-breakpoint
ALTER TABLE privileged_accounts ADD COLUMN must_change_pin INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS verification_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  application_id INTEGER NOT NULL,
  beneficiary_id INTEGER,
  kind TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'manual_review',
  match_score INTEGER NOT NULL DEFAULT 0,
  verification_reason TEXT,
  reviewer_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS verification_documents_application_idx ON verification_documents(application_id);
--> statement-breakpoint
INSERT OR IGNORE INTO verification_documents
  (application_id,beneficiary_id,kind,storage_key,file_name,mime_type,size_bytes,
   verification_status,match_score,verification_reason,created_at)
SELECT application_id,NULL,
  CASE document_type WHEN 'tarjeton_pago' THEN 'tarjeton' ELSE document_type END,
  storage_key,file_name,content_type,size_bytes,'manual_review',0,
  'Documento trasladado del expediente anterior; requiere confirmación visual.',uploaded_at
FROM application_documents
WHERE owner_key='titular' AND document_type IN ('ine','tarjeton_pago');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS role_assignments (
  matricula TEXT PRIMARY KEY NOT NULL,
  designation TEXT NOT NULL DEFAULT 'Trabajador/a IMSS',
  credential_style TEXT NOT NULL DEFAULT 'standard',
  can_admin INTEGER NOT NULL DEFAULT 0,
  can_review INTEGER NOT NULL DEFAULT 0,
  can_scan INTEGER NOT NULL DEFAULT 0,
  facilities_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS worker_sessions (
  token TEXT PRIMARY KEY NOT NULL,
  matricula TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS worker_sessions_matricula_idx ON worker_sessions(matricula);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT OR IGNORE INTO facilities (name,active) VALUES
  ('Deportivo La Libertad',1),
  ('Gimnasio',1),
  ('Piscina',1),
  ('Canchas',1),
  ('Deportivo Tehuacán',1),
  ('Actividad especial',1);
--> statement-breakpoint
INSERT OR REPLACE INTO role_assignments
  (matricula,designation,credential_style,can_admin,can_review,can_scan,facilities_json,active,updated_at)
VALUES
  ('99222979','Administrador general','representative',1,1,1,'["Deportivo La Libertad","Gimnasio","Piscina","Canchas","Deportivo Tehuacán","Actividad especial"]',1,CURRENT_TIMESTAMP);
