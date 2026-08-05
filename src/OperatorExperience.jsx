import { useEffect, useMemo, useRef, useState } from "react";
import {
  SHIFT_OPTIONS,
  addLocalDays,
  formatDate,
  formatTime,
  getShiftLabel,
  localDateKey,
  postJson,
  safeText,
} from "./operatorWorkflow";

export function AdminHome({ onMachineSetup, onOperators }) {
  return (
    <section className="admin-hub" aria-labelledby="admin-hub-title">
      <div className="admin-hub-heading">
        <span>Administration</span>
        <h1 id="admin-hub-title">Choose a workspace</h1>
      </div>
      <div className="admin-hub-options">
        <button className="admin-hub-card floating-media" onClick={onMachineSetup}>
          <i className="admin-hub-icon machine-icon" aria-hidden="true"><b /><b /><b /></i>
          <span><small>Configuration</small><strong>Machine Set Up</strong></span>
          <em aria-hidden="true">→</em>
        </button>
        <button className="admin-hub-card floating-media" onClick={onOperators}>
          <i className="admin-hub-icon operator-icon" aria-hidden="true"><b /><b /></i>
          <span><small>Confirmation</small><strong>Operator</strong></span>
          <em aria-hidden="true">→</em>
        </button>
      </div>
    </section>
  );
}

function isMobileCaptureDevice() {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.userAgentData?.mobile === "boolean") {
    return navigator.userAgentData.mobile;
  }

  const mobileUserAgent = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent || "");
  const coarsePointer = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
  return mobileUserAgent || Boolean(coarsePointer && navigator.maxTouchPoints > 1 && window.innerWidth <= 1024);
}

function useCamera() {
  const [imageData, setImageData] = useState("");
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const isMobileDevice = useMemo(isMobileCaptureDevice, []);
  const supportsLiveCamera = typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia);

  function openImagePicker() {
    fileInputRef.current?.click();
  }

  function stopCamera() {
    setStream((current) => {
      current?.getTracks?.().forEach((track) => track.stop());
      return null;
    });
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      const error = new Error("Live camera is unavailable on this device or connection.");
      setCameraError(error.message);
      throw error;
    }
    stopCamera();
    const nextStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    setStream(nextStream);
    window.setTimeout(async () => {
      if (!videoRef.current) return;
      videoRef.current.srcObject = nextStream;
      await videoRef.current.play().catch(() => {});
    }, 0);
    return nextStream;
  }

  async function registerFace() {
    if (supportsLiveCamera) {
      try {
        await startCamera();
        return "camera";
      } catch {
        openImagePicker();
        return "file";
      }
    }
    openImagePicker();
    return "file";
  }

  function captureImage() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      throw new Error("Camera is not ready yet.");
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const value = canvas.toDataURL("image/jpeg", 0.9);
    setImageData(value);
    stopCamera();
    return value;
  }

  function clearImage() {
    stopCamera();
    setImageData("");
    setCameraError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("No image was selected."));
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return reject(new Error("Use a JPG, PNG, or WebP image."));
      if (file.size > 12 * 1024 * 1024) return reject(new Error("The image must be 12 MB or smaller."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The selected image could not be read."));
      reader.onload = () => {
        const value = String(reader.result || "");
        if (!value.startsWith("data:image/")) return reject(new Error("The selected file is not a valid image."));
        stopCamera();
        setImageData(value);
        resolve(value);
      };
      reader.readAsDataURL(file);
    });
  }

  async function readImageEvent(event) {
    const file = event.target.files?.[0];
    if (!file) return "";
    return readImageFile(file);
  }

  useEffect(() => () => {
    stream?.getTracks?.().forEach((track) => track.stop());
  }, [stream]);

  return {
    imageData,
    stream,
    cameraError,
    fileInputRef,
    videoRef,
    canvasRef,
    isMobileDevice,
    supportsLiveCamera,
    captureMode: isMobileDevice ? "user" : undefined,
    openImagePicker,
    registerFace,
    captureImage,
    clearImage,
    readImageEvent,
    stopCamera,
  };
}

export function ConfirmationModal({ machine, theme, onClose, onConfirmed }) {
  const [phase, setPhase] = useState("capture");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const camera = useCamera();

  useEffect(() => {
    setPhase("capture");
    setResult(null);
    setError("");
    camera.clearImage();
  }, [machine.id]);

  async function chooseOperatorImage(event) {
    setError("");
    try {
      const image = await camera.readImageEvent(event);
      if (!image) return;
      await detectOperator(image);
    } catch (imageError) {
      setError(imageError.message);
      setPhase("error");
    }
  }

  async function captureAndDetect() {
    try {
      const image = camera.captureImage();
      await detectOperator(image);
    } catch (captureError) {
      setError(captureError.message);
      setPhase("error");
    }
  }

  async function detectOperator(image) {
    if (!image || loading) return;
    setLoading(true);
    setPhase("detecting");
    setError("");
    try {
      const data = await postJson("/api/machine-check/detect", {
        machine: machine.id,
        machine_name: machine.name,
        image,
      });
      setResult(data);
      setPhase(data.not_required ? "not-required" : "detected");
    } catch (detectError) {
      setError(detectError.message);
      setPhase("error");
    } finally {
      setLoading(false);
    }
  }

  function chooseAnotherImage() {
    setError("");
    setResult(null);
    setPhase("capture");
    camera.clearImage();
    window.setTimeout(camera.registerFace, 0);
  }

  async function confirmOperator() {
    if (!result?.detection_token || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await postJson("/api/machine-check/confirm", {
        detection_token: result.detection_token,
      });
      const message = data.not_required
        ? data.machine_state?.label || "No confirmation required"
        : `${safeText(data.operator?.person_name)} confirmed ${safeText(data.machine?.name)}.`;
      onConfirmed?.(message);
      onClose();
    } catch (confirmError) {
      setError(confirmError.message);
      setPhase("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="confirmation-backdrop" data-theme={theme} onClick={onClose}>
      <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-label="Operator confirmation" onClick={(event) => event.stopPropagation()}>
        <button className="confirmation-close" onClick={onClose} aria-label="Close">×</button>
        <input
          ref={camera.fileInputRef}
          className="face-image-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture={camera.captureMode}
          onChange={chooseOperatorImage}
        />

        {(phase === "capture" || phase === "detecting") && (
          <div className="confirmation-capture-stage">
            {camera.stream ? (
              <div className="confirmation-live-camera">
                <video ref={camera.videoRef} playsInline muted autoPlay />
                <canvas ref={camera.canvasRef} hidden />
                <button className="primary" type="button" onClick={captureAndDetect}>Capture Face</button>
              </div>
            ) : camera.imageData ? (
              <img src={camera.imageData} alt="Selected operator face" />
            ) : (
              <div className="confirmation-capture-empty">
                <i aria-hidden="true" />
                <span>Face registration</span>
                <h2>Register the operator face</h2>
                <p>
                  {camera.supportsLiveCamera
                    ? "A live camera will open. If camera access fails, select a clear face image instead."
                    : "Live camera is unavailable, so a clear face image can be selected instead."}
                </p>
                <button className="primary" type="button" onClick={camera.registerFace}>
                  Register Face
                </button>
              </div>
            )}
            {phase === "detecting" && (
              <div className="confirmation-detecting-overlay">
                <div className="confirmation-scanning"><i />Detecting operator</div>
              </div>
            )}
          </div>
        )}

        {phase === "detected" && (
          <div className="confirmation-identity">
            <div className="confirmation-checkmark" aria-hidden="true">✓</div>
            <span>Registered operator detected</span>
            <h2>{safeText(result?.operator?.person_name)}</h2>
            <div className="confirmation-identity-grid">
              <div><small>Machine</small><strong>{safeText(result?.machine?.name)}</strong></div>
              <div><small>Shift</small><strong>{safeText(result?.shift?.label)}</strong></div>
              <div><small>Confirmation window</small><strong>{safeText(result?.shift?.confirmation_window)}</strong></div>
              <div><small>Identity</small><strong>Matches registration</strong></div>
            </div>
            <p>Confirm that you checked this machine.</p>
            <div className="confirmation-actions">
              <button onClick={chooseAnotherImage}>Use another image</button>
              <button className="primary" onClick={confirmOperator} disabled={loading}>{loading ? "Saving…" : "Confirm"}</button>
            </div>
          </div>
        )}

        {phase === "not-required" && (
          <div className="confirmation-identity neutral">
            <div className="confirmation-offline-mark" aria-hidden="true">—</div>
            <span>Confirmation not required</span>
            <h2>{safeText(result?.machine?.name)}</h2>
            <p>{safeText(result?.machine_state?.label)}</p>
            <div className="confirmation-actions single"><button className="primary" onClick={onClose}>Done</button></div>
          </div>
        )}

        {phase === "error" && (
          <div className="confirmation-identity error">
            <div className="confirmation-error-mark" aria-hidden="true">!</div>
            <span>Face not confirmed</span>
            <h2>Try another image</h2>
            <p>{safeText(error)}</p>
            <div className="confirmation-actions"><button onClick={onClose}>Cancel</button><button className="primary" onClick={chooseAnotherImage}>Register Face</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function MatrixCell({ cell }) {
  if (!cell || cell.state === "NO_DATA") return <span className="operator-cell-empty">No Data</span>;
  if (cell.state === "FUTURE") return <span className="operator-cell-future">—</span>;

  return (
    <div className="operator-cell-entries">
      {cell.entries.map((entry) => (
        <div className={`operator-log-entry ${String(entry.state).toLowerCase().replaceAll("_", "-")}`} key={entry.registration_id}>
          <i aria-hidden="true" />
          <span><strong>{safeText(entry.person_name)}</strong><small>{safeText(entry.machine_name)}</small></span>
          <em>
            {entry.state === "CONFIRMED" && `Confirmed ${formatTime(entry.confirmed_at)}`}
            {entry.state === "MISSED" && "Not confirmed"}
            {entry.state === "MACHINE_OFF" && "Machine off"}
            {entry.state === "FUTURE" && "—"}
          </em>
        </div>
      ))}
    </div>
  );
}

function excelCell(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function buildOperatorLogRows(matrix) {
  const rows = [];
  (matrix || []).forEach((day) => {
    SHIFT_OPTIONS.forEach((shift) => {
      const cell = day.shifts?.[shift.value];
      if (!cell?.entries?.length) {
        rows.push({ date: day.date, shift: shift.label, hours: shift.hours, state: cell?.state || "NO_DATA", operator: "No Data", machine: "No Data", confirmed_at: "No Data" });
        return;
      }
      cell.entries.forEach((entry) => rows.push({
        date: day.date,
        shift: shift.label,
        hours: shift.hours,
        state: entry.state || "No Data",
        operator: entry.person_name || "No Data",
        machine: entry.machine_name || "No Data",
        confirmed_at: entry.confirmed_at ? formatTime(entry.confirmed_at) : "No Data",
      }));
    });
  });
  return rows;
}

export function OperatorAdminPage({ machines, password }) {
  const today = localDateKey();
  const [tab, setTab] = useState("registration");
  const [context, setContext] = useState(null);
  const [overview, setOverview] = useState({ matrix: [], registrations: [] });
  const [filters, setFilters] = useState({
    date_from: addLocalDays(today, -7),
    date_to: addLocalDays(today, 2),
    machine: "",
  });
  const [form, setForm] = useState({ person_name: "", machine: machines?.[0]?.id || "", shift_code: "MORNING" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const camera = useCamera();

  const machineOptions = (machines || []).filter((machine) => machine.is_active !== false);
  const selectedMachine = machineOptions.find((item) => item.id === form.machine) || machineOptions[0] || null;
  const selectedWindow = context?.windows?.find((window) => window.shift_code === form.shift_code);
  const registrationRows = useMemo(() => overview.registrations || [], [overview.registrations]);

  useEffect(() => {
    loadContext();
    loadOverview();
  }, []);

  useEffect(() => {
    if (!form.machine && machineOptions[0]?.id) {
      setForm((current) => ({ ...current, machine: machineOptions[0].id }));
    }
  }, [machineOptions, form.machine]);

  async function loadContext() {
    try {
      const response = await fetch("/api/operator/registration-context");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load shift windows.");
      setContext(data);
      if (data.open_shift?.shift_code) {
        setForm((current) => ({ ...current, shift_code: data.open_shift.shift_code }));
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function loadOverview(nextFilters = filters) {
    setLoading(true);
    setError("");
    try {
      const data = await postJson("/api/operator/admin/overview", { password, ...nextFilters });
      setOverview(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadLogsExcel() {
    const rows = buildOperatorLogRows(overview.matrix);
    if (!rows.length) {
      setError("No Data to export.");
      return;
    }
    const headings = ["Date", "Shift", "Shift hours", "Status", "Operator", "Machine", "Confirmed at"];
    const bodyRows = rows.map((row) => [row.date, row.shift, row.hours, row.state, row.operator, row.machine, row.confirmed_at]);
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headings.map((item) => `<th>${excelCell(item)}</th>`).join("")}</tr></thead><tbody>${bodyRows.map((row) => `<tr>${row.map((item) => `<td>${excelCell(item)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `operator-logs_${filters.date_from}_to_${filters.date_to}.xls`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function registerOperator() {
    if (!form.person_name.trim()) {
      setError("Enter the operator name.");
      return;
    }
    if (!selectedMachine) {
      setError("No Data: add a machine before registering an operator.");
      return;
    }
    if (!camera.imageData) {
      setError(camera.isMobileDevice
        ? "Take an operator photo before registering."
        : "Choose an operator image before registering.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await postJson("/api/operator/register", {
        password,
        person_name: form.person_name.trim(),
        machine: form.machine,
        machine_name: selectedMachine?.name,
        shift_code: form.shift_code,
        image: camera.imageData,
      });
      camera.clearImage();
      setMessage(data.message || "Operator registered.");
      setForm((current) => ({ ...current, person_name: "" }));
      await Promise.all([loadContext(), loadOverview()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function chooseRegistrationImage(event) {
    setError("");
    setMessage("");
    try {
      await camera.readImageEvent(event);
    } catch (imageError) {
      camera.clearImage();
      setError(imageError.message);
    }
  }

  function selectTab(nextTab) {
    camera.clearImage();
    setTab(nextTab);
    setError("");
    setMessage("");
  }

  return (
    <section className="operator-admin">
      <header className="operator-admin-heading">
        <div><span>Operator confirmation</span><h1>Registration and logs</h1></div>
        <div className="operator-heading-actions">
          <button className="operator-download-button" type="button" onClick={downloadLogsExcel}>Download Excel</button>
          <div className="operator-tabs" role="tablist">
            <button className={tab === "registration" ? "active" : ""} onClick={() => selectTab("registration")}>Registration</button>
            <button className={tab === "logs" ? "active" : ""} onClick={() => selectTab("logs")}>Logs</button>
          </div>
        </div>
      </header>

      {message && <div className="operator-notice success">{message}</div>}
      {error && <div className="operator-notice error">{error}</div>}

      {tab === "registration" && (
        <div className="operator-registration-layout">
          <section className="operator-registration-card">
            <div className="operator-section-heading"><span>Register shift</span><strong>Operator assignment</strong></div>
            <div className="operator-registration-fields">
              <label>Operator name<input value={form.person_name} onChange={(event) => setForm((current) => ({ ...current, person_name: event.target.value }))} autoComplete="off" /></label>
              <label>Machine<select value={form.machine} onChange={(event) => setForm((current) => ({ ...current, machine: event.target.value }))}>{machineOptions.length ? machineOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>) : <option value="">No Data</option>}</select></label>
              <label>Shift<select value={form.shift_code} onChange={(event) => setForm((current) => ({ ...current, shift_code: event.target.value }))}>{SHIFT_OPTIONS.map((shift) => <option value={shift.value} key={shift.value}>{shift.label} · {shift.hours}</option>)}</select></label>
            </div>
            <div className={`operator-window ${selectedWindow?.is_in_window ? "open" : "closed"}`}>
              <i aria-hidden="true" />
              <span><strong>{selectedWindow?.is_in_window ? "Registration open" : "Registration closed"}</strong><small>{selectedWindow ? `${selectedWindow.shift_label} registers from ${selectedWindow.verification_label}` : "No Data"}</small></span>
            </div>
            <input
              ref={camera.fileInputRef}
              className="face-image-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture={camera.captureMode}
              onChange={chooseRegistrationImage}
            />
            <div className={`operator-camera ${camera.imageData ? "has-image" : ""} ${camera.stream ? "is-live" : ""}`}>
              {camera.stream ? (
                <video ref={camera.videoRef} playsInline muted autoPlay />
              ) : camera.imageData ? (
                <img src={camera.imageData} alt="Operator registration preview" />
              ) : (
                <div>
                  <i aria-hidden="true" />
                  <strong>Face registration</strong>
                  <span>
                    {camera.isMobileDevice
                      ? "Open the front camera and take a clear photo."
                      : "Choose a clear face image from this laptop or desktop."}
                  </span>
                </div>
              )}
            </div>
            <canvas ref={camera.canvasRef} hidden />
            <div className="operator-registration-actions">
              {(camera.imageData || camera.stream) && <button onClick={camera.clearImage}>Cancel Face</button>}
              {camera.stream ? (
                <button onClick={() => {
                  try { camera.captureImage(); } catch (captureError) { setError(captureError.message); }
                }}>Capture Face</button>
              ) : (
                <button onClick={camera.registerFace}>{camera.imageData ? "Replace Face" : "Register Face"}</button>
              )}
              <button className="primary" onClick={registerOperator} disabled={loading || !camera.imageData || !selectedWindow?.is_in_window || !selectedMachine}>{loading ? "Registering…" : "Register operator"}</button>
            </div>
          </section>

          <section className="operator-assignments-card">
            <div className="operator-section-heading"><span>Assignments</span><strong>Registered shifts</strong></div>
            <div className="operator-assignment-list">
              {registrationRows.length ? registrationRows.map((row) => (
                <div className="operator-assignment-row" key={row.id}>
                  <i aria-hidden="true" />
                  <span><strong>{safeText(row.person_name)}</strong><small>{safeText(row.machine_name)}</small></span>
                  <span><strong>{getShiftLabel(row.shift_code)}</strong><small>{formatDate(row.shift_date)}</small></span>
                </div>
              )) : <div className="operator-empty-state">No Data</div>}
            </div>
          </section>
        </div>
      )}

      {tab === "logs" && (
        <section className="operator-logs-card">
          <div className="operator-log-controls">
            <label>From<input type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))} /></label>
            <label>To<input type="date" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))} /></label>
            <label>Machine<select value={filters.machine} onChange={(event) => setFilters((current) => ({ ...current, machine: event.target.value }))}><option value="">All machines</option>{machineOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <button onClick={() => loadOverview()} disabled={loading}>{loading ? "Loading…" : "Apply"}</button>
          </div>
          <div className="operator-log-legend"><span className="confirmed">Confirmed</span><span className="missed">Not confirmed</span><span className="machine-off">Machine off</span><span className="future">Future date</span></div>
          <div className="operator-log-table-wrap">
            <table className="operator-log-table">
              <thead><tr><th>Date</th>{SHIFT_OPTIONS.map((shift) => <th key={shift.value}><strong>{shift.label}</strong><span>{shift.hours}</span></th>)}</tr></thead>
              <tbody>
                {(overview.matrix || []).length ? [...overview.matrix].reverse().map((row) => (
                  <tr key={row.date}>
                    <th><strong>{formatDate(row.date)}</strong><span>{row.date === today ? "Today" : row.is_future ? "Future" : ""}</span></th>
                    {SHIFT_OPTIONS.map((shift) => <td key={shift.value}><MatrixCell cell={row.shifts?.[shift.value]} /></td>)}
                  </tr>
                )) : <tr><td colSpan={4}><div className="operator-empty-state">No Data</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
