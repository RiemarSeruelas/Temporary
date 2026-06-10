# Machine Dashboard + Face Recognition Integration

This ZIP is structured like your project screenshot:

```text
vite.config.js
package.json
src/
  App.jsx
  App.css
  index.css
  main.jsx
  assets/
public/
  models/
backend/
  server.js
  package.json
  .env.example
  setup_face_postgres.sql
```

## What was added

- Confirm bar under the topbar.
- Confirm popup with Register, Log In, and Admin.
- Register captures face, sends it to the Face API, and saves person details to PostgreSQL.
- Log In opens camera, scans face, shows recognized person + machine, then Confirm Login writes to PostgreSQL.
- Admin asks for password and loads the PostgreSQL attendance table.
- Backend still keeps your MQTT `/api/data` endpoint for the machine dashboard.

## Important files

- Frontend: `src/App.jsx`, `src/App.css`
- Backend: `backend/server.js`
- PostgreSQL setup: `backend/setup_face_postgres.sql`
- Backend config template: `backend/.env.example`

## Setup

1. In pgAdmin, run:

```sql
-- backend/setup_face_postgres.sql
```

2. Copy:

```text
backend/.env.example -> backend/.env
```

3. Edit `backend/.env` with your real MQTT, Face API, and PostgreSQL details.

4. Install root/frontend packages:

```powershell
npm install
```

5. Install backend packages:

```powershell
cd backend
npm install
cd ..
```

6. Run both frontend and backend:

```powershell
npm start
```

Frontend will run on Vite, and backend runs on port 5000. Your `vite.config.js` already proxies `/api` to `http://127.0.0.1:5000`.

## Assets note

I included placeholder `src/assets/machine.png` and `src/assets/zone.png` so the project can compile if extracted fresh. Replace them with your real files from your existing project. Also copy your real `public/models/mespack.glb` into `public/models/` for 3D mode.
