import { env } from "cloudflare:workers";
import { getPrivilege, getWorkerSession } from "../authz";
import { getCredentialValidity } from "../credential-validity";
import { normalizeEventCategory } from "../events/schema";
import { syncFacebookNews } from "../news/meta";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

type NotificationTarget = "registro" | "credenciales" | "noticias" | null;

type AppNotification = {
  id: string;
  kind: "credential" | "event" | "scholarship" | "news";
  title: string;
  body: string;
  createdAt: string;
  priority: "normal" | "urgent";
  target: NotificationTarget;
};

type ApplicationRow = {
  id: number;
  status: "draft" | "pending" | "approved" | "rejected";
  documentStatus: string;
  createdAt: string;
  reviewedAt: string | null;
};

function credentialNotification(
  application: ApplicationRow,
  valid: boolean,
): AppNotification {
  const version = [
    application.id,
    application.status,
    application.documentStatus,
    valid ? "valid" : "invalid",
    application.reviewedAt || application.createdAt,
  ].join(":");
  const createdAt = application.reviewedAt || application.createdAt;

  if (application.status === "approved" && valid) {
    return {
      id: `credential:${version}`,
      kind: "credential",
      title: "Tu credencial fue validada",
      body: "Tu credencial sindical está vigente y lista para consultarse en la app.",
      createdAt,
      priority: "normal",
      target: "credenciales",
    };
  }
  if (application.status === "approved") {
    return {
      id: `credential:${version}`,
      kind: "credential",
      title: "Tu credencial requiere atención",
      body: "Abre tu expediente para revisar la actualización solicitada.",
      createdAt,
      priority: "urgent",
      target: "registro",
    };
  }
  if (application.status === "rejected" || application.documentStatus === "rejected") {
    return {
      id: `credential:${version}`,
      kind: "credential",
      title: "Tu expediente necesita correcciones",
      body: "Entra a Registro para atender las observaciones y volver a enviarlo.",
      createdAt,
      priority: "urgent",
      target: "registro",
    };
  }
  if (application.status === "pending") {
    return {
      id: `credential:${version}`,
      kind: "credential",
      title: "Tus documentos están en revisión",
      body: "Te avisaremos aquí cuando cambie el estado de tu expediente.",
      createdAt,
      priority: "normal",
      target: "credenciales",
    };
  }
  return {
    id: `credential:${version}`,
    kind: "credential",
    title: "Tienes un expediente pendiente",
    body: "Continúa tu registro cuando tengas listos los documentos necesarios.",
    createdAt,
    priority: "normal",
    target: "registro",
  };
}

export async function GET(request: Request) {
  const [workerSession, privilege] = await Promise.all([
    getWorkerSession(request),
    getPrivilege(request),
  ]);
  if (!workerSession && !privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 401, headers: NO_STORE_HEADERS },
    );

  await syncFacebookNews();

  const matricula = workerSession?.matricula || privilege!.matricula;
  const worker = workerSession
    ? { workerId: workerSession.workerId, category: workerSession.category }
    : await env.DB.prepare(
        "SELECT id AS workerId,category FROM workers WHERE matricula=? AND active=1 LIMIT 1",
      )
        .bind(matricula)
        .first<{ workerId: number; category: string | null }>();
  const normalizedCategory = normalizeEventCategory(worker?.category || "");

  const [application, events, campaigns, news] = await Promise.all([
    worker?.workerId
      ? env.DB.prepare(
          `SELECT id,status,document_status AS documentStatus,
            created_at AS createdAt,reviewed_at AS reviewedAt
           FROM applications WHERE worker_id=? AND archived_at IS NULL ORDER BY id DESC LIMIT 1`,
        )
          .bind(worker.workerId)
          .first<ApplicationRow>()
      : Promise.resolve(null),
    env.DB.prepare(
      `SELECT e.id,e.name,e.event_date AS eventDate,e.location,
        e.created_at AS createdAt,e.updated_at AS updatedAt
       FROM events e
       WHERE e.active=1
         AND (e.event_date IS NULL OR date(e.event_date)>=date('now','-1 day'))
         AND (?=1 OR EXISTS(
           SELECT 1 FROM event_categories category
           WHERE category.event_id=e.id AND category.normalized_category=?
         ))
       ORDER BY COALESCE(e.event_date,'9999-12-31') ASC,e.id DESC LIMIT 4`,
    )
      .bind(privilege ? 1 : 0, normalizedCategory)
      .all<{
        id: number;
        name: string;
        eventDate: string | null;
        location: string | null;
        createdAt: string;
        updatedAt: string;
      }>(),
    env.DB.prepare(
      `SELECT id,name,year,season,created_at AS createdAt,updated_at AS updatedAt
       FROM scholarship_campaigns WHERE active=1
       ORDER BY year DESC,id DESC LIMIT 3`,
    ).all<{
      id: number;
      name: string;
      year: number;
      season: string;
      createdAt: string;
      updatedAt: string;
    }>(),
    env.DB.prepare(
      `SELECT facebook_post_id AS facebookPostId,title,summary,
        discovered_at AS discoveredAt
       FROM facebook_news
       WHERE active=1 AND notify_eligible=1
       ORDER BY discovered_at DESC,id DESC LIMIT 4`,
    ).all<{
      facebookPostId: string;
      title: string;
      summary: string;
      discoveredAt: string;
    }>(),
  ]);

  const notifications: AppNotification[] = [];
  if (application) {
    const validity =
      application.status === "approved"
        ? await getCredentialValidity(application.id)
        : { valid: false };
    notifications.push(credentialNotification(application, validity.valid));
  }

  for (const event of events.results) {
    const details = [
      event.name,
      event.eventDate ? `Fecha: ${event.eventDate}` : null,
      event.location ? `Lugar: ${event.location}` : null,
    ].filter(Boolean);
    notifications.push({
      id: `event:${event.id}:${event.updatedAt || event.createdAt}`,
      kind: "event",
      title: "Evento sindical disponible",
      body: details.join(" · "),
      createdAt: event.updatedAt || event.createdAt,
      priority: "normal",
      target: null,
    });
  }

  for (const campaign of campaigns.results) {
    notifications.push({
      id: `scholarship:${campaign.id}:${campaign.updatedAt || campaign.createdAt}`,
      kind: "scholarship",
      title: "Becas Sinabeth disponibles",
      body: `${campaign.name} · ${campaign.season} ${campaign.year}`,
      createdAt: campaign.updatedAt || campaign.createdAt,
      priority: "normal",
      target: null,
    });
  }

  for (const item of news.results) {
    notifications.push({
      id: `news:${item.facebookPostId}`,
      kind: "news",
      title: item.title,
      body: item.summary,
      createdAt: item.discoveredAt,
      priority: "normal",
      target: "noticias",
    });
  }

  notifications.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  return Response.json(
    { notifications: notifications.slice(0, 10) },
    { headers: NO_STORE_HEADERS },
  );
}
