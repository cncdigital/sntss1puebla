-- Limpieza autorizada de asignaciones de prueba de la matrícula 99222979.
-- Se conserva la trazabilidad, pero los registros dejan de contar como activos.
INSERT INTO audit_logs (actor,action,target_type,target_id,detail)
SELECT
  'system:authorized-cleanup',
  'scholarship.test-entry.cleared',
  'scholarship_entry',
  CAST(id AS TEXT),
  folio || ' · matrícula 99222979 · limpieza de pruebas'
FROM scholarship_entries
WHERE matricula='99222979' AND deleted_at IS NULL;

UPDATE scholarship_entries
SET deleted_at=CURRENT_TIMESTAMP,
    deleted_by='system:authorized-cleanup',
    deletion_reason='Limpieza autorizada de registros de prueba'
WHERE matricula='99222979' AND deleted_at IS NULL;
