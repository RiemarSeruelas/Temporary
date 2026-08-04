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

function useCamera() {
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  async function startCamera() {
    stopCamera();
    const nextStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    setStream(nextStream);
    if (videoRef.current) {
      videoRef.current.srcObject = nextStream;
      await videoRef.current.play();
    }
    return nextStream;
  }

  function stopCamera() {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
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
    return canvas.toDataURL("image/jpeg", 0.9);
  }

  useEffect(() => () => {
    stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  return { stream, videoRef, canvasRef, startCamera, stopCamera, captureImage };
}

export function ConfirmationModal({ machine, theme, onClose, onConfirmed }) {
  const [phase, setPhase] = useState("camera");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const autoDetectRef = useRef(null);
  const camera = useCamera();

  useEffect(() => {
    openAndDetect();
    return () => window.clearTimeout(autoDetectRef.current);
  }, [machine.id]);

  async function openAndDetect() {
    setPhase("camera");
    setError("");
    setResult(null);
    try {
      await camera.startCamera();
      window.clearTimeout(autoDetectRef.current);
      autoDetectRef.current = window.setTimeout(detectOperator, 850);
    } catch (cameraError) {
      setError(`Camera unavailable: ${cameraError.message}`);
      setPhase("error");
    }
  }

  async function detectOperator() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await postJson("/api/machine-check/detect", {
        machine: machine.id,
        machine_name: machine.name,
        image: camera.captureImage(),
      });
      camera.stopCamera();
      setResult(data);
      setPhase(data.not_required ? "not-required" : "detected");
    } catch (detectError) {
      camera.stopCamera();
      setError(detectError.message);
      setPhase("error");
    } finally {
      setLoading(false);
    }
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

        {phase === "camera" && (
          <div className="confirmation-camera-stage">
            <video ref={camera.videoRef} playsInline muted />
            <canvas ref={camera.canvasRef} hidden />
            <div className="confirmation-scan-frame" aria-hidden="true"><i /><i /><i /><i /></div>
            <div className="confirmation-scanning"><i />{loading ? "Detecting operator" : "Look directly at the camera"}</div>
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
              <button onClick={openAndDetect}>Redetect</button>
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
            <h2>Try again</h2>
            <p>{safeText(error)}</p>
            <div className="confirmation-actions"><button onClick={onClose}>Cancel</button><button className="primary" onClick={openAndDetect}>Redetect</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function MatrixCell({ cell }) {
  if (!cell || cell.state === "NO_DATA") return <span className="operator-cell-empty">No data</span>;
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
  const [form, setForm] = useState({ person_name: "", machine: machines[0]?.id || "mespack", shift_code: "MORNING" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const camera = useCamera();

  const machineOptions = machines?.length ? machines : [{ id: "mespack", name: "Mespack" }];
  const selectedMachine = machineOptions.find((item) => item.id === form.machine) || machineOptions[0];
  const selectedWindow = context?.windows?.find((window) => window.shift_code === form.shift_code);
  const registrationRows = useMemo(() => overview.registrations || [], [overview.registrations]);

  useEffect(() => {
    loadContext();
    loadOverview();
    return () => camera.stopCamera();
  }, []);

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

  async function registerOperator() {
    if (!form.person_name.trim()) {
      setError("Enter the operator name.");
      return;
    }
    if (!camera.stream) {
      setError("Open the camera before registering the operator.");
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
        image: camera.captureImage(),
      });
      camera.stopCamera();
      setMessage(data.message || "Operator registered.");
      setForm((current) => ({ ...current, person_name: "" }));
      await Promise.all([loadContext(), loadOverview()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleRegistrationCamera() {
    setError("");
    if (camera.stream) {
      camera.stopCamera();
      return;
    }
    try {
      await camera.startCamera();
    } catch (cameraError) {
      setError(`Camera unavailable: ${cameraError.message}`);
    }
  }

  function selectTab(nextTab) {
    camera.stopCamera();
    setTab(nextTab);
    setError("");
    setMessage("");
  }

  return (
    <section className="operator-admin">
      <header className="operator-admin-heading">
        <div><span>Operator confirmation</span><h1>Registration and logs</h1></div>
        <div className="operator-tabs" role="tablist">
          <button className={tab === "registration" ? "active" : ""} onClick={() => selectTab("registration")}>Registration</button>
          <button className={tab === "logs" ? "active" : ""} onClick={() => selectTab("logs")}>Logs</button>
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
              <label>Machine<select value={form.machine} onChange={(event) => setForm((current) => ({ ...current, machine: event.target.value }))}>{machineOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <label>Shift<select value={form.shift_code} onChange={(event) => setForm((current) => ({ ...current, shift_code: event.target.value }))}>{SHIFT_OPTIONS.map((shift) => <option value={shift.value} key={shift.value}>{shift.label} · {shift.hours}</option>)}</select></label>
            </div>
            <div className={`operator-window ${selectedWindow?.is_in_window ? "open" : "closed"}`}>
              <i aria-hidden="true" />
              <span><strong>{selectedWindow?.is_in_window ? "Registration open" : "Registration closed"}</strong><small>{selectedWindow ? `${selectedWindow.shift_label} registers from ${selectedWindow.verification_label}` : "No data"}</small></span>
            </div>
            <div className="operator-camera">
              {camera.stream ? <video ref={camera.videoRef} playsInline muted /> : <div><i aria-hidden="true" /><strong>Face registration</strong><span>The image is sent only for facial-recognition registration.</span></div>}
              <canvas ref={camera.canvasRef} hidden />
            </div>
            <div className="operator-registration-actions">
              <button onClick={toggleRegistrationCamera}>{camera.stream ? "Close camera" : "Open camera"}</button>
              <button className="primary" onClick={registerOperator} disabled={loading || !camera.stream || !selectedWindow?.is_in_window}>{loading ? "Registering…" : "Register operator"}</button>
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
              )) : <div className="operator-empty-state">No data</div>}
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
                )) : <tr><td colSpan={4}><div className="operator-empty-state">No data</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
