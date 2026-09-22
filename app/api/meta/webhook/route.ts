import {
  processFacebookWebhook,
  type FacebookWebhookPayload,
  verifyFacebookWebhookChallenge,
  verifyFacebookWebhookSignature,
} from "../../news/meta";

const NO_STORE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
};

export async function GET(request: Request) {
  const challenge = verifyFacebookWebhookChallenge(new URL(request.url));
  if (!challenge)
    return new Response("Webhook no autorizado", {
      status: 403,
      headers: NO_STORE_HEADERS,
    });
  return new Response(challenge, { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const valid = await verifyFacebookWebhookSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
  );
  if (!valid)
    return Response.json(
      { error: "Firma no válida" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json(
      { error: "Contenido no válido" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const result = await processFacebookWebhook(payload as FacebookWebhookPayload);
  return Response.json({ received: true, ...result }, { headers: NO_STORE_HEADERS });
}
