import { useEffect, useMemo, useState } from "react";
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


function normalizePin(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function PinInput({ value, onChange, disabled = false, autoFocus = false, ariaLabel = "6-digit PIN" }) {
  return (
    <input
      className="pin-input"
      type="password"
      inputMode="numeric"
      autoComplete="off"
      pattern="[0-9]*"
      maxLength={6}
      value={value}
      onChange={(event) => onChange(normalizePin(event.target.value))}
      placeholder="••••••"
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
    />
  );
}

export function ConfirmationModal({ machine, theme, onClose, onConfirmed }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPin("");
    setError("");
  }, [machine.id]);

  async function confirmOperator(event) {
    event?.preventDefault?.();
    if (loading) return;
    if (pin.length !== 6) {
      setError("Enter your 6-digit PIN.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await postJson("/api/machine-check/confirm", {
        machine: machine.id,
        machine_name: machine.name,
        pin,
      });

      const message = `${safeText(data.operator?.person_name)} confirmed ${safeText(data.machine?.name)}.`;

      onConfirmed?.(message);
      onClose();
    } catch (confirmError) {
      setError(confirmError.message);
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="confirmation-backdrop" data-theme={theme} onClick={onClose}>
      <section
        className="confirmation-dialog confirmation-pin-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Operator PIN confirmation"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="confirmation-close" onClick={onClose} aria-label="Close">×</button>

        <form className="confirmation-pin-stage" onSubmit={confirmOperator}>
          <div className="confirmation-pin-icon" aria-hidden="true"><span>•••</span><span>•••</span></div>
          <span className="confirmation-pin-kicker">Machine confirmation</span>
          <h2>Enter your 6-digit PIN</h2>

          <div className="confirmation-pin-machine">
            <small>Machine</small>
            <strong>{safeText(machine.name)}</strong>
          </div>

          <PinInput
            value={pin}
            onChange={setPin}
            disabled={loading}
            autoFocus
            ariaLabel="6-digit PIN for machine confirmation"
          />

          {error && <div className="confirmation-pin-error">{safeText(error)}</div>}

          <div className="confirmation-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button className="primary" type="submit" disabled={loading || pin.length !== 6}>
              {loading ? "Confirming…" : "Confirm check"}
            </button>
          </div>
        </form>
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
  const [form, setForm] = useState({ person_name: "", machine: machines?.[0]?.id || "", shift_code: "MORNING", pin: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
    if (form.pin.length !== 6) {
      setError("Enter your 6-digit PIN.");
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
        pin: form.pin,
      });
      setMessage(data.message || "Operator registered.");
      setForm((current) => ({ ...current, person_name: "", pin: "" }));
      await Promise.all([loadContext(), loadOverview()]);
    } catch (requestError) {
      setError(requestError.message);
      setForm((current) => ({ ...current, pin: "" }));
    } finally {
      setLoading(false);
    }
  }

  function selectTab(nextTab) {
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
            <div className="operator-pin-panel compact">
              <label className="operator-pin-field">
                <span>6-digit PIN</span>
                <PinInput
                  value={form.pin}
                  onChange={(pin) => setForm((current) => ({ ...current, pin }))}
                  disabled={loading}
                  ariaLabel="6-digit PIN for operator registration"
                />
              </label>
            </div>
            <div className="operator-registration-actions">
              <button
                className="primary"
                onClick={registerOperator}
                disabled={loading || form.pin.length !== 6 || !selectedMachine}
              >
                {loading ? "Registering…" : "Register operator"}
              </button>
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
