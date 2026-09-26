import { audit, requirePrivilege } from "../../../authz";
import { saveCommercialInterval } from "../../../news/radio-settings";

export async function PATCH(request: Request) {
  const privilege = await requirePrivilege(request, "news");
  if (!privilege) return Response.json({ error: "No autorizado" }, { status: 403 });
  let interval: unknown;
  try { interval = (await request.json() as { intervalMinutes?: unknown }).intervalMinutes; }
  catch { return Response.json({ error: "Solicitud no válida" }, { status: 400 }); }
  try {
    const settings = await saveCommercialInterval(interval as number, privilege.actor);
    await audit(privilege.actor, "news_mp3.commercial_interval_updated", "news_settings", "primary", String(interval));
    return Response.json({ commercialIntervalMinutes: settings.commercialIntervalMinutes });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se guardó el intervalo." }, { status: 400 });
  }
}
