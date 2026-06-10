CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.face_people (
    id SERIAL PRIMARY KEY,
    person_name TEXT NOT NULL,
    employee_id TEXT,
    department TEXT,
    role TEXT DEFAULT 'operator',
    machine TEXT,
    machine_name TEXT,
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
    employee_id TEXT,
    department TEXT,
    role TEXT,
    machine TEXT NOT NULL,
    machine_name TEXT,
    face_api_id INTEGER,
    face_api_object_id TEXT,
    face_img_name TEXT,
    face_distance DOUBLE PRECISION,
    face_threshold DOUBLE PRECISION,
    face_confidence DOUBLE PRECISION,
    face_app_namespace TEXT,
    face_hash TEXT,
    embedding_hash TEXT,
    confirmation_status TEXT DEFAULT 'confirmed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
