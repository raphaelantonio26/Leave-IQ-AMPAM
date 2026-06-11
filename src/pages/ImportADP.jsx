/* ADP Import — upload Leave Roster*.xlsx, validate, preview the diff, and
 * commit only after HR confirms. Every commit writes audit rows with
 * source = "import". The parse → diff → commit pipeline is file-format
 * agnostic past parseRoster, so a direct ADP API pull can replace the upload
 * step later without touching case logic. */
import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle, Users, UserPlus, FolderPlus, RefreshCw, X } from "lucide-react";
import { S, RADIUS, Card, Btn, Badge, PageHeader, EmptyState, DataTable } from "../ui.jsx";
import { FileRosterSource } from "../lib/adp/connector.js";
import { diffRoster } from "../lib/adp/diff.js";
import { useData } from "../data/DataContext.jsx";

const STEPS = ["Upload", "Validate", "Preview", "Commit"];

export default function ImportADP({ viewer, onToast }) {
  const { employees, cases, actions } = useData();
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [diff, setDiff] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  // Priority 6: status-based workforce filtering. Cases are only created for
  // checked statuses; employee RECORDS still import/update for all rows so
  // the directory stays truthful, but inactive people never enter active
  // leave workflows.
  const STATUS_ORDER = ["Active", "Leave of Absence", "Seasonal", "Terminated", "Retired", "Inactive"];
  const normStatus = (s) => { const v = String(s || "Active").trim().toLowerCase(); if (v.startsWith("term")) return "Terminated"; if (v.startsWith("leave") || v === "loa") return "Leave of Absence"; if (v.startsWith("season")) return "Seasonal"; if (v.startsWith("retir")) return "Retired"; if (v.startsWith("inact") || v.startsWith("susp")) return "Inactive"; return "Active"; };
  const [caseStatuses, setCaseStatuses] = useState(() => new Set(["Active", "Leave of Absence", "Seasonal"]));
  const toggleStatus = (s) => setCaseStatuses((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const inputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setFileName(file.name);
    // RosterSource seam: a live ADP API connector implements the same fetch()
    // contract (see src/lib/adp/connector.js) and slots in here unchanged.
    const p = await new FileRosterSource(file).fetch();
    setParsed(p);
    if (p.errors.length === 0 && p.rows.length > 0) {
      setDiff(diffRoster(p.rows, employees, cases));
      setStep(2);
    } else {
      setDiff(null);
      setStep(1);
    }
  }, [employees, cases]);

  const onDrop = useCallback((e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }, [handleFile]);

  const commit = useCallback(async () => {
    if (!diff) return;
    setBusy(true);
    try {
      const filteredDiff = { ...diff, casesToCreate: filteredCases, newEmployees: diff.newEmployees.map((e) => ({ ...e, status: normStatus(e.status) })), updatedEmployees: diff.updatedEmployees.map((u) => u.patch?.status !== undefined ? { ...u, patch: { ...u.patch, status: normStatus(u.patch.status) } } : u) };
      const r = await actions.importCommit(filteredDiff, viewer.name);
      setResult(r); setStep(3);
      onToast?.({ type: "success", message: `Import committed — ${r.added} new, ${r.updated} updated, ${r.cases} cases` });
    } catch (e) {
      onToast?.({ type: "error", message: `Import failed: ${e.message}` });
    }
    setBusy(false);
  }, [diff, actions, viewer, onToast]);

  const reset = () => { setStep(0); setParsed(null); setDiff(null); setResult(null); setFileName(""); };
  const statusByFile = parsed ? Object.fromEntries(parsed.rows.map((r) => [r.file_number, normStatus(r.status)])) : {};
  const statusCounts = parsed ? parsed.rows.reduce((acc, r) => { const s = normStatus(r.status); acc[s] = (acc[s] || 0) + 1; return acc; }, {}) : {};
  const filteredCases = diff ? diff.casesToCreate.filter((r) => caseStatuses.has(statusByFile[r.file_number] || "Active")) : [];
  const excludedCases = diff ? diff.casesToCreate.length - filteredCases.length : 0;

  const cap = { color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 12px", letterSpacing: ".05em", textTransform: "uppercase" };
  const changeCols = [
    { key: "file_number", header: "File #", width: 90, render: (r) => <span style={{ color: S.indigoL, fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{r.file_number}</span> },
    { key: "name", header: "Employee", render: (r) => <span style={{ color: S.text, fontWeight: 600, fontSize: 13 }}>{r.name}</span> },
    { key: "changes", header: "Field changes", render: (r) => <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{r.changes.map((c, i) => <span key={i} style={{ fontSize: 12, color: S.text2 }}><span style={{ color: S.text3 }}>{c.field}:</span> <span style={{ color: S.red, textDecoration: "line-through" }}>{String(c.from) || "—"}</span> → <span style={{ color: S.green }}>{String(c.to)}</span></span>)}</div> },
  ];
  const newCols = [
    { key: "file_number", header: "File #", width: 90, render: (r) => <span style={{ color: S.indigoL, fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{r.file_number}</span> },
    { key: "name", header: "Employee", render: (r) => <span style={{ color: S.text, fontWeight: 600, fontSize: 13 }}>{r.name}</span> },
    { key: "entity_code", header: "Entity", render: (r) => <Badge label={r.entity_code} /> },
    { key: "department", header: "Department", render: (r) => <span style={{ color: S.text2, fontSize: 12.5 }}>{r.department || "—"}</span> },
    { key: "hire_date", header: "Hired", render: (r) => <span style={{ color: S.text3, fontSize: 12 }}>{r.hire_date || "—"}</span> },
  ];
  const caseCols = [
    { key: "file_number", header: "File #", width: 90, render: (r) => <span style={{ color: S.indigoL, fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{r.file_number}</span> },
    { key: "employee_name", header: "Employee", render: (r) => <span style={{ color: S.text, fontWeight: 600, fontSize: 13 }}>{r.employee_name}</span> },
    { key: "start_date", header: "Leave start", render: (r) => <span style={{ color: S.text2, fontSize: 12.5 }}>{r.start_date}</span> },
    { key: "leave_designation", header: "Designation", render: (r) => r.leave_designation ? <Badge label={r.leave_designation} /> : <Badge label="Unassigned" /> },
    { key: "status", header: "Status", render: () => <Badge label="Pending" /> },
  ];

  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title="ADP Import" subtitle="Leave Roster*.xlsx · worksheet “1” · file numbers preserved as text" breadcrumb={["Operations", "ADP Import"]}
      actions={step > 0 && <Btn variant="secondary" small onClick={reset}><RefreshCw size={13} /> Start over</Btn>} />

    {/* stepper */}
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      {STEPS.map((s, i) => <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: i <= step ? S.indigo : "rgba(0,75,135,.07)", color: i <= step ? "#fff" : S.text3 }}>{i < step ? "✓" : i + 1}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: i <= step ? S.text : S.text3 }}>{s}</span>
        {i < STEPS.length - 1 && <span style={{ width: 28, height: 1, background: S.border2 }} />}
      </div>)}
    </div>

    {step === 0 && <Card>
      <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{ border: `2px dashed ${dragOver ? S.indigo : S.border}`, borderRadius: RADIUS.lg, padding: "56px 24px", textAlign: "center", cursor: "pointer", background: dragOver ? "rgba(0,75,135,.06)" : "transparent", transition: "all .15s" }}>
        <UploadCloud size={40} color={dragOver ? S.indigoL : S.text3} style={{ margin: "0 auto 14px", display: "block" }} />
        <div style={{ color: S.text, fontSize: 15, fontWeight: 700 }}>Drop the ADP export here, or click to browse</div>
        <div style={{ color: S.text3, fontSize: 12.5, marginTop: 6 }}>Expected: <code style={{ color: S.indigoL }}>Leave Roster*.xlsx</code> from the LOA Tracker downloads folder</div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      <p style={{ color: S.text3, fontSize: 12, lineHeight: 1.6, marginTop: 16, marginBottom: 0 }}>
        Nothing is written until you confirm the preview. Validation flags missing required fields, duplicate file numbers,
        and unreadable dates. Auto-created cases enter as <strong style={{ color: S.text2 }}>Pending</strong> with the designation
        exactly as exported — blank stays blank until HR assigns it, and statutory clocks do not start until then.
      </p>
    </Card>}

    {step === 1 && parsed && <Card>
      <p style={cap}><AlertTriangle size={13} style={{ verticalAlign: -2 }} color={S.red} /> Validation stopped the import</p>
      <div style={{ color: S.text3, fontSize: 12.5, marginBottom: 12 }}><FileSpreadsheet size={13} style={{ verticalAlign: -2 }} /> {fileName} — {parsed.rows.length} readable rows</div>
      {parsed.errors.map((e, i) => <div key={i} style={{ color: S.red, fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid rgba(0,75,135,.05)" }}>✗ {e}</div>)}
      {parsed.warnings.map((w, i) => <div key={i} style={{ color: S.amber, fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid rgba(0,75,135,.05)" }}>⚠ {w}</div>)}
      <div style={{ marginTop: 14 }}><Btn variant="secondary" onClick={reset}><X size={13} /> Choose a different file</Btn></div>
    </Card>}

    {step === 2 && diff && <>
      {(parsed.warnings.length > 0 || diff.warnings.length > 0) && <Card style={{ marginBottom: 14, borderColor: "rgba(185,117,9,.3)" }}>
        <p style={{ ...cap, color: S.amber }}>Warnings — import can proceed</p>
        {[...parsed.warnings, ...diff.warnings].map((w, i) => <div key={i} style={{ color: S.amber, fontSize: 12.5, padding: "4px 0" }}>⚠ {w}</div>)}
      </Card>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        {[[UserPlus, "New employees", diff.newEmployees.length, S.green], [Users, "Updated records", diff.updatedEmployees.length, S.indigo], [FolderPlus, "Cases to create", filteredCases.length, S.amber], [CheckCircle, "Unchanged", diff.unchanged, S.text3]].map(([Icon, label, v, color]) =>
          <Card key={label} style={{ padding: 16 }}><div style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ background: `${color}1a`, borderRadius: 9, padding: 8, display: "inline-flex" }}><Icon size={15} color={color} /></span><div><div style={{ fontSize: 22, fontWeight: 800, color: S.text, fontFamily: "Arial,Helvetica,sans-serif" }}>{v}</div><div style={{ color: S.text3, fontSize: 11.5 }}>{label}</div></div></div></Card>)}
      </div>
      {diff.newEmployees.length > 0 && <div style={{ marginBottom: 16 }}><p style={cap}>New employees</p><DataTable columns={newCols} rows={diff.newEmployees} getRowId={(r) => r.file_number} pageSize={10} /></div>}
      {diff.updatedEmployees.length > 0 && <div style={{ marginBottom: 16 }}><p style={cap}>Updated records</p><DataTable columns={changeCols} rows={diff.updatedEmployees} getRowId={(r) => r.file_number} pageSize={10} /></div>}
      <Card style={{ marginBottom: 16, padding: 14 }}>
        <p style={{ ...cap, marginTop: 0 }}>Workforce status filter — which statuses may open leave cases</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUS_ORDER.map((s) => <label key={s} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 9, cursor: "pointer", border: caseStatuses.has(s) ? "1px solid rgba(0,75,135,.45)" : `1px solid ${S.border2}`, background: caseStatuses.has(s) ? "rgba(0,75,135,.1)" : "transparent" }}>
            <input type="checkbox" checked={caseStatuses.has(s)} onChange={() => toggleStatus(s)} style={{ accentColor: S.indigo }} />
            <span style={{ color: caseStatuses.has(s) ? S.text : S.text3, fontSize: 12.5, fontWeight: 600 }}>{s}</span>
            <span style={{ color: S.text3, fontSize: 11, fontWeight: 700, background: "rgba(0,75,135,.06)", borderRadius: 99, padding: "1px 8px" }}>{statusCounts[s] || 0}</span>
          </label>)}
        </div>
        <p style={{ color: S.text3, fontSize: 11.5, margin: "10px 0 0", lineHeight: 1.5 }}>Employee records import for every status so the directory stays accurate; leave cases are created only for checked statuses.{excludedCases > 0 ? ` ${excludedCases} case row(s) currently excluded by this filter.` : ""}</p>
      </Card>
      {filteredCases.length > 0 && <div style={{ marginBottom: 16 }}><p style={cap}>Cases to create — Pending, await-designation honored ({filteredCases.length}{excludedCases ? ` of ${diff.casesToCreate.length}` : ""})</p><DataTable columns={caseCols} rows={filteredCases} getRowId={(r) => `${r.file_number}|${r.start_date}`} pageSize={10} /></div>}
      {diff.newEmployees.length === 0 && diff.updatedEmployees.length === 0 && filteredCases.length === 0 &&
        <Card style={{ marginBottom: 16 }}><EmptyState msg="Roster matches the system — nothing to commit." icon={CheckCircle} /></Card>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={reset}>Cancel</Btn>
        <Btn variant="primary" disabled={busy || (diff.newEmployees.length + diff.updatedEmployees.length + filteredCases.length === 0)} onClick={commit}>
          <CheckCircle size={14} /> {busy ? "Committing…" : "Confirm & commit"}
        </Btn>
      </div>
    </>}

    {step === 3 && result && <Card>
      <div style={{ textAlign: "center", padding: "26px 0" }}>
        <CheckCircle size={40} color={S.green} style={{ margin: "0 auto 12px", display: "block" }} />
        <div style={{ color: S.text, fontSize: 17, fontWeight: 800 }}>Import committed</div>
        <div style={{ color: S.text2, fontSize: 13, marginTop: 8 }}>{result.added} new employees · {result.updated} records updated · {result.cases} cases created</div>
        <div style={{ color: S.text3, fontSize: 12, marginTop: 6 }}>Every change was written to the audit log with source = “import”.</div>
        <div style={{ marginTop: 18 }}><Btn variant="secondary" onClick={reset}><UploadCloud size={13} /> Import another file</Btn></div>
      </div>
    </Card>}
  </motion.div>;
}
