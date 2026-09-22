INSERT INTO privileged_accounts
  (matricula,pin_hash,can_admin,can_reader,active,must_change_pin)
VALUES
  ('99222979','5f0fbfc126a9876e177921aeb69a9705447e5b4f29fc96631ab4ac6d31c62717',1,1,1,1)
ON CONFLICT(matricula) DO UPDATE SET
  can_admin=1,
  can_reader=1,
  active=1;
--> statement-breakpoint
INSERT INTO role_assignments
  (matricula,designation,credential_style,can_admin,can_review,can_scan,can_train_devi,facilities_json,active,updated_at)
VALUES
  ('99222979','Administrador Total','representative',1,1,1,1,'["*"]',1,CURRENT_TIMESTAMP)
ON CONFLICT(matricula) DO UPDATE SET
  designation='Administrador Total',
  credential_style='representative',
  can_admin=1,
  can_review=1,
  can_scan=1,
  can_train_devi=1,
  facilities_json='["*"]',
  active=1,
  updated_at=CURRENT_TIMESTAMP;
