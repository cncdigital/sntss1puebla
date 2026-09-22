INSERT INTO privileged_accounts
  (matricula,pin_hash,can_admin,can_reader,active,must_change_pin)
VALUES
  ('9999','ebd1200a5ae6877d4d7dae786e3ad94e3d35ee292ee67805f5523228ef349d07',1,1,1,1)
ON CONFLICT(matricula) DO UPDATE SET
  pin_hash=excluded.pin_hash,
  can_admin=1,
  can_reader=1,
  active=1,
  must_change_pin=1;
--> statement-breakpoint
INSERT INTO role_assignments
  (matricula,designation,credential_style,can_admin,can_review,can_scan,facilities_json,active,updated_at)
VALUES
  ('9999','Administrador Total','representative',1,1,1,'["*"]',1,CURRENT_TIMESTAMP)
ON CONFLICT(matricula) DO UPDATE SET
  designation='Administrador Total',
  credential_style='representative',
  can_admin=1,
  can_review=1,
  can_scan=1,
  facilities_json='["*"]',
  active=1,
  updated_at=CURRENT_TIMESTAMP;
