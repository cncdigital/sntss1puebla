import { env } from "cloudflare:workers";
import { getCredentialValidity } from "../credential-validity";
import { normalizeCredentialToken } from "../../credential-token";
import { ensureScholarshipSchema, normalizeScholarshipCurp } from "./schema";

export class ScholarshipAccessError extends Error {
  status: number;
  details: Record<string, unknown>;

  constructor(message: string, status = 400, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type ScholarshipCampaign = {
  id: number;
  name: string;
  year: number;
  season: string;
};

type ScholarshipWorker = {
  applicationId: number;
  credentialToken: string;
  kind: "Titular" | "Beneficiario";
  fullName: string;
  matricula: string;
  adscription: string | null;
  curp: string | null;
  rfc: string | null;
};

type ScholarshipChildRow = {
  id: number;
  fullName: string;
  curp: string | null;
  existingFolio: string | null;
  existingLevel: string | null;
  existingWorkerName: string | null;
  existingMatricula: string | null;
  existingWorkerCurp: string | null;
};

export async function validateScholarshipCredential(
  campaignId: number,
  rawToken: string,
) {
  await ensureScholarshipSchema();
  const campaign = await env.DB.prepare(
    `SELECT id,name,year,season FROM scholarship_campaigns
     WHERE id=? AND active=1`,
  )
    .bind(campaignId)
    .first<ScholarshipCampaign>();
  if (!campaign)
    throw new ScholarshipAccessError(
      "La jornada de becas no existe o ya fue cerrada.",
      404,
    );

  const token = normalizeCredentialToken(rawToken);
  if (!token)
    throw new ScholarshipAccessError(
      "Escanea o captura el código QR del trabajador titular.",
    );

  const worker = await env.DB.prepare(
    `SELECT a.id AS applicationId,a.credential_token AS credentialToken,
      'Titular' AS kind,w.full_name AS fullName,w.matricula,
      w.unit AS adscription,COALESCE(a.curp,w.curp) AS curp,wt.rfc
     FROM applications a
     JOIN workers w ON w.id=a.worker_id
     LEFT JOIN worker_tax_ids wt ON wt.matricula=w.matricula
     WHERE a.credential_token=? AND a.status='approved' AND a.archived_at IS NULL
     UNION ALL
     SELECT a.id AS applicationId,b.credential_token AS credentialToken,
      'Beneficiario' AS kind,b.full_name AS fullName,w.matricula,
      w.unit AS adscription,b.curp,wt.rfc
     FROM beneficiaries b
     JOIN applications a ON a.id=b.application_id
     JOIN workers w ON w.id=a.worker_id
     LEFT JOIN worker_tax_ids wt ON wt.matricula=w.matricula
     WHERE b.credential_token=? AND b.active=1 AND a.status='approved' AND a.archived_at IS NULL
     LIMIT 1`,
  )
    .bind(token, token)
    .first<ScholarshipWorker>();
  if (!worker)
    throw new ScholarshipAccessError(
      "Credencial no válida, inactiva o inexistente.",
      404,
    );
  if (worker.kind !== "Titular")
    throw new ScholarshipAccessError(
      "Para Becas Sinabeth debes escanear la credencial del trabajador titular.",
      403,
    );

  const validity = await getCredentialValidity(worker.applicationId);
  if (!validity.valid)
    throw new ScholarshipAccessError(
      `CREDENCIAL NO VÁLIDA: ${validity.reason}`,
      403,
    );

  const [childRows, usedLevels] = await Promise.all([
    env.DB.prepare(
      `SELECT b.id,b.full_name AS fullName,b.curp,
        entry.folio AS existingFolio,entry.level AS existingLevel,
        entry.worker_name AS existingWorkerName,
        entry.matricula AS existingMatricula,
        entry.worker_curp AS existingWorkerCurp
       FROM beneficiaries b
       LEFT JOIN scholarship_entries entry
         ON entry.campaign_id=? AND entry.deleted_at IS NULL
           AND entry.child_curp=UPPER(REPLACE(TRIM(b.curp),' ',''))
       WHERE b.application_id=? AND b.active=1 AND b.relationship='Hijo/a'
       ORDER BY b.full_name`,
    )
      .bind(campaign.id, worker.applicationId)
      .all<ScholarshipChildRow>(),
    env.DB.prepare(
      `SELECT level,folio,child_name AS childName,child_curp AS childCurp
       FROM scholarship_entries
       WHERE campaign_id=? AND matricula=? AND deleted_at IS NULL
       ORDER BY level`,
    )
      .bind(campaign.id, worker.matricula)
      .all<{
        level: string;
        folio: string;
        childName: string;
        childCurp: string;
      }>(),
  ]);

  if (!childRows.results.length)
    throw new ScholarshipAccessError(
      "La credencial del titular no tiene hijos activos y validados para asignar una beca.",
      422,
    );

  return {
    campaign,
    worker: {
      ...worker,
      curp: normalizeScholarshipCurp(worker.curp) || null,
    },
    children: childRows.results.map((child: ScholarshipChildRow) => ({
      id: child.id,
      fullName: child.fullName,
      curp: normalizeScholarshipCurp(child.curp) || null,
      alreadyRegistered: Boolean(child.existingFolio),
      existing: child.existingFolio
        ? {
            folio: child.existingFolio,
            level: child.existingLevel,
            workerName: child.existingWorkerName,
            matricula: child.existingMatricula,
            workerCurp: child.existingWorkerCurp,
            childCurp: normalizeScholarshipCurp(child.curp),
          }
        : null,
    })),
    usedLevels: usedLevels.results,
  };
}

export function scholarshipAccessErrorResponse(error: unknown) {
  if (error instanceof ScholarshipAccessError)
    return Response.json(
      { error: error.message, ...error.details },
      { status: error.status },
    );
  return Response.json(
    { error: "No fue posible validar la credencial para Becas Sinabeth." },
    { status: 500 },
  );
}
