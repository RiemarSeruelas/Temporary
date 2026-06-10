FULL FIX NOTES
==============

This ZIP fixes the issues hit during setup:

1. Root package.json JSON parse error fixed.
2. backend/package.json is CommonJS, so server.js can use require().
3. vite.config.js is simple and proxies /api to http://127.0.0.1:5000.
4. Backend dotenv is forced to read backend/.env.
5. Old Face API fallback 172.27.1.92 removed; default is http://10.156.119.146:5005.
6. Face API payload always sends img.
7. Face match chooses the valid result with the lowest distance.
8. Existing PostgreSQL tables are migrated safely with ALTER TABLE ADD COLUMN IF NOT EXISTS.
9. Register no longer depends on ON CONFLICT constraints, so old face_people tables still work.

SETUP
=====

1. Extract this ZIP into a clean folder.
2. Copy your real assets if needed:
   - src/assets/machine.png
   - src/assets/zone.png
   - public/models/mespack.glb

3. Create backend/.env from backend/.env.example.
   Make sure it contains:

   FACE_API_BASE_URL=http://10.156.119.146:5005

4. Install and run:

   cd C:\Users\ASUS\Downloads\Temporary2
   npm install
   cd backend
   npm install
   cd ..
   npm start

5. Expected logs:

   Backend:  http://localhost:5000
   Frontend: http://localhost:5178
   Face API base URL: http://10.156.119.146:5005

QUICK TESTS
===========

Open these in browser:

http://localhost:5000/api/face/health
http://localhost:5000/api/data
http://localhost:5178

If browser shows 502 on localhost:5178/api, backend is not running on port 5000.
