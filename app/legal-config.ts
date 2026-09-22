export const LEGAL_EFFECTIVE_DATE = "4 de septiembre de 2026";
export const DATA_CONTROLLER_LEGAL_NAME = "SINDICATO NACIONAL DE TRABAJADORES DEL SEGURO SOCIAL SECCION 1";
export const DATA_CONTROLLER_RFC = "SNT4704075E4";
export const DATA_CONTROLLER_ADDRESS = "Privada Nayarit número exterior 1305, colonia El Carmen, Heroica Puebla de Zaragoza, municipio de Puebla, estado de Puebla, C.P. 72530, entre calle 13 Oriente y calle 15 Oriente";
export const DATA_PROTECTION_EMAIL = "transparencia@sntss1pue.com";

export const PRIVACY_NOTICE_VERSION = "AP-CRED-SNTSS1-2026.09.04-R4";
export const GENERAL_TERMS_VERSION = "CG-CRED-SNTSS1-2026.09.04-R4";
export const CONSENT_RECORD_VERSION = "CE-CRED-SNTSS1-2026.09.04-R4";

export type CredentialConsentPayload = {
  noticeVersion?: string;
  termsVersion?: string;
  consentRecordVersion?: string;
  privacyNoticeAccepted?: boolean;
  identificationDocumentsAccepted?: boolean;
  sensitiveDataAccepted?: boolean;
  generalTermsAccepted?: boolean;
  beneficiaryAuthorityConfirmed?: boolean;
};
