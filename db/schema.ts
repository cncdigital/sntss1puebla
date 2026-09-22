import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const workers = sqliteTable("workers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matricula: text("matricula").notNull().unique(),
  fullName: text("full_name").notNull(),
  category: text("category"),
  unit: text("unit"),
  curp: text("curp"),
  nss: text("nss"),
  email: text("email"),
  phone: text("phone"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});
export const applications = sqliteTable(
  "applications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workerId: integer("worker_id").notNull(),
    folio: text("folio").notNull().unique(),
    status: text("status").notNull().default("pending"),
    credentialToken: text("credential_token").unique(),
    curp: text("curp"),
    phone: text("phone"),
    profilePhotoKey: text("profile_photo_key"),
    documentStatus: text("document_status").notNull().default("incomplete"),
    socialVerified: integer("social_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    socialEmail: text("social_email"),
    socialName: text("social_name"),
    reviewNotes: text("review_notes"),
    adminValidated: integer("admin_validated", { mode: "boolean" })
      .notNull()
      .default(false),
    adminValidatedBy: text("admin_validated_by"),
    adminValidatedAt: text("admin_validated_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    reviewedAt: text("reviewed_at"),
    archivedAt: text("archived_at"),
    archivedBy: text("archived_by"),
    archiveReason: text("archive_reason"),
  },
  (table) => [
    index("applications_worker_active_idx").on(table.workerId, table.archivedAt),
    index("applications_status_documents_idx").on(
      table.status,
      table.documentStatus,
    ),
  ],
);

export const recordRecovery = sqliteTable(
  "record_recovery",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    matricula: text("matricula"),
    snapshotJson: text("snapshot_json").notNull(),
    reason: text("reason").notNull(),
    archivedBy: text("archived_by").notNull(),
    archivedAt: text("archived_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    restoreUntil: text("restore_until").notNull(),
    restoredBy: text("restored_by"),
    restoredAt: text("restored_at"),
  },
  (table) => [
    index("record_recovery_active_until_idx").on(
      table.restoredAt,
      table.restoreUntil,
    ),
    index("record_recovery_matricula_archived_idx").on(
      table.matricula,
      table.archivedAt,
    ),
  ],
);
export const applicationConsents = sqliteTable(
  "application_consents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id").notNull(),
    workerId: integer("worker_id").notNull(),
    matricula: text("matricula").notNull(),
    noticeVersion: text("notice_version").notNull(),
    termsVersion: text("terms_version").notNull(),
    privacyAccepted: integer("privacy_accepted", { mode: "boolean" })
      .notNull()
      .default(false),
    identificationDocumentsAccepted: integer(
      "identification_documents_accepted",
      { mode: "boolean" },
    )
      .notNull()
      .default(false),
    sensitiveDataAccepted: integer("sensitive_data_accepted", { mode: "boolean" })
      .notNull()
      .default(false),
    generalTermsAccepted: integer("general_terms_accepted", { mode: "boolean" })
      .notNull()
      .default(false),
    beneficiaryAuthorityConfirmed: integer(
      "beneficiary_authority_confirmed",
      { mode: "boolean" },
    )
      .notNull()
      .default(false),
    acceptanceChannel: text("acceptance_channel")
      .notNull()
      .default("web_credential_registration"),
    consentRecordVersion: text("consent_record_version")
      .notNull()
      .default("CE-CRED-SNTSS1-2026.08.23-R2"),
    responsibleName: text("responsible_name")
      .notNull()
      .default("SINDICATO NACIONAL DE TRABAJADORES DEL SEGURO SOCIAL SECCION 1"),
    responsibleRfc: text("responsible_rfc")
      .notNull()
      .default("SNT4704075E4"),
    responsibleAddress: text("responsible_address")
      .notNull()
      .default("Privada Nayarit número exterior 1305, colonia El Carmen, Heroica Puebla de Zaragoza, municipio de Puebla, estado de Puebla, C.P. 72530, entre calle 13 Oriente y calle 15 Oriente"),
    contactEmail: text("contact_email")
      .notNull()
      .default("transparencia@sntss1pue.com"),
    acceptedAt: text("accepted_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("application_consents_application_versions_unique").on(
      table.applicationId,
      table.noticeVersion,
      table.termsVersion,
    ),
    index("application_consents_worker_accepted_idx").on(
      table.workerId,
      table.acceptedAt,
    ),
  ],
);
export const beneficiaries = sqliteTable(
  "beneficiaries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id").notNull(),
    fullName: text("full_name").notNull(),
    relationship: text("relationship").notNull(),
    clientReference: text("client_reference"),
    curp: text("curp"),
    photoKey: text("photo_key"),
    documentStatus: text("document_status").notNull().default("incomplete"),
    documentReason: text("document_reason"),
    credentialToken: text("credential_token").unique(),
    active: integer("active", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    index("beneficiaries_application_active_idx").on(
      table.applicationId,
      table.active,
    ),
  ],
);
export const applicationDocuments = sqliteTable(
  "verification_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id").notNull(),
    beneficiaryId: integer("beneficiary_id"),
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    verificationStatus: text("verification_status")
      .notNull()
      .default("manual_review"),
    matchScore: integer("match_score").notNull().default(0),
    verificationReason: text("verification_reason"),
    reviewerNotes: text("reviewer_notes"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    clientUploadId: text("client_upload_id").unique(),
    storageProvider: text("storage_provider").notNull().default("r2"),
    driveFileId: text("drive_file_id"),
    driveFolderId: text("drive_folder_id"),
    contentSha256: text("content_sha256"),
    legacyStorageKey: text("legacy_storage_key"),
    legacyCleanupPending: integer("legacy_cleanup_pending", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("verification_documents_application_status_idx").on(
      table.applicationId,
      table.verificationStatus,
    ),
    index("verification_documents_beneficiary_idx").on(table.beneficiaryId),
  ],
);
export const googleDriveConfiguration = sqliteTable("google_drive_configuration", {
  id: integer("id").primaryKey(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  tokenIv: text("token_iv").notNull(),
  accountEmail: text("account_email"),
  accountName: text("account_name"),
  rootFolderId: text("root_folder_id").notNull(),
  rootFolderName: text("root_folder_name")
    .notNull()
    .default("Expedientes Credencial SNTSS1"),
  connectedBy: text("connected_by"),
  connectedAt: text("connected_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const googleDriveOauthClientConfiguration = sqliteTable(
  "google_drive_oauth_client_configuration",
  {
    id: integer("id").primaryKey(),
    clientId: text("client_id").notNull(),
    encryptedClientSecret: text("encrypted_client_secret").notNull(),
    secretIv: text("secret_iv").notNull(),
    configuredBy: text("configured_by"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
);
export const googleDriveOauthStates = sqliteTable(
  "google_drive_oauth_states",
  {
    state: text("state").primaryKey(),
    actor: text("actor").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("google_drive_oauth_states_expires_idx").on(table.expiresAt)],
);
export const documentStorageCleanupQueue = sqliteTable(
  "document_storage_cleanup_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    driveFileId: text("drive_file_id"),
    reason: text("reason"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("document_storage_cleanup_provider_key_unique").on(
      table.storageProvider,
      table.storageKey,
    ),
    index("document_storage_cleanup_attempts_idx").on(
      table.attempts,
      table.updatedAt,
    ),
  ],
);
export const registrationQueue = sqliteTable("registration_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticket: text("ticket").notNull().unique(),
  matricula: text("matricula").notNull(),
  applicationId: integer("application_id"),
  status: text("status").notNull().default("queued"),
  filesTotal: integer("files_total").notNull().default(0),
  filesUploaded: integer("files_uploaded").notNull().default(0),
  retryCount: integer("retry_count").notNull().default(0),
  lastError: text("last_error"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  admittedAt: text("admitted_at"),
  lastSeenAt: text("last_seen_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});
export const roleAssignments = sqliteTable("role_assignments", {
  matricula: text("matricula").primaryKey(),
  designation: text("designation").notNull().default("Trabajador/a IMSS"),
  credentialStyle: text("credential_style").notNull().default("standard"),
  canAdmin: integer("can_admin", { mode: "boolean" }).notNull().default(false),
  canReview: integer("can_review", { mode: "boolean" })
    .notNull()
    .default(false),
  canScan: integer("can_scan", { mode: "boolean" }).notNull().default(false),
  canTrainDevi: integer("can_train_devi", { mode: "boolean" })
    .notNull()
    .default(false),
  canManageActs: integer("can_manage_acts", { mode: "boolean" })
    .notNull()
    .default(false),
  canManageScholarships: integer("can_manage_scholarships", { mode: "boolean" })
    .notNull()
    .default(false),
  canViewFacilityCalendar: integer("can_view_facility_calendar", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  canManageSportsCalendar: integer("can_manage_sports_calendar", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  canManageUnionCalendar: integer("can_manage_union_calendar", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  canChat: integer("can_chat", { mode: "boolean" }).notNull().default(false),
  facilitiesJson: text("facilities_json").notNull().default("[]"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const facilityCalendarEvents = sqliteTable(
  "facility_calendar_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    facility: text("facility").notNull(),
    title: text("title").notNull(),
    organizer: text("organizer"),
    notes: text("notes"),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("facility_calendar_events_range_idx").on(
      table.facility,
      table.startsAt,
      table.endsAt,
    ),
    index("facility_calendar_events_starts_idx").on(table.startsAt),
  ],
);
export const deviTrainingSources = sqliteTable(
  "devi_training_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    kind: text("kind").notNull(),
    referenceLabel: text("reference_label"),
    summary: text("summary").notNull(),
    originalName: text("original_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    storageKey: text("storage_key").unique(),
    contentSha256: text("content_sha256").notNull().unique(),
    characterCount: integer("character_count").notNull(),
    chunkCount: integer("chunk_count").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("devi_training_sources_active_updated_idx").on(
      table.active,
      table.updatedAt,
    ),
    index("devi_training_sources_kind_active_idx").on(table.kind, table.active),
  ],
);
export const deviTrainingChunks = sqliteTable(
  "devi_training_chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => deviTrainingSources.id),
    chunkIndex: integer("chunk_index").notNull(),
    locator: text("locator").notNull(),
    content: text("content").notNull(),
    normalizedContent: text("normalized_content").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("devi_training_chunks_source_index_unique").on(
      table.sourceId,
      table.chunkIndex,
    ),
    index("devi_training_chunks_source_idx").on(table.sourceId),
  ],
);
export const deviProgressLists = sqliteTable(
  "devi_progress_lists",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    processType: text("process_type").notNull(),
    customProcessLabel: text("custom_process_label"),
    referenceLabel: text("reference_label"),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    contentSha256: text("content_sha256").notNull(),
    sheetNamesJson: text("sheet_names_json").notNull().default("[]"),
    rowCount: integer("row_count").notNull(),
    skippedRows: integer("skipped_rows").notNull().default(0),
    uploadedBy: text("uploaded_by").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("devi_progress_lists_active_updated_idx").on(
      table.active,
      table.updatedAt,
    ),
    index("devi_progress_lists_title_active_idx").on(
      table.normalizedTitle,
      table.active,
    ),
    index("devi_progress_lists_process_active_idx").on(
      table.processType,
      table.active,
    ),
    index("devi_progress_lists_content_sha256_idx").on(table.contentSha256),
  ],
);
export const deviProgressEntries = sqliteTable(
  "devi_progress_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => deviProgressLists.id),
    progressiveNumber: text("progressive_number").notNull(),
    progressiveOrder: integer("progressive_order").notNull(),
    progressiveDerived: integer("progressive_derived", { mode: "boolean" })
      .notNull()
      .default(false),
    matricula: text("matricula").notNull(),
    fullName: text("full_name"),
    normalizedName: text("normalized_name").notNull(),
    unitText: text("unit_text"),
    statusText: text("status_text"),
    statusUpdatedAt: text("status_updated_at"),
    statusUpdatedBy: text("status_updated_by"),
    movementCode: text("movement_code"),
    categoryCode: text("category_code"),
    categoryName: text("category_name"),
    requestedAssignmentCode: text("requested_assignment_code"),
    requestedShift: text("requested_shift"),
    calculatedPosition: integer("calculated_position"),
    sheetName: text("sheet_name").notNull(),
    rowNumber: integer("row_number").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("devi_progress_entries_list_sheet_row_unique").on(
      table.listId,
      table.sheetName,
      table.rowNumber,
    ),
    index("devi_progress_entries_matricula_list_idx").on(
      table.matricula,
      table.listId,
    ),
    index("devi_progress_entries_list_order_idx").on(
      table.listId,
      table.progressiveOrder,
    ),
  ],
);
export const deviProgressCoaching = sqliteTable(
  "devi_progress_coaching",
  {
    id: text("id").primaryKey(),
    entryId: integer("entry_id").notNull(),
    listId: integer("list_id").notNull(),
    listTitle: text("list_title").notNull(),
    targetMatricula: text("target_matricula").notNull(),
    processType: text("process_type").notNull(),
    queueLabel: text("queue_label").notNull(),
    automaticPosition: integer("automatic_position"),
    suggestedPosition: integer("suggested_position").notNull(),
    searchRecommendation: text("search_recommendation").notNull(),
    importance: text("importance").notNull().default("media"),
    referenceLabel: text("reference_label"),
    createdBy: text("created_by").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("devi_progress_coaching_target_active_idx").on(
      table.targetMatricula,
      table.active,
      table.updatedAt,
    ),
    index("devi_progress_coaching_entry_active_idx").on(
      table.entryId,
      table.active,
    ),
    index("devi_progress_coaching_list_active_idx").on(
      table.listId,
      table.active,
    ),
  ],
);
export const workerSessions = sqliteTable(
  "worker_sessions",
  {
    token: text("token").primaryKey(),
    matricula: text("matricula").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("worker_sessions_expires_idx").on(table.expiresAt)],
);
export const unionGamePlayers = sqliteTable(
  "union_game_players",
  {
    matricula: text("matricula").primaryKey(),
    displayName: text("display_name").notNull(),
    currentStreak: integer("current_streak").notNull().default(0),
    bestStreak: integer("best_streak").notNull().default(0),
    answeredQuestions: integer("answered_questions").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("union_game_players_points_activity_idx").on(table.updatedAt)],
);
export const unionGameMastery = sqliteTable(
  "union_game_mastery",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matricula: text("matricula").notNull(),
    questionId: text("question_id").notNull(),
    mode: text("mode").notNull(),
    points: integer("points").notNull(),
    masteredAt: text("mastered_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("union_game_mastery_player_question_unique").on(
      table.matricula,
      table.questionId,
    ),
    index("union_game_mastery_ranking_idx").on(table.matricula, table.points),
  ],
);
export const unionGameChallenges = sqliteTable(
  "union_game_challenges",
  {
    token: text("token").primaryKey(),
    matricula: text("matricula").notNull(),
    questionId: text("question_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("union_game_challenges_player_active_idx").on(
      table.matricula,
      table.completedAt,
      table.expiresAt,
    ),
    index("union_game_challenges_expires_idx").on(table.expiresAt),
  ],
);
export const workerPasswords = sqliteTable(
  "worker_passwords",
  {
    matricula: text("matricula").primaryKey(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    iterations: integer("iterations").notNull().default(210000),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: text("locked_until"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("worker_passwords_updated_idx").on(table.updatedAt)],
);
export const workerIdentityAccess = sqliteTable(
  "worker_identity_access",
  {
    matricula: text("matricula").primaryKey(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: text("locked_until"),
    lastFailedAt: text("last_failed_at"),
    lastSuccessAt: text("last_success_at"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("worker_identity_access_locked_idx").on(table.lockedUntil),
  ],
);
export const privilegedLoginSecurity = sqliteTable(
  "privileged_login_security",
  {
    matricula: text("matricula").primaryKey(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: text("locked_until"),
    lastFailedAt: text("last_failed_at"),
    lastSuccessAt: text("last_success_at"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("privileged_login_security_locked_idx").on(table.lockedUntil),
  ],
);
export const workerAccessRegistrations = sqliteTable(
  "worker_access_registrations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workerId: integer("worker_id").notNull().unique(),
    applicationId: integer("application_id").notNull(),
    email: text("email").notNull(),
    curp: text("curp").notNull(),
    status: text("status").notNull().default("uploading"),
    submissionId: text("submission_id").notNull(),
    reviewNotes: text("review_notes"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    emailStatus: text("email_status").notNull().default("pending"),
    emailError: text("email_error"),
    emailSentAt: text("email_sent_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("worker_access_registrations_status_idx").on(
      table.status,
      table.updatedAt,
    ),
  ],
);
export const workerAccessRegistrationDocuments = sqliteTable(
  "worker_access_registration_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    registrationId: integer("registration_id").notNull(),
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    storageProvider: text("storage_provider").notNull().default("r2"),
    driveFileId: text("drive_file_id"),
    driveFolderId: text("drive_folder_id"),
    contentSha256: text("content_sha256"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("worker_access_registration_documents_kind_unique").on(
      table.registrationId,
      table.kind,
    ),
    index("worker_access_registration_documents_registration_idx").on(
      table.registrationId,
    ),
  ],
);
export const facilities = sqliteTable("facilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    detail: text("detail"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_logs_created_idx").on(table.createdAt),
    index("audit_logs_target_idx").on(table.targetType, table.targetId),
  ],
);
export const accessLogs = sqliteTable("access_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  credentialToken: text("credential_token").notNull(),
  facility: text("facility").notNull(),
  movement: text("movement").notNull(),
  readerEmail: text("reader_email"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const workerTaxIds = sqliteTable("worker_tax_ids", {
  matricula: text("matricula").primaryKey(),
  rfc: text("rfc"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    eventDate: text("event_date"),
    location: text("location"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("events_active_date_idx").on(table.active, table.eventDate)],
);

export const facebookNews = sqliteTable(
  "facebook_news",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    facebookPostId: text("facebook_post_id").notNull().unique(),
    pageId: text("page_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    message: text("message").notNull().default(""),
    category: text("category").notNull().default("INFORMACIÓN SINDICAL"),
    permalinkUrl: text("permalink_url").notNull(),
    imageUrl: text("image_url"),
    publishedAt: text("published_at").notNull(),
    sourceUpdatedAt: text("source_updated_at").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    notifyEligible: integer("notify_eligible", { mode: "boolean" })
      .notNull()
      .default(true),
    importedVia: text("imported_via").notNull().default("webhook"),
    discoveredAt: text("discovered_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("facebook_news_active_published_idx").on(
      table.active,
      table.publishedAt,
    ),
    index("facebook_news_notify_discovered_idx").on(
      table.notifyEligible,
      table.discoveredAt,
    ),
  ],
);

export const facebookNewsSync = sqliteTable("facebook_news_sync", {
  id: text("id").primaryKey(),
  lastAttemptAt: text("last_attempt_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  lastPostId: text("last_post_id"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const newsSettings = sqliteTable("news_settings", {
  id: text("id").primaryKey(),
  radioStreamUrl: text("radio_stream_url")
    .notNull()
    .default("http://78.129.252.13:26059/"),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const eventCategories = sqliteTable(
  "event_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id").notNull(),
    category: text("category").notNull(),
    normalizedCategory: text("normalized_category").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("event_categories_event_normalized_unique").on(
      table.eventId,
      table.normalizedCategory,
    ),
    index("event_categories_event_idx").on(table.eventId),
  ],
);

export const eventEntries = sqliteTable(
  "event_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id").notNull(),
    credentialToken: text("credential_token").notNull(),
    fullName: text("full_name").notNull(),
    matricula: text("matricula").notNull(),
    category: text("category").notNull(),
    curp: text("curp"),
    rfc: text("rfc"),
    nss: text("nss"),
    companion: integer("companion", { mode: "boolean" })
      .notNull()
      .default(false),
    companionGender: text("companion_gender"),
    raffleToken: text("raffle_token").notNull().unique(),
    readerActor: text("reader_actor"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("event_entries_event_credential_unique").on(
      table.eventId,
      table.credentialToken,
    ),
    index("event_entries_event_created_idx").on(table.eventId, table.createdAt),
  ],
);

export const scholarshipCampaigns = sqliteTable(
  "scholarship_campaigns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    year: integer("year").notNull(),
    season: text("season").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("scholarship_campaigns_identity_unique").on(
      table.name,
      table.year,
      table.season,
    ),
    index("scholarship_campaigns_active_year_idx").on(table.active, table.year),
  ],
);

export const scholarshipManualChildren = sqliteTable(
  "scholarship_manual_children",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matricula: text("matricula").notNull(),
    fullName: text("full_name").notNull(),
    curp: text("curp").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("scholarship_manual_children_worker_curp_unique").on(
      table.matricula,
      table.curp,
    ),
    index("scholarship_manual_children_worker_active_idx").on(
      table.matricula,
      table.active,
    ),
  ],
);

export const scholarshipEntries = sqliteTable(
  "scholarship_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: integer("campaign_id").notNull(),
    applicationId: integer("application_id").notNull(),
    credentialToken: text("credential_token").notNull(),
    folio: text("folio").notNull(),
    level: text("level").notNull(),
    levelSequence: integer("level_sequence").notNull(),
    amountCents: integer("amount_cents").notNull(),
    workerName: text("worker_name").notNull(),
    matricula: text("matricula").notNull(),
    adscription: text("adscription"),
    workerCurp: text("worker_curp"),
    rfc: text("rfc"),
    childBeneficiaryId: integer("child_beneficiary_id").notNull(),
    childName: text("child_name").notNull(),
    childCurp: text("child_curp").notNull(),
    gradeHundredths: integer("grade_hundredths").notNull(),
    readerActor: text("reader_actor"),
    deletedAt: text("deleted_at"),
    deletedBy: text("deleted_by"),
    deletionReason: text("deletion_reason"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("scholarship_entries_folio_active_unique")
      .on(table.folio)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("scholarship_entries_campaign_level_sequence_active_unique").on(
      table.campaignId,
      table.level,
      table.levelSequence,
    ).where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("scholarship_entries_campaign_worker_level_unique").on(
      table.campaignId,
      table.matricula,
      table.level,
    ).where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("scholarship_entries_campaign_child_curp_unique").on(
      table.campaignId,
      table.childCurp,
    ).where(sql`${table.deletedAt} IS NULL`),
    index("scholarship_entries_campaign_created_idx").on(
      table.campaignId,
      table.createdAt,
    ),
  ],
);
