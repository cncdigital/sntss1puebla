import { env } from "cloudflare:workers";

type ValidityRow = {
  status: string;
  documentStatus: string;
  adminValidated: number;
  hasProfilePhoto: number;
  validProfilePhoto: number;
  validTarjeton: number;
  validIne: number;
  unresolvedDocuments: number;
  invalidBeneficiaries: number;
};

export type CredentialValidity = {
  valid: boolean;
  reason: string;
};

export async function getCredentialValidity(
  applicationId: number,
): Promise<CredentialValidity> {
  const row = await env.DB.prepare(
    `SELECT a.status,a.document_status AS documentStatus,
      COALESCE(a.admin_validated,0) AS adminValidated,
      CASE WHEN a.profile_photo_key IS NOT NULL THEN 1 ELSE 0 END AS hasProfilePhoto,
      EXISTS(
        SELECT 1 FROM verification_documents d
        WHERE d.application_id=a.id AND d.beneficiary_id IS NULL
          AND d.kind='profile_photo'
          AND d.verification_status IN ('auto_verified','verified')
      ) AS validProfilePhoto,
      EXISTS(
        SELECT 1 FROM verification_documents d
        WHERE d.application_id=a.id AND d.beneficiary_id IS NULL
          AND d.kind='tarjeton'
          AND d.verification_status IN ('auto_verified','verified')
      ) AS validTarjeton,
      EXISTS(
        SELECT 1 FROM verification_documents d
        WHERE d.application_id=a.id AND d.beneficiary_id IS NULL
          AND d.kind='ine'
          AND d.verification_status IN ('auto_verified','verified')
      ) AS validIne,
      (
        SELECT COUNT(*) FROM verification_documents d
        WHERE d.application_id=a.id
          AND (
            d.beneficiary_id IS NULL OR EXISTS(
              SELECT 1 FROM beneficiaries active_beneficiary
              WHERE active_beneficiary.id=d.beneficiary_id
                AND active_beneficiary.active=1
            )
          )
          AND d.verification_status NOT IN ('auto_verified','verified')
      ) AS unresolvedDocuments,
      (
        SELECT COUNT(*) FROM beneficiaries b
        WHERE b.application_id=a.id AND b.active=1 AND (
          b.photo_key IS NULL OR b.curp IS NULL OR LENGTH(TRIM(b.curp))<>18
          OR b.document_status<>'verified'
          OR NOT EXISTS(
            SELECT 1 FROM verification_documents photo
            WHERE photo.application_id=a.id AND photo.beneficiary_id=b.id
              AND photo.kind='beneficiary_photo'
              AND photo.verification_status IN ('auto_verified','verified')
          )
          OR NOT EXISTS(
            SELECT 1 FROM verification_documents evidence
            WHERE evidence.application_id=a.id AND evidence.beneficiary_id=b.id
              AND evidence.kind='beneficiary_evidence'
              AND evidence.verification_status IN ('auto_verified','verified')
          )
          OR NOT EXISTS(
            SELECT 1 FROM verification_documents curp_document
            WHERE curp_document.application_id=a.id
              AND curp_document.beneficiary_id=b.id
              AND curp_document.kind='beneficiary_curp'
              AND curp_document.verification_status IN ('auto_verified','verified')
          )
        )
      ) AS invalidBeneficiaries
     FROM applications a WHERE a.id=? AND a.archived_at IS NULL LIMIT 1`,
  )
    .bind(applicationId)
    .first<ValidityRow>();

  if (!row)
    return { valid: false, reason: "El expediente no está disponible." };
  if (row.status !== "approved")
    return { valid: false, reason: "La solicitud todavía no está aprobada." };
  if (Number(row.adminValidated))
    return {
      valid: true,
      reason: "Validación administrativa vigente registrada por un administrador.",
    };
  if (
    !Number(row.hasProfilePhoto) ||
    !Number(row.validProfilePhoto) ||
    !Number(row.validTarjeton) ||
    !Number(row.validIne)
  )
    return {
      valid: false,
      reason: "Falta validar la foto, el tarjetón o la INE del titular.",
    };
  if (Number(row.unresolvedDocuments) > 0)
    return {
      valid: false,
      reason: "Hay uno o más documentos pendientes, observados o rechazados.",
    };
  if (Number(row.invalidBeneficiaries) > 0)
    return {
      valid: false,
      reason: "Falta validar la foto, el parentesco o la CURP de algún beneficiario.",
    };
  if (row.documentStatus !== "verified")
    return {
      valid: false,
      reason: "El expediente documental aún no está validado por completo.",
    };
  return {
    valid: true,
    reason: "Todos los documentos obligatorios están validados.",
  };
}
