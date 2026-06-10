
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.face_people (
    id SERIAL PRIMARY KEY,
    person_name TEXT NOT NULL,
    department TEXT NOT NULL,
    machine TEXT NOT NULL,
    face_api_id INTEGER NOT NULL,
    face_img_name TEXT,
    app_namespace TEXT NOT NULL DEFAULT 'riems_operator_attendance',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (app_namespace, machine, face_api_id)
);

CREATE TABLE IF NOT EXISTS app.face_attendance_logs (
    id SERIAL PRIMARY KEY,
    person_id INTEGER,
    person_name TEXT NOT NULL,
    department TEXT,
    machine TEXT,
    face_api_id INTEGER,
    face_img_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT * FROM app.face_attendance_logs ORDER BY created_at DESC;
