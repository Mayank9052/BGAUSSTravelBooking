// src/pages/dashboard/DashboardPage.tsx

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { bookingService } from "../../services/bookingService";
import { expenseService } from "../../services/expenseService";
import { approvalService } from "../../services/approvalService";
import { notificationService } from "../../services/notificationService";
import { ApiError } from "../../services/apiClient";  // ✅ import ApiError
import type { TravelRequestResponse, ExpenseSummaryResponse, NotificationResponse } from "../../services/apiClient";
import styles from "./DashboardPage.module.css";

// ── constants ─────────────────────────────────────────────────────────────────
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

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return d; }
};

// ── component ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { signOut } = useMsalLogin();

  // ── session ─────────────────────────────────────────────────────────────────
  const fullName   = localStorage.getItem("full_name")     ?? "Employee";
  const role       = localStorage.getItem("role")          ?? "Employee";
  const email      = localStorage.getItem("email")         ?? "";
  const department = localStorage.getItem("department")    ?? "";
  const empCode    = localStorage.getItem("employee_code") ?? "";
  const initials   = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  // ── state ────────────────────────────────────────────────────────────────────
  const [trips,         setTrips]         = useState<TravelRequestResponse[]>([]);
  const [summary,       setSummary]       = useState<ExpenseSummaryResponse | null>(null);
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [showNotifDrop, setShowNotifDrop] = useState(false);

  // Approvals (HR/Admin)
  const [pendingReqs, setPendingReqs] = useState<TravelRequestResponse[]>([]);
  const [pendingExps, setPendingExps] = useState<unknown[]>([]);

  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<"trips" | "expenses" | "approvals">("trips");

  const redirectedRef = useRef(false);
  const notifDropRef  = useRef<HTMLDivElement>(null);

  // ── load all data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!localStorage.getItem("jwt_token")) { navigate("/login", { replace: true }); return; }
    const ctrl = new AbortController();

    const load = async () => {
      setLoading(true);
      try {
        const [trRes, sumRes, notifRes] = await Promise.allSettled([
          bookingService.getMy(),
          expenseService.summary(),
          notificationService.getAll(false),
        ]);

        if (ctrl.signal.aborted) return;

        if (trRes.status    === "fulfilled") setTrips(trRes.value);
        if (sumRes.status   === "fulfilled") setSummary(sumRes.value);
        if (notifRes.status === "fulfilled") {
          setNotifications(notifRes.value.items);
          setUnreadCount(notifRes.value.unreadCount);
        }

        // ✅ Only redirect on a real 401 ApiError — not network/fetch/CORS errors
        const firstReject = [trRes, sumRes].find(r => r.status === "rejected");
        if (firstReject && !redirectedRef.current) {
          const reason = (firstReject as PromiseRejectedResult).reason;

          if (reason instanceof ApiError && reason.status === 401) {
            redirectedRef.current = true;
            localStorage.clear();
            navigate("/login", { replace: true });
            return;
          }
          // Network down / API not running in dev → stay on dashboard, just log
          console.warn("API unavailable (dev?):", reason?.message);
        }

        // Admin/HR: load approval queue
        if (role === "Admin" || role === "HR") {
          try {
            const pending = await approvalService.pending();
            setPendingReqs(pending.pendingRequests);
            setPendingExps(pending.pendingExpenses as unknown[]);
          } catch { /* HR panel optional */ }
        }

      } catch { /* silent — API may not be running during dev */ }
      finally  { if (!ctrl.signal.aborted) setLoading(false); }
    };

    void load();
    return () => ctrl.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── close notification dropdown on outside click ──────────────────────────
  useEffect(() => {
    if (!showNotifDrop) return;
    const close = (e: MouseEvent) => {
      if (notifDropRef.current && !notifDropRef.current.contains(e.target as Node))
        setShowNotifDrop(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", close), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", close); };
  }, [showNotifDrop]);

  // ── mark notification read ────────────────────────────────────────────────
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

  // ── approve / reject request ──────────────────────────────────────────────
  const handleApproveRequest = async (requestId: number, action: "approve" | "reject") => {
    try {
      await approvalService.actionOnRequest(requestId, { action });
      setPendingReqs(prev => prev.filter(r => r.requestId !== requestId));
    } catch { /* show toast in real app */ }
  };

  const handleLogout = async () => { await signOut(); };

  // ── nav items ─────────────────────────────────────────────────────────────
  const navItems = [
    { id: "trips",    label: "My Trips",  active: activeTab === "trips",    onClick: () => setActiveTab("trips") },
    { id: "expenses", label: "Expenses",  active: activeTab === "expenses", onClick: () => setActiveTab("expenses") },
    ...(role === "HR" || role === "Admin"
      ? [{ id: "approvals", label: `Approvals${pendingReqs.length > 0 ? ` (${pendingReqs.length})` : ""}`, active: activeTab === "approvals", onClick: () => setActiveTab("approvals") }]
      : []),
  ];

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* NAVBAR */}
      <CommonNavbar
        navItems={navItems}
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={handleLogout}
      />

      {/* Notification bell */}
      <div ref={notifDropRef} style={{ position: "fixed", top: 14, right: 180, zIndex: 400 }}>
        <button
          onClick={() => setShowNotifDrop(v => !v)}
          style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 8 }}
          title="Notifications"
        >
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
                <button onClick={handleMarkAllRead} style={{ fontSize: 11, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Mark all read</button>
              )}
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No notifications</div>
              ) : notifications.map(n => (
                <div key={n.notificationId}
                  onClick={() => void handleMarkRead(n.notificationId)}
                  style={{ padding: "12px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: n.isRead ? "transparent" : "#eff6ff", transition: "background 0.1s" }}>
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

        {/* Welcome */}
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

        {/* Stat cards */}
        <div className={styles.statsRow}>
          {[
            { label: "Total Trips",    value: loading ? "—" : String(trips.length),                                     icon: "✈️", color: styles.statBlue   },
            { label: "Pending Claims", value: loading ? "—" : String(summary?.pendingCount ?? 0),                       icon: "⏳", color: styles.statAmber  },
            { label: "Approved",       value: loading ? "—" : `₹${((summary?.totalApproved ?? 0)/1000).toFixed(1)}K`,   icon: "✅", color: styles.statGreen  },
            { label: "Reimbursed",     value: loading ? "—" : `₹${((summary?.totalReimbursed ?? 0)/1000).toFixed(1)}K`, icon: "💰", color: styles.statPurple },
          ].map(s => (
            <div key={s.label} className={`${styles.statCard} ${s.color}`}>
              <div className={styles.statIcon}>{s.icon}</div>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── MY TRIPS tab ─────────────────────────────────────── */}
        {activeTab === "trips" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Travel Requests</h2>
              <span style={{ fontSize: 12, fontWeight: 700, background: "#f1f5f9", color: "#64748b", borderRadius: 20, padding: "3px 12px" }}>{trips.length}</span>
            </div>

            {loading ? (
              <div className={styles.loadingRow}>{[1,2,3].map(i => <div key={i} className={styles.skeleton}/>)}</div>
            ) : trips.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>✈️</div>
                <p className={styles.emptyTitle}>No travel requests yet</p>
                <p className={styles.emptySub}>Create your first request to get started</p>
                <button className={styles.btnPrimary} onClick={() => navigate("/booking/new")}>+ New Request</button>
              </div>
            ) : (
              <div className={styles.tripsList}>
                {trips.map(r => (
                  <div key={r.requestId} className={styles.tripCard}>
                    <div className={styles.tripIcon}>{TRANSPORT_ICONS[r.transportType] ?? "🚗"}</div>
                    <div className={styles.tripInfo}>
                      <div className={styles.tripDest}>{r.destination}</div>
                      <div className={styles.tripCode}>{r.requestCode}</div>
                      <div className={styles.tripDates}>{fmtDate(r.departureDate)} → {fmtDate(r.returnDate)}</div>
                    </div>
                    <div className={styles.tripRight}>
                      <span className={`${styles.statusBadge} ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</span>
                      {r.estimatedAmount != null && (
                        <div className={styles.tripAmount}>₹{r.estimatedAmount.toLocaleString("en-IN")}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EXPENSES tab ──────────────────────────────────────── */}
        {activeTab === "expenses" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Expense Claims</h2>
              <button className={styles.btnOutline} onClick={() => navigate("/expense/submit")}>+ Submit Expense</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Pending",    val: summary?.pendingCount    ?? 0, amt: summary?.totalPending    ?? 0, color: "#f59e0b" },
                { label: "Approved",   val: summary?.approvedCount   ?? 0, amt: summary?.totalApproved   ?? 0, color: "#22c55e" },
                { label: "Rejected",   val: summary?.rejectedCount   ?? 0, amt: 0,                            color: "#ef4444" },
                { label: "Reimbursed", val: summary?.reimbursedCount ?? 0, amt: summary?.totalReimbursed ?? 0, color: "#8b5cf6" },
              ].map(e => (
                <div key={e.label} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${e.color}22` }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: e.color }}>{e.val}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>{e.label}</div>
                  {e.amt > 0 && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>₹{(e.amt/1000).toFixed(1)}K</div>}
                </div>
              ))}
            </div>
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🧾</div>
              <p className={styles.emptyTitle}>Expense history</p>
              <p className={styles.emptySub}>Upload bills and track reimbursements.</p>
              <button className={styles.btnPrimary} onClick={() => navigate("/expense/submit")}>Submit New Expense</button>
            </div>
          </div>
        )}

        {/* ── APPROVALS tab (HR/Admin only) ────────────────────── */}
        {activeTab === "approvals" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Pending Approvals</h2>
              <span style={{ fontSize: 12, fontWeight: 700, background: "#fef2f2", color: "#ef4444", borderRadius: 20, padding: "3px 12px" }}>{pendingReqs.length} travel · {(pendingExps as unknown[]).length} expense</span>
            </div>

            {pendingReqs.length === 0 && (pendingExps as unknown[]).length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>✅</div>
                <p className={styles.emptyTitle}>All caught up!</p>
                <p className={styles.emptySub}>No pending approvals right now.</p>
              </div>
            ) : (
              <div className={styles.tripsList}>
                {pendingReqs.map(r => (
                  <div key={r.requestId} className={styles.tripCard} style={{ alignItems: "flex-start" }}>
                    <div className={styles.tripIcon}>{TRANSPORT_ICONS[r.transportType] ?? "🚗"}</div>
                    <div className={styles.tripInfo} style={{ flex: 1 }}>
                      <div className={styles.tripDest}>{r.destination}</div>
                      <div className={styles.tripCode}>{r.requestCode} · {r.employeeName}</div>
                      <div className={styles.tripDates}>{fmtDate(r.departureDate)} → {fmtDate(r.returnDate)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => void handleApproveRequest(r.requestId, "approve")}
                        style={{ padding: "6px 14px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        Approve
                      </button>
                      <button
                        onClick={() => void handleApproveRequest(r.requestId, "reject")}
                        style={{ padding: "6px 14px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className={styles.quickActions}>
          <h2 className={styles.sectionTitle}>Quick Actions</h2>
          <div className={styles.quickGrid}>
            {[
              { icon: "✈️", label: "Book Travel",    sub: "New travel request", path: "/booking/new"     },
              { icon: "🧾", label: "Submit Expense", sub: "Upload a bill",      path: "/expense/submit"  },
              { icon: "📊", label: "View Reports",   sub: "Download reports",   path: "/reports"         },
              { icon: "👤", label: "My Profile",     sub: "Account details",    path: "/profile"         },
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