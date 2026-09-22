import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../../authz";
import {
  buildTrainingChunks,
  cleanTrainingText,
  extractTrainingDocument,
  TRAINING_ACCEPT,
  unsafeTrainingContentReasons,
  type TrainingChunk,
} from "../../../devi/training-documents";
import { normalizeSearchText } from "../../../devi/relevance";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

type TrainingKind = "manual" | "correction" | "document";

type TrainingSourceRow = {
  id: number;
  title: string;
  kind: TrainingKind;
  referenceLabel: string | null;
  summary: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number;
  characterCount: number;
  chunkCount: number;
  uploadedBy: string;
  active: number;
  createdAt: string;
  updatedAt: string;
};

function safeTitle(value: unknown, fallback = "Conocimiento para DeVi") {
  return cleanTrainingText(String(value ?? "")).slice(0, 160) || fallback;
}

function safeReference(value: unknown) {
  return cleanTrainingText(String(value ?? "")).slice(0, 280) || null;
}

function assertSafeTrainingMetadata(...values: Array<string | null>) {
  const unsafe = unsafeTrainingContentReasons(values.filter(Boolean).join("\n"));
  if (unsafe.length)
    throw new Error(`unsafe_training_content:${unsafe.join("|")}`);
}

function safeFileName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "documento";
}

async function sha256Hex(value: string | Uint8Array) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function removePartialSource(sourceId: number, storageKey: string | null) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM devi_training_chunks WHERE source_id=?").bind(
      sourceId,
    ),
    env.DB.prepare("DELETE FROM devi_training_sources WHERE id=?").bind(sourceId),
  ]).catch(() => undefined);
  if (storageKey) await env.BUCKET.delete(storageKey).catch(() => undefined);
}

async function insertTrainingSource(input: {
  title: string;
  kind: TrainingKind;
  referenceLabel: string | null;
  summary: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number;
  storageKey: string | null;
  contentSha256: string;
  characterCount: number;
  chunks: TrainingChunk[];
  actor: string;
}) {
  let sourceId = 0;
  try {
    const created = await env.DB.prepare(
      `INSERT INTO devi_training_sources
        (title,normalized_title,kind,reference_label,summary,original_name,mime_type,
         size_bytes,storage_key,content_sha256,character_count,chunk_count,uploaded_by,
         active,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       RETURNING id`,
    )
      .bind(
        input.title,
        normalizeSearchText(input.title),
        input.kind,
        input.referenceLabel,
        input.summary,
        input.originalName,
        input.mimeType,
        input.sizeBytes,
        input.storageKey,
        input.contentSha256,
        input.characterCount,
        input.chunks.length,
        input.actor,
      )
      .first<{ id: number }>();
    sourceId = Number(created?.id || 0);
    if (!sourceId) throw new Error("source_not_created");
    for (let offset = 0; offset < input.chunks.length; offset += 75) {
      const statements = input.chunks.slice(offset, offset + 75).map((chunk) =>
        env.DB.prepare(
          `INSERT INTO devi_training_chunks
            (source_id,chunk_index,locator,content,normalized_content,created_at)
           VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)`,
        ).bind(
          sourceId,
          chunk.index,
          chunk.locator,
          chunk.content,
          chunk.normalizedContent,
        ),
      );
      await env.DB.batch(statements);
    }
    await audit(
      input.actor,
      "devi.training-added",
      "devi_training_source",
      sourceId,
      JSON.stringify({
        title: input.title,
        kind: input.kind,
        chunks: input.chunks.length,
        fileName: input.originalName,
      }),
    );
    return sourceId;
  } catch (error) {
    if (sourceId) await removePartialSource(sourceId, input.storageKey);
    else if (input.storageKey)
      await env.BUCKET.delete(input.storageKey).catch(() => undefined);
    if (
      error instanceof Error &&
      /UNIQUE|constraint|content_sha256/i.test(error.message)
    )
      throw new Error("duplicate_training_source");
    throw error;
  }
}

function manualTrainingPayload(body: Record<string, unknown>) {
  const kind: TrainingKind = body.kind === "correction" ? "correction" : "manual";
  if (body.privacyConfirmed !== true)
    throw new Error("privacy_confirmation_required");
  const title = safeTitle(
    body.title,
    kind === "correction" ? "Corrección validada" : "Conocimiento manual",
  );
  const referenceLabel = safeReference(body.referenceLabel);
  let content = "";
  if (kind === "correction") {
    const question = cleanTrainingText(String(body.question ?? "")).slice(0, 1_800);
    const incorrectAnswer = cleanTrainingText(
      String(body.incorrectAnswer ?? ""),
    ).slice(0, 3_000);
    const correction = cleanTrainingText(String(body.correction ?? "")).slice(
      0,
      12_000,
    );
    if (question.length < 12 || correction.length < 40)
      throw new Error("invalid_correction");
    content = [
      `TEMA O PREGUNTA CORREGIDA\n${question}`,
      incorrectAnswer
        ? `RESPUESTA INCORRECTA DETECTADA\n${incorrectAnswer}`
        : "",
      `CORRECCIÓN VALIDADA POR EL ENTRENADOR DE DEVI\n${correction}`,
      referenceLabel ? `FUENTE O REFERENCIA\n${referenceLabel}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  } else {
    content = cleanTrainingText(String(body.content ?? "")).slice(0, 100_000);
    if (title.length < 4 || content.length < 80)
      throw new Error("invalid_manual_knowledge");
  }
  assertSafeTrainingMetadata(title, referenceLabel, content);
  const chunks = buildTrainingChunks([
    {
      locator:
        kind === "correction"
          ? "Corrección validada por Entrenador de DeVi"
          : "Información proporcionada por Entrenador de DeVi",
      text: content,
    },
  ]);
  return {
    kind,
    title,
    referenceLabel,
    content,
    chunks,
    summary: chunks[0]?.content.slice(0, 500) || content.slice(0, 500),
  };
}

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "deviTrainer");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const parameters = new URL(request.url).searchParams;
  const downloadId = Number(parameters.get("download") || 0);
  if (downloadId > 0) {
    const source = await env.DB.prepare(
      `SELECT original_name AS originalName,mime_type AS mimeType,storage_key AS storageKey
       FROM devi_training_sources WHERE id=?`,
    )
      .bind(downloadId)
      .first<{
        originalName: string | null;
        mimeType: string | null;
        storageKey: string | null;
      }>();
    if (!source?.storageKey)
      return Response.json(
        { error: "Esta fuente no tiene un archivo original." },
        { status: 404 },
      );
    const object = await env.BUCKET.get(source.storageKey);
    if (!object)
      return Response.json({ error: "Archivo no disponible." }, { status: 404 });
    const fileName = safeFileName(source.originalName || "documento");
    return new Response(object.body, {
      headers: {
        "content-type": source.mimeType || "application/octet-stream",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  }
  const [sources, totals] = await Promise.all([
    env.DB.prepare(
      `SELECT id,title,kind,reference_label AS referenceLabel,summary,
        original_name AS originalName,mime_type AS mimeType,size_bytes AS sizeBytes,
        character_count AS characterCount,chunk_count AS chunkCount,
        uploaded_by AS uploadedBy,active,created_at AS createdAt,updated_at AS updatedAt
       FROM devi_training_sources ORDER BY active DESC,updated_at DESC LIMIT 250`,
    ).all<TrainingSourceRow>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS totalSources,
        COALESCE(SUM(CASE WHEN active=1 THEN 1 ELSE 0 END),0) AS activeSources,
        COALESCE(SUM(CASE WHEN active=1 THEN chunk_count ELSE 0 END),0) AS activeChunks,
        COALESCE(SUM(CASE WHEN kind='correction' AND active=1 THEN 1 ELSE 0 END),0) AS activeCorrections
       FROM devi_training_sources`,
    ).first<Record<string, number>>(),
  ]);
  return Response.json(
    {
      sources: sources.results,
      stats: {
        totalSources: Number(totals?.totalSources || 0),
        activeSources: Number(totals?.activeSources || 0),
        activeChunks: Number(totals?.activeChunks || 0),
        activeCorrections: Number(totals?.activeCorrections || 0),
      },
      acceptedFormats: TRAINING_ACCEPT,
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "deviTrainer");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  if (privilege.mustChangePin)
    return Response.json(
      { error: "Cambia primero la contraseña temporal de tu perfil de Entrenador." },
      { status: 428, headers: NO_STORE_HEADERS },
    );
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      if (form.get("privacyConfirmed") !== "true")
        return Response.json(
          { error: "Confirma que el archivo no contiene datos personales ni secretos." },
          { status: 400 },
        );
      const file = form.get("file");
      if (!(file instanceof File))
        return Response.json({ error: "Selecciona un documento." }, { status: 400 });
      const extracted = await extractTrainingDocument(file);
      const title = safeTitle(form.get("title"), extracted.defaultTitle);
      const referenceLabel = safeReference(form.get("referenceLabel"));
      assertSafeTrainingMetadata(file.name, title, referenceLabel);
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const contentSha256 = await sha256Hex(fileBytes);
      const storageKey = `devi-training/${new Date()
        .toISOString()
        .slice(0, 10)}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
      await env.BUCKET.put(storageKey, fileBytes, {
        httpMetadata: {
          contentType: file.type || "application/octet-stream",
        },
        customMetadata: {
          uploadedBy: privilege.actor,
          purpose: "devi-training-source",
        },
      });
      const sourceId = await insertTrainingSource({
        title,
        kind: "document",
        referenceLabel,
        summary: extracted.summary,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        storageKey,
        contentSha256,
        characterCount: extracted.characterCount,
        chunks: extracted.chunks,
        actor: privilege.actor,
      });
      return Response.json(
        {
          ok: true,
          sourceId,
          title,
          chunks: extracted.chunks.length,
          characters: extracted.characterCount,
          message: "Documento incorporado a la base activa de DeVi.",
        },
        { status: 201, headers: NO_STORE_HEADERS },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = manualTrainingPayload(body);
    const contentSha256 = await sha256Hex(
      JSON.stringify({
        title: parsed.title,
        kind: parsed.kind,
        content: parsed.content,
      }),
    );
    const sourceId = await insertTrainingSource({
      title: parsed.title,
      kind: parsed.kind,
      referenceLabel: parsed.referenceLabel,
      summary: parsed.summary,
      originalName: null,
      mimeType: "text/plain;charset=utf-8",
      sizeBytes: new TextEncoder().encode(parsed.content).byteLength,
      storageKey: null,
      contentSha256,
      characterCount: parsed.content.length,
      chunks: parsed.chunks,
      actor: privilege.actor,
    });
    return Response.json(
      {
        ok: true,
        sourceId,
        title: parsed.title,
        chunks: parsed.chunks.length,
        characters: parsed.content.length,
        message:
          parsed.kind === "correction"
            ? "Corrección incorporada y priorizada en la base de DeVi."
            : "Información incorporada a la base activa de DeVi.",
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "training_failed";
    if (message === "duplicate_training_source")
      return Response.json(
        { error: "Este contenido ya existe en la base de DeVi." },
        { status: 409 },
      );
    if (message === "privacy_confirmation_required")
      return Response.json(
        { error: "Confirma que el contenido no incluye datos personales ni secretos." },
        { status: 400 },
      );
    if (message === "invalid_correction")
      return Response.json(
        { error: "Escribe la pregunta o tema y una corrección de al menos 40 caracteres." },
        { status: 400 },
      );
    if (message === "invalid_manual_knowledge")
      return Response.json(
        { error: "Agrega un título y por lo menos 80 caracteres de información." },
        { status: 400 },
      );
    if (message.startsWith("unsafe_training_content:"))
      return Response.json(
        {
          error: `Retira del texto ${message
            .slice("unsafe_training_content:".length)
            .split("|")
            .join(", ")} antes de incorporarlo.`,
        },
        { status: 400 },
      );
    console.error("devi.training-failed", {
      reason: message.slice(0, 180),
      actor: privilege.actor,
    });
    return Response.json(
      {
        error:
          message !== "training_failed" && !message.includes("source_not_created")
            ? message
            : "No fue posible incorporar el contenido. Intenta nuevamente.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const privilege = await requirePrivilege(request, "deviTrainer");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  if (privilege.mustChangePin)
    return Response.json(
      { error: "Cambia primero la contraseña temporal de tu perfil de Entrenador." },
      { status: 428, headers: NO_STORE_HEADERS },
    );
  let body: { id?: number; active?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const id = Number(body.id || 0);
  if (!Number.isInteger(id) || id <= 0 || typeof body.active !== "boolean")
    return Response.json({ error: "Fuente o estado inválido." }, { status: 400 });
  const result = await env.DB.prepare(
    `UPDATE devi_training_sources SET active=?,updated_at=CURRENT_TIMESTAMP
     WHERE id=? RETURNING title`,
  )
    .bind(body.active ? 1 : 0, id)
    .first<{ title: string }>();
  if (!result)
    return Response.json({ error: "Fuente no encontrada." }, { status: 404 });
  await audit(
    privilege.actor,
    body.active ? "devi.training-activated" : "devi.training-deactivated",
    "devi_training_source",
    id,
    result.title,
  );
  return Response.json(
    {
      ok: true,
      message: body.active
        ? "La fuente volvió a estar disponible para DeVi."
        : "La fuente quedó desactivada y DeVi dejará de consultarla.",
    },
    { headers: NO_STORE_HEADERS },
  );
}
