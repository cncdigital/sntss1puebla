-- Los registros eliminados conservan su historial, pero dejan libre su consecutivo.
DROP INDEX IF EXISTS scholarship_entries_folio_unique;
DROP INDEX IF EXISTS scholarship_entries_campaign_level_sequence_unique;

-- Reinicia cada nivel de cada jornada desde 000001 y compacta solo registros activos.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY campaign_id,level
      ORDER BY id
    ) AS new_sequence
  FROM scholarship_entries
  WHERE deleted_at IS NULL
)
UPDATE scholarship_entries
SET level_sequence=(
      SELECT ranked.new_sequence FROM ranked
      WHERE ranked.id=scholarship_entries.id
    ),
    folio=substr(folio,1,length(folio)-6) || printf(
      '%06d',
      (SELECT ranked.new_sequence FROM ranked
       WHERE ranked.id=scholarship_entries.id)
    )
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS scholarship_entries_folio_active_unique
  ON scholarship_entries(folio)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS scholarship_entries_campaign_level_sequence_active_unique
  ON scholarship_entries(campaign_id,level,level_sequence)
  WHERE deleted_at IS NULL;
