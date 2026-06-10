FULL FIX: Machine Check Confirmation + Face API app_namespace

WHAT CHANGED
- Removed the face_people / login mapping dependency.
- Face API is used only for recognition.
- Dashboard inputs operator name, department, and machine.
- If Face API recognizes the face and app_namespace is accepted, the backend saves a machine check confirmation to PostgreSQL.
- Register Face sends app_namespace=machine_dashboard and is_active=true to Face API.
- Admin can view PostgreSQL confirmation logs.
- Admin unregister/deactivate is available only if your Face API has a delete/deactivate endpoint configured in FACE_UNREGISTER_PATH.

IMPORTANT FACE API REQUIREMENT
The Face API /register must save these fields to Mongo:
  app_namespace: machine_dashboard
  is_active: true

The Face API /search must return these fields in each candidate:
  app_namespace
  is_active

If /search does not return app_namespace yet, set this in backend/.env temporarily:
  APP_NAMESPACE_STRICT=false

Once Face API returns app_namespace, set it back to:
  APP_NAMESPACE_STRICT=true

RUNNING
1. Extract this ZIP into a clean folder.
2. Copy your real assets into:
   src/assets/machine.png
   src/assets/zone.png
   public/models/mespack.glb
3. Copy backend/.env.example to backend/.env.
4. Edit backend/.env:
   FACE_API_BASE_URL=http://10.156.119.146:5005
   APP_NAMESPACE=machine_dashboard
   POSTGRES_HOST=your_postgres_ip
   POSTGRES_DB=mydatabase
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=your_password
5. Optional: run backend/setup_face_postgres.sql in pgAdmin.
   The backend also auto-creates/migrates the confirmation table when it starts.
6. Run:
   npm install
   cd backend
   npm install
   cd ..
   npm start

OPEN
Frontend: http://localhost:5178
Backend health: http://localhost:5000/api/face/health

EXPECTED FLOW
Confirm Check:
  App captures face -> Face API /search -> app_namespace check -> PostgreSQL machine_check_confirmations insert

Register Face:
  App captures face -> Face API /register with app_namespace=machine_dashboard and is_active=true
