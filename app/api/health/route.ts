import { DEVI_POLICY_VERSION } from "../../devi/version";
import {
  DEVI_KNOWLEDGE_ENTRY_POINTS,
  DEVI_KNOWLEDGE_SCOPE,
} from "../../devi/sync";

export function GET() {
  return Response.json(
    {
      status: "ok",
      portal: "ready",
      devi: {
        status: "ready",
        policyVersion: DEVI_POLICY_VERSION,
        knowledgeScope: DEVI_KNOWLEDGE_SCOPE,
        entryPoints: DEVI_KNOWLEDGE_ENTRY_POINTS,
      },
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
