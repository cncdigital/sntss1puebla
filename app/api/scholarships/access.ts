import { getPrivilege } from "../authz";
import { requireReader } from "../reader/auth";

export type ScholarshipOperator = {
  actor: string;
  canManage: boolean;
};

export async function requireScholarshipOperator(
  request: Request,
): Promise<ScholarshipOperator | null> {
  const privilege = await getPrivilege(request);
  if (privilege?.canAdmin || privilege?.canManageScholarships)
    return { actor: privilege.actor, canManage: true };

  const reader = await requireReader(request);
  return reader ? { actor: reader.email, canManage: false } : null;
}
