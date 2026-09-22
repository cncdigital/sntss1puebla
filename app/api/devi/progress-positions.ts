import { env } from "cloudflare:workers";
import { assignCalculatedPositions } from "../../devi/progress-lists";

export type PositionableProgressEntry = {
  id: number;
  listId: number;
  matricula: string;
  movementCode: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  requestedAssignmentCode: string | null;
  requestedShift: string | null;
  calculatedPosition: number | null;
};

type PositionCandidateRow = Omit<
  PositionableProgressEntry,
  "listId" | "calculatedPosition"
>;

/**
 * Recalculates the selected rows from the complete active-list order. This keeps
 * previously uploaded files on the latest queue rule without changing their
 * source evidence: category + assignment + exact shift, starting at position 1.
 */
export async function hydrateProgressPositions<
  T extends PositionableProgressEntry,
>(entries: T[]) {
  const lists = new Map<number, Map<number, T>>();
  for (const entry of entries) {
    const targetsById = lists.get(entry.listId) || new Map<number, T>();
    targetsById.set(entry.id, entry);
    lists.set(entry.listId, targetsById);
  }

  for (const [listId, targetsById] of lists) {
    const candidates = await env.DB.prepare(
      `SELECT id,matricula,movement_code AS movementCode,
        category_code AS categoryCode,category_name AS categoryName,
        requested_assignment_code AS requestedAssignmentCode,
        requested_shift AS requestedShift
       FROM devi_progress_entries
       WHERE list_id=?
       ORDER BY id ASC`,
    )
      .bind(listId)
      .all<PositionCandidateRow>();

    const positionedCandidates = candidates.results.map((candidate) => ({
      ...candidate,
      calculatedPosition: null,
    }));
    assignCalculatedPositions(positionedCandidates);
    for (const candidate of positionedCandidates) {
      const target = targetsById.get(candidate.id);
      if (target)
        target.calculatedPosition = candidate.calculatedPosition;
    }
  }
}
