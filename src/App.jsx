import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { AdminHome, ConfirmationModal, OperatorAdminPage } from "./OperatorExperience";


console.log(
  "%cMade by Riemar R. Seruelas Jr - Data Digital Intern",
  "color: #087cff; font-weight: 800; font-size: 12px;",
);

/* =========================================================
   01 - MACHINE POINTS / TAG CONFIG
   Real tag mapping prepared from your list.

   SFI_DoorX:
     true  = Guard ON / Door closed
     false = Guard OFF / Door open

   I_DoorXDiagnostic:
     true  = Healthy ON
     false = Healthy OFF

   Frontend internal logic:
     guardOpen = true means door is open
     interlockOk = true means healthy
========================================================= */

/* Machine points, segments, and images now come only from the API.
   No sample runtime machine data is bundled in the frontend. */

const DEFAULT_MACHINE_RECORD = {
  id: "mespack",
  name: "Mespack",
  api_url: "/api/data",
  mqtt_topic: "",
  template_id: "mespack",
  is_active: true,
};

const FIXED_MACHINE_CANVAS_ASPECT = 2.1;

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

const VALUE_SEVERITIES = [
  { value: "safe", label: "Good" },
  { value: "warning", label: "Warning" },
  { value: "danger", label: "Critical" },
  { value: "neutral", label: "Information" },
];

function cloneValueRules(valueRules) {
  const source = valueRules && typeof valueRules === "object" ? valueRules : DEFAULT_POINT_VALUE_RULES;
  return {
    primary: Array.isArray(source.primary) ? source.primary.map((rule) => ({ ...rule })) : [],
    secondary: Array.isArray(source.secondary) ? source.secondary.map((rule) => ({ ...rule })) : [],
    fallback: {
      ...DEFAULT_POINT_VALUE_RULES.fallback,
      ...(source.fallback && typeof source.fallback === "object" ? source.fallback : {}),
    },
  };
}

function cloneFieldValueRules(valueRules, fallbackRules = DEFAULT_POINT_VALUE_RULES.primary) {
  return Array.isArray(valueRules) && valueRules.length
    ? valueRules.map((rule) => ({ ...rule }))
    : fallbackRules.map((rule) => ({ ...rule }));
}

function normalizePointSourceFields(point) {
  const explicit = Array.isArray(point?.source_fields) ? point.source_fields : [];
  if (explicit.length) {
    return explicit.map((field, index) => ({
      id: field.id || `field-${index + 1}`,
      label: field.label || `Field ${index + 1}`,
      source_key: field.source_key || field.key || "",
      value_rules: cloneFieldValueRules(field.value_rules, index === 1 ? DEFAULT_POINT_VALUE_RULES.secondary : DEFAULT_POINT_VALUE_RULES.primary),
      fallback: {
        ...DEFAULT_POINT_VALUE_RULES.fallback,
        ...(field.fallback && typeof field.fallback === "object" ? field.fallback : {}),
      },
    }));
  }

  const legacyRules = cloneValueRules(point?.value_rules);
  const fields = [];
  if (point?.source_key_primary) {
    fields.push({
      id: "field-1",
      label: "Field 1",
      source_key: point.source_key_primary,
      value_rules: cloneFieldValueRules(legacyRules.primary, DEFAULT_POINT_VALUE_RULES.primary),
      fallback: { ...legacyRules.fallback },
    });
  }
  if (point?.source_key_secondary) {
    fields.push({
      id: "field-2",
      label: "Field 2",
      source_key: point.source_key_secondary,
      value_rules: cloneFieldValueRules(legacyRules.secondary, DEFAULT_POINT_VALUE_RULES.secondary),
      fallback: { ...legacyRules.fallback },
    });
  }
  return fields;
}

function syncPointFieldsForSave(point) {
  const sourceFields = normalizePointSourceFields(point);
  const firstField = sourceFields[0];
  const secondField = sourceFields[1];
  return {
    ...point,
    source_fields: sourceFields,
    source_key_primary: firstField?.source_key || "",
    source_key_secondary: secondField?.source_key || null,
    value_rules: {
      primary: firstField?.value_rules || [],
      secondary: secondField?.value_rules || [],
      fallback: { ...(firstField?.fallback || DEFAULT_POINT_VALUE_RULES.fallback) },
    },
  };
}

function newLogicCondition(index = 0) {
  return {
    id: `condition-${Date.now()}-${index}`,
    type: "field",
    field_key: "",
    operator: "equals",
    expected_value: "1",
    field_keys: [],
    comparator: "exactly",
    count: 1,
  };
}

function normalizeLogicCondition(condition, index = 0) {
  const type = condition?.type === "group" ? "group" : "field";
  return {
    id: condition?.id || `condition-${index + 1}`,
    type,
    field_key: condition?.field_key || "",
    operator: condition?.operator === "not_equals" ? "not_equals" : "equals",
    expected_value: String(condition?.expected_value ?? "1"),
    field_keys: Array.isArray(condition?.field_keys)
      ? [...new Set(condition.field_keys.filter(Boolean))]
      : [],
    comparator: ["exactly", "at_least", "at_most", "all", "any"].includes(condition?.comparator)
      ? condition.comparator
      : "exactly",
    count: Math.max(0, Number(condition?.count ?? 1)),
  };
}

function cloneLogicRules(value) {
  return (Array.isArray(value) ? value : []).map((rule, index) => {
    if (Array.isArray(rule?.conditions)) {
      return {
        id: rule.id || `logic-${index + 1}`,
        name: rule.name || `Logic rule ${index + 1}`,
        enabled: rule.enabled !== false,
        condition_join: rule.condition_join === "any" ? "any" : "all",
        conditions: rule.conditions.map((condition, conditionIndex) => normalizeLogicCondition(condition, conditionIndex)),
        action: ["safe", "warning", "danger", "neutral", "ignore"].includes(rule.action) ? rule.action : "safe",
        target_mode: rule.target_mode === "selected" ? "selected" : "conditions",
        target_field_keys: Array.isArray(rule.target_field_keys)
          ? [...new Set(rule.target_field_keys.filter(Boolean))]
          : [],
        template: rule.template || "custom",
      };
    }

    // Backward compatibility with the first Logic Rules format.
    const legacyFields = Array.isArray(rule?.field_keys)
      ? [...new Set(rule.field_keys.filter(Boolean))]
      : [];
    const legacyMode = ["count", "all", "any"].includes(rule?.match_mode) ? rule.match_mode : "count";
    const legacyComparator = legacyMode === "all"
      ? "all"
      : legacyMode === "any"
        ? "any"
        : ["exactly", "at_least", "at_most"].includes(rule?.comparator)
          ? rule.comparator
          : "exactly";

    return {
      id: rule?.id || `logic-${index + 1}`,
      name: rule?.name || `Logic rule ${index + 1}`,
      enabled: rule?.enabled !== false,
      condition_join: "all",
      conditions: [{
        id: `legacy-condition-${index + 1}`,
        type: "group",
        field_key: "",
        operator: "equals",
        expected_value: String(rule?.expected_value ?? "0"),
        field_keys: legacyFields,
        comparator: legacyComparator,
        count: Math.max(0, Number(rule?.count ?? 1)),
      }],
      action: rule?.action === "ignore" ? "ignore" : "safe",
      target_mode: "conditions",
      target_field_keys: [],
      template: "custom",
    };
  });
}

function newLogicRule(index = 0) {
  return {
    id: `logic-${Date.now()}-${index}`,
    name: `Logic rule ${index + 1}`,
    enabled: true,
    condition_join: "all",
    conditions: [newLogicCondition(0)],
    action: "safe",
    target_mode: "conditions",
    target_field_keys: [],
    template: "custom",
  };
}

const LOGIC_SCENARIOS = [
  {
    id: "interchangeable",
    title: "Interchangeable signals",
    badge: "Exactly X",
    description: "Use when several switches can trade states and a certain number being ON/OFF is still normal.",
    example: "Example: Doors 36–39 are healthy when exactly 2 of the 4 signals are 0.",
  },
  {
    id: "redundant",
    title: "All signals must agree",
    badge: "All",
    description: "Use for redundant guards or sensors where every selected signal must show the expected value.",
    example: "Example: both guard switches must be 1 before the guard is considered healthy.",
  },
  {
    id: "either",
    title: "Any signal is enough",
    badge: "Any",
    description: "Use when more than one sensor can prove the same condition and any one of them is acceptable.",
    example: "Example: Sensor A or Sensor B can confirm product presence.",
  },
  {
    id: "voting",
    title: "Voting / majority",
    badge: "At least X",
    description: "Use when a minimum number of sensors must agree before the condition is accepted.",
    example: "Example: at least 2 of 3 safety sensors must read 1.",
  },
  {
    id: "mode_ignore",
    title: "Ignore during a mode",
    badge: "A + B",
    description: "Use when a signal is normally a warning but should be ignored during cleaning, setup, maintenance, or another mode.",
    example: "Example: Cleaning Mode = 1 AND Door 5 = 0 → ignore Door 5.",
  },
  {
    id: "exclusive",
    title: "Only one should be active",
    badge: "Exactly 1",
    description: "Use for opposite-position sensors where one must be ON and the other OFF.",
    example: "Example: Extended and Retracted sensors are healthy when exactly one is 1.",
  },
];

function logicScenarioRule(template, index = 0) {
  const base = newLogicRule(index);
  const group = (comparator, count, expectedValue = "1") => ({
    ...newLogicCondition(0),
    type: "group",
    comparator,
    count,
    expected_value: expectedValue,
    field_key: "",
    field_keys: [],
  });

  if (template === "interchangeable") return {
    ...base,
    name: "Interchangeable signals",
    template,
    conditions: [group("exactly", 2, "0")],
    action: "safe",
  };
  if (template === "redundant") return {
    ...base,
    name: "All signals must agree",
    template,
    conditions: [group("all", 1, "1")],
    action: "safe",
  };
  if (template === "either") return {
    ...base,
    name: "Any signal is enough",
    template,
    conditions: [group("any", 1, "1")],
    action: "safe",
  };
  if (template === "voting") return {
    ...base,
    name: "Voting / majority",
    template,
    conditions: [group("at_least", 2, "1")],
    action: "safe",
  };
  if (template === "exclusive") return {
    ...base,
    name: "Only one should be active",
    template,
    conditions: [group("exactly", 1, "1")],
    action: "safe",
  };
  if (template === "mode_ignore") return {
    ...base,
    name: "Ignore during a mode",
    template,
    condition_join: "all",
    conditions: [
      { ...newLogicCondition(0), expected_value: "1" },
      { ...newLogicCondition(1), expected_value: "0" },
    ],
    action: "ignore",
    target_mode: "selected",
  };
  return { ...base, template: "custom" };
}

function logicConditionSentence(condition) {
  if (condition.type === "field") {
    const field = condition.field_key || "[choose a signal]";
    return `${field} ${condition.operator === "not_equals" ? "is not" : "is"} ${condition.expected_value || "[value]"}`;
  }

  const count = condition.field_keys?.length || 0;
  const selected = count ? `${count} selected signal${count === 1 ? "" : "s"}` : "the selected signals";
  if (condition.comparator === "all") return `all of ${selected} are ${condition.expected_value || "[value]"}`;
  if (condition.comparator === "any") return `any of ${selected} are ${condition.expected_value || "[value]"}`;
  const compareLabel = condition.comparator === "at_least"
    ? "at least"
    : condition.comparator === "at_most" ? "at most" : "exactly";
  return `${compareLabel} ${condition.count} of ${selected} are ${condition.expected_value || "[value]"}`;
}

function logicRuleSentence(rule) {
  const conditionText = rule.conditions.map(logicConditionSentence).join(rule.condition_join === "any" ? " OR " : " AND ");
  const actionText = {
    safe: "treat the affected signals as Good",
    warning: "treat the affected signals as Warning",
    danger: "treat the affected signals as Critical",
    neutral: "treat the affected signals as Information",
    ignore: "ignore the affected signals",
  }[rule.action] || "apply the selected result";
  return `When ${conditionText || "the scenario matches"}, ${actionText}. Otherwise, normal Data Mapping applies.`;
}

function compareLogicValue(actualValue, expectedValue, operator = "equals") {
  if (actualValue === undefined) return false;
  const matches = canonicalIncomingValue(actualValue) === canonicalIncomingValue(expectedValue);
  return operator === "not_equals" ? !matches : matches;
}

function evaluateLogicCondition(condition, payload) {
  if (condition.type === "field") {
    if (!condition.field_key) return { matched: false, fields: [] };
    return {
      matched: compareLogicValue(
        payloadValueAtPath(payload, condition.field_key),
        condition.expected_value,
        condition.operator,
      ),
      fields: [condition.field_key],
    };
  }

  const fieldKeys = condition.field_keys || [];
  if (!fieldKeys.length) return { matched: false, fields: [] };
  const values = fieldKeys.map((key) => payloadValueAtPath(payload, key));
  if (values.some((value) => value === undefined)) return { matched: false, fields: fieldKeys };

  const matches = values.map((value) => compareLogicValue(value, condition.expected_value, "equals"));
  const matchCount = matches.filter(Boolean).length;
  let matched = false;
  if (condition.comparator === "all") matched = matches.every(Boolean);
  else if (condition.comparator === "any") matched = matches.some(Boolean);
  else if (condition.comparator === "at_least") matched = matchCount >= Number(condition.count || 0);
  else if (condition.comparator === "at_most") matched = matchCount <= Number(condition.count || 0);
  else matched = matchCount === Number(condition.count || 0);

  return { matched, fields: fieldKeys };
}

function evaluateLogicRules(logicRules, payload) {
  const overrides = new Map();

  cloneLogicRules(logicRules).forEach((rule) => {
    if (!rule.enabled || !rule.conditions.length) return;

    const evaluations = rule.conditions.map((condition) => evaluateLogicCondition(condition, payload));
    const matched = rule.condition_join === "any"
      ? evaluations.some((evaluation) => evaluation.matched)
      : evaluations.every((evaluation) => evaluation.matched);

    if (!matched) return;

    const conditionFields = [...new Set(evaluations.flatMap((evaluation) => evaluation.fields).filter(Boolean))];
    const targetFields = rule.target_mode === "selected"
      ? rule.target_field_keys
      : conditionFields;

    targetFields.forEach((key) => {
      overrides.set(key, {
        action: rule.action,
        ruleName: rule.name || "Logic rule",
      });
    });
  });

  return overrides;
}

function polygonToSvgPoints(points) {
  return (Array.isArray(points) ? points : [])
    .map((point) => Array.isArray(point) ? `${point[0]},${point[1]}` : `${point.x},${point.y}`)
    .join(" ");
}

function machinePointFromDatabase(point) {
  const sourceFields = normalizePointSourceFields(point);
  return {
    id: Number(point.point_id),
    name: point.name,
    area: point.area || "Machine",
    guardOpen: false,
    interlockOk: true,
    guardTag: sourceFields[0]?.source_key || "",
    interlockTag: sourceFields[1]?.source_key || "",
    sourceFields,
    statusMode: point.status_mode || "mapped_values",
    safeConfig: point.safe_config || { primary: "CLOSE", secondary: "LOCK" },
    valueRules: cloneValueRules(point.value_rules),
  };
}

function machineZoneFromDatabase(segment) {
  return {
    id: segment.id,
    name: segment.name,
    area: segment.area || segment.name,
    points: polygonToSvgPoints(segment.polygon_points),
    polygonPoints: segment.polygon_points,
    boundingBox: segment.bounding_box,
    labelX: `${Number(segment.label_x ?? 50)}%`,
    labelY: `${Number(segment.label_y ?? 50)}%`,
    zoomScale: Number(segment.zoom_scale || 2),
    tagIds: (segment.point_ids || []).map(Number),
  };
}

export default function App() {
  const [accessRole, setAccessRole] = useState("temporary");
  const [adminAccessOpen, setAdminAccessOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [activePage, setActivePage] = useState("dashboard");
  const [machineCatalog, setMachineCatalog] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem("mespack-theme") || "dark");
  const [machineEditorOpen, setMachineEditorOpen] = useState(false);
  const [machineEditorSaving, setMachineEditorSaving] = useState(false);
  const machineConfigurationActionsRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("mespack-theme", theme);
  }, [theme]);

  async function loadMachines() {
    try {
      const response = await fetch("/api/machines");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load machines.");
      const nextMachines = Array.isArray(data.machines) ? data.machines : [];
      setMachineCatalog(nextMachines);
      return nextMachines;
    } catch {
      setMachineCatalog([]);
      return [];
    } finally {
      setMachinesLoading(false);
    }
  }

  useEffect(() => {
    loadMachines();
  }, []);

  async function enterAsAdmin(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Admin access failed.");

      setAdminPassword((current) => current.trim());
      setAccessRole("admin");
      setActivePage("admin");
      setAdminAccessOpen(false);
      setShowAdminPassword(false);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function signOut() {
    setAccessRole("temporary");
    setActivePage("dashboard");
    setAdminPassword("");
    setAuthError("");
    setAdminAccessOpen(false);
    setShowAdminPassword(false);
    setMachineEditorOpen(false);
  }

  function navigate(page) {
    if (page !== "machines") setMachineEditorOpen(false);
    setActivePage(page);
  }

  function closeAdminGate() {
    setAdminAccessOpen(false);
    setShowAdminPassword(false);
  }

  const isAdminWorkspace = accessRole === "admin" && ["admin", "machines", "operators"].includes(activePage);
  const adminWorkspaceTitle = activePage === "machines"
    ? "Machine Set Up"
    : activePage === "operators" ? "Operator" : "Administration";

  return (
    <div className={`control-shell ${isAdminWorkspace ? "setup-mode" : "dashboard-mode"}`}>
      {adminAccessOpen && (
        <div className="admin-gate-backdrop" data-theme={theme} onClick={closeAdminGate}>
          <form className="admin-gate" onSubmit={enterAsAdmin} onClick={(event) => event.stopPropagation()}>
            <div className="admin-gate-brand" aria-hidden="true"><i /><i /><i /><i /></div>
            <div className="admin-gate-heading">
              <div><span>Administration</span><h2>Open machine setup</h2><p>Enter the administrator password to manage machines and operator assignments.</p></div>
              <button type="button" onClick={closeAdminGate} aria-label="Close">×</button>
            </div>
            <label htmlFor="dashboard-admin-password">Admin password</label>
            <div className="admin-password-field">
              <input
                id="dashboard-admin-password"
                type={showAdminPassword ? "text" : "password"}
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="Enter password"
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                className={showAdminPassword ? "is-visible" : ""}
                onClick={() => setShowAdminPassword((current) => !current)}
                aria-label={showAdminPassword ? "Hide password" : "Show password"}
                aria-pressed={showAdminPassword}
              >
                {showAdminPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.7 10.7 0 0 1 12 4c5.2 0 8.5 5 8.5 5a14.8 14.8 0 0 1-2.4 2.8M6.6 6.6A15 15 0 0 0 3.5 9s3.3 5 8.5 5c1 0 1.8-.2 2.6-.4" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3.3-5 8.5-5 8.5 5 8.5 5-3.3 5-8.5 5-8.5-5-8.5-5Z" /><circle cx="12" cy="12" r="2.25" /></svg>
                )}
              </button>
            </div>
            {authError && <div className="admin-gate-error">{authError}</div>}
            <div className="admin-gate-actions">
              <button type="button" onClick={closeAdminGate}>Cancel</button>
              <button type="submit" disabled={authLoading || !adminPassword}>{authLoading ? "Checking…" : "Continue"}</button>
            </div>
          </form>
        </div>
      )}

      {isAdminWorkspace ? (
        <section className="admin-workspace" data-theme={theme}>
          <header className="admin-workspace-bar">
            <button
              onClick={() => {
                if (activePage === "machines" && machineEditorOpen) machineConfigurationActionsRef.current?.showMachineGallery();
                else if (activePage === "admin") navigate("dashboard");
                else navigate("admin");
              }}
            >
              {activePage === "machines" && machineEditorOpen
                ? "← All machines"
                : activePage === "admin" ? "← Back to machine" : "← Administration"}
            </button>
            <div><span>Administration</span><strong>{adminWorkspaceTitle}</strong></div>
            <div className="admin-workspace-actions">
              <button
                className="admin-theme-button"
                onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
                {theme === "dark" ? "Light" : "Dark"}
              </button>
              {activePage === "machines" && machineEditorOpen && (
                <button
                  className="admin-save-button"
                  onClick={() => machineConfigurationActionsRef.current?.saveConfiguration()}
                  disabled={machineEditorSaving || machinesLoading}
                >
                  {machineEditorSaving ? "Saving…" : "Save configuration"}
                </button>
              )}
              <button onClick={signOut}>Exit admin</button>
            </div>
          </header>
          <main className="admin-workspace-content">
            {activePage === "admin" && (
              <AdminHome
                onMachineSetup={() => navigate("machines")}
                onOperators={() => navigate("operators")}
              />
            )}
            {activePage === "machines" && (
              <MachineConfigurationPage
                machines={machineCatalog}
                password={adminPassword}
                reload={loadMachines}
                actionsRef={machineConfigurationActionsRef}
                onEditorOpenChange={setMachineEditorOpen}
                onSavingChange={setMachineEditorSaving}
              />
            )}
            {activePage === "operators" && (
              <OperatorAdminPage machines={machineCatalog} password={adminPassword} />
            )}
          </main>
        </section>
      ) : (
        <LegacyDashboardApp
          machineCatalog={machineCatalog}
          accessRole={accessRole}
          theme={theme}
          setTheme={setTheme}
          onOpenAdmin={() => {
            setShowAdminPassword(false);
            setAdminAccessOpen(true);
            setAuthError("");
          }}
          onOpenMachineSetup={() => navigate("admin")}
        />
      )}
    </div>
  );
}

function newSource(machineId = "") {
  return {
    source_system: "HighByte",
    transport: "MQTT",
    source_endpoint: "",
    source_topic: "",
    source_path: "",
    destination_type: "Dashboard API",
    destination_key: machineId ? `/api/machines/${machineId}/data` : "",
    payload_root: "data",
    is_active: true,
  };
}

function editorDraftFromMachine(machine) {
  return {
    id: machine.id,
    name: machine.name || "",
    description: machine.description || "",
    is_active: machine.is_active !== false,
    config_revision: Number(machine.config_revision || 1),
    data_source: { ...newSource(machine.id), ...(machine.data_source || {}) },
    imagePreview: machine.image?.url || "",
    image_base64: "",
    image_mime_type: machine.image?.mime_type || "image/png",
    image_width: machine.image?.original_width || null,
    image_height: machine.image?.original_height || null,
    logic_rules: cloneLogicRules(machine.logic_rules),
    segments: (machine.segments || []).map((segment) => ({
      ...segment,
      polygon_points: Array.isArray(segment.polygon_points) ? segment.polygon_points : [],
      point_ids: (segment.point_ids || []).map(Number),
    })),
    points: (machine.points || []).map((point) => ({
      ...point,
      source_fields: normalizePointSourceFields(point),
      value_rules: cloneValueRules(point.value_rules),
    })),
  };
}

function emptySegmentDraft() {
  return { id: "", name: "", area: "", polygon_points: [], point_ids_text: "", zoom_scale: 2 };
}

function segmentIdFromName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pointIdsFromText(value) {
  return [...new Set(String(value || "")
    .split(/[,\s]+/)
    .map(Number)
    .filter(Number.isInteger))];
}

function availableFieldLabel(fieldKey) {
  const parts = String(fieldKey || "").split(".").filter(Boolean);
  return parts[parts.length - 1] || "Data point";
}

function payloadValueAtPath(payload, pathValue) {
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

function interpretIncomingValue(rawValue, channelRules, fallback) {
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

function pointInterpretation(point, payload, logicOverrides = new Map()) {
  const fields = Array.isArray(point.sourceFields) ? point.sourceFields : [];
  if (!fields.length) return null;
  const states = fields.map((field) => {
    const interpreted = interpretIncomingValue(
      payloadValueAtPath(payload, field.source_key),
      field.value_rules,
      field.fallback,
    );
    const override = logicOverrides.get(field.source_key);
    if (!override) return { ...interpreted, sourceKey: field.source_key, fieldLabel: field.label };
    if (override.action === "ignore") {
      return {
        ...interpreted,
        sourceKey: field.source_key,
        fieldLabel: field.label,
        label: interpreted.rawLabel === "No Data" ? "No Data" : `${interpreted.label} · Ignored`,
        className: "neutral",
        color: "#64748b",
        logicRule: override.ruleName,
      };
    }

    const overrideStyles = {
      safe: { className: "safe", color: "#22c55e", suffix: "Good" },
      warning: { className: "warning", color: "#f59e0b", suffix: "Warning" },
      danger: { className: "danger", color: "#ef4444", suffix: "Critical" },
      neutral: { className: "neutral", color: "#64748b", suffix: "Information" },
    };
    const overrideStyle = overrideStyles[override.action] || overrideStyles.safe;
    return {
      ...interpreted,
      sourceKey: field.source_key,
      fieldLabel: field.label,
      label: interpreted.rawLabel === "No Data" ? "No Data" : `${interpreted.label} · ${overrideStyle.suffix}`,
      className: overrideStyle.className,
      color: overrideStyle.color,
      logicRule: override.ruleName,
    };
  });
  const priority = { danger: 3, warning: 2, neutral: 1, safe: 0 };
  const overall = states.slice().sort((first, second) => (
    (priority[second.className] ?? 1) - (priority[first.className] ?? 1)
  ))[0];
  return { states, overall };
}

function MachineConfigurationPage({
  machines,
  password,
  reload,
  actionsRef,
  onEditorOpenChange,
  onSavingChange,
}) {
  const [selectedMachineId, setSelectedMachineId] = useState(machines[0]?.id || "mespack");
  const [draft, setDraft] = useState(() => editorDraftFromMachine(machines[0] || DEFAULT_MACHINE_RECORD));
  const [editorOpen, setEditorOpen] = useState(false);
  const [addMachineOpen, setAddMachineOpen] = useState(false);
  const [segmentDraft, setSegmentDraft] = useState(emptySegmentDraft);
  const [segmentDirty, setSegmentDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newMachine, setNewMachine] = useState({ name: "", source_endpoint: "", source_topic: "" });
  const [availableFields, setAvailableFields] = useState([]);
  const [rulesPointId, setRulesPointId] = useState(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [gallerySwipeOffset, setGallerySwipeOffset] = useState(0);
  const [gallerySwipeActive, setGallerySwipeActive] = useState(false);
  const gallerySwipeGesture = useRef({ active: false, startX: 0, dragged: false, ignoreClick: false, offset: 0 });
  const galleryItems = useMemo(() => [
    ...machines.map((machine) => ({ ...machine, isAddMore: false })),
    { id: "__add_more__", name: "Add more", isAddMore: true },
  ], [machines]);

  useEffect(() => {
    setGalleryIndex((current) => Math.min(current, Math.max(0, galleryItems.length - 1)));
  }, [galleryItems.length]);

  useEffect(() => {
    onEditorOpenChange?.(editorOpen);
  }, [editorOpen, onEditorOpenChange]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  useEffect(() => {
    if (rulesPointId === null) return undefined;
    function closeRulesOnEscape(event) {
      if (event.key === "Escape") setRulesPointId(null);
    }
    window.addEventListener("keydown", closeRulesOnEscape);
    return () => window.removeEventListener("keydown", closeRulesOnEscape);
  }, [rulesPointId]);

  useEffect(() => {
    const selected = machines.find((machine) => machine.id === selectedMachineId);
    if (!selected) return;
    setDraft(editorDraftFromMachine(selected));
    setSegmentDraft(emptySegmentDraft());
    setSegmentDirty(false);
    setRulesPointId(null);
  }, [machines, selectedMachineId]);

  useEffect(() => {
    if (!editorOpen || !selectedMachineId) return undefined;
    let alive = true;
    fetch(`/api/machines/${encodeURIComponent(selectedMachineId)}/available-data`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to read available HighByte data.");
        if (!alive) return;
        setAvailableFields(data.fields || []);
      })
      .catch(() => {
        if (!alive) return;
        const configured = (draft.points || [])
          .flatMap((point) => normalizePointSourceFields(point).map((field) => field.source_key))
          .filter(Boolean)
          .map((key) => ({ key, type: "configured", sample: null, configured: true }));
        setAvailableFields(configured);
      });

    return () => { alive = false; };
  }, [editorOpen, selectedMachineId]);

  function selectMachine(machine) {
    setSelectedMachineId(machine.id);
    setEditorOpen(true);
    setAddMachineOpen(false);
    setMessage("");
    setError("");
  }

  function showMachineGallery() {
    setEditorOpen(false);
    setAddMachineOpen(false);
    setMessage("");
    setError("");
  }

  function moveGalleryTo(index) {
    setGalleryIndex(Math.max(0, Math.min(galleryItems.length - 1, index)));
  }

  function openGalleryItem(item) {
    if (!item) return;
    if (item.isAddMore) {
      setAddMachineOpen(true);
      return;
    }
    selectMachine(item);
  }

  function startGallerySwipe(event) {
    if (galleryItems.length < 2 || (event.pointerType === "mouse" && event.button !== 0)) return;
    gallerySwipeGesture.current = {
      active: true,
      startX: event.clientX,
      dragged: false,
      ignoreClick: false,
      offset: 0,
    };
    setGallerySwipeActive(true);
  }

  function moveGallerySwipe(event) {
    if (!gallerySwipeGesture.current.active) return;
    const distance = event.clientX - gallerySwipeGesture.current.startX;
    if (!gallerySwipeGesture.current.dragged && Math.abs(distance) < 7) return;
    gallerySwipeGesture.current.dragged = true;
    gallerySwipeGesture.current.ignoreClick = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const nextOffset = Math.max(-130, Math.min(130, distance));
    gallerySwipeGesture.current.offset = nextOffset;
    setGallerySwipeOffset(nextOffset);
    event.preventDefault();
  }

  function finishGallerySwipe(event) {
    if (!gallerySwipeGesture.current.active) return;
    const finalOffset = Number(gallerySwipeGesture.current.offset || 0);
    const shouldSwitch = gallerySwipeGesture.current.dragged && Math.abs(finalOffset) >= 58;
    const direction = finalOffset < 0 ? 1 : -1;
    gallerySwipeGesture.current.active = false;
    setGallerySwipeActive(false);
    setGallerySwipeOffset(0);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (shouldSwitch) moveGalleryTo(galleryIndex + direction);
    window.setTimeout(() => {
      gallerySwipeGesture.current.ignoreClick = false;
      gallerySwipeGesture.current.dragged = false;
    }, 0);
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateSource(field, value) {
    setDraft((current) => ({
      ...current,
      data_source: { ...current.data_source, [field]: value },
    }));
  }

  function chooseSegment(segment) {
    setSegmentDraft({
      ...segment,
      polygon_points: (segment.polygon_points || []).map((point) => [...point]),
      point_ids_text: (segment.point_ids || []).join(", "),
    });
    setSegmentDirty(false);
  }

  function startNewSegment() {
    setSegmentDraft(emptySegmentDraft());
    setSegmentDirty(false);
  }

  function addPolygonPoint(event) {
    if (!draft.imagePreview) {
      setError("Add a machine image before drawing segments.");
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
    setSegmentDraft((current) => ({
      ...current,
      polygon_points: [...current.polygon_points, [Number(x.toFixed(3)), Number(y.toFixed(3))]],
    }));
    setSegmentDirty(true);
  }

  function commitSegment(segments = draft.segments, currentSegment = segmentDraft) {
    const id = segmentIdFromName(currentSegment.id || currentSegment.name);
    const name = String(currentSegment.name || "").trim();
    const polygonPoints = currentSegment.polygon_points || [];
    if (!id || !name || polygonPoints.length < 3) {
      throw new Error("A segment needs a name and at least three clicks on the image.");
    }
    const pointIds = pointIdsFromText(currentSegment.point_ids_text);
    const savedSegment = {
      ...currentSegment,
      id,
      name,
      area: String(currentSegment.area || name).trim(),
      polygon_points: polygonPoints,
      point_ids: pointIds,
      zoom_scale: Number(currentSegment.zoom_scale || 2),
      is_active: true,
    };
    const nextSegments = segments.some((segment) => segment.id === id)
      ? segments.map((segment) => segment.id === id ? savedSegment : segment)
      : [...segments, savedSegment];
    return { savedSegment, nextSegments, pointIds };
  }

  function saveSegmentToDraft() {
    setError("");
    try {
      const { savedSegment, nextSegments, pointIds } = commitSegment();
      setDraft((current) => ({
        ...current,
        segments: nextSegments,
        points: current.points.map((point) => ({
          ...point,
          segment_id: pointIds.includes(Number(point.point_id))
            ? savedSegment.id
            : point.segment_id === savedSegment.id ? null : point.segment_id,
        })),
      }));
      setSegmentDraft({ ...savedSegment, point_ids_text: pointIds.join(", ") });
      setSegmentDirty(false);
      setMessage(`${savedSegment.name} is ready to save.`);
    } catch (segmentError) {
      setError(segmentError.message);
    }
  }

  function deleteSegment() {
    if (!segmentDraft.id) return;
    setDraft((current) => ({
      ...current,
      segments: current.segments.filter((segment) => segment.id !== segmentDraft.id),
      points: current.points.map((point) => point.segment_id === segmentDraft.id
        ? { ...point, segment_id: null }
        : point),
    }));
    setSegmentDraft(emptySegmentDraft());
    setSegmentDirty(false);
    setMessage("Segment removed from the draft. Save configuration to apply it.");
  }

  function updatePoint(index, field, value) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, pointIndex) => pointIndex === index
        ? { ...point, [field]: field === "point_id" ? Number(value) : value }
        : point),
    }));
  }


  function updatePointSourceField(pointIndex, fieldIndex, key, value) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, index) => {
        if (index !== pointIndex) return point;
        const fields = normalizePointSourceFields(point);
        return {
          ...point,
          source_fields: fields.map((field, indexInFields) => indexInFields === fieldIndex
            ? { ...field, [key]: value }
            : field),
        };
      }),
    }));
  }

  function addPointSourceField(pointIndex) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, index) => {
        if (index !== pointIndex) return point;
        const fields = normalizePointSourceFields(point);
        const nextNumber = fields.length + 1;
        return {
          ...point,
          source_fields: [
            ...fields,
            {
              id: `field-${Date.now()}-${nextNumber}`,
              label: `Field ${nextNumber}`,
              source_key: "",
              value_rules: cloneFieldValueRules(DEFAULT_POINT_VALUE_RULES.primary),
              fallback: { ...DEFAULT_POINT_VALUE_RULES.fallback },
            },
          ],
        };
      }),
    }));
  }

  function removePointSourceField(pointIndex, fieldIndex) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, index) => {
        if (index !== pointIndex) return point;
        const fields = normalizePointSourceFields(point);
        if (fields.length <= 1) return point;
        return { ...point, source_fields: fields.filter((_, indexInFields) => indexInFields !== fieldIndex) };
      }),
    }));
  }

  function updateFieldValueRule(pointIndex, fieldIndex, ruleIndex, key, value) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, index) => {
        if (index !== pointIndex) return point;
        const fields = normalizePointSourceFields(point);
        return {
          ...point,
          source_fields: fields.map((field, indexInFields) => {
            if (indexInFields !== fieldIndex) return field;
            return {
              ...field,
              value_rules: field.value_rules.map((rule, indexInRules) => indexInRules === ruleIndex
                ? { ...rule, [key]: value }
                : rule),
            };
          }),
        };
      }),
    }));
  }

  function addFieldValueRule(pointIndex, fieldIndex) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, index) => {
        if (index !== pointIndex) return point;
        const fields = normalizePointSourceFields(point);
        return {
          ...point,
          source_fields: fields.map((field, indexInFields) => indexInFields === fieldIndex
            ? { ...field, value_rules: [...field.value_rules, { value: "", label: "", severity: "safe", color: "#22c55e" }] }
            : field),
        };
      }),
    }));
  }

  function removeFieldValueRule(pointIndex, fieldIndex, ruleIndex) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, index) => {
        if (index !== pointIndex) return point;
        const fields = normalizePointSourceFields(point);
        return {
          ...point,
          source_fields: fields.map((field, indexInFields) => indexInFields === fieldIndex
            ? { ...field, value_rules: field.value_rules.filter((_, indexInRules) => indexInRules !== ruleIndex) }
            : field),
        };
      }),
    }));
  }

  function updateFieldFallback(pointIndex, fieldIndex, key, value) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, index) => {
        if (index !== pointIndex) return point;
        const fields = normalizePointSourceFields(point);
        return {
          ...point,
          source_fields: fields.map((field, indexInFields) => indexInFields === fieldIndex
            ? { ...field, fallback: { ...field.fallback, [key]: value } }
            : field),
        };
      }),
    }));
  }

  function addLogicRule() {
    addLogicScenario("custom");
  }

  function addLogicScenario(template) {
    setDraft((current) => ({
      ...current,
      logic_rules: [
        ...cloneLogicRules(current.logic_rules),
        logicScenarioRule(template, current.logic_rules?.length || 0),
      ],
    }));
  }

  function updateLogicRule(ruleIndex, key, value) {
    setDraft((current) => ({
      ...current,
      logic_rules: cloneLogicRules(current.logic_rules).map((rule, index) => index === ruleIndex
        ? { ...rule, [key]: value }
        : rule),
    }));
  }

  function addLogicCondition(ruleIndex) {
    setDraft((current) => ({
      ...current,
      logic_rules: cloneLogicRules(current.logic_rules).map((rule, index) => index === ruleIndex
        ? { ...rule, conditions: [...rule.conditions, newLogicCondition(rule.conditions.length)] }
        : rule),
    }));
  }

  function updateLogicCondition(ruleIndex, conditionIndex, key, value) {
    setDraft((current) => ({
      ...current,
      logic_rules: cloneLogicRules(current.logic_rules).map((rule, index) => {
        if (index !== ruleIndex) return rule;
        return {
          ...rule,
          conditions: rule.conditions.map((condition, indexInConditions) => indexInConditions === conditionIndex
            ? {
              ...condition,
              [key]: key === "count" ? Math.max(0, Number(value || 0)) : value,
              ...(key === "type" && value === "field"
                ? { field_keys: [] }
                : key === "type" && value === "group"
                  ? { field_key: "" }
                  : {}),
            }
            : condition),
        };
      }),
    }));
  }

  function removeLogicCondition(ruleIndex, conditionIndex) {
    setDraft((current) => ({
      ...current,
      logic_rules: cloneLogicRules(current.logic_rules).map((rule, index) => {
        if (index !== ruleIndex) return rule;
        const nextConditions = rule.conditions.filter((_, indexInConditions) => indexInConditions !== conditionIndex);
        return {
          ...rule,
          conditions: nextConditions.length ? nextConditions : [newLogicCondition(0)],
        };
      }),
    }));
  }

  function toggleLogicConditionField(ruleIndex, conditionIndex, fieldKey) {
    setDraft((current) => ({
      ...current,
      logic_rules: cloneLogicRules(current.logic_rules).map((rule, index) => {
        if (index !== ruleIndex) return rule;
        return {
          ...rule,
          conditions: rule.conditions.map((condition, indexInConditions) => {
            if (indexInConditions !== conditionIndex) return condition;
            const hasField = condition.field_keys.includes(fieldKey);
            return {
              ...condition,
              field_keys: hasField
                ? condition.field_keys.filter((key) => key !== fieldKey)
                : [...condition.field_keys, fieldKey],
            };
          }),
        };
      }),
    }));
  }

  function toggleLogicTargetField(ruleIndex, fieldKey) {
    setDraft((current) => ({
      ...current,
      logic_rules: cloneLogicRules(current.logic_rules).map((rule, index) => {
        if (index !== ruleIndex) return rule;
        const hasField = rule.target_field_keys.includes(fieldKey);
        return {
          ...rule,
          target_field_keys: hasField
            ? rule.target_field_keys.filter((key) => key !== fieldKey)
            : [...rule.target_field_keys, fieldKey],
        };
      }),
    }));
  }

  function removeLogicRule(ruleIndex) {
    setDraft((current) => ({
      ...current,
      logic_rules: cloneLogicRules(current.logic_rules).filter((_, index) => index !== ruleIndex),
    }));
  }

  function addPointMapping(sourceKey = "") {
    const nextId = Math.max(0, ...draft.points.map((point) => Number(point.point_id) || 0)) + 1;
    setDraft((current) => ({
      ...current,
      points: [...current.points, {
        point_id: nextId,
        name: sourceKey ? availableFieldLabel(sourceKey) : `Point ${nextId}`,
        area: "Machine",
        segment_id: current.segments[0]?.id || null,
        source_fields: [{
          id: `field-${Date.now()}-1`,
          label: "Field 1",
          source_key: sourceKey,
          value_rules: cloneFieldValueRules(DEFAULT_POINT_VALUE_RULES.primary),
          fallback: { ...DEFAULT_POINT_VALUE_RULES.fallback },
        }],
        source_key_primary: sourceKey,
        source_key_secondary: null,
        status_mode: "mapped_values",
        safe_config: { primary: "CLOSE", secondary: "LOCK" },
        value_rules: cloneValueRules(DEFAULT_POINT_VALUE_RULES),
        is_active: true,
      }],
    }));
  }


  function removePointMapping(index) {
    setDraft((current) => ({
      ...current,
      points: current.points.filter((_, pointIndex) => pointIndex !== index),
    }));
  }

  function handleImageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      setError("Use a PNG, JPEG, or WebP machine image.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("Machine image must be 12 MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        setDraft((current) => ({
          ...current,
          imagePreview: reader.result,
          image_base64: reader.result,
          image_mime_type: file.type,
          image_width: image.naturalWidth,
          image_height: image.naturalHeight,
        }));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  }


  async function saveConfiguration() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let segments = draft.segments;
      let points = draft.points;
      if (segmentDirty && (segmentDraft.name || segmentDraft.polygon_points.length)) {
        const committed = commitSegment(segments, segmentDraft);
        segments = committed.nextSegments;
        points = points.map((point) => ({
          ...point,
          segment_id: committed.pointIds.includes(Number(point.point_id))
            ? committed.savedSegment.id
            : point.segment_id === committed.savedSegment.id ? null : point.segment_id,
        }));
      }

      points = points.map(syncPointFieldsForSave);

      const response = await fetch(`/api/machines/${encodeURIComponent(draft.id)}/configuration`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          name: draft.name,
          description: draft.description,
          is_active: draft.is_active,
          config_revision: draft.config_revision,
          data_source: draft.data_source,
          logic_rules: cloneLogicRules(draft.logic_rules),
          image_base64: draft.image_base64 || undefined,
          image_mime_type: draft.image_mime_type,
          image_width: draft.image_width,
          image_height: draft.image_height,
          segments,
          points,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save machine configuration.");
      setMessage(`${data.machine.name} configuration saved to PostgreSQL.`);
      setSegmentDirty(false);
      await reload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function addMachine(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const machineId = segmentIdFromName(newMachine.name);
    try {
      const response = await fetch("/api/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          name: newMachine.name,
          id: machineId,
          data_source: {
            ...newSource(machineId),
            source_endpoint: newMachine.source_endpoint,
            source_topic: newMachine.source_topic,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to add machine.");
      setNewMachine({ name: "", source_endpoint: "", source_topic: "" });
      setMessage(`${data.machine.name} added. Upload its image and map its segments next.`);
      await reload();
      setSelectedMachineId(data.machine.id);
      setAddMachineOpen(false);
      setEditorOpen(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  const detectedFieldKeys = [...new Set(availableFields.map((field) => field.key).filter(Boolean))];
  const activeRulesPointIndex = draft.points.findIndex((point) => Number(point.point_id) === Number(rulesPointId));
  const activeRulesPoint = activeRulesPointIndex >= 0 ? draft.points[activeRulesPointIndex] : null;
  const activeGalleryItem = galleryItems[galleryIndex] || galleryItems[0];
  const previousGalleryItem = galleryIndex > 0 ? galleryItems[galleryIndex - 1] : null;
  const nextGalleryItem = galleryIndex < galleryItems.length - 1 ? galleryItems[galleryIndex + 1] : null;

  if (actionsRef) {
    actionsRef.current = { showMachineGallery, saveConfiguration };
  }

  if (!editorOpen) {
    return (
      <div className="configurator-gallery">
        <header className="configurator-gallery-heading">
          <div>
            <span>Machine directory</span>
            <h1>Select a machine to configure</h1>
          </div>
        </header>

        {message && <div className="configurator-notice success gallery-notice">{message}</div>}
        {error && <div className="configurator-notice error gallery-notice">{error}</div>}

        <div className="configurator-card-stage">
          <div
            className={`configurator-machine-swipe ${gallerySwipeActive ? "is-swiping" : ""}`}
            aria-label="Machine setup selector. Swipe or drag to browse."
            style={{ "--gallery-swipe-offset": `${gallerySwipeOffset}px` }}
            onPointerDown={startGallerySwipe}
            onPointerMove={moveGallerySwipe}
            onPointerUp={finishGallerySwipe}
            onPointerCancel={finishGallerySwipe}
            onClickCapture={(event) => {
              if (!gallerySwipeGesture.current.ignoreClick) return;
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {previousGalleryItem ? (
              <button
                type="button"
                className="configurator-swipe-preview previous"
                onClick={() => moveGalleryTo(galleryIndex - 1)}
                aria-label="Previous machine"
              >
                <span className="configurator-swipe-direction">← Previous</span>
                <span className="configurator-swipe-preview-content floating-media">
                  {!previousGalleryItem.isAddMore && previousGalleryItem.image?.url && (
                    <img src={previousGalleryItem.image.url} alt="" />
                  )}
                  {!previousGalleryItem.isAddMore && !previousGalleryItem.image?.url && <span className="configurator-image-no-data">No Data</span>}
                  {previousGalleryItem.isAddMore && <i aria-hidden="true">+</i>}
                  <strong>{previousGalleryItem.name}</strong>
                </span>
              </button>
            ) : (
              <div className="configurator-swipe-empty" aria-hidden="true" />
            )}

            <button
              key={activeGalleryItem?.id}
              type="button"
              className={`configurator-swipe-current ${activeGalleryItem?.isAddMore ? "add-more" : ""}`}
              onClick={() => openGalleryItem(activeGalleryItem)}
            >
              <span className="configurator-swipe-image floating-media">
                {activeGalleryItem?.isAddMore ? (
                  <i aria-hidden="true">+</i>
                ) : activeGalleryItem?.image?.url ? (
                  <img src={activeGalleryItem.image.url} alt={`${activeGalleryItem?.name || "Machine"} machine`} />
                ) : (
                  <span className="configurator-image-no-data">No Data</span>
                )}
              </span>
              <span className="configurator-swipe-copy">
                <small>{activeGalleryItem?.isAddMore ? "New machine" : `Machine ${String(galleryIndex + 1).padStart(2, "0")} / ${String(machines.length).padStart(2, "0")}`}</small>
                <strong>{activeGalleryItem?.name}</strong>
                <span>{activeGalleryItem?.isAddMore ? "Prepare another machine" : "Open machine setup"} <b aria-hidden="true">→</b></span>
              </span>
            </button>

            <button
              type="button"
              className="configurator-swipe-preview next"
              onClick={() => moveGalleryTo(galleryIndex + 1)}
              disabled={!nextGalleryItem}
              aria-label="Next machine"
            >
              <span className="configurator-swipe-direction">Next →</span>
              <span className="configurator-swipe-preview-content floating-media">
                {nextGalleryItem && !nextGalleryItem.isAddMore && nextGalleryItem.image?.url && (
                  <img src={nextGalleryItem.image.url} alt="" />
                )}
                {nextGalleryItem && !nextGalleryItem.isAddMore && !nextGalleryItem.image?.url && <span className="configurator-image-no-data">No Data</span>}
                {nextGalleryItem?.isAddMore && <i aria-hidden="true">+</i>}
                <strong>{nextGalleryItem?.name || "End of list"}</strong>
              </span>
            </button>
          </div>

          <div className="configurator-swipe-progress" aria-label={`${galleryIndex + 1} of ${galleryItems.length}`}>
            {galleryItems.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={index === galleryIndex ? "active" : ""}
                onClick={() => moveGalleryTo(index)}
                aria-label={`Show ${item.name}`}
              />
            ))}
          </div>
        </div>

        {addMachineOpen && (
          <div className="configurator-add-backdrop" onClick={() => setAddMachineOpen(false)}>
            <form className="configurator-add-dialog" onSubmit={addMachine} onClick={(event) => event.stopPropagation()}>
              <div className="configurator-add-heading"><div><span>New machine</span><h2>Add to monitoring</h2></div><button type="button" onClick={() => setAddMachineOpen(false)}>×</button></div>
              <label>Machine name<input value={newMachine.name} onChange={(event) => setNewMachine((current) => ({ ...current, name: event.target.value }))} placeholder="Example: Mespack 2" required /></label>
              <label>MQTT broker URL<input value={newMachine.source_endpoint} onChange={(event) => setNewMachine((current) => ({ ...current, source_endpoint: event.target.value }))} placeholder="mqtt://broker:1883" /></label>
              <label>MQTT topic<input value={newMachine.source_topic} onChange={(event) => setNewMachine((current) => ({ ...current, source_topic: event.target.value }))} placeholder="factory/dressings/mespack-2/data" /></label>
              <div className="configurator-add-actions"><button type="button" onClick={() => setAddMachineOpen(false)}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? "Adding…" : "Add machine"}</button></div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="configurator-layout editor-open">
      <section className="configurator-main">
        {message && <div className="configurator-notice success">{message}</div>}
        {error && <div className="configurator-notice error">{error}</div>}

        <div className="configurator-scroll">
          <section className="configurator-section identity-source-section">
            <div className="configurator-section-heading"><span>Step 1</span><div><strong>Machine connection</strong><small>Machine identity and MQTT source</small></div></div>
            <div className="configurator-form-grid">
              <label>Machine name<input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} /></label>
              <label>MQTT broker URL<input value={draft.data_source.source_endpoint || ""} onChange={(event) => updateSource("source_endpoint", event.target.value)} placeholder="mqtt://broker:1883" /></label>
              <label>MQTT topic<input value={draft.data_source.source_topic || ""} onChange={(event) => updateSource("source_topic", event.target.value)} placeholder="factory/mespack/data" /></label>
            </div>
          </section>

          <section className="configurator-section image-segment-section">
            <div className="configurator-section-heading"><span>Step 2</span><div><strong>Machine image and segments</strong><small>Click the image to draw the selected segment</small></div></div>
            <div className="segment-workbench">
              <div className="segment-canvas-column">
                <div className="segment-editor-canvas floating-media" style={{ aspectRatio: FIXED_MACHINE_CANVAS_ASPECT }} onClick={addPolygonPoint}>
                  {draft.imagePreview ? (
                    <img src={draft.imagePreview} alt="Machine segmentation editor" />
                  ) : (
                    <div className="segment-editor-no-data">No Data</div>
                  )}
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    {draft.segments.map((segment) => (
                      <polygon
                        key={segment.id}
                        points={polygonToSvgPoints(segment.polygon_points)}
                        className={segment.id === segmentDraft.id ? "selected" : ""}
                        onClick={(event) => { event.stopPropagation(); chooseSegment(segment); }}
                      />
                    ))}
                    {segmentDraft.polygon_points.length > 0 && (
                      <polygon className="editing" points={polygonToSvgPoints(segmentDraft.polygon_points)} />
                    )}
                  </svg>
                  {segmentDraft.polygon_points.map(([x, y], index) => (
                    <i key={`${x}-${y}-${index}`} style={{ left: `${x}%`, top: `${y}%` }}>{index + 1}</i>
                  ))}
                </div>
              </div>

              <div className="segment-editor-panel">
                <div className="segment-editor-toolbar">
                  <strong>Segment settings</strong>
                  <button onClick={startNewSegment}>+ New</button>
                </div>
                <label>Choose segment
                  <select
                    className="segment-select"
                    value={segmentDraft.id || ""}
                    onChange={(event) => {
                      const selected = draft.segments.find((segment) => segment.id === event.target.value);
                      if (selected) chooseSegment(selected);
                      else startNewSegment();
                    }}
                  >
                    <option value="">New segment</option>
                    {draft.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
                  </select>
                </label>
                <label>Segment name<input value={segmentDraft.name} onChange={(event) => { setSegmentDraft((current) => ({ ...current, name: event.target.value, id: current.id || segmentIdFromName(event.target.value) })); setSegmentDirty(true); }} placeholder="Example: Infeed" /></label>
                <label>Area / location<input value={segmentDraft.area} onChange={(event) => { setSegmentDraft((current) => ({ ...current, area: event.target.value })); setSegmentDirty(true); }} placeholder="Infeed Section" /></label>
                <div className="segment-drawing-tools">
                  <span>{segmentDraft.polygon_points.length} points</span>
                  <button onClick={() => { setSegmentDraft((current) => ({ ...current, polygon_points: current.polygon_points.slice(0, -1) })); setSegmentDirty(true); }} disabled={!segmentDraft.polygon_points.length}>Undo</button>
                  <button onClick={() => { setSegmentDraft((current) => ({ ...current, polygon_points: [] })); setSegmentDirty(true); }} disabled={!segmentDraft.polygon_points.length}>Clear</button>
                </div>
                <label className="machine-image-upload">Replace machine image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageFile} /></label>
                <div className="segment-editor-actions"><button onClick={deleteSegment} disabled={!segmentDraft.id}>Delete</button><button className="primary" onClick={saveSegmentToDraft}>Add / update segment</button></div>
              </div>
            </div>
          </section>

          <section className="configurator-section point-mapping-section">
            <div className="configurator-section-heading">
              <span>Step 3</span>
              <div><strong>Data Mapping</strong></div>
              <div className="point-add-controls">
                <select defaultValue="" onChange={(event) => { if (event.target.value) addPointMapping(event.target.value); event.target.value = ""; }}>
                  <option value="">+ Detected data</option>
                  {detectedFieldKeys.map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
                <button onClick={() => addPointMapping()}>+ Blank</button>
              </div>
            </div>
            <datalist id={`available-data-${draft.id}`}>{detectedFieldKeys.map((key) => <option key={key} value={key} />)}</datalist>
            <div className="point-mapping-table flexible-fields" aria-label="Machine data mappings">
              <div className="point-mapping-head"><span>No.</span><span>Point name</span><span>Fields</span><span>Segment</span><span>Value meaning</span><span /></div>
              {draft.points.map((point, index) => {
                const fields = normalizePointSourceFields(point);
                return (
                  <div className="point-mapping-entry" key={`${point.point_id}-${index}`}>
                    <div className="point-mapping-row">
                      <input type="number" value={point.point_id} onChange={(event) => updatePoint(index, "point_id", event.target.value)} />
                      <input value={point.name || ""} onChange={(event) => updatePoint(index, "name", event.target.value)} />
                      <div className="point-fields-cell">
                        {fields.map((field, fieldIndex) => (
                          <div className="point-field-row" key={field.id || fieldIndex}>
                            <span>{fieldIndex + 1}</span>
                            <input
                              list={`available-data-${draft.id}`}
                              value={field.source_key || ""}
                              onChange={(event) => updatePointSourceField(index, fieldIndex, "source_key", event.target.value)}
                              placeholder="MQTT field"
                            />
                            <div className="point-field-actions">
                              {fieldIndex === fields.length - 1 && (
                                <button
                                  type="button"
                                  className="point-add-field-button"
                                  onClick={() => addPointSourceField(index)}
                                  aria-label="Add another field"
                                  title="Add field"
                                >+</button>
                              )}
                              {fields.length > 1 && (
                                <button
                                  type="button"
                                  className="point-remove-field-button"
                                  onClick={() => removePointSourceField(index, fieldIndex)}
                                  aria-label={`Remove field ${fieldIndex + 1}`}
                                  title="Remove field"
                                >×</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <select value={point.segment_id || ""} onChange={(event) => updatePoint(index, "segment_id", event.target.value || null)}>
                        <option value="">Unassigned</option>
                        {draft.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
                      </select>
                      <button className="point-meaning-button" onClick={() => setRulesPointId(point.point_id)}>Define values</button>
                      <button className="point-remove-button" onClick={() => removePointMapping(index)} aria-label={`Remove ${point.name}`}>×</button>
                    </div>
                  </div>
                );
              })}
              {!draft.points.length && <div className="point-mapping-empty">No Data</div>}
            </div>
          </section>

          <section className="configurator-section logic-rules-section">
            <div className="configurator-section-heading logic-rules-heading">
              <span>Step 4</span>
              <div>
                <strong>Logic Rules</strong>
                <small>Only use this when normal Data Mapping is not enough.</small>
              </div>
              <button type="button" className="logic-add-rule-button" onClick={addLogicRule}>+ Custom rule</button>
            </div>

            <div className="logic-scenario-library">
              <div className="logic-scenario-library-heading">
                <div>
                  <strong>Start from a common scenario</strong>
                  <span>Pick the situation that sounds closest. You can change the signals and values afterward.</span>
                </div>
              </div>
              <div className="logic-scenario-grid">
                {LOGIC_SCENARIOS.map((scenario) => (
                  <button
                    type="button"
                    className="logic-scenario-card"
                    key={scenario.id}
                    onClick={() => addLogicScenario(scenario.id)}
                  >
                    <span className="logic-scenario-badge">{scenario.badge}</span>
                    <strong>{scenario.title}</strong>
                    <small>{scenario.description}</small>
                    <em>{scenario.example}</em>
                    <b aria-hidden="true">Add scenario →</b>
                  </button>
                ))}
              </div>
            </div>

            <div className="logic-rule-list">
              {cloneLogicRules(draft.logic_rules).map((rule, ruleIndex) => {
                const availableKeys = [...new Set(
                  draft.points
                    .flatMap((point) => normalizePointSourceFields(point).map((field) => field.source_key))
                    .filter(Boolean),
                )];
                const scenarioInfo = LOGIC_SCENARIOS.find((scenario) => scenario.id === rule.template);

                return (
                  <article className="logic-rule-card" key={rule.id}>
                    <div className="logic-rule-topline">
                      <label className="logic-rule-name">
                        <span>Scenario name</span>
                        <input value={rule.name} onChange={(event) => updateLogicRule(ruleIndex, "name", event.target.value)} />
                      </label>
                      <label className="logic-rule-enabled">
                        <input type="checkbox" checked={rule.enabled} onChange={(event) => updateLogicRule(ruleIndex, "enabled", event.target.checked)} />
                        <span>Enabled</span>
                      </label>
                      <button type="button" className="logic-rule-delete" onClick={() => removeLogicRule(ruleIndex)}>Delete</button>
                    </div>

                    <div className="logic-plain-summary">
                      <span>In plain English</span>
                      <strong>{logicRuleSentence(rule)}</strong>
                      {scenarioInfo && <small>{scenarioInfo.example}</small>}
                    </div>

                    <div className="logic-builder">
                      <section className="logic-builder-block logic-when-block">
                        <header>
                          <div>
                            <span>1 · SITUATION</span>
                            <strong>Describe when this special rule should happen</strong>
                          </div>
                          {rule.conditions.length > 1 && (
                            <label className="logic-condition-join">
                              <span>Between requirements</span>
                              <select value={rule.condition_join} onChange={(event) => updateLogicRule(ruleIndex, "condition_join", event.target.value)}>
                                <option value="all">ALL must be true</option>
                                <option value="any">ANY can be true</option>
                              </select>
                            </label>
                          )}
                        </header>

                        <div className="logic-condition-list">
                          {rule.conditions.map((condition, conditionIndex) => (
                            <div className="logic-condition-card" key={condition.id || conditionIndex}>
                              <div className="logic-condition-number">{conditionIndex + 1}</div>

                              <div className="logic-condition-body">
                                <div className="logic-condition-type-row">
                                  <label>
                                    <span>This requirement checks</span>
                                    <select
                                      value={condition.type}
                                      onChange={(event) => updateLogicCondition(ruleIndex, conditionIndex, "type", event.target.value)}
                                    >
                                      <option value="field">One signal</option>
                                      <option value="group">Several signals together</option>
                                    </select>
                                  </label>

                                  {rule.conditions.length > 1 && (
                                    <button
                                      type="button"
                                      className="logic-condition-remove"
                                      onClick={() => removeLogicCondition(ruleIndex, conditionIndex)}
                                      aria-label={`Remove requirement ${conditionIndex + 1}`}
                                    >×</button>
                                  )}
                                </div>

                                {condition.type === "field" ? (
                                  <div className="logic-human-line logic-field-condition">
                                    <span>When</span>
                                    <select
                                      value={condition.field_key}
                                      onChange={(event) => updateLogicCondition(ruleIndex, conditionIndex, "field_key", event.target.value)}
                                      aria-label="Signal"
                                    >
                                      <option value="">Choose signal</option>
                                      {availableKeys.map((fieldKey) => <option key={fieldKey} value={fieldKey}>{fieldKey}</option>)}
                                    </select>
                                    <select
                                      value={condition.operator}
                                      onChange={(event) => updateLogicCondition(ruleIndex, conditionIndex, "operator", event.target.value)}
                                      aria-label="Comparison"
                                    >
                                      <option value="equals">is</option>
                                      <option value="not_equals">is not</option>
                                    </select>
                                    <input
                                      value={condition.expected_value}
                                      onChange={(event) => updateLogicCondition(ruleIndex, conditionIndex, "expected_value", event.target.value)}
                                      placeholder="Value"
                                      aria-label="Expected value"
                                    />
                                  </div>
                                ) : (
                                  <div className="logic-group-condition">
                                    <div className="logic-human-line logic-group-sentence">
                                      <span>When</span>
                                      <select
                                        value={condition.comparator}
                                        onChange={(event) => updateLogicCondition(ruleIndex, conditionIndex, "comparator", event.target.value)}
                                        aria-label="Group comparison"
                                      >
                                        <option value="exactly">Exactly</option>
                                        <option value="at_least">At least</option>
                                        <option value="at_most">At most</option>
                                        <option value="all">All</option>
                                        <option value="any">Any</option>
                                      </select>
                                      {!['all', 'any'].includes(condition.comparator) && (
                                        <input
                                          type="number"
                                          min="0"
                                          max={Math.max(1, condition.field_keys.length)}
                                          value={condition.count}
                                          onChange={(event) => updateLogicCondition(ruleIndex, conditionIndex, "count", event.target.value)}
                                          aria-label="How many signals"
                                        />
                                      )}
                                      <span>of the selected signals are</span>
                                      <input
                                        value={condition.expected_value}
                                        onChange={(event) => updateLogicCondition(ruleIndex, conditionIndex, "expected_value", event.target.value)}
                                        placeholder="Value"
                                        aria-label="Expected group value"
                                      />
                                    </div>

                                    <details className="logic-field-selector" open>
                                      <summary>
                                        Select the signals for this scenario
                                        <span>{condition.field_keys.length} selected</span>
                                      </summary>
                                      <div>
                                        {availableKeys.length ? availableKeys.map((fieldKey) => (
                                          <label key={fieldKey}>
                                            <input
                                              type="checkbox"
                                              checked={condition.field_keys.includes(fieldKey)}
                                              onChange={() => toggleLogicConditionField(ruleIndex, conditionIndex, fieldKey)}
                                            />
                                            <span>{fieldKey}</span>
                                          </label>
                                        )) : <p>No Data</p>}
                                      </div>
                                    </details>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <button type="button" className="logic-add-condition" onClick={() => addLogicCondition(ruleIndex)}>+ Add another requirement</button>
                      </section>

                      <section className="logic-builder-block logic-then-block">
                        <header>
                          <div>
                            <span>2 · RESULT</span>
                            <strong>Tell the dashboard what this situation means</strong>
                          </div>
                        </header>

                        <div className="logic-outcome-grid">
                          <label>
                            <span>When the situation above is true</span>
                            <select value={rule.action} onChange={(event) => updateLogicRule(ruleIndex, "action", event.target.value)}>
                              <option value="safe">Show as Good</option>
                              <option value="warning">Show as Warning</option>
                              <option value="danger">Show as Critical</option>
                              <option value="neutral">Show as Information</option>
                              <option value="ignore">Ignore the status</option>
                            </select>
                          </label>

                          <label>
                            <span>Which signals should this affect?</span>
                            <select value={rule.target_mode} onChange={(event) => updateLogicRule(ruleIndex, "target_mode", event.target.value)}>
                              <option value="conditions">The signals used above</option>
                              <option value="selected">Let me choose different signals</option>
                            </select>
                          </label>
                        </div>

                        {rule.target_mode === "selected" && (
                          <details className="logic-field-selector logic-target-selector" open>
                            <summary>
                              Select the signals affected by the result
                              <span>{rule.target_field_keys.length} selected</span>
                            </summary>
                            <div>
                              {availableKeys.length ? availableKeys.map((fieldKey) => (
                                <label key={fieldKey}>
                                  <input
                                    type="checkbox"
                                    checked={rule.target_field_keys.includes(fieldKey)}
                                    onChange={() => toggleLogicTargetField(ruleIndex, fieldKey)}
                                  />
                                  <span>{fieldKey}</span>
                                </label>
                              )) : <p>No Data</p>}
                            </div>
                          </details>
                        )}

                        <div className="logic-else-note">
                          <b>If this situation is NOT true</b>
                          <span>Nothing special happens — the normal Data Mapping result is used.</span>
                        </div>
                      </section>
                    </div>
                  </article>
                );
              })}

              {!cloneLogicRules(draft.logic_rules).length && (
                <div className="logic-rule-empty">
                  <strong>No special scenarios added</strong>
                  <span>Your normal Data Mapping will be used for everything. Pick one of the common scenarios above only when you need an exception.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      {activeRulesPoint && (
        <div className="value-rules-modal-backdrop" role="presentation" onClick={() => setRulesPointId(null)}>
          <div className="value-rules-modal-shell" role="dialog" aria-modal="true" aria-label={`Value meanings for ${activeRulesPoint.name}`} onClick={(event) => event.stopPropagation()}>
            <PointValueRulesEditor
              point={activeRulesPoint}
              pointIndex={activeRulesPointIndex}
              onUpdate={updateFieldValueRule}
              onAdd={addFieldValueRule}
              onRemove={removeFieldValueRule}
              onFallbackUpdate={updateFieldFallback}
              onClose={() => setRulesPointId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PointValueRulesEditor({ point, pointIndex, onUpdate, onAdd, onRemove, onFallbackUpdate, onClose }) {
  const fields = normalizePointSourceFields(point);

  return (
    <section className="point-value-rules" aria-label={`Value meanings for ${point.name}`}>
      <header>
        <div>
          <strong>Incoming value meanings</strong>
          <small>Define what each received value means for every field attached to this point.</small>
        </div>
        <div className="value-rule-header-actions">
          <span>{point.name}</span>
          <button type="button" onClick={onClose} aria-label="Close value meanings">×</button>
        </div>
      </header>

      <div className={`value-rule-channels ${fields.length === 1 ? "single" : ""}`}>
        {fields.map((field, fieldIndex) => (
          <div className="value-rule-channel" key={field.id || fieldIndex}>
            <div className="value-rule-channel-heading">
              <div><strong>Field {fieldIndex + 1}</strong><small>{field.source_key || "No Data"}</small></div>
              <button onClick={() => onAdd(pointIndex, fieldIndex)}>+ Value</button>
            </div>
            <div className="value-rule-head"><span>Raw value</span><span>Display label</span><span>Condition</span><span>Color</span><span /></div>
            {field.value_rules.map((rule, ruleIndex) => (
              <div className="value-rule-row" key={`${field.id}-${ruleIndex}`}>
                <input value={rule.value ?? ""} onChange={(event) => onUpdate(pointIndex, fieldIndex, ruleIndex, "value", event.target.value)} placeholder="1 or 0" />
                <input value={rule.label || ""} onChange={(event) => onUpdate(pointIndex, fieldIndex, ruleIndex, "label", event.target.value)} placeholder="Closed" />
                <select value={rule.severity || "safe"} onChange={(event) => onUpdate(pointIndex, fieldIndex, ruleIndex, "severity", event.target.value)}>
                  {VALUE_SEVERITIES.map((severity) => <option key={severity.value} value={severity.value}>{severity.label}</option>)}
                </select>
                <input className="value-rule-color" type="color" value={rule.color || "#22c55e"} onChange={(event) => onUpdate(pointIndex, fieldIndex, ruleIndex, "color", event.target.value)} aria-label="Status color" />
                <button onClick={() => onRemove(pointIndex, fieldIndex, ruleIndex)} aria-label="Remove value meaning">×</button>
              </div>
            ))}
            {!field.value_rules.length && <div className="value-rule-empty">No Data</div>}
            <div className="value-rule-fallback field-fallback">
              <div><strong>Unmatched value</strong><small>Used when this field sends another value.</small></div>
              <input value={field.fallback?.label || ""} onChange={(event) => onFallbackUpdate(pointIndex, fieldIndex, "label", event.target.value)} placeholder="Unknown" />
              <select value={field.fallback?.severity || "warning"} onChange={(event) => onFallbackUpdate(pointIndex, fieldIndex, "severity", event.target.value)}>
                {VALUE_SEVERITIES.map((severity) => <option key={severity.value} value={severity.value}>{severity.label}</option>)}
              </select>
              <input className="value-rule-color" type="color" value={field.fallback?.color || "#f59e0b"} onChange={(event) => onFallbackUpdate(pointIndex, fieldIndex, "color", event.target.value)} aria-label="Fallback color" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LegacyDashboardApp({
  machineCatalog,
  accessRole,
  theme,
  setTheme,
  onOpenAdmin,
  onOpenMachineSetup,
}) {
  const [activeMachineId, setActiveMachineId] = useState("");
  const [machineData, setMachineData] = useState(null);
  const [apiError, setApiError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [machinePickerOpen, setMachinePickerOpen] = useState(false);
  const [machineImageAspect, setMachineImageAspect] = useState(FIXED_MACHINE_CANVAS_ASPECT);
  const [faceModalOpen, setFaceModalOpen] = useState(false);
  const [confirmToast, setConfirmToast] = useState("");
  const [machineSwipeOffset, setMachineSwipeOffset] = useState(0);
  const [machineSwipeActive, setMachineSwipeActive] = useState(false);
  const machineSwipeGesture = useRef({ active: false, startX: 0, dragged: false, ignoreClick: false });

  const machineConfigs = useMemo(() => {
    const configured = (machineCatalog || []).filter((machine) => machine.is_active !== false);
    return configured.reduce((result, machine) => {
      const databasePoints = (machine.points || []).filter((point) => point.is_active !== false);
      const databaseZones = (machine.segments || []).filter((segment) => segment.is_active !== false);
      result[machine.id] = {
        id: machine.id,
        name: machine.name || "No Data",
        title: machine.name || "No Data",
        subtitle: machine.description || "",
        apiUrl: machine.api_url || `/api/machines/${encodeURIComponent(machine.id)}/data`,
        image: machine.image?.url || "",
        canvasAspectRatio: Number(machine.image?.canvas_aspect_ratio || FIXED_MACHINE_CANVAS_ASPECT),
        points: databasePoints.map(machinePointFromDatabase),
        zones: databaseZones.map(machineZoneFromDatabase),
        dataSource: machine.data_source || null,
        logicRules: cloneLogicRules(machine.logic_rules),
      };
      return result;
    }, {});
  }, [machineCatalog]);

  const activeMachine = machineConfigs[activeMachineId] || Object.values(machineConfigs)[0] || {
    id: "no-data",
    name: "No Data",
    apiUrl: "",
    image: "",
    canvasAspectRatio: FIXED_MACHINE_CANVAS_ASPECT,
    points: [],
    zones: [],
    logicRules: [],
  };

  useEffect(() => {
    if (!machineConfigs[activeMachineId]) {
      setActiveMachineId(Object.keys(machineConfigs)[0] || "no-data");
    }
  }, [machineConfigs, activeMachineId]);

  function showConfirmationToast(message) {
    setConfirmToast(message);
    window.clearTimeout(showConfirmationToast.timer);
    showConfirmationToast.timer = window.setTimeout(() => setConfirmToast(""), 3600);
  }

  /* =========================================================
     03 - FETCH HIGHBYTE / BACKEND DATA
  ========================================================= */

  async function fetchMachineData() {
    if (!activeMachine.apiUrl) {
      setMachineData(null);
      setApiError("");
      setLastUpdated(null);
      return;
    }
    try {
      const res = await fetch(activeMachine.apiUrl);
      if (!res.ok) throw new Error(`API error ${res.status}`);

      const data = await res.json();
      setMachineData(data);
      setApiError("");
      setLastUpdated(new Date());
    } catch (err) {
      setApiError(err.message);
    }
  }

  useEffect(() => {
    setMachineData(null);
    setApiError("");
    setSelectedPoint(null);
    setMachinePickerOpen(false);
    setMachineImageAspect(activeMachine.canvasAspectRatio || FIXED_MACHINE_CANVAS_ASPECT);

    if (!activeMachine.apiUrl) return undefined;
    fetchMachineData();

    const interval = setInterval(fetchMachineData, 1000);
    return () => clearInterval(interval);
  }, [activeMachineId, activeMachine.apiUrl, activeMachine.canvasAspectRatio]);


  const payload = machineData?.data || {};
  const logicOverrides = useMemo(
    () => evaluateLogicRules(activeMachine.logicRules, payload),
    [activeMachine.logicRules, payload],
  );

 /* =========================================================
   04 - BUILD LIVE MACHINE ROWS
   Converts real PLC tag values into frontend status values.

   PLC:
     SFI_DoorX = Guard ON / closed
     I_DoorXDiagnostic = Healthy ON

   Frontend:
     guardOpen = true means door is open
     interlockOk = true means healthy
========================================================= */

const machineRows = useMemo(() => {
  return activeMachine.points.map((point) => {
    const liveGuardOnValue = point.guardTag ? payloadValueAtPath(payload, point.guardTag) : undefined;
    const liveHealthyValue = point.interlockTag ? payloadValueAtPath(payload, point.interlockTag) : undefined;
    const liveOpenCloseValue = point.guardTag ? payloadValueAtPath(payload, `${point.guardTag}_OpenClose`) : undefined;
    const liveLockStateValue = point.interlockTag ? payloadValueAtPath(payload, `${point.interlockTag}_LockState`) : undefined;

    const openClose = normalizeOpenCloseState(liveOpenCloseValue)
      || normalizeOpenCloseState(liveGuardOnValue);
    const lockState = normalizeLockState(liveLockStateValue)
      || normalizeLockState(liveHealthyValue);
    const interpretation = pointInterpretation(point, payload, logicOverrides);
    const hasLiveData = (point.sourceFields || []).some((field) => payloadValueAtPath(payload, field.source_key) !== undefined)
      || liveOpenCloseValue !== undefined
      || liveLockStateValue !== undefined;

    return {
      ...point,
      openClose,
      lockState,
      guardOpen: openClose === "OPEN",
      interlockOk: lockState === "LOCK",
      interpretation,
      hasLiveData,
    };
  });
}, [payload, activeMachine, logicOverrides]);

  /* ====================================================   =====
     05 - LEFT PANEL ATTENTION LOGIC
     attentionRows = everything NOT READY / FAULT / WARNING
     readyRows     = READY only
  ========================================================= */

  /* =========================================================
     06 - BUILD MACHINE ZONES
     Groups the 39 points into 6 visual machine sections.
  ========================================================= */

  const zoneRows = useMemo(() => {
    return activeMachine.zones.map((zone) => {
      const zoneTags = machineRows.filter((tag) => zone.tagIds.includes(tag.id));
      const zoneState = getZoneState(zoneTags);

      return {
        ...zone,
        tags: zoneTags.slice().sort((first, second) => {
          const priority = { danger: 0, warning: 1, safe: 2 };
          const firstRank = priority[getSafetyState(first).className] ?? 3;
          const secondRank = priority[getSafetyState(second).className] ?? 3;
          return firstRank - secondRank || first.id - second.id;
        }),
        state: zoneState,
      };
    });
  }, [machineRows, activeMachine]);

  const machineList = Object.values(machineConfigs);
  const activeMachineIndex = Math.max(0, machineList.findIndex((machine) => machine.id === activeMachineId));
  const previousMachine = machineList.length > 1
    ? machineList[(activeMachineIndex - 1 + machineList.length) % machineList.length]
    : null;
  const nextMachine = machineList.length > 1
    ? machineList[(activeMachineIndex + 1) % machineList.length]
    : null;
  // Alternate segments across the rails so every count stays balanced:
  // 4 => 2/2, 3 => 2/1, 5 => 3/2. Rails with 3+ cards scroll internally.
  const leftZones = zoneRows.filter((_, index) => index % 2 === 0);
  const rightZones = zoneRows.filter((_, index) => index % 2 === 1);
  const zoneLayoutClass = rightZones.length ? "dual-rail" : leftZones.length ? "single-rail" : "no-rail";

  /* =========================================================
     08 - ZOOM CALCULATION
     Used when clicking a machine zone.
  ========================================================= */

  const activeZoomZone = selectedPoint?.type === "zone"
    ? {
        ...(zoneRows.find((zone) => zone.id === selectedPoint.id) || selectedPoint),
        focusedPointId: selectedPoint.focusedPointId,
      }
    : null;
  const zoomScale = activeZoomZone?.zoomScale || 1;
  const zoomX = activeZoomZone ? parsePercent(activeZoomZone.labelX) : 50;
  const zoomY = activeZoomZone ? parsePercent(activeZoomZone.labelY) : 50;

  const machineCanvasStyle = activeZoomZone
    ? {
        "--zoom-scale": zoomScale,
        "--zoom-pan-x": `${(50 - zoomX) * zoomScale}%`,
        "--zoom-pan-y": `${(50 - zoomY) * zoomScale}%`,
      }
    : {
        "--zoom-scale": 1,
        "--zoom-pan-x": "0%",
        "--zoom-pan-y": "0%",
      };

  /* =========================================================
     09 - CLICK HANDLERS
  ========================================================= */

  function selectZone(zone) {
    setSelectedPoint({
      type: "zone",
      ...zone,
    });
    setMachinePickerOpen(false);
  }

  function selectMachinePoint(point) {
    const parentZone = zoneRows.find((zone) => zone.tagIds.includes(point.id));

    if (parentZone) {
      setSelectedPoint({
        type: "zone",
        ...parentZone,
        focusedPointId: point.id,
      });
    }

    setMachinePickerOpen(false);
  }

  function resetView() {
    setSelectedPoint(null);
  }

  function cycleMachine(direction) {
    if (machineList.length < 2) return;
    const nextIndex = (activeMachineIndex + direction + machineList.length) % machineList.length;
    switchMachine(machineList[nextIndex].id);
  }

  function startMachineSwipe(event) {
    if (machineList.length < 2 || (event.pointerType === "mouse" && event.button !== 0)) return;
    machineSwipeGesture.current = {
      active: true,
      startX: event.clientX,
      dragged: false,
      ignoreClick: false,
      offset: 0,
    };
    setMachineSwipeActive(true);
  }

  function moveMachineSwipe(event) {
    if (!machineSwipeGesture.current.active) return;
    const distance = event.clientX - machineSwipeGesture.current.startX;
    if (!machineSwipeGesture.current.dragged && Math.abs(distance) < 7) return;
    machineSwipeGesture.current.dragged = true;
    machineSwipeGesture.current.ignoreClick = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const nextOffset = Math.max(-110, Math.min(110, distance));
    machineSwipeGesture.current.offset = nextOffset;
    setMachineSwipeOffset(nextOffset);
    event.preventDefault();
  }

  function finishMachineSwipe(event) {
    if (!machineSwipeGesture.current.active) return;
    const finalOffset = Number(machineSwipeGesture.current.offset || 0);
    const shouldSwitch = machineSwipeGesture.current.dragged && Math.abs(finalOffset) >= 54;
    const direction = finalOffset < 0 ? 1 : -1;
    machineSwipeGesture.current.active = false;
    setMachineSwipeActive(false);
    setMachineSwipeOffset(0);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (shouldSwitch) cycleMachine(direction);
    window.setTimeout(() => {
      machineSwipeGesture.current.ignoreClick = false;
      machineSwipeGesture.current.dragged = false;
    }, 0);
  }

  function switchMachine(machineId) {
    setActiveMachineId(machineId);
    setSelectedPoint(null);
    setMachinePickerOpen(false);
  }

  return (
    <div className="studio-app" data-theme={theme}>
      <header className="studio-topbar">
        <div className="studio-brand">
          <span className="studio-brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <strong>Machine Monitoring</strong>
        </div>

        <div className="studio-top-actions">
          <button
            className="studio-admin-button"
            onClick={accessRole === "admin" ? onOpenMachineSetup : onOpenAdmin}
          >
            Admin
          </button>
          <button
            className="studio-theme-button"
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <span>{theme === "dark" ? "☀" : "☾"}</span>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button className="studio-confirm-button" onClick={() => setFaceModalOpen(true)} disabled={!machineList.length}>
            <span>✓</span> Confirm check
          </button>
        </div>
      </header>

      <main className="studio-stage">
        <div
          className={`studio-machine-switcher studio-card-swipe ${machineSwipeActive ? "is-swiping" : ""}`}
          aria-label="Machine selector"
          style={{ "--swipe-offset": `${machineSwipeOffset}px` }}
          onPointerDown={startMachineSwipe}
          onPointerMove={moveMachineSwipe}
          onPointerUp={finishMachineSwipe}
          onPointerCancel={finishMachineSwipe}
          onClickCapture={(event) => {
            if (!machineSwipeGesture.current.ignoreClick) return;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button className="studio-machine-preview previous" onClick={() => cycleMachine(-1)} disabled={!previousMachine} aria-label="Previous machine">
            {previousMachine && <><span>← Previous</span><strong>{previousMachine.name}</strong></>}
          </button>
          <button
            key={activeMachine.id}
            type="button"
            className="studio-machine-card"
            onClick={() => setMachinePickerOpen((current) => !current)}
            aria-expanded={machinePickerOpen}
            aria-controls="studio-machine-picker"
          >
            <span className="studio-machine-card-image floating-media">{activeMachine.image ? <img src={activeMachine.image} alt="" /> : <small>No Data</small>}</span>
            <span className="studio-machine-card-copy">
              <small>Machine {String(activeMachineIndex + 1).padStart(2, "0")} / {String(machineList.length).padStart(2, "0")}</small>
              <strong>{activeMachine.name}<i aria-hidden="true">⌄</i></strong>
            </span>
          </button>
          <button className="studio-machine-preview next" onClick={() => cycleMachine(1)} disabled={!nextMachine} aria-label="Next machine">
            {nextMachine && <><span>Next →</span><strong>{nextMachine.name}</strong></>}
          </button>

          {machinePickerOpen && (
            <div className="studio-machine-picker" id="studio-machine-picker">
              <div className="studio-machine-picker-heading">
                <span>Available machines</span>
                <button type="button" onClick={() => setMachinePickerOpen(false)} aria-label="Close machine selector">×</button>
              </div>
              <div className="studio-machine-picker-list">
                {machineList.map((machine) => (
                  <button
                    type="button"
                    className={machine.id === activeMachineId ? "active" : ""}
                    key={machine.id}
                    onClick={() => switchMachine(machine.id)}
                  >
                    <span className="floating-media">{machine.image ? <img src={machine.image} alt="" /> : <small>No Data</small>}</span>
                    <strong>{machine.name}</strong>
                    <small>{machine.id === activeMachineId ? "Selected" : "Open machine"}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`studio-workspace ${zoneLayoutClass}`}>
          <ZoneStatusRail
            zones={leftZones}
            selectedPoint={selectedPoint}
            onZoneClick={selectZone}
            onPointClick={selectMachinePoint}
            side="left"
          />

          <section className="studio-machine-panel">
            <div className="studio-machine-caption">
              <div>
                <strong>{activeMachine.name}</strong>
              </div>
              <div className="studio-view-controls">
                <span
                  className={`studio-caption-connection ${machineData?.mqttConnected ? "online" : "offline"}`}
                  title={machineData?.mqttConnected
                    ? `MQTT connected${lastUpdated ? ` · ${lastUpdated.toLocaleTimeString()}` : ""}`
                    : apiError ? `Data unavailable · ${apiError}` : activeMachine.apiUrl ? "MQTT offline" : "No Data"}
                />
              </div>
            </div>

            <div className="studio-machine-frame">
            <div className={`machine-map ${activeZoomZone ? "zoomed" : ""}`}>
              <div className="machine-map-grid" />

              <div className="machine-zoom-layer">
                <div className="machine-stage machine-location-stage" key={activeMachine.id}>
                  <div
                    className={`machine-canvas floating-media ${
                      activeZoomZone ? "is-zoomed" : ""
                    }`}
                    style={{ ...machineCanvasStyle, aspectRatio: machineImageAspect }}
                  >
                    {activeMachine.image ? (
                      <img
                        src={activeMachine.image}
                        alt={activeMachine.name}
                        className="machine-img"
                      />
                    ) : (
                      <div className="machine-no-data">No Data</div>
                    )}

                    <svg
                      className="machine-svg-overlay"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      {zoneRows.map((zone) => (
                        <polygon
                          key={zone.id}
                          points={zone.points}
                          className={`machine-svg-zone ${zone.state.className} ${
                            selectedPoint?.type === "zone" &&
                            selectedPoint?.id === zone.id
                              ? "active"
                              : ""
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectZone(zone);
                          }}
                        />
                      ))}
                    </svg>

                    {zoneRows.map((zone) => (
                      <button
                        key={`${zone.id}-label`}
                        className={`machine-zone-label ${zone.state.className} ${
                          selectedPoint?.type === "zone" &&
                          selectedPoint?.id === zone.id
                            ? "active"
                            : ""
                        }`}
                        style={{
                          left: zone.labelX,
                          top: zone.labelY,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectZone(zone);
                        }}
                        title={`${zone.name} - ${zone.state.label}`}
                      >
                        {zone.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {activeZoomZone && (
                <div
                  className="studio-location-transition"
                  key={`${activeMachine.id}-${activeZoomZone.id}`}
                  aria-hidden="true"
                />
              )}
            </div>
            </div>
          </section>

          <ZoneStatusRail
            zones={rightZones}
            selectedPoint={selectedPoint}
            onZoneClick={selectZone}
            onPointClick={selectMachinePoint}
            side="right"
          />
        </div>
      </main>

      {activeZoomZone && (
        <ZoneDetailPanel
          key={`${activeMachine.id}-${activeZoomZone.id}-details`}
          machineName={activeMachine.name}
          zone={activeZoomZone}
          focusedPointId={selectedPoint?.focusedPointId}
          onPointClick={selectMachinePoint}
          onClose={resetView}
        />
      )}

      {faceModalOpen && (
        <ConfirmationModal
          machine={activeMachine}
          theme={theme}
          onClose={() => setFaceModalOpen(false)}
          onConfirmed={(message) => showConfirmationToast(message)}
        />
      )}

      {confirmToast && (
        <div className="confirm-toast">
          <span className="confirm-toast-dot">✓</span>
          <span>{confirmToast}</span>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   16 - SMALL COMPONENTS
========================================================= */

function ZoneDetailPanel({ machineName, zone, focusedPointId, onPointClick, onClose }) {
  const dangerCount = zone.tags.filter((tag) => getSafetyState(tag).className === "danger").length;
  const warningCount = zone.tags.filter((tag) => getSafetyState(tag).className === "warning").length;
  const readyCount = zone.tags.filter((tag) => getSafetyState(tag).className === "safe").length;

  return (
    <div className="studio-zone-detail-overlay" role="presentation" onClick={onClose}>
      <section
        className={`studio-zone-detail-card ${zone.state.className}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${zone.name} live details`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="studio-zone-detail-header">
          <div>
            <span>{machineName} · {zone.area || "Machine location"}</span>
            <h2>{zone.name}</h2>
          </div>
          <div className="studio-zone-detail-header-actions">
            <em className={zone.state.className}><i />{zone.state.label}</em>
            <button type="button" onClick={onClose} aria-label="Close location details">×</button>
          </div>
        </header>

        <div className="studio-zone-detail-metrics" aria-label="Location summary">
          <div><strong>{zone.tags.length}</strong><span>Monitored</span></div>
          <div className={dangerCount ? "danger" : ""}><strong>{dangerCount}</strong><span>Critical</span></div>
          <div className={warningCount ? "warning" : ""}><strong>{warningCount}</strong><span>Warning</span></div>
          <div className="safe"><strong>{readyCount}</strong><span>Ready</span></div>
        </div>

        <div className="studio-zone-detail-section-heading">
          <div>
            <strong>Live machine points</strong>
            <span>Alerts are shown first</span>
          </div>
          {(dangerCount > 0 || warningCount > 0) && (
            <small>{dangerCount + warningCount} need attention</small>
          )}
        </div>

        <div className="studio-zone-detail-list">
          {zone.tags.map((tag) => {
            const state = getSafetyState(tag);
            const isFocused = Number(focusedPointId) === Number(tag.id);
            const displayStates = tag.interpretation?.states?.length ? tag.interpretation.states : [
              { label: tag.openClose || "No Data", className: tag.openClose ? (tag.openClose === "OPEN" ? "warning" : "safe") : "neutral", color: null },
              { label: tag.lockState || "No Data", className: tag.lockState ? (tag.lockState === "UNLOCK" ? "danger" : "safe") : "neutral", color: null },
            ];

            return (
              <button
                type="button"
                className={`studio-zone-detail-row ${state.className} ${isFocused ? "focused" : ""}`}
                style={{ "--point-color": state.color || undefined }}
                key={tag.id}
                onClick={() => onPointClick(tag)}
              >
                <i />
                <span>
                  <strong>{tag.name}</strong>
                  <small>{tag.area || zone.area}</small>
                </span>
                <span className="studio-zone-detail-values">
                  {displayStates.map((displayState, index) => (
                    <em
                      className={displayState.className}
                      style={{ "--value-color": displayState.color || undefined }}
                      key={`${tag.id}-${index}`}
                    >
                      {displayState.label}
                    </em>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ZoneStatusRail({ zones, selectedPoint, onZoneClick, onPointClick, side }) {
  return (
    <aside
      className={`studio-zone-rail ${side} ${zones.length > 2 ? "scrolling" : ""}`}
      style={{ "--rail-rows": Math.max(1, zones.length) }}
      aria-label={`${side} machine sections`}
    >
      {zones.map((zone) => {
        const issueCount = zone.tags.filter((tag) => ["danger", "warning"].includes(getSafetyState(tag).className)).length;
        const zoneSelected = selectedPoint?.type === "zone" && selectedPoint?.id === zone.id;

        return (
          <section className={`studio-zone-card ${zone.state.className} ${zoneSelected ? "active" : ""}`} key={zone.id}>
            <button className="studio-zone-heading" type="button" onClick={() => onZoneClick(zone)}>
              <span>
                <strong>{zone.name}</strong>
                <small>{zone.tags.length} points</small>
              </span>
              <em className={zone.state.className}>{issueCount ? `${issueCount} alert${issueCount === 1 ? "" : "s"}` : zone.state.label}</em>
            </button>

            <div className="studio-zone-points">
              {zone.tags.map((tag) => {
                const state = getSafetyState(tag);
                const isSelected = Number(selectedPoint?.focusedPointId) === Number(tag.id);
                const stateSummary = tag.interpretation?.states?.map((item) => item.label).join(" · ")
                  || `${tag.openClose || "No Data"} · ${tag.lockState || "No Data"}`;
                return (
                  <button
                    type="button"
                    className={`studio-point-row ${state.className} ${isSelected ? "active" : ""}`}
                    style={{ "--point-color": state.color || undefined }}
                    key={tag.id}
                    onClick={() => onPointClick(tag)}
                    title={`${tag.name}: ${stateSummary}`}
                  >
                    <i />
                    <span>{tag.name}</span>
                    <small>{stateSummary}</small>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </aside>
  );
}


/* =========================================================
   17 - STATUS LOGIC
   Your final mapping:
   Healthy ON  + Guard ON  = READY / Green
   Healthy OFF + Guard OFF = NOT READY / Red
   Healthy OFF + Guard ON  = FAULT / Red
   Healthy ON  + Guard OFF = NOT READY / Yellow
========================================================= */

function getSafetyState(point) {
  if (!point?.hasLiveData) {
    return { label: "No Data", className: "neutral", color: "#64748b" };
  }
  if (point.interpretation?.overall) {
    return {
      label: point.interpretation.overall.label,
      className: point.interpretation.overall.className,
      color: point.interpretation.overall.color,
    };
  }

  const openClose = point.openClose || (point.guardOpen ? "OPEN" : "CLOSE");
  const lockState = point.lockState || (point.interlockOk ? "LOCK" : "UNLOCK");
  const isClosed = openClose === "CLOSE";
  const isLocked = lockState === "LOCK";

  if (isClosed && isLocked) {
    return {
      label: "Ready",
      className: "safe",
    };
  }

  if (!isLocked) {
    return {
      label: isClosed ? "Unlocked" : "Open / Unlock",
      className: "danger",
    };
  }

  if (!isClosed) {
    return {
      label: "Open",
      className: "warning",
    };
  }

  return {
    label: "Unknown",
    className: "warning",
  };
}

function getZoneState(tags) {
  if (!tags.length) return { label: "No Data", className: "neutral" };
  const states = tags.map((tag) => getSafetyState(tag));
  if (states.every((state) => state.className === "neutral")) {
    return { label: "No Data", className: "neutral" };
  }
  const hasDanger = states.some((state) => state.className === "danger");
  const hasWarning = states.some((state) => state.className === "warning");
  const hasNeutral = states.some((state) => state.className === "neutral");

  if (hasDanger) {
    return {
      label: "Critical",
      className: "danger",
    };
  }

  if (hasWarning) {
    return {
      label: "Attention",
      className: "warning",
    };
  }

  if (hasNeutral) return { label: "Monitoring", className: "neutral" };

  return {
    label: "Ready",
    className: "safe",
  };
}


function normalizeOpenCloseState(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "CLOSE" : "OPEN";
  if (typeof value === "number") return value === 1 ? "CLOSE" : value === 0 ? "OPEN" : null;
  const text = String(value).trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (["close", "closed", "guard on", "door closed", "1", "true", "on", "safe", "ready"].includes(text)) return "CLOSE";
  if (["open", "opened", "guard off", "door open", "0", "false", "off", "unsafe"].includes(text)) return "OPEN";
  return null;
}

function normalizeLockState(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "LOCK" : "UNLOCK";
  if (typeof value === "number") return value === 1 ? "LOCK" : value === 0 ? "UNLOCK" : null;
  const text = String(value).trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (["lock", "locked", "interlock", "interlock ok", "healthy", "ok", "1", "true", "on", "safe", "ready"].includes(text)) return "LOCK";
  if (["unlock", "unlocked", "interlock fault", "fault", "diagnostic", "trip", "0", "false", "off"].includes(text)) return "UNLOCK";
  return null;
}

function toBool(value) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const text = String(value).trim().toLowerCase();

  if (["true", "yes", "on", "close", "closed", "locked", "running", "ok"].includes(text)) {
    return true;
  }

  if (["false", "no", "off", "open", "opened", "unlock", "unlocked", "stopped", "fault"].includes(text)) {
    return false;
  }

  return Boolean(value);
}

function parsePercent(value) {
  return Number(String(value).replace("%", ""));
}
