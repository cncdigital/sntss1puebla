import { env } from "cloudflare:workers";
import {
  createExcelWorkbook,
  excelAttachmentResponse,
} from "../../excel-response";
import { requireReader } from "../../reader/auth";
import {
  eventAccessErrorResponse,
  validateEventCredential,
} from "../credential";
import { EVENT_ENTRY_SELECT } from "../entry-select";
import { ensureEventSchema } from "../schema";

export async function GET(request: Request) {
  const reader = await requireReader(request);
  if (!reader)
    return Response.json({ error: "No autorizado" }, { status: 401 });
  await ensureEventSchema();
  const url = new URL(request.url);
  const eventId = Number(url.searchParams.get("eventId") || 0);
  if (!eventId)
    return Response.json({ error: "Selecciona un evento." }, { status: 400 });
  const exportFormat = url.searchParams.get("format");
  if (exportFormat === "csv" || exportFormat === "xlsx") {
    const event = await env.DB.prepare(
      `SELECT name,event_date AS eventDate,location FROM events WHERE id=?`,
    )
      .bind(eventId)
      .first<{ name: string; eventDate: string | null; location: string | null }>();
    if (!event)
      return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    const exportRows = await env.DB.prepare(
      `${EVENT_ENTRY_SELECT} WHERE eventId=? ORDER BY id`,
    )
      .bind(eventId)
      .all<Record<string, unknown>>();
    const csvCell = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const headers = [
      "Consecutivo del evento",
      "Fecha de acceso",
      "Nombre",
      "Matrícula",
      "Categoría",
      "CURP",
      "RFC",
      "NSS",
      "Acompañante",
      "Género acompañante",
      "QR tómbola",
    ];
    const lines = [
      headers.map(csvCell).join(","),
      ...exportRows.results.map((entry) =>
        [
          entry.eventSequence,
          entry.createdAt,
          entry.fullName,
          entry.matricula,
          entry.category,
          entry.curp,
          entry.rfc,
          entry.nss,
          entry.companion ? "Sí" : "No",
          entry.companionGender,
          entry.raffleToken,
        ].map(csvCell).join(","),
      ),
    ];
    const safeName = event.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || `evento-${eventId}`;
    if (exportFormat === "xlsx") {
      const rows = exportRows.results.map((entry) => [
        Number(entry.eventSequence || 0),
        String(entry.createdAt || ""),
        String(entry.fullName || ""),
        String(entry.matricula || ""),
        String(entry.category || ""),
        String(entry.curp || ""),
        String(entry.rfc || ""),
        String(entry.nss || ""),
        entry.companion ? "Sí" : "No",
        String(entry.companionGender || ""),
        String(entry.raffleToken || ""),
      ]);
      const bytes = createExcelWorkbook({
        title: `Padrón del evento ${event.name}`,
        dataSheetName: "Accesos",
        columns: [
          { header: "Consecutivo del evento", width: 22, numberFormat: "0" },
          { header: "Fecha de acceso", width: 21 },
          { header: "Nombre", width: 38 },
          { header: "Matrícula", width: 15 },
          { header: "Categoría", width: 32 },
          { header: "CURP", width: 21 },
          { header: "RFC", width: 17 },
          { header: "NSS", width: 16 },
          { header: "Acompañante", width: 15 },
          { header: "Género acompañante", width: 21 },
          { header: "QR tómbola", width: 52 },
        ],
        rows,
        summaryRows: [
          ["EVENTO QR · CREDENCIALES SNTSS1PUEBLA"],
          [],
          ["Evento", event.name],
          ["Fecha", event.eventDate || "No especificada"],
          ["Lugar", event.location || "No especificado"],
          ["Accesos exportados", rows.length],
          ["Fecha de exportación", new Date().toISOString()],
        ],
      });
      return excelAttachmentResponse(bytes, `padron-${safeName}.xlsx`);
    }
    const csv = `\uFEFF${lines.join("\r\n")}\r\n`;
    const fileName = `padron-${safeName}.csv`;
    const csvBytes = new TextEncoder().encode(csv);
    return new Response(csvBytes, {
      headers: {
        "content-type": "text/csv; charset=UTF-8",
        "content-disposition": `attachment; filename="${fileName}"`,
        "content-length": String(csvBytes.byteLength),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }
  const entries = await env.DB.prepare(
    `${EVENT_ENTRY_SELECT} WHERE eventId=? ORDER BY id DESC LIMIT 1000`,
  )
    .bind(eventId)
    .all<Record<string, unknown>>();
  return Response.json({
    entries: entries.results.map((entry) => ({
      ...entry,
      companion: Boolean(entry.companion),
    })),
  });
}

export async function POST(request: Request) {
  const reader = await requireReader(request);
  if (!reader)
    return Response.json({ error: "No autorizado" }, { status: 401 });
  const payload = (await request.json()) as {
    eventId?: number;
    credentialToken?: string;
    companion?: "none" | "Hombre" | "Mujer";
  };
  if (!payload.companion || !["none", "Hombre", "Mujer"].includes(payload.companion))
    return Response.json(
      { error: "Indica si la persona trae acompañante y su género." },
      { status: 400 },
    );
  try {
    const result = await validateEventCredential(
      Number(payload.eventId || 0),
      payload.credentialToken || "",
    );
    const existing = await env.DB.prepare(
      `${EVENT_ENTRY_SELECT} WHERE eventId=? AND credentialToken=?`,
    )
      .bind(result.event.id, result.credential.credentialToken)
      .first<Record<string, unknown>>();
    if (existing)
      return Response.json({
        ok: true,
        duplicate: true,
        event: result.event,
        entry: { ...existing, companion: Boolean(existing.companion) },
      });

    const companion = payload.companion !== "none";
    const companionGender = companion ? payload.companion : null;
    const raffleToken = `S1P-E${result.event.id}-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
    try {
      await env.DB.prepare(
        `INSERT INTO event_entries
          (event_id,credential_token,full_name,matricula,category,curp,rfc,nss,
           companion,companion_gender,raffle_token,reader_actor)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          result.event.id,
          result.credential.credentialToken,
          result.credential.fullName,
          result.credential.matricula,
          result.credential.category,
          result.credential.curp,
          result.credential.rfc,
          result.credential.nss,
          companion ? 1 : 0,
          companionGender,
          raffleToken,
          reader.email,
        )
        .run();
    } catch (insertError) {
      const concurrentEntry = await env.DB.prepare(
        `${EVENT_ENTRY_SELECT} WHERE eventId=? AND credentialToken=?`,
      )
        .bind(result.event.id, result.credential.credentialToken)
        .first<Record<string, unknown>>();
      if (concurrentEntry)
        return Response.json({
          ok: true,
          duplicate: true,
          event: result.event,
          entry: { ...concurrentEntry, companion: Boolean(concurrentEntry.companion) },
        });
      throw insertError;
    }
    const entry = await env.DB.prepare(`${EVENT_ENTRY_SELECT} WHERE raffleToken=?`)
      .bind(raffleToken)
      .first<Record<string, unknown>>();
    return Response.json(
      {
        ok: true,
        duplicate: false,
        event: result.event,
        entry: entry ? { ...entry, companion: Boolean(entry.companion) } : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return eventAccessErrorResponse(error);
  }
}
