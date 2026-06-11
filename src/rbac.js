/* Role-based access. Five personas per the platform spec. UI scoping here is
 * convenience only — in Supabase mode the same rules are ENFORCED at the
 * database with row-level security (see supabase/migrations/0002_rls.sql);
 * medical notes are masked in the query layer, not just hidden client-side. */

export const ROLES = [
  { id: "admin", label: "HR Administrator", short: "All three entities · full control" },
  { id: "specialist", label: "HR Specialist", short: "Assigned caseload" },
  { id: "manager", label: "People Manager", short: "Their team · read-only · no medical notes" },
  { id: "employee", label: "Employee", short: "Own leave only" },
  { id: "legal", label: "Legal & Compliance", short: "All entities · read-only · export" },
];

export const PERMS = {
  admin:      { viewDirectory: 1, createCase: 1, editCase: 1, exportData: 1, bulkActions: 1, viewMedicalNotes: 1, viewDocuments: 1, viewAnalytics: 1, viewLawMap: 1, viewAudit: 1, manageSettings: 1, runImport: 1, viewReports: 1, switchEntity: 1, viewRiskSignals: 1, manageLibrary: 1, viewWorkload: 1 },
  specialist: { viewDirectory: 1, createCase: 1, editCase: 1, exportData: 1, bulkActions: 1, viewMedicalNotes: 1, viewDocuments: 1, viewAnalytics: 1, viewLawMap: 1, viewAudit: 0, manageSettings: 0, runImport: 1, viewReports: 1, switchEntity: 0, viewRiskSignals: 0, manageLibrary: 0, viewWorkload: 0 },
  manager:    { viewDirectory: 1, createCase: 0, editCase: 0, exportData: 0, bulkActions: 0, viewMedicalNotes: 0, viewDocuments: 0, viewAnalytics: 1, viewLawMap: 1, viewAudit: 0, manageSettings: 0, runImport: 0, viewReports: 0, switchEntity: 0, viewRiskSignals: 0, manageLibrary: 0, viewWorkload: 0 },
  employee:   { viewDirectory: 0, createCase: 0, editCase: 0, exportData: 0, bulkActions: 0, viewMedicalNotes: 1, viewDocuments: 1, viewAnalytics: 0, viewLawMap: 1, viewAudit: 0, manageSettings: 0, runImport: 0, viewReports: 0, switchEntity: 0 },
  legal:      { viewDirectory: 1, createCase: 0, editCase: 0, exportData: 1, bulkActions: 0, viewMedicalNotes: 1, viewDocuments: 1, viewAnalytics: 1, viewLawMap: 1, viewAudit: 1, manageSettings: 0, runImport: 0, viewReports: 1, switchEntity: 1, viewRiskSignals: 1, manageLibrary: 0, viewWorkload: 0 },
};

export const permsFor = (r) => PERMS[r] || PERMS.admin;

export function getViewer(role, employees = [], cases = []) {
  if (role === "specialist") return { name: "Sarah Toledano", roleLabel: "HR Specialist", email: "sarah.toledano@ampam.example" };
  if (role === "manager") return { name: "Morgan Diaz", roleLabel: "People Manager", dept: "Field Operations", entityId: 1, email: "morgan.diaz@ampam.example" };
  if (role === "legal") return { name: "Robin Sayer", roleLabel: "Legal & Compliance", email: "robin.sayer@ampam.example" };
  if (role === "employee") { const c = cases[0]; const e = (c && employees.find((x) => x.id === c.employee_id)) || employees[0]; return { name: e?.name || "Employee", roleLabel: "Employee", empId: e?.id, email: e?.email }; }
  return { name: "Jordan Avery", roleLabel: "HR Administrator", email: "jordan.avery@ampam.example" };
}

/** Role scoping + optional entity filter (admin/legal can pick an entity). */
export function applyScope(role, { cases, employees }, viewer, entityFilter = "All") {
  let c = cases, e = employees;
  if (role === "specialist") c = c.filter((x) => x.owner === viewer.name);
  else if (role === "manager") {
    const ids = new Set(employees.filter((x) => x.dept === viewer.dept && (!viewer.entityId || x.entity_id === viewer.entityId)).map((x) => x.id));
    c = c.filter((x) => ids.has(x.employee_id));
    e = e.filter((x) => ids.has(x.id));
  } else if (role === "employee") {
    c = c.filter((x) => x.employee_id === viewer.empId);
    e = e.filter((x) => x.id === viewer.empId);
  }
  if (entityFilter !== "All" && (role === "admin" || role === "legal")) {
    e = e.filter((x) => x.entity_code === entityFilter);
    const ids = new Set(e.map((x) => x.id));
    c = c.filter((x) => ids.has(x.employee_id));
  }
  return { cases: c, employees: e };
}

export function scopeSummary(role, viewer, entityFilter = "All") {
  const ent = entityFilter !== "All" ? ` · ${entityFilter}` : " · all entities";
  if (role === "specialist") return `Cases assigned to ${viewer.name}`;
  if (role === "manager") return `${viewer.dept} team`;
  if (role === "employee") return "Your leave only";
  if (role === "legal") return `Read-only${ent}`;
  return `Full access${ent}`;
}

export function allowedPage(perms, page) {
  if (page === "dashboard" || page === "cases") return true;
  if (page === "employees") return !!perms.viewDirectory;
  if (page === "documents") return !!perms.viewDocuments;
  if (page === "analytics") return !!perms.viewAnalytics;
  if (page === "lawmap") return !!perms.viewLawMap;
  if (page === "import") return !!perms.runImport;
  if (page === "reports") return !!perms.viewReports;
  if (page === "audit") return !!perms.viewAudit;
  if (page === "risk") return !!perms.viewRiskSignals;
  if (page === "library") return !!perms.manageLibrary;
  if (page === "workload") return !!perms.viewWorkload;
  if (page === "entities") return !!perms.manageSettings;
  return true;
}
