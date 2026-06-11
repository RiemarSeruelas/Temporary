import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import machineImage from "./assets/machine.png";
import zoneMainRealistic from "./assets/zone.png";
import { Canvas } from "@react-three/fiber";
import { Billboard, Edges, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

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
    detailImage: zoneMainRealistic,
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
    detailImage: zoneMainRealistic,
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
    detailImage: zoneMainRealistic,
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
    detailImage: zoneMainRealistic,
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
    title: "Mespack Command Center",
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

export default function App() {
  const [activeMachineId, setActiveMachineId] = useState("mespack");
  const [machineData, setMachineData] = useState(null);
  const [apiError, setApiError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [theme, setTheme] = useState("light");
  const [viewMode, setViewMode] = useState("2d");
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [faceModalOpen, setFaceModalOpen] = useState(false);
  const [confirmToast, setConfirmToast] = useState("");

  const activeMachine = MACHINE_CONFIGS[activeMachineId];

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
    setShowDetailsModal(false);

    fetchMachineData();

    const interval = setInterval(fetchMachineData, 1000);
    return () => clearInterval(interval);
  }, [activeMachineId]);

  const status = machineData?.status || "WAITING";
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
    const liveGuardOnValue = payload?.[point.guardTag];
    const liveHealthyValue = payload?.[point.interlockTag];

    const guardOn =
      liveGuardOnValue === undefined
        ? !point.guardOpen
        : toBool(liveGuardOnValue);

    const healthyOn =
      liveHealthyValue === undefined
        ? point.interlockOk
        : toBool(liveHealthyValue);

    return {
      ...point,

      // Convert Guard ON into guardOpen
      // Guard ON true  = guardOpen false
      // Guard ON false = guardOpen true
      guardOpen: !guardOn,

      // Healthy signal maps directly
      interlockOk: healthyOn,
    };
  });
}, [payload, activeMachine]);

  /* ====================================================   =====
     05 - LEFT PANEL ATTENTION LOGIC
     attentionRows = everything NOT READY / FAULT / WARNING
     readyRows     = READY only
  ========================================================= */

  const attentionRows = machineRows.filter((machine) => {
    const state = getSafetyState(machine);
    return state.className !== "safe";
  });

  const readyRows = machineRows.filter((machine) => {
    const state = getSafetyState(machine);
    return state.className === "safe";
  });

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
        tags: zoneTags,
        state: zoneState,
      };
    });
  }, [machineRows, activeMachine]);

  /* =========================================================
     07 - MACHINE STATE FLAGS
  ========================================================= */

  const isRunning = status === "RUNNING";
  const isStopped = status === "STOPPED";

  /* =========================================================
     08 - ZOOM CALCULATION
     Used when clicking a machine zone.
  ========================================================= */

  const activeZoomZone = selectedPoint?.type === "zone" ? selectedPoint : null;
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

  function openPointDetails(machine, safety) {
    setSelectedPoint({
      type: "point",
      ...machine,
      state: safety,
    });
    setShowDetailsModal(true);
  }

  function selectZone(zone, openModal = false) {
    setSelectedPoint({
      type: "zone",
      ...zone,
    });

    if (openModal) {
      setShowDetailsModal(true);
    }
  }

  function resetView() {
    setSelectedPoint(null);
    setShowDetailsModal(false);
  }

  return (
    <div className="app-shell" data-theme={theme}>
      {/* =========================================================
          10 - TOP HEADER
      ========================================================= */}

     <header className="topbar">
  <div className="desktop-topbar polished-topbar">
    <div className="topbar-left">
      <div className="brand-card">
        <div className="brand-icon">⚙️</div>
        <div>
          <div className="brand-title">MACHINE DASHBOARD</div>
          <div className="brand-subtitle">HighByte MQTT Monitoring System</div>
        </div>
      </div>

      <div className="topbar-machines-inline">
        {Object.values(MACHINE_CONFIGS).map((machine) => (
          <button
            key={machine.id}
            className={`top-nav-btn ${activeMachineId === machine.id ? "active" : ""}`}
            onClick={() => setActiveMachineId(machine.id)}
          >
            {machine.name}
          </button>
        ))}
      </div>
    </div>

    <div className="topbar-right polished-actions">
      <button className="face-confirm-btn top-confirm-btn" onClick={() => setFaceModalOpen(true)}>
        Confirm Check
      </button>

      <div className={`top-state-inline ${getStatusClass(status)}`}>
        <div className="top-state-dot" />
        <span>{status}</span>
      </div>

      <button
        className="top-nav-btn theme-toggle-btn"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? "☀ Light" : "🌙 Dark"}
      </button>
    </div>
  </div>
</header>

      {/* =========================================================
          11 - SUMMARY STRIP
      ========================================================= */}

      <section className="summary-strip">
        <div className="summary-left">
          <div className={`summary-badge machine-badge ${getStatusClass(status)}`}>
            {isRunning ? "✓" : isStopped ? "!" : "•"}
          </div>

          <div className="summary-title-wrap">
  <div className="summary-title">{activeMachine.title}</div>
  <div className="summary-subtitle">{activeMachine.subtitle}</div>
</div>
          <div
            className={`live-badge ${
              machineData?.mqttConnected ? "online" : "offline"
            }`}
          >
            {machineData?.mqttConnected ? "MQTT LIVE" : "MQTT OFFLINE"}
          </div>
        </div>

        <div className="summary-stats">
          <label className="summary-view-select-wrap" title="Switch machine view">
            <span>VIEW</span>
            <select
              className="summary-view-select"
              value={viewMode}
              onChange={(event) => {
                setViewMode(event.target.value);
                resetView();
              }}
            >
              <option value="2d">2D</option>
              <option value="3d">3D</option>
            </select>
          </label>
          <SummaryStat value={attentionRows.length} label="ATTENTION" variant="red" />
          <SummaryStat value={zoneRows.length} label="ZONES" variant="green" />
          <SummaryStat value={isStopped ? "STOP" : "-"} label="STOPPED" variant="red" />
          <SummaryStat value={status} label="STATE" variant="amber" />
        </div>
      </section>

      {/* =========================================================
          12 - MAIN WORKSPACE
      ========================================================= */}

      <main className="workspace machine-workspace">
        {/* =========================================================
            13 - LEFT PANEL
            Top = Needs Attention
            Bottom = Ready Points
        ========================================================= */}

        <aside className="panel left-panel machine-left-panel">
          <div className="side-list-header">
            <div>
              <div className="panel-title">Machine Points</div>
              <div className="side-list-subtitle">Click a row to inspect</div>
            </div>

            <div className="side-count">{machineRows.length}</div>
          </div>

          {/* UPDATE: NEEDS ATTENTION SECTION */}
          <div className="left-attention-card">
            <div className="attention-header">
              <div>
                <div className="attention-title">Needs Attention</div>
                <div className="attention-subtitle">
                  Points requiring line acknowledgement
                </div>
              </div>

              <div
                className={`attention-count ${
                  attentionRows.length > 0 ? "active" : ""
                }`}
              >
                {attentionRows.length}
              </div>
            </div>

            {attentionRows.length > 0 ? (
              <div className="attention-list">
                {attentionRows.map((machine) => {
                  const safety = getSafetyState(machine);

                  return (
                    <button
                      className={`attention-row ${safety.className} ${
                        selectedPoint?.type === "point" &&
                        selectedPoint?.id === machine.id
                          ? "active"
                          : ""
                      }`}
                      key={`attention-${machine.id}`}
                      onClick={() => openPointDetails(machine, safety)}
                    >
                      <div className="attention-no">{machine.id}</div>

                      <div className="attention-info">
                        <div className="attention-name">{machine.name}</div>
                        <div className="attention-area">{machine.area}</div>
                      </div>

                      <span className={`attention-chip ${safety.className}`}>
                        {safety.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="attention-empty">All points are ready.</div>
            )}
          </div>

          <div className="ready-section-label">
  <div className="ready-section-title">Ready Points</div>
  <div className="ready-section-count">{readyRows.length}</div>
</div>

<div className="machine-table compact-machine-table">
  <div className="machine-table-head compact-head">
    <span>No.</span>
    <span>Name</span>
    <span>Status</span>
  </div>

  {readyRows.map((machine) => {
    const safety = getSafetyState(machine);

    return (
      <button
        className={`machine-row compact-row ${
          selectedPoint?.type === "point" &&
          selectedPoint?.id === machine.id
            ? "active"
            : ""
        }`}
        key={machine.id}
        onClick={() => openPointDetails(machine, safety)}
      >
        <div className="machine-number">{machine.id}</div>

        <div className="machine-info">
          <div className="machine-row-name">{machine.name}</div>
        </div>

        <span className={`machine-status-chip ${safety.className}`}>
          {safety.label}
        </span>
      </button>
    );
  })}
</div>
        </aside>

        {/* =========================================================
            14 - CENTER MACHINE MAP
        ========================================================= */}

        <section className="panel center-panel machine-center-panel">
          <div className="table-card">
            {viewMode === "2d" ? (
            <div className={`machine-map ${activeZoomZone ? "zoomed" : ""}`}>
              <div className="machine-map-grid" />

              <div className="machine-zoom-layer">
                <div className="machine-stage">
                  <div
                    className={`machine-canvas ${
                      activeZoomZone ? "is-zoomed" : ""
                    }`}
                    style={machineCanvasStyle}
                  >
                    <img
                      src={activeMachine.image}
                      alt={activeMachine.name}
                      className="machine-img"
                      onLoad={() => console.log("✅ Machine image loaded")}
                      onError={() => console.log("❌ Machine image failed to load")}
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
                            selectZone(zone, true);
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
                          selectZone(zone, true);
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
                <button className="reset-zoom-btn" onClick={resetView}>
                  Reset View
                </button>
              )}
            </div>
            ) : (
              <Machine3DView
                machine={activeMachine}
                zones={zoneRows}
                selectedPoint={selectedPoint}
                onZoneClick={(zone) => selectZone(zone, true)}
              />
            )}
          </div>
        </section>
      </main>

      {/* =========================================================
          15 - DETAILS MODAL
          Opens when clicking a point or zone.
      ========================================================= */}

      {showDetailsModal && selectedPoint && (
  <div
    className={`details-modal-backdrop ${
      selectedPoint?.type === "zone" && selectedPoint?.detailImage
        ? "has-detail-image"
        : ""
    }`}
    style={{
      backgroundImage:
        selectedPoint?.type === "zone" && selectedPoint?.detailImage
          ? `linear-gradient(rgba(15, 23, 42, 0.32), rgba(15, 23, 42, 0.72)), url(${selectedPoint.detailImage})`
          : undefined,
    }}
    onClick={resetView}
  >
    <div className="details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="details-modal-header">
              <div>
                <div className="details-modal-kicker">
                  {selectedPoint.type === "zone" ? "Machine Zone" : "Machine Point"}
                </div>
                <div className="details-modal-title">{selectedPoint.name}</div>
                <div className="details-modal-subtitle">{selectedPoint.area}</div>
              </div>

              <button className="details-modal-close" onClick={resetView}>
                ×
              </button>
            </div>

            <div className={`details-status-banner ${selectedPoint.state.className}`}>
              {selectedPoint.state.label}
            </div>

            {selectedPoint.type === "point" ? (
              <div className="details-grid">
                <DetailItem label="Point No." value={selectedPoint.id} />
                <DetailItem label="Status" value={selectedPoint.state.label} />
                <DetailItem
                  label="Guard"
                  value={selectedPoint.guardOpen ? "OPEN" : "CLOSED"}
                />
                <DetailItem
                  label="Interlock"
                  value={selectedPoint.interlockOk ? "OK" : "FAULT"}
                />
                <DetailItem label="Guard Tag" value={selectedPoint.guardTag} wide />
                <DetailItem
                  label="Interlock Tag"
                  value={selectedPoint.interlockTag}
                  wide
                />
              </div>
            ) : (
              <>
                <div className="details-grid">
                  <DetailItem label="Zone" value={selectedPoint.name} />
                  <DetailItem label="Status" value={selectedPoint.state.label} />
                  <DetailItem label="Tags Inside" value={selectedPoint.tags.length} />
                  <DetailItem
                    label="Unsafe Count"
                    value={
                      selectedPoint.tags.filter((tag) => {
                        const state = getSafetyState(tag);
                        return state.className !== "safe";
                      }).length
                    }
                  />
                </div>

                <div className="zone-tag-list">
                  <div className="zone-tag-list-title">Tags inside this zone</div>

                  {selectedPoint.tags.map((tag) => {
                    const tagState = getSafetyState(tag);

                    return (
                      <div className="zone-tag-row" key={tag.id}>
                        <span className="zone-tag-no">{tag.id}</span>
                        <span className="zone-tag-name">{tag.name}</span>
                        <span className={`zone-tag-status ${tagState.className}`}>
                          {tagState.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {faceModalOpen && (
        <FaceAttendanceModal
          machines={Object.values(MACHINE_CONFIGS)}
          defaultMachineId={activeMachineId}
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


function Machine3DView({ machine, zones, selectedPoint, onZoneClick }) {
  const modelSettings = machine.modelSettings || MACHINE_3D_MODEL_SETTINGS;
  const zoneMapById = new Map((machine.modelZones || []).map((zone) => [zone.id, zone]));

  const zoneOverlays = zones
    .map((zone) => ({
      ...zone,
      map3d: zoneMapById.get(zone.id),
    }))
    .filter((zone) => zone.map3d);

  return (
    <div className="machine-3d-view real-glb-view embedded-3d-map zone-wrap-3d-view">
      <Canvas
        className="machine-3d-canvas"
        camera={{
          position: modelSettings.cameraPosition,
          fov: modelSettings.cameraFov || 28,
        }}
      >
        <color attach="background" args={["#eef5ff"]} />
        <ambientLight intensity={0.95} />
        <hemisphereLight intensity={0.72} groundColor="#dbeafe" />
        <directionalLight position={[4, 6, 5]} intensity={1.25} />
        <directionalLight position={[-5, 3, -4]} intensity={0.38} />

        <Suspense fallback={null}>
          <MachineModel
            url={machine.modelUrl}
            scale={modelSettings.scale}
            position={modelSettings.position}
            rotation={modelSettings.rotation}
          />

          <group name="machine-zone-overlays">
            {zoneOverlays.map((zone) => (
              <Machine3DZone
                key={`3d-zone-${zone.id}`}
                zone={zone}
                map3d={zone.map3d}
                isActive={
                  selectedPoint?.type === "zone" && selectedPoint?.id === zone.id
                }
                onZoneClick={onZoneClick}
              />
            ))}
          </group>
        </Suspense>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          enableRotate
          enablePan
          enableZoom
          rotateSpeed={0.62}
          zoomSpeed={0.72}
          panSpeed={0.6}
          target={modelSettings.controlsTarget}
        />
      </Canvas>
    </div>
  );
}

function Machine3DZone({ zone, map3d, isActive, onZoneClick }) {
  const colors = get3DStatusColor(zone.state.className);
  const labelOffset =
    map3d.labelOffset || [0, (map3d.size?.[1] || 1) * 0.5 + 0.15, 0];

  const opacity = isActive
    ? map3d.activeOpacity || 0.28
    : map3d.opacity || 0.16;

  const zoneRefreshKey = JSON.stringify({
    id: zone.id,
    position: map3d.position,
    size: map3d.size,
    rotation: map3d.rotation,
  });

  return (
    <group
      key={zoneRefreshKey}
      position={map3d.position}
      rotation={map3d.rotation || [0, 0, 0]}
    >
      <mesh
        castShadow
        receiveShadow
        renderOrder={20}
        onPointerDown={(event) => {
          event.stopPropagation();
          onZoneClick(zone);
        }}
      >
        <boxGeometry args={map3d.size} />
        <meshStandardMaterial
          color={colors.fill}
          emissive={colors.emissive}
          emissiveIntensity={isActive ? 0.22 : 0.12}
          transparent
          opacity={opacity}
          roughness={0.48}
          metalness={0.02}
          depthWrite={false}
        />
        <Edges color={colors.edge} scale={1.001} threshold={15} />
      </mesh>

      <Billboard position={labelOffset} follow>
        <group
          onPointerDown={(event) => {
            event.stopPropagation();
            onZoneClick(zone);
          }}
        >
          <CanvasTextLabel
            text={zone.name}
            width={map3d.labelWidth || 1}
            height={map3d.labelHeight || 0.24}
            background={colors.labelBg}
          />
        </group>
      </Billboard>
    </group>
  );
}


function CanvasTextLabel({ text, width, height, background }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const radius = 18;
    ctx.fillStyle = background || "#15803d";
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(canvas.width - radius, 0);
    ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
    ctx.lineTo(canvas.width, canvas.height - radius);
    ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
    ctx.lineTo(radius, canvas.height);
    ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 46px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(text || ""), canvas.width / 2, canvas.height / 2 + 2);

    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    canvasTexture.needsUpdate = true;

    return canvasTexture;
  }, [text, background]);

  return (
    <mesh renderOrder={21}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}

function MachineModel({ url, scale, position, rotation }) {
  const { scene } = useGLTF(url);

  return (
    <primitive
      object={scene}
      scale={scale}
      position={position}
      rotation={rotation}
      dispose={null}
    />
  );
}

useGLTF.preload("/models/mespack.glb");

function FaceAttendanceModal({ machines, defaultMachineId, onClose, onConfirmed }) {
  const [mode, setMode] = useState("menu");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminTab, setAdminTab] = useState("logs");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState(null);
  const [lastRegister, setLastRegister] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLogs, setAdminLogs] = useState([]);
  const [adminPeople, setAdminPeople] = useState([]);
  const [filters, setFilters] = useState({ date: "", name: "", machine: "", department: "" });
  const [form, setForm] = useState({
    person_name: "",
    employee_id: "",
    department: "",
    role: "operator",
    machine: defaultMachineId || machines?.[0]?.id || "mespack",
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const confirmRetryRef = useRef(null);

  const machineOptions = machines?.length ? machines : [{ id: "mespack", name: "Mespack" }];
  const selectedMachineName = machineOptions.find((m) => m.id === form.machine)?.name || form.machine;

  const filteredLogs = adminLogs.filter((row) => {
    const rowDate = row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : "";
    const nameOk = !filters.name || String(row.person_name || "").toLowerCase().includes(filters.name.toLowerCase());
    const deptOk = !filters.department || String(row.department || "").toLowerCase().includes(filters.department.toLowerCase());
    const machineText = `${row.machine || ""} ${row.machine_name || ""}`.toLowerCase();
    const machineOk = !filters.machine || machineText.includes(filters.machine.toLowerCase());
    const dateOk = !filters.date || rowDate === filters.date;
    return nameOk && deptOk && machineOk && dateOk;
  });

  const filteredPeople = adminPeople.filter((row) => {
    const nameOk = !filters.name || String(row.person_name || "").toLowerCase().includes(filters.name.toLowerCase());
    const deptOk = !filters.department || String(row.department || "").toLowerCase().includes(filters.department.toLowerCase());
    const machineText = `${row.machine || ""} ${row.machine_name || ""}`.toLowerCase();
    const machineOk = !filters.machine || machineText.includes(filters.machine.toLowerCase());
    return nameOk && deptOk && machineOk;
  });

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (mode !== "confirm" || !stream) return undefined;

    window.clearTimeout(confirmRetryRef.current);
    confirmRetryRef.current = window.setTimeout(() => {
      handleConfirmCheck({ silent: true });
    }, 1200);

    return () => window.clearTimeout(confirmRetryRef.current);
  }, [mode, stream]);

  async function startCamera() {
    setError("");
    setStatus("Opening camera...");
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(nextStream);
      if (videoRef.current) {
        videoRef.current.srcObject = nextStream;
        await videoRef.current.play();
      }
      setStatus("Camera ready.");
    } catch (err) {
      setError(`Camera failed: ${err.message}`);
      setStatus("");
    }
  }

  function stopCamera() {
    window.clearTimeout(confirmRetryRef.current);
    if (stream) stream.getTracks().forEach((track) => track.stop());
    setStream(null);
  }

  function resetToMenu() {
    stopCamera();
    setMode("menu");
    setError("");
    setStatus("");
    setLastRegister(null);
  }

  function chooseMode(nextMode) {
    setMode(nextMode);
    setError("");
    setStatus("");
    setLastRegister(null);
    if (nextMode === "confirm") {
      setTimeout(startCamera, 80);
    } else {
      stopCamera();
    }
  }

  function chooseAdminTab(nextTab) {
    setAdminTab(nextTab);
    setError("");
    setStatus("");
    setLastRegister(null);
    if (nextTab === "register") {
      setTimeout(startCamera, 80);
    } else {
      stopCamera();
    }
  }

  function captureImage() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      throw new Error("Camera is not ready yet.");
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `Request failed ${res.status}`);
    return data;
  }

  function validateOperatorFields() {
    if (!form.person_name.trim()) {
      setError("Enter the operator name first.");
      return false;
    }
    if (!form.department.trim()) {
      setError("Enter the department first.");
      return false;
    }
    return true;
  }

  async function loadAdminData(password = adminPassword) {
    const data = await postJson("/api/machine-check/admin/logs", { password });
    setAdminLogs(data.logs || []);
    setAdminPeople(data.people || []);
    return data;
  }

  async function handleAdminEnter() {
    setLoading(true);
    setError("");
    setStatus("Checking admin password...");
    try {
      const data = await loadAdminData(adminPassword);
      setAdminAuthed(true);
      setAdminTab("logs");
      setStatus(`Loaded ${(data.logs || []).length} confirmations.`);
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!validateOperatorFields()) return;
    setLoading(true);
    setError("");
    setStatus("Registering face...");
    try {
      const image = captureImage();
      const data = await postJson("/api/face/register", {
        ...form,
        machine_name: selectedMachineName,
        image,
      });
      setLastRegister(data);
      setStatus(`Registered ${form.person_name}.`);
      stopCamera();
      await loadAdminData(adminPassword);
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmCheck(options = {}) {
    const { silent = false } = options;
    if (loading) return;
    setLoading(true);
    if (!silent) {
      setError("");
      setStatus("Scanning...");
    }
    try {
      const image = captureImage();
      const data = await postJson("/api/machine-check/confirm", {
        machine: defaultMachineId || form.machine,
        machine_name: selectedMachineName,
        image,
      });
      stopCamera();
      onClose();
      onConfirmed?.(`Confirmed: ${data.log?.person_name || "Machine check saved"}`);
    } catch (err) {
      if (silent) {
        window.clearTimeout(confirmRetryRef.current);
        confirmRetryRef.current = window.setTimeout(() => {
          handleConfirmCheck({ silent: true });
        }, 1800);
      } else {
        setError(err.message);
        setStatus("");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleUnregister(row) {
    if (!row?.face_api_id && !row?.face_img_name) return;
    setLoading(true);
    setError("");
    setStatus("Deactivating face...");
    try {
      const data = await postJson("/api/face/unregister", {
        password: adminPassword,
        face_api_id: row.face_api_id || undefined,
        face_img_name: row.face_img_name || undefined,
      });
      setStatus(data.message || "Face deactivated.");
      await loadAdminData(adminPassword);
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="face-modal-backdrop" onClick={onClose}>
      <div className={`face-modal ${mode === "confirm" ? "face-modal-confirm-only" : ""} ${mode === "admin" && adminAuthed ? "face-modal-admin" : ""} ${mode === "admin" && !adminAuthed ? "face-modal-admin-auth" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className={`face-modal-header ${mode === "confirm" ? "confirm-only-header" : ""}`}>
          {mode !== "confirm" && (
            <div>
              <div className="face-modal-kicker">Machine Check</div>
              <div className="face-modal-title">
                {mode === "admin" && "Admin"}
              </div>
            </div>
          )}
          <button className="face-modal-close" onClick={onClose}>×</button>
        </div>

        {mode === "menu" && (
          <div className="face-action-grid two">
            <button className="face-action-card" onClick={() => chooseMode("confirm")}>
              <strong>Confirmation</strong>
              <span>Open the live facial confirmation camera.</span>
            </button>
            <button className="face-action-card" onClick={() => chooseMode("admin")}>
              <strong>Admin</strong>
              <span>Manage confirmations and registered operators.</span>
            </button>
          </div>
        )}

        {mode === "confirm" && (
          <div className="face-confirm-only-shell">
            <div className="face-camera-card clean-confirm-camera camera-only-card">
              <video ref={videoRef} className="face-camera-video" playsInline muted />
              <canvas ref={canvasRef} style={{ display: "none" }} />
            </div>
          </div>
        )}

        {mode === "admin" && !adminAuthed && (
          <div className="face-admin-auth-card">
            <div className="face-admin-auth-copy">
              <div className="face-admin-auth-title">Admin Access</div>
              <div className="face-admin-auth-subtitle">Enter the administrator password to open logs and registration tools.</div>
            </div>
            <div className="face-form-grid single admin-auth-grid">
              <label>
                Admin Password
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter admin password"
                  onKeyDown={(e) => e.key === "Enter" && handleAdminEnter()}
                />
              </label>
            </div>
            <div className="face-modal-actions">
              <button className="face-secondary-btn" onClick={resetToMenu}>Back</button>
              <button className="face-primary-btn" onClick={handleAdminEnter} disabled={loading || !adminPassword}>
                {loading ? "Checking..." : "Enter Admin"}
              </button>
            </div>
          </div>
        )}

        {mode === "admin" && adminAuthed && (
          <div className={`face-admin-content ${adminTab === "logs" ? "admin-logs" : "admin-register"}`}>
            <div className="face-admin-tabs">
              <button className={adminTab === "logs" ? "active" : ""} onClick={() => chooseAdminTab("logs")}>Logs</button>
              <button className={adminTab === "register" ? "active" : ""} onClick={() => chooseAdminTab("register")}>Register</button>
            </div>

            {adminTab === "logs" && (
              <div className="face-admin-panel">
                <div className="face-filter-grid face-filter-grid-logs">
                  <label>Date<input type="date" value={filters.date} onChange={(e) => setFilters((p) => ({ ...p, date: e.target.value }))} /></label>
                  <label>Name<input value={filters.name} onChange={(e) => setFilters((p) => ({ ...p, name: e.target.value }))} placeholder="Filter name" /></label>
                  <label>Machine<input value={filters.machine} onChange={(e) => setFilters((p) => ({ ...p, machine: e.target.value }))} placeholder="Filter machine" /></label>
                  <label>Department<input value={filters.department} onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value }))} placeholder="Filter department" /></label>
                </div>

                <div className="face-admin-table-wrap polished-table-wrap logs-table-wrap">
                  <table className="face-admin-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Name</th>
                        <th>Department</th>
                        <th>Machine</th>
                        <th>Employee</th>
                        <th>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((row) => (
                        <tr key={row.id}>
                          <td>{formatDateTime(row.created_at)}</td>
                          <td>{row.person_name}</td>
                          <td>{row.department || "-"}</td>
                          <td>{row.machine_name || row.machine || "-"}</td>
                          <td>{row.employee_id || "-"}</td>
                          <td>{row.role || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminTab === "register" && (
              <div className="face-register-layout">
                <div className="face-register-pane">
                  <div className="face-register-pane-title">Register New Face</div>
                  <div className="face-form-grid register-grid">
                    <label>Operator Name<input value={form.person_name} onChange={(e) => setForm((p) => ({ ...p, person_name: e.target.value }))} placeholder="e.g. Justin" /></label>
                    <label>Employee ID<input value={form.employee_id} onChange={(e) => setForm((p) => ({ ...p, employee_id: e.target.value }))} placeholder="Optional" /></label>
                    <label>Department<input value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} placeholder="e.g. Engineering" /></label>
                    <label>Role<select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}><option value="operator">Operator</option><option value="technician">Technician</option><option value="engineer">Engineer</option><option value="admin">Admin</option></select></label>
                    <label>Machine<select value={form.machine} onChange={(e) => setForm((p) => ({ ...p, machine: e.target.value }))}>{machineOptions.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}</select></label>
                  </div>

                  <div className="face-camera-card register-camera">
                    <video ref={videoRef} className="face-camera-video" playsInline muted />
                    <canvas ref={canvasRef} style={{ display: "none" }} />
                  </div>

                  <div className="face-modal-actions compact-actions">
                    {!stream && <button className="face-secondary-btn" onClick={startCamera}>Open Camera</button>}
                    <button className="face-primary-btn" onClick={handleRegister} disabled={loading || !stream}>
                      {loading ? "Registering..." : "Register Face"}
                    </button>
                    <button className="face-secondary-btn" onClick={() => loadAdminData(adminPassword)} disabled={loading}>Refresh</button>
                  </div>

                  {lastRegister && (
                    <div className="face-result-card register-result-card">
                      <strong>Registered Successfully</strong>
                      <span>Name: {lastRegister.operator?.person_name ?? form.person_name}</span>
                      <span>Department: {lastRegister.operator?.department ?? form.department}</span>
                      <span>Machine: {lastRegister.operator?.machine_name ?? selectedMachineName}</span>
                    </div>
                  )}
                </div>

                <div className="face-register-list">
                  <div className="face-admin-title">Registered Faces</div>
                  <div className="face-admin-table-wrap polished-table-wrap register-table-wrap">
                    <table className="face-admin-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Department</th>
                          <th>Machine</th>
                          <th>Employee</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPeople.map((row) => (
                          <tr key={row.id}>
                            <td>{row.person_name}</td>
                            <td>{row.department || "-"}</td>
                            <td>{row.machine_name || row.machine || "-"}</td>
                            <td>{row.employee_id || "-"}</td>
                            <td>{row.role || "-"}</td>
                            <td><span className={`face-status-pill ${row.is_active ? "active" : "inactive"}`}>{row.is_active ? "Active" : "Inactive"}</span></td>
                            <td>
                              <button className="face-table-action" onClick={() => handleUnregister(row)} disabled={loading || !row.is_active}>
                                {row.is_active ? "Remove" : "Inactive"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {mode !== "confirm" && mode !== "admin" && status && <div className="face-status success">{status}</div>}
        {mode !== "confirm" && error && <div className="face-status error">{error}</div>}
      </div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function SummaryStat({ value, label, variant }) {
  return (
    <div className={`summary-stat ${variant || ""}`}>
      <div className="summary-value">{value}</div>
      <div className="summary-label">{label}</div>
    </div>
  );
}

function DetailItem({ label, value, wide }) {
  return (
    <div className={`detail-item ${wide ? "wide" : ""}`}>
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value}</div>
    </div>
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
  const healthyOn = point.interlockOk === true;
  const guardOn = point.guardOpen === false;

  if (healthyOn && guardOn) {
    return {
      label: "Ready",
      className: "safe",
    };
  }

  // Any open guard should be yellow.
  if (!guardOn) {
    return {
      label: "Guard Open",
      className: "warning",
    };
  }

  // Guard is closed, but interlock/healthy signal is not OK.
  // This should be red.
  if (!healthyOn && guardOn) {
    return {
      label: "Interlock",
      className: "danger",
    };
  }

  return {
    label: "Unknown",
    className: "warning",
  };
}

function getZoneState(tags) {
  const states = tags.map((tag) => getSafetyState(tag));
  const hasInterlock = states.some((state) => state.className === "danger");
  const hasGuardOpen = states.some((state) => state.className === "warning");

  if (hasInterlock) {
    return {
      label: "Interlock",
      className: "danger",
    };
  }

  if (hasGuardOpen) {
    return {
      label: "Guard Open",
      className: "warning",
    };
  }

  return {
    label: "Ready",
    className: "safe",
  };
}


function get3DStatusColor(className) {
  if (className === "danger") {
    return {
      fill: "#ef4444",
      emissive: "#991b1b",
      edge: "#b91c1c",
      labelBg: "#b91c1c",
    };
  }

  if (className === "warning") {
    return {
      fill: "#facc15",
      emissive: "#a16207",
      edge: "#ca8a04",
      labelBg: "#b38706",
    };
  }

  return {
    fill: "#22c55e",
    emissive: "#166534",
    edge: "#15803d",
    labelBg: "#15803d",
  };
}

/* =========================================================
   18 - UTILS
========================================================= */

function getStatusClass(status) {
  if (status === "READY") return "running";
  if (status === "DIAGNOSTIC") return "stopped";
  if (status === "GUARD OPEN") return "stopped";
  if (status === "RUNNING") return "running";
  if (status === "STOPPED") return "stopped";

  return "waiting";
}

function toBool(value) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const text = String(value).trim().toLowerCase();

  if (["true", "yes", "on", "open", "running", "ok"].includes(text)) {
    return true;
  }

  if (["false", "no", "off", "closed", "stopped", "fault"].includes(text)) {
    return false;
  }

  return Boolean(value);
}

function parsePercent(value) {
  return Number(String(value).replace("%", ""));
}