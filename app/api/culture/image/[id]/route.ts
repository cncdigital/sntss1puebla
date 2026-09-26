import { env } from "cloudflare:workers";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new Response(null, { status: 404 });
  const row = await env.DB.prepare("SELECT image_key AS imageKey FROM culture_entries WHERE id=? AND hidden=0")
    .bind(id).first<{ imageKey: string | null }>();
  if (!row?.imageKey) return new Response(null, { status: 404 });
  const file = await env.BUCKET.get(row.imageKey);
  if (!file) return new Response(null, { status: 404 });
  const headers = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
  file.writeHttpMetadata(headers);
  return new Response(file.body, { headers });
}
