import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../../../authz";
import { listNewsMp3Tracks } from "../../../news/mp3-library";
import { findDuplicateMp3 } from "../../../../news/mp3-duplicate";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};
const MAX_MP3_BYTES = 80 * 1024 * 1024;
const MAX_PART_BYTES = 5 * 1024 * 1024;

function titleFromFileName(fileName: string) {
  return fileName
    .replace(/\.mp3$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "Audio sindical";
}

function jsonHeaders() {
  return { ...NO_STORE_HEADERS, "content-type": "application/json; charset=utf-8" };
}

function validMp3Name(value: unknown) {
  return typeof value === "string" && value.toLowerCase().endsWith(".mp3");
}

function validVariantBitrate(value: unknown): value is 96 | 192 {
  return Number(value) === 96 || Number(value) === 192;
}

function variantStorageKey(originalKey: string, bitrate: 96 | 192) {
  return originalKey.replace(/\.mp3$/i, `.${bitrate}.mp3`);
}

type ExistingMp3 = { id: number; title: string; artist: string; album: string; lyrics: string; fileName: string; storageKey: string };

async function matchingTrack(title: string, artist: string, fileName: string, kind: string = "song") {
  const rows = await env.DB.prepare("SELECT id,title,artist,album,lyrics,file_name AS fileName,storage_key AS storageKey FROM news_mp3_library WHERE active=1 AND kind=?").bind(kind).all<ExistingMp3>();
  return findDuplicateMp3(rows.results, { title, artist, fileName });
}

async function jsonBody(request: Request) {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "news");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403, headers: NO_STORE_HEADERS });
  return Response.json({ tracks: await listNewsMp3Tracks(), commercials: await listNewsMp3Tracks("commercial") }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "news");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403, headers: NO_STORE_HEADERS });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action === "part") {
    const key = url.searchParams.get("key") || "";
    const uploadId = url.searchParams.get("uploadId") || "";
    const partNumber = Number(url.searchParams.get("partNumber"));
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (!key.startsWith("news-mp3/") || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000 || !request.body || contentLength < 1 || contentLength > MAX_PART_BYTES)
      return Response.json({ error: "Fragmento de carga no válido." }, { status: 400, headers: jsonHeaders() });
    const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
    const part = await upload.uploadPart(partNumber, request.body);
    return Response.json({ partNumber: part.partNumber, etag: part.etag }, { headers: jsonHeaders() });
  }

  if ((request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    const body = await jsonBody(request);
    if (!body) return Response.json({ error: "Solicitud de carga no válida." }, { status: 400, headers: jsonHeaders() });

    if (body.action === "init") {
      const kind = body.kind === "commercial" ? "commercial" : "song";
      const fileName = String(body.fileName || "");
      const size = Number(body.size || 0);
      const variantOf = String(body.variantOf || "");
      const bitrate = body.bitrate;
      const trackId = Number(body.trackId || 0);
      if (!validMp3Name(fileName) || !Number.isSafeInteger(size) || size < 1 || size > MAX_MP3_BYTES)
        return Response.json({ error: "Cada MP3 debe pesar máximo 80 MB y tener extensión .mp3." }, { status: 400, headers: jsonHeaders() });
      const replaceTrackId = Number(body.replaceTrackId || 0);
      if (!variantOf && !validVariantBitrate(bitrate)) {
        const duplicate = await matchingTrack(String(body.title || titleFromFileName(fileName)).trim().slice(0, 180), String(body.artist || "").trim().slice(0, 180), fileName, kind);
        if (duplicate && duplicate.id !== replaceTrackId)
          return Response.json({ error: `La canción ya está en la biblioteca con el ID ${duplicate.id}. Confirma si deseas reemplazarla.`, duplicateId: duplicate.id }, { status: 409, headers: jsonHeaders() });
        if (replaceTrackId && (!duplicate || duplicate.id !== replaceTrackId))
          return Response.json({ error: "La canción cambió o ya no coincide. Revisa la biblioteca antes de reemplazarla." }, { status: 409, headers: jsonHeaders() });
      }
      let sourceKey = variantOf;
      if (!sourceKey && Number.isSafeInteger(trackId) && trackId > 0 && validVariantBitrate(bitrate)) {
        const existing = await env.DB.prepare("SELECT storage_key AS storageKey FROM news_mp3_library WHERE id=? AND active=1").bind(trackId).first<{ storageKey: string }>();
        sourceKey = existing?.storageKey || "";
      }
      if (sourceKey && (!sourceKey.startsWith("news-mp3/") || !validVariantBitrate(bitrate)))
        return Response.json({ error: "La calidad alternativa no es válida." }, { status: 400, headers: jsonHeaders() });
      const storageKey = sourceKey ? variantStorageKey(sourceKey, Number(bitrate) as 96 | 192) : `news-mp3/${crypto.randomUUID()}.mp3`;
      const upload = await env.BUCKET.createMultipartUpload(storageKey);
      const replaceKey = replaceTrackId && !sourceKey
        ? (await env.DB.prepare("SELECT storage_key AS storageKey FROM news_mp3_library WHERE id=? AND active=1").bind(replaceTrackId).first<{ storageKey: string }>())?.storageKey
        : undefined;
      return Response.json({ uploadId: upload.uploadId, key: storageKey, replaceKey }, { headers: jsonHeaders() });
    }

    if (body.action === "complete") {
      const kind = body.kind === "commercial" ? "commercial" : "song";
      const key = String(body.key || "");
      const uploadId = String(body.uploadId || "");
      const parts = Array.isArray(body.parts) ? body.parts : [];
      const fileName = String(body.fileName || "");
      const size = Number(body.size || 0);
      const variantOf = String(body.variantOf || "");
      const bitrate = body.bitrate;
      const trackId = Number(body.trackId || 0);
      if (!key.startsWith("news-mp3/") || !uploadId || !validMp3Name(fileName) || !Number.isSafeInteger(size) || size < 1 || size > MAX_MP3_BYTES || !parts.length)
        return Response.json({ error: "No fue posible completar la carga del MP3." }, { status: 400, headers: jsonHeaders() });
      let sourceKey = variantOf;
      if (!sourceKey && Number.isSafeInteger(trackId) && trackId > 0 && validVariantBitrate(bitrate)) {
        const existing = await env.DB.prepare("SELECT storage_key AS storageKey FROM news_mp3_library WHERE id=? AND active=1").bind(trackId).first<{ storageKey: string }>();
        sourceKey = existing?.storageKey || "";
      }
      if (sourceKey && (!sourceKey.startsWith("news-mp3/") || !validVariantBitrate(bitrate) || key !== variantStorageKey(sourceKey, Number(bitrate) as 96 | 192)))
        return Response.json({ error: "La variante de calidad no es válida." }, { status: 400, headers: jsonHeaders() });
      const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
      await upload.complete(parts as Array<{ partNumber: number; etag: string }>);
      if (sourceKey) {
        return Response.json({ tracks: await listNewsMp3Tracks() }, { headers: jsonHeaders() });
      }
      const title = String(body.title || titleFromFileName(fileName)).trim().slice(0, 180);
      const artist = String(body.artist || "").trim().slice(0, 180);
      const album = String(body.album || "").trim().slice(0, 180);
      const lyrics = String(body.lyrics || "").trim().slice(0, 12000);
      const replaceTrackId = Number(body.replaceTrackId || 0);
      const duplicate = await matchingTrack(title, artist, fileName, kind);
      if ((duplicate && duplicate.id !== replaceTrackId) || (replaceTrackId && (!duplicate || duplicate.id !== replaceTrackId || duplicate.storageKey !== body.replaceKey))) {
        await env.BUCKET.delete(key);
        return Response.json({ error: "La biblioteca cambió mientras se cargaba el MP3. Revisa la canción y confirma otra vez." }, { status: 409, headers: jsonHeaders() });
      }
      if (replaceTrackId && duplicate) {
        let updated;
        try {
          updated = await env.DB.prepare(
            "UPDATE news_mp3_library SET title=?,artist=?,album=?,lyrics=?,file_name=?,storage_key=?,size_bytes=?,uploaded_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND storage_key=? AND active=1 AND kind=?",
          ).bind(title, artist, album || duplicate.album, lyrics || duplicate.lyrics, fileName.slice(0, 180), key, size, privilege.actor, replaceTrackId, duplicate.storageKey, kind).run();
        } catch (cause) {
          await env.BUCKET.delete(key);
          throw cause;
        }
        if (!updated.meta.changes) {
          await env.BUCKET.delete(key);
          return Response.json({ error: "La canción cambió durante la carga. Vuelve a revisar antes de reemplazarla." }, { status: 409, headers: jsonHeaders() });
        }
        await Promise.allSettled([env.BUCKET.delete(duplicate.storageKey), env.BUCKET.delete(variantStorageKey(duplicate.storageKey, 96)), env.BUCKET.delete(variantStorageKey(duplicate.storageKey, 192))]);
        await audit(privilege.actor, "news_mp3.replaced", "news_mp3_library", replaceTrackId, title);
        return Response.json({ trackId: replaceTrackId }, { headers: jsonHeaders() });
      }
      const inserted = await env.DB.prepare(
        `INSERT INTO news_mp3_library
         (title,artist,album,lyrics,file_name,storage_key,content_type,size_bytes,uploaded_by,kind)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(title || "Audio sindical", artist, album, lyrics, fileName.slice(0, 180), key, "audio/mpeg", size, privilege.actor, kind)
        .run();
      await audit(privilege.actor, "news_mp3.uploaded", "news_mp3_library", key, title || "Audio sindical");
      return Response.json({ trackId: inserted.meta.last_row_id }, { headers: jsonHeaders() });
    }

    if (body.action === "abort") {
      const key = String(body.key || "");
      const uploadId = String(body.uploadId || "");
      if (key.startsWith("news-mp3/") && uploadId) await env.BUCKET.resumeMultipartUpload(key, uploadId).abort();
      return Response.json({ ok: true }, { headers: jsonHeaders() });
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "La carga del MP3 no es válida." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size)
    return Response.json({ error: "Selecciona un archivo MP3." }, { status: 400, headers: NO_STORE_HEADERS });
  if (file.size > MAX_MP3_BYTES)
    return Response.json({ error: "Cada MP3 debe pesar máximo 80 MB." }, { status: 413, headers: NO_STORE_HEADERS });
  if (file.type !== "audio/mpeg" && !file.name.toLowerCase().endsWith(".mp3"))
    return Response.json({ error: "La biblioteca solo acepta archivos MP3." }, { status: 400, headers: NO_STORE_HEADERS });
  const title = String(form.get("title") || titleFromFileName(file.name)).trim().slice(0, 180);
  const artist = String(form.get("artist") || "").trim().slice(0, 180);
  const album = String(form.get("album") || "").trim().slice(0, 180);
  const lyrics = String(form.get("lyrics") || "").trim().slice(0, 12000);
  if (!title)
    return Response.json({ error: "Escribe un nombre para la canción." }, { status: 400, headers: NO_STORE_HEADERS });
  const storageKey = `news-mp3/${crypto.randomUUID()}.mp3`;
  await env.BUCKET.put(storageKey, file.stream(), {
    httpMetadata: { contentType: "audio/mpeg", cacheControl: "private, no-store" },
  });
  try {
    await env.DB.prepare(
      `INSERT INTO news_mp3_library
       (title,artist,album,lyrics,file_name,storage_key,content_type,size_bytes,uploaded_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
      .bind(title, artist, album, lyrics, file.name.slice(0, 180), storageKey, "audio/mpeg", file.size, privilege.actor)
      .run();
  } catch (error) {
    await env.BUCKET.delete(storageKey);
    throw error;
  }
  await audit(privilege.actor, "news_mp3.uploaded", "news_mp3_library", storageKey, title);
  return Response.json({ tracks: await listNewsMp3Tracks() }, { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: Request) {
  const privilege = await requirePrivilege(request, "news");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403, headers: NO_STORE_HEADERS });
  const body = await jsonBody(request);
  const id = Number(body?.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof body?.artist !== "string" || typeof body?.title !== "string" || typeof body?.lyrics !== "string")
    return Response.json({ error: "Datos de canción no válidos." }, { status: 400, headers: NO_STORE_HEADERS });
  const title = body.title.trim().slice(0, 180);
  const artist = body.artist.trim().slice(0, 180);
  const album = typeof body.album === "string" ? body.album.trim().slice(0, 180) : "";
  const lyrics = body.lyrics.trim().slice(0, 12000);
  if (!title) return Response.json({ error: "Escribe el nombre de la canción." }, { status: 400, headers: NO_STORE_HEADERS });
  const result = await env.DB.prepare(
    "UPDATE news_mp3_library SET title=?,artist=?,album=?,lyrics=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND active=1",
  ).bind(title, artist, album, lyrics, id).run();
  if (!result.meta.changes)
    return Response.json({ error: "Canción no encontrada." }, { status: 404, headers: NO_STORE_HEADERS });
  await audit(privilege.actor, "news_mp3.metadata_updated", "news_mp3_library", id, title);
  return Response.json({ tracks: await listNewsMp3Tracks() }, { headers: NO_STORE_HEADERS });
}

export async function DELETE(request: Request) {
  const privilege = await requirePrivilege(request, "news");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403, headers: NO_STORE_HEADERS });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1)
    return Response.json({ error: "Canción no encontrada." }, { status: 400, headers: NO_STORE_HEADERS });
  const track = await env.DB.prepare(
    "SELECT storage_key AS storageKey,title FROM news_mp3_library WHERE id=? AND active=1",
  )
    .bind(id)
    .first<{ storageKey: string; title: string }>();
  if (!track) return Response.json({ error: "Canción no encontrada." }, { status: 404, headers: NO_STORE_HEADERS });
  await env.DB.prepare(
    "UPDATE news_mp3_library SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  )
    .bind(id)
    .run();
  await env.BUCKET.delete(track.storageKey);
  const cover = await env.DB.prepare("SELECT cover_key AS coverKey FROM news_mp3_library WHERE id=?").bind(id).first<{ coverKey: string | null }>();
  if (cover?.coverKey) await env.BUCKET.delete(cover.coverKey);
  await audit(privilege.actor, "news_mp3.deleted", "news_mp3_library", id, track.title);
  return Response.json({ tracks: await listNewsMp3Tracks() }, { headers: NO_STORE_HEADERS });
}
