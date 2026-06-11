
const express = require("express");
const cors = require("cors");
const mqtt = require("mqtt");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, ".env"), override: true, quiet: true });

const app = express();

const LOG_LEVEL = String(process.env.LOG_LEVEL || "minimal").toLowerCase();
const VERBOSE_LOGS = LOG_LEVEL === "debug" || LOG_LEVEL === "verbose";

function logInfo(message) {
  console.log(message);
}

function logWarn(message) {
  console.warn(message);
}

function logError(message, err) {
  const detail = err?.message || err?.cause?.message || (typeof err === "string" ? err : "");
  console.error(detail ? `${message}: ${detail}` : message);
}

function logDebug(message, data) {
  if (!VERBOSE_LOGS) return;
  if (data === undefined) console.log(message);
  else console.log(message, data);
}


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
const PEOPLE_TABLE = process.env.POSTGRES_PEOPLE_TABLE || "face_people";
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

const peopleTable = tableName(PEOPLE_TABLE);
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


async function upsertOperatorFace({ person_name, employee_id, department, role, machine, machine_name, candidate }) {
  const faceApiId = candidate?.face_api_id ?? null;
  const faceImgName = candidate?.face_img_name ?? null;

  if (!faceApiId && !faceImgName) {
    throw new Error("Face registered, but Face API did not return an id or img_name after verification search.");
  }

  const saved = await pgPool.query(
    `
      INSERT INTO ${peopleTable} (
        person_name,
        employee_id,
        department,
        role,
        machine,
        machine_name,
        face_api_id,
        face_api_object_id,
        face_img_name,
        face_app_namespace,
        face_hash,
        embedding_hash,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE)
      RETURNING *
    `,
    [
      person_name,
      employee_id || null,
      department || null,
      role || "operator",
      machine || null,
      machine_name || machine || null,
      faceApiId,
      candidate?.face_api_object_id || null,
      faceImgName,
      candidate?.app_namespace || APP_NAMESPACE,
      candidate?.face_hash || null,
      candidate?.embedding_hash || null,
    ]
  );

  return saved.rows[0];
}

async function findOperatorByCandidate(candidate) {
  const faceApiId = candidate?.face_api_id ?? null;
  const faceImgName = candidate?.face_img_name ?? null;

  if (!faceApiId && !faceImgName) return null;

  const found = await pgPool.query(
    `
      SELECT *
      FROM ${peopleTable}
      WHERE is_active = TRUE
        AND (
          ($1::integer IS NOT NULL AND face_api_id = $1::integer)
          OR ($2::text IS NOT NULL AND face_img_name = $2::text)
        )
      ORDER BY id DESC
      LIMIT 1
    `,
    [faceApiId, faceImgName]
  );

  return found.rows[0] || null;
}

async function insertConfirmationLog({ operator, machine, machine_name, candidate }) {
  const saved = await pgPool.query(
    `
      INSERT INTO ${confirmationsTable} (
        person_id,
        person_name,
        employee_id,
        department,
        role,
        machine,
        machine_name,
        face_api_id,
        face_api_object_id,
        face_img_name,
        face_distance,
        face_threshold,
        face_confidence,
        face_app_namespace,
        face_hash,
        embedding_hash,
        confirmation_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'confirmed')
      RETURNING *
    `,
    [
      operator.id,
      operator.person_name,
      operator.employee_id || null,
      operator.department || null,
      operator.role || "operator",
      machine || operator.machine || null,
      machine_name || operator.machine_name || machine || operator.machine || null,
      candidate.face_api_id,
      candidate.face_api_object_id,
      candidate.face_img_name,
      candidate.distance,
      candidate.threshold,
      candidate.confidence,
      candidate.app_namespace || null,
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
    CREATE TABLE IF NOT EXISTS ${peopleTable} (
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
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${confirmationsTable} (
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
    )
  `);

  // Safe migrations for old test tables.
  const peopleColumns = [
    ["employee_id", "TEXT"], ["department", "TEXT"], ["role", "TEXT DEFAULT 'operator'"],
    ["machine", "TEXT"], ["machine_name", "TEXT"], ["face_api_id", "INTEGER"],
    ["face_api_object_id", "TEXT"], ["face_img_name", "TEXT"], ["face_app_namespace", "TEXT"],
    ["face_hash", "TEXT"], ["embedding_hash", "TEXT"], ["is_active", "BOOLEAN DEFAULT TRUE"],
    ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"]
  ];
  for (const [col, typ] of peopleColumns) {
    await pgPool.query(`ALTER TABLE ${peopleTable} ADD COLUMN IF NOT EXISTS ${col} ${typ}`);
  }

  const confirmationColumns = [
    ["person_id", "INTEGER"], ["person_name", "TEXT"], ["employee_id", "TEXT"],
    ["department", "TEXT"], ["role", "TEXT"], ["machine", "TEXT"],
    ["machine_name", "TEXT"], ["face_api_id", "INTEGER"], ["face_api_object_id", "TEXT"],
    ["face_img_name", "TEXT"], ["face_distance", "DOUBLE PRECISION"], ["face_threshold", "DOUBLE PRECISION"],
    ["face_confidence", "DOUBLE PRECISION"], ["face_app_namespace", "TEXT"],
    ["face_hash", "TEXT"], ["embedding_hash", "TEXT"],
    ["confirmation_status", "TEXT DEFAULT 'confirmed'"], ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"]
  ];
  for (const [col, typ] of confirmationColumns) {
    await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS ${col} ${typ}`);
  }
}


if (MQTT_BROKER) {
  logDebug(`MQTT broker: ${MQTT_BROKER}`);
  logDebug(`MQTT topic: ${MQTT_TOPIC}`);

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

    logInfo("✅ MQTT connected");
    mqttClient.subscribe(MQTT_TOPIC, (err) => {
      if (err) {
        logError("❌ MQTT subscribe error", err);
        return;
      }

      logDebug(`✅ Subscribed to ${MQTT_TOPIC}`);
    });
  });

  mqttClient.on("reconnect", () => {
    logDebug("Reconnecting to MQTT...");
  });

  mqttClient.on("close", () => {
    mqttConnected = false;
    latestMachineData.mqttConnected = false;
    logDebug("⚠ MQTT connection closed");
  });

  mqttClient.on("error", (err) => {
    mqttConnected = false;
    latestMachineData.mqttConnected = false;
    logError("❌ MQTT error", err);
  });

  mqttClient.on("message", (topic, message) => {
    const rawText = message.toString();

    lastRawPayload = rawText;
    lastMessageAt = new Date().toISOString();

    let parsed;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      logError("❌ MQTT payload is not valid JSON");
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

    logDebug("MQTT data updated", {
      topic,
      status: latestMachineData.status,
      doors: latestMachineData.data.doors?.length || 0,
      openDoorCount: latestMachineData.data.openDoorCount,
      diagnosticCount: latestMachineData.data.diagnosticCount,
    });
  });
} else {
  logWarn("⚠ MQTT_BROKER is empty. Dashboard will stay in WAITING mode until configured.");
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
    const { person_name, employee_id, department, role, machine, machine_name } = req.body;
    const image = req.body.image || req.body.img;

    if (!person_name || !department || !machine || !image) {
      return res.status(400).json({ error: "person_name, department, machine, and image/img are required." });
    }

    const registerResponse = await faceApiPost("/register", facePayload(image, {
      person_name,
      name: person_name,
      identity: `${APP_NAMESPACE}|${machine}|${person_name}`,
      employee_id: employee_id || "",
      department,
      role: role || "operator",
      machine,
      machine_name: machine_name || machine,
      source_app: "Mespack Machine Dashboard",
      app_namespace: APP_NAMESPACE,
      is_active: true,
    }));

    const searchResponse = await faceApiPost("/search", searchPayload(image));
    const candidate = firstFaceCandidate(searchResponse);

    if (!candidate?.face_api_id && !candidate?.face_img_name) {
      return res.status(502).json({
        error: "Face API registered the image, but verification search did not return a usable id/img_name.",
        registerResponse,
        searchResponse,
      });
    }

    const operator = await upsertOperatorFace({
      person_name,
      employee_id,
      department,
      role: role || "operator",
      machine,
      machine_name: machine_name || machine,
      candidate,
    });

    res.json({
      ok: true,
      message: `Registered ${person_name} in Face API and PostgreSQL.`,
      operator,
      candidate,
      registerResponse,
      searchResponse,
    });
  } catch (err) {
    logError("❌ Face register failed", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/machine-check/confirm", async (req, res) => {
  try {
    const { machine, machine_name } = req.body;
    const image = req.body.image || req.body.img;

    if (!machine || !image) {
      return res.status(400).json({ error: "machine and image/img are required." });
    }

    const searchResponse = await faceApiPost("/search", searchPayload(image));
    const candidate = firstFaceCandidate(searchResponse);

    if (!candidate?.face_api_id && !candidate?.face_img_name) {
      return res.status(404).json({ error: "Face scanned, but the API returned no valid candidate.", searchResponse });
    }

    const operator = await findOperatorByCandidate(candidate);

    if (!operator) {
      return res.status(403).json({
        error: `Face recognized by Face API as ID ${candidate.face_api_id || candidate.face_img_name}, but this face is not registered/active in PostgreSQL for this dashboard. Register it first from Admin/Register Face.`,
        candidate,
        searchResponse,
      });
    }

    const log = await insertConfirmationLog({
      operator,
      machine,
      machine_name: machine_name || machine,
      candidate,
    });

    res.json({ ok: true, log, operator, candidate, searchResponse });
  } catch (err) {
    logError("❌ Machine check confirmation failed", err);
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

    const people = await pgPool.query(
      `
        SELECT *
        FROM ${peopleTable}
        ORDER BY created_at DESC, id DESC
        LIMIT 300
      `
    );

    res.json({ ok: true, logs: logs.rows, people: people.rows });
  } catch (err) {
    logError("❌ Admin logs failed", err);
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

    const updated = await pgPool.query(
      `
        UPDATE ${peopleTable}
        SET is_active = FALSE
        WHERE ($1::integer IS NOT NULL AND face_api_id = $1::integer)
           OR ($2::text IS NOT NULL AND face_img_name = $2::text)
        RETURNING *
      `,
      [face_api_id || null, face_img_name || null]
    );

    let faceApiUnregisterResponse = null;
    if (FACE_UNREGISTER_PATH) {
      faceApiUnregisterResponse = await faceApiPost(FACE_UNREGISTER_PATH, {
        id: face_api_id,
        face_api_id,
        img_name: face_img_name,
        app_namespace: APP_NAMESPACE,
        is_active: false,
      });
    }

    res.json({
      ok: true,
      message: updated.rowCount
        ? "Face deactivated in PostgreSQL for this dashboard."
        : "No PostgreSQL operator mapping was found for that Face ID / Image ID.",
      updated: updated.rows,
      faceApiUnregisterResponse,
    });
  } catch (err) {
    logError("❌ Face unregister failed", err);
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
      logInfo(`✅ Backend running: http://localhost:${PORT}`);
      logInfo(`✅ Dashboard API: http://localhost:${PORT}/data`);
      logInfo(`✅ Face API: ${FACE_API_BASE_URL}`);
      logDebug(`App namespace: ${APP_NAMESPACE} (strict=${APP_NAMESPACE_STRICT})`);
      logDebug(`PostgreSQL people table: ${peopleTable}`);
      logInfo(`✅ PostgreSQL: ${peopleTable}, ${confirmationsTable}`);
    });
  })
  .catch((err) => {
    logError("❌ Failed to initialize PostgreSQL tables", err);
    process.exit(1);
  });
