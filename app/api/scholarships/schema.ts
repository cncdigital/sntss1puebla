export const SCHOLARSHIP_LEVELS = [
  { label: "Primaria", code: "PRI", amountCents: 45_000 },
  { label: "Secundaria", code: "SEC", amountCents: 50_000 },
  {
    label: "Bachillerato o Preparatoria",
    code: "BAC",
    amountCents: 55_000,
  },
  { label: "Licenciatura", code: "LIC", amountCents: 60_000 },
  { label: "Especial", code: "ESP", amountCents: 50_000 },
] as const;

export type ScholarshipLevel = (typeof SCHOLARSHIP_LEVELS)[number]["label"];

export function scholarshipLevel(value: string | null | undefined) {
  return SCHOLARSHIP_LEVELS.find((level) => level.label === value) || null;
}

export function normalizeScholarshipCurp(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, "").trim().toUpperCase();
}

export function scholarshipSeasonCode(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toUpperCase()
      .slice(0, 18) || "TEMPORADA"
  );
}

export function scholarshipCampaignDatabaseKey(campaignId: number) {
  const normalizedId = Math.max(0, Math.trunc(Number(campaignId) || 0));
  return `BECAS-CAMP-${String(normalizedId).padStart(6, "0")}`;
}

export const NEXT_REUSABLE_SCHOLARSHIP_SEQUENCE_SQL = `
  SELECT COALESCE(MIN(candidate),1) AS nextSequence
  FROM (
    SELECT 1 AS candidate
    UNION ALL
    SELECT level_sequence+1 AS candidate
    FROM scholarship_entries
    WHERE campaign_id=? AND level=? AND deleted_at IS NULL
  ) candidates
  WHERE NOT EXISTS (
    SELECT 1 FROM scholarship_entries existing
    WHERE existing.campaign_id=? AND existing.level=?
      AND existing.deleted_at IS NULL
      AND existing.level_sequence=candidates.candidate
  )`;

export const INSERT_SCHOLARSHIP_ENTRY_SQL = `
  WITH next_sequence(value) AS (
    SELECT COALESCE(MIN(candidate),1)
    FROM (
      SELECT 1 AS candidate
      UNION ALL
      SELECT level_sequence+1 AS candidate
      FROM scholarship_entries
      WHERE campaign_id=? AND level=? AND deleted_at IS NULL
    ) candidates
    WHERE NOT EXISTS (
      SELECT 1 FROM scholarship_entries existing
      WHERE existing.campaign_id=? AND existing.level=?
        AND existing.deleted_at IS NULL
        AND existing.level_sequence=candidates.candidate
    )
  )
  INSERT INTO scholarship_entries
    (campaign_id,application_id,credential_token,folio,level,level_sequence,
     amount_cents,worker_name,matricula,adscription,worker_curp,rfc,
     child_beneficiary_id,child_name,child_curp,grade_hundredths,reader_actor)
  SELECT ?,?,?,? || printf('%06d',value),?,value,?,?,?,?,?,?,?,?,?,?,?
  FROM next_sequence
  RETURNING id,folio,level,level_sequence AS levelSequence,
    amount_cents AS amountCents,worker_name AS workerName,matricula,
    adscription,worker_curp AS workerCurp,rfc,
    child_name AS childName,child_curp AS childCurp,
    grade_hundredths AS gradeHundredths,created_at AS createdAt`;

export function ensureScholarshipSchema() {
  // Las tablas e índices pertenecen a las migraciones. Evitamos ejecutar DDL
  // durante cada lectura para que las consultas normales no saturen D1.
  return Promise.resolve();
}
