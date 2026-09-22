import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../../authz";
import {
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_OAUTH_SCOPE,
  GoogleDriveStorageError,
  getDriveConfiguration,
  getGoogleDriveOauthClient,
  googleDriveConfigurationStatus,
  googleDriveRedirectUri,
  googleDriveRootFolderPrivacy,
  randomUrlSafeToken,
  saveGoogleDriveOauthClient,
} from "../../google-drive/storage";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const configurationStatus = await googleDriveConfigurationStatus();
  const configuration = await getDriveConfiguration();
  let folderPrivate: boolean | null = null;
  let folderPrivacyCode: string | null = null;
  if (configurationStatus.configured && configuration) {
    try {
      folderPrivate = (await googleDriveRootFolderPrivacy()).isPrivate;
    } catch (error) {
      folderPrivacyCode =
        error instanceof GoogleDriveStorageError
          ? error.code
          : "DRIVE_FOLDER_PRIVACY_UNVERIFIED";
    }
  }
  const [counts, accessCounts] = await Promise.all([
    env.DB.prepare(
    `SELECT
      COUNT(*) AS legalDocuments,
      SUM(CASE WHEN storage_provider='r2' THEN 1 ELSE 0 END) AS appDocuments,
      SUM(CASE WHEN drive_file_id IS NOT NULL THEN 1 ELSE 0 END) AS driveDocuments,
      SUM(CASE WHEN drive_file_id IS NULL THEN 1 ELSE 0 END) AS pendingSync,
      SUM(CASE WHEN legacy_cleanup_pending=1 THEN 1 ELSE 0 END) AS pendingCleanup
     FROM verification_documents
     WHERE kind IN ('ine','tarjeton','beneficiary_evidence','beneficiary_curp')`,
    ).first<{
      legalDocuments: number;
      appDocuments: number | null;
      driveDocuments: number | null;
      pendingSync: number | null;
      pendingCleanup: number | null;
    }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS legalDocuments,
        SUM(CASE WHEN storage_provider='r2' THEN 1 ELSE 0 END) AS appDocuments,
        SUM(CASE WHEN drive_file_id IS NOT NULL THEN 1 ELSE 0 END) AS driveDocuments,
        SUM(CASE WHEN drive_file_id IS NULL THEN 1 ELSE 0 END) AS pendingSync
       FROM worker_access_registration_documents
       WHERE kind IN ('ine','tarjeton')`,
    ).first<{
      legalDocuments: number;
      appDocuments: number | null;
      driveDocuments: number | null;
      pendingSync: number | null;
    }>(),
  ]);
  const queuedCleanup = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM document_storage_cleanup_queue",
  ).first<{ total: number }>();
  const targetFolderId =
    configuration?.rootFolderId || configurationStatus.preferredRootFolderId;
  return Response.json(
    {
      configured: configurationStatus.configured,
      missingConfiguration: configurationStatus.missing,
      clientSource: configurationStatus.clientSource,
      clientIdHint: configurationStatus.clientIdHint,
      apiActivationUrl: configurationStatus.apiActivationUrl,
      expectedAccountEmail: configurationStatus.expectedAccountEmail,
      connected: Boolean(configuration),
      active:
        configurationStatus.configured &&
        Boolean(configuration) &&
        folderPrivate === true,
      folderPrivate,
      folderPrivacyCode,
      accountEmail: configuration?.accountEmail || null,
      accountName: configuration?.accountName || null,
      connectedAt: configuration?.connectedAt || null,
      rootFolderId: targetFolderId || null,
      rootFolderName:
        configuration?.rootFolderName || "Expedientes Credencial SNTSS1",
      rootFolderUrl: targetFolderId
        ? `https://drive.google.com/drive/folders/${encodeURIComponent(targetFolderId)}`
        : null,
      redirectUri: googleDriveRedirectUri(request),
      scope: GOOGLE_DRIVE_SCOPE,
      mailScope: null,
      mailDelivery: "manual",
      legalDocuments:
        Number(counts?.legalDocuments || 0) +
        Number(accessCounts?.legalDocuments || 0),
      appDocuments:
        Number(counts?.appDocuments || 0) +
        Number(accessCounts?.appDocuments || 0),
      driveDocuments:
        Number(counts?.driveDocuments || 0) +
        Number(accessCounts?.driveDocuments || 0),
      pendingSync:
        Number(counts?.pendingSync || 0) +
        Number(accessCounts?.pendingSync || 0),
      pendingMigration:
        Number(counts?.pendingSync || 0) +
        Number(accessCounts?.pendingSync || 0),
      pendingCleanup:
        Number(counts?.pendingCleanup || 0) + Number(queuedCleanup?.total || 0),
      photoStorage: "r2",
      legalDocumentStorage:
        folderPrivate === true ? "r2_with_drive_copy" : "r2",
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const configurationStatus = await googleDriveConfigurationStatus();
  if (!configurationStatus.configured)
    return Response.json(
      {
        error: "La integración OAuth de Google Drive aún no tiene sus secretos configurados.",
        code: "DRIVE_NOT_CONFIGURED",
        missingConfiguration: configurationStatus.missing,
        redirectUri: googleDriveRedirectUri(request),
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  const client = await getGoogleDriveOauthClient();
  if (!client)
    return Response.json(
      { error: "El cliente OAuth de Google no está disponible." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  await env.DB.prepare(
    "DELETE FROM google_drive_oauth_states WHERE expires_at<=CURRENT_TIMESTAMP",
  ).run();
  const state = randomUrlSafeToken();
  const redirectUri = googleDriveRedirectUri(request);
  await env.DB.prepare(
    `INSERT INTO google_drive_oauth_states (state,actor,redirect_uri,expires_at)
     VALUES (?,?,?,datetime('now','+10 minutes'))`,
  )
    .bind(state, privilege.actor, redirectUri)
    .run();
  const parameters = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPE,
    access_type: "offline",
    prompt: "consent select_account",
    hl: "es",
    state,
  });
  await audit(privilege.actor, "google_drive.connection_started", "storage", null);
  return Response.json(
    { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${parameters}` },
    { headers: NO_STORE_HEADERS },
  );
}

export async function PUT(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const currentStatus = await googleDriveConfigurationStatus();
  if (currentStatus.clientSource === "environment")
    return Response.json(
      {
        error:
          "El cliente OAuth se administra desde los secretos del alojamiento y no puede sustituirse desde esta pantalla.",
        code: "DRIVE_CLIENT_MANAGED_BY_ENVIRONMENT",
      },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  let payload: { clientId?: string; clientSecret?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json(
      { error: "La solicitud de configuración no contiene datos válidos." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const saved = await saveGoogleDriveOauthClient({
      clientId: payload.clientId || "",
      clientSecret: payload.clientSecret || "",
      actor: privilege.actor,
    });
    await audit(
      privilege.actor,
      "google_drive.oauth_client_saved",
      "storage",
      null,
      `${saved.clientIdHint}${saved.connectionReset ? " · conexión reiniciada" : ""}`,
    );
    return Response.json(
      {
        ok: true,
        configured: true,
        clientSource: "admin",
        clientIdHint: saved.clientIdHint,
        connectionReset: saved.connectionReset,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const storageError =
      error instanceof GoogleDriveStorageError ? error : null;
    return Response.json(
      {
        error:
          storageError?.message ||
          "No fue posible guardar la configuración cifrada de Google Drive.",
        code: storageError?.code || "DRIVE_CLIENT_SAVE_FAILED",
      },
      { status: storageError?.status || 500, headers: NO_STORE_HEADERS },
    );
  }
}
