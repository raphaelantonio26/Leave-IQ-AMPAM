# E-Signature Connector Seam (v2.0 · Feature 2)

Generated notices are not "sent" until they complete the signature ladder:

```
generated → pending_hr_signature → signed → delivered
                                     ▲
                            the only seam
```

Every transition writes an append-only audit row; the `signed` transition also
records the signer identity (`case_documents.signed_by`, `signed_at`) and the
provider's evidence payload inside the audit row's `new_values`.

## The contract

One provider interface in `src/lib/esign/index.js`:

```js
sign(documentId, signerUserId) → SignResult
deliver(documentId)            → DeliverResult

SignResult = {
  document_id, signer_user_id,
  signed_at: ISO timestamp,
  status: 'signed',
  provider: string,
  evidence: { method, ip?, envelope_id? }   // provider-specific proof
}
```

`DataContext.esignAdvance` consumes only this shape. The status ladder, the
audit semantics, and the UI buttons never change when the provider does.

## Today: DemoESign

The HR click **is** the signature event — `sign()` resolves synchronously with
`evidence.method = 'in_app_click'` and the click is recorded append-only.
This is a legitimate internal-attestation model for an internal tool: the
audit row proves who attested, when, from an authenticated session.

## Tomorrow: DocuSign (or Adobe Sign)

Implement `DocuSignESign` against the same two methods:

1. **Credentials never reach the browser.** JWT grant against
   `account.docusign.com` runs in a Supabase edge function
   (`esign-envelope`); the frontend calls the function, the function returns
   the contract shape.
2. **sign()**: pull the stored PDF through the storage adapter
   (`getDataUrl(storage_path)`), create an envelope with the HR signer as an
   embedded recipient, surface the signing ceremony, and resolve the
   `SignResult` from the envelope-completed webhook with
   `evidence.envelope_id`.
3. **deliver()**: add the employee as a CC/recipient on the completed
   envelope (or send via the notification recipients configured on the
   entity) and resolve `DeliverResult` on the sent event.
4. **Register** in `getESign('docusign')`. Nothing else changes.

## What must NOT change

The four-state ladder and its order; one audit row per transition; signer
identity captured at `signed`; `DataContext` as the only caller. If a
provider integration requires touching the case panel, the documents tab, or
the audit writer, the provider is returning the wrong shape — fix it at the
seam.
