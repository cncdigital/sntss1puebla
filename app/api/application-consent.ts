import {
  CONSENT_RECORD_VERSION,
  DATA_CONTROLLER_ADDRESS,
  DATA_CONTROLLER_LEGAL_NAME,
  DATA_CONTROLLER_RFC,
  DATA_PROTECTION_EMAIL,
  GENERAL_TERMS_VERSION,
  PRIVACY_NOTICE_VERSION,
  type CredentialConsentPayload,
} from "../legal-config";

type ConsentDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
    };
  };
};

export function validateCredentialConsent(
  consent: CredentialConsentPayload | undefined,
  hasBeneficiaries: boolean,
) {
  if (
    consent?.noticeVersion !== PRIVACY_NOTICE_VERSION ||
    consent.termsVersion !== GENERAL_TERMS_VERSION ||
    consent.consentRecordVersion !== CONSENT_RECORD_VERSION ||
    consent.privacyNoticeAccepted !== true ||
    consent.identificationDocumentsAccepted !== true ||
    consent.sensitiveDataAccepted !== true ||
    consent.generalTermsAccepted !== true ||
    (hasBeneficiaries && consent.beneficiaryAuthorityConfirmed !== true)
  ) {
    return {
      ok: false as const,
      error:
        "Debes leer y aceptar el aviso de privacidad, el consentimiento expreso para datos sensibles y las condiciones generales vigentes.",
    };
  }
  return { ok: true as const };
}

export async function recordCredentialConsent({
  db,
  applicationId,
  workerId,
  matricula,
  consent,
  hasBeneficiaries,
  acceptanceChannel = "web_credential_registration",
}: {
  db: ConsentDatabase;
  applicationId: number;
  workerId: number;
  matricula: string;
  consent: CredentialConsentPayload;
  hasBeneficiaries: boolean;
  acceptanceChannel?:
    | "web_credential_registration"
    | "web_access_registration";
}) {
  await db.prepare(
    `INSERT INTO application_consents
      (application_id,worker_id,matricula,notice_version,terms_version,
       privacy_accepted,identification_documents_accepted,sensitive_data_accepted,
       general_terms_accepted,beneficiary_authority_confirmed,acceptance_channel,
       consent_record_version,responsible_name,responsible_rfc,responsible_address,
       contact_email,accepted_at)
     VALUES (?,?,?,?,?,1,1,1,1,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(application_id,notice_version,terms_version) DO UPDATE SET
       privacy_accepted=1,
       identification_documents_accepted=1,
       sensitive_data_accepted=1,
       general_terms_accepted=1,
       beneficiary_authority_confirmed=MAX(
         application_consents.beneficiary_authority_confirmed,
         excluded.beneficiary_authority_confirmed
       ),
       matricula=excluded.matricula,
       acceptance_channel=excluded.acceptance_channel,
       consent_record_version=excluded.consent_record_version,
       responsible_name=excluded.responsible_name,
       responsible_rfc=excluded.responsible_rfc,
       responsible_address=excluded.responsible_address,
       contact_email=excluded.contact_email,
       accepted_at=CURRENT_TIMESTAMP`,
  )
    .bind(
      applicationId,
      workerId,
      matricula,
      consent.noticeVersion,
      consent.termsVersion,
      hasBeneficiaries ? 1 : 0,
      acceptanceChannel,
      CONSENT_RECORD_VERSION,
      DATA_CONTROLLER_LEGAL_NAME,
      DATA_CONTROLLER_RFC,
      DATA_CONTROLLER_ADDRESS,
      DATA_PROTECTION_EMAIL,
    )
    .run();
}

export async function hasCurrentCredentialConsent(
  db: ConsentDatabase,
  applicationId: number,
  hasBeneficiaries: boolean,
) {
  const row = await db.prepare(
    `SELECT id FROM application_consents
     WHERE application_id=? AND notice_version=? AND terms_version=?
       AND privacy_accepted=1
       AND identification_documents_accepted=1
       AND sensitive_data_accepted=1
       AND general_terms_accepted=1
       AND consent_record_version=?
       AND (?=0 OR beneficiary_authority_confirmed=1)
     LIMIT 1`,
  )
    .bind(
      applicationId,
      PRIVACY_NOTICE_VERSION,
      GENERAL_TERMS_VERSION,
      CONSENT_RECORD_VERSION,
      hasBeneficiaries ? 1 : 0,
    )
    .first<{ id: number }>();
  return Boolean(row);
}
