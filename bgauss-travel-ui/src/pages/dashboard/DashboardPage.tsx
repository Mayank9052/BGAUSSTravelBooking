// src/pages/dashboard/DashboardPage.tsx

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { bookingService } from "../../services/bookingService";
import { expenseService } from "../../services/expenseService";
import { approvalService } from "../../services/approvalService";
import type { ApprovalSummary } from "../../services/approvalService";
import { notificationService, buildNotificationConnection } from "../../services/notificationService";
import { get, put } from "../../services/apiClient";
import { useState as useStateLocal } from "react";
import type {
  TravelRequestResponse,
  ExpenseSummaryResponse,
  ExpenseClaimResponse,
  NotificationResponse,
  ApprovalResponse,
} from "../../services/apiClient";
import type { HubConnection } from "@microsoft/signalr";
import styles from "./DashboardPage.module.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const TRANSPORT_ICONS: Record<string, string> = {
  Flight: "✈️", Train: "🚆", Cab: "🚕", Hotel: "🏨", Multiple: "🗺️",
};

const STATUS_COLORS: Record<string, string> = {
  Draft:       styles.statusDraft,
  Submitted:   styles.statusSubmitted,
  UnderReview: styles.statusReview,
  Approved:    styles.statusApproved,
  Rejected:    styles.statusRejected,
  Reimbursed:  styles.statusReimbursed,
};

// Inline badge style helper — used in admin expense table & history
const expenseBadgeStyle = (status: string): React.CSSProperties => ({
  padding: "3px 10px",
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 700,
  background:
    status === "Approved"   ? "#dcfce7" :
    status === "Rejected"   ? "#fee2e2" :
    status === "Reimbursed" ? "#ede9fe" : "#fef3c7",
  color:
    status === "Approved"   ? "#15803d" :
    status === "Rejected"   ? "#b91c1c" :
    status === "Reimbursed" ? "#6d28d9" : "#92400e",
});

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "2-digit",
    });
  } catch { return d; }
};

const fmtAmount = (amt: number, currency = "INR") =>
  `₹${amt.toLocaleString("en-IN")}${currency !== "INR" ? ` ${currency}` : ""}`;


// ── Bill cell with hover preview & download ─────────────────────────────────
function BillCell({ billPath, billFileName }: { billPath: string | null; billFileName: string | null }) {
  const [hovered, setHovered] = useState(false);

  if (!billPath) {
    return <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>⚠ No bill</span>;
  }

  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(billPath);
  const label   = billFileName
    ? billFileName.length > 18 ? billFileName.slice(0, 18) + "…" : billFileName
    : "View Bill";

  // Build absolute URL — bill path is like /uploads/bills/xxx.jpg
  const fullUrl = billPath.startsWith("http") ? billPath : `${window.location.origin}${billPath}`;

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>

      {/* ── View link with hover ── */}
      <a
        href={fullUrl}
        target="_blank"
        rel="noreferrer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          fontSize: 11, color: "#3b82f6", fontWeight: 600,
          textDecoration: "none", whiteSpace: "nowrap",
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
        📎 {label}
      </a>

      {/* ── Download button ── */}
      <a
        href={fullUrl}
        download={billFileName ?? "bill"}
        title="Download bill"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, borderRadius: 6,
          background: "#f1f5f9", border: "1px solid #e2e8f0",
          color: "#64748b", textDecoration: "none", fontSize: 12,
          flexShrink: 0, transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "#dbeafe")}
        onMouseLeave={e => (e.currentTarget.style.background = "#f1f5f9")}>
        ⬇
      </a>

      {/* ── Hover preview tooltip — only for images ── */}
      {hovered && isImage && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 10px)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 999,
          background: "#fff",
          border: "1.5px solid #e2e8f0",
          borderRadius: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
          padding: 8,
          pointerEvents: "none",
          width: 200,
        }}>
          {/* Arrow */}
          <div style={{
            position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "8px solid #e2e8f0",
          }} />
          <div style={{
            position: "absolute", bottom: -7, left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderTop: "7px solid #fff",
          }} />
          <img
            src={fullUrl}
            alt={billFileName ?? "Bill"}
            style={{
              width: "100%", height: 160, objectFit: "cover",
              borderRadius: 8, display: "block",
            }}
          />
          <p style={{
            margin: "6px 0 0", fontSize: 10, color: "#64748b",
            textAlign: "center", overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {billFileName ?? "Bill"}
          </p>
        </div>
      )}

      {/* ── For PDF: show a tooltip label instead of image ── */}
      {hovered && !isImage && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 10px)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 999,
          background: "#0f172a",
          color: "#fff",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}>
          📄 {billFileName ?? "PDF Document"} — click to view
          <div style={{
            position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "6px solid #0f172a",
          }} />
        </div>
      )}
    </div>
  );
}

// ── Approval history drawer (travel requests) ─────────────────────────────────

function ApprovalHistoryDrawer({
  requestId, histories, loadingId,
}: {
  requestId: number;
  histories: Record<number, ApprovalResponse[]>;
  loadingId: number | null;
}) {
  if (loadingId === requestId)
    return <div style={{ padding: "8px 0", fontSize: 12, color: "#94a3b8" }}>Loading approval history…</div>;
  const rows = histories[requestId];
  if (!rows || rows.length === 0)
    return <div style={{ padding: "8px 0", fontSize: 12, color: "#94a3b8" }}>No approval records found.</div>;
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const { signOut } = useMsalLogin();

  const fullName   = localStorage.getItem("full_name")     ?? "Employee";
  const role       = localStorage.getItem("role")          ?? "Employee";
  const email      = localStorage.getItem("email")         ?? "";
  const department = localStorage.getItem("department")    ?? "";
  const empCode    = localStorage.getItem("employee_code") ?? "";
  const initials   = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const normalizedRole = role.toLowerCase();
  const isAdminOrHr    = normalizedRole === "admin" || normalizedRole === "hr";

  // ── State ──────────────────────────────────────────────────────────────────
  const [trips,           setTrips]           = useState<TravelRequestResponse[]>([]);
  const [summary,         setSummary]         = useState<ExpenseSummaryResponse | null>(null);
  const [notifications,   setNotifications]   = useState<NotificationResponse[]>([]);
  const [unreadCount,     setUnreadCount]     = useState(0);
  const [showNotifDrop,   setShowNotifDrop]   = useState(false);
  const [pendingReqs,     setPendingReqs]     = useState<TravelRequestResponse[]>([]);
  const [resolvedReqs,    setResolvedReqs]    = useState<TravelRequestResponse[]>([]);
  const [allExpenses,     setAllExpenses]     = useState<ExpenseClaimResponse[]>([]);   // Admin: ALL claims
  const [loading,         setLoading]         = useState(true);
  const [activeTab,       setActiveTab]       = useState<"trips" | "expenses" | "approvals">("trips");
  const [actionId,        setActionId]        = useState<number | null>(null);
  const [expActionId,     setExpActionId]     = useState<number | null>(null);         // expense row action
  const [approvalSummary, setApprovalSummary] = useState<ApprovalSummary | null>(null);

  // Approvals sub-tabs & expandable history
  const [approvalSubTab,   setApprovalSubTab]   = useState<"pending" | "history">("pending");
  const [historyKind,      setHistoryKind]      = useState<"requests" | "expenses">("requests"); // ← NEW
  const [expandedTripId,   setExpandedTripId]   = useState<number | null>(null);
  const [tripHistories,    setTripHistories]    = useState<Record<number, ApprovalResponse[]>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState<number | null>(null);
  const [liveToast,        setLiveToast]        = useState<string | null>(null);

  const hasFetched   = useRef(false);
  const notifDropRef = useRef<HTMLDivElement>(null);
  const signalRRef   = useRef<HubConnection | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [trRes, sumRes, notifRes] = await Promise.allSettled([
        bookingService.getMy(),
        expenseService.summary(),
        notificationService.getAll(false),
      ]);
      if (trRes.status    === "fulfilled") setTrips(trRes.value);
      if (sumRes.status   === "fulfilled") setSummary(sumRes.value);
      if (notifRes.status === "fulfilled") {
        setNotifications(notifRes.value.items);
        setUnreadCount(notifRes.value.unreadCount);
      }

      if (isAdminOrHr) {
        const [pendingRes, approvalSumRes, expRes] = await Promise.allSettled([
          approvalService.pending(),
          approvalService.summary(),
          // Fetch ALL expense claims for the admin expenses tab
          get<{ total: number; items: ExpenseClaimResponse[] }>("/Expense?pageSize=50"),
        ]);

        if (pendingRes.status === "fulfilled") {
          setPendingReqs(pendingRes.value.pendingRequests ?? []);
        }

        if (approvalSumRes.status === "fulfilled") {
          setApprovalSummary(approvalSumRes.value);
          // resolvedRequests is embedded in the summary response
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setResolvedReqs((approvalSumRes.value as any).resolvedRequests ?? []);
        }

        if (expRes.status === "fulfilled") {
          setAllExpenses(expRes.value.items ?? []);
        }
      }
    } catch { /* silent */ }
    finally { if (showLoader) setLoading(false); }
  }, [isAdminOrHr]);

  useEffect(() => {
    if (!localStorage.getItem("jwt_token")) { navigate("/login", { replace: true }); return; }
    if (hasFetched.current) return;
    hasFetched.current = true;
    void loadDashboard();
  }, [loadDashboard, navigate]);

  // ── SignalR ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!localStorage.getItem("jwt_token")) return;
    const conn = buildNotificationConnection();
    signalRRef.current = conn;
    conn.on("ReceiveNotification", (notif: NotificationResponse) => {
      setNotifications(prev => [notif, ...prev]);
      setUnreadCount(c => c + 1);
      if (notif.type === "TravelRequest" || notif.type === "ExpenseClaim") {
        void loadDashboard(false);
        if (notif.requestId) {
          setTripHistories(prev => { const n = { ...prev }; delete n[notif.requestId!]; return n; });
        }
        setLiveToast(notif.title ?? "Update received");
        setTimeout(() => setLiveToast(null), 4000);
      }
    });
    conn.start().catch(() => { /* SignalR unavailable */ });
    return () => { void conn.stop(); signalRRef.current = null; };
  }, [loadDashboard]);

  // ── Close notif dropdown ───────────────────────────────────────────────────
  useEffect(() => {
    if (!showNotifDrop) return;
    const close = (e: MouseEvent) => {
      if (notifDropRef.current && !notifDropRef.current.contains(e.target as Node))
        setShowNotifDrop(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", close), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", close); };
  }, [showNotifDrop]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleMarkRead = async (id: number) => {
    try {
      await notificationService.markRead(id);
      setNotifications(prev => prev.map(n => n.notificationId === id ? { ...n, isRead: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  const handleApproveRequest = async (requestId: number, action: "approve" | "reject") => {
    setActionId(requestId);
    try {
      await approvalService.actionOnRequest(requestId, { action });
      setPendingReqs(prev => prev.filter(r => r.requestId !== requestId));
      void loadDashboard(false);
    } catch (err) {
      alert(`Action failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setActionId(null); }
  };

  // Admin: approve / reject / reimburse an expense claim
  const handleExpenseAction = async (claimId: number, action: "approve" | "reject" | "reimburse") => {
    setExpActionId(claimId);
    try {
      if (action === "reimburse") {
        await put<unknown>(`/Expense/${claimId}/reimburse`);
      } else {
        await put<unknown>(`/Expense/${claimId}/approve`, { action });
      }
      void loadDashboard(false);
    } catch (err) {
      alert(`Action failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setExpActionId(null); }
  };

  const handleToggleHistory = async (requestId: number) => {
    if (expandedTripId === requestId) { setExpandedTripId(null); return; }
    setExpandedTripId(requestId);
    if (tripHistories[requestId]) return;
    setHistoryLoadingId(requestId);
    try {
      const hist = await approvalService.history(requestId);
      setTripHistories(prev => ({ ...prev, [requestId]: hist }));
    } catch {
      setTripHistories(prev => ({ ...prev, [requestId]: [] }));
    } finally { setHistoryLoadingId(null); }
  };

  // ── Nav items ──────────────────────────────────────────────────────────────
  const navItems = [
    { id: "trips",    label: "My Trips",  active: activeTab === "trips",    onClick: () => setActiveTab("trips") },
    { id: "expenses", label: "Expenses",  active: activeTab === "expenses", onClick: () => setActiveTab("expenses") },
    ...(isAdminOrHr
      ? [{ id: "approvals", label: `Approvals${pendingReqs.length > 0 ? ` (${pendingReqs.length})` : ""}`, active: activeTab === "approvals", onClick: () => setActiveTab("approvals") }]
      : []),
  ];

  // ── Shared expandable trip card ────────────────────────────────────────────
  const TripCardWithHistory = ({
    r, showEmployee = false, showApproveButtons = false,
  }: {
    r: TravelRequestResponse;
    showEmployee?: boolean;
    showApproveButtons?: boolean;
  }) => {
    const isExpanded = expandedTripId === r.requestId;
    const isDone     = r.status === "Approved" || r.status === "Rejected";
    return (
      <div className={styles.tripCard} style={{ flexDirection: "column", alignItems: "stretch", gap: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div className={styles.tripIcon}>{TRANSPORT_ICONS[r.transportType] ?? "🚗"}</div>
          <div className={styles.tripInfo} style={{ flex: 1 }}>
            <div className={styles.tripDest}>{r.destination}</div>
            <div className={styles.tripCode}>
              {r.requestCode}{showEmployee && r.employeeName ? ` · ${r.employeeName}` : ""}
            </div>
            <div className={styles.tripDates}>{fmtDate(r.departureDate)} → {fmtDate(r.returnDate)}</div>
          </div>
          <div className={styles.tripRight} style={{ alignItems: "flex-end", gap: 6 }}>
            <span className={`${styles.statusBadge} ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</span>
            {r.estimatedAmount != null && (
              <div className={styles.tripAmount}>₹{r.estimatedAmount.toLocaleString("en-IN")}</div>
            )}
            {showApproveButtons && (
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button
                  onClick={e => { e.stopPropagation(); void handleApproveRequest(r.requestId, "approve"); }}
                  disabled={actionId === r.requestId}
                  style={{ padding: "5px 12px", background: actionId === r.requestId ? "#86efac" : "#22c55e", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: actionId === r.requestId ? "not-allowed" : "pointer" }}>
                  {actionId === r.requestId ? "…" : "Approve"}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); void handleApproveRequest(r.requestId, "reject"); }}
                  disabled={actionId === r.requestId}
                  style={{ padding: "5px 12px", background: actionId === r.requestId ? "#fca5a5" : "#ef4444", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: actionId === r.requestId ? "not-allowed" : "pointer" }}>
                  {actionId === r.requestId ? "…" : "Reject"}
                </button>
              </div>
            )}
            {isDone && (
              <button
                onClick={() => void handleToggleHistory(r.requestId)}
                style={{ fontSize: 10, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontWeight: 600, marginTop: 2 }}>
                {isExpanded ? "▲ hide" : "▼ who actioned"}
              </button>
            )}
          </div>
        </div>
        {isDone && isExpanded && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9", paddingLeft: 44 }}>
            <ApprovalHistoryDrawer requestId={r.requestId} histories={tripHistories} loadingId={historyLoadingId} />
          </div>
        )}
      </div>
    );
  };

  // ── Stat cards ─────────────────────────────────────────────────────────────
  // Employee: personal counts from their own trips + expense summary
  const employeeStatCards = [
    { label: "Total Trips",    value: loading ? "—" : String(trips.length),                                        color: styles.statBlue,   icon: "✈️" },
    { label: "Approved",       value: loading ? "—" : String(trips.filter(t => t.status === "Approved").length),   color: styles.statGreen,  icon: "✅" },
    { label: "Pending Claims", value: loading ? "—" : String(summary?.pendingCount ?? 0),                          color: styles.statAmber,  icon: "⏳" },
    { label: "Reimbursed",     value: loading ? "—" : `₹${((summary?.totalReimbursed ?? 0) / 1000).toFixed(1)}K`, color: styles.statPurple, icon: "💰" },
  ];

  // Admin/HR: org-wide counts from backend summary — all employees combined
  const adminStatCards = [
    {
      label: "Pending Approvals",
      value: loading || !approvalSummary ? "—" : String(approvalSummary.pendingApprovals),
      color: styles.statAmber, icon: "⏳",
    },
    {
      label: "Approved Trips",
      value: loading || !approvalSummary ? "—" : String(approvalSummary.approvedCount),
      color: styles.statGreen, icon: "✅",
    },
    {
      label: "Rejected Trips",
      value: loading || !approvalSummary ? "—" : String(approvalSummary.rejectedCount),
      color: styles.statBlue, icon: "❌",
    },
    {
      label: "Expense Pipeline",
      value: loading || !approvalSummary ? "—" : `₹${((approvalSummary.expensePipeline ?? 0) / 1000).toFixed(1)}K`,
      color: styles.statPurple, icon: "💰",
    },
  ];

  const statCards = isAdminOrHr ? adminStatCards : employeeStatCards;

  // Derived expense slices for admin Expenses tab
  const pendingExpenses  = allExpenses.filter(e => e.status === "Submitted");
  const resolvedExpenses = allExpenses.filter(e => e.status !== "Submitted");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      <CommonNavbar
        navItems={navItems}
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={async () => signOut()}
      />

      {/* Live toast */}
      {liveToast && (
        <div style={{
          position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)",
          background: "#0f172a", color: "#fff", borderRadius: 10,
          padding: "10px 20px", fontSize: 13, fontWeight: 600,
          zIndex: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>🔔</span> {liveToast}
        </div>
      )}

      {/* Notification bell */}
      <div ref={notifDropRef} style={{ position: "fixed", top: 14, right: 180, zIndex: 400 }}>
        <button
          onClick={() => setShowNotifDrop(v => !v)}
          title="Notifications"
          style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 8 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unreadCount > 0 && (
            <span style={{ position: "absolute", top: 4, right: 4, width: 16, height: 16, background: "#D83B34", borderRadius: "50%", fontSize: 9, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {showNotifDrop && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, width: 320, background: "#fff", borderRadius: 14, border: "1.5px solid #e5e7eb", boxShadow: "0 12px 40px rgba(0,0,0,0.14)", zIndex: 500, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>Notifications</span>
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} style={{ fontSize: 11, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                  Mark all read
                </button>
              )}
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No notifications</div>
              ) : notifications.map(n => (
                <div
                  key={n.notificationId}
                  onClick={() => void handleMarkRead(n.notificationId)}
                  style={{ padding: "12px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: n.isRead ? "transparent" : "#eff6ff" }}>
                  <div style={{ fontWeight: n.isRead ? 500 : 700, fontSize: 13, color: "#0f172a" }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{n.message}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{fmtDate(n.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <main className={styles.main}>

        {/* Welcome banner */}
        <div className={styles.welcomeBanner}>
          <div className={styles.welcomeText}>
            <h1 className={styles.welcomeH1}>Good day, {fullName.split(" ")[0]} 👋</h1>
            <p className={styles.welcomeSub}>{email} · {department} · {empCode}</p>
          </div>
          <div className={styles.welcomeActions}>
            <button className={styles.btnPrimary}  onClick={() => navigate("/booking/new")}>+ New Travel Request</button>
            <button className={styles.btnSecondary} onClick={() => navigate("/expense/submit")}>Submit Expense</button>
          </div>
        </div>

        {/* Stat cards — employee shows personal, admin shows org-wide */}
        <div className={styles.statsRow}>
          {statCards.map(s => (
            <div key={s.label} className={`${styles.statCard} ${s.color}`}>
              <div className={styles.statIcon}>{s.icon}</div>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ══════════════ MY TRIPS ══════════════ */}
        {activeTab === "trips" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Travel Requests</h2>
              <span style={{ fontSize: 12, fontWeight: 700, background: "#f1f5f9", color: "#64748b", borderRadius: 20, padding: "3px 12px" }}>
                {trips.length}
              </span>
            </div>

            {loading ? (
              <div className={styles.loadingRow}>{[1, 2, 3].map(i => <div key={i} className={styles.skeleton} />)}</div>
            ) : trips.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>✈️</div>
                <p className={styles.emptyTitle}>No travel requests yet</p>
                <p className={styles.emptySub}>Create your first request to get started</p>
                <button className={styles.btnPrimary} style={{ marginTop: 12 }} onClick={() => navigate("/booking/new")}>+ New Request</button>
              </div>
            ) : (
              <div className={styles.tripsList}>
                {trips.map(r => <TripCardWithHistory key={r.requestId} r={r} />)}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ EXPENSES ══════════════ */}
        {activeTab === "expenses" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                {isAdminOrHr ? "Expense Claims — All Employees" : "Expense Claims"}
              </h2>
              {!isAdminOrHr && (
                <button className={styles.btnOutline} onClick={() => navigate("/expense/submit")}>+ Submit Expense</button>
              )}
            </div>

            {/* ── Employee: personal summary cards ── */}
            {!isAdminOrHr && (
              <>
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
              </>
            )}

            {/* ── Admin/HR: pending approvals section + full list with bills ── */}
            {isAdminOrHr && (
              <>
                {/* Pending expense approvals */}
                <div style={{ padding: "16px 24px 0" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                    ⏳ Awaiting Approval ({pendingExpenses.length})
                  </p>
                  {pendingExpenses.length === 0 ? (
                    <div style={{ padding: "16px 0", color: "#94a3b8", fontSize: 13 }}>No pending expense claims.</div>
                  ) : (
                    <ExpenseTable
                      expenses={pendingExpenses}
                      expActionId={expActionId}
                      onAction={handleExpenseAction}
                    />
                  )}
                </div>

                {/* Divider */}
                <div style={{ margin: "20px 24px", borderTop: "1.5px solid #f1f5f9" }} />

                {/* Full claims list */}
                <div style={{ padding: "0 24px 24px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                    📋 All Claims ({allExpenses.length})
                  </p>
                  {allExpenses.length === 0 ? (
                    <div style={{ padding: "16px 0", color: "#94a3b8", fontSize: 13 }}>No expense claims submitted yet.</div>
                  ) : (
                    <ExpenseTable
                      expenses={allExpenses}
                      expActionId={expActionId}
                      onAction={handleExpenseAction}
                      showAll
                    />
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════ APPROVALS (HR/Admin) ══════════════ */}
        {activeTab === "approvals" && isAdminOrHr && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Approvals</h2>
              <div style={{ display: "flex", gap: 6 }}>
                {(["pending", "history"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setApprovalSubTab(tab)}
                    style={{
                      padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                      cursor: "pointer", border: "none",
                      background: approvalSubTab === tab ? "#0f172a" : "#f1f5f9",
                      color:      approvalSubTab === tab ? "#fff"    : "#64748b",
                    }}>
                    {tab === "pending"
                      ? `Pending${pendingReqs.length > 0 ? ` (${pendingReqs.length})` : ""}`
                      : `History`}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Pending: travel requests only ── */}
            {approvalSubTab === "pending" && (
              pendingReqs.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>✅</div>
                  <p className={styles.emptyTitle}>All caught up!</p>
                  <p className={styles.emptySub}>No pending travel request approvals.</p>
                </div>
              ) : (
                <div className={styles.tripsList}>
                  {pendingReqs.map(r => (
                    <TripCardWithHistory key={r.requestId} r={r} showEmployee showApproveButtons />
                  ))}
                </div>
              )
            )}

            {/* ── History: requests + expense claims with kind toggle ── */}
            {approvalSubTab === "history" && (
              <>
                {/* Kind toggle */}
                <div style={{ display: "flex", gap: 6, padding: "0 24px 16px" }}>
                  {(["requests", "expenses"] as const).map(k => (
                    <button
                      key={k}
                      onClick={() => setHistoryKind(k)}
                      style={{
                        padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                        cursor: "pointer", border: "none",
                        background: historyKind === k ? "#3b82f6" : "#f1f5f9",
                        color:      historyKind === k ? "#fff"    : "#64748b",
                      }}>
                      {k === "requests"
                        ? `✈️ Travel Requests (${resolvedReqs.length})`
                        : `🧾 Expense Claims (${resolvedExpenses.length})`}
                    </button>
                  ))}
                </div>

                {/* Travel request history */}
                {historyKind === "requests" && (
                  resolvedReqs.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>📋</div>
                      <p className={styles.emptyTitle}>No travel request history yet</p>
                      <p className={styles.emptySub}>Approved and rejected requests will appear here.</p>
                    </div>
                  ) : (
                    <div className={styles.tripsList}>
                      {resolvedReqs.map(r => (
                        <TripCardWithHistory key={r.requestId} r={r} showEmployee />
                      ))}
                    </div>
                  )
                )}

                {/* Expense claim history */}
                {historyKind === "expenses" && (
                  resolvedExpenses.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>🧾</div>
                      <p className={styles.emptyTitle}>No expense claim history yet</p>
                      <p className={styles.emptySub}>Approved, rejected, and reimbursed claims appear here.</p>
                    </div>
                  ) : (
                    <div style={{ padding: "0 24px 24px" }}>
                      <ExpenseTable
                        expenses={resolvedExpenses}
                        expActionId={expActionId}
                        onAction={handleExpenseAction}
                        showAll
                      />
                    </div>
                  )
                )}
              </>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className={styles.quickActions}>
          <h2 className={styles.sectionTitle}>Quick Actions</h2>
          <div className={styles.quickGrid}>
            {[
              { icon: "✈️", label: "Book Travel",    sub: "New travel request", path: "/booking/new"    },
              { icon: "🧾", label: "Submit Expense", sub: "Upload a bill",      path: "/expense/submit" },
              { icon: "📊", label: "View Reports",   sub: "Download reports",   path: "/reports"        },
              { icon: "👤", label: "My Profile",     sub: "Account details",    path: "/profile"        },
            ].map(qa => (
              <div
                key={qa.label}
                className={styles.quickCard}
                onClick={() => navigate(qa.path)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === "Enter" && navigate(qa.path)}>
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

// ── Reusable expense table ────────────────────────────────────────────────────
// Extracted so it's shared by the Expenses tab (pending + all) and History tab

function ExpenseTable({
  expenses,
  expActionId,
  onAction,
  showAll = false,
}: {
  expenses: ExpenseClaimResponse[];
  expActionId: number | null;
  onAction: (claimId: number, action: "approve" | "reject" | "reimburse") => void;
  showAll?: boolean;
}) {
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); }
    catch { return d ?? "—"; }
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
            {["Code", "Employee", "Category", "Amount", "Expense Date", "Bill", "Status", "Actions"].map(h => (
              <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#64748b", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {expenses.map(exp => (
            <tr key={exp.claimId} style={{ borderBottom: "1px solid #f1f5f9" }}>

              <td style={{ padding: "10px 12px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>
                {exp.claimCode}
              </td>

              <td style={{ padding: "10px 12px", color: "#334155" }}>{exp.employeeName}</td>

              <td style={{ padding: "10px 12px", color: "#334155" }}>{exp.category}</td>

              <td style={{ padding: "10px 12px", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>
                ₹{exp.amount.toLocaleString("en-IN")}
                {exp.currency !== "INR" && (
                  <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 4 }}>{exp.currency}</span>
                )}
              </td>

              <td style={{ padding: "10px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                {fmtDate(exp.expenseDate)}
              </td>

              {/* ── Bill cell with hover preview + download ── */}
              <td style={{ padding: "10px 12px" }}>
                <BillCell billPath={exp.billPath} billFileName={exp.billFileName} />
              </td>

              <td style={{ padding: "10px 12px" }}>
                <span style={expenseBadgeStyle(exp.status)}>{exp.status}</span>
              </td>

              <td style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                  {exp.status === "Submitted" && (
                    <>
                      <button
                        disabled={expActionId === exp.claimId}
                        onClick={() => onAction(exp.claimId, "approve")}
                        style={{ padding: "4px 10px", background: expActionId === exp.claimId ? "#86efac" : "#22c55e", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: expActionId === exp.claimId ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                        {expActionId === exp.claimId ? "…" : "Approve"}
                      </button>
                      <button
                        disabled={expActionId === exp.claimId}
                        onClick={() => onAction(exp.claimId, "reject")}
                        style={{ padding: "4px 10px", background: expActionId === exp.claimId ? "#fca5a5" : "#ef4444", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: expActionId === exp.claimId ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                        {expActionId === exp.claimId ? "…" : "Reject"}
                      </button>
                    </>
                  )}
                  {exp.status === "Approved" && (
                    <button
                      disabled={expActionId === exp.claimId}
                      onClick={() => onAction(exp.claimId, "reimburse")}
                      style={{ padding: "4px 10px", background: expActionId === exp.claimId ? "#c4b5fd" : "#8b5cf6", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: expActionId === exp.claimId ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                      {expActionId === exp.claimId ? "…" : "Reimburse"}
                    </button>
                  )}
                  {(exp.status === "Rejected" || exp.status === "Reimbursed") && (
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>—</span>
                  )}
                </div>
              </td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
