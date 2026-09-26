import { env } from "cloudflare:workers";
import { requirePrivilege } from "../authz";

export async function GET(request: Request) {
  if (!(await requirePrivilege(request, "review")))
    return new Response(null, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1)
    return new Response(null, { status: 404 });
  const application = await env.DB.prepare(
    `SELECT COALESCE(a.profile_photo_key,
      (SELECT vd.storage_key FROM verification_documents vd
       WHERE vd.application_id=a.id AND vd.beneficiary_id IS NULL
         AND vd.kind='profile_photo'
       ORDER BY vd.created_at DESC,vd.id DESC LIMIT 1)) AS photoKey
     FROM applications a WHERE a.id=? LIMIT 1`,
  )
    .bind(id)
    .first<{ photoKey: string | null }>();
  if (!application?.photoKey) return new Response(null, { status: 404 });
  const object = await env.BUCKET.get(application.photoKey);
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
