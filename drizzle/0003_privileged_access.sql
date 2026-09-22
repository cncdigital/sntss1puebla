CREATE TABLE IF NOT EXISTS privileged_accounts (matricula TEXT PRIMARY KEY, pin_hash TEXT NOT NULL, can_admin INTEGER NOT NULL DEFAULT 0, can_reader INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS privileged_sessions (token TEXT PRIMARY KEY, matricula TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT OR REPLACE INTO privileged_accounts (matricula,pin_hash,can_admin,can_reader,active) VALUES ('99222979','5f0fbfc126a9876e177921aeb69a9705447e5b4f29fc96631ab4ac6d31c62717',1,1,1);
