import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
const SHIFT_OPTIONS = [
  { value: "MORNING", label: "1st shift", hours: "6 AM - 2 PM", window: "6 AM - 10 AM" },
  { value: "AFTERNOON", label: "2nd shift", hours: "2 PM - 10 PM", window: "2 PM - 6 PM" },
  { value: "NIGHT", label: "3rd shift", hours: "10 PM - 6 AM", window: "10 PM - 2 AM" },
];

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Request failed ${response.status}`);
  return data;
}

function localDateKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function addLocalDays(dateKey, days) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function getShiftLabel(value) {
  const shift = SHIFT_OPTIONS.find((item) => item.value === String(value || "").toUpperCase());
  return shift ? `${shift.label} · ${shift.hours}` : "No data";
}

function formatDate(value) {
  if (!value) return "No data";
  const dateKey = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "No data";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "No data";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value) {
  if (!value) return "No data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No data";
  return date.toLocaleTimeString(undefined, {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}

function safeText(value) {
  const text = String(value ?? "").trim();
  return text || "No data";
}

function AdminHome({ onMachineSetup, onOperators }) {
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

function PinInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  ariaLabel = "PIN",
  revealed = false,
  onToggleReveal,
}) {
  const input = (
    <input
      className="pin-input"
      type={revealed ? "text" : "password"}
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

  if (!onToggleReveal) return input;

  return (
    <div className="pin-input-shell">
      {input}
      <button
        className="pin-reveal-button"
        type="button"
        onClick={onToggleReveal}
        disabled={disabled}
        aria-label={revealed ? "Hide PIN" : "Show PIN"}
        aria-pressed={revealed}
      >
        {revealed ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.7 10.7 0 0 1 12 4c5.2 0 8.5 5 8.5 5a14.8 14.8 0 0 1-2.4 2.8M6.6 6.6A15 15 0 0 0 3.5 9s3.3 5 8.5 5c1 0 1.8-.2 2.6-.4" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3.3-5 8.5-5 8.5 5 8.5 5-3.3 5-8.5 5-8.5-5-8.5-5Z" /><circle cx="12" cy="12" r="2.25" /></svg>
        )}
      </button>
    </div>
  );
}

function MachineSelect({ options = [], value, onChange, disabled = false, fallback = "No Data" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((item) => item.id === value) || options[0] || null;

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`machine-select${open ? " open" : ""}`} ref={rootRef}>
      <button
        className="machine-select-trigger"
        type="button"
        onClick={() => !disabled && options.length > 1 && setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled || !options.length}
      >
        <span>{safeText(selected?.name || fallback)}</span>
        <i aria-hidden="true" />
      </button>

      {open && options.length > 1 && (
        <div className="machine-select-menu" role="listbox" aria-label="Machine to confirm">
          {options.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === value}
              className={item.id === value ? "selected" : ""}
              onClick={() => {
                onChange(item.id);
                setOpen(false);
              }}
            >
              <span>{safeText(item.name)}</span>
              {item.id === value && <i aria-hidden="true">✓</i>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmationModal({ machine, machines = [], theme, onClose, onConfirmed }) {
  const machineOptions = (machines || []).filter((item) => item?.is_active !== false && item?.id);
  const initialMachineId = machineOptions.some((item) => item.id === machine?.id)
    ? machine.id
    : machineOptions[0]?.id || machine?.id || "";
  const [selectedMachineId, setSelectedMachineId] = useState(initialMachineId);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const machineOptionIds = machineOptions.map((item) => item.id).join("|");

  const selectedMachine = machineOptions.find((item) => item.id === selectedMachineId)
    || machine
    || machineOptions[0]
    || null;

  useEffect(() => {
    const nextMachineId = machineOptions.some((item) => item.id === machine?.id)
      ? machine.id
      : machineOptions[0]?.id || machine?.id || "";
    setSelectedMachineId((current) => (
      machineOptions.some((item) => item.id === current) ? current : nextMachineId
    ));
  }, [machine?.id, machineOptionIds]);

  async function confirmOperator(event) {
    event?.preventDefault?.();
    if (loading) return;
    if (pin.length !== 6) {
      setError("Enter your PIN.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (!selectedMachine?.id) {
        setError("Select a machine.");
        return;
      }

      const data = await postJson("/api/machine-check/confirm", {
        machine: selectedMachine.id,
        machine_name: selectedMachine.name,
        pin,
      });

      const message = `${safeText(data.operator?.person_name)} confirmed ${safeText(data.machine?.name)}.`;

      onConfirmed?.(message);
      onClose();
    } catch (confirmError) {
      setError(confirmError.message);
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
          <h2>Enter your PIN</h2>

          <div className="confirmation-pin-machine">
            <small>Machine</small>
            <MachineSelect
              options={machineOptions.length ? machineOptions : machine ? [machine] : []}
              value={selectedMachineId}
              onChange={(machineId) => {
                setSelectedMachineId(machineId);
                setPin("");
                setShowPin(false);
                setError("");
              }}
              disabled={loading}
              fallback={safeText(machine?.name || "No Data")}
            />
          </div>

          <PinInput
            value={pin}
            onChange={setPin}
            disabled={loading}
            autoFocus
            ariaLabel="PIN for machine confirmation"
            revealed={showPin}
            onToggleReveal={() => setShowPin((current) => !current)}
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
  const text = String(value ?? "");
  // Do not let operator or machine names become Excel formulas.
  const safeValue = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return safeValue.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function excelDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
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
        confirmed_at: entry.confirmed_at || null,
      }));
    });
  });
  return rows;
}

function excelXmlCell(value, styleId, { mergeAcross = 0, type = "String" } = {}) {
  const merge = mergeAcross > 0 ? ` ss:MergeAcross="${mergeAcross}"` : "";
  const cellValue = excelCell(value).replace(/\r?\n/g, "&#10;");
  return `<Cell ss:StyleID="${styleId}"${merge}><Data ss:Type="${type}" xml:space="preserve">${cellValue}</Data></Cell>`;
}

function excelLogCell(cell) {
  if (!cell?.entries?.length) {
    const isFuture = cell?.state === "FUTURE";
    return {
      entryCount: 1,
      styleId: isFuture ? "EntryFuture" : "EntryNoData",
      value: isFuture ? "—" : "No Data",
    };
  }

  const normalizedStates = cell.entries.map((entry) => String(entry.state || "NO_DATA").toUpperCase());
  const singleState = normalizedStates.every((state) => state === normalizedStates[0])
    ? normalizedStates[0]
    : "MIXED";
  const styleIds = {
    CONFIRMED: "EntryConfirmed",
    MISSED: "EntryMissed",
    MACHINE_OFF: "EntryMachineOff",
    FUTURE: "EntryFuture",
    NO_DATA: "EntryNoData",
    MIXED: "EntryNeutral",
  };
  const bullets = {
    CONFIRMED: "●",
    MISSED: "●",
    MACHINE_OFF: "●",
    FUTURE: "○",
    NO_DATA: "○",
  };
  const value = cell.entries.map((entry) => {
    const state = String(entry.state || "NO_DATA").toUpperCase();
    const statusDetail = entry.state === "CONFIRMED"
      ? `Confirmed ${formatTime(entry.confirmed_at)}`
      : entry.state === "MISSED"
        ? "Not confirmed"
        : entry.state === "MACHINE_OFF"
          ? "Machine off"
          : "Future";
    return `${bullets[state] || "○"} ${entry.person_name || "No Data"}\n${entry.machine_name || "No Data"}\n${statusDetail}`;
  }).join("\n\n");

  return {
    entryCount: cell.entries.length,
    styleId: styleIds[singleState] || "EntryNeutral",
    value,
  };
}

function OperatorAdminPage({ machines, password }) {
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
    const reportDays = [...(overview.matrix || [])].reverse();
    if (!reportDays.length) {
      setError("No Data to export.");
      return;
    }
    const rows = buildOperatorLogRows(overview.matrix);
    const counts = rows.reduce((summary, row) => {
      const key = String(row.state || "NO_DATA").toUpperCase();
      summary[key] = (summary[key] || 0) + 1;
      return summary;
    }, {});
    const reportMachine = filters.machine
      ? machineOptions.find((machine) => machine.id === filters.machine)?.name || filters.machine
      : "All machines";
    const generatedAt = excelDateTime(new Date());
    const firstDataRow = 10;
    const lastDataRow = firstDataRow + reportDays.length - 1;
    const reportRows = reportDays.map((day) => {
      const dateNote = day.date === today ? "Today" : day.is_future ? "Future" : "";
      const shiftCells = SHIFT_OPTIONS.map((shift) => excelLogCell(day.shifts?.[shift.value]));
      const tallestCell = Math.max(1, ...shiftCells.map((cell) => cell.entryCount));
      const rowHeight = 78 + Math.max(0, tallestCell - 1) * 64;
      const dateValue = `${formatDate(day.date)}${dateNote ? ` · ${dateNote}` : ""}`;
      return `<Row ss:AutoFitHeight="0" ss:Height="${rowHeight}">
        ${excelXmlCell(dateValue, "DateCell")}
        ${shiftCells.map((cell) => excelXmlCell(cell.value, cell.styleId)).join("")}
      </Row>`;
    }).join("");
    const styles = `
      <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#172033"/></Style>
      <Style ss:ID="Title"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#111C2D" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Subtitle"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#AEBBD0"/><Interior ss:Color="#111C2D" ss:Pattern="Solid"/></Style>
      <Style ss:ID="MetaLabel"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#5D6D83"/><Interior ss:Color="#E8EDF4" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CAD4E0"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CAD4E0"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CAD4E0"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CAD4E0"/></Borders></Style>
      <Style ss:ID="MetaValue"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#172033"/><Interior ss:Color="#F7F9FC" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CAD4E0"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CAD4E0"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CAD4E0"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CAD4E0"/></Borders></Style>
      <Style ss:ID="Spacer"><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>
      <Style ss:ID="SummaryLabel"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#5D6D83"/><Interior ss:Color="#EDF1F6" ss:Pattern="Solid"/></Style>
      <Style ss:ID="SummaryConfirmed"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="15" ss:Bold="1" ss:Color="#16794C"/><Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/></Style>
      <Style ss:ID="SummaryMissed"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="15" ss:Bold="1" ss:Color="#B4232F"/><Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/></Style>
      <Style ss:ID="SummaryMachineOff"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="15" ss:Bold="1" ss:Color="#9A5B08"/><Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/></Style>
      <Style ss:ID="SummaryNoData"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="15" ss:Bold="1" ss:Color="#667085"/><Interior ss:Color="#EEF2F6" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Legend"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#5D6D83"/><Interior ss:Color="#F7F9FC" ss:Pattern="Solid"/></Style>
      <Style ss:ID="MatrixHeader"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#172333" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#324357"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#324357"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#324357"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#324357"/></Borders></Style>
      <Style ss:ID="DateCell"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#172333" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#324357"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#324357"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#324357"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#324357"/></Borders></Style>
      <Style ss:ID="EntryNeutral"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#172033"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CED8E4"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#93A1AE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CED8E4"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CED8E4"/></Borders></Style>
      <Style ss:ID="EntryConfirmed"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#16794C"/><Interior ss:Color="#EFFAF4" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8E6CC"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="3" ss:Color="#59D68D"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8E6CC"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8E6CC"/></Borders></Style>
      <Style ss:ID="EntryMissed"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#B4232F"/><Interior ss:Color="#FFF1F2" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3C3C7"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="3" ss:Color="#FF6F76"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3C3C7"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3C3C7"/></Borders></Style>
      <Style ss:ID="EntryMachineOff"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#9A5B08"/><Interior ss:Color="#FFF8E7" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E9D3A8"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="3" ss:Color="#D29A45"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E9D3A8"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E9D3A8"/></Borders></Style>
      <Style ss:ID="EntryFuture"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="13" ss:Color="#8996A5"/><Interior ss:Color="#F2F5F8" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5DDE6"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5DDE6"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5DDE6"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5DDE6"/></Borders></Style>
      <Style ss:ID="EntryNoData"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#8996A5"/><Interior ss:Color="#EDF1F5" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5DDE6"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5DDE6"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5DDE6"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5DDE6"/></Borders></Style>
      <Style ss:ID="Footnote"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#667085"/></Style>`;
    const expandedRowCount = reportDays.length + 10;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>Mespack Operator Confirmation Report</Title><Created>${new Date().toISOString()}</Created></DocumentProperties>
  <Styles>${styles}</Styles>
  <Worksheet ss:Name="Operator Logs">
    <Table ss:ExpandedColumnCount="4" ss:ExpandedRowCount="${expandedRowCount}" x:FullColumns="1" x:FullRows="1">
      <Column ss:AutoFitWidth="0" ss:Width="75"/>
      <Column ss:AutoFitWidth="0" ss:Width="103"/>
      <Column ss:AutoFitWidth="0" ss:Width="103"/>
      <Column ss:AutoFitWidth="0" ss:Width="103"/>
      <Row ss:AutoFitHeight="0" ss:Height="45">${excelXmlCell("Mespack Operator Confirmation Report", "Title", { mergeAcross: 3 })}</Row>
      <Row ss:AutoFitHeight="0" ss:Height="30">${excelXmlCell("The same date-by-shift view shown in Operator Logs", "Subtitle", { mergeAcross: 3 })}</Row>
      <Row ss:AutoFitHeight="0" ss:Height="34">${excelXmlCell("REPORT PERIOD", "MetaLabel")}${excelXmlCell(`${filters.date_from} to ${filters.date_to}`, "MetaValue")}${excelXmlCell("MACHINE", "MetaLabel")}${excelXmlCell(reportMachine, "MetaValue")}</Row>
      <Row ss:AutoFitHeight="0" ss:Height="34">${excelXmlCell("GENERATED", "MetaLabel")}${excelXmlCell(generatedAt, "MetaValue")}${excelXmlCell("TIMEZONE", "MetaLabel")}${excelXmlCell("Asia/Manila (UTC+8)", "MetaValue")}</Row>
      <Row ss:AutoFitHeight="0" ss:Height="9">${excelXmlCell("", "Spacer", { mergeAcross: 3 })}</Row>
      <Row ss:AutoFitHeight="0" ss:Height="30">${["Confirmed", "Not confirmed", "Machine off", "Future / No Data"].map((label) => excelXmlCell(label, "SummaryLabel")).join("")}</Row>
      <Row ss:AutoFitHeight="0" ss:Height="28">${excelXmlCell(counts.CONFIRMED || 0, "SummaryConfirmed", { type: "Number" })}${excelXmlCell(counts.MISSED || 0, "SummaryMissed", { type: "Number" })}${excelXmlCell(counts.MACHINE_OFF || 0, "SummaryMachineOff", { type: "Number" })}${excelXmlCell((counts.FUTURE || 0) + (counts.NO_DATA || 0), "SummaryNoData", { type: "Number" })}</Row>
      <Row ss:AutoFitHeight="0" ss:Height="25">${excelXmlCell("Legend:  ● Confirmed     ● Not confirmed     ● Machine off     ○ Future / No Data", "Legend", { mergeAcross: 3 })}</Row>
      <Row ss:AutoFitHeight="0" ss:Height="36">${excelXmlCell("Date", "MatrixHeader")}${SHIFT_OPTIONS.map((shift) => excelXmlCell(`${shift.label} · ${shift.hours}`, "MatrixHeader")).join("")}</Row>
      ${reportRows}
      <Row ss:AutoFitHeight="0" ss:Height="24">${excelXmlCell(`Confirmation times use Asia/Manila. Dates exported: ${reportDays.length}. Matrix rows: ${firstDataRow}-${lastDataRow}.`, "Footnote", { mergeAcross: 3 })}</Row>
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <Selected/><FreezePanes/><FrozenNoSplit/>
      <SplitHorizontal>${firstDataRow - 1}</SplitHorizontal><TopRowBottomPane>${firstDataRow - 1}</TopRowBottomPane>
      <SplitVertical>1</SplitVertical><LeftColumnRightPane>1</LeftColumnRightPane><ActivePane>0</ActivePane>
      <DoNotDisplayGridlines/><FitToPage/><PageSetup><Layout x:Orientation="Landscape"/><PageMargins x:Bottom="0.35" x:Left="0.3" x:Right="0.3" x:Top="0.35"/></PageSetup>
      <Print><FitWidth>1</FitWidth><ValidPrinterInfo/></Print><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;
    const blob = new Blob(["\ufeff", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
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
          <button className="operator-download-button" type="button" onClick={downloadLogsExcel}>Download Excel report</button>
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
          <form
            className="operator-registration-card"
            onSubmit={(event) => {
              event.preventDefault();
              registerOperator();
            }}
          >
            <div className="operator-section-heading"><span>Register shift</span><strong>Operator assignment</strong></div>
            <div className="operator-registration-fields">
              <label className="operator-name-field">
                <span>Operator name</span>
                <input value={form.person_name} onChange={(event) => setForm((current) => ({ ...current, person_name: event.target.value }))} autoComplete="off" />
              </label>
              <label>
                <span>Machine</span>
                <select value={form.machine} onChange={(event) => setForm((current) => ({ ...current, machine: event.target.value }))}>
                  {machineOptions.length ? machineOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>) : <option value="">No Data</option>}
                </select>
              </label>
              <label>
                <span>Shift</span>
                <select value={form.shift_code} onChange={(event) => setForm((current) => ({ ...current, shift_code: event.target.value }))}>
                  {SHIFT_OPTIONS.map((shift) => <option value={shift.value} key={shift.value}>{shift.label} · {shift.hours}</option>)}
                </select>
              </label>
              <label className="operator-registration-pin">
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
                type="submit"
                disabled={loading || form.pin.length !== 6 || !selectedMachine}
              >
                {loading ? "Registering…" : "Register operator"}
              </button>
            </div>
          </form>

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

function createAppSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
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
  const sessionRoleRef = useRef(accessRole);
  const appSessionRef = useRef(null);

  if (!appSessionRef.current) {
    appSessionRef.current = {
      id: createAppSessionId(),
      startedAt: new Date().toISOString(),
      ended: false,
    };
  }

  useEffect(() => {
    sessionRoleRef.current = accessRole;
  }, [accessRole]);

  useEffect(() => {
    function finishSession() {
      const session = appSessionRef.current;
      if (!session || session.ended) return;
      session.ended = true;

      const body = JSON.stringify({
        session_id: session.id,
        started_at: session.startedAt,
        access_role: sessionRoleRef.current,
      });

      try {
        if (typeof navigator.sendBeacon === "function") {
          const blob = new Blob([body], { type: "application/json" });
          if (navigator.sendBeacon("/api/session/end", blob)) return;
        }
      } catch {
        // Fall through to keepalive fetch.
      }

      fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }

    window.addEventListener("pagehide", finishSession);
    window.addEventListener("beforeunload", finishSession);
    return () => {
      window.removeEventListener("pagehide", finishSession);
      window.removeEventListener("beforeunload", finishSession);
    };
  }, []);

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

function pointInterpretation(point, payload) {
  const fields = Array.isArray(point.sourceFields) ? point.sourceFields : [];
  if (!fields.length) return null;

  const states = fields.map((field) => {
    const interpreted = interpretIncomingValue(
      payloadValueAtPath(payload, field.source_key),
      field.value_rules,
      field.fallback,
    );

    return {
      ...interpreted,
      sourceKey: field.source_key,
      fieldLabel: field.label,
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
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);
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
    const interpretation = pointInterpretation(point, payload);
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
          <button className="studio-confirm-button" onClick={() => setConfirmationModalOpen(true)} disabled={!machineList.length}>
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

      {confirmationModalOpen && (
        <ConfirmationModal
          machine={activeMachine}
          machines={machineList}
          theme={theme}
          onClose={() => setConfirmationModalOpen(false)}
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
