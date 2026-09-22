import { env } from "cloudflare:workers";
import { requireReader } from "../auth";
import { getCredentialValidity } from "../../credential-validity";
import { normalizeCredentialToken } from "../../../credential-token";

type HistoryRow = {
  id: number;
  accessNumber: number;
  credentialToken: string;
  fullName: string | null;
  relationship: string | null;
  matricula: string | null;
  category: string | null;
  facility: string;
  movement: string;
  readerEmail: string | null;
  createdAt: string;
};

export async function GET(request: Request) {
  const reader = await requireReader(request);
  if (!reader)
    return Response.json(
      { error: "La sesión del lector venció o no tiene autorización. Ingresa nuevamente con la matrícula lectora." },
      { status: 401 },
    );
  const photoToken =
    new URL(request.url).searchParams.get("photo")?.trim().toUpperCase() || "";
  if (photoToken) {
    const photo = await env.DB.prepare(
      `SELECT COALESCE(a.profile_photo_key,
         (SELECT vd.storage_key FROM verification_documents vd
          WHERE vd.application_id=a.id AND vd.beneficiary_id IS NULL
            AND vd.kind='profile_photo'
          ORDER BY vd.created_at DESC,vd.id DESC LIMIT 1)) AS photoKey
       FROM applications a WHERE a.credential_token=? AND a.archived_at IS NULL
       UNION ALL
       SELECT COALESCE(b.photo_key,
         (SELECT vd.storage_key FROM verification_documents vd
          WHERE vd.application_id=b.application_id AND vd.beneficiary_id=b.id
            AND vd.kind='beneficiary_photo'
          ORDER BY vd.created_at DESC,vd.id DESC LIMIT 1)) AS photoKey
       FROM beneficiaries b JOIN applications owner_application ON owner_application.id=b.application_id
       WHERE b.credential_token=? AND owner_application.archived_at IS NULL LIMIT 1`,
    )
      .bind(photoToken, photoToken)
      .first<{ photoKey: string | null }>();
    if (!photo?.photoKey) return new Response(null, { status: 404 });
    const object = await env.BUCKET.get(photo.photoKey);
    if (!object) return new Response(null, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType || "image/jpeg",
        "cache-control": "private, no-store, max-age=0",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  }
  const result = await env.DB.prepare(
    `SELECT log.id,log.id AS accessNumber,log.credential_token AS credentialToken,
      COALESCE(titular.full_name,beneficiary.full_name) AS fullName,
      CASE WHEN titular_application.id IS NOT NULL THEN 'Titular'
        ELSE beneficiary.relationship END AS relationship,
      COALESCE(titular.matricula,beneficiary_worker.matricula) AS matricula,
      COALESCE(titular.category,beneficiary_worker.category) AS category,
      log.facility,log.movement,log.reader_email AS readerEmail,
      log.created_at AS createdAt
     FROM access_logs log
     LEFT JOIN applications titular_application
       ON titular_application.credential_token=log.credential_token
     LEFT JOIN workers titular ON titular.id=titular_application.worker_id
     LEFT JOIN beneficiaries beneficiary
       ON beneficiary.credential_token=log.credential_token
     LEFT JOIN applications beneficiary_application
       ON beneficiary_application.id=beneficiary.application_id
     LEFT JOIN workers beneficiary_worker
       ON beneficiary_worker.id=beneficiary_application.worker_id
     ORDER BY log.id DESC LIMIT 100`,
  ).all<HistoryRow>();
  return Response.json({
    history: result.results.map(({ credentialToken, ...item }) => ({
      ...item,
      fullName: item.fullName || "Credencial histórica",
      relationship: item.relationship || "Credencial",
      matricula: item.matricula || "No disponible",
      photoUrl: item.fullName
        ? `/api/reader/access?photo=${encodeURIComponent(credentialToken)}`
        : null,
    })),
  });
}
export async function POST(request: Request) {
  const reader = await requireReader(request);
  if (!reader)
    return Response.json(
      { error: "La sesión del lector venció o no tiene autorización. Ingresa nuevamente con la matrícula lectora." },
      { status: 401 },
    );
  const { credentialToken, facility, movement } = (await request.json()) as {
    credentialToken?: string;
    facility?: string;
    movement?: string;
  };
  const token = normalizeCredentialToken(credentialToken ?? "");
  if (!token || !facility || !["Entrada", "Salida"].includes(movement ?? ""))
    return Response.json({ error: "Datos incompletos" }, { status: 400 });
  if (
    !reader.facilities.includes("*") &&
    !reader.facilities.includes(facility)
  )
    return Response.json(
      { error: "Tu rol no tiene permiso para registrar accesos en esta instalación." },
      { status: 403 },
    );
  const credential = await env.DB.prepare(
    `SELECT a.id AS applicationId,a.credential_token AS credentialToken,w.full_name AS fullName,'Trabajador/a' AS relationship,w.matricula FROM applications a JOIN workers w ON w.id=a.worker_id WHERE a.credential_token=? AND a.status='approved' AND a.archived_at IS NULL
UNION ALL
SELECT a.id AS applicationId,b.credential_token AS credentialToken,b.full_name AS fullName,b.relationship,w.matricula FROM beneficiaries b JOIN applications a ON a.id=b.application_id JOIN workers w ON w.id=a.worker_id WHERE b.credential_token=? AND b.active=1 AND a.status='approved' AND a.archived_at IS NULL LIMIT 1`,
  )
    .bind(token, token)
    .first<{
      applicationId: number;
      credentialToken: string;
      fullName: string;
      relationship: string;
      matricula: string;
    }>();
  if (!credential)
    return Response.json(
      { error: "Credencial no válida o inactiva" },
      { status: 404 },
    );
  const validity = await getCredentialValidity(credential.applicationId);
  if (!validity.valid)
    return Response.json(
      { error: `CREDENCIAL NO VÁLIDA: ${validity.reason}` },
      { status: 403 },
    );
  const insertion = await env.DB.prepare(
    "INSERT INTO access_logs (credential_token,facility,movement,reader_email) VALUES (?,?,?,?)",
  )
    .bind(token, facility, movement, reader.email)
    .run();
  const accessNumber = Number(insertion.meta.last_row_id || 0);
  return Response.json(
    {
      ok: true,
      credential: {
        ...credential,
        credentialValid: true,
        credentialValidationReason: validity.reason,
      },
      accessNumber,
      createdAt: new Date().toISOString(),
    },
    { status: 201 },
  );
}
