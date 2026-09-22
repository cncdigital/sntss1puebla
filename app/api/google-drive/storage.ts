import { env } from "cloudflare:workers";
import {
  DRIVE_DOCUMENT_FOLDERS,
  GOOGLE_DRIVE_ROOT_NAME,
  hasBroadDriveFolderAccess,
  isValidGoogleOauthClientId,
  isValidGoogleOauthClientSecret,
  maskedGoogleOauthClientId,
  normalizeGoogleOauthClientId,
  safeDriveFileName,
  type DriveDocumentKind,
} from "./shared";

export {
  GOOGLE_DRIVE_ROOT_NAME,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_GMAIL_SEND_SCOPE,
  GOOGLE_OAUTH_SCOPE,
} from "./shared";
export type { DriveDocumentKind } from "./shared";

type RuntimeEnvironment = {
  GOOGLE_DRIVE_CLIENT_ID?: string;
  GOOGLE_DRIVE_CLIENT_SECRET?: string;
  GOOGLE_DRIVE_OWNER_EMAIL?: string;
  GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY?: string;
  GOOGLE_DRIVE_ROOT_FOLDER_ID?: string;
};

const DEFAULT_GOOGLE_DRIVE_OWNER_EMAIL = "guardiandelallama@gmail.com";

type DriveConfiguration = {
  encryptedRefreshToken: string;
  tokenIv: string;
  accountEmail: string | null;
  accountName: string | null;
  rootFolderId: string;
  rootFolderName: string;
  connectedBy: string | null;
  connectedAt: string;
  updatedAt: string;
};

type DriveOauthClientConfiguration = {
  clientId: string;
  encryptedClientSecret: string;
  secretIv: string;
  configuredBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GoogleDriveOauthClient = {
  clientId: string;
  clientSecret: string;
  source: "environment" | "admin";
};

type DriveFileMetadata = {
  id: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
  size?: string;
  sha256Checksum?: string;
  trashed?: boolean;
};

type AccessTokenCache = {
  configurationVersion: string;
  token: string;
  expiresAt: number;
};

type DriveFolderPrivacyCache = {
  folderId: string;
  isPrivate: boolean;
  checkedAt: number;
};

let accessTokenCache: AccessTokenCache | null = null;
const folderCache = new Map<string, Record<DriveDocumentKind, string>>();
let driveFolderPrivacyCache: DriveFolderPrivacyCache | null = null;

function runtimeEnvironment() {
  return env as typeof env & RuntimeEnvironment;
}

export class GoogleDriveStorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 503,
  ) {
    super(message);
    this.name = "GoogleDriveStorageError";
  }
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomUrlSafeToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

async function tokenEncryptionKey() {
  const secret = runtimeEnvironment().GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY?.trim() || "";
  if (secret.length < 24)
    throw new GoogleDriveStorageError(
      "La llave de cifrado de Google Drive no está configurada correctamente.",
      "DRIVE_ENCRYPTION_KEY_INVALID",
    );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptSecret(value: string) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await tokenEncryptionKey(),
    new TextEncoder().encode(value),
  );
  return {
    encryptedValue: encodeBase64Url(new Uint8Array(encrypted)),
    iv: encodeBase64Url(iv),
  };
}

async function decryptSecret(input: {
  encryptedValue: string;
  iv: string;
  errorMessage: string;
  errorCode: string;
}) {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBase64Url(input.iv) },
      await tokenEncryptionKey(),
      decodeBase64Url(input.encryptedValue),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new GoogleDriveStorageError(
      input.errorMessage,
      input.errorCode,
    );
  }
}

export async function encryptRefreshToken(refreshToken: string) {
  const encrypted = await encryptSecret(refreshToken);
  return {
    encryptedRefreshToken: encrypted.encryptedValue,
    tokenIv: encrypted.iv,
  };
}

async function decryptRefreshToken(configuration: DriveConfiguration) {
  return decryptSecret({
    encryptedValue: configuration.encryptedRefreshToken,
    iv: configuration.tokenIv,
    errorMessage:
      "No fue posible descifrar la conexión con Google Drive. Vuelve a conectarla desde Administración.",
    errorCode: "DRIVE_TOKEN_DECRYPTION_FAILED",
  });
}

export async function getStoredOauthClientConfiguration() {
  return env.DB.prepare(
    `SELECT client_id AS clientId,encrypted_client_secret AS encryptedClientSecret,
      secret_iv AS secretIv,configured_by AS configuredBy,
      created_at AS createdAt,updated_at AS updatedAt
     FROM google_drive_oauth_client_configuration WHERE id=1`,
  ).first<DriveOauthClientConfiguration>();
}

export async function getGoogleDriveOauthClient(): Promise<GoogleDriveOauthClient | null> {
  const runtime = runtimeEnvironment();
  const environmentClientId = runtime.GOOGLE_DRIVE_CLIENT_ID?.trim() || "";
  const environmentClientSecret = runtime.GOOGLE_DRIVE_CLIENT_SECRET?.trim() || "";
  if (environmentClientId && environmentClientSecret)
    return {
      clientId: environmentClientId,
      clientSecret: environmentClientSecret,
      source: "environment",
    };
  const stored = await getStoredOauthClientConfiguration();
  if (!stored) return null;
  return {
    clientId: stored.clientId,
    clientSecret: await decryptSecret({
      encryptedValue: stored.encryptedClientSecret,
      iv: stored.secretIv,
      errorMessage:
        "No fue posible descifrar el cliente OAuth. Vuelve a guardar sus credenciales desde Administración.",
      errorCode: "DRIVE_CLIENT_DECRYPTION_FAILED",
    }),
    source: "admin",
  };
}

function driveApiActivationUrl(clientId: string) {
  const projectNumber = clientId.match(/^(\d+)-/)?.[1] || "";
  const url = new URL(
    "https://console.cloud.google.com/apis/library/drive.googleapis.com",
  );
  if (projectNumber) url.searchParams.set("project", projectNumber);
  return url.toString();
}

export async function googleDriveConfigurationStatus() {
  const runtime = runtimeEnvironment();
  const encryptionReady =
    (runtime.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY?.trim().length || 0) >= 24;
  let client: GoogleDriveOauthClient | null = null;
  let clientError = false;
  if (encryptionReady) {
    try {
      client = await getGoogleDriveOauthClient();
    } catch {
      clientError = true;
    }
  }
  const missing: string[] = [];
  if (!encryptionReady) missing.push("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY");
  if (!client)
    missing.push(
      clientError ? "Cliente OAuth cifrado no legible" : "Cliente OAuth de Google",
    );
  return {
    configured: encryptionReady && Boolean(client),
    missing,
    preferredRootFolderId: runtime.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || null,
    clientSource: client?.source || null,
    clientIdHint: client ? maskedGoogleOauthClientId(client.clientId) : null,
    apiActivationUrl: client ? driveApiActivationUrl(client.clientId) : null,
    expectedAccountEmail:
      runtime.GOOGLE_DRIVE_OWNER_EMAIL?.trim().toLowerCase() ||
      DEFAULT_GOOGLE_DRIVE_OWNER_EMAIL,
  };
}

export async function saveGoogleDriveOauthClient(input: {
  clientId: string;
  clientSecret: string;
  actor: string;
}) {
  const clientId = normalizeGoogleOauthClientId(input.clientId);
  const clientSecret = input.clientSecret.trim();
  if (!isValidGoogleOauthClientId(clientId))
    throw new GoogleDriveStorageError(
      "El Client ID no corresponde a un cliente OAuth web de Google.",
      "DRIVE_CLIENT_ID_INVALID",
      400,
    );
  if (!isValidGoogleOauthClientSecret(clientSecret))
    throw new GoogleDriveStorageError(
      "El Client Secret no tiene un formato válido.",
      "DRIVE_CLIENT_SECRET_INVALID",
      400,
    );
  const encrypted = await encryptSecret(clientSecret);
  const connectionReset = Boolean(await getDriveConfiguration());
  const statements = [
    env.DB.prepare(
      `INSERT INTO google_drive_oauth_client_configuration
        (id,client_id,encrypted_client_secret,secret_iv,configured_by,created_at,updated_at)
       VALUES (1,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         client_id=excluded.client_id,
         encrypted_client_secret=excluded.encrypted_client_secret,
         secret_iv=excluded.secret_iv,
         configured_by=excluded.configured_by,
         updated_at=CURRENT_TIMESTAMP`,
    ).bind(
      clientId,
      encrypted.encryptedValue,
      encrypted.iv,
      input.actor,
    ),
    env.DB.prepare("DELETE FROM google_drive_oauth_states"),
  ];
  if (connectionReset)
    statements.push(env.DB.prepare("DELETE FROM google_drive_configuration"));
  await env.DB.batch(statements);
  accessTokenCache = null;
  folderCache.clear();
  return {
    clientIdHint: maskedGoogleOauthClientId(clientId),
    connectionReset,
  };
}

export function googleDriveRedirectUri(request: Request) {
  return new URL("/api/admin/drive/callback", request.url).toString();
}

export async function getDriveConfiguration() {
  return env.DB.prepare(
    `SELECT encrypted_refresh_token AS encryptedRefreshToken,token_iv AS tokenIv,
      account_email AS accountEmail,account_name AS accountName,
      root_folder_id AS rootFolderId,root_folder_name AS rootFolderName,
      connected_by AS connectedBy,connected_at AS connectedAt,updated_at AS updatedAt
     FROM google_drive_configuration WHERE id=1`,
  ).first<DriveConfiguration>();
}

async function parseGoogleError(response: Response) {
  const detail = await parseGoogleErrorDetail(response);
  return detail.message;
}

type GoogleErrorDetail = {
  message: string;
  reasons: string[];
};

async function parseGoogleErrorDetail(response: Response): Promise<GoogleErrorDetail> {
  try {
    const body = (await response.json()) as {
      error?:
        | string
        | {
            message?: string;
            status?: string;
            errors?: Array<{ reason?: string }>;
            details?: Array<{ reason?: string }>;
          };
      error_description?: string;
    };
    if (typeof body.error === "string")
      return {
        message: body.error_description || body.error,
        reasons: [body.error],
      };
    return {
      message: body.error?.message || body.error?.status || response.statusText,
      reasons: [
        body.error?.status,
        ...(body.error?.errors || []).map((item) => item.reason),
        ...(body.error?.details || []).map((item) => item.reason),
      ].filter((value): value is string => Boolean(value)),
    };
  } catch {
    return {
      message: response.statusText || `HTTP ${response.status}`,
      reasons: [],
    };
  }
}

function isDriveApiDisabled(detail: GoogleErrorDetail) {
  return /accessnotconfigured|service_disabled|has not been used in project|api[^.]{0,40}(?:disabled|not enabled)/i.test(
    [detail.message, ...detail.reasons].join(" "),
  );
}

async function refreshAccessToken(configuration: DriveConfiguration) {
  const client = await getGoogleDriveOauthClient();
  if (!client)
    throw new GoogleDriveStorageError(
      "Google Drive aún no está configurado por Administración.",
      "DRIVE_NOT_CONFIGURED",
    );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: await decryptRefreshToken(configuration),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok)
    throw new GoogleDriveStorageError(
      "La autorización de Google Drive venció o fue revocada. Vuelve a conectarla desde Administración.",
      "DRIVE_REAUTHORIZATION_REQUIRED",
      response.status === 400 || response.status === 401 ? 401 : 503,
    );
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token)
    throw new GoogleDriveStorageError(
      "Google no entregó un acceso válido. Vuelve a conectar Drive.",
      "DRIVE_ACCESS_TOKEN_MISSING",
    );
  accessTokenCache = {
    configurationVersion: configuration.updatedAt,
    token: body.access_token,
    expiresAt: Date.now() + Math.max(60, (body.expires_in || 3600) - 120) * 1000,
  };
  return body.access_token;
}

async function driveAccessToken() {
  const configurationStatus = await googleDriveConfigurationStatus();
  if (!configurationStatus.configured)
    throw new GoogleDriveStorageError(
      "Google Drive aún no está configurado por Administración.",
      "DRIVE_NOT_CONFIGURED",
    );
  const configuration = await getDriveConfiguration();
  if (!configuration)
    throw new GoogleDriveStorageError(
      "Google Drive todavía no está conectado.",
      "DRIVE_NOT_CONNECTED",
    );
  if (
    accessTokenCache &&
    accessTokenCache.configurationVersion === configuration.updatedAt &&
    accessTokenCache.expiresAt > Date.now()
  )
    return { configuration, token: accessTokenCache.token };
  return { configuration, token: await refreshAccessToken(configuration) };
}

export async function googleAuthorizedAccount() {
  const { configuration, token } = await driveAccessToken();
  return {
    token,
    accountEmail: configuration.accountEmail,
    accountName: configuration.accountName,
  };
}

async function googleDriveFetch(
  url: string,
  token: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  return response;
}

async function inspectDriveFolderPrivacy(token: string, folderId: string) {
  if (
    driveFolderPrivacyCache?.folderId === folderId &&
    driveFolderPrivacyCache.isPrivate &&
    Date.now() - driveFolderPrivacyCache.checkedAt < 5 * 60 * 1000
  )
    return { isPrivate: driveFolderPrivacyCache.isPrivate };
  const response = await googleDriveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed,permissions(id,type,role,allowFileDiscovery)`,
    token,
  );
  if (!response.ok)
    throw new GoogleDriveStorageError(
      "No fue posible comprobar la privacidad de la carpeta de expedientes.",
      "DRIVE_FOLDER_PRIVACY_UNVERIFIED",
      response.status === 404 ? 404 : 503,
    );
  const folder = (await response.json()) as DriveFileMetadata & {
    permissions?: Array<{ type?: string; role?: string }>;
  };
  if (!Array.isArray(folder.permissions))
    throw new GoogleDriveStorageError(
      "Google no permitió confirmar que la carpeta de expedientes sea privada.",
      "DRIVE_FOLDER_PRIVACY_UNVERIFIED",
      409,
    );
  const broadPermission = hasBroadDriveFolderAccess(folder.permissions);
  driveFolderPrivacyCache = {
    folderId,
    isPrivate: !broadPermission,
    checkedAt: Date.now(),
  };
  return { isPrivate: !broadPermission };
}

async function requirePrivateDriveFolder(token: string, folderId: string) {
  const privacy = await inspectDriveFolderPrivacy(token, folderId);
  if (!privacy.isPrivate)
    throw new GoogleDriveStorageError(
      "La carpeta de expedientes permite acceso mediante enlace. Cámbiala a “Restringido” antes de sincronizar documentos personales.",
      "DRIVE_FOLDER_NOT_PRIVATE",
      409,
    );
  return privacy;
}

export async function googleDriveRootFolderPrivacy() {
  const { configuration, token } = await driveAccessToken();
  return inspectDriveFolderPrivacy(token, configuration.rootFolderId);
}

function escapeDriveQuery(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function findFolder(token: string, parentId: string, name: string) {
  const parameters = new URLSearchParams({
    q: `'${escapeDriveQuery(parentId)}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${escapeDriveQuery(name)}'`,
    spaces: "drive",
    pageSize: "10",
    fields: "files(id,name,mimeType,parents)",
  });
  const response = await googleDriveFetch(
    `https://www.googleapis.com/drive/v3/files?${parameters}`,
    token,
  );
  if (!response.ok)
    throw new GoogleDriveStorageError(
      `No fue posible localizar la carpeta “${name}” en Drive.`,
      "DRIVE_FOLDER_LOOKUP_FAILED",
    );
  const body = (await response.json()) as { files?: DriveFileMetadata[] };
  return body.files?.[0] || null;
}

async function createFolder(token: string, parentId: string | null, name: string) {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];
  const response = await googleDriveFetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents",
    token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metadata),
    },
  );
  if (!response.ok)
    throw new GoogleDriveStorageError(
      `No fue posible crear la carpeta “${name}” en Drive.`,
      "DRIVE_FOLDER_CREATE_FAILED",
    );
  return (await response.json()) as DriveFileMetadata;
}

async function ensureFolder(token: string, parentId: string, name: string) {
  return (await findFolder(token, parentId, name)) ||
    (await createFolder(token, parentId, name));
}

async function verifyPreferredRoot(token: string, folderId: string) {
  const response = await googleDriveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed`,
    token,
  );
  if (!response.ok) {
    const detail = await parseGoogleErrorDetail(response);
    if (isDriveApiDisabled(detail))
      throw new GoogleDriveStorageError(
        "La API de Google Drive no está activada en el proyecto OAuth. Actívala en Google Cloud y vuelve a autorizar.",
        "DRIVE_API_NOT_ENABLED",
        503,
      );
    return null;
  }
  const folder = (await response.json()) as DriveFileMetadata;
  if (
    folder.trashed ||
    folder.mimeType !== "application/vnd.google-apps.folder"
  )
    return null;
  return folder;
}

export async function resolveRootFolder(
  token: string,
  preferredFolderId?: string | null,
) {
  if (preferredFolderId) {
    const preferred = await verifyPreferredRoot(token, preferredFolderId);
    if (preferred) {
      await requirePrivateDriveFolder(token, preferred.id);
      return preferred;
    }
  }
  const created = await createFolder(token, null, GOOGLE_DRIVE_ROOT_NAME);
  await requirePrivateDriveFolder(token, created.id);
  return created;
}

async function ensureMatriculaFolders(
  token: string,
  rootFolderId: string,
  matricula: string,
) {
  const cacheKey = `${rootFolderId}:${matricula}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;
  const matriculaFolder = await ensureFolder(token, rootFolderId, matricula);
  const entries = await Promise.all(
    Object.entries(DRIVE_DOCUMENT_FOLDERS).map(async ([kind, name]) => [
      kind,
      (await ensureFolder(token, matriculaFolder.id, name)).id,
    ]),
  );
  const result = Object.fromEntries(entries) as Record<DriveDocumentKind, string>;
  folderCache.set(cacheKey, result);
  return result;
}

function documentLabel(kind: DriveDocumentKind) {
  const labels: Record<DriveDocumentKind, string> = {
    ine: "INE",
    beneficiary_curp: "CURP",
    tarjeton: "Tarjeton",
    beneficiary_evidence: "Parentesco",
  };
  return labels[kind];
}

function timestampForName() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function sha256Hex(bytes: ArrayBuffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function trashDriveFile(token: string, fileId: string) {
  const response = await googleDriveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,trashed`,
    token,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    },
  );
  if (!response.ok)
    throw new GoogleDriveStorageError(
      "No fue posible mover el archivo anterior a la papelera de Drive.",
      "DRIVE_FILE_CLEANUP_FAILED",
    );
}

export async function uploadLegalDocumentToDrive(input: {
  bytes: ArrayBuffer;
  originalFileName: string;
  matricula: string;
  kind: DriveDocumentKind;
  applicationId: number;
  beneficiaryId?: number | null;
}) {
  const { configuration, token } = await driveAccessToken();
  await requirePrivateDriveFolder(token, configuration.rootFolderId);
  const folders = await ensureMatriculaFolders(
    token,
    configuration.rootFolderId,
    input.matricula,
  );
  const folderId = folders[input.kind];
  const fileName = safeDriveFileName(
    `${documentLabel(input.kind)} - ${timestampForName()} - ${input.originalFileName}`,
  );
  const expectedHash = await sha256Hex(input.bytes);
  const metadataResponse = await googleDriveFetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,parents,size,sha256Checksum",
    token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fileName,
        mimeType: "application/pdf",
        parents: [folderId],
        appProperties: {
          applicationId: String(input.applicationId),
          beneficiaryId: input.beneficiaryId ? String(input.beneficiaryId) : "",
          documentKind: input.kind,
          matricula: input.matricula,
        },
      }),
    },
  );
  if (!metadataResponse.ok)
    throw new GoogleDriveStorageError(
      "Google Drive rechazó la creación del documento. Vuelve a intentarlo.",
      "DRIVE_FILE_CREATE_FAILED",
    );
  const created = (await metadataResponse.json()) as DriveFileMetadata;
  try {
    const uploadResponse = await googleDriveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(created.id)}?uploadType=media&fields=id,name,parents,size,sha256Checksum`,
      token,
      {
        method: "PATCH",
        headers: { "content-type": "application/pdf" },
        body: input.bytes,
      },
    );
    if (!uploadResponse.ok)
      throw new GoogleDriveStorageError(
        "Google Drive no terminó de recibir el PDF. Tu avance se conserva para reintentar.",
        "DRIVE_FILE_UPLOAD_FAILED",
      );
    const uploaded = (await uploadResponse.json()) as DriveFileMetadata;
    const uploadedSize = Number(uploaded.size || 0);
    if (uploadedSize !== input.bytes.byteLength)
      throw new GoogleDriveStorageError(
        "La verificación de tamaño del PDF en Drive no coincidió.",
        "DRIVE_FILE_SIZE_MISMATCH",
      );
    if (
      uploaded.sha256Checksum &&
      uploaded.sha256Checksum.toLowerCase() !== expectedHash
    )
      throw new GoogleDriveStorageError(
        "La verificación de integridad del PDF en Drive no coincidió.",
        "DRIVE_FILE_HASH_MISMATCH",
      );
    return {
      storageProvider: "drive" as const,
      storageKey: `drive:${uploaded.id}`,
      driveFileId: uploaded.id,
      driveFolderId: folderId,
      contentSha256: expectedHash,
      storedFileName: uploaded.name || fileName,
    };
  } catch (error) {
    await trashDriveFile(token, created.id).catch(() => undefined);
    throw error;
  }
}

export async function downloadDriveDocument(fileId: string) {
  const { token } = await driveAccessToken();
  const response = await googleDriveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    token,
  );
  if (!response.ok)
    throw new GoogleDriveStorageError(
      "El documento no está disponible en Google Drive.",
      "DRIVE_FILE_DOWNLOAD_FAILED",
      response.status === 404 ? 404 : 503,
    );
  return response;
}

export async function deleteStoredDocument(input: {
  storageProvider?: string | null;
  storageKey: string;
  driveFileId?: string | null;
  legacyStorageKey?: string | null;
}) {
  const queueCleanup = async (
    storageProvider: "drive" | "r2",
    storageKey: string,
    driveFileId: string | null,
    operation: () => Promise<unknown>,
  ) => {
    try {
      await operation();
    } catch (error) {
      await env.DB.prepare(
        `INSERT INTO document_storage_cleanup_queue
          (storage_provider,storage_key,drive_file_id,reason,attempts,last_error,updated_at)
         VALUES (?,?,?,?,1,?,CURRENT_TIMESTAMP)
         ON CONFLICT(storage_provider,storage_key) DO UPDATE SET
           drive_file_id=excluded.drive_file_id,attempts=attempts+1,
           last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP`,
      )
        .bind(
          storageProvider,
          storageKey,
          driveFileId,
          "Archivo sustituido o expediente eliminado",
          error instanceof Error ? error.message.slice(0, 500) : "Error de limpieza",
        )
        .run();
      throw error;
    }
  };
  const tasks: Promise<unknown>[] = [];
  if (input.storageProvider === "drive" && input.driveFileId) {
    tasks.push(
      queueCleanup("drive", input.storageKey, input.driveFileId, () =>
        driveAccessToken().then(({ token }) =>
          trashDriveFile(token, input.driveFileId!),
        ),
      ),
    );
  } else if (input.storageKey) {
    tasks.push(
      queueCleanup("r2", input.storageKey, null, () =>
        env.BUCKET.delete(input.storageKey),
      ),
    );
    if (input.driveFileId)
      tasks.push(
        queueCleanup(
          "drive",
          `drive:${input.driveFileId}`,
          input.driveFileId,
          () =>
            driveAccessToken().then(({ token }) =>
              trashDriveFile(token, input.driveFileId!),
            ),
        ),
      );
  }
  if (input.legacyStorageKey)
    tasks.push(
      queueCleanup("r2", input.legacyStorageKey, null, () =>
        env.BUCKET.delete(input.legacyStorageKey!),
      ),
    );
  await Promise.all(tasks);
}

export async function isGoogleDriveStorageActive() {
  if (!(await googleDriveConfigurationStatus()).configured) return false;
  if (!(await getDriveConfiguration())) return false;
  try {
    return (await googleDriveRootFolderPrivacy()).isPrivate;
  } catch {
    return false;
  }
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  redirectUri: string;
}) {
  const client = await getGoogleDriveOauthClient();
  if (!client)
    throw new GoogleDriveStorageError(
      "Google Drive aún no está configurado por Administración.",
      "DRIVE_NOT_CONFIGURED",
    );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok)
    throw new GoogleDriveStorageError(
      `Google no pudo completar la autorización: ${await parseGoogleError(response)}`,
      "DRIVE_AUTHORIZATION_EXCHANGE_FAILED",
      400,
    );
  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!body.access_token || !body.refresh_token)
    throw new GoogleDriveStorageError(
      "Google no entregó una autorización permanente. Intenta conectar nuevamente.",
      "DRIVE_REFRESH_TOKEN_MISSING",
      400,
    );
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in || 3600,
  };
}

export async function driveAccountProfile(accessToken: string) {
  const response = await googleDriveFetch(
    "https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)",
    accessToken,
  );
  if (!response.ok) {
    const detail = await parseGoogleErrorDetail(response);
    if (isDriveApiDisabled(detail))
      throw new GoogleDriveStorageError(
        "La API de Google Drive no está activada en el proyecto OAuth. Actívala en Google Cloud y vuelve a autorizar.",
        "DRIVE_API_NOT_ENABLED",
        503,
      );
    throw new GoogleDriveStorageError(
      "No fue posible confirmar la cuenta de Google Drive.",
      "DRIVE_ACCOUNT_LOOKUP_FAILED",
      400,
    );
  }
  const body = (await response.json()) as {
    user?: { displayName?: string; emailAddress?: string };
  };
  return {
    name: body.user?.displayName?.trim() || null,
    email: body.user?.emailAddress?.trim().toLowerCase() || null,
  };
}

export async function saveDriveConnection(input: {
  refreshToken: string;
  accountEmail: string | null;
  accountName: string | null;
  rootFolderId: string;
  rootFolderName: string;
  actor: string;
}) {
  const encrypted = await encryptRefreshToken(input.refreshToken);
  await env.DB.prepare(
    `INSERT INTO google_drive_configuration
      (id,encrypted_refresh_token,token_iv,account_email,account_name,
       root_folder_id,root_folder_name,connected_by,connected_at,updated_at)
     VALUES (1,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       encrypted_refresh_token=excluded.encrypted_refresh_token,
       token_iv=excluded.token_iv,account_email=excluded.account_email,
       account_name=excluded.account_name,root_folder_id=excluded.root_folder_id,
       root_folder_name=excluded.root_folder_name,connected_by=excluded.connected_by,
       connected_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`,
  )
    .bind(
      encrypted.encryptedRefreshToken,
      encrypted.tokenIv,
      input.accountEmail,
      input.accountName,
      input.rootFolderId,
      input.rootFolderName,
      input.actor,
    )
    .run();
  accessTokenCache = null;
  folderCache.clear();
  driveFolderPrivacyCache = null;
}

export async function trashDriveDocument(fileId: string) {
  const { token } = await driveAccessToken();
  await trashDriveFile(token, fileId);
}
