import { audit, requirePrivilege } from "../../authz";
import {
  facebookNewsPublicStatus,
  syncFacebookNews,
} from "../../news/meta";
import {
  getNewsSettings,
  saveNewsRadioStreamUrl,
} from "../../news/radio-settings";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

async function administrator(request: Request) {
  return requirePrivilege(request, "admin");
}

export async function GET(request: Request) {
  if (!(await administrator(request)))
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const [settings, meta] = await Promise.all([
    getNewsSettings(),
    facebookNewsPublicStatus(),
  ]);
  return Response.json({ settings, meta }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const privilege = await administrator(request);
  if (!privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const sync = await syncFacebookNews({ force: true });
  await audit(
    privilege.actor,
    "facebook_news.manual_sync",
    "facebook_news",
    null,
    `${sync.status}:${sync.processed}`,
  );
  const meta = await facebookNewsPublicStatus();
  return Response.json({ sync, meta }, { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: Request) {
  const privilege = await administrator(request);
  if (!privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  let body: { radioStreamUrl?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "La solicitud está vacía o incompleta." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const settings = await saveNewsRadioStreamUrl(
      body.radioStreamUrl || "",
      privilege.actor,
    );
    await audit(
      privilege.actor,
      "news_radio.url_updated",
      "news_settings",
      "primary",
    );
    return Response.json({ settings }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible guardar la dirección de radio.",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}
