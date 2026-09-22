"use client";

import { useEffect, useMemo, useState } from "react";
import { apiResponseError, readJsonResponse } from "./api-response";
import {
  CALENDAR_FACILITIES,
  type CalendarFacility,
} from "./facility-calendar-policy";

type CalendarEvent = {
  id: number;
  facility: CalendarFacility;
  title: string;
  organizer: string | null;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  updatedBy: string;
};

type CalendarPermissionResponse = {
  canView: boolean;
  manageableFacilities: CalendarFacility[];
};

type EventDraft = {
  id: number;
  facility: CalendarFacility;
  title: string;
  organizer: string;
  notes: string;
  startsAt: string;
  endsAt: string;
};

const EMPTY_DRAFT: EventDraft = {
  id: 0,
  facility: CALENDAR_FACILITIES[0],
  title: "",
  organizer: "",
  notes: "",
  startsAt: "",
  endsAt: "",
};

const MONTH_LABEL = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
});
const DAY_LABEL = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const TIME_LABEL = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
});

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function eventDraft(event: CalendarEvent): EventDraft {
  return {
    id: event.id,
    facility: event.facility,
    title: event.title,
    organizer: event.organizer || "",
    notes: event.notes || "",
    startsAt: toLocalInput(event.startsAt),
    endsAt: toLocalInput(event.endsAt),
  };
}

function draftForDay(day: Date, facilities: CalendarFacility[]): EventDraft {
  const key = localDateKey(day);
  return {
    ...EMPTY_DRAFT,
    facility: facilities[0] || CALENDAR_FACILITIES[0],
    startsAt: `${key}T09:00`,
    endsAt: `${key}T10:00`,
  };
}

export function FacilityCalendarPanel() {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [permissions, setPermissions] =
    useState<CalendarPermissionResponse | null>(null);
  const [facilityFilter, setFacilityFilter] = useState("all");
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);
  const rangeStart = days[0];
  const rangeEnd = useMemo(() => {
    const end = new Date(days[days.length - 1]);
    end.setDate(end.getDate() + 1);
    return end;
  }, [days]);

  const loadEvents = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/facility-calendar?from=${encodeURIComponent(rangeStart.toISOString())}&to=${encodeURIComponent(rangeEnd.toISOString())}`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<{
        events?: CalendarEvent[];
        permissions?: CalendarPermissionResponse;
        error?: string;
      }>(response);
      if (!response.ok || !data?.events || !data.permissions)
        throw new Error(
          apiResponseError(response, data, "No fue posible consultar el calendario."),
        );
      setEvents(data.events);
      setPermissions(data.permissions);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible consultar el calendario.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const visibleEvents = useMemo(
    () =>
      events.filter(
        (event) => facilityFilter === "all" || event.facility === facilityFilter,
      ),
    [events, facilityFilter],
  );
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of visibleEvents) {
      const key = localDateKey(new Date(event.startsAt));
      grouped.set(key, [...(grouped.get(key) || []), event]);
    }
    return grouped;
  }, [visibleEvents]);
  const manageable = permissions?.manageableFacilities || [];

  const openNewEvent = (day = new Date()) => {
    if (!manageable.length) return;
    setDraft(draftForDay(day, manageable));
    setMessage("");
    setError("");
  };

  const saveEvent = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/facility-calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          startsAt: new Date(draft.startsAt).toISOString(),
          endsAt: new Date(draft.endsAt).toISOString(),
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok)
        throw new Error(
          apiResponseError(response, data, "No fue posible guardar el evento."),
        );
      setDraft(null);
      setMessage(draft.id ? "Evento actualizado." : "Evento calendarizado.");
      await loadEvents();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible guardar el evento.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async () => {
    if (!draft?.id || saving) return;
    if (!window.confirm(`¿Eliminar “${draft.title}” del calendario?`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/facility-calendar", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draft.id }),
      });
      const data = response.status === 204 ? null : await readJsonResponse<{ error?: string }>(response);
      if (!response.ok)
        throw new Error(
          apiResponseError(response, data, "No fue posible eliminar el evento."),
        );
      setDraft(null);
      setMessage("Evento eliminado del calendario.");
      await loadEvents();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible eliminar el evento.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="facilityCalendarPage">
      <header className="facilityCalendarHeader">
        <div>
          <span className="eyebrow">AGENDA PRIVADA DE INSTALACIONES</span>
          <h1>Calendario de espacios</h1>
          <p>Consulta disponibilidad y evita cruces de horario en las instalaciones autorizadas.</p>
        </div>
        {manageable.length > 0 && (
          <button className="button primary" type="button" onClick={() => openNewEvent()}>
            + Calendarizar evento
          </button>
        )}
      </header>

      <div className="facilityCalendarToolbar">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          ←
        </button>
        <div>
          <b>{MONTH_LABEL.format(month)}</b>
          <button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            Hoy
          </button>
        </div>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          →
        </button>
        <label>
          <span>Instalación</span>
          <select value={facilityFilter} onChange={(event) => setFacilityFilter(event.target.value)}>
            <option value="all">Todas las instalaciones</option>
            {CALENDAR_FACILITIES.map((facility) => (
              <option value={facility} key={facility}>{facility}</option>
            ))}
          </select>
        </label>
      </div>

      {message && <div className="calendarNotice success" role="status">{message}</div>}
      {error && <div className="calendarNotice error" role="alert">{error}</div>}
      {!loading && permissions && !manageable.length && (
        <div className="calendarReadOnly">Modo consulta · Este rol puede ver la agenda, pero no crear ni modificar eventos.</div>
      )}

      <div className="facilityCalendarGrid" aria-busy={loading}>
        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((label) => (
          <b className="calendarWeekday" key={label}>{label}</b>
        ))}
        {days.map((day) => {
          const key = localDateKey(day);
          const dayEvents = eventsByDay.get(key) || [];
          const outside = day.getMonth() !== month.getMonth();
          const today = key === localDateKey(new Date());
          return (
            <article className={`calendarDay ${outside ? "outside" : ""} ${today ? "today" : ""}`} key={key}>
              <button
                className="calendarDayNumber"
                type="button"
                disabled={!manageable.length}
                onClick={() => openNewEvent(day)}
                aria-label={`Agregar evento el ${DAY_LABEL.format(day)}`}
              >
                {day.getDate()}
              </button>
              <div>
                {dayEvents.slice(0, 4).map((event) => {
                  const editable = manageable.includes(event.facility);
                  const facilityIndex = CALENDAR_FACILITIES.indexOf(event.facility);
                  return (
                    <button
                      type="button"
                      className={`calendarEvent facility-${facilityIndex % 8}`}
                      key={event.id}
                      disabled={!editable}
                      onClick={() => editable && setDraft(eventDraft(event))}
                      aria-label={`${event.title}, ${event.facility}, ${TIME_LABEL.format(new Date(event.startsAt))}`}
                    >
                      <time>{TIME_LABEL.format(new Date(event.startsAt))}</time>
                      <span>{event.title}</span>
                    </button>
                  );
                })}
                {dayEvents.length > 4 && <small>+{dayEvents.length - 4} eventos</small>}
              </div>
            </article>
          );
        })}
        {loading && <div className="calendarLoading"><span className="spinner" /> Cargando agenda…</div>}
      </div>

      <div className="calendarAgenda">
        <div className="cardHeader"><div><span className="eyebrow">AGENDA DEL PERIODO</span><h2>Próximos usos calendarizados</h2></div></div>
        {visibleEvents.length ? visibleEvents.map((event) => {
          const editable = manageable.includes(event.facility);
          return (
            <article key={event.id}>
              <time><b>{DAY_LABEL.format(new Date(event.startsAt))}</b><span>{TIME_LABEL.format(new Date(event.startsAt))}–{TIME_LABEL.format(new Date(event.endsAt))}</span></time>
              <div><b>{event.title}</b><span>{event.facility}</span>{event.organizer && <small>Responsable: {event.organizer}</small>}</div>
              {editable && <button className="button tiny" type="button" onClick={() => setDraft(eventDraft(event))}>Editar</button>}
            </article>
          );
        }) : !loading && <p className="calendarEmpty">No hay eventos en este periodo.</p>}
      </div>

      {draft && (
        <div className="calendarModal" role="dialog" aria-modal="true" aria-labelledby="calendar-form-title">
          <form onSubmit={(event) => { event.preventDefault(); void saveEvent(); }}>
            <div className="cardHeader splitHeader">
              <div><span className="eyebrow">{draft.id ? "MODIFICAR RESERVA" : "NUEVA RESERVA"}</span><h2 id="calendar-form-title">{draft.id ? "Editar evento" : "Calendarizar evento"}</h2></div>
              <button type="button" className="calendarClose" onClick={() => setDraft(null)} aria-label="Cerrar">×</button>
            </div>
            <label className="field"><span>Instalación</span><select value={draft.facility} onChange={(event) => setDraft({ ...draft, facility: event.target.value as CalendarFacility })}>{manageable.map((facility) => <option key={facility} value={facility}>{facility}</option>)}</select></label>
            <label className="field"><span>Nombre del evento</span><input required maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ej. Torneo de fútbol" /></label>
            <div className="calendarFormTimes">
              <label className="field"><span>Inicio</span><input type="datetime-local" required value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></label>
              <label className="field"><span>Fin</span><input type="datetime-local" required value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} /></label>
            </div>
            <label className="field"><span>Responsable u organizador</span><input maxLength={120} value={draft.organizer} onChange={(event) => setDraft({ ...draft, organizer: event.target.value })} /></label>
            <label className="field"><span>Notas</span><textarea maxLength={600} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Montaje, número estimado de asistentes o indicaciones." /></label>
            {error && <div className="calendarNotice error" role="alert">{error}</div>}
            <div className="calendarFormActions">
              {draft.id > 0 && <button className="button danger" type="button" onClick={() => void deleteEvent()} disabled={saving}>Eliminar</button>}
              <button className="button secondary" type="button" onClick={() => setDraft(null)} disabled={saving}>Cancelar</button>
              <button className="button primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar en calendario"}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
