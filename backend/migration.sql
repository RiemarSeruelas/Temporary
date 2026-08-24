-- Machine Monitoring configuration schema.
-- backend/server.js runs the same migration safely during startup.

CREATE SCHEMA IF NOT EXISTS machine_monitoring;

CREATE TABLE IF NOT EXISTS machine_monitoring.machine_check_confirmations (
  id SERIAL PRIMARY KEY,
  person_id INTEGER,
  person_name TEXT NOT NULL,
  employee_id TEXT,
  department TEXT,
  role TEXT,
  machine TEXT NOT NULL,
  machine_name TEXT,
  shift_code TEXT,
  shift_date DATE,
  verification_window_start TIMESTAMP,
  verification_window_end TIMESTAMP,
  machine_required BOOLEAN DEFAULT TRUE,
  confirmation_status TEXT DEFAULT 'confirmed',
  registration_id BIGINT,
  machine_activity_reason TEXT,
  verification_method TEXT NOT NULL DEFAULT 'registration_pin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE machine_monitoring.machine_check_confirmations
  ADD COLUMN IF NOT EXISTS person_id INTEGER,
  ADD COLUMN IF NOT EXISTS employee_id TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS machine_name TEXT,
  ADD COLUMN IF NOT EXISTS shift_code TEXT,
  ADD COLUMN IF NOT EXISTS shift_date DATE,
  ADD COLUMN IF NOT EXISTS verification_window_start TIMESTAMP,
  ADD COLUMN IF NOT EXISTS verification_window_end TIMESTAMP,
  ADD COLUMN IF NOT EXISTS machine_required BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS confirmation_status TEXT DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS registration_id BIGINT,
  ADD COLUMN IF NOT EXISTS machine_activity_reason TEXT,
  ADD COLUMN IF NOT EXISTS verification_method TEXT NOT NULL DEFAULT 'registration_pin';

ALTER TABLE machine_monitoring.machine_check_confirmations
  ALTER COLUMN verification_method SET DEFAULT 'registration_pin';

CREATE TABLE IF NOT EXISTS machine_monitoring.machine_configurations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  api_url TEXT NOT NULL DEFAULT '/api/data',
  mqtt_topic TEXT,
  template_id TEXT NOT NULL DEFAULT 'mespack',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config_revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE machine_monitoring.machine_configurations
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS config_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

CREATE TABLE IF NOT EXISTS machine_monitoring.operator_shift_registrations (
  id BIGSERIAL PRIMARY KEY,
  person_id INTEGER,
  person_name TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  shift_code TEXT NOT NULL,
  shift_date DATE NOT NULL,
  verification_window_start TIMESTAMPTZ NOT NULL,
  verification_window_end TIMESTAMPTZ NOT NULL,
  pin_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (machine_id, shift_date, shift_code)
);

-- Upgrade old face-based registrations safely.
ALTER TABLE machine_monitoring.operator_shift_registrations
  DROP CONSTRAINT IF EXISTS operator_shift_registrations_person_id_fkey;

ALTER TABLE machine_monitoring.operator_shift_registrations
  ALTER COLUMN person_id DROP NOT NULL;

ALTER TABLE machine_monitoring.operator_shift_registrations
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

CREATE TABLE IF NOT EXISTS machine_monitoring.machine_data_receipts (
  machine_id TEXT NOT NULL,
  receipt_minute TIMESTAMPTZ NOT NULL,
  source_topic TEXT,
  machine_running BOOLEAN,
  message_count INTEGER NOT NULL DEFAULT 1,
  first_received_at TIMESTAMPTZ NOT NULL,
  last_received_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (machine_id, receipt_minute)
);

ALTER TABLE machine_monitoring.machine_data_receipts
  ADD COLUMN IF NOT EXISTS machine_running BOOLEAN;

-- One row is inserted only when a browser session ends.
-- No individual clicks/actions are stored.
CREATE TABLE IF NOT EXISTS machine_monitoring.mespack_session_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  access_role TEXT NOT NULL DEFAULT 'temporary',
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machine_monitoring.machine_data_sources (
  machine_id TEXT PRIMARY KEY REFERENCES machine_monitoring.machine_configurations(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL DEFAULT 'HighByte',
  transport TEXT NOT NULL DEFAULT 'MQTT',
  source_endpoint TEXT,
  source_topic TEXT,
  source_path TEXT,
  destination_type TEXT NOT NULL DEFAULT 'Dashboard API',
  destination_key TEXT NOT NULL,
  payload_root TEXT DEFAULT 'data',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machine_monitoring.machine_images (
  machine_id TEXT PRIMARY KEY REFERENCES machine_monitoring.machine_configurations(id) ON DELETE CASCADE,
  image_base64 TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  original_width INTEGER,
  original_height INTEGER,
  canvas_aspect_ratio NUMERIC(8,4) NOT NULL DEFAULT 2.1,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE IF NOT EXISTS machine_monitoring.machine_segments (
  machine_id TEXT NOT NULL REFERENCES machine_monitoring.machine_configurations(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  area TEXT,
  polygon_points JSONB NOT NULL,
  bounding_box JSONB NOT NULL,
  label_x NUMERIC(7,3) NOT NULL DEFAULT 50,
  label_y NUMERIC(7,3) NOT NULL DEFAULT 50,
  zoom_scale NUMERIC(7,3) NOT NULL DEFAULT 2,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (machine_id, id)
);

CREATE TABLE IF NOT EXISTS machine_monitoring.machine_points (
  machine_id TEXT NOT NULL REFERENCES machine_monitoring.machine_configurations(id) ON DELETE CASCADE,
  point_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  area TEXT,
  segment_id TEXT,
  source_key_primary TEXT NOT NULL,
  source_key_secondary TEXT,
  source_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  status_mode TEXT NOT NULL DEFAULT 'mapped_values',
  safe_config JSONB NOT NULL DEFAULT '{"primary":"CLOSE","secondary":"LOCK"}'::jsonb,
  value_rules JSONB NOT NULL DEFAULT '{"primary":[{"value":"1","label":"Closed","severity":"safe","color":"#22c55e"},{"value":"0","label":"Open","severity":"warning","color":"#f59e0b"}],"secondary":[{"value":"1","label":"Locked","severity":"safe","color":"#22c55e"},{"value":"0","label":"Unlocked","severity":"danger","color":"#ef4444"}],"fallback":{"label":"Unknown","severity":"warning","color":"#f59e0b"}}'::jsonb,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (machine_id, point_id)
);

ALTER TABLE machine_monitoring.machine_points
  ADD COLUMN IF NOT EXISTS source_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS value_rules JSONB NOT NULL DEFAULT '{"primary":[{"value":"1","label":"Closed","severity":"safe","color":"#22c55e"},{"value":"0","label":"Open","severity":"warning","color":"#f59e0b"}],"secondary":[{"value":"1","label":"Locked","severity":"safe","color":"#22c55e"},{"value":"0","label":"Unlocked","severity":"danger","color":"#ef4444"}],"fallback":{"label":"Unknown","severity":"warning","color":"#f59e0b"}}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_machine_segments_order
  ON machine_monitoring.machine_segments (machine_id, display_order);

CREATE INDEX IF NOT EXISTS idx_machine_points_segment
  ON machine_monitoring.machine_points (machine_id, segment_id, display_order);

CREATE INDEX IF NOT EXISTS idx_machine_sources_topic
  ON machine_monitoring.machine_data_sources (source_topic)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_operator_registrations_date_shift
  ON machine_monitoring.operator_shift_registrations (shift_date, shift_code, machine_id);

CREATE INDEX IF NOT EXISTS idx_machine_receipts_window
  ON machine_monitoring.machine_data_receipts (machine_id, last_received_at);

CREATE INDEX IF NOT EXISTS idx_mespack_session_logs_ended
  ON machine_monitoring.mespack_session_logs (ended_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_confirmations_registration_once
  ON machine_monitoring.machine_check_confirmations (registration_id)
  WHERE registration_id IS NOT NULL AND confirmation_status = 'confirmed';


-- No sample machine, segment, point, or image is inserted here.
-- The dashboard now displays No Data until real configuration is saved through Admin.


-- Flexible field mapping + operator PIN confirmation
-- source_fields stores any number of MQTT fields per point. The existing
-- primary/secondary columns remain for backward compatibility.

-- Facial recognition and date-generated PINs are no longer used by the application.
-- Existing legacy face_people / face_* columns may remain in an upgraded database, but the runtime does not read or write them.
