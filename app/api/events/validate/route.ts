import { env } from "cloudflare:workers";
import { requireReader } from "../../reader/auth";
import {
  eventAccessErrorResponse,
  validateEventCredential,
} from "../credential";
import { EVENT_ENTRY_SELECT } from "../entry-select";

export async function POST(request: Request) {
  const reader = await requireReader(request);
  if (!reader)
    return Response.json(
      { error: "La sesión del lector venció o no tiene autorización. Ingresa nuevamente con la matrícula lectora." },
      { status: 401 },
    );
  const payload = (await request.json()) as {
    eventId?: number;
    credentialToken?: string;
  };
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
    return Response.json({
      eligible: true,
      event: result.event,
      credential: result.credential,
      alreadyRegistered: Boolean(existing),
      entry: existing
        ? { ...existing, companion: Boolean(existing.companion) }
        : null,
    });
  } catch (error) {
    return eventAccessErrorResponse(error);
  }
}
