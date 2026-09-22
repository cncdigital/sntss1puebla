import { env } from "cloudflare:workers";
import {
  createExcelWorkbook,
  excelAttachmentResponse,
} from "../../excel-response";
import { audit, requirePrivilege } from "../../authz";
import { requireScholarshipOperator } from "../access";
import {
  ScholarshipAccessError,
  scholarshipAccessErrorResponse,
  validateScholarshipCredential,
} from "../credential";
import { SCHOLARSHIP_ENTRY_SELECT } from "../select";
import {
  ensureScholarshipSchema,
  INSERT_SCHOLARSHIP_ENTRY_SQL,
  normalizeScholarshipCurp,
  scholarshipLevel,
  scholarshipSeasonCode,
} from "../schema";

type ExistingEntry = {
  id: number;
  campaignId: number;
  folio: string;
  level: string;
  workerName: string;
  matricula: string;
  workerCurp: string | null;
  childName: string;
  childCurp: string;
  gradeHundredths?: number;
};

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function safeFilePart(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "becas-sinabeth"
  );
}

async function existingChild(campaignId: number, childCurp: string) {
  return env.DB.prepare(
    `${SCHOLARSHIP_ENTRY_SELECT}
     WHERE entry.campaign_id=? AND entry.child_curp=?
       AND entry.deleted_at IS NULL LIMIT 1`,
  )
    .bind(campaignId, childCurp)
    .first<ExistingEntry>();
}

async function existingWorkerLevel(
  campaignId: number,
  matricula: string,
  level: string,
) {
  return env.DB.prepare(
    `${SCHOLARSHIP_ENTRY_SELECT}
     WHERE entry.campaign_id=? AND entry.matricula=? AND entry.level=?
       AND entry.deleted_at IS NULL LIMIT 1`,
  )
    .bind(campaignId, matricula, level)
    .first<ExistingEntry>();
}

function childDuplicateResponse(entry: ExistingEntry) {
  return Response.json(
    {
      error: `HIJO REGISTRADO: ${entry.childName} ya fue inscrito con ${entry.workerName} (matrícula ${entry.matricula}). CURP: ${entry.childCurp}.`,
      code: "CHILD_ALREADY_REGISTERED",
      existing: entry,
    },
    { status: 409, headers: NO_STORE_HEADERS },
  );
}

function workerLevelDuplicateResponse(entry: ExistingEntry) {
  return Response.json(
    {
      error: `Este trabajador ya asignó la beca de ${entry.level} a ${entry.childName}. Solo puede registrar un hijo por nivel.`,
      code: "WORKER_LEVEL_ALREADY_USED",
      existing: entry,
    },
    { status: 409, headers: NO_STORE_HEADERS },
  );
}

export async function GET(request: Request) {
  const operator = await requireScholarshipOperator(request);
  if (!operator)
    return Response.json({ error: "No autorizado" }, { status: 401 });
  await ensureScholarshipSchema();
  const url = new URL(request.url);
  const campaignId = Number(url.searchParams.get("campaignId") || 0);
  if (!campaignId)
    return Response.json(
      { error: "Selecciona una jornada de Becas Sinabeth." },
      { status: 400 },
    );

  const campaign = await env.DB.prepare(
    `SELECT id,name,year,season,active FROM scholarship_campaigns WHERE id=?`,
  )
    .bind(campaignId)
    .first<{
      id: number;
      name: string;
      year: number;
      season: string;
      active: number;
    }>();
  if (!campaign)
    return Response.json({ error: "Jornada no encontrada." }, { status: 404 });

  const exportFormat = url.searchParams.get("format");
  if (exportFormat === "csv" || exportFormat === "xlsx") {
    const rows = await env.DB.prepare(
      `${SCHOLARSHIP_ENTRY_SELECT}
       WHERE entry.campaign_id=? AND entry.deleted_at IS NULL ORDER BY entry.id`,
    )
      .bind(campaignId)
      .all<Record<string, unknown>>();
    if (exportFormat === "xlsx") {
      const workbookRows = rows.results.map((entry) => [
        String(entry.folio || ""),
        String(entry.workerName || ""),
        String(entry.matricula || ""),
        String(entry.adscription || ""),
        String(entry.workerCurp || ""),
        String(entry.rfc || ""),
        String(entry.childName || ""),
        String(entry.childCurp || ""),
        String(entry.level || ""),
        Number(entry.gradeHundredths || 0) / 100,
        Number(entry.amountCents || 0) / 100,
        String(entry.createdAt || ""),
        campaign.year,
        campaign.season,
      ]);
      const totalPesos = rows.results.reduce(
        (total, entry) => total + Number(entry.amountCents || 0) / 100,
        0,
      );
      const bytes = createExcelWorkbook({
        title: `Becas Sinabeth ${campaign.year} ${campaign.season}`,
        dataSheetName: "Becas",
        columns: [
          { header: "Folio Único", width: 30 },
          { header: "Nombre", width: 38 },
          { header: "Matrícula", width: 15 },
          { header: "Adscripción", width: 30 },
          { header: "CURP del trabajador", width: 22 },
          { header: "RFC", width: 17 },
          { header: "Nombre del Hijo", width: 38 },
          { header: "CURP del Hijo", width: 22 },
          { header: "Nivel de estudio", width: 32 },
          { header: "Calificación", width: 15, numberFormat: "0.00" },
          {
            header: "Valor de la Beca (MXN)",
            width: 24,
            numberFormat: '"$"#,##0.00',
          },
          { header: "Fecha de registro", width: 21 },
          { header: "Año", width: 10, numberFormat: "0" },
          { header: "Temporada", width: 22 },
        ],
        rows: workbookRows,
        summaryRows: [
          ["BECAS SINABETH · CREDENCIALES SNTSS1PUEBLA"],
          [],
          ["Jornada", campaign.name],
          ["Año", campaign.year],
          ["Temporada", campaign.season],
          ["Registros exportados", workbookRows.length],
          ["Valor total (MXN)", totalPesos],
          ["Fecha de exportación", new Date().toISOString()],
        ],
      });
      return excelAttachmentResponse(
        bytes,
        `becas-sinabeth-${campaign.year}-${safeFilePart(campaign.season)}.xlsx`,
      );
    }
    const headers = [
      "Folio Único",
      "Nombre",
      "Matrícula",
      "Adscripción",
      "CURP del trabajador",
      "RFC",
      "Nombre del Hijo",
      "CURP del Hijo",
      "Nivel de estudio",
      "Calificación",
      "Valor de la Beca",
      "Fecha de registro",
      "Año",
      "Temporada",
    ];
    const lines = [
      headers.map(csvCell).join(","),
      ...rows.results.map((entry: Record<string, unknown>) =>
        [
          entry.folio,
          entry.workerName,
          entry.matricula,
          entry.adscription,
          entry.workerCurp,
          entry.rfc,
          entry.childName,
          entry.childCurp,
          entry.level,
          (Number(entry.gradeHundredths || 0) / 100).toFixed(2),
          (Number(entry.amountCents || 0) / 100).toFixed(2),
          entry.createdAt,
          campaign.year,
          campaign.season,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    const bytes = new TextEncoder().encode(
      `\uFEFF${lines.join("\r\n")}\r\n`,
    );
    const fileName = `becas-sinabeth-${campaign.year}-${safeFilePart(campaign.season)}.csv`;
    return new Response(bytes, {
      headers: {
        "content-type": "text/csv; charset=UTF-8",
        "content-disposition": `attachment; filename="${fileName}"`,
        "content-length": String(bytes.byteLength),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const [entries, totals, byLevel, byDay] = await Promise.all([
    env.DB.prepare(
      `${SCHOLARSHIP_ENTRY_SELECT}
       WHERE entry.campaign_id=? AND entry.deleted_at IS NULL
       ORDER BY entry.id DESC LIMIT 5000`,
    )
      .bind(campaignId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS entryCount,
        COALESCE(SUM(amount_cents),0) AS totalCents,
        COALESCE(SUM(CASE WHEN date(created_at,'-6 hours')=date('now','-6 hours')
          THEN 1 ELSE 0 END),0) AS todayCount,
        COALESCE(SUM(CASE WHEN date(created_at,'-6 hours')=date('now','-6 hours')
          THEN amount_cents ELSE 0 END),0) AS todayCents
       FROM scholarship_entries WHERE campaign_id=? AND deleted_at IS NULL`,
    )
      .bind(campaignId)
      .first<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT level,COUNT(*) AS entryCount,
        COALESCE(SUM(amount_cents),0) AS totalCents
       FROM scholarship_entries WHERE campaign_id=? AND deleted_at IS NULL
       GROUP BY level ORDER BY MIN(id)`,
    )
      .bind(campaignId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT date(created_at,'-6 hours') AS day,COUNT(*) AS entryCount,
        COALESCE(SUM(amount_cents),0) AS totalCents
       FROM scholarship_entries WHERE campaign_id=? AND deleted_at IS NULL
       GROUP BY date(created_at,'-6 hours') ORDER BY day DESC LIMIT 120`,
    )
      .bind(campaignId)
      .all<Record<string, unknown>>(),
  ]);

  const numberFields = (row: Record<string, unknown>) => ({
    ...row,
    entryCount: Number(row.entryCount || 0),
    totalCents: Number(row.totalCents || 0),
  });
  return Response.json(
    {
      campaign: { ...campaign, active: Boolean(campaign.active) },
      entries: entries.results.map((entry: Record<string, unknown>) => ({
        ...entry,
        amountCents: Number(entry.amountCents || 0),
        gradeHundredths: Number(entry.gradeHundredths || 0),
        levelSequence: Number(entry.levelSequence || 0),
      })),
      stats: {
        entryCount: Number(totals?.entryCount || 0),
        totalCents: Number(totals?.totalCents || 0),
        todayCount: Number(totals?.todayCount || 0),
        todayCents: Number(totals?.todayCents || 0),
        byLevel: byLevel.results.map(numberFields),
        byDay: byDay.results.map(numberFields),
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const operator = await requireScholarshipOperator(request);
  if (!operator)
    return Response.json({ error: "No autorizado" }, { status: 401 });
  const payload = (await request.json()) as {
    campaignId?: number;
    credentialToken?: string;
    beneficiaryId?: number;
    matricula?: string;
    manualChildId?: number;
    level?: string;
    grade?: number | string;
  };
  const level = scholarshipLevel(payload.level);
  if (!level)
    return Response.json(
      { error: "Selecciona un nivel de estudio válido." },
      { status: 400 },
    );
  const grade = Number(payload.grade);
  if (!Number.isFinite(grade) || grade < 8.5 || grade > 10)
    return Response.json(
      { error: "La beca requiere una calificación de 8.5 a 10." },
      { status: 400 },
    );
  const manualChildId = Number(payload.manualChildId || 0);
  if (manualChildId || payload.matricula) {
    if (!operator.canManage)
      return Response.json(
        { error: "La captura manual es exclusiva de Administración y Asuntos Técnicos." },
        { status: 403 },
      );
    const matricula = (payload.matricula || "").replace(/\D/g, "").slice(0, 12);
    if (!manualChildId || matricula.length < 4)
      return Response.json(
        { error: "Selecciona una matrícula y un hijo registrado manualmente." },
        { status: 400 },
      );
    const campaignId = Number(payload.campaignId || 0);
    const [campaign, worker, child] = await Promise.all([
      env.DB.prepare(
        "SELECT id,name,year,season FROM scholarship_campaigns WHERE id=? AND active=1",
      )
        .bind(campaignId)
        .first<{ id: number; name: string; year: number; season: string }>(),
      env.DB.prepare(
        `SELECT w.full_name AS fullName,w.matricula,w.unit AS adscription,
          w.curp,wt.rfc FROM workers w
         LEFT JOIN worker_tax_ids wt ON wt.matricula=w.matricula
         WHERE w.matricula=? AND w.active=1 LIMIT 1`,
      )
        .bind(matricula)
        .first<{
          fullName: string;
          matricula: string;
          adscription: string | null;
          curp: string | null;
          rfc: string | null;
        }>(),
      env.DB.prepare(
        `SELECT id,full_name AS fullName,curp
         FROM scholarship_manual_children
         WHERE id=? AND matricula=? AND active=1 LIMIT 1`,
      )
        .bind(manualChildId, matricula)
        .first<{ id: number; fullName: string; curp: string }>(),
    ]);
    if (!campaign)
      return Response.json(
        { error: "La jornada de becas no existe o ya fue cerrada." },
        { status: 404 },
      );
    if (!worker)
      return Response.json(
        { error: "La matrícula no existe o está inactiva en el padrón." },
        { status: 404 },
      );
    if (!child)
      return Response.json(
        { error: "El hijo manual no existe o ya fue retirado." },
        { status: 404 },
      );

    const childCurp = normalizeScholarshipCurp(child.curp);
    const duplicateChild = await existingChild(campaign.id, childCurp);
    if (duplicateChild) return childDuplicateResponse(duplicateChild);
    const duplicateLevel = await existingWorkerLevel(
      campaign.id,
      worker.matricula,
      level.label,
    );
    if (duplicateLevel) return workerLevelDuplicateResponse(duplicateLevel);

    const gradeHundredths = Math.round(grade * 100);
    const prefix = `SINABETH-${campaign.year}-${scholarshipSeasonCode(campaign.season)}-E${campaign.id}-${level.code}-`;
    let inserted: Record<string, unknown> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 4 && !inserted; attempt += 1) {
      try {
        inserted = await env.DB.prepare(INSERT_SCHOLARSHIP_ENTRY_SQL)
          .bind(
            campaign.id,
            level.label,
            campaign.id,
            level.label,
            campaign.id,
            0,
            `SCHOLARSHIP-MANUAL:${worker.matricula}`,
            prefix,
            level.label,
            level.amountCents,
            worker.fullName,
            worker.matricula,
            worker.adscription,
            normalizeScholarshipCurp(worker.curp) || null,
            worker.rfc,
            -child.id,
            child.fullName,
            childCurp,
            gradeHundredths,
            operator.actor,
          )
          .first<Record<string, unknown>>();
      } catch (error) {
        lastError = error;
        const [concurrentChild, concurrentLevel] = await Promise.all([
          existingChild(campaign.id, childCurp),
          existingWorkerLevel(campaign.id, worker.matricula, level.label),
        ]);
        if (concurrentChild) return childDuplicateResponse(concurrentChild);
        if (concurrentLevel) return workerLevelDuplicateResponse(concurrentLevel);
      }
    }
    if (!inserted) {
      console.error("manual scholarship entry folio reservation failed", {
        campaignId: campaign.id,
        matricula,
        error: lastError instanceof Error ? lastError.message : String(lastError),
      });
      return Response.json(
        { error: "No fue posible reservar el folio. Actualiza la pantalla e inténtalo nuevamente." },
        { status: 503 },
      );
    }
    await audit(
      operator.actor,
      "scholarship.entry.created-manually",
      "scholarship_entry",
      String(inserted.id),
      `${inserted.folio} · ${worker.matricula} · ${childCurp}`,
    );
    return Response.json(
      {
        ok: true,
        campaign,
        entry: {
          ...inserted,
          amountCents: Number(inserted.amountCents || 0),
          gradeHundredths: Number(inserted.gradeHundredths || 0),
          levelSequence: Number(inserted.levelSequence || 0),
        },
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const validated = await validateScholarshipCredential(
      Number(payload.campaignId || 0),
      payload.credentialToken || "",
    );
    const child = validated.children.find(
      (candidate: {
        id: number;
        fullName: string;
        curp: string | null;
      }) => candidate.id === Number(payload.beneficiaryId || 0),
    );
    if (!child)
      return Response.json(
        { error: "Selecciona un hijo registrado en la credencial del titular." },
        { status: 400 },
      );
    const childCurp = normalizeScholarshipCurp(child.curp);
    if (!/^[A-Z0-9]{18}$/.test(childCurp))
      return Response.json(
        {
          error:
            "El hijo seleccionado no tiene una CURP válida de 18 caracteres. Actualiza primero su expediente.",
        },
        { status: 422 },
      );

    const duplicateChild = await existingChild(validated.campaign.id, childCurp);
    if (duplicateChild) return childDuplicateResponse(duplicateChild);
    const duplicateLevel = await existingWorkerLevel(
      validated.campaign.id,
      validated.worker.matricula,
      level.label,
    );
    if (duplicateLevel) return workerLevelDuplicateResponse(duplicateLevel);

    const gradeHundredths = Math.round(grade * 100);
    const prefix = `SINABETH-${validated.campaign.year}-${scholarshipSeasonCode(validated.campaign.season)}-E${validated.campaign.id}-${level.code}-`;
    let inserted: Record<string, unknown> | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 4 && !inserted; attempt += 1) {
      try {
        inserted = await env.DB.prepare(INSERT_SCHOLARSHIP_ENTRY_SQL)
          .bind(
            validated.campaign.id,
            level.label,
            validated.campaign.id,
            level.label,
            validated.campaign.id,
            validated.worker.applicationId,
            validated.worker.credentialToken,
            prefix,
            level.label,
            level.amountCents,
            validated.worker.fullName,
            validated.worker.matricula,
            validated.worker.adscription,
            validated.worker.curp,
            validated.worker.rfc,
            child.id,
            child.fullName,
            childCurp,
            gradeHundredths,
            operator.actor,
          )
          .first<Record<string, unknown>>();
      } catch (error) {
        lastError = error;
        const [concurrentChild, concurrentLevel] = await Promise.all([
          existingChild(validated.campaign.id, childCurp),
          existingWorkerLevel(
            validated.campaign.id,
            validated.worker.matricula,
            level.label,
          ),
        ]);
        if (concurrentChild) return childDuplicateResponse(concurrentChild);
        if (concurrentLevel) return workerLevelDuplicateResponse(concurrentLevel);
      }
    }
    if (!inserted) {
      console.error("scholarship entry folio reservation failed", {
        campaignId: validated.campaign.id,
        level: level.code,
        error:
          lastError instanceof Error ? lastError.message : String(lastError),
      });
      throw new ScholarshipAccessError(
        "No fue posible reservar el folio de la beca. Actualiza la pantalla e inténtalo nuevamente.",
        503,
        { code: "SCHOLARSHIP_FOLIO_UNAVAILABLE" },
      );
    }

    await audit(
      operator.actor,
      "scholarship.entry.created",
      "scholarship_entry",
      String(inserted.id),
      `${inserted.folio} · ${validated.worker.matricula} · ${childCurp}`,
    );
    return Response.json(
      {
        ok: true,
        campaign: validated.campaign,
        entry: {
          ...inserted,
          amountCents: Number(inserted.amountCents || 0),
          gradeHundredths: Number(inserted.gradeHundredths || 0),
          levelSequence: Number(inserted.levelSequence || 0),
        },
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return scholarshipAccessErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  await ensureScholarshipSchema();
  const privilege = await requirePrivilege(request, "scholarships");
  if (!privilege)
    return Response.json(
      { error: "Solo Administración o Asuntos Técnicos puede modificar registros." },
      { status: 403 },
    );
  const payload = (await request.json()) as {
    id?: number;
    childName?: string;
    childCurp?: string;
    grade?: number | string;
  };
  const id = Number(payload.id || 0);
  const childName = (payload.childName || "").replace(/\s+/g, " ").trim();
  const childCurp = normalizeScholarshipCurp(payload.childCurp);
  const grade = Number(payload.grade);
  if (
    !id ||
    childName.length < 5 ||
    !/^[A-Z0-9]{18}$/.test(childCurp) ||
    !Number.isFinite(grade) ||
    grade < 8.5 ||
    grade > 10
  )
    return Response.json(
      { error: "Captura nombre, CURP válida y calificación de 8.5 a 10." },
      { status: 400 },
    );
  const entry = await env.DB.prepare(
    `${SCHOLARSHIP_ENTRY_SELECT}
     WHERE entry.id=? AND entry.deleted_at IS NULL LIMIT 1`,
  )
    .bind(id)
    .first<ExistingEntry>();
  if (!entry)
    return Response.json({ error: "Registro no encontrado." }, { status: 404 });
  const duplicate = await env.DB.prepare(
    `${SCHOLARSHIP_ENTRY_SELECT}
     WHERE entry.campaign_id=? AND entry.child_curp=?
       AND entry.id<>? AND entry.deleted_at IS NULL LIMIT 1`,
  )
    .bind(entry.campaignId, childCurp, id)
    .first<ExistingEntry>();
  if (duplicate) return childDuplicateResponse(duplicate);
  try {
    await env.DB.prepare(
      `UPDATE scholarship_entries SET child_name=?,child_curp=?,grade_hundredths=?
       WHERE id=? AND deleted_at IS NULL`,
    )
      .bind(childName, childCurp, Math.round(grade * 100), id)
      .run();
    await audit(
      privilege.actor,
      "scholarship.entry.updated",
      "scholarship_entry",
      id,
      `${entry.folio} · ${childName} · ${childCurp} · ${grade.toFixed(2)}`,
    );
    const updated = await env.DB.prepare(
      `${SCHOLARSHIP_ENTRY_SELECT} WHERE entry.id=? LIMIT 1`,
    )
      .bind(id)
      .first<Record<string, unknown>>();
    return Response.json(
      {
        ok: true,
        entry: {
          ...updated,
          amountCents: Number(updated?.amountCents || 0),
          gradeHundredths: Number(updated?.gradeHundredths || 0),
          levelSequence: Number(updated?.levelSequence || 0),
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return Response.json(
      { error: "No fue posible guardar la modificación." },
      { status: 409 },
    );
  }
}

export async function DELETE(request: Request) {
  await ensureScholarshipSchema();
  const privilege = await requirePrivilege(request, "scholarships");
  if (!privilege)
    return Response.json({ error: "Solo Administración o Asuntos Técnicos puede borrar registros." }, { status: 403 });
  const payload = (await request.json()) as { id?: number; reason?: string };
  const id = Number(payload.id || 0);
  const reason = payload.reason?.trim() || "";
  if (!id)
    return Response.json({ error: "Selecciona un registro válido." }, { status: 400 });
  if (reason.length < 3 || reason.length > 240)
    return Response.json(
      { error: "Escribe un motivo de eliminación de 3 a 240 caracteres." },
      { status: 400 },
    );

  const entry = await env.DB.prepare(
    `${SCHOLARSHIP_ENTRY_SELECT}
     WHERE entry.id=? AND entry.deleted_at IS NULL LIMIT 1`,
  )
    .bind(id)
    .first<ExistingEntry>();
  if (!entry)
    return Response.json(
      { error: "El registro no existe o ya fue eliminado." },
      { status: 404 },
    );

  const result = await env.DB.prepare(
    `UPDATE scholarship_entries
     SET deleted_at=CURRENT_TIMESTAMP,deleted_by=?,deletion_reason=?
     WHERE id=? AND deleted_at IS NULL`,
  )
    .bind(privilege.actor, reason, id)
    .run();
  if (!Number(result.meta.changes || 0))
    return Response.json(
      { error: "El registro ya fue eliminado por otro administrador." },
      { status: 409 },
    );

  await audit(
    privilege.actor,
    "scholarship.entry.deleted",
    "scholarship_entry",
    id,
    `${entry.folio} · ${entry.matricula} · ${entry.childCurp} · Motivo: ${reason}`,
  );
  return Response.json(
    {
      ok: true,
      released: {
        matricula: entry.matricula,
        level: entry.level,
        childCurp: entry.childCurp,
      },
      message: `Registro ${entry.folio} eliminado. La matrícula ${entry.matricula}, el nivel ${entry.level} y la CURP del beneficiario quedaron liberados para volver a registrar.`,
    },
    { headers: NO_STORE_HEADERS },
  );
}
