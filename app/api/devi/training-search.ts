import { env } from "cloudflare:workers";
import {
  rankTrainerKnowledge,
  trainerSearchTerms,
  type TrainerKnowledgeRow,
} from "../../devi/trainer-knowledge";

export async function searchActiveTrainerKnowledge(
  query: string,
  limit = 5,
) {
  const terms = trainerSearchTerms(query);
  if (!terms.length) return [];
  const conditions = terms.map(
    () => "(c.normalized_content LIKE ? OR s.normalized_title LIKE ?)",
  );
  const bindings = terms.flatMap((term) => [`%${term}%`, `%${term}%`]);
  try {
    const result = await env.DB.prepare(
      `SELECT c.id AS chunkId,c.source_id AS sourceId,c.chunk_index AS chunkIndex,
        s.title,s.kind,s.reference_label AS referenceLabel,c.locator,c.content,
        c.normalized_content AS normalizedContent,s.normalized_title AS normalizedTitle,
        s.updated_at AS updatedAt
       FROM devi_training_chunks c
       JOIN devi_training_sources s ON s.id=c.source_id
       WHERE s.active=1 AND (${conditions.join(" OR ")})
       ORDER BY CASE WHEN s.kind='correction' THEN 0 ELSE 1 END,s.updated_at DESC
       LIMIT 180`,
    )
      .bind(...bindings)
      .all<TrainerKnowledgeRow>();
    return rankTrainerKnowledge(query, result.results, limit);
  } catch (error) {
    console.warn("devi.training-search-unavailable", {
      reason: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    return [];
  }
}
