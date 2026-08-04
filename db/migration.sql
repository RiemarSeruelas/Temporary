-- Machine Monitoring configuration schema.
-- backend/server.js runs the same migration safely during startup.

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.face_people (
  id SERIAL PRIMARY KEY,
  person_name TEXT NOT NULL,
  employee_id TEXT,
  department TEXT,
  role TEXT DEFAULT 'operator',
  machine TEXT,
  machine_name TEXT,
  shift_code TEXT,
  face_api_id INTEGER,
  face_api_object_id TEXT,
  face_img_name TEXT,
  face_app_namespace TEXT,
  face_hash TEXT,
  embedding_hash TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app.machine_check_confirmations (
  id SERIAL PRIMARY KEY,
  person_id INTEGER,
  person_name TEXT NOT NULL,
  machine TEXT NOT NULL,
  confirmation_status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE app.face_people
  ADD COLUMN IF NOT EXISTS shift_code TEXT;

ALTER TABLE app.machine_check_confirmations
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
  ADD COLUMN IF NOT EXISTS face_api_id INTEGER,
  ADD COLUMN IF NOT EXISTS face_api_object_id TEXT,
  ADD COLUMN IF NOT EXISTS face_img_name TEXT,
  ADD COLUMN IF NOT EXISTS face_distance DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS face_threshold DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS face_confidence DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS face_app_namespace TEXT,
  ADD COLUMN IF NOT EXISTS face_hash TEXT,
  ADD COLUMN IF NOT EXISTS embedding_hash TEXT,
  ADD COLUMN IF NOT EXISTS registration_id BIGINT,
  ADD COLUMN IF NOT EXISTS machine_activity_reason TEXT;

CREATE TABLE IF NOT EXISTS app.machine_configurations (
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

ALTER TABLE app.machine_configurations
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS config_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

CREATE TABLE IF NOT EXISTS app.operator_shift_registrations (
  id BIGSERIAL PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES app.face_people(id),
  person_name TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  shift_code TEXT NOT NULL,
  shift_date DATE NOT NULL,
  verification_window_start TIMESTAMPTZ NOT NULL,
  verification_window_end TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (machine_id, shift_date, shift_code)
);

CREATE TABLE IF NOT EXISTS app.machine_data_receipts (
  machine_id TEXT NOT NULL,
  receipt_minute TIMESTAMPTZ NOT NULL,
  source_topic TEXT,
  machine_running BOOLEAN,
  message_count INTEGER NOT NULL DEFAULT 1,
  first_received_at TIMESTAMPTZ NOT NULL,
  last_received_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (machine_id, receipt_minute)
);

ALTER TABLE app.machine_data_receipts
  ADD COLUMN IF NOT EXISTS machine_running BOOLEAN;

CREATE TABLE IF NOT EXISTS app.machine_data_sources (
  machine_id TEXT PRIMARY KEY REFERENCES app.machine_configurations(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS app.machine_images (
  machine_id TEXT PRIMARY KEY REFERENCES app.machine_configurations(id) ON DELETE CASCADE,
  image_base64 TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  original_width INTEGER,
  original_height INTEGER,
  canvas_aspect_ratio NUMERIC(8,4) NOT NULL DEFAULT 2.1,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app.machine_segments (
  machine_id TEXT NOT NULL REFERENCES app.machine_configurations(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS app.machine_points (
  machine_id TEXT NOT NULL REFERENCES app.machine_configurations(id) ON DELETE CASCADE,
  point_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  area TEXT,
  segment_id TEXT,
  source_key_primary TEXT NOT NULL,
  source_key_secondary TEXT,
  status_mode TEXT NOT NULL DEFAULT 'door_interlock',
  safe_config JSONB NOT NULL DEFAULT '{"primary":"CLOSE","secondary":"LOCK"}'::jsonb,
  value_rules JSONB NOT NULL DEFAULT '{"primary":[{"value":"1","label":"Closed","severity":"safe","color":"#22c55e"},{"value":"0","label":"Open","severity":"warning","color":"#f59e0b"}],"secondary":[{"value":"1","label":"Locked","severity":"safe","color":"#22c55e"},{"value":"0","label":"Unlocked","severity":"danger","color":"#ef4444"}],"fallback":{"label":"Unknown","severity":"warning","color":"#f59e0b"}}'::jsonb,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (machine_id, point_id)
);

ALTER TABLE app.machine_points
  ADD COLUMN IF NOT EXISTS value_rules JSONB NOT NULL DEFAULT '{"primary":[{"value":"1","label":"Closed","severity":"safe","color":"#22c55e"},{"value":"0","label":"Open","severity":"warning","color":"#f59e0b"}],"secondary":[{"value":"1","label":"Locked","severity":"safe","color":"#22c55e"},{"value":"0","label":"Unlocked","severity":"danger","color":"#ef4444"}],"fallback":{"label":"Unknown","severity":"warning","color":"#f59e0b"}}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_machine_segments_order
  ON app.machine_segments (machine_id, display_order);

CREATE INDEX IF NOT EXISTS idx_machine_points_segment
  ON app.machine_points (machine_id, segment_id, display_order);

CREATE INDEX IF NOT EXISTS idx_machine_sources_topic
  ON app.machine_data_sources (source_topic)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_operator_registrations_date_shift
  ON app.operator_shift_registrations (shift_date, shift_code, machine_id);

CREATE INDEX IF NOT EXISTS idx_machine_receipts_window
  ON app.machine_data_receipts (machine_id, last_received_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_confirmations_registration_once
  ON app.machine_check_confirmations (registration_id)
  WHERE registration_id IS NOT NULL AND confirmation_status = 'confirmed';

INSERT INTO app.machine_configurations (
  id, name, description, api_url, mqtt_topic, template_id, is_active, created_by, updated_by
)
VALUES (
  'mespack', 'Mespack', 'Guard and interlock monitoring',
  '/api/machines/mespack/data', 'sensor/data', 'mespack', TRUE, 'migration', 'migration'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.machine_data_sources (
  machine_id, source_system, transport, source_topic,
  destination_type, destination_key, payload_root, metadata, is_active
)
VALUES (
  'mespack', 'HighByte', 'MQTT', 'sensor/data',
  'Dashboard API', '/api/machines/mespack/data', 'data',
  '{"schema_version":1,"configured_by":"migration"}'::jsonb, TRUE
)
ON CONFLICT (machine_id) DO NOTHING;

INSERT INTO app.machine_segments (
  machine_id, id, name, area, polygon_points, bounding_box,
  label_x, label_y, zoom_scale, display_order, is_active
)
VALUES
  ('mespack', 'zone-infeed', 'Infeed', 'Infeed Section',
   '[[15,62],[27,55],[33,64],[33,83],[20,90],[15,82]]'::jsonb,
   '{"x":15,"y":55,"width":18,"height":35}'::jsonb, 18, 73, 2.45, 0, TRUE),
  ('mespack', 'zone-wrapper', 'Wrapping', 'Wrapping Section',
   '[[35,56],[56,45],[60,50],[60,66],[38,79],[38,60]]'::jsonb,
   '{"x":35,"y":45,"width":25,"height":34}'::jsonb, 44, 63, 2.1, 1, TRUE),
  ('mespack', 'zone-main', 'Main Machine', 'Main Machine',
   '[[56,45],[74,34],[77,40],[77,57],[60,65],[60,50]]'::jsonb,
   '{"x":56,"y":34,"width":21,"height":31}'::jsonb, 70, 55, 2, 2, TRUE),
  ('mespack', 'zone-center', 'Center Guarding', 'Center Guarding',
   '[[74,34],[88.3,26],[93,30],[93,48],[77,57],[77,40]]'::jsonb,
   '{"x":74,"y":26,"width":19,"height":31}'::jsonb, 87, 49, 2.15, 3, TRUE)
ON CONFLICT (machine_id, id) DO NOTHING;

INSERT INTO app.machine_points (
  machine_id, point_id, name, area, segment_id,
  source_key_primary, source_key_secondary, display_order, is_active
)
SELECT
  'mespack',
  point_id,
  CASE
    WHEN point_id IN (1,2,13,14,15,16,17,18,19,20,34,35,36,37,38,39)
      THEN 'Unwinder Door ' || point_id
    WHEN point_id BETWEEN 3 AND 12 OR point_id = 21
      THEN 'Machine Door ' || point_id
    ELSE 'Door ' || point_id
  END,
  CASE
    WHEN point_id IN (1,2,13,14,15,16,17,18,19,20,34,35,36,37,38,39)
      THEN 'Unwinder Section'
    WHEN point_id BETWEEN 3 AND 12 OR point_id = 21
      THEN 'Main Machine'
    ELSE 'Machine Guarding'
  END,
  CASE
    WHEN point_id IN (1,2,3,34,35,36,37,38,39) THEN 'zone-infeed'
    WHEN point_id IN (4,5,6,7,8,9,28,29,30,31,32,33) THEN 'zone-wrapper'
    WHEN point_id IN (10,11,12,13,24,25,26,27) THEN 'zone-main'
    ELSE 'zone-center'
  END,
  'SFI_Door' || point_id,
  'I_Door' || point_id || 'Diagnostic',
  point_id,
  TRUE
FROM generate_series(1, 39) AS point_id
ON CONFLICT (machine_id, point_id) DO NOTHING;

-- The Base64 Mespack image is seeded by backend/server.js from
-- backend/assets/mespack-machine.png on the first startup. Future images are
-- uploaded and versioned through the Admin machine configurator.
