ALTER TABLE role_assignments ADD COLUMN can_chat INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (matricula) REFERENCES workers(matricula)
);

CREATE INDEX IF NOT EXISTS chat_messages_created_idx ON chat_messages(created_at, id);
