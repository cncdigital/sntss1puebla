CREATE TABLE IF NOT EXISTS privileged_accounts (matricula TEXT PRIMARY KEY, pin_hash TEXT NOT NULL, can_admin INTEGER NOT NULL DEFAULT 0, can_reader INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS privileged_sessions (token TEXT PRIMARY KEY, matricula TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- Las cuentas administrativas se provisionan únicamente en el entorno privado.
