UPDATE applications
SET document_status = CASE
  WHEN EXISTS (
    SELECT 1 FROM verification_documents d
    WHERE d.application_id = applications.id
      AND d.verification_status = 'rejected'
  ) THEN 'rejected'
  WHEN EXISTS (
    SELECT 1 FROM verification_documents d
    WHERE d.application_id = applications.id
      AND d.verification_status NOT IN ('auto_verified', 'verified')
  ) THEN 'manual_review'
  WHEN EXISTS (
    SELECT 1 FROM verification_documents d
    WHERE d.application_id = applications.id
  ) THEN 'verified'
  ELSE document_status
END;
