export const DEFAULT_POINT_VALUE_RULES = {
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

export function payloadValueAtPath(payload, pathValue) {
  if (!payload || !pathValue) return undefined;
  if (Object.prototype.hasOwnProperty.call(payload, pathValue)) return payload[pathValue];
  return String(pathValue)
    .split(".")
    .filter(Boolean)
    .reduce((current, part) => current?.[part], payload);
}

function canonicalIncomingValue(value) {
  if (value === undefined) return "__missing__";
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : String(value).toLowerCase();
  const normalized = String(value).trim().toLowerCase();
  if (["true", "on", "yes"].includes(normalized)) return "1";
  if (["false", "off", "no"].includes(normalized)) return "0";
  return normalized;
}

export function interpretIncomingValue(rawValue, channelRules, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return {
      rawValue,
      rawLabel: "No Data",
      label: "No Data",
      className: "neutral",
      color: "#64748b",
      matched: false,
    };
  }
  const canonicalValue = canonicalIncomingValue(rawValue);
  const matchedRule = (Array.isArray(channelRules) ? channelRules : []).find((rule) => (
    canonicalIncomingValue(rule.value) === canonicalValue
  ));
  const resolved = matchedRule || fallback || DEFAULT_POINT_VALUE_RULES.fallback;
  return {
    rawValue,
    rawLabel: String(rawValue),
    label: String(resolved.label || rawValue),
    className: ["safe", "warning", "danger", "neutral"].includes(resolved.severity)
      ? resolved.severity
      : "neutral",
    color: resolved.color || "#64748b",
    matched: Boolean(matchedRule),
  };
}
