// src/components/travel/TravelRequestDetailModal.tsx
// !! This is the MODAL that opens when clicking a trip card on the Dashboard.
// !! It is NOT the booking form. The booking form is at:
//      src/pages/travel-requests/TravelRequestFormPage.tsx
//
// DashboardPage.tsx imports this as:
//   import TravelRequestDetailModal from "../../components/travel/TravelRequestDetailModal";
// And uses it as:
//   <TravelRequestDetailModal trip={detailTrip} isAdminOrHr={isAdminOrHr}
//     onClose={() => setDetailTrip(null)}
//     onAddExpense={id => navigate(`/expense/submit?requestId=${id}`)} />

import { useState, useEffect } from "react";
import type { TravelRequestResponse, ExpenseClaimResponse, ApprovalResponse } from "../../services/apiClient";
import { expenseService } from "../../services/expenseService";
import { approvalService } from "../../services/approvalService";

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return d; }
};
const fmtDateLong = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return d; }
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Draft:       { bg: "#f1f5f9", color: "#64748b" },
  Submitted:   { bg: "#eff6ff", color: "#1d4ed8" },
  UnderReview: { bg: "#fef3c7", color: "#92400e" },
  Approved:    { bg: "#dcfce7", color: "#15803d" },
  Rejected:    { bg: "#fee2e2", color: "#b91c1c" },
  Reimbursed:  { bg: "#ede9fe", color: "#6d28d9" },
};
const EXPENSE_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Submitted:   { bg: "#fef3c7", color: "#92400e" },
  Approved:    { bg: "#dcfce7", color: "#15803d" },
  Rejected:    { bg: "#fee2e2", color: "#b91c1c" },
  Reimbursed:  { bg: "#ede9fe", color: "#6d28d9" },
};
const TRANSPORT_ICONS: Record<string, string> = {
  Flight: "✈️", Train: "🚆", Cab: "🚕", Hotel: "🏨", Bus: "🚌", Multiple: "🗺️",
};

function Badge({ status, map }: { status: string; map: Record<string, { bg: string; color: string }> }) {
  const s = map[status] ?? { bg: "#f1f5f9", color: "#64748b" };
  return <span style={{ padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{status}</span>;
}

function BillLink({ billPath, billFileName }: { billPath: string | null; billFileName: string | null }) {
  if (!billPath) return <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠ No bill</span>;
  const isPdf = /\.pdf$/i.test(billPath);
  const label = billFileName ? (billFileName.length > 22 ? billFileName.slice(0, 22) + "…" : billFileName) : (isPdf ? "View PDF" : "View Bill");
  return (
    <a href={billPath} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {isPdf ? "📄" : "🖼️"} {label}
    </a>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f8fafc" }}>
      <span style={{ minWidth: 150, color: "#64748b", fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#0f172a", fontWeight: 500, wordBreak: "break-word" }}>{value || "—"}</span>
    </div>
  );
}

function SectionHead({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, marginTop: 4 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
    </div>
  );
}

export interface TravelRequestFormProps {
  trip:         TravelRequestResponse;
  isAdminOrHr:  boolean;
  onClose:      () => void;
  onAddExpense?: (requestId: number) => void;
}

export default function TravelRequestFormPage({ trip, isAdminOrHr, onClose, onAddExpense }: TravelRequestFormProps) {
  const [expenses,   setExpenses]   = useState<ExpenseClaimResponse[]>([]);
  const [approvals,  setApprovals]  = useState<ApprovalResponse[]>([]);
  const [loadingExp, setLoadingExp] = useState(true);
  const [loadingApv, setLoadingApv] = useState(false);
  const [activeTab,  setActiveTab]  = useState<"details" | "expenses" | "history">("details");
  const isDone = trip.status === "Approved" || trip.status === "Rejected";

  useEffect(() => {
    expenseService.getMy(undefined, trip.requestId)
      .then(setExpenses).catch(() => setExpenses([]))
      .finally(() => setLoadingExp(false));
  }, [trip.requestId]);

  useEffect(() => {
    if (activeTab !== "history" || !isDone) return;
    setLoadingApv(true);
    approvalService.history(trip.requestId)
      .then(setApprovals).catch(() => setApprovals([]))
      .finally(() => setLoadingApv(false));
  }, [activeTab, trip.requestId, isDone]);

  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const statusStyle  = STATUS_COLORS[trip.status] ?? { bg: "#f1f5f9", color: "#64748b" };
  const tabs: { id: "details" | "expenses" | "history"; label: string }[] = [
    { id: "details",  label: "Trip Details" },
    { id: "expenses", label: `Expenses (${expenses.length})` },
    ...(isDone ? [{ id: "history" as const, label: "Approval History" }] : []),
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9000 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(680px, 96vw)", maxHeight: "92vh", background: "#fff", borderRadius: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.22)", zIndex: 9001, fontFamily: "'Segoe UI', sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", padding: "20px 24px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ width: 50, height: 50, borderRadius: 14, flexShrink: 0, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
              {TRANSPORT_ICONS[trip.transportType] ?? "🚗"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "#fff", margin: 0 }}>{trip.destination}</h2>
                <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: statusStyle.bg, color: statusStyle.color }}>{trip.status}</span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "4px 0 0" }}>
                {trip.requestCode} · {trip.transportType}{trip.employeeName && isAdminOrHr ? ` · ${trip.employeeName}` : ""}
              </p>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 18, flexShrink: 0 }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", transition: "all 0.15s", background: activeTab === t.id ? "#fff" : "rgba(255,255,255,0.12)", color: activeTab === t.id ? "#0f172a" : "rgba(255,255,255,0.8)" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>

          {activeTab === "details" && (
            <div>
              <SectionHead icon="📋" title="Trip Information" />
              <InfoRow label="Request Code"    value={trip.requestCode} />
              <InfoRow label="Status"          value={<Badge status={trip.status} map={STATUS_COLORS} />} />
              <InfoRow label="Transport"       value={`${TRANSPORT_ICONS[trip.transportType] ?? ""} ${trip.transportType}`} />
              <InfoRow label="Destination"     value={trip.destination} />
              <InfoRow label="Departure Date"  value={fmtDate(trip.departureDate)} />
              <InfoRow label="Return Date"     value={fmtDate(trip.returnDate)} />
              {trip.estimatedAmount != null && <InfoRow label="Estimated Amount" value={`₹${trip.estimatedAmount.toLocaleString("en-IN")}`} />}

              {(trip.travelPurpose || trip.notes) && (
                <div style={{ marginTop: 20 }}>
                  <SectionHead icon="🎯" title="Purpose & Notes" />
                  {trip.travelPurpose && <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7, whiteSpace: "pre-line", marginBottom: 10 }}>{trip.travelPurpose}</div>}
                  {trip.notes && <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>📝 {trip.notes}</div>}
                </div>
              )}

              {isAdminOrHr && (
                <div style={{ marginTop: 20 }}>
                  <SectionHead icon="👤" title="Employee Info" />
                  <InfoRow label="Employee"      value={trip.employeeName} />
                  <InfoRow label="Department"    value={trip.department} />
                  <InfoRow label="Employee Code" value={trip.employeeCode ?? "—"} />
                </div>
              )}

              {(trip.originAddress || trip.originLatitude != null) && (
                <div style={{ marginTop: 20 }}>
                  <SectionHead icon="📍" title="Origin Location" />
                  {trip.originAddress && <InfoRow label="Address" value={trip.originAddress} />}
                  {trip.originLatitude != null && (
                    <div style={{ marginTop: 8 }}>
                      <a href={`https://maps.google.com/?q=${trip.originLatitude},${trip.originLongitude}`} target="_blank" rel="noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#1d4ed8", textDecoration: "none" }}>
                        🗺️ Open in Google Maps
                      </a>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 20 }}>
                <SectionHead icon="🕐" title="Timeline" />
                <InfoRow label="Submitted" value={fmtDateLong(trip.createdAt)} />
              </div>
            </div>
          )}

          {activeTab === "expenses" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <SectionHead icon="🧾" title={`Expense Claims (${expenses.length})`} />
                {!isAdminOrHr && onAddExpense && (
                  <button onClick={() => { onAddExpense(trip.requestId); onClose(); }}
                    style={{ padding: "6px 14px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    + Add Expense
                  </button>
                )}
              </div>
              {loadingExp ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading expenses…</div>
              ) : expenses.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", background: "#f8fafc", borderRadius: 10, border: "1px dashed #e2e8f0" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🧾</div>
                  <p style={{ fontSize: 13, color: "#64748b", fontWeight: 600, margin: 0 }}>No expense claims yet</p>
                  {!isAdminOrHr && onAddExpense && (
                    <button onClick={() => { onAddExpense(trip.requestId); onClose(); }}
                      style={{ marginTop: 12, padding: "8px 18px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Submit Expense
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ padding: "12px 16px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#166534" }}>{expenses.length} claim{expenses.length > 1 ? "s" : ""}</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>Total ₹{totalExpense.toLocaleString("en-IN")}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {expenses.map(claim => (
                      <div key={claim.claimId} style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{claim.category}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>{claim.claimCode} · {fmtDate(claim.expenseDate)}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>₹{claim.amount.toLocaleString("en-IN")}</span>
                            <Badge status={claim.status} map={EXPENSE_STATUS_COLORS} />
                          </div>
                        </div>
                        {claim.description && <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>{claim.description}</p>}
                        <BillLink billPath={claim.billPath ?? null} billFileName={claim.billFileName ?? null} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div>
              <SectionHead icon="📜" title="Approval History" />
              {loadingApv ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading history…</div>
              ) : approvals.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No approval records found.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {approvals.map(h => (
                    <div key={h.approvalId} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid #f8fafc" }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, marginTop: 4, background: h.action === "Approved" ? "#22c55e" : "#ef4444" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: h.action === "Approved" ? "#15803d" : "#b91c1c" }}>{h.action}</span>
                          <span style={{ fontSize: 12, color: "#64748b" }}>by <strong style={{ color: "#0f172a" }}>{h.approverName}</strong></span>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmtDateLong(h.actionAt)}</span>
                        </div>
                        {h.comments && <p style={{ fontSize: 12, color: "#64748b", fontStyle: "italic", margin: "4px 0 0" }}>"{h.comments}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1.5px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
          {!isAdminOrHr && trip.status === "Approved" && onAddExpense && (
            <button onClick={() => { onAddExpense(trip.requestId); onClose(); }}
              style={{ padding: "8px 20px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              + Add Expense
            </button>
          )}
          <button onClick={onClose} style={{ padding: "8px 22px", background: "#f1f5f9", color: "#64748b", border: "1.5px solid #e2e8f0", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}