-- Optional manual migration. The updated server.js also runs these safely on startup.
ALTER TABLE app.face_people
  ADD COLUMN IF NOT EXISTS shift_code TEXT;

ALTER TABLE app.machine_check_confirmations
  ADD COLUMN IF NOT EXISTS shift_code TEXT,
  ADD COLUMN IF NOT EXISTS shift_date DATE,
  ADD COLUMN IF NOT EXISTS verification_window_start TIMESTAMP,
  ADD COLUMN IF NOT EXISTS verification_window_end TIMESTAMP,
  ADD COLUMN IF NOT EXISTS machine_required BOOLEAN DEFAULT TRUE;
