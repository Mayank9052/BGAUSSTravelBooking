// src/pages/dashboard/DashboardPage.tsx

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import type { NotificationBellProps } from "../../components/layout/CommonNavbar";
import { bookingService } from "../../services/bookingService";
import { expenseService } from "../../services/expenseService";
import { approvalService } from "../../services/approvalService";
import type { ApprovalSummary } from "../../services/approvalService";
import { notificationService, buildNotificationConnection } from "../../services/notificationService";
import { get, put } from "../../services/apiClient";
import type {
  TravelRequestResponse, ExpenseSummaryResponse, ExpenseClaimResponse,
  NotificationResponse, ApprovalResponse,
} from "../../services/apiClient";
import type { HubConnection } from "@microsoft/signalr";
import { HubConnectionState } from "@microsoft/signalr";

import TravelRequestDetailModal from "../../components/travel/TravelRequestDetailModal";
import ProfileEditModal from "../../components/layout/ProfileEditModal";

import styles from "./DashboardPage.module.css";

// ── useCurrentCity ────────────────────────────────────────────────────────────
export function useCurrentCity(): string {
  const [city, setCity] = useState<string>(() => localStorage.getItem("user_city") ?? "");
  useEffect(() => {
    if (localStorage.getItem("user_city")) return;
    let cancelled = false;
    const saveCity = (name: string) => {
      if (cancelled || !name.trim()) return;
      setCity(name);
      localStorage.setItem("user_city", name);
    };
    const tryIP = async (): Promise<void> => {
      try {
        const res = await fetch("https://ipapi.co/json/", { headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const d = await res.json() as { city?: string; error?: boolean };
        if (d.error || !d.city) return;
        saveCity(d.city);
      } catch { /* silent */ }
    };
    const tryGPS = () => {
      const isSecure = window.isSecureContext || window.location.hostname === "localhost";
      if (!isSecure || !navigator.geolocation) return false;
      navigator.geolocation.getCurrentPosition(
        async pos => {
          if (cancelled) return;
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&zoom=10&addressdetails=1`,
              { headers: { "Accept-Language": "en", "User-Agent": "BGauss-Travel/1.0" } }
            );
            if (!res.ok) throw new Error("Nominatim error");
            const data = await res.json() as { address?: { city?: string; town?: string; village?: string; county?: string; state?: string } };
            const addr = data.address;
            const name = addr?.city ?? addr?.town ?? addr?.village ?? addr?.county ?? addr?.state ?? "";
            if (name) { saveCity(name); return; }
            void tryIP();
          } catch { void tryIP(); }
        },
        () => void tryIP(),
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
      );
      return true;
    };
    if (!tryGPS()) void tryIP();
    return () => { cancelled = true; };
  }, []);
  return city;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TRANSPORT_ICONS: Record<string, string> = {
  Flight: "✈️", Train: "🚆", Cab: "🚕", Hotel: "🏨", Multiple: "🗺️", Bus: "🚌",
};
const STATUS_COLORS: Record<string, string> = {
  Draft: styles.statusDraft, Submitted: styles.statusSubmitted,
  UnderReview: styles.statusReview, Approved: styles.statusApproved,
  Rejected: styles.statusRejected, Reimbursed: styles.statusReimbursed,
};
const expenseBadgeStyle = (status: string): React.CSSProperties => ({
  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
  background: status === "Approved" ? "#dcfce7" : status === "Rejected" ? "#fee2e2" : status === "Reimbursed" ? "#ede9fe" : "#fef3c7",
  color: status === "Approved" ? "#15803d" : status === "Rejected" ? "#b91c1c" : status === "Reimbursed" ? "#6d28d9" : "#92400e",
});
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return d; }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolveBillUrl(billPath: string | null): string | null {
  if (!billPath) return null;
  return billPath;
}
async function downloadBill(url: string, filename: string) {
  try {
    const token = localStorage.getItem("jwt_token") ?? "";
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(blobUrl);
  } catch (err) { alert(`Download failed: ${err instanceof Error ? err.message : String(err)}`); }
}

function BillCell({ billPath, billFileName }: { billPath: string | null; billFileName: string | null }) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  if (!billPath) return <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>⚠ No bill</span>;
  const resolvedUrl = resolveBillUrl(billPath)!;
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(billPath) && !imgError;
  const isPdf   = /\.pdf$/i.test(billPath);
  const label   = billFileName ? (billFileName.length > 18 ? billFileName.slice(0, 18) + "…" : billFileName) : (isPdf ? "View PDF" : "View Bill");
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); setDownloading(true);
    await downloadBill(resolvedUrl, billFileName ?? (isPdf ? "bill.pdf" : "bill.png"));
    setDownloading(false);
  };
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <a href={resolvedUrl} target="_blank" rel="noreferrer"
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
        {isPdf ? "📄" : "🖼️"} {label}
      </a>
      <button onClick={e => void handleDownload(e)} disabled={downloading}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 6, background: downloading ? "#bfdbfe" : "#f1f5f9", border: "1px solid #e2e8f0", color: downloading ? "#3b82f6" : "#64748b", cursor: downloading ? "not-allowed" : "pointer", fontSize: 13 }}>
        {downloading ? "…" : "⬇"}
      </button>
      {hovered && isImage && (
        <div style={{ position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.18)", padding: 8, pointerEvents: "none", width: 200 }}>
          <img src={resolvedUrl} alt={billFileName ?? "Bill"} onError={() => setImgError(true)} style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

function MiniBarChart({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 28, marginTop: 8 }}>
      {data.map((v, i) => <div key={i} style={{ flex: 1, background: color, opacity: 0.15 + 0.7 * (v / max), borderRadius: "2px 2px 0 0", height: `${Math.max(10, (v / max) * 100)}%`, transition: "height 0.3s" }} />)}
    </div>
  );
}

function ApprovalHistoryDrawer({ requestId, histories, loadingId }: { requestId: number; histories: Record<number, ApprovalResponse[]>; loadingId: number | null }) {
  if (loadingId === requestId) return <div style={{ padding: "8px 0", fontSize: 12, color: "#94a3b8" }}>Loading…</div>;
  const rows = histories[requestId];
  if (!rows || rows.length === 0) return <div style={{ padding: "8px 0", fontSize: 12, color: "#94a3b8" }}>No approval records.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {rows.map(h => (
        <div key={h.approvalId} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "5px 0", fontSize: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: h.action === "Approved" ? "#22c55e" : "#ef4444" }} />
          <span style={{ fontWeight: 700, color: h.action === "Approved" ? "#15803d" : "#b91c1c" }}>{h.action}</span>
          <span style={{ color: "#64748b" }}>by <strong style={{ color: "#0f172a" }}>{h.approverName}</strong></span>
          <span style={{ color: "#94a3b8" }}>{fmtDate(h.actionAt)}</span>
          {h.comments && <span style={{ color: "#64748b", fontStyle: "italic" }}>— "{h.comments}"</span>}
        </div>
      ))}
    </div>
  );
}

function TripExpensePanel({ requestId, navigate }: { requestId: number; navigate: NavigateFunction }) {
  const [claims, setClaims] = useState<ExpenseClaimResponse[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    expenseService.getMy(undefined, requestId).then(setClaims).catch(() => setClaims([])).finally(() => setLoading(false));
  }, [requestId]);
  if (loading) return <div style={{ padding: "10px 0", fontSize: 12, color: "#94a3b8" }}>Loading expenses…</div>;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          🧾 Expense Claims ({claims?.length ?? 0})
        </span>
        <button onClick={() => navigate(`/expense/submit?requestId=${requestId}`)}
          style={{ padding: "4px 12px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          + Add Expense
        </button>
      </div>
      {(!claims || claims.length === 0) ? (
        <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#94a3b8", border: "1px dashed #e2e8f0" }}>
          No expense claims yet. Click "Add Expense" to submit one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {claims.map(claim => (
            <div key={claim.claimId} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 12 }}>{claim.category}</div>
                <div style={{ color: "#94a3b8", fontSize: 11 }}>{claim.claimCode} · {fmtDate(claim.expenseDate)}</div>
              </div>
              <div style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>₹{claim.amount.toLocaleString("en-IN")}</div>
              <span style={expenseBadgeStyle(claim.status)}>{claim.status}</span>
              <BillCell billPath={claim.billPath} billFileName={claim.billFileName} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpenseTable({ expenses, expActionId, onAction }: { expenses: ExpenseClaimResponse[]; expActionId: number | null; onAction: (claimId: number, action: "approve" | "reject" | "reimburse") => void }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
            {["Code","Employee","Category","Amount","Date","Bill","Status","Actions"].map(h => (
              <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#64748b", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {expenses.map(exp => (
            <tr key={exp.claimId} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "10px 12px", fontWeight: 600, color: "#0f172a" }}>{exp.claimCode}</td>
              <td style={{ padding: "10px 12px", color: "#334155" }}>{exp.employeeName}</td>
              <td style={{ padding: "10px 12px", color: "#334155" }}>{exp.category}</td>
              <td style={{ padding: "10px 12px", fontWeight: 700, color: "#0f172a" }}>₹{exp.amount.toLocaleString("en-IN")}{exp.currency !== "INR" && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 4 }}>{exp.currency}</span>}</td>
              <td style={{ padding: "10px 12px", color: "#64748b" }}>{fmtDate(exp.expenseDate)}</td>
              <td style={{ padding: "10px 12px" }}><BillCell billPath={exp.billPath} billFileName={exp.billFileName} /></td>
              <td style={{ padding: "10px 12px" }}><span style={expenseBadgeStyle(exp.status)}>{exp.status}</span></td>
              <td style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {exp.status === "Submitted" && (<>
                    <button disabled={expActionId === exp.claimId} onClick={() => onAction(exp.claimId, "approve")} style={{ padding: "4px 10px", background: expActionId === exp.claimId ? "#86efac" : "#22c55e", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{expActionId === exp.claimId ? "…" : "Approve"}</button>
                    <button disabled={expActionId === exp.claimId} onClick={() => onAction(exp.claimId, "reject")} style={{ padding: "4px 10px", background: expActionId === exp.claimId ? "#fca5a5" : "#ef4444", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{expActionId === exp.claimId ? "…" : "Reject"}</button>
                  </>)}
                  {exp.status === "Approved" && <button disabled={expActionId === exp.claimId} onClick={() => onAction(exp.claimId, "reimburse")} style={{ padding: "4px 10px", background: expActionId === exp.claimId ? "#c4b5fd" : "#8b5cf6", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{expActionId === exp.claimId ? "…" : "Reimburse"}</button>}
                  {(exp.status === "Rejected" || exp.status === "Reimbursed") && <span style={{ fontSize: 11, color: "#94a3b8" }}>—</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusDonut({ approved, pending, rejected, total }: { approved: number; pending: number; rejected: number; total: number }) {
  if (total === 0) return null;
  const pct = (n: number) => Math.round((n / total) * 100);
  const segments = [{ label: "Approved", value: approved, color: "#22c55e" }, { label: "Pending", value: pending, color: "#f59e0b" }, { label: "Rejected", value: rejected, color: "#ef4444" }].filter(s => s.value > 0);
  let cumulative = 0;
  const gradientParts = segments.map(s => { const start = cumulative; cumulative += pct(s.value); return `${s.color} ${start}% ${cumulative}%`; });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 24px", background: "#f8fafc", borderRadius: 12, margin: "0 0 16px" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: `conic-gradient(${gradientParts.join(", ")})`, flexShrink: 0, boxShadow: "inset 0 0 0 16px #f8fafc" }} />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {segments.map(s => <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} /><span style={{ fontSize: 12, color: "#64748b" }}>{s.label}: <strong style={{ color: "#0f172a" }}>{s.value}</strong> <span style={{ color: "#94a3b8" }}>({pct(s.value)}%)</span></span></div>)}
      </div>
    </div>
  );
}

function AnalyticsPreviewCard({ approvedCount, pendingCount, rejectedCount, navigate }: { approvedCount: number; pendingCount: number; rejectedCount: number; navigate: NavigateFunction }) {
  const total = approvedCount + pendingCount + rejectedCount || 1;
  const bars = [{ label: "Approved", value: approvedCount, color: "#22c55e" }, { label: "Pending", value: pendingCount, color: "#f59e0b" }, { label: "Rejected", value: rejectedCount, color: "#ef4444" }];
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div><p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>Request Overview</p><h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", margin: "3px 0 0" }}>Approval Analytics</h3></div>
        <button onClick={() => navigate("/reports")} style={{ padding: "7px 14px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>📊 Full Reports →</button>
      </div>
      <div style={{ display: "flex", gap: 6, height: 60, alignItems: "flex-end", marginBottom: 8 }}>
        {bars.map(b => <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 700, color: b.color }}>{b.value}</span><div style={{ width: "100%", background: b.color, opacity: 0.85, borderRadius: "3px 3px 0 0", height: `${Math.max(8, (b.value / total) * 52)}px`, transition: "height 0.4s" }} /></div>)}
      </div>
      <div style={{ display: "flex", gap: 14 }}>{bars.map(b => <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />{b.label}</div>)}</div>
    </div>
  );
}

// ── Travel Policy ─────────────────────────────────────────────────────────────
interface PolicyConfig { maxFlightAmount: number; maxHotelPerNight: number; maxCabAmount: number; maxTrainAmount: number; requireReceiptAbove: number; advanceBookingDays: number; autoApproveBelow: number; allowedCategories: string[] }
const DEFAULT_POLICY: PolicyConfig = { maxFlightAmount: 15000, maxHotelPerNight: 5000, maxCabAmount: 2000, maxTrainAmount: 3000, requireReceiptAbove: 500, advanceBookingDays: 3, autoApproveBelow: 1000, allowedCategories: ["Flight", "Train", "Cab", "Hotel", "Meal", "Other"] };
function TravelPolicyConfig() {
  const [policy, setPolicy] = useState<PolicyConfig>(DEFAULT_POLICY);
  const [saved, setSaved] = useState(false);
  const update = (key: keyof PolicyConfig, value: number) => { setPolicy(prev => ({ ...prev, [key]: value })); setSaved(false); };
  const toggleCategory = (cat: string) => { setPolicy(prev => ({ ...prev, allowedCategories: prev.allowedCategories.includes(cat) ? prev.allowedCategories.filter(c => c !== cat) : [...prev.allowedCategories, cat] })); setSaved(false); };
  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 3000); };
  const field = (label: string, key: keyof PolicyConfig, prefix = "₹") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "8px 12px" }}>
        {prefix && <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>{prefix}</span>}
        <input type="number" value={policy[key] as number} onChange={e => update(key, Number(e.target.value))} style={{ flex: 1, border: "none", background: "transparent", fontSize: 14, fontWeight: 700, color: "#0f172a", outline: "none" }} />
      </div>
    </div>
  );
  const CATS = ["Flight", "Train", "Cab", "Hotel", "Meal", "Other"];
  return (
    <div>
      <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><h3 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0 }}>Travel Policy Configuration</h3><p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>Set expense limits, approval thresholds, and booking rules.</p></div>
        <button onClick={handleSave} style={{ padding: "8px 20px", background: saved ? "#22c55e" : "#0f172a", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{saved ? "✓ Saved!" : "Save Policy"}</button>
      </div>
      <div style={{ padding: "20px 24px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>💰 Expense Limits per Trip</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>{field("Max Flight Amount", "maxFlightAmount")}{field("Max Hotel / Night", "maxHotelPerNight")}{field("Max Cab Amount", "maxCabAmount")}{field("Max Train Amount", "maxTrainAmount")}</div>
      </div>
      <div style={{ margin: "0 24px", borderTop: "1.5px solid #f1f5f9" }} />
      <div style={{ padding: "20px 24px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>📋 Approval & Booking Rules</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>{field("Receipt Required Above", "requireReceiptAbove")}{field("Auto-Approve Below", "autoApproveBelow")}{field("Advance Booking (days)", "advanceBookingDays", "")}</div>
      </div>
      <div style={{ margin: "0 24px", borderTop: "1.5px solid #f1f5f9" }} />
      <div style={{ padding: "20px 24px 28px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>🚗 Allowed Travel Categories</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {CATS.map(cat => { const active = policy.allowedCategories.includes(cat); return <button key={cat} onClick={() => toggleCategory(cat)} style={{ padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: active ? "#0f172a" : "#f1f5f9", color: active ? "#fff" : "#64748b", transition: "all 0.15s" }}>{active ? "✓ " : ""}{cat}</button>; })}
        </div>
      </div>
    </div>
  );
}

// ── StatFilter type ───────────────────────────────────────────────────────────
type StatFilter = "all" | "Approved" | "Pending" | "Reimbursed" | "PendingApprovals" | "Rejected";

// ── TripCardWithHistory — defined OUTSIDE DashboardPage to prevent remount ───
interface TripCardProps {
  r: TravelRequestResponse;
  showEmployee?: boolean;
  showApproveButtons?: boolean;
  isAdminOrHr: boolean;
  actionId: number | null;
  expandedTripId: number | null;
  expandedExpenseTripId: number | null;
  tripHistories: Record<number, ApprovalResponse[]>;
  historyLoadingId: number | null;
  onSetDetail: (r: TravelRequestResponse) => void;
  onApproveRequest: (id: number, action: "approve" | "reject") => void;
  onToggleHistory: (id: number) => void;
  onToggleExpenses: (id: number) => void;
  navigate: NavigateFunction;
}

function TripCardWithHistory({
  r, showEmployee = false, showApproveButtons = false,
  isAdminOrHr, actionId, expandedTripId, expandedExpenseTripId,
  tripHistories, historyLoadingId,
  onSetDetail, onApproveRequest, onToggleHistory, onToggleExpenses, navigate,
}: TripCardProps) {
  const isExpanded         = expandedTripId === r.requestId;
  const isExpensesExpanded = !isAdminOrHr && expandedExpenseTripId === r.requestId;
  const isDone             = r.status === "Approved" || r.status === "Rejected";

  return (
    <div
      className={styles.tripCard}
      style={{ flexDirection: "column", gap: 0, cursor: "pointer", transition: "box-shadow 0.18s, transform 0.12s" }}
      onClick={() => onSetDetail(r)}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(15,23,42,0.13)";
        (e.currentTarget as HTMLDivElement).style.transform  = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "";
        (e.currentTarget as HTMLDivElement).style.transform  = "";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div className={styles.tripIcon}>{TRANSPORT_ICONS[r.transportType] ?? "🚗"}</div>
        <div className={styles.tripInfo} style={{ flex: 1 }}>
          <div className={styles.tripDest}>{r.destination}</div>
          <div className={styles.tripCode}>{r.requestCode}{showEmployee && r.employeeName ? ` · ${r.employeeName}` : ""}</div>
          <div className={styles.tripDates}>{fmtDate(r.departureDate)} → {fmtDate(r.returnDate)}</div>
          {r.originAddress && !isAdminOrHr && (
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>📍 {r.originAddress.length > 60 ? r.originAddress.slice(0, 60) + "…" : r.originAddress}</div>
          )}
        </div>
        <div className={styles.tripRight} style={{ alignItems: "flex-end", gap: 6 }}>
          <span className={`${styles.statusBadge} ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</span>
          {r.estimatedAmount != null && <div className={styles.tripAmount}>₹{r.estimatedAmount.toLocaleString("en-IN")}</div>}

          {showApproveButtons && (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => onApproveRequest(r.requestId, "approve")} disabled={actionId === r.requestId}
                style={{ padding: "5px 12px", background: actionId === r.requestId ? "#86efac" : "#22c55e", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                {actionId === r.requestId ? "…" : "Approve"}
              </button>
              <button onClick={() => onApproveRequest(r.requestId, "reject")} disabled={actionId === r.requestId}
                style={{ padding: "5px 12px", background: actionId === r.requestId ? "#fca5a5" : "#ef4444", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                {actionId === r.requestId ? "…" : "Reject"}
              </button>
            </div>
          )}

          {!isAdminOrHr && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginTop: 4 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => onToggleExpenses(r.requestId)}
                style={{ fontSize: 10, fontWeight: 700, cursor: "pointer", border: "none", background: isExpensesExpanded ? "#0f172a" : "#f1f5f9", color: isExpensesExpanded ? "#fff" : "#3b82f6", borderRadius: 6, padding: "3px 10px" }}>
                {isExpensesExpanded ? "▲ hide expenses" : "🧾 expenses & bills"}
              </button>
              {isDone && (
                <button onClick={() => onToggleHistory(r.requestId)}
                  style={{ fontSize: 10, color: "#64748b", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                  {isExpanded ? "▲ hide history" : "▼ approval history"}
                </button>
              )}
            </div>
          )}

          {isAdminOrHr && isDone && (
            <button onClick={e => { e.stopPropagation(); onToggleHistory(r.requestId); }}
              style={{ fontSize: 10, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0, marginTop: 2 }}>
              {isExpanded ? "▲ hide" : "▼ who actioned"}
            </button>
          )}
        </div>
      </div>

      {!isAdminOrHr && isExpensesExpanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }} onClick={e => e.stopPropagation()}>
          <TripExpensePanel requestId={r.requestId} navigate={navigate} />
        </div>
      )}

      {isDone && isExpanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9", paddingLeft: isAdminOrHr ? 54 : 0 }} onClick={e => e.stopPropagation()}>
          <ApprovalHistoryDrawer requestId={r.requestId} histories={tripHistories} loadingId={historyLoadingId} />
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 10, color: "#94a3b8", fontWeight: 600, textAlign: "right" }}>
        Click to view full details →
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  // ✅ FIX 1: Use NavigateFunction type — no cast needed
  const navigate: NavigateFunction = useNavigate();

  // ✅ FIX 2: Destructure from result variable so TypeScript resolves the type correctly
  const msalLoginResult = useMsalLogin();
  const signOut = msalLoginResult.signOut;

  const fullName   = localStorage.getItem("full_name")     ?? "Employee";
  const role       = localStorage.getItem("role")          ?? "Employee";
  const email      = localStorage.getItem("email")         ?? "";
  const department = localStorage.getItem("department")    ?? "";
  const empCode    = localStorage.getItem("employee_code") ?? "";
  const initials   = fullName.trim().split(" ").filter(Boolean).map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const normalizedRole = role.toLowerCase();
  const isAdminOrHr    = normalizedRole === "admin" || normalizedRole === "hr";
  const currentCity    = useCurrentCity();

  // ── State ──────────────────────────────────────────────────────────────────
  const [trips,                 setTrips]                 = useState<TravelRequestResponse[]>([]);
  const [allAdminTrips,         setAllAdminTrips]         = useState<TravelRequestResponse[]>([]);
  const [summary,               setSummary]               = useState<ExpenseSummaryResponse | null>(null);
  const [freshNotifs,           setFreshNotifs]           = useState<NotificationResponse[]>([]);
  const [allNotifs,             setAllNotifs]             = useState<NotificationResponse[]>([]);
  const [unreadCount,           setUnreadCount]           = useState(0);
  const [showNotifDrop,         setShowNotifDrop]         = useState(false);
  const [pendingReqs,           setPendingReqs]           = useState<TravelRequestResponse[]>([]);
  const [resolvedReqs,          setResolvedReqs]          = useState<TravelRequestResponse[]>([]);
  const [allExpenses,           setAllExpenses]           = useState<ExpenseClaimResponse[]>([]);
  const [loading,               setLoading]               = useState(true);
  const [activeTab,             setActiveTab]             = useState<"trips" | "expenses" | "approvals" | "policy">("trips");
  const [actionId,              setActionId]              = useState<number | null>(null);
  const [expActionId,           setExpActionId]           = useState<number | null>(null);
  const [approvalSummary,       setApprovalSummary]       = useState<ApprovalSummary | null>(null);
  const [approvalSubTab,        setApprovalSubTab]        = useState<"pending" | "history">("pending");
  const [historyKind,           setHistoryKind]           = useState<"requests" | "expenses">("requests");
  const [expandedTripId,        setExpandedTripId]        = useState<number | null>(null);
  const [tripHistories,         setTripHistories]         = useState<Record<number, ApprovalResponse[]>>({});
  const [historyLoadingId,      setHistoryLoadingId]      = useState<number | null>(null);
  const [liveToast,             setLiveToast]             = useState<{ title: string; msg: string; type: "info" | "success" | "warn" } | null>(null);
  const [expandedExpenseTripId, setExpandedExpenseTripId] = useState<number | null>(null);
  const [detailTrip,            setDetailTrip]            = useState<TravelRequestResponse | null>(null);
  const [showProfileModal,      setShowProfileModal]      = useState(false);
  const [statusFilter,          setStatusFilter]          = useState<StatFilter | null>(null);

  const hasFetched = useRef(false);
  const signalRRef = useRef<HubConnection | null>(null);
  const mountedRef = useRef(true);

  // ── Data loading ────────────────────────────────────────────────────────────
  // ✅ FIX 3: Redirect to login if token missing; hoist pendingList so admin
  //    allAdminTrips is always correctly merged regardless of settle order.
  const loadDashboard = useCallback(async (showLoader = true) => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    if (showLoader) setLoading(true);
    try {
      // ✅ Sync employee profile from API so all localStorage fields are always fresh.
      // This ensures TravelRequestOptionsPage disabled fields always show correct values
      // (designation, reportingManager, contactNumber) without needing a manual update first.
      const employeeId = localStorage.getItem("employee_id");
      if (employeeId) {
        try {
          const profile = await get<{
            employeeId?: number; employeeCode?: string; fullName?: string;
            department?: string; designation?: string; reportingManager?: string;
            contactNumber?: string; email?: string; role?: string;
          }>(`/Employee/${employeeId}`);
          if (profile) {
            if (profile.fullName)         localStorage.setItem("full_name",         profile.fullName);
            if (profile.department)       localStorage.setItem("department",        profile.department);
            if (profile.designation)      localStorage.setItem("designation",       profile.designation);
            if (profile.reportingManager) localStorage.setItem("reporting_manager", profile.reportingManager);
            if (profile.contactNumber)    localStorage.setItem("contact_number",    profile.contactNumber);
            if (profile.email)            localStorage.setItem("email",             profile.email);
            if (profile.role)             localStorage.setItem("role",              profile.role);
            if (profile.employeeCode)     localStorage.setItem("employee_code",     profile.employeeCode);
          }
        } catch { /* profile sync failed — use existing localStorage as fallback */ }
      }

      const [trRes, sumRes, notifRes] = await Promise.allSettled([
        bookingService.getMy(),
        expenseService.summary(),
        notificationService.getAll(false),
      ]);
      if (!mountedRef.current) return;

      if (trRes.status === "fulfilled") {
        console.log("[Dashboard] trips fetched:", trRes.value);
        setTrips(trRes.value);
      } else {
        console.error("[Dashboard] trips fetch failed:", trRes.reason);
      }
      if (sumRes.status   === "fulfilled") setSummary(sumRes.value);
      if (notifRes.status === "fulfilled") {
        const items = notifRes.value.items ?? [];
        setFreshNotifs(items.filter(n => !n.isRead));
        setAllNotifs(items);
        setUnreadCount(notifRes.value.unreadCount);
      }

      if (isAdminOrHr) {
        const [pendingRes, approvalSumRes, expRes] = await Promise.allSettled([
          approvalService.pending(),
          approvalService.summary(),
          get<{ total: number; items: ExpenseClaimResponse[] }>("/Expense?pageSize=50"),
        ]);
        if (!mountedRef.current) return;

        // ✅ FIX 4: Hoist pendingList so it is available when building allAdminTrips
        let pendingList: TravelRequestResponse[] = [];
        if (pendingRes.status === "fulfilled") {
          pendingList = pendingRes.value.pendingRequests ?? [];
          setPendingReqs(pendingList);
        }

        if (approvalSumRes.status === "fulfilled") {
          setApprovalSummary(approvalSumRes.value);
          const resolved: TravelRequestResponse[] = (approvalSumRes.value as any).resolvedRequests ?? [];
          setResolvedReqs(resolved);
          // ✅ Use hoisted pendingList — not a re-read of pendingRes which may be rejected
          setAllAdminTrips([...pendingList, ...resolved]);
        }

        if (expRes.status === "fulfilled") setAllExpenses(expRes.value.items ?? []);
      }
    } catch { /* silent */ }
    finally { if (showLoader && mountedRef.current) setLoading(false); }
  }, [isAdminOrHr, navigate]);

  useEffect(() => {
    mountedRef.current = true;

    const tryInit = () => {
      const token = localStorage.getItem("jwt_token");
      if (!token) { navigate("/login", { replace: true }); return; }
      // ✅ FIX 5: Don't block if hasFetched is true but trips are empty — allow one retry
      if (hasFetched.current) return;
      hasFetched.current = true;
      void loadDashboard();

      const conn = buildNotificationConnection();
      signalRRef.current = conn;
      conn.on("ReceiveNotification", (notif: NotificationResponse) => {
        if (!mountedRef.current) return;
        setFreshNotifs(prev => [notif, ...prev]);
        setAllNotifs(prev => [notif, ...prev]);
        setUnreadCount(c => c + 1);
        const toastType = notif.title?.includes("Approved") ? "success" : notif.title?.includes("Rejected") ? "warn" : "info";
        setLiveToast({ title: notif.title ?? "Update", msg: notif.message, type: toastType });
        setTimeout(() => setLiveToast(null), 5000);
        if (["TravelRequest", "ExpenseClaim", "Reimbursement"].includes(notif.type ?? "")) {
          void loadDashboard(false);
          if (notif.requestId) setTripHistories(prev => { const n = { ...prev }; delete n[notif.requestId!]; return n; });
        }
      });
      conn.start().catch(err => console.warn("[SignalR] Could not connect:", err instanceof Error ? err.message : err));
    };

    tryInit();

    // ✅ FIX 6: Also listen for auth-ready in case MSAL redirect completes after mount
    const onAuthReady = () => {
      if (!hasFetched.current) {
        tryInit();
      } else {
        // Token just arrived — re-fetch data even if hasFetched is true
        void loadDashboard(false);
      }
    };
    window.addEventListener("app:auth-ready", onAuthReady);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("app:auth-ready", onAuthReady);
      const conn = signalRRef.current;
      if (conn && conn.state !== HubConnectionState.Disconnected) void conn.stop();
      signalRRef.current = null;
    };
  }, [loadDashboard, navigate]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleMarkRead = async (id: number) => {
    try {
      await notificationService.markRead(id);
      setFreshNotifs(prev => prev.filter(n => n.notificationId !== id));
      setAllNotifs(prev => prev.map(n => n.notificationId === id ? { ...n, isRead: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setFreshNotifs([]);
      setAllNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  const handleApproveRequest = async (requestId: number, action: "approve" | "reject") => {
    setActionId(requestId);
    try {
      await approvalService.actionOnRequest(requestId, { action });
      setPendingReqs(prev => prev.filter(r => r.requestId !== requestId));
      void loadDashboard(false);
    } catch (err) { alert(`Action failed: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setActionId(null); }
  };

  const handleExpenseAction = async (claimId: number, action: "approve" | "reject" | "reimburse") => {
    setExpActionId(claimId);
    try {
      if (action === "reimburse") { await put<unknown>(`/Expense/${claimId}/reimburse`); }
      else { await put<unknown>(`/Expense/${claimId}/approve`, { action }); }
      void loadDashboard(false);
    } catch (err) { alert(`Action failed: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setExpActionId(null); }
  };

  const handleToggleHistory = async (requestId: number) => {
    if (expandedTripId === requestId) { setExpandedTripId(null); return; }
    setExpandedTripId(requestId);
    if (tripHistories[requestId]) return;
    setHistoryLoadingId(requestId);
    try { const hist = await approvalService.history(requestId); setTripHistories(prev => ({ ...prev, [requestId]: hist })); }
    catch { setTripHistories(prev => ({ ...prev, [requestId]: [] })); }
    finally { setHistoryLoadingId(null); }
  };

  const handleToggleExpenses = (requestId: number) => {
    setExpandedExpenseTripId(prev => prev === requestId ? null : requestId);
  };

  // ── Shared props for TripCardWithHistory ───────────────────────────────────
  const cardProps = {
    isAdminOrHr,
    actionId,
    expandedTripId,
    expandedExpenseTripId,
    tripHistories,
    historyLoadingId,
    onSetDetail:      setDetailTrip,
    onApproveRequest: handleApproveRequest,
    onToggleHistory:  handleToggleHistory,
    onToggleExpenses: handleToggleExpenses,
    navigate,
  };

  // ── Notification bell prop ─────────────────────────────────────────────────
  const notificationBellProp: NotificationBellProps = {
    notifications:    freshNotifs.map(n => ({ notificationId: n.notificationId, title: n.title, message: n.message, isRead: n.isRead, createdAt: n.createdAt })),
    allNotifications: allNotifs.map(n => ({ notificationId: n.notificationId, title: n.title, message: n.message, isRead: n.isRead, createdAt: n.createdAt })),
    unreadCount, showDrop: showNotifDrop,
    onToggle:      () => setShowNotifDrop(v => !v),
    onMarkRead:    (id) => void handleMarkRead(id),
    onMarkAllRead: () => void handleMarkAllRead(),
    onClose:       () => setShowNotifDrop(false),
  };

  // ── Nav items ──────────────────────────────────────────────────────────────
  const navItems = [
    { id: "trips",    label: isAdminOrHr ? "All Trips" : "My Trips", active: activeTab === "trips",    onClick: () => setActiveTab("trips") },
    { id: "expenses", label: "Expenses",                              active: activeTab === "expenses", onClick: () => setActiveTab("expenses") },
    ...(isAdminOrHr ? [
      { id: "approvals", label: `Approvals${pendingReqs.length > 0 ? ` (${pendingReqs.length})` : ""}`, active: activeTab === "approvals", onClick: () => setActiveTab("approvals") },
      { id: "policy",    label: "Travel Policy", active: activeTab === "policy", onClick: () => setActiveTab("policy") },
    ] : []),
  ];

  // ── Stat card data ─────────────────────────────────────────────────────────
  const approvedCount   = approvalSummary?.approvedCount    ?? 0;
  const pendingCount    = approvalSummary?.pendingApprovals ?? 0;
  const rejectedCount   = approvalSummary?.rejectedCount    ?? 0;
  const totalTrips      = approvedCount + pendingCount + rejectedCount;
  const myApprovedCount = trips.filter(t => t.status === "Approved").length;
  const myPendingCount  = trips.filter(t => t.status === "Submitted" || t.status === "UnderReview").length;

  const employeeStatCards: { label: string; value: string; color: string; icon: string; chart: number[]; filter: StatFilter; action?: () => void }[] = [
    { label: "Total Trips",   value: loading ? "—" : String(trips.length),        color: styles.statBlue,   icon: "✈️", chart: trips.length > 0 ? [1, 2, trips.length] : [], filter: "all" },
    { label: "Approved",      value: loading ? "—" : String(myApprovedCount),      color: styles.statGreen,  icon: "✅", chart: myApprovedCount > 0 ? [myApprovedCount] : [],   filter: "Approved" },
    { label: "Pending Trips", value: loading ? "—" : String(myPendingCount),       color: styles.statAmber,  icon: "⏳", chart: [],                                             filter: "Pending" },
    { label: "Reimbursed",    value: loading ? "—" : `₹${((summary?.totalReimbursed ?? 0) / 1000).toFixed(1)}K`, color: styles.statPurple, icon: "💰", chart: [], filter: "Reimbursed" },
  ];

  const adminStatCards: { label: string; value: string; color: string; icon: string; chart: number[]; filter: StatFilter; action?: () => void }[] = [
    { label: "Pending Approvals", value: loading || !approvalSummary ? "—" : String(approvalSummary.pendingApprovals), color: styles.statAmber,  icon: "⏳", chart: [pendingCount],  filter: "PendingApprovals" },
    { label: "Approved Trips",    value: loading || !approvalSummary ? "—" : String(approvalSummary.approvedCount),    color: styles.statGreen,  icon: "✅", chart: [approvedCount], filter: "Approved" },
    { label: "Rejected Trips",    value: loading || !approvalSummary ? "—" : String(approvalSummary.rejectedCount),    color: styles.statBlue,   icon: "❌", chart: [rejectedCount], filter: "Rejected" },
    {
      label: "Expense Pipeline",
      value: loading || !approvalSummary ? "—" : `₹${((approvalSummary.expensePipeline ?? 0) / 1000).toFixed(1)}K`,
      color: styles.statPurple, icon: "💰", chart: [], filter: "all",
      action: () => setActiveTab("expenses"),
    },
  ];

  const statCards: { label: string; value: string; color: string; icon: string; chart: number[]; filter: StatFilter; action?: () => void }[] = isAdminOrHr ? adminStatCards : employeeStatCards;
  const pendingExpenses  = allExpenses.filter(e => e.status === "Submitted");
  const resolvedExpenses = allExpenses.filter(e => e.status !== "Submitted");

  const tripSource = isAdminOrHr ? allAdminTrips : trips;

  const visibleTrips = !statusFilter || statusFilter === "all"
    ? tripSource
    : statusFilter === "Pending" || statusFilter === "PendingApprovals"
      ? tripSource.filter(t => t.status === "Submitted" || t.status === "UnderReview")
      : tripSource.filter(t => t.status === statusFilter);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <CommonNavbar
        navItems={navItems}
        locationDisplay={currentCity || undefined}
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={async () => { await signOut(); }}
        notificationBell={notificationBellProp}
        onAvatarClick={() => setShowProfileModal(true)}
      />

      {showProfileModal && (
        <ProfileEditModal initials={initials} onClose={() => setShowProfileModal(false)} />
      )}

      {detailTrip && (
        <TravelRequestDetailModal
          trip={detailTrip}
          isAdminOrHr={isAdminOrHr}
          onClose={() => setDetailTrip(null)}
          onAddExpense={(id: number) => navigate(`/expense/submit?requestId=${id}`)}
        />
      )}

      {liveToast && (
        <div style={{ position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)", background: liveToast.type === "success" ? "#15803d" : liveToast.type === "warn" ? "#b91c1c" : "#0f172a", color: "#fff", borderRadius: 12, padding: "12px 20px", fontSize: 13, fontWeight: 600, zIndex: 800, boxShadow: "0 8px 32px rgba(0,0,0,0.25)", display: "flex", alignItems: "flex-start", gap: 10, maxWidth: 380 }}>
          <span style={{ fontSize: 18 }}>{liveToast.type === "success" ? "✅" : liveToast.type === "warn" ? "❌" : "🔔"}</span>
          <div><div style={{ fontWeight: 700 }}>{liveToast.title}</div><div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{liveToast.msg}</div></div>
          <button onClick={() => setLiveToast(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 16, padding: 0, opacity: 0.7 }}>✕</button>
        </div>
      )}

      <main className={styles.main}>
        {/* Welcome banner */}
        <div className={styles.welcomeBanner}>
          <div className={styles.welcomeText}>
            <h1 className={styles.welcomeH1}>{isAdminOrHr ? `Welcome, ${fullName.split(" ")[0]} 🛡️` : `Good day, ${fullName.split(" ")[0]} 👋`}</h1>
            <p className={styles.welcomeSub}>{email} · {department} · {empCode}</p>
          </div>
          <div className={styles.welcomeActions}>
            {!isAdminOrHr && (<>
              <button className={styles.btnPrimary}   onClick={() => navigate("/booking/new")}>+ New Travel Request</button>
              <button className={styles.btnSecondary} onClick={() => navigate("/expense/submit")}>Submit Expense</button>
            </>)}
            {isAdminOrHr && <button className={styles.btnPrimary} onClick={() => navigate("/reports")}>📊 View Reports</button>}
          </div>
        </div>

        {isAdminOrHr && !loading && totalTrips > 0 && <StatusDonut approved={approvedCount} pending={pendingCount} rejected={rejectedCount} total={totalTrips} />}
        {isAdminOrHr && !loading && totalTrips > 0 && <AnalyticsPreviewCard approvedCount={approvedCount} pendingCount={pendingCount} rejectedCount={rejectedCount} navigate={navigate} />}

        {/* Stat cards */}
        <div className={styles.statsRow}>
          {statCards.map(s => {
            const isActive = statusFilter === s.filter && s.filter !== "all";
            return (
              <div
                key={s.label}
                className={`${styles.statCard} ${s.color}`}
                onClick={() => {
                  if ("action" in s && s.action) { s.action(); return; }
                  setStatusFilter(prev => (prev === s.filter || s.filter === "all") ? null : s.filter);
                  if (s.filter !== "all") setActiveTab("trips");
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(15,23,42,0.15)";
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLDivElement).style.transform = "";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "";
                  }
                }}
                role="button"
                tabIndex={0}
                title={
                  "action" in s && s.action
                    ? "View expense claims"
                    : s.filter === "all" ? "Show all trips" : `Filter trips: ${s.label}`
                }
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    if ("action" in s && s.action) { s.action(); return; }
                    setStatusFilter(prev => (prev === s.filter || s.filter === "all") ? null : s.filter);
                    if (s.filter !== "all") setActiveTab("trips");
                  }
                }}
                style={{
                  cursor: "pointer", position: "relative",
                  transition: "transform 0.15s, box-shadow 0.15s, outline 0.1s",
                  outline:   isActive ? "2.5px solid #0f172a"            : "none",
                  transform: isActive ? "translateY(-3px)"               : undefined,
                  boxShadow: isActive ? "0 6px 20px rgba(15,23,42,0.18)" : undefined,
                }}
              >
                {isActive && (
                  <div style={{ position: "absolute", top: 6, right: 8, fontSize: 9, fontWeight: 800, color: "#0f172a", background: "rgba(255,255,255,0.8)", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.03em" }}>
                    filtered ✕
                  </div>
                )}
                <div className={styles.statIcon}>{s.icon}</div>
                <div className={styles.statValue}>{s.value}</div>
                <div className={styles.statLabel}>{s.label}</div>
                {s.chart.length > 0 && (
                  <MiniBarChart
                    data={s.chart}
                    color={
                      s.color.includes("Green")  ? "#22c55e" :
                      s.color.includes("Amber")  ? "#f59e0b" :
                      s.color.includes("Purple") ? "#8b5cf6" : "#3b82f6"
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* TRIPS */}
        {activeTab === "trips" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{isAdminOrHr ? "All Travel Requests" : "My Travel Requests"}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {statusFilter && statusFilter !== "all" && (
                  <button onClick={() => setStatusFilter(null)}
                    style={{ padding: "3px 12px", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {statusFilter === "Pending" || statusFilter === "PendingApprovals" ? "Pending" : statusFilter} ✕ clear
                  </button>
                )}
                <span style={{ fontSize: 12, fontWeight: 700, background: "#f1f5f9", color: "#64748b", borderRadius: 20, padding: "3px 12px" }}>
                  {visibleTrips.length}{statusFilter && statusFilter !== "all" ? ` / ${tripSource.length}` : ""}
                </span>
              </div>
            </div>

            {!isAdminOrHr && !loading && trips.length > 0 && (
              <div style={{ margin: "0 0 12px", padding: "8px 16px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe", fontSize: 12, color: "#1e40af" }}>
                💡 <strong>Click any card</strong> to see full trip details, expenses and approval history.
                {!statusFilter && " Or click a stat card above to filter by status."}
              </div>
            )}

            {loading ? (
              <div className={styles.loadingRow}>{[1, 2, 3].map(i => <div key={i} className={styles.skeleton} />)}</div>
            ) : visibleTrips.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>{statusFilter ? "🔍" : "✈️"}</div>
                <p className={styles.emptyTitle}>
                  {statusFilter && statusFilter !== "all"
                    ? `No ${statusFilter === "Pending" || statusFilter === "PendingApprovals" ? "pending" : statusFilter.toLowerCase()} trips`
                    : "No travel requests yet"}
                </p>
                <p className={styles.emptySub}>
                  {statusFilter && statusFilter !== "all"
                    ? <button onClick={() => setStatusFilter(null)} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontWeight: 700, fontSize: 12, padding: 0 }}>Clear filter to see all trips</button>
                    : isAdminOrHr ? "Employee requests will appear here." : "Create your first request to get started"
                  }
                </p>
                {!statusFilter && !isAdminOrHr && (
                  <button className={styles.btnPrimary} style={{ marginTop: 12 }} onClick={() => navigate("/booking/new")}>+ New Request</button>
                )}
              </div>
            ) : (
              <div className={styles.tripsList}>
                {visibleTrips.map(r => (
                  <TripCardWithHistory key={r.requestId} r={r} showEmployee={isAdminOrHr} {...cardProps} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* EXPENSES */}
        {activeTab === "expenses" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{isAdminOrHr ? "Expense Claims — All Employees" : "Expense Claims"}</h2>
              {!isAdminOrHr && <button className={styles.btnOutline} onClick={() => navigate("/expense/submit")}>+ Submit Expense</button>}
            </div>
            {!isAdminOrHr && (<>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12, padding: "20px 24px" }}>
                {[
                  { label: "Pending",    val: summary?.pendingCount    ?? 0, amt: summary?.totalPending    ?? 0, color: "#f59e0b" },
                  { label: "Approved",   val: summary?.approvedCount   ?? 0, amt: summary?.totalApproved   ?? 0, color: "#22c55e" },
                  { label: "Rejected",   val: summary?.rejectedCount   ?? 0, amt: 0,                            color: "#ef4444" },
                  { label: "Reimbursed", val: summary?.reimbursedCount ?? 0, amt: summary?.totalReimbursed ?? 0, color: "#8b5cf6" },
                ].map(e => (
                  <div key={e.label} style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${e.color}22` }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: e.color }}>{e.val}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>{e.label}</div>
                    {e.amt > 0 && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>₹{(e.amt / 1000).toFixed(1)}K</div>}
                  </div>
                ))}
              </div>
              <div className={styles.emptyState} style={{ paddingTop: 16, paddingBottom: 32 }}>
                <div className={styles.emptyIcon}>🧾</div>
                <p className={styles.emptyTitle}>Expense history</p>
                <p className={styles.emptySub}>Upload bills and track reimbursements.</p>
                <button className={styles.btnPrimary} style={{ marginTop: 12 }} onClick={() => navigate("/expense/submit")}>Submit New Expense</button>
              </div>
            </>)}
            {isAdminOrHr && (<>
              <div style={{ padding: "16px 24px 0" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>⏳ Awaiting Approval ({pendingExpenses.length})</p>
                {pendingExpenses.length === 0
                  ? <div style={{ padding: "16px 0", color: "#94a3b8", fontSize: 13 }}>No pending expense claims.</div>
                  : <ExpenseTable expenses={pendingExpenses} expActionId={expActionId} onAction={handleExpenseAction} />}
              </div>
              <div style={{ margin: "20px 24px", borderTop: "1.5px solid #f1f5f9" }} />
              <div style={{ padding: "0 24px 24px" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>📋 All Claims ({allExpenses.length})</p>
                {allExpenses.length === 0
                  ? <div style={{ padding: "16px 0", color: "#94a3b8", fontSize: 13 }}>No expense claims yet.</div>
                  : <ExpenseTable expenses={allExpenses} expActionId={expActionId} onAction={handleExpenseAction} />}
              </div>
            </>)}
          </div>
        )}

        {/* APPROVALS */}
        {activeTab === "approvals" && isAdminOrHr && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Approvals</h2>
              <div style={{ display: "flex", gap: 6 }}>
                {(["pending", "history"] as const).map(tab => (
                  <button key={tab} onClick={() => setApprovalSubTab(tab)}
                    style={{ padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: approvalSubTab === tab ? "#0f172a" : "#f1f5f9", color: approvalSubTab === tab ? "#fff" : "#64748b" }}>
                    {tab === "pending" ? `Pending${pendingReqs.length > 0 ? ` (${pendingReqs.length})` : ""}` : "History"}
                  </button>
                ))}
              </div>
            </div>
            {approvalSubTab === "pending" && (
              pendingReqs.length === 0
                ? <div className={styles.emptyState}><div className={styles.emptyIcon}>✅</div><p className={styles.emptyTitle}>All caught up!</p><p className={styles.emptySub}>No pending travel request approvals.</p></div>
                : <div className={styles.tripsList}>
                    {pendingReqs.map(r => (
                      <TripCardWithHistory key={r.requestId} r={r} showEmployee showApproveButtons {...cardProps} />
                    ))}
                  </div>
            )}
            {approvalSubTab === "history" && (<>
              <div style={{ display: "flex", gap: 6, padding: "0 24px 16px" }}>
                {(["requests", "expenses"] as const).map(k => (
                  <button key={k} onClick={() => setHistoryKind(k)}
                    style={{ padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: historyKind === k ? "#3b82f6" : "#f1f5f9", color: historyKind === k ? "#fff" : "#64748b" }}>
                    {k === "requests" ? `✈️ Travel Requests (${resolvedReqs.length})` : `🧾 Expense Claims (${resolvedExpenses.length})`}
                  </button>
                ))}
              </div>
              {historyKind === "requests" && (resolvedReqs.length === 0
                ? <div className={styles.emptyState}><div className={styles.emptyIcon}>📋</div><p className={styles.emptyTitle}>No history yet</p></div>
                : <div className={styles.tripsList}>
                    {resolvedReqs.map(r => (
                      <TripCardWithHistory key={r.requestId} r={r} showEmployee {...cardProps} />
                    ))}
                  </div>
              )}
              {historyKind === "expenses" && (resolvedExpenses.length === 0
                ? <div className={styles.emptyState}><div className={styles.emptyIcon}>🧾</div><p className={styles.emptyTitle}>No expense history yet</p></div>
                : <div style={{ padding: "0 24px 24px" }}><ExpenseTable expenses={resolvedExpenses} expActionId={expActionId} onAction={handleExpenseAction} /></div>
              )}
            </>)}
          </div>
        )}

        {/* POLICY */}
        {activeTab === "policy" && isAdminOrHr && (
          <div className={styles.section}><TravelPolicyConfig /></div>
        )}

        {/* Quick Actions */}
        <div className={styles.quickActions}>
          <h2 className={styles.sectionTitle}>Quick Actions</h2>
          <div className={styles.quickGrid}>
            {(isAdminOrHr ? [
              { icon: "📊", label: "View Reports",  sub: "Analytics & insights", path: "/reports" },
              { icon: "🛡️", label: "Travel Policy", sub: "Limits & rules",        action: () => setActiveTab("policy") },
              { icon: "👤", label: "My Profile",    sub: "Account details",       action: () => setShowProfileModal(true) },
            ] : [
              { icon: "✈️", label: "Book Travel",    sub: "New travel request",   path: "/booking/new" },
              { icon: "🧾", label: "Submit Expense", sub: "Upload a bill",         path: "/expense/submit" },
              { icon: "📊", label: "View Reports",   sub: "Download reports",      path: "/reports" },
              { icon: "👤", label: "My Profile",     sub: "Account details",       action: () => setShowProfileModal(true) },
            ]).map(qa => (
              <div key={qa.label} className={styles.quickCard}
                onClick={() => {
                  if ("action" in qa && qa.action) { qa.action(); }
                  else if ("path" in qa && qa.path) { navigate(qa.path); }
                }}
                role="button" tabIndex={0}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if ("action" in qa && qa.action) { qa.action(); }
                    else if ("path" in qa && qa.path) { navigate(qa.path); }
                  }
                }}>
                <span className={styles.quickIcon}>{qa.icon}</span>
                <span className={styles.quickLabel}>{qa.label}</span>
                <span className={styles.quickSub}>{qa.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
