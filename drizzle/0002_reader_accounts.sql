CREATE TABLE IF NOT EXISTS reader_accounts (email TEXT PRIMARY KEY, full_name TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS reader_sessions (token TEXT PRIMARY KEY, reader_email TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO reader_accounts (email,full_name,password_hash,active) VALUES ('lector@sntss1puebla.mx','Personal de acceso','e8ecc3a491c5cd0596bcaa40ae3d3686b4936651e04a2465f8ad22435eb907f8',1);
