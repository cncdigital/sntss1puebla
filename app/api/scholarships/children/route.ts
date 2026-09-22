import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../../authz";
import { normalizeScholarshipCurp } from "../schema";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

function cleanMatricula(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "").slice(0, 12);
}

function cleanName(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function validCurp(value: string) {
  return /^[A-Z0-9]{18}$/.test(value);
}

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "scholarships");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(request.url);
  const matricula = cleanMatricula(url.searchParams.get("matricula"));
  const campaignId = Number(url.searchParams.get("campaignId") || 0);
  if (matricula.length < 4)
    return Response.json({ error: "Escribe una matrícula válida." }, { status: 400 });

  const worker = await env.DB.prepare(
    `SELECT w.matricula,w.full_name AS fullName,w.unit AS adscription,
      w.curp,wt.rfc,
      (SELECT a.id FROM applications a
       WHERE a.worker_id=w.id AND a.status='approved' AND a.archived_at IS NULL
       ORDER BY COALESCE(a.reviewed_at,a.created_at) DESC,a.id DESC LIMIT 1) AS applicationId,
      (SELECT a.credential_token FROM applications a
       WHERE a.worker_id=w.id AND a.status='approved' AND a.archived_at IS NULL
       ORDER BY COALESCE(a.reviewed_at,a.created_at) DESC,a.id DESC LIMIT 1) AS credentialToken
     FROM workers w LEFT JOIN worker_tax_ids wt ON wt.matricula=w.matricula
     WHERE w.matricula=? AND w.active=1 LIMIT 1`,
  )
    .bind(matricula)
    .first<Record<string, unknown>>();
  if (!worker)
    return Response.json(
      { error: "La matrícula no existe o está inactiva en el padrón." },
      { status: 404 },
    );

  const applicationId = Number(worker.applicationId || 0);
  const [credentialChildren, manualChildren, usedLevels] = await Promise.all([
    applicationId
      ? env.DB.prepare(
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
          .bind(campaignId, applicationId)
          .all<Record<string, unknown>>()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    env.DB.prepare(
      `SELECT child.id,child.full_name AS fullName,child.curp,
        entry.folio AS existingFolio,entry.level AS existingLevel,
        entry.worker_name AS existingWorkerName,
        entry.matricula AS existingMatricula,
        entry.worker_curp AS existingWorkerCurp
       FROM scholarship_manual_children child
       LEFT JOIN scholarship_entries entry
         ON entry.campaign_id=? AND entry.deleted_at IS NULL
           AND entry.child_curp=child.curp
       WHERE child.matricula=? AND child.active=1
       ORDER BY child.full_name`,
    )
      .bind(campaignId, matricula)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT level,folio,child_name AS childName,child_curp AS childCurp
       FROM scholarship_entries
       WHERE campaign_id=? AND matricula=? AND deleted_at IS NULL
       ORDER BY level`,
    )
      .bind(campaignId, matricula)
      .all<Record<string, unknown>>(),
  ]);

  const childPayload = (
    child: Record<string, unknown>,
    source: "credential" | "manual",
  ) => ({
    id: source === "manual" ? -Number(child.id) : Number(child.id),
    manualId: source === "manual" ? Number(child.id) : null,
    source,
    fullName: String(child.fullName || ""),
    curp: normalizeScholarshipCurp(String(child.curp || "")) || null,
    alreadyRegistered: Boolean(child.existingFolio),
    existing: child.existingFolio
      ? {
          folio: child.existingFolio,
          level: child.existingLevel,
          workerName: child.existingWorkerName,
          matricula: child.existingMatricula,
          workerCurp: child.existingWorkerCurp,
          childCurp: normalizeScholarshipCurp(String(child.curp || "")),
        }
      : null,
  });

  return Response.json(
    {
      worker: {
        applicationId,
        credentialToken: String(worker.credentialToken || ""),
        fullName: worker.fullName,
        matricula: worker.matricula,
        adscription: worker.adscription,
        curp: normalizeScholarshipCurp(String(worker.curp || "")) || null,
        rfc: worker.rfc,
      },
      children: [
        ...credentialChildren.results.map((child) =>
          childPayload(child, "credential"),
        ),
        ...manualChildren.results.map((child) => childPayload(child, "manual")),
      ],
      usedLevels: usedLevels.results,
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "scholarships");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const payload = (await request.json()) as {
    matricula?: string;
    fullName?: string;
    curp?: string;
  };
  const matricula = cleanMatricula(payload.matricula);
  const fullName = cleanName(payload.fullName);
  const curp = normalizeScholarshipCurp(payload.curp);
  if (matricula.length < 4 || fullName.length < 5 || !validCurp(curp))
    return Response.json(
      { error: "Captura matrícula, nombre completo y CURP válida de 18 caracteres." },
      { status: 400 },
    );
  const worker = await env.DB.prepare(
    "SELECT matricula FROM workers WHERE matricula=? AND active=1",
  )
    .bind(matricula)
    .first();
  if (!worker)
    return Response.json(
      { error: "La matrícula no existe o está inactiva en el padrón." },
      { status: 404 },
    );
  try {
    const result = await env.DB.prepare(
      `INSERT INTO scholarship_manual_children
        (matricula,full_name,curp,active,created_by,updated_by)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(matricula,curp) DO UPDATE SET
         full_name=excluded.full_name,active=1,updated_by=excluded.updated_by,
         updated_at=CURRENT_TIMESTAMP
       RETURNING id,matricula,full_name AS fullName,curp,active,
         created_at AS createdAt,updated_at AS updatedAt`,
    )
      .bind(matricula, fullName, curp, 1, privilege.actor, privilege.actor)
      .first<Record<string, unknown>>();
    await audit(
      privilege.actor,
      "scholarship.child.saved",
      "scholarship_manual_child",
      Number(result?.id || 0),
      `${matricula} · ${fullName} · ${curp}`,
    );
    return Response.json({ ok: true, child: result }, { status: 201 });
  } catch {
    return Response.json(
      { error: "No fue posible registrar al hijo. Revisa que la CURP no esté duplicada." },
      { status: 409 },
    );
  }
}

export async function PATCH(request: Request) {
  const privilege = await requirePrivilege(request, "scholarships");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const payload = (await request.json()) as {
    id?: number;
    fullName?: string;
    curp?: string;
  };
  const id = Number(payload.id || 0);
  const fullName = cleanName(payload.fullName);
  const curp = normalizeScholarshipCurp(payload.curp);
  if (!id || fullName.length < 5 || !validCurp(curp))
    return Response.json(
      { error: "Captura nombre completo y CURP válida de 18 caracteres." },
      { status: 400 },
    );
  try {
    const result = await env.DB.prepare(
      `UPDATE scholarship_manual_children SET full_name=?,curp=?,updated_by=?,
        updated_at=CURRENT_TIMESTAMP WHERE id=? AND active=1`,
    )
      .bind(fullName, curp, privilege.actor, id)
      .run();
    if (!Number(result.meta.changes || 0))
      return Response.json({ error: "Registro manual no encontrado." }, { status: 404 });
    await audit(
      privilege.actor,
      "scholarship.child.updated",
      "scholarship_manual_child",
      id,
      `${fullName} · ${curp}`,
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "No fue posible modificar al hijo. La CURP ya está asignada a esta matrícula." },
      { status: 409 },
    );
  }
}

export async function DELETE(request: Request) {
  const privilege = await requirePrivilege(request, "scholarships");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const payload = (await request.json()) as { id?: number };
  const id = Number(payload.id || 0);
  if (!id)
    return Response.json({ error: "Selecciona un registro válido." }, { status: 400 });
  const result = await env.DB.prepare(
    `UPDATE scholarship_manual_children SET active=0,updated_by=?,
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND active=1`,
  )
    .bind(privilege.actor, id)
    .run();
  if (!Number(result.meta.changes || 0))
    return Response.json({ error: "Registro manual no encontrado." }, { status: 404 });
  await audit(
    privilege.actor,
    "scholarship.child.deactivated",
    "scholarship_manual_child",
    id,
  );
  return Response.json({ ok: true });
}
