import { env } from "cloudflare:workers";
import { audit, getPrivilege, requirePrivilege } from "../authz";
import { requireReader } from "../reader/auth";
import { ensureEventSchema, normalizeEventCategory } from "./schema";

export async function GET(request: Request) {
  await ensureEventSchema();
  const privilege = await getPrivilege(request);
  const reader =
    privilege?.canScan || privilege?.canAdmin
      ? {
          email: `matricula:${privilege.matricula}`,
          fullName: "Personal autorizado",
          facilities: privilege.facilities,
        }
      : await requireReader(request);
  if (!reader && !privilege?.canAdmin)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const canManage = Boolean(privilege?.canAdmin);
  const events = await env.DB.prepare(
    `SELECT e.id,e.name,e.event_date AS eventDate,e.location,e.active,
      e.created_at AS createdAt,e.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM event_entries x WHERE x.event_id=e.id) AS entryCount
     FROM events e ${canManage ? "" : "WHERE e.active=1"}
     ORDER BY e.active DESC,COALESCE(e.event_date,'9999-12-31') DESC,e.id DESC`,
  ).all<Record<string, unknown>>();
  const categories = await env.DB.prepare(
    `SELECT event_id AS eventId,category FROM event_categories ORDER BY category`,
  ).all<{ eventId: number; category: string }>();
  const catalog = await env.DB.prepare(
    `SELECT DISTINCT TRIM(category) AS category FROM workers
     WHERE active=1 AND category IS NOT NULL AND TRIM(category)<>''
     ORDER BY category LIMIT 1000`,
  ).all<{ category: string }>();
  return Response.json({
    canManage,
    events: events.results.map((event) => ({
      ...event,
      active: Boolean(event.active),
      entryCount: Number(event.entryCount || 0),
      categories: categories.results
        .filter((item) => item.eventId === Number(event.id))
        .map((item) => item.category),
    })),
    categoryCatalog: catalog.results.map((item) => item.category),
  });
}

export async function POST(request: Request) {
  await ensureEventSchema();
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const payload = (await request.json()) as {
    name?: string;
    eventDate?: string;
    location?: string;
    categories?: string[];
  };
  const name = payload.name?.trim() || "";
  const normalizedCategories = new Map<string, string>();
  for (const category of payload.categories || []) {
    const label = category.trim();
    const normalized = normalizeEventCategory(label);
    if (label && normalized) normalizedCategories.set(normalized, label);
  }
  if (name.length < 3)
    return Response.json({ error: "Escribe el nombre del evento." }, { status: 400 });
  if (!normalizedCategories.size)
    return Response.json(
      { error: "Agrega por lo menos una categoría autorizada." },
      { status: 400 },
    );
  const result = await env.DB.prepare(
    `INSERT INTO events (name,event_date,location,active,created_by)
     VALUES (?,?,?,?,?)`,
  )
    .bind(
      name,
      payload.eventDate?.trim() || null,
      payload.location?.trim() || null,
      1,
      privilege.actor,
    )
    .run();
  const eventId = Number(result.meta.last_row_id);
  await env.DB.batch(
    [...normalizedCategories.entries()].map(([normalized, category]) =>
      env.DB.prepare(
        `INSERT INTO event_categories (event_id,category,normalized_category)
         VALUES (?,?,?)`,
      ).bind(eventId, category, normalized),
    ),
  );
  await audit(privilege.actor, "event.created", "event", eventId, name);
  return Response.json({ ok: true, id: eventId }, { status: 201 });
}

export async function PATCH(request: Request) {
  await ensureEventSchema();
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const payload = (await request.json()) as { id?: number; active?: boolean };
  const id = Number(payload.id || 0);
  if (!id || typeof payload.active !== "boolean")
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  await env.DB.prepare(
    `UPDATE events SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
  )
    .bind(payload.active ? 1 : 0, id)
    .run();
  await audit(
    privilege.actor,
    payload.active ? "event.activated" : "event.deactivated",
    "event",
    id,
  );
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  await ensureEventSchema();
  const privilege = await requirePrivilege(request, "admin");
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
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  if (reason.length < 3 || reason.length > 200)
    return Response.json(
      { error: "Escribe un motivo de eliminación de 3 a 200 caracteres." },
      { status: 400 },
    );
  try {
    const event = await env.DB.prepare(
      `SELECT e.id,e.name,e.active,
        (SELECT COUNT(*) FROM event_entries entry WHERE entry.event_id=e.id) AS entryCount
       FROM events e WHERE e.id=? LIMIT 1`,
    )
      .bind(id)
      .first<{ id: number; name: string; active: number; entryCount: number }>();
    if (!event)
      return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    if (event.active)
      return Response.json(
        { error: "Cierra el evento antes de eliminarlo." },
        { status: 409 },
      );
    if (confirmation !== event.name.trim())
      return Response.json(
        { error: "El nombre de confirmación no coincide con el evento." },
        { status: 400 },
      );
    const entryCount = Number(event.entryCount || 0);
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO audit_logs (actor,action,target_type,target_id,detail)
         SELECT ?,?,?,?,? FROM events WHERE id=? AND active=0`,
      ).bind(
        privilege.actor,
        "event.deleted",
        "event",
        String(id),
        JSON.stringify({ name: event.name, entryCount, reason }),
        id,
      ),
      env.DB.prepare(
        `DELETE FROM event_entries WHERE event_id=?
         AND EXISTS (SELECT 1 FROM events WHERE id=? AND active=0)`,
      ).bind(id, id),
      env.DB.prepare(
        `DELETE FROM event_categories WHERE event_id=?
         AND EXISTS (SELECT 1 FROM events WHERE id=? AND active=0)`,
      ).bind(id, id),
      env.DB.prepare("DELETE FROM events WHERE id=? AND active=0").bind(id),
    ]);
    if (!Number(results[3]?.meta.changes || 0))
      return Response.json(
        { error: "El evento cambió de estado. Ciérralo y vuelve a intentarlo." },
        { status: 409 },
      );
    return Response.json({
      ok: true,
      deletedEntries: entryCount,
      message: `Evento “${event.name}” eliminado junto con ${entryCount} acceso${entryCount === 1 ? "" : "s"} asociado${entryCount === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    console.error("event.delete-failed", error);
    return Response.json(
      { error: "No fue posible eliminar el evento. Intenta nuevamente." },
      { status: 503 },
    );
  }
}
