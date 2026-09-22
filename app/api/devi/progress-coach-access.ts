import { canCoachProgressLists } from "../../devi/progress-access";
import { getPrivilege, getWorkerSession } from "../authz";

export type ProgressCoachAccess = {
  actor: string;
  matricula: string;
  mustChangePin: boolean;
};

export async function getProgressCoachAccess(
  request: Request,
): Promise<ProgressCoachAccess | null> {
  const [privilege, worker] = await Promise.all([
    getPrivilege(request),
    getWorkerSession(request),
  ]);
  if (
    privilege &&
    canCoachProgressLists(
      privilege.matricula,
      privilege.canAdmin,
      privilege.canTrainDevi,
    )
  )
    return {
      actor: privilege.actor,
      matricula: privilege.matricula,
      mustChangePin: privilege.mustChangePin,
    };
  if (worker && canCoachProgressLists(worker.matricula))
    return {
      actor: `matricula:${worker.matricula}`,
      matricula: worker.matricula,
      mustChangePin: false,
    };
  return null;
}
