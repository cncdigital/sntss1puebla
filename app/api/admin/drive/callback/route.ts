import { env } from "cloudflare:workers";
import { audit } from "../../../authz";
import {
  GOOGLE_DRIVE_ROOT_NAME,
  GoogleDriveStorageError,
  driveAccountProfile,
  exchangeAuthorizationCode,
  getDriveConfiguration,
  googleDriveConfigurationStatus,
  resolveRootFolder,
  saveDriveConnection,
} from "../../../google-drive/storage";

function redirect(request: Request, result: "connected" | "error", code?: string) {
  const target = new URL("/", request.url);
  target.searchParams.set("drive", result);
  if (code) target.searchParams.set("driveCode", code);
  target.hash = "administracion";
  return Response.redirect(target.toString(), 303);
}

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const state = parameters.get("state")?.trim() || "";
  const code = parameters.get("code")?.trim() || "";
  const oauthError = parameters.get("error")?.trim() || "";
  if (!state || (!code && !oauthError))
    return redirect(request, "error", "invalid_callback");
  const savedState = await env.DB.prepare(
    `SELECT actor,redirect_uri AS redirectUri
     FROM google_drive_oauth_states
     WHERE state=? AND expires_at>CURRENT_TIMESTAMP`,
  )
    .bind(state)
    .first<{ actor: string; redirectUri: string }>();
  await env.DB.prepare("DELETE FROM google_drive_oauth_states WHERE state=?")
    .bind(state)
    .run();
  if (!savedState) return redirect(request, "error", "expired_state");
  if (oauthError) {
    await audit(
      savedState.actor,
      "google_drive.connection_cancelled",
      "storage",
      null,
      oauthError,
    );
    return redirect(request, "error", "authorization_cancelled");
  }
  const configurationStatus = await googleDriveConfigurationStatus();
  if (!configurationStatus.configured)
    return redirect(request, "error", "configuration_missing");
  try {
    const authorization = await exchangeAuthorizationCode({
      code,
      redirectUri: savedState.redirectUri,
    });
    const profile = await driveAccountProfile(authorization.accessToken);
    if (profile.email !== configurationStatus.expectedAccountEmail)
      throw new GoogleDriveStorageError(
        `Autoriza la cuenta ${configurationStatus.expectedAccountEmail}.`,
        "DRIVE_ACCOUNT_MISMATCH",
        403,
      );
    const previousConnection = await getDriveConfiguration();
    const rootFolder = await resolveRootFolder(
      authorization.accessToken,
      previousConnection?.rootFolderId ||
        configurationStatus.preferredRootFolderId,
    );
    await saveDriveConnection({
      refreshToken: authorization.refreshToken,
      accountEmail: profile.email,
      accountName: profile.name,
      rootFolderId: rootFolder.id,
      rootFolderName: rootFolder.name || GOOGLE_DRIVE_ROOT_NAME,
      actor: savedState.actor,
    });
    await audit(
      savedState.actor,
      "google_drive.connected",
      "storage",
      rootFolder.id,
      profile.email || undefined,
    );
    return redirect(request, "connected");
  } catch (error) {
    const codeValue =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "connection_failed";
    await audit(
      savedState.actor,
      "google_drive.connection_failed",
      "storage",
      null,
      codeValue,
    );
    return redirect(request, "error", codeValue.toLowerCase());
  }
}
