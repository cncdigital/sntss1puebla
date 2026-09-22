export type ApiErrorPayload = { error?: string };

const TRANSIENT_API_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Reintenta una vez las lecturas fallidas; nunca repite escrituras. */
export async function fetchApi(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const method = (init.method || "GET").toUpperCase();
  const attempts = method === "GET" || method === "HEAD" ? 2 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (
        attempt + 1 >= attempts ||
        !TRANSIENT_API_STATUS.has(response.status)
      )
        return response;
      await response.arrayBuffer().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= attempts) throw error;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, 500 + Math.round(Math.random() * 250)),
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("No fue posible comunicarse con el servidor.");
}

export async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const body = await response.text();
  if (!body.trim()) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

export function apiResponseError(
  response: Response,
  data: ApiErrorPayload | null,
  fallback: string,
) {
  if (data?.error?.trim()) return data.error;
  if (!response.ok) return `${fallback} (código ${response.status}).`;
  return `${fallback} El servidor respondió sin datos; vuelve a intentarlo.`;
}
