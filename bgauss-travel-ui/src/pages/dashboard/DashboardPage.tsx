// src/pages/dashboard/DashboardPage.tsx

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { bookingService } from "../../services/bookingService";
import { expenseService } from "../../services/expenseService";
import { approvalService } from "../../services/approvalService";
import type { ApprovalSummary } from "../../services/approvalService";           // ← NEW import
import { notificationService, buildNotificationConnection } from "../../services/notificationService";
import type {
  TravelRequestResponse,
  ExpenseSummaryResponse,
  NotificationResponse,
  ApprovalResponse,
} from "../../services/apiClient";
import type { HubConnection } from "@microsoft/signalr";
import styles from "./DashboardPage.module.css";

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

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return d; }
};

// ── Approval history drawer ───────────────────────────────────────────────────
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

  // ── Core data ──────────────────────────────────────────────────────────────
  const [trips,          setTrips]          = useState<TravelRequestResponse[]>([]);
  const [summary,        setSummary]        = useState<ExpenseSummaryResponse | null>(null);
  const [notifications,  setNotifications]  = useState<NotificationResponse[]>([]);
  const [unreadCount,    setUnreadCount]    = useState(0);
  const [showNotifDrop,  setShowNotifDrop]  = useState(false);
  const [pendingReqs,    setPendingReqs]    = useState<TravelRequestResponse[]>([]);
  const [pendingExps,    setPendingExps]    = useState<unknown[]>([]);
  const [resolvedReqs,   setResolvedReqs]   = useState<TravelRequestResponse[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState<"trips" | "expenses" | "approvals">("trips");
  const [actionId,       setActionId]       = useState<number | null>(null);

  // ── NEW: approval summary from backend (replaces client-side counting) ─────
  const [approvalSummary, setApprovalSummary] = useState<ApprovalSummary | null>(null);

  // ── HR/Admin sub-tab ───────────────────────────────────────────────────────
  const [approvalSubTab,   setApprovalSubTab]   = useState<"pending" | "history">("pending");
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
        // Single call returns counts + resolvedRequests — no bookingService.getAllResolved() needed
        const [pendingRes, approvalSumRes] = await Promise.allSettled([
          approvalService.pending(),
          approvalService.summary(),          // ← NEW
        ]);
        if (pendingRes.status === "fulfilled") {
          setPendingReqs(pendingRes.value.pendingRequests ?? []);
          setPendingExps(pendingRes.value.pendingExpenses as unknown[] ?? []);
        }
        if (approvalSumRes.status === "fulfilled") {
          setApprovalSummary(approvalSumRes.value);
          setResolvedReqs(approvalSumRes.value.resolvedRequests ?? []); // ← feeds History tab
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
      if (notif.type === "TravelRequest") {
        void loadDashboard(false);
        if (notif.requestId) {
          setTripHistories(prev => { const n = { ...prev }; delete n[notif.requestId!]; return n; });
        }
        setLiveToast(notif.title ?? "Travel request updated");
        setTimeout(() => setLiveToast(null), 4000);
      }
    });
    conn.start().catch(() => { /* SignalR unavailable — silent */ });
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
            <div className={styles.tripCode}>{r.requestCode}{showEmployee && r.employeeName ? ` · ${r.employeeName}` : ""}</div>
            <div className={styles.tripDates}>{fmtDate(r.departureDate)} → {fmtDate(r.returnDate)}</div>
          </div>
          <div className={styles.tripRight} style={{ alignItems: "flex-end", gap: 6 }}>
            <span className={`${styles.statusBadge} ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</span>
            {r.estimatedAmount != null && (
              <div className={styles.tripAmount}>₹{r.estimatedAmount.toLocaleString("en-IN")}</div>
            )}
            {showApproveButtons && (
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button onClick={e => { e.stopPropagation(); void handleApproveRequest(r.requestId, "approve"); }}
                  disabled={actionId === r.requestId}
                  style={{ padding: "5px 12px", background: actionId === r.requestId ? "#86efac" : "#22c55e", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: actionId === r.requestId ? "not-allowed" : "pointer" }}>
                  {actionId === r.requestId ? "…" : "Approve"}
                </button>
                <button onClick={e => { e.stopPropagation(); void handleApproveRequest(r.requestId, "reject"); }}
                  disabled={actionId === r.requestId}
                  style={{ padding: "5px 12px", background: actionId === r.requestId ? "#fca5a5" : "#ef4444", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: actionId === r.requestId ? "not-allowed" : "pointer" }}>
                  {actionId === r.requestId ? "…" : "Reject"}
                </button>
              </div>
            )}
            {isDone && (
              <button onClick={() => void handleToggleHistory(r.requestId)}
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

  // ── Role-aware stat cards ──────────────────────────────────────────────────
  // Employee: personal trip + expense numbers from bookingService.getMy() + expenseService.summary()
  // HR/Admin: org-wide counts from approvalService.summary() — computed server-side, no client filtering
  const employeeStatCards = [
    { label: "Total Trips",    value: loading ? "—" : String(trips.length),                                        color: styles.statBlue,   icon: "✈️" },
    { label: "Approved",       value: loading ? "—" : String(trips.filter(t => t.status === "Approved").length),   color: styles.statGreen,  icon: "✅" },
    { label: "Pending Claims", value: loading ? "—" : String(summary?.pendingCount ?? 0),                          color: styles.statAmber,  icon: "⏳" },
    { label: "Reimbursed",     value: loading ? "—" : `₹${((summary?.totalReimbursed ?? 0) / 1000).toFixed(1)}K`, color: styles.statPurple, icon: "💰" },
  ];

  // All four numbers come directly from the backend summary — no client-side array filtering
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
      value: loading || !approvalSummary ? "—" : `₹${(approvalSummary.expensePipeline / 1000).toFixed(1)}K`,
      color: styles.statPurple, icon: "💰",
    },
  ];

  const statCards = isAdminOrHr ? adminStatCards : employeeStatCards;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      <CommonNavbar
        navItems={navItems}
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={async () => signOut()}
      />

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

      <div ref={notifDropRef} style={{ position: "fixed", top: 14, right: 180, zIndex: 400 }}>
        <button onClick={() => setShowNotifDrop(v => !v)} title="Notifications"
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
              {unreadCount > 0 && <button onClick={handleMarkAllRead} style={{ fontSize: 11, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Mark all read</button>}
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No notifications</div>
              ) : notifications.map(n => (
                <div key={n.notificationId} onClick={() => void handleMarkRead(n.notificationId)}
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

        {/* ── Stat cards ── */}
        <div className={styles.statsRow}>
          {statCards.map(s => (
            <div key={s.label} className={`${styles.statCard} ${s.color}`}>
              <div className={styles.statIcon}>{s.icon}</div>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* MY TRIPS */}
        {activeTab === "trips" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Travel Requests</h2>
              <span style={{ fontSize: 12, fontWeight: 700, background: "#f1f5f9", color: "#64748b", borderRadius: 20, padding: "3px 12px" }}>{trips.length}</span>
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

        {/* EXPENSES */}
        {activeTab === "expenses" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Expense Claims</h2>
              <button className={styles.btnOutline} onClick={() => navigate("/expense/submit")}>+ Submit Expense</button>
            </div>
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
          </div>
        )}

        {/* APPROVALS (HR/Admin) */}
        {activeTab === "approvals" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Approvals</h2>
              <div style={{ display: "flex", gap: 6 }}>
                {(["pending", "history"] as const).map(tab => (
                  <button key={tab} onClick={() => setApprovalSubTab(tab)}
                    style={{
                      padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                      cursor: "pointer", border: "none",
                      background: approvalSubTab === tab ? "#0f172a" : "#f1f5f9",
                      color:      approvalSubTab === tab ? "#fff"    : "#64748b",
                    }}>
                    {tab === "pending"
                      ? `Pending${pendingReqs.length > 0 ? ` (${pendingReqs.length})` : ""}`
                      : `History${resolvedReqs.length > 0 ? ` (${resolvedReqs.length})` : ""}`}
                  </button>
                ))}
              </div>
            </div>

            {approvalSubTab === "pending" && (
              pendingReqs.length === 0 && pendingExps.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>✅</div>
                  <p className={styles.emptyTitle}>All caught up!</p>
                  <p className={styles.emptySub}>No pending approvals right now.</p>
                </div>
              ) : (
                <div className={styles.tripsList}>
                  {pendingReqs.map(r => (
                    <TripCardWithHistory key={r.requestId} r={r} showEmployee showApproveButtons />
                  ))}
                </div>
              )
            )}

            {approvalSubTab === "history" && (
              resolvedReqs.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📋</div>
                  <p className={styles.emptyTitle}>No history yet</p>
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
              <div key={qa.label} className={styles.quickCard}
                onClick={() => navigate(qa.path)} role="button" tabIndex={0}
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