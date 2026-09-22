import { env } from "cloudflare:workers";
import { audit, getPrivilege, requirePrivilege } from "../../authz";

export async function GET(request: Request) {
  const privilege = await getPrivilege(request);
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const result = await env.DB.prepare(
    "SELECT id,name,active FROM facilities WHERE active=1 ORDER BY name",
  ).all();
  return Response.json({ facilities: result.results });
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const { name = "" } = (await request.json()) as { name?: string };
  if (name.trim().length < 3)
    return Response.json({ error: "Escribe un nombre válido." }, { status: 400 });
  await env.DB.prepare(
    "INSERT INTO facilities (name,active) VALUES (?,1) ON CONFLICT(name) DO UPDATE SET active=1",
  )
    .bind(name.trim())
    .run();
  await audit(privilege.actor, "facility.created", "facility", name.trim());
  return Response.json({ ok: true });
}

