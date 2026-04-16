// src/pages/expenses/ExpenseSubmitPage.tsx
// Changes from original:
//  1. Reads ?requestId=X from URL — pre-selects AND locks that trip in the dropdown
//  2. Reads ?claimId=X&uploadBill=1 — jumps straight to bill upload for an existing claim
//  3. When requestId is pre-set, the "Link to Travel Request" dropdown shows only that trip (locked)
//  4. All trips still load so the dropdown works normally when no requestId is passed

import { useState, type ChangeEvent, type FormEvent, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { get, post, uploadFile } from "../../services/apiClient";
import { ApiError } from "../../services/apiClient";
import { expenseService } from "../../services/expenseService";
import type { TravelRequestResponse, ExpenseClaimResponse } from "../../services/apiClient";
import styles from "./ExpenseSubmitPage.module.css";

// ── Transport → Category mapping ─────────────────────────────────────────────
const TRANSPORT_TO_CATEGORY: Record<string, string> = {
  Flight:   "Flight Ticket",
  Train:    "Train Ticket",
  Cab:      "Cab / Local Transport",
  Hotel:    "Hotel Stay",
  Multiple: "Miscellaneous",
};

const CATEGORIES = [
  "Flight Ticket",
  "Train Ticket",
  "Cab / Local Transport",
  "Hotel Stay",
  "Meals & Dining",
  "Visa & Documentation",
  "Internet / Communication",
  "Conference / Event Fee",
  "Miscellaneous",
];

interface ExpenseForm {
  requestId:   string;
  category:    string;
  amount:      string;
  currency:    string;
  expenseDate: string;
  description: string;
}

const EMPTY: ExpenseForm = {
  requestId: "", category: "", amount: "",
  currency: "INR", expenseDate: "", description: "",
};

export default function ExpenseSubmitPage() {
  const navigate      = useNavigate();
  const { signOut }   = useMsalLogin();
  const [searchParams] = useSearchParams();

  // ── Query params ──────────────────────────────────────────────────────────
  // ?requestId=X  → pre-select and lock this travel request
  // ?claimId=X    → existing claim, jump to bill-only upload mode
  // ?uploadBill=1 → combined with claimId, open bill upload immediately
  const presetRequestId = searchParams.get("requestId") ?? "";
  const presetClaimId   = searchParams.get("claimId")   ?? "";
  const billOnlyMode    = searchParams.get("uploadBill") === "1" && !!presetClaimId;

  const fullName = localStorage.getItem("full_name") ?? "Employee";
  const role     = localStorage.getItem("role")      ?? "Employee";
  const initials = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const [form,       setForm]       = useState<ExpenseForm>({ ...EMPTY, requestId: presetRequestId });
  const [trips,      setTrips]      = useState<TravelRequestResponse[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg,        setMsg]        = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Bill-only upload state (for existing claims)
  const [existingClaim,   setExistingClaim]   = useState<ExpenseClaimResponse | null>(null);
  const [loadingClaim,    setLoadingClaim]     = useState(billOnlyMode);
  const [billUploading,   setBillUploading]    = useState(false);

  // Bill upload state
  const [billFile,    setBillFile]    = useState<File | null>(null);
  const [billPreview, setBillPreview] = useState<string | null>(null);
  const [uploading,   setUploading]   = useState(false);
  const [uploadDone,  setUploadDone]  = useState(false);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const billOnlyRef   = useRef<HTMLInputElement>(null);

  // ── Load trips — all approved trips ──────────────────────────────────────
  useEffect(() => {
    get<TravelRequestResponse[]>("/Booking/my")
      .then(data => {
        const approved = data.filter(t => t.status === "Approved");
        setTrips(approved);

        // Auto-populate category if requestId was preset
        if (presetRequestId) {
          const trip = approved.find(t => String(t.requestId) === presetRequestId);
          if (trip) {
            const autoCategory = TRANSPORT_TO_CATEGORY[trip.transportType] ?? "";
            setForm(f => ({ ...f, requestId: presetRequestId, category: autoCategory }));
          }
        }
      })
      .catch(err => console.error("Failed to load trips:", err));
  }, [presetRequestId]);

  // ── Load existing claim if in bill-only mode ──────────────────────────────
  useEffect(() => {
    if (!billOnlyMode || !presetClaimId) return;
    setLoadingClaim(true);
    expenseService.getById(Number(presetClaimId))
      .then(claim => setExistingClaim(claim))
      .catch(() => setMsg({ type: "error", text: "Could not load expense claim. Please go back and try again." }))
      .finally(() => setLoadingClaim(false));
  }, [billOnlyMode, presetClaimId]);

  // ── Derived: which trip is selected ──────────────────────────────────────
  const selectedTrip = trips.find(t => String(t.requestId) === form.requestId);
  // Lock dropdown when requestId came from URL
  const tripLocked   = !!presetRequestId;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRequestChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (tripLocked) return; // don't allow change when locked
    const requestId   = e.target.value;
    const trip        = trips.find(t => String(t.requestId) === requestId);
    const autoCategory = trip ? (TRANSPORT_TO_CATEGORY[trip.transportType] ?? "") : "";
    setForm(f => ({ ...f, requestId, category: autoCategory }));
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setBillFile(file);
    setUploadDone(false);
    if (file) {
      if (file.type.startsWith("image/")) {
        setBillPreview(URL.createObjectURL(file));
      } else {
        setBillPreview(null);
      }
    } else {
      setBillPreview(null);
    }
  };

  const handleRemoveBill = () => {
    setBillFile(null);
    setBillPreview(null);
    setUploadDone(false);
    if (fileInputRef.current)  fileInputRef.current.value  = "";
    if (billOnlyRef.current)   billOnlyRef.current.value   = "";
  };

  // ── Bill-only upload handler (for existing claim) ─────────────────────────
  const handleBillOnlyUpload = async () => {
    if (!billFile || !presetClaimId) return;
    setBillUploading(true);
    setMsg(null);
    try {
      await expenseService.uploadBill(Number(presetClaimId), billFile);
      setMsg({ type: "success", text: "✅ Bill uploaded successfully!" });
      setBillFile(null);
      setBillPreview(null);
      if (billOnlyRef.current) billOnlyRef.current.value = "";
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch {
      setMsg({ type: "error", text: "❌ Bill upload failed. Please try again." });
    } finally {
      setBillUploading(false);
    }
  };

  // ── Validate new expense form ─────────────────────────────────────────────
  const validate = (): string | null => {
    if (!form.requestId)                                                        return "Please link this expense to a travel request.";
    if (!form.category)                                                         return "Category is required.";
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) return "Enter a valid amount.";
    if (!form.expenseDate)                                                      return "Expense date is required.";
    if (!form.description.trim())                                               return "Description is required.";
    return null;
  };

  // ── Submit new expense ────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setMsg({ type: "error", text: err }); return; }

    setSubmitting(true);
    setMsg(null);

    try {
      const result = await post<{ claimId: number; claimCode: string }>("/Expense", {
        requestId:   Number(form.requestId),
        category:    form.category,
        amount:      Number(form.amount),
        currency:    form.currency,
        expenseDate: form.expenseDate,
        description: form.description.trim(),
      });

      if (billFile) {
        setUploading(true);
        try {
          await uploadFile(`/Expense/${result.claimId}/upload-bill`, billFile, "file");
          setUploadDone(true);
        } catch {
          setMsg({
            type: "success",
            text: `✅ Expense submitted (${result.claimCode}) but bill upload failed — you can re-upload from the dashboard.`,
          });
          setForm({ ...EMPTY, requestId: presetRequestId });
          setBillFile(null);
          setBillPreview(null);
          setTimeout(() => navigate("/dashboard"), 3000);
          return;
        } finally {
          setUploading(false);
        }
      }

      setMsg({
        type: "success",
        text: `✅ Expense submitted! Code: ${result.claimCode}${billFile ? " · Bill uploaded ✅" : ""}`,
      });
      setForm({ ...EMPTY, requestId: presetRequestId });
      setBillFile(null);
      setBillPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => navigate("/dashboard"), 2000);

    } catch (ex) {
      const text = ex instanceof ApiError ? ex.message : "Submission failed. Please try again.";
      setMsg({ type: "error", text: `❌ ${text}` });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // ── BILL-ONLY MODE: upload bill for existing claim ───────────────────────
  if (billOnlyMode) {
    return (
      <div className={styles.page}>
        <CommonNavbar
          user={{ initials, name: fullName, subtitle: role }}
          onSignOut={async () => signOut()}
        />
        <main className={styles.main}>
          <div className={styles.hero}>
            <div>
              <p className={styles.heroEyebrow}>Expense Management</p>
              <h1 className={styles.heroTitle}>📎 Upload Bill</h1>
              <p className={styles.heroSub}>
                {loadingClaim
                  ? "Loading claim details…"
                  : existingClaim
                    ? `${existingClaim.claimCode} · ${existingClaim.category} · ₹${existingClaim.amount.toLocaleString("en-IN")}`
                    : "Upload a bill for your existing expense claim."}
              </p>
            </div>
            <button className={styles.heroBack} onClick={() => navigate("/dashboard")}>← Dashboard</button>
          </div>

          <div className={styles.card}>
            <p className={styles.cardEyebrow}>Bill Upload</p>
            <h2 className={styles.cardTitle}>Upload Bill for Existing Claim</h2>
            <p className={styles.cardNote}>
              {existingClaim
                ? `Claim: ${existingClaim.claimCode} · ${existingClaim.category} · ₹${existingClaim.amount.toLocaleString("en-IN")} · Status: ${existingClaim.status}`
                : ""}
            </p>

            {msg && (
              <div className={msg.type === "success" ? styles.msgSuccess : styles.msgError}>
                {msg.text}
              </div>
            )}

            {/* Bill drop zone */}
            {!billFile ? (
              <div
                onClick={() => billOnlyRef.current?.click()}
                style={{
                  border: "2px dashed #cbd5e1", borderRadius: 12, padding: "40px 20px",
                  textAlign: "center", cursor: "pointer", background: "#f8fafc",
                  transition: "border-color 0.2s, background 0.2s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#3b82f6";
                  (e.currentTarget as HTMLDivElement).style.background = "#eff6ff";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#cbd5e1";
                  (e.currentTarget as HTMLDivElement).style.background = "#f8fafc";
                }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📎</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#334155", margin: "0 0 6px" }}>
                  Click to select bill or receipt
                </p>
                <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                  JPG, PNG, PDF, WEBP · max 10MB
                </p>
              </div>
            ) : (
              <div style={{
                border: "1.5px solid #bbf7d0", borderRadius: 12, padding: "16px",
                background: "#f0fdf4", display: "flex", gap: 16, alignItems: "flex-start",
              }}>
                {billPreview ? (
                  <img src={billPreview} alt="Preview"
                    style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #d1fae5", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: 8, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>📄</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13, color: "#166534", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {billFile.name}
                  </p>
                  <p style={{ margin: "0 0 10px", fontSize: 11, color: "#4ade80" }}>
                    {(billFile.size / 1024).toFixed(1)} KB
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => billOnlyRef.current?.click()}
                      style={{ fontSize: 11, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                      Change file
                    </button>
                    <span style={{ color: "#cbd5e1" }}>|</span>
                    <button type="button" onClick={handleRemoveBill}
                      style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}

            <input ref={billOnlyRef} type="file" accept=".jpg,.jpeg,.png,.pdf"
              style={{ display: "none" }} onChange={handleFileChange} />

            <div className={styles.actions} style={{ marginTop: 20 }}>
              <button type="button" className={styles.btnClear} onClick={() => navigate("/dashboard")}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnSubmit}
                disabled={!billFile || billUploading}
                onClick={() => void handleBillOnlyUpload()}>
                {billUploading
                  ? <><span className={styles.spinner} />Uploading…</>
                  : "Upload Bill"}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── NORMAL MODE: submit new expense claim ─────────────────────────────────
  return (
    <div className={styles.page}>
      <CommonNavbar
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={async () => signOut()}
      />

      <main className={styles.main}>

        {/* Hero */}
        <div className={styles.hero}>
          <div>
            <p className={styles.heroEyebrow}>Expense Management</p>
            <h1 className={styles.heroTitle}>🧾 Submit Expense Claim</h1>
            <p className={styles.heroSub}>
              {tripLocked && selectedTrip
                ? `Submitting for: ${selectedTrip.requestCode} · ${selectedTrip.destination}`
                : "Link your expense to an approved travel request and submit for reimbursement."}
            </p>
          </div>
          <button className={styles.heroBack} onClick={() => navigate("/dashboard")}>← Dashboard</button>
        </div>

        {/* Form card */}
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Claim Details</p>
          <h2 className={styles.cardTitle}>New Expense Claim</h2>
          <p className={styles.cardNote}>All fields marked * are required.</p>

          {/* Trip locked banner */}
          {tripLocked && selectedTrip && (
            <div style={{
              padding: "10px 16px", marginBottom: 20, borderRadius: 10,
              background: "#f0fdf4", border: "1px solid #bbf7d0",
              fontSize: 13, color: "#166534", fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span>
                ✈️ Linked to: <strong>{selectedTrip.requestCode}</strong> · {selectedTrip.destination} · {selectedTrip.transportType}
              </span>
              <button
                type="button"
                onClick={() => navigate("/expense/submit")}
                style={{ fontSize: 11, color: "#64748b", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                Change trip →
              </button>
            </div>
          )}

          {msg && (
            <div className={msg.type === "success" ? styles.msgSuccess : styles.msgError}>
              {msg.text}
            </div>
          )}

          <form onSubmit={e => void handleSubmit(e)}>
            <div className={styles.grid}>

              {/* ── Travel Request ── */}
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.label}>
                  Link to Travel Request *
                  {tripLocked && (
                    <span style={{ marginLeft: 8, fontSize: 10, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                      🔒 Pre-selected
                    </span>
                  )}
                </span>

                {tripLocked ? (
                  /* Locked: show as read-only card, not dropdown */
                  <div style={{
                    padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0",
                    background: "#f8fafc", fontSize: 14, color: "#334155",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <span>
                      {selectedTrip
                        ? `${selectedTrip.requestCode} · ${selectedTrip.destination} · ${selectedTrip.transportType} [${selectedTrip.status}]`
                        : `Request #${presetRequestId}`}
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>🔒 locked</span>
                  </div>
                ) : (
                  /* Normal dropdown: all approved trips */
                  <select
                    className={styles.input}
                    name="requestId"
                    value={form.requestId}
                    onChange={handleRequestChange}
                    required>
                    <option value="">— Select a travel request —</option>
                    {trips.map(t => (
                      <option key={t.requestId} value={t.requestId}>
                        {t.requestCode} · {t.destination} · {t.transportType} [{t.status}]
                      </option>
                    ))}
                  </select>
                )}

                {!tripLocked && trips.length === 0 && (
                  <span className={styles.hint}>
                    ⚠ No approved travel requests found. A request must be approved before submitting expenses.
                  </span>
                )}

                {/* Selected trip details */}
                {selectedTrip && (
                  <div style={{
                    marginTop: 8, padding: "10px 14px", background: "#f0fdf4",
                    border: "1px solid #bbf7d0", borderRadius: 10, fontSize: 12, color: "#166534",
                    display: "flex", gap: 16, flexWrap: "wrap",
                  }}>
                    <span>✈️ <strong>{selectedTrip.destination}</strong></span>
                    <span>🚌 {selectedTrip.transportType}</span>
                    <span>📅 {selectedTrip.departureDate} → {selectedTrip.returnDate}</span>
                    {selectedTrip.estimatedAmount && (
                      <span>💰 Est. ₹{selectedTrip.estimatedAmount.toLocaleString("en-IN")}</span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Category ── */}
              <div className={styles.field}>
                <span className={styles.label}>
                  Category *
                  {selectedTrip && form.category && (
                    <span style={{ marginLeft: 8, fontSize: 10, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                      ✨ Auto-detected
                    </span>
                  )}
                </span>
                <select className={styles.input} name="category" value={form.category} onChange={handleChange} required>
                  <option value="">— Select category —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {selectedTrip && form.category && (
                  <span className={styles.hint} style={{ color: "#1d4ed8" }}>
                    Auto-detected from "{selectedTrip.transportType}". Change if needed.
                  </span>
                )}
              </div>

              {/* ── Expense Date ── */}
              <div className={styles.field}>
                <span className={styles.label}>Expense Date *</span>
                <input className={styles.input} type="date" name="expenseDate" value={form.expenseDate}
                  onChange={handleChange} max={new Date().toISOString().slice(0, 10)} required />
              </div>

              {/* ── Amount ── */}
              <div className={styles.field}>
                <span className={styles.label}>Amount *</span>
                <input className={styles.input} type="number" name="amount" min="1" step="0.01"
                  value={form.amount} onChange={handleChange} placeholder="Enter amount" required />
              </div>

              {/* ── Currency ── */}
              <div className={styles.field}>
                <span className={styles.label}>Currency</span>
                <select className={styles.input} name="currency" value={form.currency} onChange={handleChange}>
                  {["INR", "USD", "EUR", "GBP", "AED", "SGD"].map(c =>
                    <option key={c} value={c}>{c}</option>
                  )}
                </select>
              </div>

              {/* ── Description ── */}
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.label}>Description *</span>
                <textarea className={`${styles.input} ${styles.textarea}`} name="description"
                  value={form.description} onChange={handleChange} rows={3}
                  placeholder="Describe the expense — purpose, vendor, and any relevant context." required />
              </div>

              {/* ── Bill Upload ── */}
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.label}>
                  Upload Bill / Receipt
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>
                    (Optional but recommended — JPG, PNG, PDF · max 10MB)
                  </span>
                </span>

                {!billFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: "2px dashed #cbd5e1", borderRadius: 12, padding: "32px 20px",
                      textAlign: "center", cursor: "pointer", background: "#f8fafc",
                      transition: "border-color 0.2s, background 0.2s",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = "#3b82f6";
                      (e.currentTarget as HTMLDivElement).style.background = "#eff6ff";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = "#cbd5e1";
                      (e.currentTarget as HTMLDivElement).style.background = "#f8fafc";
                    }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 4px" }}>
                      Click to upload bill or receipt
                    </p>
                    <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
                      JPG, PNG, PDF, WEBP supported
                    </p>
                  </div>
                ) : (
                  <div style={{
                    border: "1.5px solid #bbf7d0", borderRadius: 12, padding: "16px",
                    background: "#f0fdf4", display: "flex", gap: 16, alignItems: "flex-start",
                  }}>
                    {billPreview ? (
                      <img src={billPreview} alt="Bill preview"
                        style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #d1fae5", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 80, height: 80, borderRadius: 8, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0, border: "1px solid #fecaca" }}>📄</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13, color: "#166534", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {billFile.name}
                      </p>
                      <p style={{ margin: "0 0 10px", fontSize: 11, color: "#4ade80" }}>
                        {(billFile.size / 1024).toFixed(1)} KB · {billFile.type || "document"}
                      </p>
                      {uploadDone && <span style={{ fontSize: 11, color: "#15803d", fontWeight: 700 }}>✅ Bill will be uploaded on submit</span>}
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                          style={{ fontSize: 11, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                          Change file
                        </button>
                        <span style={{ color: "#cbd5e1" }}>|</span>
                        <button type="button" onClick={handleRemoveBill}
                          style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf,.webp"
                  style={{ display: "none" }} onChange={handleFileChange} />
              </div>

            </div>

            {/* Info box */}
            <div className={styles.infoBox}>
              <p className={styles.infoBoxTitle}>📌 How it works</p>
              <ul className={styles.infoBoxList}>
                <li>Select your approved travel request — the category is auto-detected from your transport type.</li>
                <li>Upload your bill or receipt directly here (optional but speeds up approval).</li>
                <li>HR or Admin will review and approve your claim.</li>
                <li>Reimbursement will be processed once approved.</li>
                {tripLocked && <li>You came from a specific trip — this expense will be linked to it automatically.</li>}
              </ul>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.btnClear}
                onClick={() => { setForm({ ...EMPTY, requestId: presetRequestId }); setMsg(null); setBillFile(null); setBillPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                disabled={submitting}>
                Clear
              </button>
              <button type="submit" className={styles.btnSubmit} disabled={submitting || uploading}>
                {submitting ? (
                  uploading
                    ? <><span className={styles.spinner} />Uploading bill…</>
                    : <><span className={styles.spinner} />Submitting…</>
                ) : (
                  billFile ? "Submit Claim + Upload Bill" : "Submit Expense Claim"
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}