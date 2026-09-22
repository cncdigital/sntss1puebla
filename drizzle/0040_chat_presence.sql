CREATE TABLE IF NOT EXISTS chat_presence (
  matricula TEXT PRIMARY KEY,
  is_ghost INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (matricula) REFERENCES workers(matricula)
);

CREATE INDEX IF NOT EXISTS chat_presence_last_seen_idx ON chat_presence(last_seen_at);
