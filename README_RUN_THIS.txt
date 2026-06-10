MACHINE CHECK CONFIRMATION - CLEAN POSTGRES MAPPING FIX

Flow:
1. Register Face:
   - Dashboard sends image to Face API /register.
   - Dashboard verifies the Face API match with /search.
   - Dashboard saves operator details in PostgreSQL app.face_people.

2. Confirm Check:
   - Operator only scans face and chooses machine.
   - Face API returns recognized id/img_name.
   - Backend checks PostgreSQL app.face_people for that face_api_id/img_name.
   - If active, backend saves confirmation to app.machine_check_confirmations.

This means the Face API remains the recognition engine, and PostgreSQL owns your app-specific people/details/history.

Setup:
1. Run backend/setup_face_postgres.sql in pgAdmin.
2. Copy backend/.env.example to backend/.env and set PostgreSQL + FACE_API_BASE_URL.
3. npm install
4. cd backend && npm install && cd ..
5. npm start

Important env:
FACE_API_BASE_URL=http://10.156.119.146:5005
POSTGRES_PEOPLE_TABLE=face_people
POSTGRES_CONFIRMATIONS_TABLE=machine_check_confirmations
APP_NAMESPACE=machine_dashboard
APP_NAMESPACE_STRICT=false

Admin:
- Load Confirmations shows both registered faces and confirmation logs.
- Unregister/Deactivate sets is_active=false in PostgreSQL so the face can no longer confirm in this dashboard.
