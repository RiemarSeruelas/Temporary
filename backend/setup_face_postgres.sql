CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.machine_check_confirmations (
    id SERIAL PRIMARY KEY,
    person_name TEXT NOT NULL,
    department TEXT,
    machine TEXT NOT NULL,
    machine_name TEXT,
    face_api_id INTEGER,
    face_api_object_id TEXT,
    face_img_name TEXT,
    face_distance DOUBLE PRECISION,
    face_threshold DOUBLE PRECISION,
    face_confidence DOUBLE PRECISION,
    face_app_namespace TEXT,
    face_is_active BOOLEAN,
    face_hash TEXT,
    embedding_hash TEXT,
    confirmation_status TEXT DEFAULT 'confirmed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
