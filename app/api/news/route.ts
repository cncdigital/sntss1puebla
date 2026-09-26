import { getPrivilege, getWorkerSession } from "../authz";
import {
  facebookNewsPublicStatus,
  listFacebookNews,
  syncFacebookNews,
} from "./meta";
import {
  getNewsSettings,
  RADIO_STATION_PAGE_URL,
} from "./radio-settings";
import { listNewsMp3Tracks } from "./mp3-library";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

async function authorized(request: Request) {
  const [worker, privilege] = await Promise.all([
    getWorkerSession(request),
    getPrivilege(request),
  ]);
  return Boolean(worker || privilege);
}

async function newsResponse(sync?: Awaited<ReturnType<typeof syncFacebookNews>>) {
  const [news, meta, settings, mp3] = await Promise.all([
    listFacebookNews(),
    facebookNewsPublicStatus(),
    getNewsSettings(),
    listNewsMp3Tracks(),
  ]);
  return Response.json(
    {
      news,
      meta,
      radio: {
        available: Boolean(settings.radioStreamUrl),
        streamPath: "/api/news/radio",
        directUrl: RADIO_STATION_PAGE_URL,
      },
      mp3,
      sync: sync || null,
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function GET(request: Request) {
  if (!(await authorized(request)))
    return Response.json(
      { error: "No autorizado" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  return newsResponse();
}

export async function POST(request: Request) {
  if (!(await authorized(request)))
    return Response.json(
      { error: "No autorizado" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  const sync = await syncFacebookNews();
  return newsResponse(sync);
}
