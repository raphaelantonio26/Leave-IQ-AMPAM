// Pure HTML-escape helper shared by the cert-alerts edge function and its tests.
// Escapes the five HTML-significant characters so interpolated values (employee
// names, case refs, payroll messages) cannot inject markup into the alert email.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}
