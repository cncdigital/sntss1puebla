import { env } from "cloudflare:workers";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim().toUpperCase() ?? "";
  if (!token) return new Response(null, { status: 404 });
  const row = await env.DB.prepare(
    `SELECT COALESCE(a.profile_photo_key,
       (SELECT vd.storage_key FROM verification_documents vd
        WHERE vd.application_id=a.id AND vd.beneficiary_id IS NULL
          AND vd.kind='profile_photo'
        ORDER BY vd.created_at DESC,vd.id DESC LIMIT 1)) AS storageKey
     FROM applications a WHERE a.credential_token=? AND a.status='approved' AND a.archived_at IS NULL
     UNION ALL
     SELECT COALESCE(b.photo_key,
       (SELECT vd.storage_key FROM verification_documents vd
        WHERE vd.application_id=b.application_id AND vd.beneficiary_id=b.id
          AND vd.kind='beneficiary_photo'
        ORDER BY vd.created_at DESC,vd.id DESC LIMIT 1)) AS storageKey
     FROM beneficiaries b
     JOIN applications a ON a.id=b.application_id
     WHERE b.credential_token=? AND b.active=1 AND a.status='approved' AND a.archived_at IS NULL LIMIT 1`,
  )
    .bind(token, token)
    .first<{ storageKey: string | null }>();
  if (!row?.storageKey) return new Response(null, { status: 404 });
  const object = await env.BUCKET.get(row.storageKey);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", object.httpMetadata?.contentType || "image/jpeg");
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
