import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../../authz";
import { ensureEventSchema } from "../../events/schema";

type WorkerInput = {
  matricula?: string;
  fullName?: string;
  category?: string;
  unit?: string;
  curp?: string;
  rfc?: string;
  nss?: string;
  email?: string;
  phone?: string;
  active?: boolean;
};

export async function GET(request: Request) {
  await ensureEventSchema();
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const parameters = new URL(request.url).searchParams;
  const search = parameters.get("q")?.trim() ?? "";
  const exportAll = parameters.get("export") === "1";
  const result = exportAll
    ? await env.DB.prepare(
        `SELECT w.matricula,w.full_name AS fullName,w.category,w.unit,w.curp,wt.rfc,
          w.nss,w.email,w.phone,w.active,w.updated_at AS updatedAt
         FROM workers w LEFT JOIN worker_tax_ids wt ON wt.matricula=w.matricula
         ORDER BY w.full_name,w.matricula`,
      ).all()
    : search
    ? await env.DB.prepare(
        `SELECT w.matricula,w.full_name AS fullName,w.category,w.unit,w.curp,wt.rfc,
          w.nss,w.email,w.phone,w.active,w.updated_at AS updatedAt
         FROM workers w LEFT JOIN worker_tax_ids wt ON wt.matricula=w.matricula
         WHERE w.matricula LIKE ? OR w.full_name LIKE ? ORDER BY w.full_name LIMIT 150`,
      )
        .bind(`%${search}%`, `%${search.toUpperCase()}%`)
        .all()
    : await env.DB.prepare(
        `SELECT w.matricula,w.full_name AS fullName,w.category,w.unit,w.curp,wt.rfc,
          w.nss,w.email,w.phone,w.active,w.updated_at AS updatedAt
         FROM workers w LEFT JOIN worker_tax_ids wt ON wt.matricula=w.matricula
         ORDER BY w.id DESC LIMIT 150`,
      ).all();
  if (exportAll)
    await audit(
      privilege.actor,
      "workers.exported",
      "worker",
      null,
      `${result.results.length} filas`,
    );
  return Response.json(
    { workers: result.results, total: result.results.length },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  await ensureEventSchema();
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  let payload: { rows?: WorkerInput[]; mode?: "create" | "upsert" };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const mode = payload.mode === "create" ? "create" : "upsert";
  if (rows.length > 25_000)
    return Response.json(
      { error: "El archivo supera el máximo de 25,000 filas por carga." },
      { status: 413 },
    );
  const normalized = rows.map((unsafeRow) => {
    const row = unsafeRow && typeof unsafeRow === "object" ? unsafeRow : {};
    const nss = row.nss?.replace(/\D/g, "") || "";
    const rfc =
      row.rfc
        ?.trim()
        .toUpperCase()
        .replace(/[^A-Z0-9Ñ&]/g, "") || "";
    return {
      matricula: row.matricula?.replace(/\D/g, "") ?? "",
      fullName: row.fullName?.trim().toUpperCase() ?? "",
      category: row.category?.trim() || null,
      unit: row.unit?.trim() || null,
      curp: row.curp?.trim().toUpperCase() || null,
      rfc: rfc || null,
      nss: nss ? (mode === "create" ? nss : nss.padStart(11, "0")) : null,
      email: row.email?.trim().toLowerCase() || null,
      phone: row.phone?.trim() || null,
      active: row.active === true ? 1 : row.active === false ? 0 : null,
    };
  });
  const accepted = normalized.filter(
    (row) => row.matricula.length >= 4 && row.fullName.length >= 5,
  );
  const uniqueRows = new Map(accepted.map((row) => [row.matricula, row]));
  const valid = [...uniqueRows.values()];
  const skipped = normalized.length - accepted.length;
  const duplicates = accepted.length - valid.length;
  if (!valid.length)
    return Response.json({ error: "No se encontraron filas válidas." }, { status: 400 });
  if (mode === "create") {
    if (valid.length !== 1)
      return Response.json({ error: "Agrega una matrícula a la vez." }, { status: 400 });
    const row = valid[0];
    if (row.curp && !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(row.curp))
      return Response.json({ error: "La CURP no tiene un formato válido." }, { status: 400 });
    if (row.nss && row.nss.length !== 11)
      return Response.json({ error: "El NSS debe contener 11 dígitos." }, { status: 400 });
    if (row.rfc && ![12, 13].includes(row.rfc.length))
      return Response.json({ error: "El RFC debe contener 12 o 13 caracteres." }, { status: 400 });
    const existing = await env.DB.prepare(
      "SELECT matricula FROM workers WHERE matricula=? LIMIT 1",
    )
      .bind(row.matricula)
      .first();
    if (existing)
      return Response.json(
        { error: "La matrícula ya existe. Búscala para modificar sus datos." },
        { status: 409 },
      );
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO workers
          (matricula,full_name,category,unit,curp,nss,email,phone,active,updated_at)
         VALUES (?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP)`,
      ).bind(
          row.matricula,
          row.fullName,
          row.category,
          row.unit,
          row.curp,
          row.nss,
          row.email,
          row.phone,
        ),
      env.DB.prepare(
        `INSERT INTO worker_tax_ids (matricula,rfc,updated_at)
         VALUES (?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(matricula) DO UPDATE SET rfc=excluded.rfc,updated_at=CURRENT_TIMESTAMP`,
      ).bind(row.matricula, row.rfc),
    ]);
    await audit(privilege.actor, "worker.created", "worker", row.matricula);
    return Response.json({ ok: true, imported: 1, created: 1 }, { status: 201 });
  }
  const existing = await env.DB.prepare("SELECT matricula FROM workers").all<{
    matricula: string;
  }>();
  const existingMatriculas = new Set(
    existing.results.map((row: { matricula: string }) => row.matricula),
  );
  const created = valid.filter(
    (row) => !existingMatriculas.has(row.matricula),
  ).length;
  const updated = valid.length - created;
  const statements = [];
  const chunkSize = 1_500;
  for (let offset = 0; offset < valid.length; offset += chunkSize) {
    const chunk = valid.slice(offset, offset + chunkSize);
    const chunkJson = JSON.stringify(chunk);
    statements.push(
      env.DB.prepare(
        `INSERT INTO workers
          (matricula,full_name,category,unit,curp,nss,email,phone,active,updated_at)
         SELECT
           json_extract(input.value,'$.matricula'),
           json_extract(input.value,'$.fullName'),
           COALESCE(json_extract(input.value,'$.category'),existing_worker.category),
           COALESCE(json_extract(input.value,'$.unit'),existing_worker.unit),
           COALESCE(json_extract(input.value,'$.curp'),existing_worker.curp),
           COALESCE(json_extract(input.value,'$.nss'),existing_worker.nss),
           COALESCE(json_extract(input.value,'$.email'),existing_worker.email),
           COALESCE(json_extract(input.value,'$.phone'),existing_worker.phone),
           COALESCE(json_extract(input.value,'$.active'),existing_worker.active,1),
           CURRENT_TIMESTAMP
         FROM json_each(?) input
         LEFT JOIN workers existing_worker
           ON existing_worker.matricula=json_extract(input.value,'$.matricula')
         WHERE 1
         ON CONFLICT(matricula) DO UPDATE SET
           full_name=excluded.full_name,category=excluded.category,unit=excluded.unit,
           curp=excluded.curp,nss=excluded.nss,email=excluded.email,phone=excluded.phone,
           active=excluded.active,updated_at=CURRENT_TIMESTAMP`,
      ).bind(chunkJson),
      env.DB.prepare(
        `INSERT INTO worker_tax_ids (matricula,rfc,updated_at)
         SELECT json_extract(value,'$.matricula'),json_extract(value,'$.rfc'),CURRENT_TIMESTAMP
         FROM json_each(?)
         WHERE json_extract(value,'$.rfc') IS NOT NULL
         ON CONFLICT(matricula) DO UPDATE SET
           rfc=excluded.rfc,updated_at=CURRENT_TIMESTAMP`,
      ).bind(chunkJson),
    );
  }
  await env.DB.batch(statements);
  await audit(
    privilege.actor,
    "workers.imported",
    "worker",
    null,
    JSON.stringify({
      received: rows.length,
      imported: valid.length,
      created,
      updated,
      skipped,
      duplicates,
    }),
  );
  return Response.json({
    ok: true,
    imported: valid.length,
    created,
    updated,
    skipped,
    duplicates,
  });
}

export async function PATCH(request: Request) {
  await ensureEventSchema();
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const row = (await request.json()) as WorkerInput;
  const matricula = row.matricula?.replace(/\D/g, "") ?? "";
  const fullName = row.fullName?.trim().toUpperCase() ?? "";
  if (!matricula || !fullName)
    return Response.json({ error: "Matrícula y nombre son obligatorios." }, { status: 400 });
  const rfc = row.rfc
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ&]/g, "") || null;
  if (rfc && ![12, 13].includes(rfc.length))
    return Response.json({ error: "El RFC debe contener 12 o 13 caracteres." }, { status: 400 });
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE workers SET full_name=?,category=?,unit=?,curp=?,nss=?,email=?,phone=?,active=?,
        updated_at=CURRENT_TIMESTAMP WHERE matricula=?`,
    ).bind(
        fullName,
        row.category?.trim() || null,
        row.unit?.trim() || null,
        row.curp?.trim().toUpperCase() || null,
        row.nss?.replace(/\D/g, "").padStart(11, "0") || null,
        row.email?.trim().toLowerCase() || null,
        row.phone?.trim() || null,
        row.active === false ? 0 : 1,
        matricula,
      ),
    env.DB.prepare(
      `INSERT INTO worker_tax_ids (matricula,rfc,updated_at)
       VALUES (?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(matricula) DO UPDATE SET rfc=excluded.rfc,updated_at=CURRENT_TIMESTAMP`,
    ).bind(matricula, rfc),
  ]);
  await audit(privilege.actor, "worker.updated", "worker", matricula);
  return Response.json({ ok: true });
}
