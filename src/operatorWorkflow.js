export const SHIFT_OPTIONS = [
  { value: "MORNING", label: "1st shift", hours: "6 AM - 2 PM", window: "6 AM - 10 AM" },
  { value: "AFTERNOON", label: "2nd shift", hours: "2 PM - 10 PM", window: "2 PM - 6 PM" },
  { value: "NIGHT", label: "3rd shift", hours: "10 PM - 6 AM", window: "10 PM - 2 AM" },
];

export async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Request failed ${response.status}`);
  return data;
}

export function localDateKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export function addLocalDays(dateKey, days) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function getShiftLabel(value) {
  const shift = SHIFT_OPTIONS.find((item) => item.value === String(value || "").toUpperCase());
  return shift ? `${shift.label} · ${shift.hours}` : "No data";
}

export function formatDate(value) {
  if (!value) return "No data";
  const dateKey = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "No data";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "No data";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatTime(value) {
  if (!value) return "No data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No data";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function safeText(value) {
  const text = String(value ?? "").trim();
  return text || "No data";
}
