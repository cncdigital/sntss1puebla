import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../authz";
import { requireScholarshipOperator } from "./access";
import {
  ensureScholarshipSchema,
  scholarshipCampaignDatabaseKey,
  SCHOLARSHIP_LEVELS,
} from "./schema";

export async function GET(request: Request) {
  await ensureScholarshipSchema();
  const operator = await requireScholarshipOperator(request);
  if (!operator)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const canManage = operator.canManage;
  const campaigns = await env.DB.prepare(
    `SELECT campaign.id,campaign.name,campaign.year,campaign.season,campaign.active,
      campaign.created_at AS createdAt,campaign.updated_at AS updatedAt,
      COUNT(entry.id) AS entryCount,
      COALESCE(SUM(entry.amount_cents),0) AS totalCents
     FROM scholarship_campaigns campaign
     LEFT JOIN scholarship_entries entry
       ON entry.campaign_id=campaign.id AND entry.deleted_at IS NULL
     ${canManage ? "" : "WHERE campaign.active=1"}
     GROUP BY campaign.id
     ORDER BY campaign.active DESC,campaign.year DESC,campaign.id DESC`,
  ).all<Record<string, unknown>>();
  return Response.json({
    canManage,
    levels: SCHOLARSHIP_LEVELS,
    campaigns: campaigns.results.map((campaign: Record<string, unknown>) => ({
      ...campaign,
      databaseKey: scholarshipCampaignDatabaseKey(Number(campaign.id)),
      active: Boolean(campaign.active),
      entryCount: Number(campaign.entryCount || 0),
      totalCents: Number(campaign.totalCents || 0),
    })),
  });
}

export async function POST(request: Request) {
  await ensureScholarshipSchema();
  const privilege = await requirePrivilege(request, "scholarships");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const payload = (await request.json()) as {
    name?: string;
    year?: number | string;
    season?: string;
  };
  const name = payload.name?.trim() || "";
  const year = Number(payload.year || 0);
  const season = payload.season?.trim() || "";
  if (name.length < 3)
    return Response.json(
      { error: "Escribe el nombre de la jornada o evento." },
      { status: 400 },
    );
  if (!Number.isInteger(year) || year < 2020 || year > 2100)
    return Response.json({ error: "Captura un año válido." }, { status: 400 });
  if (season.length < 2 || season.length > 60)
    return Response.json(
      { error: "Captura la temporada de la jornada." },
      { status: 400 },
    );
  try {
    const result = await env.DB.prepare(
      `INSERT INTO scholarship_campaigns (name,year,season,active,created_by)
       VALUES (?,?,?,?,?)`,
    )
      .bind(name, year, season, 1, privilege.actor)
      .run();
    const id = Number(result.meta.last_row_id);
    await audit(
      privilege.actor,
      "scholarship.campaign.created",
      "scholarship_campaign",
      id,
      `${name} · ${year} · ${season}`,
    );
    return Response.json(
      {
        ok: true,
        id,
        databaseKey: scholarshipCampaignDatabaseKey(id),
        entryCount: 0,
      },
      { status: 201 },
    );
  } catch {
    return Response.json(
      { error: "Ya existe una jornada con ese nombre, año y temporada." },
      { status: 409 },
    );
  }
}

export async function PATCH(request: Request) {
  await ensureScholarshipSchema();
  const privilege = await requirePrivilege(request, "scholarships");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const payload = (await request.json()) as { id?: number; active?: boolean };
  const id = Number(payload.id || 0);
  if (!id || typeof payload.active !== "boolean")
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  await env.DB.prepare(
    `UPDATE scholarship_campaigns
     SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
  )
    .bind(payload.active ? 1 : 0, id)
    .run();
  await audit(
    privilege.actor,
    payload.active
      ? "scholarship.campaign.activated"
      : "scholarship.campaign.deactivated",
    "scholarship_campaign",
    id,
  );
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  await ensureScholarshipSchema();
  const privilege = await requirePrivilege(request, "scholarships");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  let payload: { id?: number; confirmation?: string; reason?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const id = Number(payload.id || 0);
  const confirmation = payload.confirmation?.trim() || "";
  const reason = payload.reason?.trim() || "";
  if (!id)
    return Response.json({ error: "Jornada inválida." }, { status: 400 });
  if (reason.length < 3 || reason.length > 200)
    return Response.json(
      { error: "Escribe un motivo de eliminación de 3 a 200 caracteres." },
      { status: 400 },
    );
  try {
    const campaign = await env.DB.prepare(
      `SELECT campaign.id,campaign.name,campaign.year,campaign.season,campaign.active,
        (SELECT COUNT(*) FROM scholarship_entries entry
         WHERE entry.campaign_id=campaign.id) AS entryCount
       FROM scholarship_campaigns campaign WHERE campaign.id=? LIMIT 1`,
    )
      .bind(id)
      .first<{
        id: number;
        name: string;
        year: number;
        season: string;
        active: number;
        entryCount: number;
      }>();
    if (!campaign)
      return Response.json({ error: "Jornada no encontrada." }, { status: 404 });
    if (campaign.active)
      return Response.json(
        { error: "Cierra la jornada antes de eliminarla." },
        { status: 409 },
      );
    const expectedConfirmation = `${campaign.name} ${campaign.year} ${campaign.season}`;
    if (confirmation !== expectedConfirmation.trim())
      return Response.json(
        { error: "La confirmación no coincide con la jornada." },
        { status: 400 },
      );
    const entryCount = Number(campaign.entryCount || 0);
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO audit_logs (actor,action,target_type,target_id,detail)
         SELECT ?,?,?,?,? FROM scholarship_campaigns
         WHERE id=? AND active=0`,
      ).bind(
        privilege.actor,
        "scholarship.campaign.deleted",
        "scholarship_campaign",
        String(id),
        JSON.stringify({
          name: campaign.name,
          year: campaign.year,
          season: campaign.season,
          entryCount,
          reason,
        }),
        id,
      ),
      env.DB.prepare(
        `DELETE FROM scholarship_entries WHERE campaign_id=?
         AND EXISTS (
           SELECT 1 FROM scholarship_campaigns WHERE id=? AND active=0
         )`,
      ).bind(id, id),
      env.DB.prepare(
        "DELETE FROM scholarship_campaigns WHERE id=? AND active=0",
      ).bind(id),
    ]);
    if (!Number(results[2]?.meta.changes || 0))
      return Response.json(
        { error: "La jornada cambió de estado. Ciérrala y vuelve a intentarlo." },
        { status: 409 },
      );
    return Response.json({
      ok: true,
      deletedEntries: entryCount,
      message: `Jornada “${campaign.name} · ${campaign.year} · ${campaign.season}” eliminada junto con ${entryCount} registro${entryCount === 1 ? "" : "s"} asociado${entryCount === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    console.error("scholarship-campaign.delete-failed", error);
    return Response.json(
      { error: "No fue posible eliminar la jornada. Intenta nuevamente." },
      { status: 503 },
    );
  }
}
