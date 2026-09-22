import { getPrivilege } from "../authz";

export async function GET(request: Request) {
  const account = await getPrivilege(request);
  if (!account || (!account.canAdmin && !account.canReview))
    return Response.json({ authorized: false }, { status: 403 });
  return Response.json({ authorized: true, account });
}
