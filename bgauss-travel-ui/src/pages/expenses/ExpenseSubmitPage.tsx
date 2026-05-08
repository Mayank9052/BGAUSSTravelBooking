// src/pages/expenses/ExpenseSubmitPage.tsx
// CHANGES from previous version:
//  ✅ "Add Expense Row" button added inside each ExpenseRowCard, next to Bills/Receipts column
//  ✅ All other behaviour unchanged

import {
  useState, useRef, useCallback,
  type ChangeEvent, type FormEvent, useEffect,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { get, post, uploadFile } from "../../services/apiClient";
import { ApiError } from "../../services/apiClient";
import type { TravelRequestResponse } from "../../services/apiClient";

// ── Category sets per transport type ─────────────────────────────────────────
const ALL_CATEGORIES = [
  "Flight Ticket", "Train Ticket", "Bus Ticket", "Cab / Local Transport",
  "Hotel Stay", "Meals & Dining", "Fuel / Petrol", "Toll / Parking",
  "Visa & Documentation", "Internet / Communication",
  "Conference / Event Fee", "Miscellaneous",
];

const TRANSPORT_CATEGORIES: Record<string, string[]> = {
  Flight: [
    "Flight Ticket", "Cab / Local Transport", "Hotel Stay", "Meals & Dining",
    "Toll / Parking", "Visa & Documentation", "Internet / Communication", "Miscellaneous",
  ],
  Train: [
    "Train Ticket", "Cab / Local Transport", "Hotel Stay", "Meals & Dining",
    "Toll / Parking", "Internet / Communication", "Miscellaneous",
  ],
  Bus: [
    "Bus Ticket", "Cab / Local Transport", "Meals & Dining",
    "Toll / Parking", "Internet / Communication", "Miscellaneous",
  ],
  Cab: [
    "Cab / Local Transport", "Fuel / Petrol", "Toll / Parking",
    "Meals & Dining", "Miscellaneous",
  ],
  Hotel: [
    "Hotel Stay", "Meals & Dining", "Internet / Communication",
    "Conference / Event Fee", "Miscellaneous",
  ],
};

const TRANSPORT_TO_DEFAULT: Record<string, string> = {
  Flight: "Flight Ticket",
  Train:  "Train Ticket",
  Bus:    "Bus Ticket",
  Cab:    "Cab / Local Transport",
  Hotel:  "Hotel Stay",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface BillFile {
  file:    File;
  preview: string | null;
  name:    string;
  size:    string;
}

interface ExpenseRow {
  id:          string;
  category:    string;
  amount:      string;
  currency:    string;
  expenseDate: string;
  description: string;
  bills:       BillFile[];
  ocrAmount:   string | null;
  ocrLoading:  boolean;
}

function makeRow(category = "", id?: string): ExpenseRow {
  return {
    id:          id ?? `${Date.now()}${Math.random().toString(36).slice(2)}`,
    category,
    amount:      "",
    currency:    "INR",
    expenseDate: "",
    description: "",
    bills:       [],
    ocrAmount:   null,
    ocrLoading:  false,
  };
}

// ── OCR simulation ────────────────────────────────────────────────────────────
async function simulateOCR(file: File): Promise<string | null> {
  const match = file.name.match(/(?:rs\.?|inr|₹)?\s?(\d{3,6}(?:\.\d{1,2})?)/i);
  if (match) return match[1];
  if (file.type.startsWith("image/")) {
    await new Promise(r => setTimeout(r, 900));
    return null;
  }
  return null;
}

// ── Input style helper ────────────────────────────────────────────────────────
const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1.5px solid #e2e8f0", fontSize: 13, color: "#0f172a",
  background: "#fff", outline: "none", fontFamily: "inherit",
  boxSizing: "border-box", ...extra,
});

// ── Bill upload row card ──────────────────────────────────────────────────────
interface RowCardProps {
  row:          ExpenseRow;
  idx:          number;
  total:        number;
  categories:   string[];
  onUpdate:     (patch: Partial<ExpenseRow>) => void;
  onRemove:     () => void;
  onBillSelect: (files: FileList | null) => void;
  onBillRemove: (name: string) => void;
  onAddRow:     () => void;   // ← NEW: triggers adding a row after this one
}

function ExpenseRowCard({
  row, idx, total, categories,
  onUpdate, onRemove, onBillSelect, onBillRemove, onAddRow,
}: RowCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{
      border: "1.5px solid #e2e8f0", borderRadius: 14,
      padding: "14px 16px", background: "#f8fafc", position: "relative",
    }}>
      {/* Row header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{
          background: "#0f172a", color: "#fff",
          borderRadius: 20, padding: "3px 14px",
          fontSize: 11, fontWeight: 800,
        }}>
          Expense #{idx + 1}
        </span>
        {total > 1 && (
          <button onClick={onRemove} style={{
            background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626",
            borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700,
            cursor: "pointer",
          }}>✕ Remove</button>
        )}
      </div>

      {/* ── Fields grid ── */}
      <div style={{
        display: "grid",
        // 6 columns: Category | Description | Amount | Date | Bills | Add-Row-btn
        gridTemplateColumns: "minmax(130px,1.3fr) minmax(150px,1.8fr) minmax(105px,1fr) minmax(125px,1fr) minmax(170px,1.8fr) auto",
        gap: 10,
        alignItems: "end",
      }}>

        {/* 1. Category */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Category *
          </label>
          <select value={row.category} onChange={e => onUpdate({ category: e.target.value })} style={inp()}>
            <option value="">— Select —</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* 2. Description */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Description *
          </label>
          <input type="text" value={row.description}
            onChange={e => onUpdate({ description: e.target.value })}
            placeholder="Purpose / vendor…" style={inp()} />
        </div>

        {/* 3. Amount */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Amount *
            {row.ocrLoading && <span style={{ marginLeft: 6, fontSize: 9, color: "#3b82f6" }}>🔍</span>}
            {row.ocrAmount && !row.ocrLoading && (
              <button type="button" onClick={() => onUpdate({ amount: row.ocrAmount! })}
                style={{ marginLeft: 5, fontSize: 9, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 4, padding: "1px 5px", cursor: "pointer", fontWeight: 700 }}>
                ₹{row.ocrAmount}
              </button>
            )}
          </label>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              fontSize: 12, color: "#64748b", fontWeight: 700, pointerEvents: "none",
            }}>₹</span>
            <input
              type="number" min="0.01" step="0.01"
              value={row.amount}
              onChange={e => onUpdate({ amount: e.target.value })}
              placeholder="0.00"
              style={inp({ paddingLeft: 24 })}
            />
          </div>
        </div>

        {/* 4. Expense Date */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Expense Date *
          </label>
          <input type="date" value={row.expenseDate}
            onChange={e => onUpdate({ expenseDate: e.target.value })}
            max={new Date().toISOString().slice(0, 10)} style={inp()} />
        </div>

        {/* 5. Bills / Receipts */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Bills / Receipts
            <span style={{ marginLeft: 4, fontSize: 9, color: "#94a3b8", fontWeight: 400, textTransform: "none" }}>
              (JPG/PNG/PDF, multi)
            </span>
          </label>

          {/* Uploaded bill chips */}
          {row.bills.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 5 }}>
              {row.bills.map(bill => (
                <div key={bill.name} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "#fff", border: "1.5px solid #e2e8f0",
                  borderRadius: 8, padding: "3px 7px", maxWidth: 140,
                }}>
                  {bill.preview
                    ? <img src={bill.preview} alt="" style={{ width: 18, height: 18, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
                    : <span style={{ fontSize: 12, flexShrink: 0 }}>📄</span>
                  }
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: "#0f172a",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                  }}>{bill.name}</span>
                  <button onClick={() => onBillRemove(bill.name)} style={{
                    flexShrink: 0, width: 14, height: 14, borderRadius: "50%",
                    border: "none", background: "#fef2f2", color: "#dc2626",
                    cursor: "pointer", fontSize: 9, lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: 0,
                  }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: "2px dashed #cbd5e1", borderRadius: 8, padding: "7px 10px",
              textAlign: "center", cursor: "pointer", background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              fontSize: 11, color: "#64748b", fontWeight: 600,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "#3b82f6";
              (e.currentTarget as HTMLDivElement).style.background  = "#eff6ff";
              (e.currentTarget as HTMLDivElement).style.color       = "#1d4ed8";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "#cbd5e1";
              (e.currentTarget as HTMLDivElement).style.background  = "#fff";
              (e.currentTarget as HTMLDivElement).style.color       = "#64748b";
            }}
          >
            <span>📎</span>
            {row.bills.length > 0 ? `+${row.bills.length} · add more` : "Upload bill(s)"}
          </div>

          <input
            key={row.bills.length}
            ref={fileRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.pdf"
            style={{ display: "none" }}
            onChange={e => {
              onBillSelect(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* 6. ✅ NEW: Inline "Add Row" button — sits at the end of every row */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          {/* Invisible label spacer to align button with inputs */}
          <label style={{ fontSize: 10, fontWeight: 700, color: "transparent", display: "block", marginBottom: 3, userSelect: "none" }}>
            &nbsp;
          </label>
          <button
            type="button"
            onClick={onAddRow}
            title="Add another expense row"
            style={{
              padding: "8px 12px",
              background: "#0f172a",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "36px",
              minWidth: "36px",
              transition: "background 0.15s, transform 0.1s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "#1e3a5f";
              (e.currentTarget as HTMLButtonElement).style.transform  = "scale(1.07)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "#0f172a";
              (e.currentTarget as HTMLButtonElement).style.transform  = "scale(1)";
            }}
          >
            +
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExpenseSubmitPage() {
  const navigate = useNavigate();
  const { signOut } = useMsalLogin();
  const [searchParams] = useSearchParams();

  const presetRequestId = searchParams.get("requestId") ?? "";
  const fullName = localStorage.getItem("full_name") ?? "Employee";
  const role     = localStorage.getItem("role")      ?? "Employee";
  const initials = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const [trips,      setTrips]      = useState<TravelRequestResponse[]>([]);
  const [requestId,  setRequestId]  = useState(presetRequestId);
  const [rows,       setRows]       = useState<ExpenseRow[]>([makeRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [msg,        setMsg]        = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [submitLog,  setSubmitLog]  = useState<string[]>([]);

  const selectedTrip = trips.find(t => String(t.requestId) === requestId);
  const availableCategories = selectedTrip
    ? (TRANSPORT_CATEGORIES[selectedTrip.transportType] ?? ALL_CATEGORIES)
    : ALL_CATEGORIES;
  const defaultCategory = selectedTrip
    ? (TRANSPORT_TO_DEFAULT[selectedTrip.transportType] ?? "")
    : "";
  const tripLocked = !!presetRequestId;

  // Load approved trips
  useEffect(() => {
    get<TravelRequestResponse[]>("/Booking/my")
      .then(data => {
        const approved = data.filter(t => t.status === "Approved");
        setTrips(approved);
        if (presetRequestId) {
          const trip = approved.find(t => String(t.requestId) === presetRequestId);
          if (trip) {
            const cat = TRANSPORT_TO_DEFAULT[trip.transportType] ?? "";
            setRows(prev => prev.map((r, i) => i === 0 ? { ...r, category: cat } : r));
          }
        }
      })
      .catch(() => {});
  }, [presetRequestId]);

  // When trip changes, reset rows with new default category
  useEffect(() => {
    if (requestId && selectedTrip) {
      setRows([makeRow(defaultCategory)]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  // ── Row operations ──────────────────────────────────────────────────────────
  const updateRow = (id: string, patch: Partial<ExpenseRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const addRow = useCallback(() =>
    setRows(prev => [...prev, makeRow(defaultCategory)]),
  [defaultCategory]);

  // ✅ Add a row immediately AFTER a specific row index
  const addRowAfter = useCallback((afterIdx: number) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows.splice(afterIdx + 1, 0, makeRow(defaultCategory));
      return newRows;
    });
  }, [defaultCategory]);

  const removeRow = (id: string) =>
    setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);

  // ── Bill upload per row ─────────────────────────────────────────────────────
  const handleBillSelect = useCallback(async (rowId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newBills: BillFile[] = [];
    for (const file of Array.from(files)) {
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      newBills.push({
        file, preview,
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
      });
    }

    setRows(prev => prev.map(r => r.id === rowId
      ? { ...r, bills: [...r.bills, ...newBills], ocrLoading: true }
      : r
    ));

    const imageBill = newBills.find(b => b.file.type.startsWith("image/"));
    if (imageBill) {
      const detected = await simulateOCR(imageBill.file);
      setRows(prev => prev.map(r => r.id === rowId
        ? {
            ...r, ocrLoading: false, ocrAmount: detected,
            amount: r.amount === "" && detected ? detected : r.amount,
          }
        : r
      ));
    } else {
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, ocrLoading: false } : r));
    }
  }, []);

  const removeBill = (rowId: string, billName: string) =>
    setRows(prev => prev.map(r => r.id === rowId
      ? { ...r, bills: r.bills.filter(b => b.name !== billName) }
      : r
    ));

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!requestId) return "Please select a travel request.";
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.category)                                 return `Row ${i + 1}: Category is required.`;
      if (!r.amount || isNaN(Number(r.amount)) || Number(r.amount) <= 0)
                                                       return `Row ${i + 1}: Enter a valid amount.`;
      if (!r.expenseDate)                              return `Row ${i + 1}: Expense date is required.`;
      if (!r.description.trim())                       return `Row ${i + 1}: Description is required.`;
    }
    return null;
  };

  // ── Submit all rows ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setMsg({ type: "error", text: err }); return; }

    setSubmitting(true);
    setMsg(null);
    setSubmitLog([]);
    const log: string[] = [];

    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        log.push(`Row ${i + 1}: Submitting ${row.category}…`);
        setSubmitLog([...log]);

        const result = await post<{ claimId: number; claimCode: string }>("/Expense", {
          requestId:   Number(requestId),
          category:    row.category,
          amount:      Number(row.amount),
          currency:    row.currency,
          expenseDate: row.expenseDate,
          description: row.description.trim(),
        });

        log[log.length - 1] = `Row ${i + 1}: ✅ ${result.claimCode} submitted`;
        setSubmitLog([...log]);

        for (const bill of row.bills) {
          log.push(`  → Uploading ${bill.name}…`);
          setSubmitLog([...log]);
          try {
            await uploadFile(`/Expense/${result.claimId}/upload-bill`, bill.file);
            log[log.length - 1] = `  → ✅ ${bill.name} uploaded`;
          } catch {
            log[log.length - 1] = `  → ⚠ ${bill.name} upload failed`;
          }
          setSubmitLog([...log]);
        }
      }

      log.push("🎉 All expense claims submitted successfully!");
      setSubmitLog([...log]);
      setMsg({
        type: "success",
        text: `✅ ${rows.length} expense claim${rows.length > 1 ? "s" : ""} submitted!`,
      });
      setRows([makeRow(defaultCategory)]);
      setTimeout(() => navigate("/dashboard"), 2500);
    } catch (ex) {
      const text = ex instanceof ApiError ? ex.message : "Submission failed.";
      setMsg({ type: "error", text: `❌ ${text}` });
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmount = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Segoe UI', sans-serif" }}>
      <CommonNavbar
        showBack={true}
        onBack={() => navigate("/dashboard")}
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={async () => signOut()}
      />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 20px 60px" }}>

        {/* Hero */}
        <div style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
          borderRadius: 20, padding: "28px 32px", marginBottom: 24,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 16, boxShadow: "0 8px 32px rgba(15,23,42,0.28)",
        }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
              Expense Management
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#fff", margin: 0 }}>🧾 Submit Expense Claims</h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
              Add all trip-related expenses in one form — hotel, flight, cab, meals, etc.
              Use the <strong style={{ color: "rgba(255,255,255,0.8)" }}>+</strong> button on each row to add another expense below it.
            </p>
          </div>
          <button onClick={() => navigate("/dashboard")} style={{
            padding: "8px 18px", background: "rgba(255,255,255,0.08)",
            border: "1.5px solid rgba(255,255,255,0.2)", borderRadius: 10,
            color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer",
          }}>← Dashboard</button>
        </div>

        {/* Step 1 — Trip selector */}
        <div style={{
          background: "#fff", borderRadius: 16, padding: "20px 24px", marginBottom: 20,
          border: "1.5px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            1. Link to Travel Request
          </p>
          {tripLocked && selectedTrip ? (
            <div style={{
              padding: "12px 16px", borderRadius: 10, background: "#f0fdf4",
              border: "1.5px solid #bbf7d0", fontSize: 13, color: "#166534",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span>
                ✈️ <strong>{selectedTrip.requestCode}</strong> · {selectedTrip.destination} · {selectedTrip.transportType}
              </span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>🔒 Pre-selected</span>
            </div>
          ) : (
            <select
              value={requestId}
              onChange={e => setRequestId(e.target.value)}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 10,
                border: "1.5px solid #e2e8f0", fontSize: 13, color: "#0f172a",
                background: "#f8fafc", outline: "none", cursor: "pointer",
              }}
            >
              <option value="">— Select an approved travel request —</option>
              {trips.map(t => (
                <option key={t.requestId} value={t.requestId}>
                  {t.requestCode} · {t.destination} · {t.transportType} [{t.status}]
                </option>
              ))}
            </select>
          )}
          {trips.length === 0 && (
            <p style={{ fontSize: 12, color: "#f59e0b", marginTop: 8 }}>
              ⚠ No approved travel requests found.
            </p>
          )}

          {selectedTrip && (
            <div style={{
              marginTop: 12, padding: "10px 14px", background: "#eff6ff",
              borderRadius: 10, border: "1px solid #bfdbfe",
              display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: "#1e40af",
            }}>
              <span>📅 {selectedTrip.departureDate} → {selectedTrip.returnDate}</span>
              <span>📍 {selectedTrip.destination}</span>
              <span>🚗 {selectedTrip.transportType}</span>
              <span style={{ fontStyle: "italic", color: "#3b82f6" }}>
                Expense categories filtered for this trip type
              </span>
            </div>
          )}
        </div>

        {/* Step 2 — Expense rows */}
        <div style={{
          background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden", marginBottom: 20,
        }}>
          <div style={{
            padding: "16px 24px", background: "#f8fafc",
            borderBottom: "1.5px solid #e2e8f0",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <p style={{
                fontSize: 11, fontWeight: 700, color: "#94a3b8",
                textTransform: "uppercase", letterSpacing: "0.06em", margin: 0,
              }}>
                2. Expense Details ({rows.length} row{rows.length !== 1 ? "s" : ""})
              </p>
              {selectedTrip && (
                <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>
                  Add all expenses for this {selectedTrip.transportType} trip.
                  Use the <strong>+</strong> button on any row to insert a new expense below it.
                </p>
              )}
            </div>
            {/* Top-level Add Row button still kept for convenience */}
            {/* <button onClick={addRow} disabled={!requestId} style={{
              padding: "6px 16px", background: requestId ? "#0f172a" : "#94a3b8",
              color: "#fff", border: "none", borderRadius: 8,
              fontWeight: 700, fontSize: 12, cursor: requestId ? "pointer" : "not-allowed",
            }}>
              + Add Expense Row
            </button> */}
          </div>

          <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
            {!requestId ? (
              <div style={{
                padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 13,
              }}>
                ← Select a travel request above to start adding expenses
              </div>
            ) : (
              rows.map((row, idx) => (
                <ExpenseRowCard
                  key={row.id}
                  row={row}
                  idx={idx}
                  total={rows.length}
                  categories={availableCategories}
                  onUpdate={patch => updateRow(row.id, patch)}
                  onRemove={() => removeRow(row.id)}
                  onBillSelect={files => void handleBillSelect(row.id, files)}
                  onBillRemove={name => removeBill(row.id, name)}
                  onAddRow={() => addRowAfter(idx)}
                />
              ))
            )}
          </div>
        </div>

        {/* Summary + submit */}
        <div style={{
          background: "#fff", borderRadius: 16, padding: "20px 24px",
          border: "1.5px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12,
          }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>
                Summary
              </p>
              <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>
                  {rows.length} expense{rows.length !== 1 ? "s" : ""}
                </span>
                <span style={{ fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
                  Total: ₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => { setRows([makeRow(defaultCategory)]); setMsg(null); setSubmitLog([]); }}
                style={{
                  padding: "10px 20px", background: "#f1f5f9", color: "#64748b",
                  border: "1.5px solid #e2e8f0", borderRadius: 10,
                  fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}
              >
                Clear All
              </button>
              <button
                type="button"
                disabled={submitting || !requestId}
                onClick={e => void handleSubmit(e as unknown as FormEvent)}
                style={{
                  padding: "10px 24px",
                  background: submitting || !requestId ? "#94a3b8" : "#0f172a",
                  color: "#fff", border: "none", borderRadius: 10,
                  fontWeight: 800, fontSize: 13,
                  cursor: submitting || !requestId ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                {submitting
                  ? "Submitting…"
                  : `Submit ${rows.length} Claim${rows.length !== 1 ? "s" : ""} →`}
              </button>
            </div>
          </div>

          {msg && (
            <div style={{
              padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: msg.type === "success" ? "#dcfce7" : "#fef2f2",
              color:      msg.type === "success" ? "#166534"  : "#991b1b",
              border: `1px solid ${msg.type === "success" ? "#86efac" : "#fecaca"}`,
            }}>
              {msg.text}
            </div>
          )}

          {submitLog.length > 0 && (
            <div style={{
              marginTop: 12, padding: "12px 16px",
              background: "#0f172a", borderRadius: 10,
              fontFamily: "monospace", fontSize: 12, color: "#a3e635", lineHeight: 1.8,
            }}>
              {submitLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}