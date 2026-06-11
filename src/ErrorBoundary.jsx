/* Production error boundary (v2.1) — a render fault degrades to a branded
 * recovery screen instead of a blank page. "Reset demo data" clears the
 * localStorage state (the most common recovery for a corrupted demo store);
 * the error detail is copyable for support. */
import React from "react";
import { AMPAM_LOGO, AMPAM_TAGLINE } from "./assets/ampamLogo.js";

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("LeaveIQ render fault:", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error?.message || this.state.error);
    return (
      <div style={{ minHeight: "100vh", background: "#f2f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial,Helvetica,sans-serif", padding: 20 }}>
        <div style={{ background: "#fff", border: "1px solid rgba(0,75,135,.15)", borderRadius: 16, padding: 32, maxWidth: 460, width: "100%", boxShadow: "0 10px 32px rgba(13,38,63,.14)", textAlign: "center" }}>
          <img src={AMPAM_LOGO} alt="AMPAM" style={{ width: 200, height: "auto" }} />
          <h1 style={{ color: "#004B87", fontSize: 19, margin: "18px 0 6px" }}>Something went wrong</h1>
          <p style={{ color: "#3d5570", fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>LeaveIQ hit an unexpected error while rendering. Your data is safe — the audit trail and stored records are unaffected by display faults.</p>
          <div style={{ background: "rgba(0,75,135,.04)", border: "1px solid rgba(0,75,135,.12)", borderRadius: 9, padding: "9px 12px", color: "#69819c", fontSize: 11, fontFamily: "monospace", textAlign: "left", marginBottom: 16, maxHeight: 76, overflow: "auto", wordBreak: "break-word" }}>{msg}</div>
          <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => window.location.reload()} style={{ background: "#004B87", color: "#fff", border: "none", borderRadius: 9, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Reload</button>
            <button onClick={() => { try { Object.keys(localStorage).filter((k) => k.startsWith("liq_")).forEach((k) => localStorage.removeItem(k)); } catch {} window.location.reload(); }} style={{ background: "#fff", color: "#004B87", border: "1px solid rgba(0,75,135,.3)", borderRadius: 9, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Reset demo data & reload</button>
            <button onClick={() => navigator.clipboard?.writeText(msg)} style={{ background: "#fff", color: "#69819c", border: "1px solid rgba(0,75,135,.18)", borderRadius: 9, padding: "10px 16px", fontSize: 13, cursor: "pointer" }}>Copy error</button>
          </div>
          <p style={{ color: "#9bb0c6", fontSize: 10, fontStyle: "italic", margin: "18px 0 0" }}>{AMPAM_TAGLINE}</p>
        </div>
      </div>
    );
  }
}
