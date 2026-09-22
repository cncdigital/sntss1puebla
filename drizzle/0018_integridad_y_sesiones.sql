-- Limpieza conservadora: solo sesiones vencidas o desvinculadas.
DELETE FROM worker_sessions
WHERE expires_at <= CURRENT_TIMESTAMP
   OR NOT EXISTS (
     SELECT 1 FROM workers
     WHERE workers.matricula = worker_sessions.matricula
   );

DELETE FROM privileged_sessions
WHERE expires_at <= CURRENT_TIMESTAMP
   OR NOT EXISTS (
     SELECT 1 FROM privileged_accounts
     WHERE privileged_accounts.matricula = privileged_sessions.matricula
   );

DELETE FROM reader_sessions
WHERE expires_at <= CURRENT_TIMESTAMP
   OR NOT EXISTS (
     SELECT 1 FROM reader_accounts
     WHERE reader_accounts.email = reader_sessions.reader_email
   );

CREATE INDEX IF NOT EXISTS worker_sessions_expires_idx
  ON worker_sessions(expires_at);
CREATE INDEX IF NOT EXISTS privileged_sessions_expires_idx
  ON privileged_sessions(expires_at);
CREATE INDEX IF NOT EXISTS reader_sessions_expires_idx
  ON reader_sessions(expires_at);
