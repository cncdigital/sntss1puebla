import { env } from "cloudflare:workers";
import { audit, requirePrivilege, type Privilege } from "../authz";
import {
  CALENDAR_FACILITIES,
  canManageCalendarFacility,
  canViewCalendar,
  isCalendarFacility,
  manageableCalendarFacilities,
} from "../../facility-calendar-policy";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

type CalendarEventRow = {
  id: number;
  facility: string;
  title: string;
  organizer: string | null;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function validDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

function permissions(privilege: Privilege) {
  return {
    canView: canViewCalendar(privilege),
    manageableFacilities: manageableCalendarFacilities(privilege),
  };
}

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "facilityCalendar");
  if (!privilege || !canViewCalendar(privilege))
    return Response.json(
      { error: "No tienes acceso al calendario de instalaciones." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const url = new URL(request.url);
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"));
  if (!from || !to || from >= to)
    return Response.json(
      { error: "El periodo solicitado no es válido." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  if (to.getTime() - from.getTime() > 370 * 24 * 60 * 60 * 1000)
    return Response.json(
      { error: "Consulta un periodo máximo de un año." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const result = await env.DB.prepare(
    `SELECT id,facility,title,organizer,notes,starts_at AS startsAt,
      ends_at AS endsAt,created_by AS createdBy,updated_by AS updatedBy,
      created_at AS createdAt,updated_at AS updatedAt
     FROM facility_calendar_events
     WHERE starts_at<? AND ends_at>?
     ORDER BY starts_at,facility,id`,
  )
    .bind(to.toISOString(), from.toISOString())
    .all<CalendarEventRow>();
  return Response.json(
    {
      events: result.results,
      facilities: CALENDAR_FACILITIES,
      permissions: permissions(privilege),
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "facilityCalendar");
  if (!privilege)
    return Response.json(
      { error: "No tienes acceso al calendario de instalaciones." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "La información del evento está incompleta." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const id = Number(body.id || 0);
  const facility = cleanText(body.facility, 80);
  const title = cleanText(body.title, 120);
  const organizer = cleanText(body.organizer, 120);
  const notes = cleanText(body.notes, 600);
  const startsAt = validDate(body.startsAt);
  const endsAt = validDate(body.endsAt);
  if (!isCalendarFacility(facility))
    return Response.json(
      { error: "Selecciona una instalación autorizada." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  if (!canManageCalendarFacility(privilege, facility))
    return Response.json(
      { error: "Tu rol solo permite consultar o administrar otras instalaciones." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  if (title.length < 3 || !startsAt || !endsAt || startsAt >= endsAt)
    return Response.json(
      { error: "Escribe el evento y selecciona un horario válido." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  if (endsAt.getTime() - startsAt.getTime() > 7 * 24 * 60 * 60 * 1000)
    return Response.json(
      { error: "Un evento no puede durar más de siete días." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  if (id) {
    const existing = await env.DB.prepare(
      "SELECT id,facility FROM facility_calendar_events WHERE id=?",
    )
      .bind(id)
      .first<{ id: number; facility: string }>();
    if (!existing)
      return Response.json(
        { error: "El evento ya no existe." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    if (!canManageCalendarFacility(privilege, existing.facility))
      return Response.json(
        { error: "No puedes modificar este evento." },
        { status: 403, headers: NO_STORE_HEADERS },
      );
  }
  const overlap = await env.DB.prepare(
    `SELECT id,title FROM facility_calendar_events
     WHERE facility=? AND starts_at<? AND ends_at>? AND id<>?
     ORDER BY starts_at LIMIT 1`,
  )
    .bind(
      facility,
      endsAt.toISOString(),
      startsAt.toISOString(),
      id || -1,
    )
    .first<{ id: number; title: string }>();
  if (overlap)
    return Response.json(
      {
        error: `El horario se cruza con “${overlap.title}”. Ajusta la fecha o la hora.`,
        conflictId: overlap.id,
      },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  if (id) {
    await env.DB.prepare(
      `UPDATE facility_calendar_events
       SET facility=?,title=?,organizer=?,notes=?,starts_at=?,ends_at=?,
         updated_by=?,updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
    )
      .bind(
        facility,
        title,
        organizer || null,
        notes || null,
        startsAt.toISOString(),
        endsAt.toISOString(),
        privilege.actor,
        id,
      )
      .run();
    await audit(
      privilege.actor,
      "facility_calendar.updated",
      "facility_calendar_event",
      id,
      `${facility}: ${title}`,
    );
    return Response.json({ ok: true, id }, { headers: NO_STORE_HEADERS });
  }
  const result = await env.DB.prepare(
    `INSERT INTO facility_calendar_events
      (facility,title,organizer,notes,starts_at,ends_at,created_by,updated_by)
     VALUES (?,?,?,?,?,?,?,?)`,
  )
    .bind(
      facility,
      title,
      organizer || null,
      notes || null,
      startsAt.toISOString(),
      endsAt.toISOString(),
      privilege.actor,
      privilege.actor,
    )
    .run();
  const createdId = Number(result.meta.last_row_id);
  await audit(
    privilege.actor,
    "facility_calendar.created",
    "facility_calendar_event",
    createdId,
    `${facility}: ${title}`,
  );
  return Response.json(
    { ok: true, id: createdId },
    { status: 201, headers: NO_STORE_HEADERS },
  );
}

export async function DELETE(request: Request) {
  const privilege = await requirePrivilege(request, "facilityCalendar");
  if (!privilege)
    return Response.json(
      { error: "No tienes acceso al calendario de instalaciones." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const body = (await request.json().catch(() => ({}))) as { id?: number };
  const id = Number(body.id || 0);
  const event = await env.DB.prepare(
    "SELECT id,facility,title FROM facility_calendar_events WHERE id=?",
  )
    .bind(id)
    .first<{ id: number; facility: string; title: string }>();
  if (!event)
    return Response.json(
      { error: "El evento ya no existe." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  if (!canManageCalendarFacility(privilege, event.facility))
    return Response.json(
      { error: "No puedes eliminar este evento." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  await env.DB.prepare("DELETE FROM facility_calendar_events WHERE id=?")
    .bind(id)
    .run();
  await audit(
    privilege.actor,
    "facility_calendar.deleted",
    "facility_calendar_event",
    id,
    `${event.facility}: ${event.title}`,
  );
  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}
