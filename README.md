# Machine Monitoring Dashboard

The Machine Monitoring Dashboard provides an internal plant system for monitoring machine guarding, mapped machine signals, operator registration, and machine confirmation activity.

The application receives live machine data through MQTT / HighByte, maps incoming fields to configured machine points, displays the current machine condition, and allows authorized administrators to configure machine images, machine segments, and Data Mapping without changing source code.

Machine configuration, operator records, confirmations, and session logs are stored in PostgreSQL. The system is deployed using Docker and Nginx and is intended for use on the approved internal plant network.

## Who Should Use This System

- Production operators responsible for assigned machines
- Authorized administrators configuring machines and Data Mapping
- Engineering or digital personnel maintaining MQTT / HighByte integration
- System owners responsible for Docker, PostgreSQL, backups, and deployment

## Main Features

- Live machine monitoring
- MQTT / HighByte data integration
- Configurable machine image
- Clickable machine segments
- Configurable machine monitoring points
- Flexible Data Mapping
- One or more incoming fields per monitoring point
- Configurable raw-value meanings
- Configurable display labels, condition, and color
- Automatic **No Data** display when real values are unavailable
- Operator registration by shift
- Face registration and face recognition
- Machine confirmation workflow
- Confirmation monitoring and history
- PostgreSQL machine configuration storage
- PostgreSQL operator and confirmation records
- Per-session application usage logging
- Admin-protected configuration
- Docker and Nginx deployment
- Responsive desktop and tablet interface

## System Areas

| Area | Purpose |
| --- | --- |
| **Machine Monitoring** | View the configured machine, machine segments, and current live status. |
| **Machine Set Up** | Configure the machine connection, machine image, segments, and Data Mapping. |
| **Data Mapping** | Assign incoming MQTT / HighByte fields to machine points and define what each received value means. |
| **Operator** | Register the operator assigned to a machine and shift. |
| **Machine Confirmation** | Confirm that the assigned operator has checked the machine during the required confirmation window. |
| **Operator Admin** | Review operator registration and confirmation records. |
| **Session Logs** | Store one application usage record when a browser session ends. |

## Machine Set Up

Machine Set Up contains three configuration steps.

### Step 1 - Machine Connection

Configure the machine and its data source.

Typical configuration includes:

- Machine name
- MQTT topic
- Source system
- Transport
- Source endpoint
- Payload root
- Source path
- Active / inactive state

The system uses the configured topic to route incoming MQTT data to the correct machine.

### Step 2 - Machine Image and Segments

Upload the machine image and define the areas or segments that users can select from the monitoring page.

An Admin can:

- Upload or replace the machine image
- Add machine segments
- Draw the polygon area for each segment
- Assign monitoring points to a segment
- Rename segments
- Reposition segment labels
- Save the machine layout

The machine image is stored in PostgreSQL together with its image metadata.

### Step 3 - Data Mapping

Data Mapping connects incoming MQTT / HighByte values to monitoring points.

Each monitoring point can contain one or more fields.

For example:

```text
Machine Door 5
└── Field 1
    └── SFI_Door5
```

If another machine point requires additional signals, use **Add Field**:

```text
Machine Point
├── Field 1
├── Field 2
└── Field 3
```

Each field can define the meaning of its received values.

Example:

```text
Raw Value: 1
Display Label: Closed
Condition: Good

Raw Value: 0
Display Label: Open
Condition: Warning
```

The actual meaning is configurable by the Admin and is not hard-coded to every machine.

An unmatched value can also be configured so unexpected or unavailable values do not display misleading information.

When real data is missing, the dashboard displays **No Data** rather than placeholder values.

## How to Use the System

### 1. Open the Dashboard

Open the Machine Monitoring Dashboard from the approved internal network.

For the Docker host:

```text
http://localhost:5059
```

From another permitted computer:

```text
http://SERVER_IP:5059
```

Replace `SERVER_IP` with the IP address of the computer running Docker.

### 2. View a Machine

Select the configured machine.

The monitoring screen displays:

- Machine image
- Configured machine segments
- Mapped monitoring points
- Current live values
- Current mapped condition

Select a machine segment to view its configured monitoring points in more detail.

### 3. Open Admin

Open the Admin area and enter the authorized Admin password.

Admin access provides Machine Set Up and operator administration features.

### 4. Configure a Machine

Open **Machine Set Up**.

Complete:

1. Machine Connection
2. Machine Image and Segments
3. Data Mapping

Select **Save Configuration** after making changes.

Machine configuration is stored in PostgreSQL and should remain available after page refreshes, Docker restarts, and application rebuilds.

### 5. Register an Operator

Open the Operator section during the applicable registration window.

The operator registration process includes:

- Operator name
- Machine
- Shift
- Face registration

When camera access is supported, the system can use the device camera.

When camera access is unavailable, the interface can use image upload where supported by the current frontend workflow.

### 6. Confirm a Machine Check

During the required confirmation window, the assigned operator can complete machine confirmation.

The system:

1. Detects the registered face.
2. Confirms that the person is registered to the selected machine and current shift.
3. Checks whether machine confirmation is required.
4. Stores the completed confirmation in PostgreSQL.

### 7. Review Operator Records

Authorized Admin users can review operator registration and machine confirmation information from the Operator Admin area.

The available records can be used for monitoring and reporting.

### 8. Sign Out / End the Session

The system records application usage on a session basis.

Individual clicks and normal user actions are not stored as separate usage-log rows.

When the browser session ends normally, one row is written to:

```text
machine_monitoring.mespack_session_logs
```

The session record includes information such as:

- Session ID
- Access role
- Session start time
- Session end time
- Session duration

Browser session-end logging is best effort. A sudden power loss, operating-system crash, or forced browser termination may prevent the final session event from being sent.

## Operator Shift Windows

The application currently uses three operator registration / verification windows.

| Shift | Registration / Verification Window | Full Shift |
| --- | --- | --- |
| **Morning** | 6:00 AM - 10:00 AM | 6:00 AM - 2:00 PM |
| **Afternoon** | 2:00 PM - 6:00 PM | 2:00 PM - 10:00 PM |
| **Night** | 10:00 PM - 2:00 AM | 10:00 PM - 6:00 AM |

The application uses Manila plant time.

## Important Rules

- PostgreSQL is the source of truth for machine configuration.
- Do not rely on placeholder or default machine data.
- Missing machine values should display **No Data**.
- Machine configuration should be changed through Admin.
- Keep the MQTT field names consistent with the values published by HighByte.
- Do not manually modify machine IDs across related PostgreSQL tables.
- The same `machine_id` must be used by the machine configuration, source, image, segments, and points.
- Keep `.env` private.
- Do not commit production credentials to Git.
- Do not expose the application or PostgreSQL database to untrusted networks.
- Admin access should be limited to authorized personnel.

## Data Storage

### PostgreSQL

The application uses the PostgreSQL schema:

```text
machine_monitoring
```

Main tables include:

```text
machine_monitoring
├── face_people
├── machine_check_confirmations
├── operator_shift_registrations
├── machine_configurations
├── machine_data_receipts
├── machine_data_sources
├── machine_images
├── machine_segments
├── machine_points
└── mespack_session_logs
```

### Machine Configuration

`machine_configurations` stores the main machine record.

`machine_data_sources` stores MQTT / HighByte source information.

`machine_images` stores the configured machine image and image metadata.

`machine_segments` stores the polygon areas and display information for the machine image.

`machine_points` stores monitoring points and their Data Mapping configuration.

Flexible incoming fields are stored in:

```text
source_fields
```

The original primary and secondary source-key columns are retained for backward compatibility.

### Operator and Confirmation Data

`face_people` stores the application mapping for registered operators.

`operator_shift_registrations` stores the operator assigned to a machine and shift.

`machine_check_confirmations` stores completed machine confirmations.

`machine_data_receipts` stores machine data-receipt activity used by the confirmation workflow.

### Session Logs

`mespack_session_logs` stores one row for completed application sessions.

It is intentionally session-based rather than click-based.

## Project Structure

Recommended project structure:

```text
Temporary2/
├── backend/
│   ├── migration.sql
│   ├── package.json
│   └── server.js
│
├── src/
│   ├── App.css
│   ├── App.jsx
│   ├── index.css
│   ├── main.jsx
│   ├── OperatorExperience.jsx
│   ├── operatorWorkflow.js
│   └── Studio.css
│
├── .dockerignore
├── .env
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── index.html
├── nginx.conf
├── package.json
├── README.md
└── vite.config.js
```

Keep only one canonical `migration.sql`. The recommended location is:

```text
backend/migration.sql
```

## Running the System with Docker

This section is for the person responsible for hosting the Machine Monitoring Dashboard.

### Requirements

- Docker Desktop or Docker Engine
- Access to the configured PostgreSQL server
- Access to the MQTT broker / HighByte output
- Access to the Face Recognition API if operator face functions are enabled
- Complete project folder
- Configured `.env`
- Access to the approved plant network

The PostgreSQL database must already exist.

The application can create the configured schema and required tables when the PostgreSQL user has sufficient permissions.

### Configure `.env`

Create `.env` in the main project folder.

Example:

```env
APP_PORT=5059

POSTGRES_ENABLED=true
POSTGRES_HOST=your_database_host
POSTGRES_PORT=5432
POSTGRES_DB=your_database_name
POSTGRES_USER=your_database_user
POSTGRES_PASSWORD=your_database_password
POSTGRES_SCHEMA=machine_monitoring
POSTGRES_SESSION_LOGS_TABLE=mespack_session_logs

ADMIN_PASSWORD=your_admin_password

MQTT_BROKER=mqtt://your_mqtt_broker:1883
MQTT_USERNAME=your_mqtt_username
MQTT_PASSWORD=your_mqtt_password
MQTT_TOPIC=sensor/data

FACE_API_BASE_URL=http://your_face_api_host:5005
APP_NAMESPACE=machine_dashboard
APP_NAMESPACE_STRICT=false
FACE_UNREGISTER_PATH=

LOG_LEVEL=minimal
MACHINE_DATA_STALE_SECONDS=300
```

Do not put actual production passwords in `README.md`, `.env.example`, Git commits, screenshots, or public ZIP files.

### External PostgreSQL

The current Docker deployment uses the existing PostgreSQL server.

A PostgreSQL container is not required in `docker-compose.yml`.

The backend reads the PostgreSQL connection from `.env`.

### Start the Application

Open PowerShell or Command Prompt in the main project folder:

```powershell
docker compose up -d --build
```

### Check the Containers

```powershell
docker compose ps
```

The expected services are:

```text
backend
nginx
```

The backend should become healthy before Nginx starts serving the application.

### Open the System

On the Docker host:

```text
http://localhost:5059
```

From another permitted computer:

```text
http://SERVER_IP:5059
```

The Windows firewall and plant network must allow access to port `5059`.

### Check Network Access to PostgreSQL

From the Docker host:

```powershell
Test-NetConnection YOUR_POSTGRES_IP -Port 5432
```

Expected:

```text
TcpTestSucceeded : True
```

### Check Application Health

On the host:

```powershell
curl.exe http://localhost:5059/health
```

### Check Container Logs

All services:

```powershell
docker compose logs --tail=100
```

Backend:

```powershell
docker compose logs --tail=200 backend
```

Nginx:

```powershell
docker compose logs --tail=200 nginx
```

Follow new backend messages:

```powershell
docker compose logs -f backend
```

### Restart the Application

```powershell
docker compose restart
```

### Rebuild After Receiving Updated Files

```powershell
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Stop the Application

```powershell
docker compose down
```

The PostgreSQL data is stored on the external PostgreSQL server, so stopping or rebuilding the Docker containers does not remove the database records.

## Basic Troubleshooting

### The Dashboard Does Not Open

Check:

```powershell
docker compose ps
```

Then:

```powershell
docker compose logs --tail=200
```

Confirm that Nginx is listening on the expected port.

### Backend Is Unhealthy

Check:

```powershell
docker compose logs --tail=200 backend
```

Common causes include:

- PostgreSQL is unreachable
- Incorrect PostgreSQL credentials
- MQTT startup delay
- Missing environment variables
- Database schema permissions

### PostgreSQL Connection Error

Check the connection:

```powershell
Test-NetConnection YOUR_POSTGRES_IP -Port 5432
```

Then verify:

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_SCHEMA`

The expected schema is:

```text
machine_monitoring
```

### MQTT Does Not Connect

Check the backend logs:

```powershell
docker compose logs -f backend
```

Verify:

- MQTT broker IP / hostname
- MQTT port
- MQTT username
- MQTT password
- Network access
- HighByte publishing status

A successful connection produces a backend message similar to:

```text
MQTT connected
```

### Machine Exists but Shows No Data

Check the configured source:

```sql
SELECT
  machine_id,
  source_topic,
  payload_root,
  source_path,
  is_active
FROM machine_monitoring.machine_data_sources;
```

Confirm that `source_topic` matches the MQTT topic being published.

Also inspect Data Mapping:

```sql
SELECT
  point_id,
  name,
  source_key_primary,
  source_key_secondary,
  source_fields,
  value_rules
FROM machine_monitoring.machine_points
ORDER BY point_id;
```

### Machine Configuration Disappears After Refresh

Confirm the machine has been stored:

```sql
SELECT *
FROM machine_monitoring.machine_configurations;
```

Then check:

```sql
SELECT *
FROM machine_monitoring.machine_points
ORDER BY point_id;
```

If PostgreSQL contains the configuration but the frontend does not display it, inspect the backend load endpoint and logs.

### Flexible Fields Do Not Persist

Check:

```sql
SELECT
  point_id,
  name,
  source_fields
FROM machine_monitoring.machine_points
ORDER BY point_id;
```

The `source_fields` column should contain the configured fields for each monitoring point.

### Face Recognition Does Not Work

Confirm:

- `FACE_API_BASE_URL` is correct
- The Face API is reachable from the Docker host
- The operator has been registered
- Camera permissions are available where required
- The current operator / machine / shift registration is valid

Check:

```powershell
docker compose logs --tail=200 backend
```

### Another Computer Cannot Open the Dashboard

On the other computer:

```powershell
Test-NetConnection SERVER_IP -Port 5059
```

If it fails:

- Confirm both computers are on the approved plant network
- Confirm the Docker host firewall allows port `5059`
- Confirm Nginx is running
- Confirm the Docker host IP is correct

## Database Checks

### Machine Configuration

```sql
SELECT
  id,
  name,
  mqtt_topic,
  is_active,
  config_revision
FROM machine_monitoring.machine_configurations
ORDER BY name;
```

### Data Sources

```sql
SELECT
  machine_id,
  source_system,
  transport,
  source_topic,
  payload_root,
  source_path,
  is_active
FROM machine_monitoring.machine_data_sources;
```

### Machine Points

```sql
SELECT
  machine_id,
  point_id,
  name,
  segment_id,
  source_fields,
  value_rules
FROM machine_monitoring.machine_points
ORDER BY machine_id, point_id;
```

### Operator Registrations

```sql
SELECT *
FROM machine_monitoring.operator_shift_registrations
ORDER BY registered_at DESC;
```

### Confirmations

```sql
SELECT *
FROM machine_monitoring.machine_check_confirmations
ORDER BY created_at DESC;
```

### Session Logs

```sql
SELECT
  id,
  session_id,
  access_role,
  started_at,
  ended_at,
  duration_seconds
FROM machine_monitoring.mespack_session_logs
ORDER BY ended_at DESC
LIMIT 50;
```

## Backup

The main persistent information is stored in PostgreSQL.

A production backup should include the complete:

```text
machine_monitoring
```

schema.

Important tables include:

- Machine configuration
- Machine image
- Machine segments
- Data Mapping
- Operator records
- Confirmation history
- Machine receipt history
- Session logs

Follow the site's approved PostgreSQL backup procedure.

The project source code and deployment configuration should also be backed up separately.

Do not include a production `.env` in general source-code backups that may be distributed outside the authorized deployment environment.

## Git and Source Control

The production `.env` must not be committed.

Recommended `.gitignore` entries:

```gitignore
.env
.env.*
!.env.example
node_modules/
dist/
```

Before committing:

```powershell
git status
```

Confirm that `.env` is not included.

Files that normally should be committed include:

```text
.env.example
.gitignore
.dockerignore
docker-compose.yml
Dockerfile.backend
Dockerfile.frontend
nginx.conf
backend/
src/
package.json
vite.config.js
README.md
```

## Security

- Keep `.env` private.
- Do not commit production credentials to Git.
- Do not publish PostgreSQL credentials.
- Do not publish MQTT credentials.
- Do not publish the Admin password.
- Do not expose the Face API to untrusted networks.
- Do not expose PostgreSQL directly to untrusted networks.
- Keep the application on the approved internal plant network.
- Restrict Admin access to authorized personnel.
- Change shared credentials according to the site's security policy.
- Use the Admin interface rather than manually changing production configuration when possible.

## Deployment Checklist

Before production / UAT deployment, confirm:

- Backend container is healthy
- Nginx container is running
- PostgreSQL is reachable
- `POSTGRES_SCHEMA=machine_monitoring`
- MQTT is connected
- Machine configuration exists
- Machine image loads
- Segments open correctly
- Data Mapping displays live values
- Missing values display **No Data**
- Save Configuration persists after refresh
- Flexible fields persist after refresh
- Operator registration works
- Face recognition works
- Machine confirmation works
- Session logs are created
- Another permitted computer can open port `5059`
- `.env` is not committed to Git
- PostgreSQL backup procedure is available
