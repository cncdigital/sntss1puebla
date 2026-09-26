import { getPrivilege, getWorkerSession } from "../../authz";
import { listNewsMp3Tracks } from "../mp3-library";
import { getNewsSettings } from "../radio-settings";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

async function canListen(request: Request) {
  const [worker, privilege] = await Promise.all([
    getWorkerSession(request),
    getPrivilege(request),
  ]);
  return Boolean(worker || privilege);
}

export async function GET(request: Request) {
  if (!(await canListen(request))) return new Response(null, { status: 401 });
  const [tracks, commercials, settings] = await Promise.all([listNewsMp3Tracks(), listNewsMp3Tracks("commercial"), getNewsSettings()]);
  return Response.json({ tracks, commercials, commercialIntervalMinutes: settings.commercialIntervalMinutes }, { headers: NO_STORE_HEADERS });
}
