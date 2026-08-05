import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import machineImage from "./assets/machine.png";
import { AdminHome, ConfirmationModal, OperatorAdminPage } from "./OperatorExperience";

const Machine3DView = lazy(() => import("./Machine3DView"));

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

const MACHINE_POINTS = [
  { id: 1, name: "Unwinder Door 1", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door1", interlockTag: "I_Door1Diagnostic" },
  { id: 2, name: "Unwinder Door 2", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door2", interlockTag: "I_Door2Diagnostic" },
  { id: 3, name: "Machine Door 3", area: "Main Machine", guardOpen: false, interlockOk: true, guardTag: "SFI_Door3", interlockTag: "I_Door3Diagnostic" },
  { id: 4, name: "Machine Door 4", area: "Main Machine", guardOpen: false, interlockOk: true, guardTag: "SFI_Door4", interlockTag: "I_Door4Diagnostic" },
  { id: 5, name: "Machine Door 5", area: "Main Machine", guardOpen: false, interlockOk: true, guardTag: "SFI_Door5", interlockTag: "I_Door5Diagnostic" },
  { id: 6, name: "Machine Door 6", area: "Main Machine", guardOpen: false, interlockOk: true, guardTag: "SFI_Door6", interlockTag: "I_Door6Diagnostic" },
  { id: 7, name: "Machine Door 7", area: "Main Machine", guardOpen: false, interlockOk: true, guardTag: "SFI_Door7", interlockTag: "I_Door7Diagnostic" },
  { id: 8, name: "Machine Door 8", area: "Main Machine", guardOpen: false, interlockOk: true, guardTag: "SFI_Door8", interlockTag: "I_Door8Diagnostic" },
  { id: 9, name: "Machine Door 9", area: "Main Machine", guardOpen: false, interlockOk: true, guardTag: "SFI_Door9", interlockTag: "I_Door9Diagnostic" },
  { id: 10, name: "Machine Door 10", area: "Main Machine", guardOpen: false, interlockOk: true, guardTag: "SFI_Door10", interlockTag: "I_Door10Diagnostic" },
  { id: 11, name: "Machine Door 11", area: "Main Machine", guardOpen: false, interlockOk: true, guardTag: "SFI_Door11", interlockTag: "I_Door11Diagnostic" },
  { id: 12, name: "Machine Door 12", area: "Main Machine", guardOpen: true, interlockOk: true, guardTag: "SFI_Door12", interlockTag: "I_Door12Diagnostic" },
  { id: 13, name: "Unwinder Door 13", area: "Unwinder Section", guardOpen: true, interlockOk: true, guardTag: "SFI_Door13", interlockTag: "I_Door13Diagnostic" },
  { id: 14, name: "Unwinder Door 14", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door14", interlockTag: "I_Door14Diagnostic" },
  { id: 15, name: "Unwinder Door 15", area: "Unwinder Section", guardOpen: false, interlockOk: false, guardTag: "SFI_Door15", interlockTag: "I_Door15Diagnostic" },
  { id: 16, name: "Unwinder Door 16", area: "Unwinder Section", guardOpen: false, interlockOk: false, guardTag: "SFI_Door16", interlockTag: "I_Door16Diagnostic" },
  { id: 17, name: "Unwinder Door 17", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door17", interlockTag: "I_Door17Diagnostic" },
  { id: 18, name: "Unwinder Door 18", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door18", interlockTag: "I_Door18Diagnostic" },
  { id: 19, name: "Unwinder Door 19", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door19", interlockTag: "I_Door19Diagnostic" },
  { id: 20, name: "Unwinder Door 20", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door20", interlockTag: "I_Door20Diagnostic" },
  { id: 21, name: "Machine Door 21", area: "Main Machine", guardOpen: false, interlockOk: true, guardTag: "SFI_Door21", interlockTag: "I_Door21Diagnostic" },
  { id: 22, name: "Door 22", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door22", interlockTag: "I_Door22Diagnostic" },
  { id: 23, name: "Door 23", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door23", interlockTag: "I_Door23Diagnostic" },
  { id: 24, name: "Door 24", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door24", interlockTag: "I_Door24Diagnostic" },
  { id: 25, name: "Door 25", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door25", interlockTag: "I_Door25Diagnostic" },
  { id: 26, name: "Door 26", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door26", interlockTag: "I_Door26Diagnostic" },
  { id: 27, name: "Door 27", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door27", interlockTag: "I_Door27Diagnostic" },
  { id: 28, name: "Door 28", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door28", interlockTag: "I_Door28Diagnostic" },
  { id: 29, name: "Door 29", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door29", interlockTag: "I_Door29Diagnostic" },
  { id: 30, name: "Door 30", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door30", interlockTag: "I_Door30Diagnostic" },
  { id: 31, name: "Door 31", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door31", interlockTag: "I_Door31Diagnostic" },
  { id: 32, name: "Door 32", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door32", interlockTag: "I_Door32Diagnostic" },
  { id: 33, name: "Door 33", area: "Machine Guarding", guardOpen: false, interlockOk: true, guardTag: "SFI_Door33", interlockTag: "I_Door33Diagnostic" }, 
  { id: 34, name: "Unwinder Door 34", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door34", interlockTag: "I_Door34Diagnostic" },
  { id: 35, name: "Unwinder Door 35", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door35", interlockTag: "I_Door35Diagnostic" },
  { id: 36, name: "Unwinder Door 36", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door36", interlockTag: "I_Door36Diagnostic" },
  { id: 37, name: "Unwinder Door 37", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door37", interlockTag: "I_Door37Diagnostic" },
  { id: 38, name: "Unwinder Door 38", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door38", interlockTag: "I_Door38Diagnostic" },
  { id: 39, name: "Unwinder Door 39", area: "Unwinder Section", guardOpen: false, interlockOk: true, guardTag: "SFI_Door39", interlockTag: "I_Door39Diagnostic" },
];

/* =========================================================
   02 - MACHINE SVG ZONES
   These are the clickable colored polygon areas on the machine.
========================================================= */

const MACHINE_ZONES = [
  {
    id: "zone-infeed",
    name: "Infeed",
    area: "Infeed Section",
    points: "15,62 27,55 33,64 33,83 20,90 15, 82",
    labelX: "18%",
    labelY: "73%",
    zoomScale: 2.45,
    tagIds: [1, 2, 3, 39, 38, 37, 36, 35, 34],
  }, 
  {
    id: "zone-wrapper",
    name: "Wrapping",
    area: "Wrapping Section",
    points: "35,56 56,45 60,50 60,66 38,79 38,60",
    labelX: "44%",
    labelY: "63%",
    zoomScale: 2.1,
    tagIds: [4, 5, 6, 7, 8, 9, 33, 32, 31, 30, 29, 28],
  },
  {
    id: "zone-main",
    name: "Main Machine",
    area: "Main Machine",
    points: "56,45 74,34 77,40 77,57 60,65 60,50",
    labelX: "70%",
    labelY: "55%",
    zoomScale: 2,
    tagIds: [10, 11, 12, 13, 27, 26, 25, 24],
  },
   {
    id: "zone-center",
    name: "Center Guarding",
    area: "Center Guarding",
    points: "74,34 88.3,26 93,30 93,48 77,57 77,40",
    labelX: "87%",
    labelY: "49%",
    zoomScale: 2.15,
    tagIds: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  }, 
];



/* =========================================================
   03 - 3D ZONE WRAP SETTINGS
   These are the 3D wrapped areas that sit on top of the GLB.

   Edit these manually to map each colored area around the machine:
     position = [left/right, up/down, front/back]
     size     = [width, height, depth]
     rotation = [x, y, z] in radians
     labelOffset = move the floating label relative to the box center

   Tips:
   - start by fixing position first
   - then adjust size so the colored box wraps the section
   - only use rotation if the box needs to tilt with the machine section
========================================================= */

const MACHINE_3D_ZONE_MAPS = [
  {
    id: "zone-infeed",
    position: [-1.54, -0.23, -0.18],
    size: [0.67, 0.54, 0.64],
    rotation: [0, 0, 0],
    labelOffset: [0, 1000.5, 0],
    labelWidth: 0.92,
    labelHeight: 0.24,
    labelTextSize: 0.13,
    opacity: 0.50,
    activeOpacity: 0.26,
  }, 
  {
    id: "zone-wrapper",
    position: [-0.25, -0.27, -0.17],
    size: [1.26, 0.50, 0.35],
    rotation: [0, 0, 0],
    labelOffset: [0, 100.84, 0],
    labelWidth: 1.05,
    labelHeight: 0.24,
    labelTextSize: 0.13,
    opacity: 0.50,
    activeOpacity: 0.26,
  }, 
  {
    id: "zone-main",
    position: [0.83, -0.27, -0.18],
    size: [0.86, 0.50, 0.37],
    rotation: [0, 0, 0],
    labelOffset: [0, 100.86, 0],
    labelWidth: 1.20,
    labelHeight: 0.24,
    labelTextSize: 0.13,
    opacity: 0.50,
    activeOpacity: 0.26,
  }, 
  {
    id: "zone-center",
    position: [1.73, -0.27, -0.17],
    size: [0.97, 0.50, 0.35],
    rotation: [0, 0, 0],
    labelOffset: [0, 100.02, 0],
    labelWidth: 1.45,
    labelHeight: 0.24,
    labelTextSize: 0.13,
    opacity: 0.50,
    activeOpacity: 0.26,
  },
  
];

/* =========================================================
   04 - 3D MODEL VIEW SETTINGS
   Use this when you want to zoom/resize/rotate the whole GLB.
========================================================= */

const MACHINE_3D_MODEL_SETTINGS = {
  // Higher number = bigger model.
  scale: 2.35,

  // Move whole model in 3D space: [left/right, up/down, front/back]
  position: [0, -0.55, 0],

  // Rotate whole model in radians: [x, y, z]
  rotation: [0, 0, 0],

  // Camera starts zoomed in. Smaller distance = closer view.
  cameraPosition: [2.7, 1.45, 2.75],
  cameraFov: 28,

  // Orbit center. Adjust if the rotation point feels off.
  controlsTarget: [0, 0.2, 0],

};

const MACHINE_CONFIGS = {
  mespack: {
    id: "mespack",
    name: "Mespack",
    title: "Mespack",
    subtitle: "Real-time guard and interlock status",
    apiUrl: "/api/data",
    image: machineImage,
    points: MACHINE_POINTS,
    zones: MACHINE_ZONES,
    modelUrl: "/models/mespack.glb",
    modelZones: MACHINE_3D_ZONE_MAPS,
    modelSettings: MACHINE_3D_MODEL_SETTINGS,
  },
  /* http://localhost:5000/data */

  /* machine2: {
    id: "machine2",
    name: "Machine 2",
    title: "Machine 2 Command Center",
    subtitle: "Real-time machine status monitoring",
    apiUrl: "/api/data-machine2",
    image: machineImage,
    points: MACHINE_POINTS,
    zones: MACHINE_ZONES,
  }, */
};

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

function polygonToSvgPoints(points) {
  return (Array.isArray(points) ? points : [])
    .map((point) => Array.isArray(point) ? `${point[0]},${point[1]}` : `${point.x},${point.y}`)
    .join(" ");
}

function machinePointFromDatabase(point) {
  return {
    id: Number(point.point_id),
    name: point.name,
    area: point.area || "Machine",
    guardOpen: false,
    interlockOk: true,
    guardTag: point.source_key_primary,
    interlockTag: point.source_key_secondary || "",
    statusMode: point.status_mode || "door_interlock",
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
  const [machineCatalog, setMachineCatalog] = useState([DEFAULT_MACHINE_RECORD]);
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
      const nextMachines = data.machines?.length ? data.machines : [DEFAULT_MACHINE_RECORD];
      setMachineCatalog(nextMachines);
      return nextMachines;
    } catch {
      setMachineCatalog([DEFAULT_MACHINE_RECORD]);
      return [DEFAULT_MACHINE_RECORD];
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
    imagePreview: machine.image?.url || machineImage,
    image_base64: "",
    image_mime_type: machine.image?.mime_type || "image/png",
    image_width: machine.image?.original_width || null,
    image_height: machine.image?.original_height || null,
    segments: (machine.segments || []).map((segment) => ({
      ...segment,
      polygon_points: Array.isArray(segment.polygon_points) ? segment.polygon_points : [],
      point_ids: (segment.point_ids || []).map(Number),
    })),
    points: (machine.points || []).map((point) => ({
      ...point,
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
  const canonicalValue = canonicalIncomingValue(rawValue);
  const matchedRule = (Array.isArray(channelRules) ? channelRules : []).find((rule) => (
    canonicalIncomingValue(rule.value) === canonicalValue
  ));
  const resolved = matchedRule || fallback || DEFAULT_POINT_VALUE_RULES.fallback;
  return {
    rawValue,
    rawLabel: rawValue === undefined ? "No data" : String(rawValue),
    label: String(resolved.label || (rawValue === undefined ? "No data" : rawValue)),
    className: ["safe", "warning", "danger", "neutral"].includes(resolved.severity)
      ? resolved.severity
      : "neutral",
    color: resolved.color || "#64748b",
    matched: Boolean(matchedRule),
  };
}

function pointInterpretation(point, payload) {
  if (!point.valueRules) return null;
  const rules = cloneValueRules(point.valueRules);
  const states = [
    interpretIncomingValue(payloadValueAtPath(payload, point.guardTag), rules.primary, rules.fallback),
  ];
  if (point.interlockTag) {
    states.push(interpretIncomingValue(payloadValueAtPath(payload, point.interlockTag), rules.secondary, rules.fallback));
  }
  const priority = { danger: 3, warning: 2, neutral: 1, safe: 0 };
  const overall = states.slice().sort((first, second) => (
    (priority[second.className] ?? 1) - (priority[first.className] ?? 1)
  ))[0];
  return { states, overall };
}

function useHorizontalDragScroll() {
  const ref = useRef(null);
  const gesture = useRef({ active: false, startX: 0, startScrollLeft: 0, dragged: false });

  function finishDrag(event) {
    const node = ref.current;
    if (!gesture.current.active) return;
    gesture.current.active = false;
    node?.classList.remove("is-dragging");
    if (node?.hasPointerCapture?.(event.pointerId)) node.releasePointerCapture(event.pointerId);
    window.setTimeout(() => { gesture.current.dragged = false; }, 0);
  }

  return {
    ref,
    className: "drag-scroll",
    onPointerDown: (event) => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      const node = ref.current;
      if (!node || node.scrollWidth <= node.clientWidth) return;
      gesture.current = {
        active: true,
        startX: event.clientX,
        startScrollLeft: node.scrollLeft,
        dragged: false,
      };
    },
    onPointerMove: (event) => {
      if (!gesture.current.active) return;
      const node = ref.current;
      const deltaX = event.clientX - gesture.current.startX;
      if (!gesture.current.dragged && Math.abs(deltaX) < 5) return;
      if (!gesture.current.dragged) {
        gesture.current.dragged = true;
        node?.setPointerCapture?.(event.pointerId);
      }
      node?.classList.add("is-dragging");
      if (node) node.scrollLeft = gesture.current.startScrollLeft - deltaX;
      event.preventDefault();
    },
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
    onClickCapture: (event) => {
      if (!gesture.current.dragged) return;
      event.preventDefault();
      event.stopPropagation();
      gesture.current.dragged = false;
    },
  };
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
  const mappingDrag = useHorizontalDragScroll();
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
        const configured = (draft.points || []).flatMap((point) => [point.source_key_primary, point.source_key_secondary])
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

  function addPointMapping(sourceKey = "") {
    const nextId = Math.max(0, ...draft.points.map((point) => Number(point.point_id) || 0)) + 1;
    setDraft((current) => ({
      ...current,
      points: [...current.points, {
        point_id: nextId,
        name: sourceKey ? availableFieldLabel(sourceKey) : `Point ${nextId}`,
        area: "Machine",
        segment_id: current.segments[0]?.id || null,
        source_key_primary: sourceKey,
        source_key_secondary: "",
        status_mode: "door_interlock",
        safe_config: { primary: "CLOSE", secondary: "LOCK" },
        value_rules: cloneValueRules(DEFAULT_POINT_VALUE_RULES),
        is_active: true,
      }],
    }));
  }

  function updateValueRule(pointIndex, channel, ruleIndex, field, value) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, index) => {
        if (index !== pointIndex) return point;
        const rules = cloneValueRules(point.value_rules);
        rules[channel] = rules[channel].map((rule, indexInChannel) => indexInChannel === ruleIndex
          ? { ...rule, [field]: value }
          : rule);
        return { ...point, value_rules: rules };
      }),
    }));
  }

  function addValueRule(pointIndex, channel) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, index) => {
        if (index !== pointIndex) return point;
        const rules = cloneValueRules(point.value_rules);
        rules[channel] = [
          ...rules[channel],
          { value: "", label: "", severity: "safe", color: "#22c55e" },
        ];
        return { ...point, value_rules: rules };
      }),
    }));
  }

  function removeValueRule(pointIndex, channel, ruleIndex) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, index) => {
        if (index !== pointIndex) return point;
        const rules = cloneValueRules(point.value_rules);
        rules[channel] = rules[channel].filter((_, indexInChannel) => indexInChannel !== ruleIndex);
        return { ...point, value_rules: rules };
      }),
    }));
  }

  function updateFallbackRule(pointIndex, field, value) {
    setDraft((current) => ({
      ...current,
      points: current.points.map((point, index) => {
        if (index !== pointIndex) return point;
        const rules = cloneValueRules(point.value_rules);
        rules.fallback = { ...rules.fallback, [field]: value };
        return { ...point, value_rules: rules };
      }),
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
                  {!previousGalleryItem.isAddMore && (
                    <img src={previousGalleryItem.image?.url || machineImage} alt="" />
                  )}
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
                ) : (
                  <img src={activeGalleryItem?.image?.url || machineImage} alt={`${activeGalleryItem?.name || "Machine"} machine`} />
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
                {nextGalleryItem && !nextGalleryItem.isAddMore && (
                  <img src={nextGalleryItem.image?.url || machineImage} alt="" />
                )}
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
                  <img src={draft.imagePreview || machineImage} alt="Machine segmentation editor" />
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
            <div className="configurator-section-heading"><span>Step 3</span><div><strong>Data mapping and meaning</strong><small>Choose MQTT fields, then define exactly what every received value means</small></div><div className="point-add-controls"><select defaultValue="" onChange={(event) => { if (event.target.value) addPointMapping(event.target.value); event.target.value = ""; }}><option value="">+ Detected data</option>{detectedFieldKeys.map((key) => <option key={key} value={key}>{key}</option>)}</select><button onClick={() => addPointMapping()}>+ Blank</button></div></div>
            <datalist id={`available-data-${draft.id}`}>{detectedFieldKeys.map((key) => <option key={key} value={key} />)}</datalist>
            <div
              {...mappingDrag}
              className={`point-mapping-table ${mappingDrag.className}`}
              aria-label="Machine data mappings. Drag horizontally to browse columns."
            >
              <div className="point-mapping-head"><span>No.</span><span>Point name</span><span>Primary MQTT field</span><span>Secondary field</span><span>Segment</span><span>Value meaning</span><span /></div>
              {draft.points.map((point, index) => (
                <div className="point-mapping-entry" key={`${point.point_id}-${index}`}>
                  <div className="point-mapping-row">
                    <input type="number" value={point.point_id} onChange={(event) => updatePoint(index, "point_id", event.target.value)} />
                    <input value={point.name || ""} onChange={(event) => updatePoint(index, "name", event.target.value)} />
                    <input list={`available-data-${draft.id}`} value={point.source_key_primary || ""} onChange={(event) => updatePoint(index, "source_key_primary", event.target.value)} />
                    <input list={`available-data-${draft.id}`} value={point.source_key_secondary || ""} onChange={(event) => updatePoint(index, "source_key_secondary", event.target.value)} placeholder="Optional" />
                    <select value={point.segment_id || ""} onChange={(event) => updatePoint(index, "segment_id", event.target.value || null)}><option value="">Unassigned</option>{draft.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select>
                    <button className="point-meaning-button" onClick={() => setRulesPointId(point.point_id)}>Define 1 / 0</button>
                    <button className="point-remove-button" onClick={() => removePointMapping(index)} aria-label={`Remove ${point.name}`}>×</button>
                  </div>
                </div>
              ))}
              {!draft.points.length && <div className="point-mapping-empty">No mappings yet. Add the HighByte fields that this machine should monitor.</div>}
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
              onUpdate={updateValueRule}
              onAdd={addValueRule}
              onRemove={removeValueRule}
              onFallbackUpdate={updateFallbackRule}
              onClose={() => setRulesPointId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PointValueRulesEditor({ point, pointIndex, onUpdate, onAdd, onRemove, onFallbackUpdate, onClose }) {
  const rules = cloneValueRules(point.value_rules);
  const channels = [
    { key: "primary", label: "Primary field", sourceKey: point.source_key_primary },
    { key: "secondary", label: "Secondary field", sourceKey: point.source_key_secondary },
  ].filter((channel) => channel.key === "primary" || channel.sourceKey);

  return (
    <section className="point-value-rules" aria-label={`Value meanings for ${point.name}`}>
      <header>
        <div>
          <strong>Incoming value meanings</strong>
          <small>Interlocks keep their Boolean raw value. Define what 1 and 0 mean to operators.</small>
        </div>
        <div className="value-rule-header-actions">
          <span>{point.name}</span>
          <button type="button" onClick={onClose} aria-label="Close value meanings">×</button>
        </div>
      </header>

      <div className="value-rule-channels">
        {channels.map((channel) => (
          <div className="value-rule-channel" key={channel.key}>
            <div className="value-rule-channel-heading">
              <div><strong>{channel.label}</strong><small>{channel.sourceKey || "Choose an MQTT field above"}</small></div>
              <button onClick={() => onAdd(pointIndex, channel.key)}>+ Value</button>
            </div>
            <div className="value-rule-head"><span>Raw Boolean</span><span>Display label</span><span>Condition</span><span>Color</span><span /></div>
            {rules[channel.key].map((rule, ruleIndex) => (
              <div className="value-rule-row" key={`${channel.key}-${ruleIndex}`}>
                <input value={rule.value ?? ""} onChange={(event) => onUpdate(pointIndex, channel.key, ruleIndex, "value", event.target.value)} placeholder="1 or 0" inputMode="numeric" />
                <input value={rule.label || ""} onChange={(event) => onUpdate(pointIndex, channel.key, ruleIndex, "label", event.target.value)} placeholder="Locked" />
                <select value={rule.severity || "safe"} onChange={(event) => onUpdate(pointIndex, channel.key, ruleIndex, "severity", event.target.value)}>
                  {VALUE_SEVERITIES.map((severity) => <option key={severity.value} value={severity.value}>{severity.label}</option>)}
                </select>
                <input className="value-rule-color" type="color" value={rule.color || "#22c55e"} onChange={(event) => onUpdate(pointIndex, channel.key, ruleIndex, "color", event.target.value)} aria-label="Status color" />
                <button onClick={() => onRemove(pointIndex, channel.key, ruleIndex)} aria-label="Remove value meaning">×</button>
              </div>
            ))}
            {!rules[channel.key].length && <div className="value-rule-empty">No meanings defined for this field.</div>}
          </div>
        ))}
      </div>

      <div className="value-rule-fallback">
        <div><strong>Unmatched value</strong><small>Used when MQTT sends a value that is not listed above.</small></div>
        <input value={rules.fallback.label || ""} onChange={(event) => onFallbackUpdate(pointIndex, "label", event.target.value)} placeholder="Unknown" />
        <select value={rules.fallback.severity || "warning"} onChange={(event) => onFallbackUpdate(pointIndex, "severity", event.target.value)}>
          {VALUE_SEVERITIES.map((severity) => <option key={severity.value} value={severity.value}>{severity.label}</option>)}
        </select>
        <input className="value-rule-color" type="color" value={rules.fallback.color || "#f59e0b"} onChange={(event) => onFallbackUpdate(pointIndex, "color", event.target.value)} aria-label="Fallback color" />
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
  const [activeMachineId, setActiveMachineId] = useState("mespack");
  const [machineData, setMachineData] = useState(null);
  const [apiError, setApiError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [viewMode, setViewMode] = useState("2d");
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
    if (!configured.length) return MACHINE_CONFIGS;

    return configured.reduce((result, machine) => {
      const template = MACHINE_CONFIGS[machine.template_id] || MACHINE_CONFIGS.mespack;
      const databasePoints = (machine.points || []).filter((point) => point.is_active !== false);
      const databaseZones = (machine.segments || []).filter((segment) => segment.is_active !== false);
      result[machine.id] = {
        ...template,
        id: machine.id,
        name: machine.name,
        title: machine.name,
        subtitle: machine.id === "mespack"
          ? template.subtitle
          : "Configured machine using the Mespack monitoring template",
        apiUrl: machine.api_url || template.apiUrl,
        image: machine.image?.url || template.image,
        canvasAspectRatio: Number(machine.image?.canvas_aspect_ratio || FIXED_MACHINE_CANVAS_ASPECT),
        points: databasePoints.length ? databasePoints.map(machinePointFromDatabase) : template.points,
        zones: databaseZones.length ? databaseZones.map(machineZoneFromDatabase) : template.zones,
        dataSource: machine.data_source || null,
      };
      return result;
    }, {});
  }, [machineCatalog]);

  const activeMachine = machineConfigs[activeMachineId] || Object.values(machineConfigs)[0] || MACHINE_CONFIGS.mespack;

  useEffect(() => {
    if (!machineConfigs[activeMachineId]) {
      setActiveMachineId(Object.keys(machineConfigs)[0] || "mespack");
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

    fetchMachineData();

    const interval = setInterval(fetchMachineData, 1000);
    return () => clearInterval(interval);
  }, [activeMachineId, activeMachine.apiUrl, activeMachine.canvasAspectRatio]);

  const payload = machineData?.data || {};

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
    const liveGuardOnValue = payloadValueAtPath(payload, point.guardTag);
    const liveHealthyValue = payloadValueAtPath(payload, point.interlockTag);
    const liveOpenCloseValue = payloadValueAtPath(payload, `${point.guardTag}_OpenClose`);
    const liveLockStateValue = payloadValueAtPath(payload, `${point.interlockTag}_LockState`);

    const fallbackGuardOn =
      liveGuardOnValue === undefined
        ? !point.guardOpen
        : toBool(liveGuardOnValue);

    const fallbackHealthyOn =
      liveHealthyValue === undefined
        ? point.interlockOk
        : toBool(liveHealthyValue);

    const openClose =
      normalizeOpenCloseState(liveOpenCloseValue) ||
      (fallbackGuardOn ? "CLOSE" : "OPEN");

    const lockState =
      normalizeLockState(liveLockStateValue) ||
      (fallbackHealthyOn ? "LOCK" : "UNLOCK");

    const interpretation = pointInterpretation(point, payload);

    return {
      ...point,
      openClose,
      lockState,
      guardOpen: openClose === "OPEN",
      interlockOk: lockState === "LOCK",
      interpretation,
    };
  });
}, [payload, activeMachine]);

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
          <button className="studio-confirm-button" onClick={() => setFaceModalOpen(true)}>
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
            <span>← Previous</span>
            <strong>{previousMachine?.name || "No previous machine"}</strong>
          </button>
          <button
            key={activeMachine.id}
            type="button"
            className="studio-machine-card"
            onClick={() => setMachinePickerOpen((current) => !current)}
            aria-expanded={machinePickerOpen}
            aria-controls="studio-machine-picker"
          >
            <span className="studio-machine-card-image floating-media"><img src={activeMachine.image} alt="" /></span>
            <span className="studio-machine-card-copy">
              <small>Machine {String(activeMachineIndex + 1).padStart(2, "0")} / {String(machineList.length).padStart(2, "0")}</small>
              <strong>{activeMachine.name}<i aria-hidden="true">⌄</i></strong>
            </span>
          </button>
          <button className="studio-machine-preview next" onClick={() => cycleMachine(1)} disabled={!nextMachine} aria-label="Next machine">
            <span>Next →</span>
            <strong>{nextMachine?.name || "No next machine"}</strong>
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
                    <span className="floating-media"><img src={machine.image} alt="" /></span>
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
                    : apiError ? `Data unavailable · ${apiError}` : "MQTT offline"}
                />
                <button
                  onClick={() => {
                    setViewMode((current) => current === "2d" ? "3d" : "2d");
                    resetView();
                  }}
                >
                  {viewMode === "2d" ? "3D" : "2D"}
                </button>
              </div>
            </div>

            <div className="studio-machine-frame">
            {viewMode === "2d" ? (
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
                    <img
                      src={activeMachine.image}
                      alt={activeMachine.name}
                      className="machine-img"
                    />

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
            ) : (
              <Suspense fallback={<div className="machine-3d-loading">Loading 3D view…</div>}>
                <Machine3DView
                  machine={activeMachine}
                  zones={zoneRows}
                  selectedPoint={selectedPoint}
                  onZoneClick={(zone) => selectZone(zone)}
                  theme={theme}
                />
              </Suspense>
            )}
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
            const displayStates = tag.interpretation?.states || [
              { label: tag.openClose, className: tag.openClose === "OPEN" ? "warning" : "safe", color: null },
              { label: tag.lockState, className: tag.lockState === "UNLOCK" ? "danger" : "safe", color: null },
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
        const issueCount = zone.tags.filter((tag) => getSafetyState(tag).className !== "safe").length;
        const zoneSelected = selectedPoint?.type === "zone" && selectedPoint?.id === zone.id;

        return (
          <section className={`studio-zone-card ${zone.state.className} ${zoneSelected ? "active" : ""}`} key={zone.id}>
            <button className="studio-zone-heading" type="button" onClick={() => onZoneClick(zone)}>
              <span>
                <strong>{zone.name}</strong>
                <small>{zone.tags.length} points</small>
              </span>
              <em className={zone.state.className}>{issueCount ? `${issueCount} alert${issueCount === 1 ? "" : "s"}` : "Ready"}</em>
            </button>

            <div className="studio-zone-points">
              {zone.tags.map((tag) => {
                const state = getSafetyState(tag);
                const isSelected = Number(selectedPoint?.focusedPointId) === Number(tag.id);
                const stateSummary = tag.interpretation?.states?.map((item) => item.label).join(" · ")
                  || `${tag.openClose} · ${tag.lockState}`;
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
  const states = tags.map((tag) => getSafetyState(tag));
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
