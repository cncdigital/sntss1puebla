import {
  GoogleDriveStorageError,
  googleAuthorizedAccount,
} from "./google-drive/storage";

export class RegistrationMailError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "RegistrationMailError";
  }
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function base64Url(value: string) {
  return base64(new TextEncoder().encode(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function encodedHeader(value: string) {
  return `=?UTF-8?B?${base64(new TextEncoder().encode(value))}?=`;
}

function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendAccessRegistrationApprovedEmail(input: {
  to: string;
  fullName: string;
  matricula: string;
  appUrl: string;
}) {
  let account: Awaited<ReturnType<typeof googleAuthorizedAccount>>;
  try {
    account = await googleAuthorizedAccount();
  } catch (error) {
    if (error instanceof GoogleDriveStorageError)
      throw new RegistrationMailError(
        "La cuenta de Google debe reconectarse desde Expedientes en Drive para habilitar el envío de correo.",
        "GOOGLE_REAUTHORIZATION_REQUIRED",
      );
    throw error;
  }
  const to = safeHeader(input.to.toLowerCase());
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
    throw new RegistrationMailError(
      "El correo de destino no es válido.",
      "RECIPIENT_INVALID",
    );
  const sender = safeHeader(account.accountEmail || "");
  if (!sender)
    throw new RegistrationMailError(
      "La cuenta de Google conectada no tiene un correo confirmado.",
      "SENDER_UNAVAILABLE",
    );
  const subject = "Tu registro en Credenciales SNTSS1Puebla fue aprobado";
  const name = safeHeader(input.fullName);
  const appUrl = new URL("/", input.appUrl).toString();
  const text = [
    `Hola ${name}:`,
    "",
    "Tu registro de acceso fue aprobado correctamente por la Sección I Puebla.",
    `Matrícula: ${input.matricula}`,
    "",
    "Ingresa a Credenciales SNTSS1Puebla, escribe tu matrícula y selecciona correo + CURP. Después completa tu fotografía y, si corresponde, registra a tus beneficiarios.",
    "Tu tarjetón y tu INE ya forman parte del expediente; no necesitas subirlos nuevamente.",
    "",
    appUrl,
    "",
    "SNTSS Sección I Puebla",
  ].join("\r\n");
  const html = `<!doctype html><html><body style="margin:0;background:#eef3f7;font-family:Arial,sans-serif;color:#18324a"><div style="max-width:620px;margin:0 auto;padding:28px 18px"><div style="background:#071d36;color:#fff;padding:24px;border-radius:16px 16px 0 0"><strong style="font-size:20px">Credenciales SNTSS1Puebla</strong><p style="margin:7px 0 0;color:#c7d7e5">SNTSS Sección I Puebla</p></div><div style="background:#fff;padding:28px;border-radius:0 0 16px 16px"><h1 style="margin:0 0 14px;font-size:25px;color:#0d3155">Registro aprobado</h1><p>Hola <strong>${escapeHtml(name)}</strong>:</p><p>Tu registro de acceso fue aprobado correctamente.</p><p><strong>Matrícula:</strong> ${escapeHtml(input.matricula)}</p><ol style="line-height:1.7"><li>Abre Credenciales SNTSS1Puebla.</li><li>Escribe tu matrícula.</li><li>Selecciona <strong>correo + CURP</strong>.</li><li>Completa tu fotografía y registra a tus beneficiarios, si corresponde.</li></ol><p style="padding:14px;border-radius:10px;background:#edf8f3;color:#176a48"><strong>Tu tarjetón y tu INE ya están en el expediente.</strong> No necesitas subirlos nuevamente.</p><p style="margin:24px 0"><a href="${escapeHtml(appUrl)}" style="display:inline-block;border-radius:9px;background:#0d5b92;color:#fff;padding:13px 18px;text-decoration:none;font-weight:700">Continuar mi credencial</a></p><p style="margin-bottom:0;color:#647586;font-size:13px">Este mensaje fue enviado porque registraste un acceso en la plataforma sindical.</p></div></div></body></html>`;
  const boundary = `sntss-${crypto.randomUUID()}`;
  const rawMessage = [
    `From: ${encodedHeader("Credenciales SNTSS1Puebla")} <${sender}>`,
    `To: ${to}`,
    `Reply-To: ${sender}`,
    `Subject: ${encodedHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`,
  ].join("\r\n");
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${account.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw: base64Url(rawMessage) }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn("access-registration.mail-failed", {
      status: response.status,
      detail: detail.slice(0, 300),
    });
    throw new RegistrationMailError(
      response.status === 401 || response.status === 403
        ? "Reconecta la cuenta de Google y acepta el permiso para enviar correos. También verifica que Gmail API esté habilitada."
        : "Google no pudo enviar el correo en este momento; puede reintentarse desde la bandeja.",
      response.status === 401 || response.status === 403
        ? "GMAIL_PERMISSION_REQUIRED"
        : "GMAIL_SEND_FAILED",
    );
  }
  const result = (await response.json()) as { id?: string };
  return { messageId: result.id || null, sender };
}
