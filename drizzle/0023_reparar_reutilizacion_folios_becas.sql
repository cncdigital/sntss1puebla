-- Garantiza que un registro eliminado libere folio, nivel, matrícula y CURP.
-- Se eliminan tanto los índices históricos completos como cualquier versión
-- parcial previa para reconstruir una única definición canónica.
DROP INDEX IF EXISTS scholarship_entries_folio_unique;--> statement-breakpoint
DROP INDEX IF EXISTS scholarship_entries_campaign_level_sequence_unique;--> statement-breakpoint
DROP INDEX IF EXISTS scholarship_entries_campaign_worker_level_unique;--> statement-breakpoint
DROP INDEX IF EXISTS scholarship_entries_campaign_child_curp_unique;--> statement-breakpoint
DROP INDEX IF EXISTS scholarship_entries_folio_active_unique;--> statement-breakpoint
DROP INDEX IF EXISTS scholarship_entries_campaign_level_sequence_active_unique;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS scholarship_entries_folio_active_unique
  ON scholarship_entries(folio)
  WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS scholarship_entries_campaign_level_sequence_active_unique
  ON scholarship_entries(campaign_id,level,level_sequence)
  WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS scholarship_entries_campaign_worker_level_unique
  ON scholarship_entries(campaign_id,matricula,level)
  WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS scholarship_entries_campaign_child_curp_unique
  ON scholarship_entries(campaign_id,child_curp)
  WHERE deleted_at IS NULL;
