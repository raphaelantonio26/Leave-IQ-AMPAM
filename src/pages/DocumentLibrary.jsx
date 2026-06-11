/* Administrative Document Library (v1.3 · Priorities 2 & 3).
 * Admin-managed templates (create, edit, version, archive — by category) and
 * packet composition (ordered template lists). Merge fields documented in the
 * editor; every save versions the body and audits. No developer needed. */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Library, Plus, Archive, RotateCcw, History, Save, X, Layers, GripVertical, Eye } from "lucide-react";
import { S, RADIUS, Card, Btn, Badge, PageHeader, Input, Select, EmptyState } from "../ui.jsx";
import { useData } from "../data/DataContext.jsx";
import { TEMPLATE_CATEGORIES, MERGE_FIELDS, renderTemplate, usedMergeFields } from "../lib/docs/templates.js";

const CAT_LABEL = Object.fromEntries(TEMPLATE_CATEGORIES.map((c) => [c.id, c.label]));

export default function DocumentLibrary({ viewer, onToast }) {
  const { templates, packets, actions } = useData();
  const [view, setView] = useState("templates"); // templates | packets
  const [catF, setCatF] = useState("All");
  const [showArchived, setShowArchived] = useState(false);
  const [edit, setEdit] = useState(null);          // template draft
  const [histFor, setHistFor] = useState(null);
  const [pktEdit, setPktEdit] = useState(null);    // packet draft

  const list = useMemo(() => templates.filter((t) => (catF === "All" || t.category === catF) && (showArchived || t.status !== "archived")).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)), [templates, catF, showArchived]);
  const activeTemplates = templates.filter((t) => t.status !== "archived");

  const startNew = () => setEdit({ name: "", category: catF === "All" ? "FMLA" : catF, description: "", body: "" });
  const saveTpl = async () => {
    if (!edit.name.trim() || !edit.body.trim()) { onToast?.({ type: "error", message: "Name and body are required" }); return; }
    await actions.saveTemplate(edit, viewer.name);
    onToast?.({ type: "success", message: edit.id ? `Saved — now v${(templates.find((t) => t.id === edit.id)?.version || 0) + 1}` : "Template created" });
    setEdit(null);
  };
  const savePkt = async () => {
    if (!pktEdit.name.trim() || !pktEdit.items.length) { onToast?.({ type: "error", message: "Name and at least one template required" }); return; }
    await actions.savePacket(pktEdit, viewer.name);
    onToast?.({ type: "success", message: "Packet definition saved" });
    setPktEdit(null);
  };
  const move = (arr, i, dir) => { const a = [...arr]; const j = i + dir; if (j < 0 || j >= a.length) return arr; [a[i], a[j]] = [a[j], a[i]]; return a; };

  const previewCtx = Object.fromEntries(MERGE_FIELDS);

  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title="Document Library" subtitle="Company templates and packet definitions — fully admin-managed, versioned, audited" breadcrumb={["Management", "Document Library"]}
      actions={<div style={{ display: "flex", gap: 8 }}>
        {[["templates", "Templates", Library], ["packets", "Packets", Layers]].map(([k, l, I]) => <button key={k} onClick={() => setView(k)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 15px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: view === k ? "1px solid rgba(0,75,135,.5)" : `1px solid ${S.border2}`, background: view === k ? "rgba(0,75,135,.15)" : "transparent", color: view === k ? S.indigoL : S.text3 }}><I size={13} /> {l}</button>)}
      </div>} />

    {view === "templates" && <>
      <div style={{ display: "flex", gap: 9, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Select value={catF} onChange={(e) => setCatF(e.target.value)} style={{ minWidth: 200 }}><option value="All">All categories</option>{TEMPLATE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, color: S.text3, fontSize: 12.5, cursor: "pointer" }}><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} style={{ accentColor: S.indigo }} /> Show archived</label>
        <Btn variant="primary" small style={{ marginLeft: "auto" }} onClick={startNew}><Plus size={13} /> New template</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: edit ? "1fr 1.3fr" : "1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.length === 0 && <Card><EmptyState msg="No templates in this category yet." icon={Library} /></Card>}
          {list.map((t) => <Card key={t.id} style={{ padding: 14, opacity: t.status === "archived" ? .55 : 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: S.text, fontWeight: 700, fontSize: 13.5 }}>{t.name}</span>
                  <Badge label={CAT_LABEL[t.category] || t.category} />
                  <span style={{ color: S.text3, fontSize: 11 }}>v{t.version}</span>
                  {t.status === "archived" && <span style={{ color: S.amber, fontSize: 11, fontWeight: 700 }}>ARCHIVED</span>}
                </div>
                {t.description && <div style={{ color: S.text3, fontSize: 12, marginTop: 4 }}>{t.description}</div>}
                <div style={{ color: S.text3, fontSize: 11, marginTop: 5 }}>Updated {String(t.updated_at).slice(0, 10)} by {t.updated_by} · fields: {usedMergeFields(t.body).join(", ") || "none"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Btn variant="secondary" small onClick={() => setHistFor(histFor === t.id ? null : t.id)}><History size={12} /></Btn>
                <Btn variant="secondary" small onClick={() => setEdit({ id: t.id, name: t.name, category: t.category, description: t.description, body: t.body })}>Edit</Btn>
                <Btn variant="secondary" small onClick={() => actions.archiveTemplate(t.id, t.status !== "archived", viewer.name)}>{t.status === "archived" ? <RotateCcw size={12} /> : <Archive size={12} />}</Btn>
              </div>
            </div>
            {histFor === t.id && <div style={{ marginTop: 10, borderTop: `1px solid ${S.border}`, paddingTop: 8 }}>
              {(t.history || []).slice().reverse().map((h) => <div key={h.version} style={{ display: "flex", gap: 10, fontSize: 11.5, color: S.text3, padding: "4px 0" }}><span style={{ color: S.indigoL, fontWeight: 700, minWidth: 26 }}>v{h.version}</span><span>{String(h.updated_at).slice(0, 16).replace("T", " ")} · {h.updated_by}</span>{h.version !== t.version && <button onClick={() => setEdit({ id: t.id, name: t.name, category: t.category, description: t.description, body: h.body })} style={{ marginLeft: "auto", background: "none", border: "none", color: S.indigoL, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Restore as new version</button>}</div>)}
            </div>}
          </Card>)}
        </div>
        {edit && <Card style={{ position: "sticky", top: 88 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ color: S.text, fontWeight: 800, fontSize: 15 }}>{edit.id ? `Edit — saves as v${(templates.find((t) => t.id === edit.id)?.version || 0) + 1}` : "New template"}</span>
            <button onClick={() => setEdit(null)} style={{ background: "none", border: "none", color: S.text3, cursor: "pointer" }}><X size={16} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 10, marginBottom: 10 }}>
            <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Template name" />
            <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{TEMPLATE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
          </div>
          <Input value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Short description (optional)" style={{ marginBottom: 10, width: "100%", boxSizing: "border-box" }} />
          <textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} placeholder="Template body — use {{merge_fields}} below" style={{ background: "rgba(0,75,135,.05)", border: `1px solid ${S.border}`, borderRadius: 9, padding: "10px 14px", color: S.text, fontSize: 12.5, outline: "none", width: "100%", resize: "vertical", minHeight: 220, fontFamily: "ui-monospace,monospace", boxSizing: "border-box", lineHeight: 1.55 }} />
          <div style={{ margin: "10px 0", display: "flex", flexWrap: "wrap", gap: 5 }}>
            {MERGE_FIELDS.map(([f]) => <button key={f} onClick={() => setEdit({ ...edit, body: edit.body + `{{${f}}}` })} title="Insert" style={{ background: "rgba(0,75,135,.08)", border: "1px solid rgba(0,75,135,.25)", color: S.indigoL, borderRadius: 6, padding: "2px 8px", fontSize: 10.5, cursor: "pointer", fontFamily: "ui-monospace,monospace" }}>{`{{${f}}}`}</button>)}
          </div>
          <div style={{ background: "#fff", borderRadius: 8, padding: "14px 16px", maxHeight: 180, overflowY: "auto", marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#004B87", letterSpacing: ".08em", marginBottom: 6 }}>PREVIEW (sample data)</div>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "Georgia,serif", fontSize: 11.5, lineHeight: 1.5, color: "#222", margin: 0 }}>{renderTemplate(edit.body, previewCtx)}</pre>
          </div>
          <Btn variant="primary" onClick={saveTpl} style={{ width: "100%", justifyContent: "center" }}><Save size={14} /> Save {edit.id ? "new version" : "template"}</Btn>
        </Card>}
      </div>
    </>}

    {view === "packets" && <>
      <div style={{ display: "flex", marginBottom: 16 }}>
        <Btn variant="primary" small style={{ marginLeft: "auto" }} onClick={() => setPktEdit({ name: "", description: "", designations: [], items: [] })}><Plus size={13} /> New packet</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: pktEdit ? "1fr 1fr" : "1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {packets.map((p) => <Card key={p.id} style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Layers size={14} color={S.indigoL} /><span style={{ color: S.text, fontWeight: 700, fontSize: 13.5 }}>{p.name}</span>{(p.designations || []).map((d) => <Badge key={d} label={d} />)}</div>
                <div style={{ color: S.text3, fontSize: 12, marginTop: 4 }}>{p.description}</div>
                <div style={{ color: S.text3, fontSize: 11.5, marginTop: 6 }}>{(p.items || []).map((id, i) => { const t = templates.find((x) => x.id === id); return <span key={i}>{i + 1}. {t?.name || `#${id}`}{t?.status === "archived" ? " (archived — skipped)" : ""}{i < p.items.length - 1 ? "  ·  " : ""}</span>; })}</div>
              </div>
              <Btn variant="secondary" small onClick={() => setPktEdit({ ...p, items: [...(p.items || [])] })}>Edit</Btn>
            </div>
          </Card>)}
          <Card style={{ padding: 13 }}><p style={{ margin: 0, color: S.text3, fontSize: 12, lineHeight: 1.55 }}><Eye size={12} style={{ verticalAlign: -2 }} /> Packets are generated from the Documents page or a case's Documents tab — each generation renders the current template versions against the case, produces one branded PDF, attaches it to the case repository, and writes to the audit trail.</p></Card>
        </div>
        {pktEdit && <Card style={{ position: "sticky", top: 88 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ color: S.text, fontWeight: 800, fontSize: 15 }}>{pktEdit.id ? "Edit packet" : "New packet"}</span>
            <button onClick={() => setPktEdit(null)} style={{ background: "none", border: "none", color: S.text3, cursor: "pointer" }}><X size={16} /></button>
          </div>
          <Input value={pktEdit.name} onChange={(e) => setPktEdit({ ...pktEdit, name: e.target.value })} placeholder="Packet name (e.g. FMLA + CFRA Packet)" style={{ width: "100%", boxSizing: "border-box", marginBottom: 10 }} />
          <Input value={pktEdit.description || ""} onChange={(e) => setPktEdit({ ...pktEdit, description: e.target.value })} placeholder="Description" style={{ width: "100%", boxSizing: "border-box", marginBottom: 12 }} />
          <p style={{ color: S.text3, fontSize: 11.5, fontWeight: 700, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: ".05em" }}>Contents (ordered)</p>
          {pktEdit.items.map((id, i) => { const t = templates.find((x) => x.id === id); return <div key={`${id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "rgba(0,75,135,.035)", borderRadius: 8, marginBottom: 6 }}>
            <GripVertical size={12} color={S.text3} />
            <span style={{ flex: 1, color: S.text2, fontSize: 12.5 }}>{i + 1}. {t?.name || `#${id}`}</span>
            <button onClick={() => setPktEdit({ ...pktEdit, items: move(pktEdit.items, i, -1) })} style={{ background: "none", border: "none", color: S.text3, cursor: "pointer", fontSize: 13 }}>↑</button>
            <button onClick={() => setPktEdit({ ...pktEdit, items: move(pktEdit.items, i, 1) })} style={{ background: "none", border: "none", color: S.text3, cursor: "pointer", fontSize: 13 }}>↓</button>
            <button onClick={() => setPktEdit({ ...pktEdit, items: pktEdit.items.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: S.red, cursor: "pointer" }}><X size={13} /></button>
          </div>; })}
          <Select value="" onChange={(e) => e.target.value && setPktEdit({ ...pktEdit, items: [...pktEdit.items, Number(e.target.value)] })} style={{ width: "100%", marginBottom: 12 }}>
            <option value="">+ Add template…</option>
            {activeTemplates.filter((t) => !pktEdit.items.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{CAT_LABEL[t.category]} — {t.name}</option>)}
          </Select>
          <p style={{ color: S.text3, fontSize: 11.5, fontWeight: 700, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: ".05em" }}>Suggested for designations</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {["FMLA", "CFRA", "PDL", "ADA", "WC"].map((d) => <button key={d} onClick={() => setPktEdit({ ...pktEdit, designations: (pktEdit.designations || []).includes(d) ? pktEdit.designations.filter((x) => x !== d) : [...(pktEdit.designations || []), d] })} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: (pktEdit.designations || []).includes(d) ? "1px solid rgba(0,75,135,.5)" : `1px solid ${S.border2}`, background: (pktEdit.designations || []).includes(d) ? "rgba(0,75,135,.15)" : "transparent", color: (pktEdit.designations || []).includes(d) ? S.indigoL : S.text3 }}>{d}</button>)}
          </div>
          <Btn variant="primary" onClick={savePkt} style={{ width: "100%", justifyContent: "center" }}><Save size={14} /> Save packet definition</Btn>
        </Card>}
      </div>
    </>}
  </motion.div>;
}
