
const express = require("express");
const cors = require("cors");
const mqtt = require("mqtt");
const crypto = require("crypto");
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

const FACE_API_BASE_URL = String(process.env.FACE_API_BASE_URL || process.env.AI_FACE_BASE_URL || "").replace(/\/$/, "");
const APP_NAMESPACE = process.env.APP_NAMESPACE || "machine_dashboard";
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim();
const FACE_UNREGISTER_PATH = process.env.FACE_UNREGISTER_PATH || "";

const POSTGRES_SCHEMA = process.env.POSTGRES_SCHEMA || "machine_monitoring";
const PEOPLE_TABLE = process.env.POSTGRES_PEOPLE_TABLE || "face_people";
const CONFIRMATIONS_TABLE = process.env.POSTGRES_CONFIRMATIONS_TABLE || "machine_check_confirmations";
const OPERATOR_REGISTRATIONS_TABLE = process.env.POSTGRES_OPERATOR_REGISTRATIONS_TABLE || "operator_shift_registrations";
const MACHINE_RECEIPTS_TABLE = process.env.POSTGRES_MACHINE_RECEIPTS_TABLE || "machine_data_receipts";
const MACHINES_TABLE = process.env.POSTGRES_MACHINES_TABLE || "machine_configurations";
const MACHINE_SOURCES_TABLE = process.env.POSTGRES_MACHINE_SOURCES_TABLE || "machine_data_sources";
const MACHINE_IMAGES_TABLE = process.env.POSTGRES_MACHINE_IMAGES_TABLE || "machine_images";
const MACHINE_SEGMENTS_TABLE = process.env.POSTGRES_MACHINE_SEGMENTS_TABLE || "machine_segments";
const MACHINE_POINTS_TABLE = process.env.POSTGRES_MACHINE_POINTS_TABLE || "machine_points";
const SESSION_LOGS_TABLE = process.env.POSTGRES_SESSION_LOGS_TABLE || "mespack_session_logs";
const FIXED_MACHINE_CANVAS_ASPECT = 2.1;
const MAX_MACHINE_IMAGE_BYTES = 12 * 1024 * 1024;

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
const operatorRegistrationsTable = tableName(OPERATOR_REGISTRATIONS_TABLE);
const machineReceiptsTable = tableName(MACHINE_RECEIPTS_TABLE);
const machinesTable = tableName(MACHINES_TABLE);
const machineSourcesTable = tableName(MACHINE_SOURCES_TABLE);
const machineImagesTable = tableName(MACHINE_IMAGES_TABLE);
const machineSegmentsTable = tableName(MACHINE_SEGMENTS_TABLE);
const machinePointsTable = tableName(MACHINE_POINTS_TABLE);
const sessionLogsTable = tableName(SESSION_LOGS_TABLE);

let mqttConnected = false;
let lastMessageAt = null;
let lastRawPayload = null;
let mqttClient = null;
let sourceTopicIndex = new Map();
const latestMachineDataById = new Map();
const faceDetectionSessions = new Map();
const FACE_DETECTION_TTL_MS = 2 * 60 * 1000;

let latestMachineData = {
  status: "WAITING",
  mqttConnected: false,
  topic: MQTT_TOPIC,
  lastUpdated: null,
  data: {},
};

latestMachineDataById.set("mespack", latestMachineData);

const DEFAULT_POINT_VALUE_RULES = {
  primary: [
    { value: "1", label: "Closed", severity: "safe", color: "#22c55e" },
    { value: "0", label: "Open", severity: "warning", color: "#f59e0b" },
  ],
  secondary: [
    { value: "1", label: "Locked", severity: "safe", color: "#22c55e" },
    { value: "0", label: "Unlocked", severity: "danger", color: "#ef4444" },
  ],
  fallback: { label: "Unknown", severity: "warning", color: "#f59e0b" },
};
const DEFAULT_POINT_VALUE_RULES_SQL = JSON.stringify(DEFAULT_POINT_VALUE_RULES).replace(/'/g, "''");

function normalizePointValueRules(value) {
  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  const source = parsed && typeof parsed === "object" ? parsed : DEFAULT_POINT_VALUE_RULES;
  const allowedSeverities = new Set(["safe", "warning", "danger", "neutral"]);
  const normalizeColor = (color, fallback) => /^#[0-9a-f]{6}$/i.test(String(color || ""))
    ? String(color).toLowerCase()
    : fallback;
  const normalizeRules = (rules) => (Array.isArray(rules) ? rules : [])
    .slice(0, 100)
    .map((rule) => ({
      value: String(rule?.value ?? "").trim(),
      label: String(rule?.label || "").trim(),
      severity: allowedSeverities.has(rule?.severity) ? rule.severity : "neutral",
      color: normalizeColor(rule?.color, "#64748b"),
    }))
    .filter((rule) => rule.value !== "" && rule.label !== "");
  const fallbackSource = source.fallback && typeof source.fallback === "object"
    ? source.fallback
    : DEFAULT_POINT_VALUE_RULES.fallback;

  return {
    primary: normalizeRules(source.primary),
    secondary: normalizeRules(source.secondary),
    fallback: {
      label: String(fallbackSource.label || "Unknown").trim() || "Unknown",
      severity: allowedSeverities.has(fallbackSource.severity) ? fallbackSource.severity : "warning",
      color: normalizeColor(fallbackSource.color, "#f59e0b"),
    },
  };
}


function normalizePointSourceFields(point) {
  const legacyRules = normalizePointValueRules(point?.value_rules);
  const explicitFields = Array.isArray(point?.source_fields) ? point.source_fields : [];

  const normalizedExplicit = explicitFields
    .slice(0, 50)
    .map((field, index) => {
      const fieldObject = field && typeof field === "object" && !Array.isArray(field)
        ? field
        : {};
      const sourceKey = String(
        typeof field === "string"
          ? field
          : fieldObject.source_key || fieldObject.key || ""
      ).trim();

      if (!sourceKey) return null;

      const fallbackRules = index === 1 ? legacyRules.secondary : legacyRules.primary;
      const normalizedRules = normalizePointValueRules({
        primary: Array.isArray(fieldObject.value_rules)
          ? fieldObject.value_rules
          : fallbackRules,
        secondary: [],
        fallback: fieldObject.fallback && typeof fieldObject.fallback === "object"
          ? fieldObject.fallback
          : legacyRules.fallback,
      });

      return {
        id: String(fieldObject.id || `field-${index + 1}`).trim() || `field-${index + 1}`,
        label: String(fieldObject.label || `Field ${index + 1}`).trim() || `Field ${index + 1}`,
        source_key: sourceKey,
        value_rules: normalizedRules.primary,
        fallback: normalizedRules.fallback,
      };
    })
    .filter(Boolean);

  if (normalizedExplicit.length) {
    return normalizedExplicit;
  }

  const legacyFields = [];
  const primaryKey = String(point?.source_key_primary || "").trim();
  const secondaryKey = String(point?.source_key_secondary || "").trim();

  if (primaryKey) {
    legacyFields.push({
      id: "field-1",
      label: "Field 1",
      source_key: primaryKey,
      value_rules: legacyRules.primary,
      fallback: legacyRules.fallback,
    });
  }

  if (secondaryKey) {
    legacyFields.push({
      id: "field-2",
      label: "Field 2",
      source_key: secondaryKey,
      value_rules: legacyRules.secondary,
      fallback: legacyRules.fallback,
    });
  }

  return legacyFields;
}

function requireAdmin(req, res) {
  if (!ADMIN_PASSWORD) {
    res.status(503).json({ ok: false, error: "Admin access is not configured." });
    return false;
  }
  const password = String(req.body?.password || req.get("x-admin-password") || "").trim();
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, error: "Invalid admin password." });
    return false;
  }
  return true;
}

function normalizeMachineId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.min(100, Math.max(0, number)) * 1000) / 1000;
}

function normalizePolygonPoints(value) {
  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((point) => {
      if (Array.isArray(point)) return [clampPercent(point[0]), clampPercent(point[1])];
      if (point && typeof point === "object") return [clampPercent(point.x), clampPercent(point.y)];
      return [null, null];
    })
    .filter(([x, y]) => x !== null && y !== null);
}

function polygonBoundingBox(points) {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.round((maxX - minX) * 1000) / 1000,
    height: Math.round((maxY - minY) * 1000) / 1000,
  };
}

function normalizeBase64Image(value, mimeHint = "image/png") {
  const text = String(value || "").trim();
  if (!text) return null;
  const match = text.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  const mimeType = match?.[1]?.toLowerCase() || String(mimeHint || "image/png").toLowerCase();
  const base64 = (match?.[2] || text).replace(/\s+/g, "");

  if (!/^image\/(png|jpeg|webp)$/i.test(mimeType)) {
    throw new Error("Machine image must be PNG, JPEG, or WebP.");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error("Machine image is not valid Base64 data.");
  }

  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_MACHINE_IMAGE_BYTES) {
    throw new Error("Machine image must be between 1 byte and 12 MB.");
  }

  return {
    base64,
    bytes,
    mimeType,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

function machineStateFor(machineId, topic = null) {
  if (!latestMachineDataById.has(machineId)) {
    latestMachineDataById.set(machineId, {
      status: "WAITING",
      mqttConnected,
      topic,
      lastUpdated: null,
      data: {},
    });
  }
  return latestMachineDataById.get(machineId);
}

function valueAtPath(value, pathValue) {
  const pathParts = String(pathValue || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  return pathParts.reduce((current, part) => current?.[part], value);
}

function configuredPayload(rawPayload, source) {
  let selected = rawPayload;
  const payloadRoot = String(source?.payload_root || "").trim();
  const sourcePath = String(source?.source_path || "").trim();
  if (payloadRoot && payloadRoot !== "$") {
    selected = valueAtPath(selected, payloadRoot);
  }
  if (sourcePath) {
    selected = valueAtPath(selected, sourcePath);
  }
  return selected === undefined ? rawPayload : selected;
}

function availableDataFields(value, prefix = "", output = [], depth = 0) {
  if (output.length >= 500 || depth > 7 || value === undefined) return output;

  if (value === null || typeof value !== "object") {
    if (!prefix) return output;
    const sample = typeof value === "string" ? value.slice(0, 160) : value;
    output.push({
      key: prefix,
      type: value === null ? "null" : typeof value,
      sample,
      live: true,
    });
    return output;
  }

  if (Array.isArray(value)) {
    value.slice(0, 80).forEach((item, index) => {
      availableDataFields(item, prefix ? `${prefix}.${index}` : String(index), output, depth + 1);
    });
    return output;
  }

  Object.entries(value).forEach(([key, item]) => {
    if (output.length >= 500) return;
    availableDataFields(item, prefix ? `${prefix}.${key}` : key, output, depth + 1);
  });
  return output;
}

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

function getShiftWindowForDate(shiftCode, shiftDate) {
  const code = normalizeShiftCode(shiftCode);
  const config = SHIFT_WINDOWS[code];
  if (!config || !/^\d{4}-\d{2}-\d{2}$/.test(String(shiftDate || ""))) return null;

  const windowStart = manilaLocalToUtc(shiftDate, config.verifyStart, 0);
  const windowEnd = manilaLocalToUtc(shiftDate, config.verifyEnd, config.crossesMidnight ? 1 : 0);

  return {
    shift_code: code,
    shift_date: shiftDate,
    shift_label: config.shiftLabel,
    verification_label: config.label,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
  };
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

  const baseWindow = getShiftWindowForDate(code, shiftDate);
  const windowStart = new Date(baseWindow.window_start);
  const windowEnd = new Date(baseWindow.window_end);
  const currentTime = now.getTime();

  return {
    ...baseWindow,
    has_started: currentTime >= windowStart.getTime(),
    has_ended: currentTime > windowEnd.getTime(),
    is_in_window: currentTime >= windowStart.getTime() && currentTime <= windowEnd.getTime(),
  };
}

function getCurrentVerificationWindow(now = new Date()) {
  return Object.keys(SHIFT_WINDOWS)
    .map((shiftCode) => getVerificationWindow(shiftCode, now))
    .find((window) => window?.is_in_window) || null;
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
  const fresh = isMachineDataFresh(machineData, now);

  if (!fresh) {
    return {
      required: false,
      reason: "NO_DATA",
      label: "Machine off - no data received",
      staleSeconds: MACHINE_DATA_STALE_SECONDS,
    };
  }

  const explicitRunning = data.machineRunning;
  if (explicitRunning === true) {
    return { required: true, reason: "RUNNING_SIGNAL", label: "Required - Machine Running" };
  }

  if (explicitRunning === false) {
    return { required: false, reason: "NOT_RUNNING_SIGNAL", label: "Machine off - not running" };
  }

  // Any fresh HighByte/MQTT payload means the configured machine is active.
  // Point values describe condition; they do not decide whether confirmation is due.
  return { required: true, reason: explicitRunning === true ? "RUNNING_SIGNAL" : "FRESH_DATA", label: "Confirmation required" };
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
    const openClose = normalizeOpenCloseState(rawOpenClose, typeof door.doorValue === "boolean" ? door.doorValue : null);
    const lockState = normalizeLockState(rawLock, typeof door.diagnosticValue === "boolean" ? door.diagnosticValue : null);

    const normalizedDoor = {
      ...door,
      doorNo: Number(doorNoRaw),
      doorTagName: guardTag,
      diagnosticTagName: diagnosticTag,
      openClose,
      lockState,
      doorValue: openClose === null ? null : openClose === "CLOSE",
      diagnosticValue: lockState === null ? null : lockState === "LOCK",
    };

    normalizedDoors.push(normalizedDoor);

    // Keep the old boolean tags so the existing frontend map still works.
    flatTags[guardTag] = openClose === null ? null : openClose === "CLOSE";
    flatTags[diagnosticTag] = lockState === null ? null : lockState === "LOCK";

    // Add direct text tags for the new UI wording.
    flatTags[`${guardTag}_OpenClose`] = openClose || "No Data";
    flatTags[`${diagnosticTag}_LockState`] = lockState || "No Data";

    if (openClose === "OPEN") openDoorCount++;
    if (lockState === "UNLOCK") unlockCount++;
  }

  const machineRunning = parseMachineRunningFlag(sourceData);
  let overallStatus = sourceData.overallStatus || sourceData.status || "NO_DATA";

  if (unlockCount > 0) {
    overallStatus = "UNLOCKED";
  } else if (openDoorCount > 0) {
    overallStatus = "OPEN";
  } else if (machineRunning === false) {
    overallStatus = "STOPPED";
  } else if (machineRunning === true) {
    overallStatus = "RUNNING";
  } else if (!sourceData.overallStatus && !sourceData.status) {
    overallStatus = "NO_DATA";
  }

  const temporaryData = {
    ...sourceData,
    _name: sourceData._name,
    _model: sourceData._model,
    _timestamp: sourceData._timestamp,
    area: sourceData.area ?? null,
    machine: sourceData.machine ?? null,
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
  if (!FACE_API_BASE_URL) {
    const error = new Error("Face recognition is not configured.");
    error.statusCode = 503;
    throw error;
  }
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

  const existing = await pgPool.query(
    `
      SELECT id
      FROM ${peopleTable}
      WHERE ($1::integer IS NOT NULL AND face_api_id = $1::integer)
         OR ($2::text IS NOT NULL AND face_img_name = $2::text)
      ORDER BY id DESC
      LIMIT 1
    `,
    [faceApiId, faceImgName]
  );

  if (existing.rows[0]) {
    const updated = await pgPool.query(
      `
        UPDATE ${peopleTable}
        SET person_name = $2,
            employee_id = $3,
            department = $4,
            role = $5,
            machine = $6,
            machine_name = $7,
            shift_code = $8,
            face_api_id = $9,
            face_api_object_id = $10,
            face_img_name = $11,
            face_app_namespace = $12,
            face_hash = $13,
            embedding_hash = $14,
            is_active = TRUE
        WHERE id = $1
        RETURNING *
      `,
      [
        existing.rows[0].id,
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
    return updated.rows[0];
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

async function saveShiftRegistration({ operator, machine, machine_name, shift_code, now = new Date() }) {
  const machineId = normalizeMachineId(machine);
  const window = getVerificationWindow(shift_code, now);
  if (!window) {
    const error = new Error("Select one of the three configured shifts.");
    error.statusCode = 400;
    throw error;
  }
  if (!window.is_in_window) {
    const error = new Error(`Registration for ${window.shift_label} is open only from ${window.verification_label}.`);
    error.statusCode = 409;
    throw error;
  }

  const machineResult = await pgPool.query(
    `SELECT id, name FROM ${machinesTable} WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [machineId]
  );
  if (!machineResult.rows[0]) {
    const error = new Error("The selected machine is not active or does not exist.");
    error.statusCode = 404;
    throw error;
  }

  const saved = await pgPool.query(
    `
      INSERT INTO ${operatorRegistrationsTable} (
        person_id, person_name, machine_id, machine_name, shift_code, shift_date,
        verification_window_start, verification_window_end, is_active, registered_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::date, $7::timestamptz, $8::timestamptz, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (machine_id, shift_date, shift_code) DO UPDATE SET
        person_id = EXCLUDED.person_id,
        person_name = EXCLUDED.person_name,
        machine_name = EXCLUDED.machine_name,
        verification_window_start = EXCLUDED.verification_window_start,
        verification_window_end = EXCLUDED.verification_window_end,
        is_active = TRUE,
        registered_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `,
    [
      operator.id,
      operator.person_name,
      machineId,
      machine_name || machineResult.rows[0].name,
      window.shift_code,
      window.shift_date,
      window.window_start,
      window.window_end,
    ]
  );

  return { registration: saved.rows[0], window };
}

async function findCurrentRegistration({ personId, machine, now = new Date() }) {
  const window = getCurrentVerificationWindow(now);
  if (!window) return { registration: null, window: null };

  const found = await pgPool.query(
    `
      SELECT r.*, p.employee_id, p.department, p.role
      FROM ${operatorRegistrationsTable} r
      JOIN ${peopleTable} p ON p.id = r.person_id
      WHERE r.person_id = $1
        AND r.machine_id = $2
        AND r.shift_code = $3
        AND r.shift_date = $4::date
        AND r.is_active = TRUE
        AND p.is_active = TRUE
      LIMIT 1
    `,
    [personId, normalizeMachineId(machine), window.shift_code, window.shift_date]
  );

  return { registration: found.rows[0] || null, window };
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

async function insertConfirmationLog({ operator, registration, machine, machine_name, candidate, verification }) {
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
        confirmation_status,
        registration_id,
        machine_activity_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::timestamp, $11::timestamp, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      ON CONFLICT (registration_id) WHERE registration_id IS NOT NULL AND confirmation_status = 'confirmed'
      DO UPDATE SET created_at = CURRENT_TIMESTAMP,
                    face_distance = EXCLUDED.face_distance,
                    face_threshold = EXCLUDED.face_threshold,
                    face_confidence = EXCLUDED.face_confidence,
                    machine_activity_reason = EXCLUDED.machine_activity_reason
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
      registration?.id || null,
      verification?.machine_reason || null,
    ]
  );

  return saved.rows[0];
}

async function recordMachineReceipt(machineId, topic, machineRunning, receivedAt = new Date()) {
  await pgPool.query(
    `
      INSERT INTO ${machineReceiptsTable} (
        machine_id, receipt_minute, source_topic, machine_running, message_count, first_received_at, last_received_at
      )
      VALUES ($1, date_trunc('minute', $2::timestamptz), $3, $4::boolean, 1, $2::timestamptz, $2::timestamptz)
      ON CONFLICT (machine_id, receipt_minute) DO UPDATE SET
        source_topic = EXCLUDED.source_topic,
        machine_running = EXCLUDED.machine_running,
        message_count = ${machineReceiptsTable}.message_count + 1,
        last_received_at = GREATEST(${machineReceiptsTable}.last_received_at, EXCLUDED.last_received_at)
    `,
    [normalizeMachineId(machineId), receivedAt.toISOString(), topic || null, typeof machineRunning === "boolean" ? machineRunning : null]
  );
}

function normalizeDateRange(fromValue, toValue, now = new Date()) {
  const today = manilaDateKey(now);
  const fallbackFrom = addDaysToDateKey(today, -7);
  const fallbackTo = addDaysToDateKey(today, 2);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const from = datePattern.test(String(fromValue || "")) ? String(fromValue) : fallbackFrom;
  const to = datePattern.test(String(toValue || "")) ? String(toValue) : fallbackTo;
  const orderedFrom = from <= to ? from : to;
  const orderedTo = from <= to ? to : from;
  const dates = [];
  let cursor = orderedFrom;
  while (cursor <= orderedTo && dates.length < 62) {
    dates.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }
  return { from: dates[0], to: dates[dates.length - 1], dates };
}

function buildConfirmationMatrix({ registrations, confirmations, receipts, dates, now = new Date() }) {
  const nowMs = now.getTime();
  const today = manilaDateKey(now);

  return dates.map((date) => {
    const shifts = {};
    for (const shiftCode of Object.keys(SHIFT_WINDOWS)) {
      const window = getShiftWindowForDate(shiftCode, date);
      const windowStartMs = new Date(window.window_start).getTime();
      const isFuture = date > today || nowMs < windowStartMs;
      const assignments = registrations.filter((registration) => (
        String(registration.shift_date).slice(0, 10) === date
        && registration.shift_code === shiftCode
        && registration.is_active !== false
      ));

      if (!assignments.length) {
        shifts[shiftCode] = { state: isFuture ? "FUTURE" : "NO_DATA", entries: [] };
        continue;
      }

      const entries = assignments.map((registration) => {
        if (isFuture) {
          return {
            registration_id: registration.id,
            person_name: registration.person_name,
            machine_id: registration.machine_id,
            machine_name: registration.machine_name,
            state: "FUTURE",
            confirmed_at: null,
          };
        }

        const matchingConfirmation = confirmations.find((confirmation) => (
          Number(confirmation.registration_id) === Number(registration.id)
          || (
            !confirmation.registration_id
            && Number(confirmation.person_id) === Number(registration.person_id)
            && String(confirmation.machine || "") === String(registration.machine_id)
            && String(confirmation.shift_code || "") === shiftCode
            && String(confirmation.shift_date || "").slice(0, 10) === date
          )
        ));

        const machineHadData = receipts.some((receipt) => (
          String(receipt.machine_id) === String(registration.machine_id)
          && receipt.machine_running !== false
          && new Date(receipt.last_received_at).getTime() >= new Date(registration.verification_window_start).getTime()
          && new Date(receipt.first_received_at).getTime() <= new Date(registration.verification_window_end).getTime()
        ));

        let state = "MISSED";
        if (matchingConfirmation) state = "CONFIRMED";
        else if (!machineHadData) state = "MACHINE_OFF";

        return {
          registration_id: registration.id,
          person_name: registration.person_name,
          machine_id: registration.machine_id,
          machine_name: registration.machine_name,
          state,
          confirmed_at: matchingConfirmation?.created_at || null,
        };
      });

      shifts[shiftCode] = { state: "ASSIGNED", entries };
    }

    return { date, is_future: date > today, shifts };
  });
}

async function loadOperatorOverview({ date_from, date_to, machine } = {}) {
  const range = normalizeDateRange(date_from, date_to, new Date());
  const machineId = machine ? normalizeMachineId(machine) : null;
  const broadStart = manilaLocalToUtc(range.from, "00:00", 0).toISOString();
  const broadEnd = manilaLocalToUtc(addDaysToDateKey(range.to, 1), "06:00", 0).toISOString();

  const [registrationsResult, confirmationsResult, receiptsResult] = await Promise.all([
    pgPool.query(
      `
        SELECT *
        FROM ${operatorRegistrationsTable}
        WHERE shift_date BETWEEN $1::date AND $2::date
          AND ($3::text IS NULL OR machine_id = $3::text)
        ORDER BY shift_date DESC, shift_code, machine_name, person_name
      `,
      [range.from, range.to, machineId]
    ),
    pgPool.query(
      `
        SELECT *
        FROM ${confirmationsTable}
        WHERE shift_date BETWEEN $1::date AND $2::date
          AND confirmation_status IN ('confirmed', 'verified')
          AND ($3::text IS NULL OR machine = $3::text)
        ORDER BY created_at DESC
      `,
      [range.from, range.to, machineId]
    ),
    pgPool.query(
      `
        SELECT *
        FROM ${machineReceiptsTable}
        WHERE last_received_at >= $1::timestamptz
          AND first_received_at <= $2::timestamptz
          AND ($3::text IS NULL OR machine_id = $3::text)
        ORDER BY last_received_at DESC
      `,
      [broadStart, broadEnd, machineId]
    ),
  ]);

  const safeRegistrations = registrationsResult.rows.map((registration) => ({
    id: registration.id,
    person_name: registration.person_name,
    machine_id: registration.machine_id,
    machine_name: registration.machine_name,
    shift_code: registration.shift_code,
    shift_date: registration.shift_date,
    is_active: registration.is_active,
    registered_at: registration.registered_at,
  }));

  return {
    range,
    registrations: safeRegistrations,
    matrix: buildConfirmationMatrix({
      registrations: registrationsResult.rows,
      confirmations: confirmationsResult.rows,
      receipts: receiptsResult.rows,
      dates: range.dates,
      now: new Date(),
    }),
  };
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

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${operatorRegistrationsTable} (
      id BIGSERIAL PRIMARY KEY,
      person_id INTEGER NOT NULL REFERENCES ${peopleTable}(id),
      person_name TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      machine_name TEXT NOT NULL,
      shift_code TEXT NOT NULL,
      shift_date DATE NOT NULL,
      verification_window_start TIMESTAMPTZ NOT NULL,
      verification_window_end TIMESTAMPTZ NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (machine_id, shift_date, shift_code)
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${machineReceiptsTable} (
      machine_id TEXT NOT NULL,
      receipt_minute TIMESTAMPTZ NOT NULL,
      source_topic TEXT,
      machine_running BOOLEAN,
      message_count INTEGER NOT NULL DEFAULT 1,
      first_received_at TIMESTAMPTZ NOT NULL,
      last_received_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (machine_id, receipt_minute)
    )
  `);

  await pgPool.query(`ALTER TABLE ${machineReceiptsTable} ADD COLUMN IF NOT EXISTS machine_running BOOLEAN`);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${sessionLogsTable} (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      access_role TEXT NOT NULL DEFAULT 'temporary',
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${machinesTable} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      api_url TEXT NOT NULL DEFAULT '/api/data',
      mqtt_topic TEXT,
      template_id TEXT NOT NULL DEFAULT 'mespack',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      config_revision INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      updated_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const machineColumns = [
    ["description", "TEXT"],
    ["config_revision", "INTEGER NOT NULL DEFAULT 1"],
    ["created_by", "TEXT"],
    ["updated_by", "TEXT"],
  ];
  for (const [column, type] of machineColumns) {
    await pgPool.query(`ALTER TABLE ${machinesTable} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
  }

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${machineSourcesTable} (
      machine_id TEXT PRIMARY KEY REFERENCES ${machinesTable}(id) ON DELETE CASCADE,
      source_system TEXT NOT NULL DEFAULT 'HighByte',
      transport TEXT NOT NULL DEFAULT 'MQTT',
      source_endpoint TEXT,
      source_topic TEXT,
      source_path TEXT,
      destination_type TEXT NOT NULL DEFAULT 'Dashboard API',
      destination_key TEXT NOT NULL,
      payload_root TEXT DEFAULT 'data',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${machineImagesTable} (
      machine_id TEXT PRIMARY KEY REFERENCES ${machinesTable}(id) ON DELETE CASCADE,
      image_base64 TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/png',
      original_width INTEGER,
      original_height INTEGER,
      canvas_aspect_ratio NUMERIC(8,4) NOT NULL DEFAULT ${FIXED_MACHINE_CANVAS_ASPECT},
      sha256 TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${machineSegmentsTable} (
      machine_id TEXT NOT NULL REFERENCES ${machinesTable}(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      area TEXT,
      polygon_points JSONB NOT NULL,
      bounding_box JSONB NOT NULL,
      label_x NUMERIC(7,3) NOT NULL DEFAULT 50,
      label_y NUMERIC(7,3) NOT NULL DEFAULT 50,
      zoom_scale NUMERIC(7,3) NOT NULL DEFAULT 2,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (machine_id, id)
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${machinePointsTable} (
      machine_id TEXT NOT NULL REFERENCES ${machinesTable}(id) ON DELETE CASCADE,
      point_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      area TEXT,
      segment_id TEXT,
      source_key_primary TEXT NOT NULL,
      source_key_secondary TEXT,
      source_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      status_mode TEXT NOT NULL DEFAULT 'mapped_values',
      safe_config JSONB NOT NULL DEFAULT '{"primary":"CLOSE","secondary":"LOCK"}'::jsonb,
      value_rules JSONB NOT NULL DEFAULT '${DEFAULT_POINT_VALUE_RULES_SQL}'::jsonb,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (machine_id, point_id)
    )
  `);

  await pgPool.query(`
    ALTER TABLE ${machinePointsTable}
      ADD COLUMN IF NOT EXISTS source_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS value_rules JSONB NOT NULL DEFAULT '${DEFAULT_POINT_VALUE_RULES_SQL}'::jsonb
  `);

  // No startup sample machine, image, segment, or point data.
  // Real configuration is created through Admin. Empty systems remain No Data.

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
    ["confirmation_status", "TEXT DEFAULT 'confirmed'"], ["registration_id", "BIGINT"],
    ["machine_activity_reason", "TEXT"], ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"]
  ];
  for (const [col, typ] of confirmationColumns) {
    await pgPool.query(`ALTER TABLE ${confirmationsTable} ADD COLUMN IF NOT EXISTS ${col} ${typ}`);
  }

  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_operator_registrations_date_shift
      ON ${operatorRegistrationsTable} (shift_date, shift_code, machine_id)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_machine_receipts_window
      ON ${machineReceiptsTable} (machine_id, last_received_at)
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_mespack_session_logs_ended
      ON ${sessionLogsTable} (ended_at DESC)
  `);
  await pgPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_confirmations_registration_once
      ON ${confirmationsTable} (registration_id)
      WHERE registration_id IS NOT NULL AND confirmation_status = 'confirmed'
  `);
}

async function loadMachineConfigurations({ includeInactive = true } = {}) {
  const machineResult = await pgPool.query(
    `
      SELECT id, name, description, api_url, mqtt_topic, template_id, is_active,
             config_revision, created_by, updated_by, created_at, updated_at
      FROM ${machinesTable}
      ${includeInactive ? "" : "WHERE is_active = TRUE"}
      ORDER BY CASE WHEN id = 'mespack' THEN 0 ELSE 1 END, name ASC
    `
  );

  if (!machineResult.rows.length) return [];
  const machineIds = machineResult.rows.map((row) => row.id);
  const [sources, images, segments, points] = await Promise.all([
    pgPool.query(`SELECT * FROM ${machineSourcesTable} WHERE machine_id = ANY($1::text[])`, [machineIds]),
    pgPool.query(
      `
        SELECT machine_id, mime_type, original_width, original_height,
               canvas_aspect_ratio, sha256, updated_at
        FROM ${machineImagesTable}
        WHERE machine_id = ANY($1::text[])
      `,
      [machineIds]
    ),
    pgPool.query(
      `
        SELECT machine_id, id, name, area, polygon_points, bounding_box,
               label_x, label_y, zoom_scale, display_order, is_active
        FROM ${machineSegmentsTable}
        WHERE machine_id = ANY($1::text[])
        ORDER BY machine_id, display_order, id
      `,
      [machineIds]
    ),
    pgPool.query(
      `
        SELECT machine_id, point_id, name, area, segment_id, source_key_primary,
               source_key_secondary, source_fields, status_mode, safe_config, value_rules, display_order, is_active
        FROM ${machinePointsTable}
        WHERE machine_id = ANY($1::text[])
        ORDER BY machine_id, display_order, point_id
      `,
      [machineIds]
    ),
  ]);

  const sourceByMachine = new Map(sources.rows.map((row) => [row.machine_id, row]));
  const imageByMachine = new Map(images.rows.map((row) => [row.machine_id, row]));

  return machineResult.rows.map((machine) => {
    const machineSegments = segments.rows
      .filter((row) => row.machine_id === machine.id)
      .map((row) => ({
        ...row,
        label_x: Number(row.label_x),
        label_y: Number(row.label_y),
        zoom_scale: Number(row.zoom_scale),
        point_ids: points.rows
          .filter((point) => point.machine_id === machine.id && point.segment_id === row.id)
          .map((point) => point.point_id),
      }));
    const machinePoints = points.rows
      .filter((row) => row.machine_id === machine.id)
      .map((row) => ({
        ...row,
        source_fields: normalizePointSourceFields(row),
      }));
    const image = imageByMachine.get(machine.id) || null;
    const source = sourceByMachine.get(machine.id) || null;

    return {
      ...machine,
      api_url: machine.api_url || `/api/machines/${machine.id}/data`,
      mqtt_topic: source?.source_topic || machine.mqtt_topic || null,
      data_source: source,
      image: image
        ? {
            ...image,
            canvas_aspect_ratio: Number(image.canvas_aspect_ratio || FIXED_MACHINE_CANVAS_ASPECT),
            url: `/api/machines/${encodeURIComponent(machine.id)}/image?v=${encodeURIComponent(image.sha256.slice(0, 12))}`,
          }
        : null,
      segments: machineSegments,
      points: machinePoints,
    };
  });
}

async function refreshSourceTopicIndex() {
  const previousTopics = [...sourceTopicIndex.keys()];
  const sources = await pgPool.query(
    `
      SELECT s.machine_id, s.source_topic, s.source_path, s.payload_root
      FROM ${machineSourcesTable} s
      JOIN ${machinesTable} m ON m.id = s.machine_id
      WHERE s.is_active = TRUE AND m.is_active = TRUE AND NULLIF(s.source_topic, '') IS NOT NULL
    `
  );

  const nextIndex = new Map();
  for (const source of sources.rows) {
    const topic = String(source.source_topic).trim();
    if (!nextIndex.has(topic)) nextIndex.set(topic, []);
    nextIndex.get(topic).push(source);
    machineStateFor(source.machine_id, topic);
  }
  sourceTopicIndex = nextIndex;

  if (mqttClient?.connected) {
    const nextTopics = [...nextIndex.keys()];
    const removedTopics = previousTopics.filter((topic) => !nextIndex.has(topic));
    if (removedTopics.length) {
      mqttClient.unsubscribe(removedTopics, (error) => {
        if (error) logError("❌ MQTT stale-topic unsubscribe failed", error);
      });
    }
    if (!nextTopics.length) return;
    mqttClient.subscribe(nextTopics, (error) => {
      if (error) logError("❌ MQTT dynamic subscription failed", error);
      else logDebug(`✅ Subscribed to ${nextIndex.size} configured machine topic(s)`);
    });
  }
}

async function saveMachineConfiguration(machineId, body) {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");

    const current = await client.query(
      `SELECT config_revision FROM ${machinesTable} WHERE id = $1 FOR UPDATE`,
      [machineId]
    );
    if (!current.rowCount) {
      const notFound = new Error("Machine configuration not found.");
      notFound.statusCode = 404;
      throw notFound;
    }

    const expectedRevision = body.config_revision === undefined ? null : Number(body.config_revision);
    if (Number.isInteger(expectedRevision) && expectedRevision !== current.rows[0].config_revision) {
      const conflict = new Error("This machine was changed by another admin. Refresh before saving again.");
      conflict.statusCode = 409;
      throw conflict;
    }

    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim() || null;
    const isActive = typeof body.is_active === "boolean" ? body.is_active : true;
    if (!name) {
      const invalid = new Error("Machine name is required.");
      invalid.statusCode = 400;
      throw invalid;
    }

    await client.query(
      `
        UPDATE ${machinesTable}
        SET name = $2,
            description = $3,
            api_url = $4,
            mqtt_topic = $5,
            is_active = $6,
            config_revision = config_revision + 1,
            updated_by = 'admin',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [
        machineId,
        name,
        description,
        `/api/machines/${machineId}/data`,
        String(body.data_source?.source_topic || "").trim() || null,
        isActive,
      ]
    );

    const source = body.data_source || {};
    await client.query(
      `
        INSERT INTO ${machineSourcesTable} (
          machine_id, source_system, transport, source_endpoint, source_topic,
          source_path, destination_type, destination_key, payload_root, metadata,
          is_active, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, CURRENT_TIMESTAMP)
        ON CONFLICT (machine_id) DO UPDATE SET
          source_system = EXCLUDED.source_system,
          transport = EXCLUDED.transport,
          source_endpoint = EXCLUDED.source_endpoint,
          source_topic = EXCLUDED.source_topic,
          source_path = EXCLUDED.source_path,
          destination_type = EXCLUDED.destination_type,
          destination_key = EXCLUDED.destination_key,
          payload_root = EXCLUDED.payload_root,
          metadata = EXCLUDED.metadata,
          is_active = EXCLUDED.is_active,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        machineId,
        String(source.source_system || "HighByte").trim(),
        String(source.transport || "MQTT").trim(),
        String(source.source_endpoint || "").trim() || null,
        String(source.source_topic || "").trim() || null,
        String(source.source_path || "").trim() || null,
        String(source.destination_type || "Dashboard API").trim(),
        `/api/machines/${machineId}/data`,
        String(source.payload_root || "data").trim() || "data",
        JSON.stringify(source.metadata && typeof source.metadata === "object" ? source.metadata : {}),
        source.is_active !== false,
      ]
    );

    if (body.image_base64) {
      const image = normalizeBase64Image(body.image_base64, body.image_mime_type);
      const width = Number.isInteger(Number(body.image_width)) ? Number(body.image_width) : null;
      const height = Number.isInteger(Number(body.image_height)) ? Number(body.image_height) : null;
      await client.query(
        `
          INSERT INTO ${machineImagesTable} (
            machine_id, image_base64, mime_type, original_width, original_height,
            canvas_aspect_ratio, sha256, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          ON CONFLICT (machine_id) DO UPDATE SET
            image_base64 = EXCLUDED.image_base64,
            mime_type = EXCLUDED.mime_type,
            original_width = EXCLUDED.original_width,
            original_height = EXCLUDED.original_height,
            canvas_aspect_ratio = EXCLUDED.canvas_aspect_ratio,
            sha256 = EXCLUDED.sha256,
            updated_at = CURRENT_TIMESTAMP
        `,
        [machineId, image.base64, image.mimeType, width, height, FIXED_MACHINE_CANVAS_ASPECT, image.sha256]
      );
    }

    if (Array.isArray(body.segments)) {
      const segmentIds = [];
      for (const [index, rawSegment] of body.segments.entries()) {
        const id = normalizeMachineId(rawSegment.id || rawSegment.name);
        const nameValue = String(rawSegment.name || "").trim();
        const polygonPoints = normalizePolygonPoints(rawSegment.polygon_points);
        if (!id || !nameValue || polygonPoints.length < 3) {
          const invalid = new Error(`Segment ${index + 1} needs a name and at least three clicked points.`);
          invalid.statusCode = 400;
          throw invalid;
        }
        segmentIds.push(id);
        const bounds = polygonBoundingBox(polygonPoints);
        const defaultLabelX = bounds.x + bounds.width / 2;
        const defaultLabelY = bounds.y + bounds.height / 2;
        await client.query(
          `
            INSERT INTO ${machineSegmentsTable} (
              machine_id, id, name, area, polygon_points, bounding_box,
              label_x, label_y, zoom_scale, display_order, is_active, updated_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
            ON CONFLICT (machine_id, id) DO UPDATE SET
              name = EXCLUDED.name,
              area = EXCLUDED.area,
              polygon_points = EXCLUDED.polygon_points,
              bounding_box = EXCLUDED.bounding_box,
              label_x = EXCLUDED.label_x,
              label_y = EXCLUDED.label_y,
              zoom_scale = EXCLUDED.zoom_scale,
              display_order = EXCLUDED.display_order,
              is_active = EXCLUDED.is_active,
              updated_at = CURRENT_TIMESTAMP
          `,
          [
            machineId,
            id,
            nameValue,
            String(rawSegment.area || nameValue).trim(),
            JSON.stringify(polygonPoints),
            JSON.stringify(bounds),
            clampPercent(rawSegment.label_x) ?? clampPercent(defaultLabelX),
            clampPercent(rawSegment.label_y) ?? clampPercent(defaultLabelY),
            Math.min(5, Math.max(1, Number(rawSegment.zoom_scale) || 2)),
            index,
            rawSegment.is_active !== false,
          ]
        );
      }

      if (new Set(segmentIds).size !== segmentIds.length) {
        const invalid = new Error("Segment IDs must be unique within a machine.");
        invalid.statusCode = 400;
        throw invalid;
      }

      await client.query(
        `DELETE FROM ${machineSegmentsTable} WHERE machine_id = $1 AND NOT (id = ANY($2::text[]))`,
        [machineId, segmentIds]
      );

      for (const segment of body.segments) {
        const segmentId = normalizeMachineId(segment.id || segment.name);
        const pointIds = Array.isArray(segment.point_ids)
          ? segment.point_ids.map(Number).filter(Number.isInteger)
          : [];
        if (pointIds.length) {
          await client.query(
            `UPDATE ${machinePointsTable} SET segment_id = $2 WHERE machine_id = $1 AND point_id = ANY($3::integer[])`,
            [machineId, segmentId, pointIds]
          );
        }
      }
    }

    if (Array.isArray(body.points)) {
      const configuredPointIds = body.points.map((point) => Number(point.point_id));
      if (new Set(configuredPointIds).size !== configuredPointIds.length) {
        const invalid = new Error("Point IDs must be unique within a machine.");
        invalid.statusCode = 400;
        throw invalid;
      }
      for (const [index, rawPoint] of body.points.entries()) {
        const pointId = Number(rawPoint.point_id);
        const pointName = String(rawPoint.name || "").trim();

        const sourceFields = normalizePointSourceFields(rawPoint);
        const primaryKey = sourceFields[0]?.source_key || "";
        const secondaryKey = sourceFields[1]?.source_key || null;

        if (!Number.isInteger(pointId) || !pointName || !primaryKey) {
          const invalid = new Error(`Point mapping ${index + 1} needs an integer ID, name, and at least one data field.`);
          invalid.statusCode = 400;
          throw invalid;
        }

        await client.query(
          `
            INSERT INTO ${machinePointsTable} (
              machine_id, point_id, name, area, segment_id, source_key_primary,
              source_key_secondary, source_fields, status_mode, safe_config,
              value_rules, display_order, is_active, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9,
              $10::jsonb, $11::jsonb, $12, $13, CURRENT_TIMESTAMP
            )
            ON CONFLICT (machine_id, point_id) DO UPDATE SET
              name = EXCLUDED.name,
              area = EXCLUDED.area,
              segment_id = EXCLUDED.segment_id,
              source_key_primary = EXCLUDED.source_key_primary,
              source_key_secondary = EXCLUDED.source_key_secondary,
              source_fields = EXCLUDED.source_fields,
              status_mode = EXCLUDED.status_mode,
              safe_config = EXCLUDED.safe_config,
              value_rules = EXCLUDED.value_rules,
              display_order = EXCLUDED.display_order,
              is_active = EXCLUDED.is_active,
              updated_at = CURRENT_TIMESTAMP
          `,
          [
            machineId,
            pointId,
            pointName,
            String(rawPoint.area || "").trim() || null,
            rawPoint.segment_id ? normalizeMachineId(rawPoint.segment_id) : null,
            primaryKey,
            secondaryKey,
            JSON.stringify(sourceFields),
            String(rawPoint.status_mode || "mapped_values").trim(),
            JSON.stringify(rawPoint.safe_config && typeof rawPoint.safe_config === "object"
              ? rawPoint.safe_config
              : { primary: "CLOSE", secondary: "LOCK" }),
            JSON.stringify(normalizePointValueRules(rawPoint.value_rules)),
            index,
            rawPoint.is_active !== false,
          ]
        );
      }

      await client.query(
        `DELETE FROM ${machinePointsTable} WHERE machine_id = $1 AND NOT (point_id = ANY($2::integer[]))`,
        [machineId, configuredPointIds]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await refreshSourceTopicIndex();
  const saved = await loadMachineConfigurations();
  return saved.find((machine) => machine.id === machineId);
}


if (MQTT_BROKER) {
  logDebug(`MQTT broker: ${MQTT_BROKER}`);
  logDebug(`MQTT topic: ${MQTT_TOPIC}`);

  mqttClient = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
    clientId: `mespack_dashboard_backend_${Date.now()}`,
  });

  mqttClient.on("connect", () => {
    mqttConnected = true;
    latestMachineData.mqttConnected = true;

    for (const state of latestMachineDataById.values()) {
      state.mqttConnected = true;
    }

    logInfo("✅ MQTT connected");
    const configuredTopics = sourceTopicIndex.size ? [...sourceTopicIndex.keys()] : [MQTT_TOPIC];
    mqttClient.subscribe(configuredTopics, (err) => {
      if (err) {
        logError("❌ MQTT subscribe error", err);
        return;
      }

      logDebug(`✅ Subscribed to ${configuredTopics.join(", ")}`);
    });
  });

  mqttClient.on("reconnect", () => {
    logDebug("Reconnecting to MQTT...");
  });

  mqttClient.on("close", () => {
    mqttConnected = false;
    latestMachineData.mqttConnected = false;
    for (const state of latestMachineDataById.values()) {
      state.mqttConnected = false;
    }
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

    const configuredSources = sourceTopicIndex.get(topic)
      || (topic === MQTT_TOPIC ? [{ machine_id: "mespack", payload_root: "data", source_path: null }] : []);

    if (!configuredSources.length) {
      logWarn(`⚠ MQTT message ignored because topic is not assigned to an active machine: ${topic}`);
      return;
    }

    for (const source of configuredSources) {
      const normalized = normalizeHighBytePayload(configuredPayload(parsed, source));
      latestMachineDataById.set(source.machine_id, {
        status: normalized.status,
        mqttConnected,
        topic,
        lastUpdated: lastMessageAt,
        data: normalized.data,
      });
      recordMachineReceipt(source.machine_id, topic, normalized.data.machineRunning, new Date(lastMessageAt)).catch((error) => {
        logDebug(`Unable to persist MQTT receipt for ${source.machine_id}`, error?.message || error);
      });
    }
    const routedMachineIds = configuredSources.map((source) => source.machine_id);
    if (routedMachineIds.includes("mespack")) {
      latestMachineData = latestMachineDataById.get("mespack");
    }

    const debugState = latestMachineDataById.get(routedMachineIds[0]);

    logDebug("MQTT data updated", {
      topic,
      machines: routedMachineIds,
      status: debugState.status,
      doors: debugState.data.doors?.length || 0,
      openDoorCount: debugState.data.openDoorCount,
      diagnosticCount: debugState.data.diagnosticCount,
    });
  });
} else {
  logWarn("⚠ MQTT_BROKER is empty. Live machine data is not configured.");
}

app.get("/", (req, res) => {
  res.json({
    message: "Machine Monitoring Backend is running",
    mqttConnected,
    lastMessageAt: lastMessageAt || "No data",
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mqttConnected,
    lastMessageAt: lastMessageAt || "No data",
  });
});

// One database row per completed browser session. No click/action logging.
app.post("/api/session/end", async (req, res) => {
  try {
    const sessionId = String(req.body?.session_id || "").trim().slice(0, 160);
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "session_id is required." });
    }

    const roleValue = String(req.body?.access_role || "temporary").trim().toLowerCase();
    const accessRole = roleValue === "admin" ? "admin" : "temporary";
    const endedAt = new Date();
    const suppliedStartedAt = new Date(req.body?.started_at || endedAt.toISOString());
    const startedAt = Number.isNaN(suppliedStartedAt.getTime()) || suppliedStartedAt > endedAt
      ? endedAt
      : suppliedStartedAt;
    const durationSeconds = Math.max(0, Math.min(7 * 24 * 60 * 60, Math.floor((endedAt - startedAt) / 1000)));

    await pgPool.query(
      `
        INSERT INTO ${sessionLogsTable} (
          session_id, access_role, started_at, ended_at, duration_seconds
        )
        VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5)
        ON CONFLICT (session_id) DO NOTHING
      `,
      [sessionId, accessRole, startedAt.toISOString(), endedAt.toISOString(), durationSeconds]
    );

    res.status(204).end();
  } catch (err) {
    logError("Session log save failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Optional admin-only database view for the latest session rows.
app.post("/api/admin/session-logs", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const requestedLimit = Number(req.body?.limit || 200);
    const limit = Math.max(1, Math.min(500, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 200));
    const result = await pgPool.query(
      `
        SELECT id, session_id, access_role, started_at, ended_at, duration_seconds
        FROM ${sessionLogsTable}
        ORDER BY ended_at DESC
        LIMIT $1
      `,
      [limit]
    );
    res.json({ ok: true, logs: result.rows });
  } catch (err) {
    logError("Session log read failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/auth/admin", (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ ok: false, error: "Admin access is not configured." });
  }
  const password = String(req.body?.password || "").trim();

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Invalid admin password." });
  }

  res.json({ ok: true, role: "admin" });
});

app.get("/api/machines", async (req, res) => {
  try {
    const machines = await loadMachineConfigurations();
    res.json({ ok: true, machines, canvas_aspect_ratio: FIXED_MACHINE_CANVAS_ASPECT });
  } catch (err) {
    logError("❌ Machine configuration list failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/machines", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const rawName = String(req.body?.name || "").trim();
    const requestedId = normalizeMachineId(req.body?.id || rawName);
    const mqttTopic = String(req.body?.data_source?.source_topic || req.body?.mqtt_topic || "").trim() || null;

    if (!rawName || !requestedId) {
      return res.status(400).json({ ok: false, error: "Machine name and machine ID are required." });
    }

    if (requestedId.length > 48 || !/^[a-z0-9][a-z0-9-]*$/.test(requestedId)) {
      return res.status(400).json({ ok: false, error: "Machine ID must use lowercase letters, numbers, and hyphens only." });
    }

    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO ${machinesTable} (
            id, name, description, api_url, mqtt_topic, template_id,
            is_active, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, 'mespack', TRUE, 'admin', 'admin')
        `,
        [
          requestedId,
          rawName,
          String(req.body?.description || "").trim() || null,
          `/api/machines/${requestedId}/data`,
          mqttTopic,
        ]
      );
      await client.query(
        `
          INSERT INTO ${machineSourcesTable} (
            machine_id, source_system, transport, source_endpoint, source_topic,
            source_path, destination_type, destination_key, payload_root, metadata, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'Dashboard API', $7, $8, '{}'::jsonb, TRUE)
        `,
        [
          requestedId,
          String(req.body?.data_source?.source_system || "HighByte").trim(),
          String(req.body?.data_source?.transport || "MQTT").trim(),
          String(req.body?.data_source?.source_endpoint || MQTT_BROKER || "").trim() || null,
          mqttTopic,
          String(req.body?.data_source?.source_path || "").trim() || null,
          `/api/machines/${requestedId}/data`,
          String(req.body?.data_source?.payload_root || "data").trim() || "data",
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await refreshSourceTopicIndex();
    const machines = await loadMachineConfigurations();
    res.status(201).json({ ok: true, machine: machines.find((machine) => machine.id === requestedId) });
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ ok: false, error: "That machine ID already exists." });
    }

    logError("❌ Machine configuration creation failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch("/api/machines/:id", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const machineId = String(req.params.id || "").trim().toLowerCase();
    const name = req.body?.name === undefined ? null : String(req.body.name).trim();
    const apiUrl = req.body?.api_url === undefined ? null : String(req.body.api_url).trim();
    const mqttTopic = req.body?.mqtt_topic === undefined ? null : String(req.body.mqtt_topic).trim();
    const isActive = typeof req.body?.is_active === "boolean" ? req.body.is_active : null;

    const updated = await pgPool.query(
      `
        UPDATE ${machinesTable}
        SET
          name = COALESCE(NULLIF($2, ''), name),
          api_url = COALESCE(NULLIF($3, ''), api_url),
          mqtt_topic = CASE WHEN $4::text IS NULL THEN mqtt_topic ELSE NULLIF($4, '') END,
          is_active = COALESCE($5::boolean, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id
      `,
      [machineId, name, apiUrl, mqttTopic, isActive]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ ok: false, error: "Machine configuration not found." });
    }

    const machines = await loadMachineConfigurations();
    res.json({ ok: true, machine: machines.find((machine) => machine.id === machineId) });
  } catch (err) {
    logError("❌ Machine configuration update failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/machines/:id/image", async (req, res) => {
  try {
    const result = await pgPool.query(
      `SELECT image_base64, mime_type, sha256 FROM ${machineImagesTable} WHERE machine_id = $1`,
      [normalizeMachineId(req.params.id)]
    );
    if (!result.rowCount) {
      return res.status(404).json({ ok: false, error: "Machine image not found." });
    }

    const row = result.rows[0];
    const bytes = Buffer.from(row.image_base64, "base64");
    res.set({
      "Content-Type": row.mime_type,
      "Content-Length": bytes.length,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${row.sha256}"`,
    });
    res.send(bytes);
  } catch (err) {
    logError("❌ Machine image read failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/machines/:id/configuration", async (req, res) => {
  try {
    const machineId = normalizeMachineId(req.params.id);
    const machines = await loadMachineConfigurations();
    const machine = machines.find((item) => item.id === machineId);
    if (!machine) return res.status(404).json({ ok: false, error: "Machine configuration not found." });
    res.json({ ok: true, machine, canvas_aspect_ratio: FIXED_MACHINE_CANVAS_ASPECT });
  } catch (err) {
    logError("❌ Machine configuration read failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/machines/:id/available-data", async (req, res) => {
  try {
    const machineId = normalizeMachineId(req.params.id);
    const machineResult = await pgPool.query(
      `SELECT id FROM ${machinesTable} WHERE id = $1`,
      [machineId]
    );
    if (!machineResult.rowCount) {
      return res.status(404).json({ ok: false, error: "Machine configuration not found." });
    }

    const configuredResult = await pgPool.query(
      `
        SELECT point_id, name, source_key_primary, source_key_secondary, source_fields
        FROM ${machinePointsTable}
        WHERE machine_id = $1 AND is_active = TRUE
        ORDER BY display_order, point_id
      `,
      [machineId]
    );
    const state = machineStateFor(machineId);
    const fieldsByKey = new Map();

    for (const field of availableDataFields(state.data || {})) {
      if (!fieldsByKey.has(field.key)) fieldsByKey.set(field.key, field);
    }

    for (const point of configuredResult.rows) {
      const configuredKeys = normalizePointSourceFields(point)
        .map((field) => field.source_key)
        .filter(Boolean);

      for (const keyValue of configuredKeys) {
        const key = String(keyValue || "").trim();
        if (!key) continue;
        const existing = fieldsByKey.get(key) || { key, type: "configured", sample: null, live: false };
        existing.configured = true;
        existing.point_id = point.point_id;
        existing.point_name = point.name;
        fieldsByKey.set(key, existing);
      }
    }

    const fields = [...fieldsByKey.values()].sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1;
      if (a.configured !== b.configured) return a.configured ? -1 : 1;
      return a.key.localeCompare(b.key, undefined, { numeric: true });
    });

    res.json({
      ok: true,
      machineId,
      topic: state.topic || null,
      lastUpdated: state.lastUpdated || null,
      mqttConnected: state.mqttConnected === true,
      fields,
    });
  } catch (err) {
    logError("❌ Available machine data read failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put("/api/machines/:id/configuration", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const machineId = normalizeMachineId(req.params.id);
    const machine = await saveMachineConfiguration(machineId, req.body || {});
    res.json({ ok: true, machine, canvas_aspect_ratio: FIXED_MACHINE_CANVAS_ASPECT });
  } catch (err) {
    logError("❌ Machine configuration save failed", err);
    res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
});

function currentMachineResponse(machineId = "mespack") {
  const state = machineStateFor(machineId);
  const machineState = getMachineVerificationState(state, new Date());
  return {
    machineId,
    ...state,
    verificationRequired: machineState.required,
    verificationReason: machineState.reason,
    verificationLabel: machineState.label,
    data: {
      ...(state.data || {}),
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

app.get("/api/machines/:id/data", (req, res) => {
  res.json(currentMachineResponse(normalizeMachineId(req.params.id)));
});

app.get("/raw", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({
    mqttConnected,
    topic: MQTT_TOPIC,
    lastMessageAt: lastMessageAt || "No data",
    raw: lastRawPayload || "No data",
  });
});

app.get("/data-machine2", (req, res) => {
  res.json(currentMachineResponse("machine2"));
});

async function registerOperatorHandler(req, res) {
  try {
    if (!requireAdmin(req, res)) return;
    const { person_name, employee_id, department, role, machine, machine_name } = req.body;
    const shift_code = normalizeShiftCode(req.body.shift_code || req.body.shift);
    const image = req.body.image || req.body.img;

    if (!person_name || !machine || !shift_code || !image) {
      return res.status(400).json({ error: "Operator name, machine, shift, and face image are required." });
    }

    const window = getVerificationWindow(shift_code, new Date());
    if (!window?.is_in_window) {
      return res.status(409).json({
        error: window
          ? `Registration for ${window.shift_label} is open only from ${window.verification_label}.`
          : "Select one of the three configured shifts.",
      });
    }

    let searchResponse = await faceApiPost("/search", searchPayload(image));
    let candidate = firstFaceCandidate(searchResponse);

    if (!candidate?.face_api_id && !candidate?.face_img_name) {
      await faceApiPost("/register", facePayload(image, {
        person_name,
        name: person_name,
        identity: `${APP_NAMESPACE}|${normalizeMachineId(machine)}|${person_name}`,
        employee_id: employee_id || "",
        department: department || "Production",
        role: role || "operator",
        machine: normalizeMachineId(machine),
        machine_name: machine_name || machine,
        shift_code,
        shift_label: SHIFT_WINDOWS[shift_code]?.shiftLabel || shift_code,
        source_app: "Machine Monitoring",
        app_namespace: APP_NAMESPACE,
        is_active: true,
      }));
      searchResponse = await faceApiPost("/search", searchPayload(image));
      candidate = firstFaceCandidate(searchResponse);
    }

    if (!candidate?.face_api_id && !candidate?.face_img_name) {
      return res.status(502).json({
        error: "The face could not be registered. Retake the image in even lighting and try again.",
      });
    }

    const operator = await upsertOperatorFace({
      person_name,
      employee_id,
      department: department || "Production",
      role: role || "operator",
      machine: normalizeMachineId(machine),
      machine_name: machine_name || machine,
      shift_code,
      candidate,
    });

    const assignment = await saveShiftRegistration({
      operator,
      machine,
      machine_name,
      shift_code,
      now: new Date(),
    });

    res.json({
      ok: true,
      message: `${operator.person_name} is registered for ${assignment.registration.machine_name}.`,
      operator: { id: operator.id, person_name: operator.person_name },
      registration: assignment.registration,
      window: assignment.window,
    });
  } catch (err) {
    logError("❌ Operator registration failed", err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

app.post("/api/operator/register", registerOperatorHandler);
app.post("/api/face/register", registerOperatorHandler);

app.get("/api/operator/registration-context", (req, res) => {
  const now = new Date();
  const windows = Object.keys(SHIFT_WINDOWS).map((shiftCode) => getVerificationWindow(shiftCode, now));
  res.json({
    ok: true,
    current_time: now.toISOString(),
    current_date: manilaDateKey(now),
    open_shift: windows.find((window) => window.is_in_window) || null,
    windows,
  });
});

app.post("/api/machine-check/detect", async (req, res) => {
  try {
    const { machine, machine_name } = req.body;
    const image = req.body.image || req.body.img;

    if (!machine || !image) {
      return res.status(400).json({ error: "Machine and face image are required." });
    }

    const machineId = normalizeMachineId(machine);
    const machineState = getMachineVerificationState(machineStateFor(machineId), new Date());
    if (!machineState.required) {
      return res.json({
        ok: true,
        not_required: true,
        machine: { id: machineId, name: machine_name || machineId },
        machine_state: machineState,
      });
    }

    const currentWindow = getCurrentVerificationWindow(new Date());
    if (!currentWindow) {
      return res.status(409).json({ error: "No confirmation window is open right now." });
    }

    const searchResponse = await faceApiPost("/search", searchPayload(image));
    const candidate = firstFaceCandidate(searchResponse);

    if (!candidate?.face_api_id && !candidate?.face_img_name) {
      return res.status(404).json({ error: "Face not detected. Try again while looking directly at the camera." });
    }

    const operator = await findOperatorByCandidate(candidate);

    if (!operator) {
      return res.status(403).json({ error: "This face is not registered for machine confirmation." });
    }

    const { registration, window } = await findCurrentRegistration({
      personId: operator.id,
      machine: machineId,
      now: new Date(),
    });

    if (!registration) {
      return res.status(403).json({
        error: `The detected operator is not registered for ${machine_name || machineId} during the current shift.`,
      });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = Date.now() + FACE_DETECTION_TTL_MS;
    faceDetectionSessions.set(token, {
      operator,
      registration,
      candidate,
      machine: machineId,
      machine_name: machine_name || registration.machine_name || machineId,
      window,
      expiresAt,
    });

    for (const [sessionToken, session] of faceDetectionSessions.entries()) {
      if (session.expiresAt < Date.now()) faceDetectionSessions.delete(sessionToken);
    }

    res.json({
      ok: true,
      detected: true,
      detection_token: token,
      expires_at: new Date(expiresAt).toISOString(),
      operator: { person_name: registration.person_name },
      machine: { id: registration.machine_id, name: registration.machine_name },
      shift: {
        code: registration.shift_code,
        label: SHIFT_WINDOWS[registration.shift_code]?.shiftLabel || registration.shift_code,
        confirmation_window: SHIFT_WINDOWS[registration.shift_code]?.label || "No data",
      },
    });
  } catch (err) {
    logError("❌ Face detection failed", err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post("/api/machine-check/confirm", async (req, res) => {
  try {
    const token = String(req.body.detection_token || "").trim();
    if (!token) return res.status(400).json({ error: "Detect the registered operator first." });

    const session = faceDetectionSessions.get(token);
    faceDetectionSessions.delete(token);
    if (!session || session.expiresAt < Date.now()) {
      return res.status(410).json({ error: "Face detection expired. Detect the operator again." });
    }

    const machineState = getMachineVerificationState(machineStateFor(session.machine), new Date());
    if (!machineState.required) {
      return res.json({ ok: true, not_required: true, machine_state: machineState });
    }

    const verification = {
      status: "CONFIRMED",
      label: "Machine check confirmed",
      machine_required: true,
      machine_reason: machineState.reason,
      window: session.window,
    };

    const log = await insertConfirmationLog({
      operator: session.operator,
      registration: session.registration,
      machine: session.machine,
      machine_name: session.machine_name,
      candidate: session.candidate,
      verification,
    });

    res.json({
      ok: true,
      log: { id: log.id, person_name: log.person_name, created_at: log.created_at },
      operator: { person_name: session.registration.person_name },
      machine: { id: session.machine, name: session.machine_name },
      shift: { code: session.registration.shift_code, label: SHIFT_WINDOWS[session.registration.shift_code]?.shiftLabel },
      verification,
    });
  } catch (err) {
    logError("❌ Machine check confirmation failed", err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

async function operatorOverviewHandler(req, res) {
  try {
    if (!requireAdmin(req, res)) return;
    const overview = await loadOperatorOverview(req.body || {});

    res.json({
      ok: true,
      ...overview,
      shiftWindows: SHIFT_WINDOWS,
    });
  } catch (err) {
    logError("❌ Operator overview failed", err);
    res.status(500).json({ error: err.message });
  }
}

app.post("/api/operator/admin/overview", operatorOverviewHandler);
app.post("/api/machine-check/admin/logs", operatorOverviewHandler);

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

    if (updated.rows.length) {
      await pgPool.query(
        `UPDATE ${operatorRegistrationsTable} SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE person_id = ANY($1::integer[])`,
        [updated.rows.map((row) => Number(row.id))]
      );
    }

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
    res.json({
      ok: true,
      postgres: true,
      faceRecognitionConfigured: Boolean(FACE_API_BASE_URL),
      shiftWindows: SHIFT_WINDOWS,
      staleSeconds: MACHINE_DATA_STALE_SECONDS,
    });
  } catch (err) {
    res.status(500).json({ ok: false, postgres: false, error: err.message });
  }
});

async function startServer() {
  await ensureTables();
  await refreshSourceTopicIndex();
  return app.listen(PORT, () => {
      logInfo(`✅ Backend running: http://localhost:${PORT}`);
      logInfo(`✅ Dashboard API: http://localhost:${PORT}/data`);
      logInfo(`✅ Face recognition: ${FACE_API_BASE_URL ? "configured" : "not configured"}`);
      logDebug(`App namespace: ${APP_NAMESPACE}`);
      logDebug(`PostgreSQL people table: ${peopleTable}`);
      logInfo(`✅ PostgreSQL: ${peopleTable}, ${confirmationsTable}, ${machinesTable}`);
      logInfo(`✅ Machine configuration tables: ${machineSourcesTable}, ${machineImagesTable}, ${machineSegmentsTable}, ${machinePointsTable}`);
      logInfo(`✅ Session logs: ${sessionLogsTable}`);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    logError("❌ Failed to initialize PostgreSQL tables", err);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
  getShiftWindowForDate,
  getVerificationWindow,
  getCurrentVerificationWindow,
  getMachineVerificationState,
  buildConfirmationMatrix,
  normalizeDateRange,
};
