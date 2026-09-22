import { env } from "cloudflare:workers";
import type { HybridDeviReply } from "../../devi/ai";
import type { DeviSource } from "../../devi/knowledge";
import { getCredentialValidity } from "../credential-validity";

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectsPersonalStatus(message: string) {
  const text = normalized(message);
  return /\b(mi credencial|estatus de mi credencial|estado de mi credencial|mis documentos|documentos de mi credencial|mi expediente|mi beca|mis becas|folio de mi beca)\b/.test(
    text,
  );
}

function localReply(answer: string, sources: DeviSource[]): HybridDeviReply {
  return { mode: "knowledge", answer, sources, engine: "local" };
}

function readableStatus(value: string) {
  const labels: Record<string, string> = {
    approved: "aprobada",
    pending: "pendiente de revisión",
    draft: "en captura o corrección",
    rejected: "con correcciones solicitadas",
    verified: "validado",
    manual_review: "en revisión manual",
    incomplete: "incompleto",
    updating: "en actualización",
    revalidation: "en revalidación",
  };
  return labels[value] || value || "sin estado";
}

export async function answerPersonalStatus(
  message: string,
  matricula: string,
): Promise<HybridDeviReply | null> {
  if (!detectsPersonalStatus(message)) return null;
  const application = await env.DB.prepare(
    `SELECT a.id,a.folio,a.status,a.document_status AS documentStatus,
      a.review_notes AS reviewNotes,a.reviewed_at AS reviewedAt,
      (SELECT COUNT(*) FROM verification_documents d WHERE d.application_id=a.id) AS documentCount,
      (SELECT COUNT(*) FROM verification_documents d WHERE d.application_id=a.id
        AND d.verification_status IN ('auto_verified','verified')) AS validatedDocumentCount,
      (SELECT COUNT(*) FROM verification_documents d WHERE d.application_id=a.id
        AND d.verification_status NOT IN ('auto_verified','verified')) AS pendingDocumentCount
     FROM applications a JOIN workers w ON w.id=a.worker_id
     WHERE w.matricula=? AND w.active=1 AND a.archived_at IS NULL
     ORDER BY a.id DESC LIMIT 1`,
  )
    .bind(matricula)
    .first<{
      id: number;
      folio: string;
      status: string;
      documentStatus: string;
      reviewNotes: string | null;
      reviewedAt: string | null;
      documentCount: number;
      validatedDocumentCount: number;
      pendingDocumentCount: number;
    }>();
  const scholarships = await env.DB.prepare(
    `SELECT e.folio,e.level,e.child_name AS childName,e.created_at AS createdAt,
      c.name AS campaignName,c.year
     FROM scholarship_entries e JOIN scholarship_campaigns c ON c.id=e.campaign_id
     WHERE e.matricula=? AND e.deleted_at IS NULL
     ORDER BY e.created_at DESC,e.id DESC LIMIT 20`,
  )
    .bind(matricula)
    .all<{
      folio: string;
      level: string;
      childName: string;
      createdAt: string;
      campaignName: string;
      year: number;
    }>();

  if (!application && !scholarships.results.length)
    return localReply(
      "No encontré una solicitud de credencial ni una beca Sinabeth activa vinculada a tu matrícula. Si acabas de registrarte, entra a **Registro** para comprobar que el envío haya terminado.",
      [],
    );

  const lines: string[] = [];
  const sources: DeviSource[] = [];
  if (application) {
    const validity = await getCredentialValidity(application.id);
    lines.push(
      `**Credencial ${validity.valid ? "válida" : "no válida"}.** ${validity.reason}`,
      `Folio: **${application.folio}**. Solicitud ${readableStatus(application.status)} y expediente ${readableStatus(application.documentStatus)}.`,
      `Documentos: **${Number(application.validatedDocumentCount || 0)} validados de ${Number(application.documentCount || 0)}**; ${Number(application.pendingDocumentCount || 0)} pendientes.`,
    );
    if (application.reviewNotes) lines.push(`Observación: ${application.reviewNotes}`);
    sources.push({
      id: `credential-status-${application.id}`,
      document: "Expediente digital de credencial",
      page: application.id,
      heading: `Folio ${application.folio}`,
      locator: `Matrícula ${matricula}`,
      excerpt: `${validity.reason} ${application.validatedDocumentCount}/${application.documentCount} documentos validados.`,
      sourceKind: "progress",
    });
  }
  if (scholarships.results.length) {
    lines.push(
      "**Becas Sinabeth activas:**",
      ...scholarships.results.map(
        (entry) =>
          `- ${entry.level}: folio **${entry.folio}**, beneficiario ${entry.childName} · ${entry.campaignName} ${entry.year}.`,
      ),
    );
    sources.push({
      id: `scholarship-status-${matricula}`,
      document: "Registro interno de Becas Sinabeth",
      page: 1,
      heading: "Folios activos de la matrícula",
      locator: `Matrícula ${matricula}`,
      excerpt: `${scholarships.results.length} registro(s) activo(s) consultado(s) con sesión verificada.`,
      sourceKind: "progress",
    });
  }
  lines.push(
    "Esta consulta sólo muestra información de la matrícula vinculada a tu sesión. Un administrador puede revisar el expediente completo y su bitácora.",
  );
  return localReply(lines.join("\n\n"), sources);
}
