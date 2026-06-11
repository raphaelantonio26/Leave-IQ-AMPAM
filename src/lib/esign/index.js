/* E-signature connector seam (v2.0 · Feature 2).
 *
 * Generated notices route through a signature workflow before they count as
 * sent:   generated → pending_hr_signature → signed → delivered
 * Every transition writes an audit row with the signer identity.
 *
 * THE CONTRACT — one provider interface, mirrors the storage/HRIS seams:
 *
 *   sign(documentId, signerUserId)    → SignResult
 *   deliver(documentId)               → DeliverResult
 *
 *   SignResult = {
 *     document_id, signer_user_id,
 *     signed_at: ISO timestamp,
 *     status: 'signed',
 *     provider: string,
 *     evidence: { method, ip?, envelope_id? }   // provider-specific proof
 *   }
 *
 * DemoESign returns the audit payload synchronously — the click IS the
 * signature event, recorded append-only. A DocuSign/Adobe Sign provider
 * implements the same two methods (creating an envelope, polling/webhooking
 * completion, then resolving with the same shape) and registers in
 * getESign(). Nothing else in the app changes — DataContext consumes only
 * the contract. See docs/ESIGN_CONNECTOR.md.
 */

export const ESIGN_STATUSES = ["generated", "pending_hr_signature", "signed", "delivered"];

export function nextEsignStatus(current) {
  const i = ESIGN_STATUSES.indexOf(current || "generated");
  return ESIGN_STATUSES[Math.min(i + 1, ESIGN_STATUSES.length - 1)];
}

export class DemoESign {
  get provider() { return "demo-internal"; }
  /** The HR click is the signature: returns the audit payload immediately. */
  async sign(documentId, signerUserId) {
    return {
      document_id: documentId,
      signer_user_id: signerUserId,
      signed_at: new Date().toISOString(),
      status: "signed",
      provider: this.provider,
      evidence: { method: "in_app_click" },
    };
  }
  async deliver(documentId) {
    return { document_id: documentId, delivered_at: new Date().toISOString(), status: "delivered", provider: this.provider };
  }
}

/**
 * DocuSign provider — STUB, intentionally unimplemented. Implementation
 * notes for whoever wires it:
 *   - JWT grant against account.docusign.com, token server-side only
 *     (Supabase edge function `esign-envelope`, never the browser).
 *   - sign(): create an envelope from the stored PDF (storage adapter
 *     getDataUrl → document base64), recipient = the HR signer's email,
 *     embedded signing ceremony; resolve the SignResult on the
 *     envelope-completed webhook with evidence.envelope_id.
 *   - deliver(): send the completed envelope to the employee recipient and
 *     resolve DeliverResult on the sent event.
 */
export class DocuSignESign {
  get provider() { return "docusign"; }
  async sign() { throw new Error("DocuSign provider not configured — see docs/ESIGN_CONNECTOR.md"); }
  async deliver() { throw new Error("DocuSign provider not configured — see docs/ESIGN_CONNECTOR.md"); }
}

let _instance = null;
export function getESign(kind = "demo") {
  if (!_instance) _instance = kind === "docusign" ? new DocuSignESign() : new DemoESign();
  return _instance;
}
