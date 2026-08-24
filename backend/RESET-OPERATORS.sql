-- Run this in the Query Tool connected to the correct DATABASE.
-- PostgreSQL uses schema.table, not database.schema.table.

-- If a previous query failed and pgAdmin says the current transaction is aborted:
ROLLBACK;

-- Optional safety check. This should be the database that contains machine_monitoring.
SELECT current_database();

-- Complete operator + confirmation reset.
-- Confirmation history is removed first because it may reference registrations.
BEGIN;

DELETE FROM machine_monitoring.machine_check_confirmations;
DELETE FROM machine_monitoring.operator_shift_registrations;

COMMIT;

-- Reset ID sequences if the tables use SERIAL/BIGSERIAL.
SELECT setval(
  pg_get_serial_sequence('machine_monitoring.machine_check_confirmations', 'id'),
  1,
  false
)
WHERE pg_get_serial_sequence('machine_monitoring.machine_check_confirmations', 'id') IS NOT NULL;

SELECT setval(
  pg_get_serial_sequence('machine_monitoring.operator_shift_registrations', 'id'),
  1,
  false
)
WHERE pg_get_serial_sequence('machine_monitoring.operator_shift_registrations', 'id') IS NOT NULL;

-- Verify.
SELECT COUNT(*) AS confirmations FROM machine_monitoring.machine_check_confirmations;
SELECT COUNT(*) AS registrations FROM machine_monitoring.operator_shift_registrations;
