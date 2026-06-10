
const express = require("express");
const cors = require("cors");
const mqtt = require("mqtt");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, ".env"), override: true });

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const PORT = Number(process.env.PORT || 5000);

const MQTT_BROKER = process.env.MQTT_BROKER;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_TOPIC = process.env.MQTT_TOPIC || "sensor/data";

const FACE_API_BASE_URL = (process.env.FACE_API_BASE_URL || "http://10.156.119.146:5005").replace(/\/$/, "");
const APP_NAMESPACE = process.env.APP_NAMESPACE || "riems_operator_attendance";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin2026";

const POSTGRES_SCHEMA = process.env.POSTGRES_SCHEMA || "app";
const FACE_PEOPLE_TABLE = process.env.POSTGRES_FACE_PEOPLE_TABLE || "face_people";
const ATTENDANCE_TABLE = process.env.POSTGRES_ATTENDANCE_TABLE || "face_attendance_logs";

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || "mydatabase",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "",
});

function tableName(name) {
  const safeSchema = String(POSTGRES_SCHEMA).replace(/[^a-zA-Z0-9_]/g, "");
  const safeName = String(name).replace(/[^a-zA-Z0-9_]/g, "");
  return `"${safeSchema}"."${safeName}"`;
}

const peopleTable = tableName(FACE_PEOPLE_TABLE);
const attendanceTable = tableName(ATTENDANCE_TABLE);

let mqttConnected = false;
let lastMessageAt = null;
let lastRawPayload = null;

let latestMachineData = {
  status: "WAITING",
  mqttConnected: false,
  topic: MQTT_TOPIC,
  lastUpdated: null,
  data: {},
};

function safeJsonParse(value) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function unwrapSingleArray(value) {
  if (Array.isArray(value)) {
    if (value.length === 1) {
      return unwrapSingleArray(value[0]);
    }

    return value.map(unwrapSingleArray);
  }

  if (value && typeof value === "object") {
    const output = {};

    for (const [key, val] of Object.entries(value)) {
      output[key] = unwrapSingleArray(val);
    }

    return output;
  }

  return value;
}

function normalizeDoors(doors) {
  if (!doors) return [];

  let parsedDoors = doors;

  if (typeof parsedDoors === "string") {
    parsedDoors = safeJsonParse(parsedDoors);
  }

  if (!Array.isArray(parsedDoors)) {
    return [];
  }

  return parsedDoors
    .map((door) => {
      if (typeof door === "string") {
        return safeJsonParse(door);
      }

      return door;
    })
    .filter((door) => door && typeof door === "object");
}

function normalizeHighBytePayload(rawPayload) {
  const unwrapped = unwrapSingleArray(rawPayload);

  const sourceData =
    unwrapped && typeof unwrapped === "object" && unwrapped.data
      ? unwrapped.data
      : unwrapped;

  if (!sourceData || typeof sourceData !== "object") {
    return {
      status: "WAITING",
      data: {},
    };
  }

  const doors = normalizeDoors(sourceData.doors);

  const flatTags = {};

  let openDoorCount = 0;
  let diagnosticCount = 0;

  for (const door of doors) {
    const doorNoRaw = String(Number(door.doorNo));

    const guardTag = door.doorTagName || `SFI_Door${doorNoRaw}`;
    const diagnosticTag = door.diagnosticTagName || `I_Door${doorNoRaw}Diagnostic`;

    const doorValue = door.doorValue === true;
    const diagnosticFault = door.diagnosticValue === false;
    const interlockOk = !diagnosticFault;

    flatTags[guardTag] = doorValue;
    flatTags[diagnosticTag] = interlockOk;

    if (doorValue !== true) openDoorCount++;
    if (diagnosticFault) diagnosticCount++;
  }

  let overallStatus = sourceData.overallStatus || "READY";

  if (diagnosticCount > 0) {
    overallStatus = "DIAGNOSTIC";
  } else if (openDoorCount > 0) {
    overallStatus = "GUARD OPEN";
  } else {
    overallStatus = "READY";
  }

  return {
    status: overallStatus,
    data: {
      _name: sourceData._name,
      _model: sourceData._model,
      _timestamp: sourceData._timestamp,
      area: sourceData.area || "Dressings",
      machine: sourceData.machine || "Mespack Filler",
      doors,
      overallStatus,
      openDoorCount,
      diagnosticCount,
      ...flatTags,
    },
  };
}

async function faceApiPost(path, body) {
  const url = `${FACE_API_BASE_URL}${path}`;

  async function readResponse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  // First try JSON. This is what the Face API normally accepts.
  let response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data = await readResponse(response);

  // Some Face API builds are picky and only read form data for /register.
  // If the server says img is missing, retry once as FormData.
  const errorText = String(data?.error || data?.message || data?.detail || data?.raw || "").toLowerCase();
  if (!response.ok && errorText.includes("img") && errorText.includes("not found")) {
    const form = new FormData();
    for (const [key, value] of Object.entries(body || {})) {
      if (value === undefined || value === null) continue;
      form.append(key, typeof value === "boolean" ? String(value) : value);
    }

    response = await fetch(url, {
      method: "POST",
      body: form,
    });

    data = await readResponse(response);
  }

  if (!response.ok) {
    const keys = Object.keys(body || {}).join(", ");
    throw new Error(data.error || data.message || data.detail || data.raw || `Face API ${path} failed: ${response.status}. Sent keys: ${keys}`);
  }

  return data;
}

function firstFaceCandidate(apiResponse) {
  const firstGroup = apiResponse?.results?.[0];
  if (!Array.isArray(firstGroup) || firstGroup.length === 0) return null;

  const validCandidates = firstGroup
    .filter((candidate) => candidate && typeof candidate === "object")
    .map((candidate) => ({
      ...candidate,
      distanceNumber: Number(candidate.distance),
      thresholdNumber: Number(candidate.threshold),
    }))
    .filter((candidate) => {
      if (!Number.isFinite(candidate.distanceNumber)) return false;
      if (!Number.isFinite(candidate.thresholdNumber)) return true;
      return candidate.distanceNumber <= candidate.thresholdNumber;
    })
    .sort((a, b) => a.distanceNumber - b.distanceNumber);

  const candidate = validCandidates[0];
  if (!candidate) return null;

  return {
    raw: candidate,
    face_api_id: candidate.id,
    face_api_object_id: candidate._id,
    face_img_name: candidate.img_name,
    distance: candidate.distance,
    threshold: candidate.threshold,
    confidence: candidate.confidence,
  };
}

function normalizeImageInput(image) {
  if (!image || typeof image !== "string") return "";
  const trimmed = image.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:image/")) return trimmed;
  return `data:image/jpeg;base64,${trimmed}`;
}

function facePayload(image, extra = {}) {
  const normalizedImage = normalizeImageInput(image);

  return {
    model_name: "SFace",
    detector_backend: "yunet",
    align: true,
    l2_normalize: true,
    ...extra,

    // Keep img at the end so no extra field can accidentally overwrite it.
    img: normalizedImage,
  };
}

function searchPayload(image) {
  return facePayload(image, {
    distance_metric: "cosine",
    search_method: "exact",
  });
}

async function findRegisteredPersonByFaceId(faceApiId, machine) {
  const result = await pgPool.query(
    `
      SELECT id, person_name, department, machine, face_api_id, face_img_name, created_at
      FROM ${peopleTable}
      WHERE app_namespace = $1
        AND face_api_id = $2
        AND machine = $3
      ORDER BY id DESC
      LIMIT 1
    `,
    [APP_NAMESPACE, faceApiId, machine]
  );

  return result.rows[0] || null;
}

async function ensureTables() {
  const safeSchema = POSTGRES_SCHEMA.replace(/[^a-zA-Z0-9_]/g, "");
  await pgPool.query(`CREATE SCHEMA IF NOT EXISTS "${safeSchema}"`);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${peopleTable} (
      id SERIAL PRIMARY KEY,
      person_name TEXT NOT NULL,
      department TEXT,
      machine TEXT,
      face_api_id INTEGER,
      face_img_name TEXT,
      app_namespace TEXT NOT NULL DEFAULT '${APP_NAMESPACE.replace(/'/g, "''")}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Safe migrations for older tables created during testing.
  await pgPool.query(`ALTER TABLE ${peopleTable} ADD COLUMN IF NOT EXISTS department TEXT`);
  await pgPool.query(`ALTER TABLE ${peopleTable} ADD COLUMN IF NOT EXISTS machine TEXT`);
  await pgPool.query(`ALTER TABLE ${peopleTable} ADD COLUMN IF NOT EXISTS face_api_id INTEGER`);
  await pgPool.query(`ALTER TABLE ${peopleTable} ADD COLUMN IF NOT EXISTS face_img_name TEXT`);
  await pgPool.query(`ALTER TABLE ${peopleTable} ADD COLUMN IF NOT EXISTS app_namespace TEXT DEFAULT '${APP_NAMESPACE.replace(/'/g, "''")}'`);
  await pgPool.query(`ALTER TABLE ${peopleTable} ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await pgPool.query(`UPDATE ${peopleTable} SET app_namespace = $1 WHERE app_namespace IS NULL`, [APP_NAMESPACE]);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${attendanceTable} (
      id SERIAL PRIMARY KEY,
      person_id INTEGER,
      person_name TEXT NOT NULL,
      department TEXT,
      machine TEXT,
      face_api_id INTEGER,
      face_img_name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`ALTER TABLE ${attendanceTable} ADD COLUMN IF NOT EXISTS person_id INTEGER`);
  await pgPool.query(`ALTER TABLE ${attendanceTable} ADD COLUMN IF NOT EXISTS person_name TEXT`);
  await pgPool.query(`ALTER TABLE ${attendanceTable} ADD COLUMN IF NOT EXISTS department TEXT`);
  await pgPool.query(`ALTER TABLE ${attendanceTable} ADD COLUMN IF NOT EXISTS machine TEXT`);
  await pgPool.query(`ALTER TABLE ${attendanceTable} ADD COLUMN IF NOT EXISTS face_api_id INTEGER`);
  await pgPool.query(`ALTER TABLE ${attendanceTable} ADD COLUMN IF NOT EXISTS face_img_name TEXT`);
  await pgPool.query(`ALTER TABLE ${attendanceTable} ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
}

async function upsertRegisteredPerson({ person_name, department, machine, face_api_id, face_img_name }) {
  const existing = await pgPool.query(
    `
      SELECT id
      FROM ${peopleTable}
      WHERE app_namespace = $1
        AND machine = $2
        AND face_api_id = $3
      ORDER BY id DESC
      LIMIT 1
    `,
    [APP_NAMESPACE, machine, face_api_id]
  );

  if (existing.rows[0]) {
    const updated = await pgPool.query(
      `
        UPDATE ${peopleTable}
        SET person_name = $1,
            department = $2,
            face_img_name = $3
        WHERE id = $4
        RETURNING id, person_name, department, machine, face_api_id, face_img_name, created_at
      `,
      [person_name, department, face_img_name, existing.rows[0].id]
    );

    return updated.rows[0];
  }

  const inserted = await pgPool.query(
    `
      INSERT INTO ${peopleTable} (
        person_name, department, machine, face_api_id, face_img_name, app_namespace
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, person_name, department, machine, face_api_id, face_img_name, created_at
    `,
    [person_name, department, machine, face_api_id, face_img_name, APP_NAMESPACE]
  );

  return inserted.rows[0];
}

if (MQTT_BROKER) {
  console.log("Connecting to MQTT broker:", MQTT_BROKER);
  console.log("Subscribing topic:", MQTT_TOPIC);

  const mqttClient = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
    clientId: `mespack_dashboard_backend_${Date.now()}`,
  });

  mqttClient.on("connect", () => {
    mqttConnected = true;
    latestMachineData.mqttConnected = true;

    console.log("✅ MQTT connected");
    mqttClient.subscribe(MQTT_TOPIC, (err) => {
      if (err) {
        console.error("❌ MQTT subscribe error:", err.message);
        return;
      }

      console.log("✅ Subscribed to:", MQTT_TOPIC);
    });
  });

  mqttClient.on("reconnect", () => {
    console.log("Reconnecting to MQTT...");
  });

  mqttClient.on("close", () => {
    mqttConnected = false;
    latestMachineData.mqttConnected = false;
    console.log("⚠ MQTT connection closed");
  });

  mqttClient.on("error", (err) => {
    mqttConnected = false;
    latestMachineData.mqttConnected = false;
    console.error("❌ MQTT error:", err.message);
  });

  mqttClient.on("message", (topic, message) => {
    const rawText = message.toString();

    lastRawPayload = rawText;
    lastMessageAt = new Date().toISOString();

    let parsed;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("❌ MQTT payload is not valid JSON");
      return;
    }

    const normalized = normalizeHighBytePayload(parsed);

    latestMachineData = {
      status: normalized.status,
      mqttConnected,
      topic,
      lastUpdated: lastMessageAt,
      data: normalized.data,
    };

    console.log("✅ MQTT data updated:", {
      topic,
      status: latestMachineData.status,
      doors: latestMachineData.data.doors?.length || 0,
      openDoorCount: latestMachineData.data.openDoorCount,
      diagnosticCount: latestMachineData.data.diagnosticCount,
    });
  });
} else {
  console.warn("⚠ MQTT_BROKER is empty. Dashboard will stay in WAITING mode until configured.");
}

app.get("/", (req, res) => {
  res.json({
    message: "Mespack Safety Backend is running",
    mqttConnected,
    topic: MQTT_TOPIC,
    lastMessageAt,
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mqttConnected,
    topic: MQTT_TOPIC,
    lastMessageAt,
  });
});

app.get("/data", (req, res) => {
  res.json(latestMachineData);
});

app.get("/api/data", (req, res) => {
  res.json(latestMachineData);
});

app.get("/raw", (req, res) => {
  res.json({
    mqttConnected,
    topic: MQTT_TOPIC,
    lastMessageAt,
    raw: lastRawPayload,
  });
});

app.get("/data-machine2", (req, res) => {
  res.json(latestMachineData);
});

app.post("/api/face/register", async (req, res) => {
  try {
    const { person_name, department, machine } = req.body;
    const image = req.body.image || req.body.img;

    if (!person_name || !department || !machine || !image) {
      return res.status(400).json({ error: "person_name, department, machine, and image/img are required." });
    }

    const registerResponse = await faceApiPost("/register", facePayload(image, {
      person_name,
      name: person_name,
      identity: `${APP_NAMESPACE}|${machine}|${person_name}`,
      department,
      machine,
      project: "Operator",
      source_app: "Mespack Machine Dashboard",
      app_namespace: APP_NAMESPACE,
    }));

    const searchResponse = await faceApiPost("/search", searchPayload(image));
    const candidate = firstFaceCandidate(searchResponse);

    if (!candidate?.face_api_id) {
      return res.status(409).json({
        error: "Face registered, but the Face API did not return a searchable candidate yet. Try scanning again.",
        registerResponse,
        searchResponse,
      });
    }

    const savedPerson = await upsertRegisteredPerson({
      person_name,
      department,
      machine,
      face_api_id: candidate.face_api_id,
      face_img_name: candidate.face_img_name,
    });

    res.json({ ok: true, person: savedPerson, candidate, registerResponse });
  } catch (err) {
    console.error("Face register failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/face/login/scan", async (req, res) => {
  try {
    const { machine } = req.body;
    const image = req.body.image || req.body.img;

    if (!machine || !image) {
      return res.status(400).json({ error: "machine and image/img are required." });
    }

    const searchResponse = await faceApiPost("/search", searchPayload(image));
    const candidate = firstFaceCandidate(searchResponse);

    if (!candidate?.face_api_id) {
      return res.status(404).json({ error: "Face scanned, but the API returned no candidate.", searchResponse });
    }

    const person = await findRegisteredPersonByFaceId(candidate.face_api_id, machine);

    if (!person) {
      return res.status(404).json({
        error: `Face API recognized ID ${candidate.face_api_id}, but it is not registered in this app for this machine.`,
        candidate,
        searchResponse,
      });
    }

    res.json({ ok: true, person, candidate, machine_name: machine, searchResponse });
  } catch (err) {
    console.error("Face login scan failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/face/login/confirm", async (req, res) => {
  try {
    const { person_id, machine, face_api_id, face_img_name } = req.body;

    if (!person_id || !machine) {
      return res.status(400).json({ error: "person_id and machine are required." });
    }

    const personResult = await pgPool.query(
      `
        SELECT id, person_name, department, machine, face_api_id, face_img_name
        FROM ${peopleTable}
        WHERE id = $1 AND machine = $2 AND app_namespace = $3
        LIMIT 1
      `,
      [person_id, machine, APP_NAMESPACE]
    );

    const person = personResult.rows[0];

    if (!person) {
      return res.status(404).json({ error: "Local person was not found for this machine." });
    }

    const saved = await pgPool.query(
      `
        INSERT INTO ${attendanceTable} (
          person_id, person_name, department, machine, face_api_id, face_img_name
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, person_id, person_name, department, machine, face_api_id, face_img_name, created_at
      `,
      [
        person.id,
        person.person_name,
        person.department,
        machine,
        face_api_id || person.face_api_id,
        face_img_name || person.face_img_name,
      ]
    );

    res.json({ ok: true, log: saved.rows[0] });
  } catch (err) {
    console.error("Face login confirm failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/face/admin/logs", async (req, res) => {
  try {
    const { password } = req.body;

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Invalid admin password." });
    }

    const logs = await pgPool.query(
      `
        SELECT id, person_id, person_name, department, machine, face_api_id, face_img_name, created_at
        FROM ${attendanceTable}
        ORDER BY created_at DESC
        LIMIT 200
      `
    );

    res.json({ ok: true, logs: logs.rows });
  } catch (err) {
    console.error("Admin logs failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/face/health", async (req, res) => {
  try {
    await pgPool.query("SELECT 1");
    res.json({ ok: true, postgres: true, faceApi: FACE_API_BASE_URL });
  } catch (err) {
    res.status(500).json({ ok: false, postgres: false, error: err.message });
  }
});

ensureTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Backend running on http://localhost:${PORT}`);
      console.log(`✅ Dashboard endpoint: http://localhost:${PORT}/data`);
      console.log(`✅ Face API base URL: ${FACE_API_BASE_URL}`);
      console.log(`✅ PostgreSQL tables: ${peopleTable}, ${attendanceTable}`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to initialize PostgreSQL tables:", err);
    process.exit(1);
  });
