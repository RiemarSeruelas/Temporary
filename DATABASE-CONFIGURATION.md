# Machine Configuration in PostgreSQL

All adjustable machine-monitoring configuration is stored in the `app` schema.

| Table | Purpose |
| --- | --- |
| `app.machine_configurations` | Machine identity, visibility, revision, and audit fields. |
| `app.machine_data_sources` | HighByte source system, transport, broker/output, topic, payload path, and dashboard destination. |
| `app.machine_images` | Base64 machine image, MIME type, original dimensions, fixed canvas ratio, and SHA-256 version. |
| `app.machine_segments` | Normalized polygon points and backend-calculated bounding boxes for clickable areas. |
| `app.machine_points` | Display names, incoming HighByte field mappings, and admin-defined raw-value meanings. |
| `app.operator_shift_registrations` | Dated operator-to-machine assignments for one confirmation shift. |
| `app.machine_check_confirmations` | Face-confirmed machine checks linked to the exact registration. |
| `app.machine_data_receipts` | Per-minute MQTT receipt evidence used to determine whether a machine was running. |

## Fixed image geometry

- Every image is displayed in a fixed `2.1:1` container.
- Images use the same geometry in Admin and the live dashboard.
- Segment vertices are stored as percentages from `0` to `100`, never screen pixels.
- The backend calculates and stores each segment's bounding box from its polygon.
- A resized tablet or monitor therefore scales the image and overlay together.

## Data route

The normal route is:

`HighByte -> MQTT broker/topic -> backend machine state -> /api/machines/:id/data -> dashboard point mapping`

The global MQTT credentials still come from `backend/.env`. The per-machine source endpoint and topic stored in PostgreSQL identify and route the configured source; passwords are not copied into the database.

## Configuration endpoints

- `GET /api/machines` — list complete public machine configurations without returning the Base64 text.
- `GET /api/machines/:id/image` — stream the decoded image with immutable SHA-based caching.
- `GET /api/machines/:id/configuration` — read one configuration.
- `GET /api/machines/:id/available-data` — list live HighByte/MQTT payload fields together with fields already mapped in PostgreSQL.
- `PUT /api/machines/:id/configuration` — atomically save machine, route, image, segments, and point mappings.
- `GET /api/machines/:id/data` — read the latest HighByte/MQTT state for one machine.

Admin writes require the configured `ADMIN_PASSWORD`. A `config_revision` check prevents one admin from overwriting a newer edit without refreshing.

## Admin workflow

1. Admin opens to two floating choices: **Machine Set Up** and **Operator**.
2. Machine Set Up opens the swipeable directory of machine-image cards.
3. Select a machine image to open its database configuration.
4. Configure the machine name, MQTT broker URL, and MQTT topic.
5. Upload the machine image. All images use the same fixed `2.1:1` canvas.
6. Click at least three points on the image to create a segment, then name its area/location.
7. Map detected HighByte fields into visible points and assign each point to a segment.
8. Open **Define 1 / 0** for a point. A centered modal maps each Boolean raw value to its display label, condition level, and color. Define an unmatched-value fallback as well.
9. Save configuration to commit the machine, image, source, segments, bounding boxes, mappings, and value meanings in one transaction.

## Operator confirmation workflow

1. In **Operator > Registration**, enter the operator name, select the machine and shift, then capture the face.
2. Registration is accepted only in that shift's four-hour window: 6 AM-10 AM, 2 PM-6 PM, or 10 PM-2 AM.
3. The assignment is stored with the shift date and its exact machine.
4. On the dashboard, **Confirm check** performs face detection first. The UI shows the matched name, machine, and shift before the person can confirm.
5. The backend accepts the confirmation only through a short-lived detection token tied to the same active registration.
6. If no fresh MQTT data exists for the machine, confirmation is not required.
7. Logs use a date-by-shift matrix: confirmed assignments are green, missed active-machine assignments are red, machine-off assignments are neutral, future dates show an em dash, and missing values show **No data**.

The backend records only per-minute receipt evidence in `app.machine_data_receipts`; it does not duplicate every MQTT payload for the log matrix.

## Raw-value meanings

`app.machine_points.value_rules` is JSONB. It contains separate dictionaries for the primary and optional secondary MQTT fields, plus a fallback. The raw interlock data remains Boolean `1` or `0`; the dictionary only defines how each value should appear. For example, one machine may define `1` as **Locked / Good**, while another may define `1` as **Running / Good** or **Alarm / Critical**. The dashboard no longer assumes a universal display meaning for the raw Boolean value.
