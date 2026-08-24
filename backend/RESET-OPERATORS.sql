-- Reset operator registrations and confirmation history.
-- Run this against the database containing the machine_monitoring schema.
-- Confirmation rows are deleted FIRST so older installations with a
-- registration foreign key do not block deletion of the registrations.

BEGIN;

DELETE FROM machine_monitoring.machine_check_confirmations;
DELETE FROM machine_monitoring.operator_shift_registrations;

-- Reset generated IDs when the standard SERIAL/BIGSERIAL sequences exist.
DO $$
DECLARE
  seq_name text;
BEGIN
  seq_name := pg_get_serial_sequence('machine_monitoring.machine_check_confirmations', 'id');
  IF seq_name IS NOT NULL THEN
    EXECUTE format('ALTER SEQUENCE %s RESTART WITH 1', seq_name);
  END IF;

  seq_name := pg_get_serial_sequence('machine_monitoring.operator_shift_registrations', 'id');
  IF seq_name IS NOT NULL THEN
    EXECUTE format('ALTER SEQUENCE %s RESTART WITH 1', seq_name);
  END IF;
END $$;

COMMIT;

-- Verify:
SELECT COUNT(*) AS confirmations
FROM machine_monitoring.machine_check_confirmations;

SELECT COUNT(*) AS registrations
FROM machine_monitoring.operator_shift_registrations;
