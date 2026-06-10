
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
const APP_NAMESPACE = process.env.APP_NAMESPACE || "machine_dashboard";
const APP_NAMESPACE_STRICT = String(process.env.APP_NAMESPACE_STRICT || "true").toLowerCase() === "true";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin2026";
const FACE_UNREGISTER_PATH = process.env.FACE_UNREGISTER_PATH || "";

const POSTGRES_SCHEMA = process.env.POSTGRES_SCHEMA || "app";
const CONFIRMATIONS_TABLE = process.env.POSTGRES_CONFIRMATIONS_TABLE || "machine_check_confirmations";

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

const confirmationsTable = tableName(CONFIRMATIONS_TABLE);

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
    face_api_id: candidate.id ?? candidate.sequence,
    face_api_object_id: candidate._id,
    face_img_name: candidate.img_name,
    distance: candidate.distance,
    threshold: candidate.threshold,
    confidence: candidate.confidence,
    app_namespace: candidate.app_namespace,
    is_active: candidate.is_active,
    face_hash: candidate.face_hash,
    embedding_hash: candidate.embedding_hash,
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


function validateAppNamespace(candidate) {
  if (!candidate) return { ok: false, error: "No face candidate returned." };

  if (candidate.is_active === false || candidate.is_active === "false") {
    return { ok: false, error: "Face recognized, but it is inactive in the Face API." };
  }

  if (candidate.app_namespace && candidate.app_namespace !== APP_NAMESPACE) {
    return {
      ok: false,
      error: `Face recognized, but app_namespace is '${candidate.app_namespace}', not '${APP_NAMESPACE}'.`,
    };
  }

  if (APP_NAMESPACE_STRICT && !candidate.app_namespace) {
    return {
      ok: false,
      error: `Face recognized, but Face API did not return app_namespace. Add app_namespace='${APP_NAMESPACE}' to Face API register/search response or set APP_NAMESPACE_STRICT=false temporarily.`,
    };
  }

  return { ok: true };
}

async function insertConfirmationLog({ person_name, department, machine, machine_name, candidate }) {
  const saved = await pgPool.query(
    `
      INSERT INTO ${confirmationsTable} (
        person_name,
        department,
        machine,
        machine_name,
        face_api_id,
        face_api_object_id,
        face_img_name,
        face_distance,
        face_threshold,
        face_confidence,
        face_app_namespace,
        face_is_active,
        face_hash,
        embedding_hash,
        confirmation_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'confirmed')
      RETURNING *
    `,
    [
      person_name,
      department,
      machine,
      machine_name,
      candidate.face_api_id,
      candidate.face_api_object_id,
      candidate.face_img_name,
      candidate.distance,
      candidate.threshold,
      candidate.confidence,
      candidate.app_namespace || null,
      candidate.is_active === undefined ? null : candidate.is_active,
      candidate.face_hash || null,
      candidate.embedding_hash || null,
    ]
  );

  return saved.rows[0];
}

async function ensureTables() {
  const safeSchema = POSTGRES_SCHEMA.replace(/[^a-zA-Z0-9_]/g, "");
  await pgPool.query(`CREATE SCHEMA IF NOT EXISTS "${safeSchema}"`);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${confirmationsTable} (
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
    )
  `);

  // Safe migrations for older confirmation/attendance tables created during testing.
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS person_name TEXT`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS department TEXT`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS machine TEXT`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS machine_name TEXT`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS face_api_id INTEGER`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS face_api_object_id TEXT`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS face_img_name TEXT`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS face_distance DOUBLE PRECISION`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS face_threshold DOUBLE PRECISION`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS face_confidence DOUBLE PRECISION`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS face_app_namespace TEXT`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS face_is_active BOOLEAN`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS face_hash TEXT`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS embedding_hash TEXT`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS confirmation_status TEXT DEFAULT 'confirmed'`);
  await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
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
    const { person_name, department, machine, machine_name } = req.body;
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
      machine_name: machine_name || machine,
      source_app: "Mespack Machine Dashboard",
      app_namespace: APP_NAMESPACE,
      is_active: true,
    }));

    let candidate = null;
    let searchResponse = null;
    try {
      searchResponse = await faceApiPost("/search", searchPayload(image));
      candidate = firstFaceCandidate(searchResponse);
    } catch (searchErr) {
      console.warn("Face registered, but verification search failed:", searchErr.message);
    }

    res.json({
      ok: true,
      message: `Registered face for ${person_name}. Face API should store app_namespace='${APP_NAMESPACE}'.`,
      candidate,
      registerResponse,
      searchResponse,
    });
  } catch (err) {
    console.error("Face register failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/machine-check/confirm", async (req, res) => {
  try {
    const { person_name, department, machine, machine_name } = req.body;
    const image = req.body.image || req.body.img;

    if (!person_name || !department || !machine || !image) {
      return res.status(400).json({ error: "person_name, department, machine, and image/img are required." });
    }

    const searchResponse = await faceApiPost("/search", searchPayload(image));
    const candidate = firstFaceCandidate(searchResponse);

    if (!candidate?.face_api_id) {
      return res.status(404).json({ error: "Face scanned, but the API returned no valid candidate.", searchResponse });
    }

    const namespaceCheck = validateAppNamespace(candidate);
    if (!namespaceCheck.ok) {
      return res.status(403).json({ error: namespaceCheck.error, candidate, searchResponse });
    }

    const log = await insertConfirmationLog({
      person_name,
      department,
      machine,
      machine_name: machine_name || machine,
      candidate,
    });

    res.json({ ok: true, log, candidate, searchResponse });
  } catch (err) {
    console.error("Machine check confirmation failed:", err);
    res.status(500).json({ error: err.message });
  }
});


app.post("/api/machine-check/admin/logs", async (req, res) => {
  try {
    const { password } = req.body;

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Invalid admin password." });
    }

    const logs = await pgPool.query(
      `
        SELECT *
        FROM ${confirmationsTable}
        ORDER BY created_at DESC
        LIMIT 300
      `
    );

    res.json({ ok: true, logs: logs.rows });
  } catch (err) {
    console.error("Admin confirmation logs failed:", err);
    res.status(500).json({ error: err.message });
  }
});


app.post("/api/face/unregister", async (req, res) => {
  try {
    const { password, face_api_id, face_img_name } = req.body;

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Invalid admin password." });
    }

    if (!face_api_id && !face_img_name) {
      return res.status(400).json({ error: "face_api_id or face_img_name is required." });
    }

    if (!FACE_UNREGISTER_PATH) {
      return res.status(501).json({
        error: "Face unregister is not configured. Set FACE_UNREGISTER_PATH in backend/.env to your Face API delete/deactivate endpoint.",
      });
    }

    const unregisterResponse = await faceApiPost(FACE_UNREGISTER_PATH, {
      id: face_api_id,
      face_api_id,
      img_name: face_img_name,
      app_namespace: APP_NAMESPACE,
      is_active: false,
    });

    res.json({ ok: true, unregisterResponse });
  } catch (err) {
    console.error("Face unregister failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/face/health", async (req, res) => {
  try {
    await pgPool.query("SELECT 1");
    res.json({ ok: true, postgres: true, faceApi: FACE_API_BASE_URL, appNamespace: APP_NAMESPACE, strictNamespace: APP_NAMESPACE_STRICT });
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
      console.log(`✅ App namespace: ${APP_NAMESPACE} (strict=${APP_NAMESPACE_STRICT})`);
      console.log(`✅ PostgreSQL table: ${confirmationsTable}`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to initialize PostgreSQL tables:", err);
    process.exit(1);
  });
