export type RequestedMatriculaResolution =
  | { authorized: true; matricula: string }
  | { authorized: false; matricula: null; reason: string };

export function requestedMatricula(request: Request) {
  return request.headers.get("x-sntss-matricula")?.replace(/\D/g, "") || "";
}

export function resolveRequestedMatricula(
  request: Request,
  authenticatedMatriculas: string[],
): RequestedMatriculaResolution {
  const requested = requestedMatricula(request);
  if (requested && !authenticatedMatriculas.includes(requested))
    return {
      authorized: false,
      matricula: null,
      reason: "La identidad solicitada no coincide con la sesión activa.",
    };
  return {
    authorized: true,
    matricula: requested || authenticatedMatriculas[0] || "",
  };
}
