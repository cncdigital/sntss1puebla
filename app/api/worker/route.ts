import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { workers } from "../../../db/schema";
import { getPrivilege, getWorkerSession } from "../authz";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

export async function GET(request: Request) {
  const matricula =
    new URL(request.url).searchParams
      .get("matricula")
      ?.replace(/\D/g, "") ?? "";
  if (matricula.length < 4)
    return Response.json(
      { error: "Matrícula inválida" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const [session, privilege] = await Promise.all([
    getWorkerSession(request),
    getPrivilege(request),
  ]);
  if (
    session?.matricula !== matricula &&
    !privilege?.canAdmin &&
    !privilege?.canReview
  )
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const [worker] = await getDb()
    .select({
      matricula: workers.matricula,
      fullName: workers.fullName,
      unit: workers.unit,
      active: workers.active,
    })
    .from(workers)
    .where(eq(workers.matricula, matricula))
    .limit(1);
  if (!worker || !worker.active)
    return Response.json(
      { error: "La matrícula no se encuentra activa en el padrón" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  return Response.json({ worker }, { headers: NO_STORE_HEADERS });
}
