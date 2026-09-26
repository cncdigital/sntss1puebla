import { env } from "cloudflare:workers";

export async function GET(request: Request) {
  const token =
    new URL(request.url).searchParams.get("token")?.trim().toUpperCase() ?? "";
  if (!token) return new Response(null, { status: 404 });
  const credential = await env.DB.prepare(
    `SELECT COALESCE(a.profile_photo_key,
      (SELECT vd.storage_key FROM verification_documents vd
       WHERE vd.application_id=a.id AND vd.beneficiary_id IS NULL
         AND vd.kind='profile_photo'
       ORDER BY vd.created_at DESC,vd.id DESC LIMIT 1)) AS photoKey
     FROM applications a WHERE a.credential_token=? AND a.status='approved' AND a.archived_at IS NULL LIMIT 1`,
  )
    .bind(token)
    .first<{ photoKey: string | null }>();
  if (!credential?.photoKey) return new Response(null, { status: 404 });
  const object = await env.BUCKET.get(credential.photoKey);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "image/jpeg",
      "cache-control": "private, no-store, max-age=0",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    },
  });
}
