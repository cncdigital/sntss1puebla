ALTER TABLE `application_consents` ADD `sensitive_data_accepted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `application_consents` ADD `consent_record_version` text DEFAULT 'CE-CRED-SNTSS1-2026.08.23-R2' NOT NULL;--> statement-breakpoint
ALTER TABLE `application_consents` ADD `responsible_name` text DEFAULT 'SINDICATO NACIONAL DE TRABAJADORES DEL SEGURO SOCIAL SECCION 1' NOT NULL;--> statement-breakpoint
ALTER TABLE `application_consents` ADD `responsible_rfc` text DEFAULT 'SNT4704075E4' NOT NULL;--> statement-breakpoint
ALTER TABLE `application_consents` ADD `responsible_address` text DEFAULT 'Privada Nayarit número exterior 1305, colonia El Carmen, Heroica Puebla de Zaragoza, municipio de Puebla, estado de Puebla, C.P. 72530, entre calle 13 Oriente y calle 15 Oriente' NOT NULL;--> statement-breakpoint
ALTER TABLE `application_consents` ADD `contact_email` text DEFAULT 'transparencia@sntss1pue.com' NOT NULL;
