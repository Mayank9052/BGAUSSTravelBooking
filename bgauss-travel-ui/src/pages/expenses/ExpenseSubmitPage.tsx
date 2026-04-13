// src/pages/expenses/ExpenseSubmitPage.tsx
// Uses ExpenseSubmitPage.module.css — no inline styles

import { useState, type ChangeEvent, type FormEvent, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { get, post, uploadFile } from "../../services/apiClient";
import { ApiError } from "../../services/apiClient";
import type { TravelRequestResponse } from "../../services/apiClient";
import styles from "./ExpenseSubmitPage.module.css";

// ── Transport → Category mapping ─────────────────────────────────────────────
// When a trip is selected, auto-fill the category based on transport type
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
  const navigate    = useNavigate();
  const { signOut } = useMsalLogin();

  const fullName = localStorage.getItem("full_name") ?? "Employee";
  const role     = localStorage.getItem("role")      ?? "Employee";
  const initials = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const [form,         setForm]         = useState<ExpenseForm>(EMPTY);
  const [trips,        setTrips]        = useState<TravelRequestResponse[]>([]);
  const [submitting,   setSubmitting]   = useState(false);
  const [msg,          setMsg]          = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Bill upload state
  const [billFile,     setBillFile]     = useState<File | null>(null);
  const [billPreview,  setBillPreview]  = useState<string | null>(null);   // image preview URL
  const [uploading,    setUploading]    = useState(false);
  const [uploadDone,   setUploadDone]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load only Approved trips for the dropdown
  useEffect(() => {
    get<TravelRequestResponse[]>("/Booking/my")
      .then(data => setTrips(data.filter(t => t.status === "Approved")))
      .catch(err => console.error("Failed to load trips:", err));
  }, []);

  // ── When a travel request is selected, auto-detect category ──────────────
  const handleRequestChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const requestId = e.target.value;
    const trip = trips.find(t => String(t.requestId) === requestId);
    const autoCategory = trip ? (TRANSPORT_TO_CATEGORY[trip.transportType] ?? "") : "";
    setForm(f => ({ ...f, requestId, category: autoCategory }));
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  // ── Bill file selection ───────────────────────────────────────────────────
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setBillFile(file);
    setUploadDone(false);

    // Show image preview for images; show filename for PDFs
    if (file) {
      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        setBillPreview(url);
      } else {
        setBillPreview(null); // PDF — no preview, just show name
      }
    } else {
      setBillPreview(null);
    }
  };

  const handleRemoveBill = () => {
    setBillFile(null);
    setBillPreview(null);
    setUploadDone(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!form.requestId)                                                        return "Please link this expense to a travel request.";
    if (!form.category)                                                         return "Category is required.";
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) return "Enter a valid amount.";
    if (!form.expenseDate)                                                      return "Expense date is required.";
    if (!form.description.trim())                                               return "Description is required.";
    return null;
  };

  // ── Submit: 1) create claim  2) upload bill if provided ──────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setMsg({ type: "error", text: err }); return; }

    setSubmitting(true);
    setMsg(null);

    try {
      // Step 1 — create expense claim
      const result = await post<{ claimId: number; claimCode: string }>("/Expense", {
        requestId:   Number(form.requestId),
        category:    form.category,
        amount:      Number(form.amount),
        currency:    form.currency,
        expenseDate: form.expenseDate,
        description: form.description.trim(),
      });

      // Step 2 — upload bill if one was selected
      if (billFile) {
        setUploading(true);
        try {
          await uploadFile(`/Expense/${result.claimId}/upload-bill`, billFile, "file");
          setUploadDone(true);
        } catch {
          // Claim created — bill upload failed, not fatal
          setMsg({
            type: "success",
            text: `✅ Expense submitted (${result.claimCode}) but bill upload failed — you can re-upload from the dashboard.`,
          });
          setForm(EMPTY);
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
      setForm(EMPTY);
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

  // Helper — which trip is currently selected
  const selectedTrip = trips.find(t => String(t.requestId) === form.requestId);

  // ── Render ────────────────────────────────────────────────────────────────
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
              Link your expense to an approved travel request and submit for reimbursement.
            </p>
          </div>
          <button className={styles.heroBack} onClick={() => navigate("/dashboard")}>← Dashboard</button>
        </div>

        {/* Form card */}
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Claim Details</p>
          <h2 className={styles.cardTitle}>New Expense Claim</h2>
          <p className={styles.cardNote}>All fields marked * are required.</p>

          {msg && (
            <div className={msg.type === "success" ? styles.msgSuccess : styles.msgError}>
              {msg.text}
            </div>
          )}

          <form onSubmit={e => void handleSubmit(e)}>
            <div className={styles.grid}>

              {/* ── Travel Request ── */}
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.label}>Link to Travel Request *</span>
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
                {trips.length === 0 && (
                  <span className={styles.hint}>
                    ⚠ No approved travel requests found. A request must be approved before submitting expenses.
                  </span>
                )}
                {/* Show selected trip details */}
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

              {/* ── Category — auto-filled, still editable ── */}
              <div className={styles.field}>
                <span className={styles.label}>
                  Category *
                  {selectedTrip && form.category && (
                    <span style={{
                      marginLeft: 8, fontSize: 10, background: "#dbeafe",
                      color: "#1d4ed8", padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                    }}>
                      ✨ Auto-detected
                    </span>
                  )}
                </span>
                <select
                  className={styles.input}
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  required>
                  <option value="">— Select category —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {selectedTrip && form.category && (
                  <span className={styles.hint} style={{ color: "#1d4ed8" }}>
                    Auto-detected from transport type "{selectedTrip.transportType}". Change if needed.
                  </span>
                )}
              </div>

              {/* ── Expense Date ── */}
              <div className={styles.field}>
                <span className={styles.label}>Expense Date *</span>
                <input
                  className={styles.input}
                  type="date"
                  name="expenseDate"
                  value={form.expenseDate}
                  onChange={handleChange}
                  max={new Date().toISOString().slice(0, 10)}
                  required />
              </div>

              {/* ── Amount ── */}
              <div className={styles.field}>
                <span className={styles.label}>Amount *</span>
                <input
                  className={styles.input}
                  type="number"
                  name="amount"
                  min="1"
                  step="0.01"
                  value={form.amount}
                  onChange={handleChange}
                  placeholder="Enter amount"
                  required />
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
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Describe the expense — purpose, vendor, and any relevant context."
                  required />
              </div>

              {/* ── Bill Upload ── */}
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.label}>
                  Upload Bill / Receipt
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>
                    (Optional but recommended — JPG, PNG, PDF, WEBP · max 10MB)
                  </span>
                </span>

                {/* Drop zone */}
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
                  /* File selected — show preview */
                  <div style={{
                    border: "1.5px solid #bbf7d0", borderRadius: 12, padding: "16px",
                    background: "#f0fdf4", display: "flex", gap: 16, alignItems: "flex-start",
                  }}>
                    {/* Image preview or file icon */}
                    {billPreview ? (
                      <img
                        src={billPreview}
                        alt="Bill preview"
                        style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #d1fae5", flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{
                        width: 80, height: 80, borderRadius: 8, background: "#fee2e2",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 28, flexShrink: 0, border: "1px solid #fecaca",
                      }}>
                        📄
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13, color: "#166534", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {billFile.name}
                      </p>
                      <p style={{ margin: "0 0 10px", fontSize: 11, color: "#4ade80" }}>
                        {(billFile.size / 1024).toFixed(1)} KB · {billFile.type || "document"}
                      </p>
                      {uploadDone && (
                        <span style={{ fontSize: 11, color: "#15803d", fontWeight: 700 }}>✅ Bill will be uploaded on submit</span>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{ fontSize: 11, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                          Change file
                        </button>
                        <span style={{ color: "#cbd5e1" }}>|</span>
                        <button
                          type="button"
                          onClick={handleRemoveBill}
                          style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,.webp"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
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
              </ul>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnClear}
                onClick={() => { setForm(EMPTY); setMsg(null); setBillFile(null); setBillPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
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