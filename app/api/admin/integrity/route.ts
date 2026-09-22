import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../../authz";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

function cleanMatricula(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 12);
}

function cleanReason(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

type DuplicateRow = {
  applicationId: number;
  workerId: number;
  matricula: string;
  fullName: string;
  folio: string;
  status: string;
  documentStatus: string;
  createdAt: string;
  reviewedAt: string | null;
  documentCount: number;
  validatedDocumentCount: number;
  beneficiaryCount: number;
};

function applicationScore(row: DuplicateRow) {
  return (
    (row.status === "approved" ? 10_000 : row.status === "pending" ? 5_000 : 0) +
    row.validatedDocumentCount * 100 +
    row.documentCount * 10 +
    row.beneficiaryCount +
    row.applicationId / 1_000_000
  );
}

function groupDuplicates(rows: DuplicateRow[]) {
  const groups = new Map<
    number,
    {
      workerId: number;
      matricula: string;
      fullName: string;
      recommendedKeepId: number;
      applications: DuplicateRow[];
    }
  >();
  for (const row of rows) {
    const current = groups.get(row.workerId) || {
      workerId: row.workerId,
      matricula: row.matricula,
      fullName: row.fullName,
      recommendedKeepId: row.applicationId,
      applications: [],
    };
    current.applications.push(row);
    const currentBest = current.applications.find(
      (item) => item.applicationId === current.recommendedKeepId,
    );
    if (!currentBest || applicationScore(row) > applicationScore(currentBest))
      current.recommendedKeepId = row.applicationId;
    groups.set(row.workerId, current);
  }
  return Array.from(groups.values());
}

async function dossier(matricula: string) {
  if (!/^\d{4,12}$/.test(matricula)) return null;
  const worker = await env.DB.prepare(
    `SELECT w.id,w.matricula,w.full_name AS fullName,w.category,w.unit,w.curp,w.nss,
      w.email,w.phone,w.active,w.updated_at AS updatedAt,t.rfc
     FROM workers w LEFT JOIN worker_tax_ids t ON t.matricula=w.matricula
     WHERE w.matricula=? LIMIT 1`,
  )
    .bind(matricula)
    .first<Record<string, unknown>>();
  if (!worker) return null;
  const workerId = Number(worker.id);
  const [applications, beneficiaries, documents, scholarships, clause97, history] =
    await Promise.all([
      env.DB.prepare(
        `SELECT id,folio,status,document_status AS documentStatus,review_notes AS reviewNotes,
          admin_validated AS adminValidated,created_at AS createdAt,reviewed_at AS reviewedAt,
          archived_at AS archivedAt,archived_by AS archivedBy,archive_reason AS archiveReason
         FROM applications WHERE worker_id=? ORDER BY id DESC LIMIT 30`,
      )
        .bind(workerId)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT b.id,b.application_id AS applicationId,b.full_name AS fullName,
          b.relationship,b.curp,b.document_status AS documentStatus,
          b.document_reason AS documentReason,b.active
         FROM beneficiaries b JOIN applications a ON a.id=b.application_id
         WHERE a.worker_id=? ORDER BY b.id DESC LIMIT 100`,
      )
        .bind(workerId)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT d.id,d.application_id AS applicationId,d.beneficiary_id AS beneficiaryId,
          d.kind,d.file_name AS fileName,d.mime_type AS mimeType,d.size_bytes AS sizeBytes,
          d.verification_status AS verificationStatus,d.verification_reason AS verificationReason,
          d.reviewer_notes AS reviewerNotes,d.reviewed_by AS reviewedBy,
          d.reviewed_at AS reviewedAt,d.created_at AS createdAt
         FROM verification_documents d JOIN applications a ON a.id=d.application_id
         WHERE a.worker_id=? ORDER BY d.created_at DESC,d.id DESC LIMIT 150`,
      )
        .bind(workerId)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT e.id,e.folio,e.level,e.child_name AS childName,e.child_curp AS childCurp,
          e.grade_hundredths AS gradeHundredths,e.amount_cents AS amountCents,
          e.deleted_at AS deletedAt,e.created_at AS createdAt,c.name AS campaignName,c.year
         FROM scholarship_entries e JOIN scholarship_campaigns c ON c.id=e.campaign_id
         WHERE e.matricula=? ORDER BY e.created_at DESC,e.id DESC LIMIT 50`,
      )
        .bind(matricula)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT e.id,l.process_type AS processType,l.title,e.status_text AS statusText,
          e.status_updated_at AS statusUpdatedAt,l.reference_label AS referenceLabel
         FROM devi_progress_entries e JOIN devi_progress_lists l ON l.id=e.list_id
         WHERE e.matricula=? AND l.active=1
           AND l.process_type IN ('clausula_97','dispensa_clausula_97')
         ORDER BY l.updated_at DESC,e.id DESC LIMIT 50`,
      )
        .bind(matricula)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT id,actor,action,target_type AS targetType,target_id AS targetId,
          detail,created_at AS createdAt
         FROM audit_logs
         WHERE (target_type='worker' AND target_id=?) OR detail LIKE ?
         ORDER BY id DESC LIMIT 80`,
      )
        .bind(matricula, `%${matricula}%`)
        .all<Record<string, unknown>>(),
    ]);
  return {
    worker,
    applications: applications.results,
    beneficiaries: beneficiaries.results,
    documents: documents.results,
    scholarships: scholarships.results,
    clause97: clause97.results,
    history: history.results,
  };
}

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const matricula = cleanMatricula(
    new URL(request.url).searchParams.get("matricula"),
  );
  const [metrics, duplicateRows, recoveryRows, auditRows, workerDossier] =
    await Promise.all([
      env.DB.prepare(
        `SELECT
          (SELECT COUNT(*) FROM workers WHERE active=1) AS activeWorkers,
          (SELECT COUNT(*) FROM applications WHERE archived_at IS NULL) AS activeApplications,
          (SELECT COUNT(*) FROM applications WHERE archived_at IS NOT NULL) AS archivedApplications,
          (SELECT COUNT(*) FROM applications WHERE archived_at IS NULL AND status='pending') AS pendingApplications,
          (SELECT COUNT(*) FROM verification_documents WHERE verification_status NOT IN ('auto_verified','verified')) AS pendingDocuments,
          (SELECT COUNT(*) FROM applications WHERE archived_at IS NULL AND status='approved' AND document_status='verified') AS validCredentials,
          (SELECT COUNT(*) FROM applications WHERE archived_at IS NULL AND (status<>'approved' OR document_status<>'verified')) AS invalidCredentials,
          (SELECT COUNT(*) FROM (SELECT worker_id FROM applications WHERE archived_at IS NULL GROUP BY worker_id HAVING COUNT(*)>1)) AS duplicateWorkers,
          (SELECT COUNT(*) FROM applications a LEFT JOIN workers w ON w.id=a.worker_id WHERE w.id IS NULL AND a.archived_at IS NULL) AS orphanApplications,
          (SELECT COUNT(*) FROM verification_documents d LEFT JOIN applications a ON a.id=d.application_id WHERE a.id IS NULL) AS orphanDocuments,
          (SELECT COUNT(*) FROM record_recovery WHERE restored_at IS NULL AND restore_until>CURRENT_TIMESTAMP) AS recoverableRecords`,
      ).first<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT a.id AS applicationId,a.worker_id AS workerId,w.matricula,
          w.full_name AS fullName,a.folio,a.status,a.document_status AS documentStatus,
          a.created_at AS createdAt,a.reviewed_at AS reviewedAt,
          (SELECT COUNT(*) FROM verification_documents d WHERE d.application_id=a.id) AS documentCount,
          (SELECT COUNT(*) FROM verification_documents d WHERE d.application_id=a.id AND d.verification_status IN ('auto_verified','verified')) AS validatedDocumentCount,
          (SELECT COUNT(*) FROM beneficiaries b WHERE b.application_id=a.id) AS beneficiaryCount
         FROM applications a JOIN workers w ON w.id=a.worker_id
         WHERE a.archived_at IS NULL AND a.worker_id IN (
           SELECT worker_id FROM applications WHERE archived_at IS NULL
           GROUP BY worker_id HAVING COUNT(*)>1
         )
         ORDER BY w.matricula,a.id DESC LIMIT 150`,
      ).all<DuplicateRow>(),
      env.DB.prepare(
        `SELECT id,target_type AS targetType,target_id AS targetId,matricula,reason,
          archived_by AS archivedBy,archived_at AS archivedAt,restore_until AS restoreUntil
         FROM record_recovery
         WHERE restored_at IS NULL AND restore_until>CURRENT_TIMESTAMP
         ORDER BY archived_at DESC LIMIT 50`,
      ).all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT id,actor,action,target_type AS targetType,target_id AS targetId,
          detail,created_at AS createdAt
         FROM audit_logs ORDER BY id DESC LIMIT 60`,
      ).all<Record<string, unknown>>(),
      dossier(matricula),
    ]);
  return Response.json(
    {
      metrics,
      duplicateGroups: groupDuplicates(duplicateRows.results),
      recovery: recoveryRows.results,
      recentAudit: auditRows.results,
      dossier: workerDossier,
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  if (privilege.mustChangePin)
    return Response.json(
      { error: "Cambia primero la contraseña temporal del perfil protegido." },
      { status: 428, headers: NO_STORE_HEADERS },
    );
  let body: { action?: string; applicationId?: number; recoveryId?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "Solicitud inválida." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (body.action === "archive_duplicate") {
    const applicationId = Number(body.applicationId || 0);
    const reason = cleanReason(body.reason) || "Registro duplicado confirmado por el administrador.";
    const application = await env.DB.prepare(
      `SELECT a.*,w.matricula,w.full_name AS fullName
       FROM applications a JOIN workers w ON w.id=a.worker_id
       WHERE a.id=? AND a.archived_at IS NULL LIMIT 1`,
    )
      .bind(applicationId)
      .first<Record<string, unknown>>();
    if (!application)
      return Response.json(
        { error: "La solicitud ya no está activa." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    const activeCount = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM applications WHERE worker_id=? AND archived_at IS NULL",
    )
      .bind(application.worker_id)
      .first<{ total: number }>();
    if (Number(activeCount?.total || 0) < 2)
      return Response.json(
        { error: "No se puede archivar la única solicitud activa de la matrícula." },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    const [beneficiaries, documents] = await Promise.all([
      env.DB.prepare("SELECT * FROM beneficiaries WHERE application_id=? ORDER BY id")
        .bind(applicationId)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        "SELECT id,application_id,beneficiary_id,kind,storage_key,file_name,mime_type,size_bytes,verification_status,reviewer_notes,reviewed_by,reviewed_at,storage_provider,drive_file_id,drive_folder_id,content_sha256,created_at FROM verification_documents WHERE application_id=? ORDER BY id",
      )
        .bind(applicationId)
        .all<Record<string, unknown>>(),
    ]);
    const recoveryId = crypto.randomUUID();
    const restoreUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const snapshot = JSON.stringify({
      application,
      beneficiaries: beneficiaries.results,
      documents: documents.results,
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO record_recovery
          (id,target_type,target_id,matricula,snapshot_json,reason,archived_by,restore_until)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(
        recoveryId,
        "application",
        String(applicationId),
        application.matricula,
        snapshot,
        reason,
        privilege.actor,
        restoreUntil,
      ),
      env.DB.prepare(
        `UPDATE applications SET archived_at=CURRENT_TIMESTAMP,archived_by=?,archive_reason=?
         WHERE id=? AND archived_at IS NULL`,
      ).bind(privilege.actor, reason, applicationId),
    ]);
    await audit(
      privilege.actor,
      "application.archived_duplicate",
      "application",
      applicationId,
      JSON.stringify({ matricula: application.matricula, reason, recoveryId }),
    );
    return Response.json(
      {
        ok: true,
        message: `El duplicado de la matrícula ${application.matricula} fue archivado sin borrar documentos. Puede restaurarse durante 30 días.`,
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  if (body.action === "restore_application") {
    const recoveryId = String(body.recoveryId || "").trim();
    const recovery = await env.DB.prepare(
      `SELECT id,target_id AS targetId,matricula,restore_until AS restoreUntil
       FROM record_recovery
       WHERE id=? AND target_type='application' AND restored_at IS NULL LIMIT 1`,
    )
      .bind(recoveryId)
      .first<{ id: string; targetId: string; matricula: string; restoreUntil: string }>();
    if (!recovery)
      return Response.json(
        { error: "El registro ya fue restaurado o no existe." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    if (new Date(recovery.restoreUntil).getTime() < Date.now())
      return Response.json(
        { error: "El periodo de recuperación de 30 días ya terminó." },
        { status: 410, headers: NO_STORE_HEADERS },
      );
    const application = await env.DB.prepare(
      "SELECT id,worker_id AS workerId,archived_at AS archivedAt FROM applications WHERE id=? LIMIT 1",
    )
      .bind(Number(recovery.targetId))
      .first<{ id: number; workerId: number; archivedAt: string | null }>();
    if (!application?.archivedAt)
      return Response.json(
        { error: "La solicitud ya está activa." },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    const active = await env.DB.prepare(
      "SELECT * FROM applications WHERE worker_id=? AND archived_at IS NULL LIMIT 1",
    )
      .bind(application.workerId)
      .first<Record<string, unknown>>();
    const statements = [];
    let replacementRecoveryId: string | null = null;
    if (active) {
      replacementRecoveryId = crypto.randomUUID();
      const activeId = Number(active.id);
      const [beneficiaries, documents] = await Promise.all([
        env.DB.prepare("SELECT * FROM beneficiaries WHERE application_id=? ORDER BY id")
          .bind(activeId)
          .all<Record<string, unknown>>(),
        env.DB.prepare(
          "SELECT id,application_id,beneficiary_id,kind,storage_key,file_name,mime_type,size_bytes,verification_status,reviewer_notes,reviewed_by,reviewed_at,storage_provider,drive_file_id,drive_folder_id,content_sha256,created_at FROM verification_documents WHERE application_id=? ORDER BY id",
        )
          .bind(activeId)
          .all<Record<string, unknown>>(),
      ]);
      const replacementReason = `Sustituida al restaurar la solicitud ${application.id}.`;
      statements.push(
        env.DB.prepare(
          `INSERT INTO record_recovery
            (id,target_type,target_id,matricula,snapshot_json,reason,archived_by,restore_until)
           VALUES (?,?,?,?,?,?,?,?)`,
        ).bind(
          replacementRecoveryId,
          "application",
          String(activeId),
          recovery.matricula,
          JSON.stringify({
            application: active,
            beneficiaries: beneficiaries.results,
            documents: documents.results,
          }),
          replacementReason,
          privilege.actor,
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ),
        env.DB.prepare(
          `UPDATE applications SET archived_at=CURRENT_TIMESTAMP,archived_by=?,archive_reason=?
           WHERE id=? AND archived_at IS NULL`,
        ).bind(privilege.actor, replacementReason, activeId),
      );
    }
    statements.push(
      env.DB.prepare(
        "UPDATE applications SET archived_at=NULL,archived_by=NULL,archive_reason=NULL WHERE id=?",
      ).bind(application.id),
      env.DB.prepare(
        "UPDATE record_recovery SET restored_by=?,restored_at=CURRENT_TIMESTAMP WHERE id=?",
      ).bind(privilege.actor, recoveryId),
    );
    await env.DB.batch(statements);
    await audit(
      privilege.actor,
      "application.restored",
      "application",
      application.id,
      JSON.stringify({
        matricula: recovery.matricula,
        recoveryId,
        replacedApplicationRecoveryId: replacementRecoveryId,
      }),
    );
    return Response.json(
      {
        ok: true,
        message: active
          ? `La solicitud de ${recovery.matricula} fue restaurada y la anterior quedó archivada de forma recuperable.`
          : `La solicitud de ${recovery.matricula} fue restaurada.`,
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    { error: "Acción no reconocida." },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}
