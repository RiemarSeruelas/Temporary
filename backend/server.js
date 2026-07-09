
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

// Manila plant time. We use a fixed +08:00 offset because Asia/Manila has no DST.
const MANILA_OFFSET_MINUTES = 8 * 60;
const MACHINE_DATA_STALE_SECONDS = Number(process.env.MACHINE_DATA_STALE_SECONDS || 300);

const SHIFT_WINDOWS = {
  MORNING: {
    label: "6 AM - 10 AM",
    shiftLabel: "6 AM - 2 PM",
    verifyStart: "06:00",
    verifyEnd: "10:00",
  },
  AFTERNOON: {
    label: "2 PM - 6 PM",
    shiftLabel: "2 PM - 10 PM",
    verifyStart: "14:00",
    verifyEnd: "18:00",
  },
  NIGHT: {
    label: "10 PM - 2 AM",
    shiftLabel: "10 PM - 6 AM",
    verifyStart: "22:00",
    verifyEnd: "02:00",
    crossesMidnight: true,
  },
};

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

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeTextState(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function normalizeOpenCloseState(value, fallbackFromBool = null) {
  if (value === undefined || value === null || value === "") {
    if (fallbackFromBool === true) return "CLOSE";
    if (fallbackFromBool === false) return "OPEN";
    return null;
  }

  if (typeof value === "boolean") return value ? "CLOSE" : "OPEN";
  if (typeof value === "number") return value === 1 ? "CLOSE" : value === 0 ? "OPEN" : null;

  const text = normalizeTextState(value);
  if (["close", "closed", "guard on", "door closed", "safe", "ready", "healthy", "1", "true", "on"].includes(text)) return "CLOSE";
  if (["open", "opened", "guard off", "door open", "unsafe", "0", "false", "off"].includes(text)) return "OPEN";

  return null;
}

function normalizeLockState(value, fallbackFromBool = null) {
  if (value === undefined || value === null || value === "") {
    if (fallbackFromBool === true) return "LOCK";
    if (fallbackFromBool === false) return "UNLOCK";
    return null;
  }

  if (typeof value === "boolean") return value ? "LOCK" : "UNLOCK";
  if (typeof value === "number") return value === 1 ? "LOCK" : value === 0 ? "UNLOCK" : null;

  const text = normalizeTextState(value);
  if (["lock", "locked", "interlock", "interlock ok", "healthy", "ok", "ready", "1", "true", "on"].includes(text)) return "LOCK";
  if (["unlock", "unlocked", "interlock fault", "fault", "diagnostic", "trip", "0", "false", "off"].includes(text)) return "UNLOCK";

  return null;
}

function parseMachineRunningFlag(sourceData) {
  const raw = firstDefined(
    sourceData.machineRunning,
    sourceData.machine_running,
    sourceData.isRunning,
    sourceData.running,
    sourceData.runState,
    sourceData.run_state,
    sourceData.machineStatus,
    sourceData.machine_status,
    sourceData.status,
    sourceData.overallStatus
  );

  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw > 0;

  const text = normalizeTextState(raw);
  if (["run", "running", "active", "production", "online", "on", "1", "true"].includes(text)) return true;
  if (["stop", "stopped", "idle", "off", "offline", "waiting", "ready", "0", "false"].includes(text)) return false;
  return null;
}

function manilaParts(date = new Date()) {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MINUTES * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function manilaDateKey(date = new Date()) {
  const p = manilaParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function dateKeyToParts(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return { year, month, day };
}

function addDaysToDateKey(dateKey, days) {
  const { year, month, day } = dateKeyToParts(dateKey);
  const utc = new Date(Date.UTC(year, month - 1, day + days, 0, 0, 0));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

function manilaLocalToUtc(dateKey, hhmm, dayOffset = 0) {
  const { year, month, day } = dateKeyToParts(dateKey);
  const [hour, minute] = String(hhmm).split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day + dayOffset, hour, minute, 0) - MANILA_OFFSET_MINUTES * 60 * 1000);
}

function normalizeShiftCode(value) {
  const text = String(value || "").trim().toUpperCase();
  if (["MORNING", "AM", "1", "06:00-10:00", "6AM-10AM", "6 AM - 10 AM"].includes(text)) return "MORNING";
  if (["AFTERNOON", "PM", "2", "14:00-18:00", "2PM-6PM", "2 PM - 6 PM"].includes(text)) return "AFTERNOON";
  if (["NIGHT", "NOC", "3", "22:00-02:00", "10PM-2AM", "10 PM - 2 AM"].includes(text)) return "NIGHT";
  return "";
}

function getVerificationWindow(shiftCode, now = new Date()) {
  const code = normalizeShiftCode(shiftCode);
  const config = SHIFT_WINDOWS[code];
  if (!config) return null;

  const currentParts = manilaParts(now);
  let shiftDate = manilaDateKey(now);

  // Night shift belongs to the previous date between 00:00 and 05:59 Manila time.
  if (code === "NIGHT" && currentParts.hour < 6) {
    shiftDate = addDaysToDateKey(shiftDate, -1);
  }

  const windowStart = manilaLocalToUtc(shiftDate, config.verifyStart, 0);
  const windowEnd = manilaLocalToUtc(shiftDate, config.verifyEnd, config.crossesMidnight ? 1 : 0);
  const currentTime = now.getTime();

  return {
    shift_code: code,
    shift_date: shiftDate,
    shift_label: config.shiftLabel,
    verification_label: config.label,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    has_started: currentTime >= windowStart.getTime(),
    has_ended: currentTime > windowEnd.getTime(),
    is_in_window: currentTime >= windowStart.getTime() && currentTime <= windowEnd.getTime(),
  };
}

function isMachineDataFresh(machineData = latestMachineData, now = new Date()) {
  if (!machineData?.lastUpdated) return false;
  const last = new Date(machineData.lastUpdated);
  if (Number.isNaN(last.getTime())) return false;
  const ageSeconds = (now.getTime() - last.getTime()) / 1000;
  return ageSeconds <= MACHINE_DATA_STALE_SECONDS;
}

function getMachineVerificationState(machineData = latestMachineData, now = new Date()) {
  const data = machineData?.data || {};
  const doors = Array.isArray(data.doors) ? data.doors : [];
  const fresh = isMachineDataFresh(machineData, now);

  if (!fresh) {
    return {
      required: false,
      reason: "NO_DATA",
      label: "Not Required - No HighByte Data",
      staleSeconds: MACHINE_DATA_STALE_SECONDS,
    };
  }

  const explicitRunning = data.machineRunning;
  if (explicitRunning === true) {
    return { required: true, reason: "RUNNING_SIGNAL", label: "Required - Machine Running" };
  }

  if (explicitRunning === false) {
    return { required: false, reason: "NOT_RUNNING_SIGNAL", label: "Not Required - Machine Not Running" };
  }

  if (!doors.length) {
    return { required: false, reason: "NO_POINTS", label: "Not Required - No Door Points" };
  }

  const hasOpenOrUnlocked = doors.some((door) => door.openClose === "OPEN" || door.lockState === "UNLOCK");
  const allClosedAndLocked = doors.every((door) => door.openClose === "CLOSE" && door.lockState === "LOCK");

  if (allClosedAndLocked && !hasOpenOrUnlocked) {
    return { required: false, reason: "ALL_CLOSED_LOCKED", label: "Not Required - All Closed/Locked" };
  }

  return { required: true, reason: "ACTIVE_POINTS", label: "Required - Active/Open/Unlocked Points" };
}

function getConfirmationStatus({ operator, now = new Date(), machineState = getMachineVerificationState(latestMachineData, now) }) {
  const window = getVerificationWindow(operator?.shift_code, now);

  if (!window) {
    return {
      status: "NO_SHIFT",
      label: "No Shift Assigned",
      machine_required: machineState.required,
      machine_reason: machineState.reason,
      window: null,
    };
  }

  if (!machineState.required) {
    return {
      status: "NOT_REQUIRED",
      label: machineState.label,
      machine_required: false,
      machine_reason: machineState.reason,
      window,
    };
  }

  if (window.is_in_window) {
    return {
      status: "VERIFIED",
      label: "Verified Within Window",
      machine_required: true,
      machine_reason: machineState.reason,
      window,
    };
  }

  if (!window.has_started) {
    return {
      status: "EARLY",
      label: "Early - Window Not Started",
      machine_required: true,
      machine_reason: machineState.reason,
      window,
    };
  }

  return {
    status: "LATE",
    label: "Late - Window Ended",
    machine_required: true,
    machine_reason: machineState.reason,
    window,
  };
}

function buildVerificationSummary(peopleRows, logRows, now = new Date()) {
  const machineState = getMachineVerificationState(latestMachineData, now);

  return peopleRows
    .filter((person) => person.is_active !== false)
    .map((person) => {
      const window = getVerificationWindow(person.shift_code, now);

      if (!window) {
        return {
          person_id: person.id,
          person_name: person.person_name,
          department: person.department,
          machine: person.machine,
          machine_name: person.machine_name,
          shift_code: person.shift_code || null,
          status: "NO_SHIFT",
          label: "No Shift Assigned",
          machine_required: machineState.required,
          machine_reason: machineState.reason,
        };
      }

      const matchingLog = logRows.find((log) => {
        return Number(log.person_id) === Number(person.id)
          && String(log.shift_code || "") === String(window.shift_code)
          && String(log.shift_date || "").slice(0, 10) === String(window.shift_date)
          && ["confirmed", "verified", "VERIFIED"].includes(String(log.confirmation_status || ""));
      });

      let status = "PENDING";
      let label = "Pending Check";

      if (!machineState.required) {
        status = "NOT_REQUIRED";
        label = machineState.label;
      } else if (matchingLog) {
        status = "VERIFIED";
        label = "Verified";
      } else if (!window.has_started) {
        status = "UPCOMING";
        label = "Upcoming";
      } else if (window.has_ended) {
        status = "MISSED";
        label = "Missed";
      }

      return {
        person_id: person.id,
        person_name: person.person_name,
        department: person.department,
        machine: person.machine,
        machine_name: person.machine_name,
        shift_code: window.shift_code,
        shift_date: window.shift_date,
        verification_label: window.verification_label,
        window_start: window.window_start,
        window_end: window.window_end,
        status,
        label,
        machine_required: machineState.required,
        machine_reason: machineState.reason,
        confirmed_at: matchingLog?.created_at || null,
      };
    });
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

  const inputDoors = normalizeDoors(sourceData.doors);
  const normalizedDoors = [];
  const flatTags = {};

  let openDoorCount = 0;
  let unlockCount = 0;

  for (const door of inputDoors) {
    const doorNoRaw = String(Number(door.doorNo || door.id || door.no || normalizedDoors.length + 1));
    const guardTag = door.doorTagName || door.guardTag || door.openCloseTagName || `SFI_Door${doorNoRaw}`;
    const diagnosticTag = door.diagnosticTagName || door.lockTagName || door.interlockTag || `I_Door${doorNoRaw}Diagnostic`;

    const rawOpenClose = firstDefined(
      door.openClose,
      door.open_close,
      door.openCloseState,
      door.openCloseValue,
      door.doorState,
      door.doorStatus,
      door.guardState,
      door.guardStatus,
      door.doorValue
    );

    const rawLock = firstDefined(
      door.lockState,
      door.lockStatus,
      door.lockValue,
      door.lock,
      door.interlockState,
      door.interlockStatus,
      door.healthyState,
      door.diagnosticState,
      door.diagnosticValue
    );

    // Backward compatibility:
    // old doorValue true = closed, false = open
    // old diagnosticValue true = healthy/locked, false = fault/unlocked
    const openClose = normalizeOpenCloseState(rawOpenClose, typeof door.doorValue === "boolean" ? door.doorValue : null) || "CLOSE";
    const lockState = normalizeLockState(rawLock, typeof door.diagnosticValue === "boolean" ? door.diagnosticValue : null) || "LOCK";

    const normalizedDoor = {
      ...door,
      doorNo: Number(doorNoRaw),
      doorTagName: guardTag,
      diagnosticTagName: diagnosticTag,
      openClose,
      lockState,
      doorValue: openClose === "CLOSE",
      diagnosticValue: lockState === "LOCK",
    };

    normalizedDoors.push(normalizedDoor);

    // Keep the old boolean tags so the existing frontend map still works.
    flatTags[guardTag] = openClose === "CLOSE";
    flatTags[diagnosticTag] = lockState === "LOCK";

    // Add direct text tags for the new UI wording.
    flatTags[`${guardTag}_OpenClose`] = openClose;
    flatTags[`${diagnosticTag}_LockState`] = lockState;

    if (openClose === "OPEN") openDoorCount++;
    if (lockState === "UNLOCK") unlockCount++;
  }

  const machineRunning = parseMachineRunningFlag(sourceData);
  let overallStatus = sourceData.overallStatus || sourceData.status || "READY";

  if (unlockCount > 0) {
    overallStatus = "UNLOCKED";
  } else if (openDoorCount > 0) {
    overallStatus = "OPEN";
  } else if (machineRunning === false) {
    overallStatus = "STOPPED";
  } else if (machineRunning === true) {
    overallStatus = "RUNNING";
  } else {
    overallStatus = "READY";
  }

  const temporaryData = {
    _name: sourceData._name,
    _model: sourceData._model,
    _timestamp: sourceData._timestamp,
    area: sourceData.area || "Dressings",
    machine: sourceData.machine || "Mespack Filler",
    doors: normalizedDoors,
    overallStatus,
    openDoorCount,
    unlockCount,
    diagnosticCount: unlockCount,
    machineRunning,
    ...flatTags,
  };

  const temporaryMachineData = {
    lastUpdated: new Date().toISOString(),
    data: temporaryData,
  };
  const machineState = getMachineVerificationState(temporaryMachineData, new Date());

  return {
    status: overallStatus,
    data: {
      ...temporaryData,
      verificationRequired: machineState.required,
      verificationReason: machineState.reason,
      verificationLabel: machineState.label,
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


async function upsertOperatorFace({ person_name, employee_id, department, role, machine, machine_name, shift_code, candidate }) {
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
        shift_code,
        face_api_id,
        face_api_object_id,
        face_img_name,
        face_app_namespace,
        face_hash,
        embedding_hash,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE)
      RETURNING *
    `,
    [
      person_name,
      employee_id || null,
      department || null,
      role || "operator",
      machine || null,
      machine_name || machine || null,
      normalizeShiftCode(shift_code),
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

async function insertConfirmationLog({ operator, machine, machine_name, candidate, verification }) {
  const window = verification?.window || null;
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
        shift_code,
        shift_date,
        verification_window_start,
        verification_window_end,
        machine_required,
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::timestamp, $11::timestamp, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
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
      verification?.window?.shift_code || normalizeShiftCode(operator.shift_code) || null,
      verification?.window?.shift_date || null,
      window?.window_start ? new Date(window.window_start) : null,
      window?.window_end ? new Date(window.window_end) : null,
      verification?.machine_required === true,
      candidate.face_api_id,
      candidate.face_api_object_id,
      candidate.face_img_name,
      candidate.distance,
      candidate.threshold,
      candidate.confidence,
      candidate.app_namespace || null,
      candidate.face_hash || null,
      candidate.embedding_hash || null,
      String(verification?.status || "confirmed").toLowerCase(),
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
      shift_code TEXT,
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
      shift_code TEXT,
      shift_date DATE,
      verification_window_start TIMESTAMP,
      verification_window_end TIMESTAMP,
      machine_required BOOLEAN DEFAULT TRUE,
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
    ["machine", "TEXT"], ["machine_name", "TEXT"], ["shift_code", "TEXT"], ["face_api_id", "INTEGER"],
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
    ["machine_name", "TEXT"], ["shift_code", "TEXT"], ["shift_date", "DATE"],
    ["verification_window_start", "TIMESTAMP"], ["verification_window_end", "TIMESTAMP"],
    ["machine_required", "BOOLEAN DEFAULT TRUE"], ["face_api_id", "INTEGER"], ["face_api_object_id", "TEXT"],
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

function currentMachineResponse() {
  const machineState = getMachineVerificationState(latestMachineData, new Date());
  return {
    ...latestMachineData,
    verificationRequired: machineState.required,
    verificationReason: machineState.reason,
    verificationLabel: machineState.label,
    data: {
      ...(latestMachineData.data || {}),
      verificationRequired: machineState.required,
      verificationReason: machineState.reason,
      verificationLabel: machineState.label,
    },
  };
}

app.get("/data", (req, res) => {
  res.json(currentMachineResponse());
});

app.get("/api/data", (req, res) => {
  res.json(currentMachineResponse());
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
    const shift_code = normalizeShiftCode(req.body.shift_code || req.body.shift);
    const image = req.body.image || req.body.img;

    if (!person_name || !department || !machine || !shift_code || !image) {
      return res.status(400).json({ error: "person_name, department, machine, shift_code, and image/img are required." });
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
      shift_code,
      shift_label: SHIFT_WINDOWS[shift_code]?.label || shift_code,
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
      shift_code,
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

    const verification = getConfirmationStatus({ operator, now: new Date() });

    const log = await insertConfirmationLog({
      operator,
      machine,
      machine_name: machine_name || machine,
      candidate,
      verification,
    });

    res.json({ ok: true, log, operator, candidate, verification, searchResponse });
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

    const verificationSummary = buildVerificationSummary(people.rows, logs.rows, new Date());
    const machineState = getMachineVerificationState(latestMachineData, new Date());

    res.json({
      ok: true,
      logs: logs.rows,
      people: people.rows,
      verificationSummary,
      machineState,
      shiftWindows: SHIFT_WINDOWS,
    });
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
    res.json({ ok: true, postgres: true, faceApi: FACE_API_BASE_URL, appNamespace: APP_NAMESPACE, strictNamespace: APP_NAMESPACE_STRICT, shiftWindows: SHIFT_WINDOWS, staleSeconds: MACHINE_DATA_STALE_SECONDS });
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
