import { env } from "cloudflare:workers";
import {
  draftAct,
  reviewAct,
  type ActDraftInput,
} from "../../../devi/engine";
import {
  answerHybridQuestion,
  DEFAULT_DEVI_AI_MODEL,
} from "../../../devi/ai";
import { DEVI_KNOWLEDGE_SUMMARY } from "../../../devi/knowledge";
import { contextualizeQuery } from "../../../devi/relevance";
import {
  DEVI_KNOWLEDGE_ENTRY_POINTS,
  DEVI_KNOWLEDGE_SCOPE,
  DEVI_KNOWLEDGE_SYNC_LABEL,
} from "../../../devi/sync";
import { DEVI_POLICY_VERSION } from "../../../devi/version";
import { searchActiveTrainerKnowledge } from "../training-search";
import { answerProgressLookup } from "../progress-lookup";
import { answerPersonalStatus } from "../personal-status";
import {
  deviCredentialRequiredResponse,
  getDeviCredentialAccess,
} from "../credential-access";

type DeviRequest = {
  action?: "chat" | "review_act" | "draft_act";
  message?: string;
  context?: string[];
  documentText?: string;
  act?: ActDraftInput;
};

type DeviRuntimeEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_DEVI_MODEL?: string;
};

function aiEnvironment() {
  return env as unknown as DeviRuntimeEnv;
}

async function activeTrainingSummary() {
  try {
    const totals = await env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN active=1 THEN 1 ELSE 0 END),0) AS activeSources,
        COALESCE(SUM(CASE WHEN active=1 THEN chunk_count ELSE 0 END),0) AS activeChunks,
        MAX(CASE WHEN active=1 THEN updated_at ELSE NULL END) AS updatedAt
       FROM devi_training_sources`,
    ).first<{
      activeSources: number;
      activeChunks: number;
      updatedAt: string | null;
    }>();
    return {
      activeSources: Number(totals?.activeSources || 0),
      activeChunks: Number(totals?.activeChunks || 0),
      updatedAt: totals?.updatedAt || null,
    };
  } catch (error) {
    console.warn("devi.training-summary-unavailable", {
      reason: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    return { activeSources: 0, activeChunks: 0, updatedAt: null };
  }
}

export async function GET(request: Request) {
  const access = await getDeviCredentialAccess(request);
  if (!access.valid) return deviCredentialRequiredResponse(access);
  const runtime = aiEnvironment();
  const training = await activeTrainingSummary();
  return Response.json(
    {
      name: "Devi",
      role: "Delegada Virtual",
      knowledge: {
        ...DEVI_KNOWLEDGE_SUMMARY,
        scope: DEVI_KNOWLEDGE_SCOPE,
        entryPoints: DEVI_KNOWLEDGE_ENTRY_POINTS,
        syncLabel: DEVI_KNOWLEDGE_SYNC_LABEL,
        policyVersion: DEVI_POLICY_VERSION,
        training,
      },
      ai: {
        configured: Boolean(runtime.OPENAI_API_KEY?.trim()),
        model: runtime.OPENAI_DEVI_MODEL?.trim() || DEFAULT_DEVI_AI_MODEL,
        privacy:
          "Pregunta anonimizada; fuentes sindicales y web cuando se necesiten, sin perfil laboral",
      },
    },
    { headers: { "cache-control": "private, no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  const access = await getDeviCredentialAccess(request);
  let body: DeviRequest;
  try {
    body = (await request.json()) as DeviRequest;
  } catch {
    return Response.json({ error: "La consulta está vacía." }, { status: 400 });
  }
  if (!access.valid) {
    if (
      access.authenticated &&
      access.matricula &&
      (!body.action || body.action === "chat") &&
      body.message?.trim()
    ) {
      try {
        const personalStatusReply = await answerPersonalStatus(
          body.message,
          access.matricula,
        );
        if (personalStatusReply)
          return Response.json(personalStatusReply, {
            headers: { "cache-control": "private, no-store, max-age=0" },
          });
      } catch (error) {
        console.error("devi.personal-status-failed", error);
      }
    }
    return deviCredentialRequiredResponse(access);
  }
  try {
    if (body.action === "draft_act")
      return Response.json(draftAct(body.act ?? {}), {
        headers: { "cache-control": "no-store" },
      });
    if (body.action === "review_act") {
      if (!body.documentText?.trim())
        return Response.json(
          { error: "No se reconoció texto suficiente en el documento." },
          { status: 400 },
        );
      return Response.json(reviewAct(body.documentText), {
        headers: { "cache-control": "no-store" },
      });
    }
    if (!body.message?.trim())
      return Response.json({ error: "Escribe una pregunta para Devi." }, { status: 400 });
    const context = Array.isArray(body.context)
      ? body.context
          .filter((entry): entry is string => typeof entry === "string")
          .slice(-6)
      : [];
    const personalStatusReply = await answerPersonalStatus(
      body.message,
      access.matricula || "",
    );
    if (personalStatusReply)
      return Response.json(personalStatusReply, {
        headers: { "cache-control": "private, no-store, max-age=0" },
      });
    const progressReply = await answerProgressLookup(
      request,
      body.message,
      access.matricula || "",
    );
    if (progressReply)
      return Response.json(progressReply, {
        headers: { "cache-control": "private, no-store, max-age=0" },
      });
    const runtime = aiEnvironment();
    const trainerSources = await searchActiveTrainerKnowledge(
      contextualizeQuery(body.message, context),
      5,
    );
    const reply = await answerHybridQuestion(
      {
        apiKey: runtime.OPENAI_API_KEY,
        model: runtime.OPENAI_DEVI_MODEL,
        preferFastLocal: true,
      },
      body.message,
      context,
      fetch,
      trainerSources,
    );
    return Response.json(reply, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("devi.request-failed", error);
    return Response.json(
      { error: "Devi no pudo procesar esta consulta. Intenta formularla de otra manera." },
      { status: 500 },
    );
  }
}
