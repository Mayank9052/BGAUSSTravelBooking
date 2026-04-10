// src/pages/expenses/ExpenseSubmitPage.tsx
// Uses ExpenseSubmitPage.module.css — no inline styles

import { useState, type ChangeEvent, type FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { get, post } from "../../services/apiClient";
import { ApiError } from "../../services/apiClient";
import type { TravelRequestResponse } from "../../services/apiClient";
import styles from "./ExpenseSubmitPage.module.css";

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

const CATEGORIES = [
  "Flight Ticket", "Train Ticket", "Cab / Local Transport",
  "Hotel Stay", "Meals & Dining", "Visa & Documentation",
  "Internet / Communication", "Conference / Event Fee", "Miscellaneous",
];

export default function ExpenseSubmitPage() {
  const navigate    = useNavigate();
  const { signOut } = useMsalLogin();

  const fullName = localStorage.getItem("full_name") ?? "Employee";
  const role     = localStorage.getItem("role")      ?? "Employee";
  const initials = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const [form,       setForm]       = useState<ExpenseForm>(EMPTY);
  const [trips,      setTrips]      = useState<TravelRequestResponse[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg,        setMsg]        = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    get<TravelRequestResponse[]>("/Booking/my")
      .then(setTrips)
      .catch(() => {});
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const validate = (): string | null => {
    if (!form.requestId)                                               return "Please link this expense to a travel request.";
    if (!form.category)                                                return "Category is required.";
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) return "Enter a valid amount.";
    if (!form.expenseDate)                                             return "Expense date is required.";
    if (!form.description.trim())                                      return "Description is required.";
    return null;
  };

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
      setMsg({ type: "success", text: `✅ Expense submitted! Code: ${result.claimCode}` });
      setForm(EMPTY);
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (ex) {
      const text = ex instanceof ApiError ? ex.message : "Submission failed. Please try again.";
      setMsg({ type: "error", text: `❌ ${text}` });
    } finally {
      setSubmitting(false);
    }
  };

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
            <p className={styles.heroSub}>Link your expense to an approved travel request and submit for reimbursement.</p>
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

              {/* Link to travel request */}
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.label}>Link to Travel Request *</span>
                <select className={styles.input} name="requestId" value={form.requestId} onChange={handleChange} required>
                  <option value="">— Select a travel request —</option>
                  {trips.map(t => (
                    <option key={t.requestId} value={t.requestId}>
                      {t.requestCode} · {t.destination} · {t.transportType} [{t.status}]
                    </option>
                  ))}
                </select>
                {trips.length === 0 && (
                  <span className={styles.hint}>⚠ No travel requests found. Submit a travel request first.</span>
                )}
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Category *</span>
                <select className={styles.input} name="category" value={form.category} onChange={handleChange} required>
                  <option value="">— Select category —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Expense Date *</span>
                <input className={styles.input} type="date" name="expenseDate"
                  value={form.expenseDate} onChange={handleChange}
                  max={new Date().toISOString().slice(0, 10)} required />
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Amount *</span>
                <input className={styles.input} type="number" name="amount" min="1" step="0.01"
                  value={form.amount} onChange={handleChange} placeholder="Enter amount" required />
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Currency</span>
                <select className={styles.input} name="currency" value={form.currency} onChange={handleChange}>
                  {["INR", "USD", "EUR", "GBP", "AED", "SGD"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.label}>Description *</span>
                <textarea className={`${styles.input} ${styles.textarea}`}
                  name="description" value={form.description} onChange={handleChange}
                  rows={3} placeholder="Describe the expense — purpose, vendor, and any relevant context." required />
              </div>

            </div>

            {/* Info box */}
            <div className={styles.infoBox}>
              <p className={styles.infoBoxTitle}>📌 Next steps after submission</p>
              <ul className={styles.infoBoxList}>
                <li>Upload your bill / receipt via the dashboard after submission.</li>
                <li>HR or Admin will review and approve your claim.</li>
                <li>Reimbursement will be processed once approved.</li>
              </ul>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.btnClear}
                onClick={() => { setForm(EMPTY); setMsg(null); }} disabled={submitting}>
                Clear
              </button>
              <button type="submit" className={styles.btnSubmit} disabled={submitting}>
                {submitting ? (
                  <><span className={styles.spinner} />Submitting…</>
                ) : "Submit Expense Claim"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}