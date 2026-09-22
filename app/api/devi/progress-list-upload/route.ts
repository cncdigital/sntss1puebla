import { env } from "cloudflare:workers";
import { getPrivilege } from "../../authz";
import {
  MAX_PROGRESS_FILE_BYTES,
  PROGRESS_LIST_ACCEPT,
} from "../../../devi/progress-lists";
import {
  PROGRESS_UPLOAD_CHUNK_BYTES,
  progressUploadPartCount,
  progressUploadPartSize,
} from "../../../devi/progress-upload";
import { POST as incorporateProgressList } from "../progress-lists/route";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

type UploadManifest = {
  uploadId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  totalParts: number;
  createdAt: string;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function validUploadId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function actorNamespace(actor: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(actor),
  );
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function uploadPrefix(actor: string, uploadId: string) {
  return `devi-progress-upload-parts/${await actorNamespace(actor)}/${uploadId}`;
}

async function loadManifest(actor: string, uploadId: string) {
  if (!validUploadId(uploadId)) return null;
  const prefix = await uploadPrefix(actor, uploadId);
  const object = await env.BUCKET.get(`${prefix}/manifest.json`);
  if (!object) return null;
  try {
    const parsed = JSON.parse(await object.text()) as UploadManifest;
    return parsed.uploadId === uploadId ? { manifest: parsed, prefix } : null;
  } catch {
    return null;
  }
}

async function removeUpload(prefix: string, totalParts: number) {
  const keys = [
    `${prefix}/manifest.json`,
    ...Array.from(
      { length: Math.max(0, Math.min(totalParts, 40)) },
      (_, index) => `${prefix}/part-${index}`,
    ),
  ];
  await env.BUCKET.delete(keys);
}

async function requireUploader(request: Request) {
  const privilege = await getPrivilege(request);
  if (
    !privilege ||
    (!privilege.canAdmin &&
      !privilege.canTrainDevi &&
      !privilege.canManageActs)
  )
    return {
      response: Response.json(
        { error: "No autorizado" },
        { status: 403, headers: NO_STORE_HEADERS },
      ),
      privilege: null,
    };
  if (privilege.mustChangePin)
    return {
      response: Response.json(
        { error: "Cambia primero la contraseña temporal del perfil protegido de DeVi." },
        { status: 428, headers: NO_STORE_HEADERS },
      ),
      privilege: null,
    };
  return { response: null, privilege };
}

export async function POST(request: Request) {
  const access = await requireUploader(request);
  if (!access.privilege) return access.response!;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Solicitud de carga inválida." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const action = cleanText(body.action, 20);
  if (action === "start") {
    const fileName = cleanText(body.fileName, 180);
    const fileType = cleanText(body.fileType, 120) || "application/octet-stream";
    const fileSize = Number(body.fileSize || 0);
    const totalParts = Number(body.totalParts || 0);
    if (!/\.(xlsx|xls|csv|pdf)$/i.test(fileName))
      return Response.json(
        {
          error: `Formato no permitido. Usa ${PROGRESS_LIST_ACCEPT}.`,
        },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    if (
      !Number.isSafeInteger(fileSize) ||
      fileSize <= 0 ||
      fileSize > MAX_PROGRESS_FILE_BYTES
    )
      return Response.json(
        { error: "El archivo está vacío o supera el límite de 15 MB." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    if (totalParts !== progressUploadPartCount(fileSize))
      return Response.json(
        { error: "La división del archivo no es válida." },
        { status: 400, headers: NO_STORE_HEADERS },
      );

    const uploadId = crypto.randomUUID();
    const prefix = await uploadPrefix(access.privilege.actor, uploadId);
    const manifest: UploadManifest = {
      uploadId,
      fileName,
      fileType,
      fileSize,
      totalParts,
      createdAt: new Date().toISOString(),
    };
    await env.BUCKET.put(
      `${prefix}/manifest.json`,
      JSON.stringify(manifest),
      {
        httpMetadata: { contentType: "application/json" },
        customMetadata: {
          uploadedBy: access.privilege.actor,
          purpose: "devi-progress-list-temporary-upload",
        },
      },
    );
    return Response.json(
      { ok: true, uploadId, chunkBytes: PROGRESS_UPLOAD_CHUNK_BYTES, totalParts },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  }

  if (action !== "finish")
    return Response.json(
      { error: "Acción de carga no reconocida." },
      { status: 400, headers: NO_STORE_HEADERS },
    );

  const uploadId = cleanText(body.uploadId, 80);
  const stored = await loadManifest(access.privilege.actor, uploadId);
  if (!stored)
    return Response.json(
      { error: "La carga temporal no existe o ya venció. Selecciona el archivo nuevamente." },
      { status: 404, headers: NO_STORE_HEADERS },
    );

  try {
    const assembled = new Uint8Array(stored.manifest.fileSize);
    for (let index = 0; index < stored.manifest.totalParts; index += 1) {
      const object = await env.BUCKET.get(`${stored.prefix}/part-${index}`);
      if (!object)
        return Response.json(
          { error: `Falta el fragmento ${index + 1} del archivo. Intenta subirlo nuevamente.` },
          { status: 409, headers: NO_STORE_HEADERS },
        );
      const part = new Uint8Array(await object.arrayBuffer());
      if (part.byteLength !== progressUploadPartSize(stored.manifest.fileSize, index))
        return Response.json(
          { error: `El fragmento ${index + 1} está incompleto. Intenta subirlo nuevamente.` },
          { status: 409, headers: NO_STORE_HEADERS },
        );
      assembled.set(part, index * PROGRESS_UPLOAD_CHUNK_BYTES);
    }

    const form = new FormData();
    form.set(
      "file",
      new File([assembled], stored.manifest.fileName, {
        type: stored.manifest.fileType,
      }),
    );
    form.set("title", cleanText(body.title, 160));
    form.set("processType", cleanText(body.processType, 40));
    form.set("customProcessLabel", cleanText(body.customProcessLabel, 100));
    form.set("referenceLabel", cleanText(body.referenceLabel, 280));
    const replaceListId = Number(body.replaceListId || 0);
    if (replaceListId > 0) form.set("replaceListId", String(replaceListId));

    const forwardedHeaders = new Headers();
    for (const headerName of [
      "cookie",
      "oai-authenticated-user-email",
      "oai-authenticated-user-full-name",
      "oai-authenticated-user-full-name-encoding",
    ]) {
      const value = request.headers.get(headerName);
      if (value) forwardedHeaders.set(headerName, value);
    }
    return incorporateProgressList(
      new Request(request.url, {
        method: "POST",
        headers: forwardedHeaders,
        body: form,
      }),
    );
  } finally {
    await removeUpload(stored.prefix, stored.manifest.totalParts).catch((error) =>
      console.error("devi.progress-upload-cleanup-failed", {
        uploadId,
        error,
      }),
    );
  }
}

export async function PUT(request: Request) {
  const access = await requireUploader(request);
  if (!access.privilege) return access.response!;
  const parameters = new URL(request.url).searchParams;
  const uploadId = cleanText(parameters.get("uploadId"), 80);
  const partIndex = Number(parameters.get("part"));
  const stored = await loadManifest(access.privilege.actor, uploadId);
  if (!stored)
    return Response.json(
      { error: "La carga temporal no existe o ya venció." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  const expectedSize = progressUploadPartSize(stored.manifest.fileSize, partIndex);
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (!expectedSize || (declaredSize && declaredSize !== expectedSize))
    return Response.json(
      { error: "El fragmento del archivo no tiene el tamaño esperado." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength !== expectedSize)
    return Response.json(
      { error: "El fragmento del archivo llegó incompleto." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  await env.BUCKET.put(`${stored.prefix}/part-${partIndex}`, bytes, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { purpose: "devi-progress-list-temporary-part" },
  });
  return Response.json(
    { ok: true, part: partIndex },
    { headers: NO_STORE_HEADERS },
  );
}

export async function DELETE(request: Request) {
  const access = await requireUploader(request);
  if (!access.privilege) return access.response!;
  const uploadId = cleanText(new URL(request.url).searchParams.get("uploadId"), 80);
  const stored = await loadManifest(access.privilege.actor, uploadId);
  if (stored)
    await removeUpload(stored.prefix, stored.manifest.totalParts).catch(() => undefined);
  return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
