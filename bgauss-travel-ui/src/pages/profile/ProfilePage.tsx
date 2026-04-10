// src/pages/profile/ProfilePage.tsx

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { get } from "../../services/apiClient";
import type { TravelRequestResponse, ExpenseClaimResponse } from "../../services/apiClient";
import styles from "./ProfilePage.module.css";

interface ApprovalHistory {
  approvalId: number; requestId: number; approverName: string;
  level: number; action: string; comments: string | null;
  actionAt: string | null; createdAt: string;
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return String(d); }
};

const fmt = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` :
  n >= 1000   ? `₹${(n / 1000).toFixed(1)}K`   : `₹${n.toFixed(0)}`;

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  Approved:    { background: "#dcfce7", color: "#166534" },
  Rejected:    { background: "#fef2f2", color: "#991b1b" },
  Submitted:   { background: "#fef9c3", color: "#854d0e" },
  Reimbursed:  { background: "#f3e8ff", color: "#6b21a8" },
  Draft:       { background: "#f1f5f9", color: "#475569" },
  UnderReview: { background: "#eff6ff", color: "#1e40af" },
};

export default function ProfilePage() {
  const navigate    = useNavigate();
  const { signOut } = useMsalLogin();

  // Session data
  const fullName      = localStorage.getItem("full_name")         ?? "Employee";
  const role          = localStorage.getItem("role")              ?? "Employee";
  const email         = localStorage.getItem("email")             ?? "";
  const department    = localStorage.getItem("department")        ?? "";
  const empCode       = localStorage.getItem("employee_code")     ?? "";
  const designation   = localStorage.getItem("designation")       ?? "—";
  const manager       = localStorage.getItem("reporting_manager") ?? "—";
  const contactNumber = localStorage.getItem("contact_number")    ?? "—";
  const initials      = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const [trips,     setTrips]     = useState<TravelRequestResponse[]>([]);
  const [expenses,  setExpenses]  = useState<ExpenseClaimResponse[]>([]);
  const [history,   setHistory]   = useState<Record<number, ApprovalHistory[]>>({});
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "expenses">("overview");
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      get<TravelRequestResponse[]>("/Booking/my"),
      get<ExpenseClaimResponse[]>("/Expense/my"),
    ]).then(([trRes, expRes]) => {
      if (trRes.status  === "fulfilled") setTrips(trRes.value);
      if (expRes.status === "fulfilled") setExpenses(expRes.value);
    }).finally(() => setLoading(false));
  }, []);

  const loadHistory = async (requestId: number) => {
    if (history[requestId]) return;
    try {
      const rows = await get<ApprovalHistory[]>(`/Approval/history/${requestId}`);
      setHistory(prev => ({ ...prev, [requestId]: rows }));
    } catch { /* silent */ }
  };

  // Derived stats
  const totalSpend    = expenses.filter(e => e.status === "Reimbursed" || e.status === "Approved").reduce((s, e) => s + e.amount, 0);
  const pendingExpAmt = expenses.filter(e => e.status === "Submitted").reduce((s, e) => s + e.amount, 0);
  const approvedTrips = trips.filter(t => t.status === "Approved").length;

  const STATS = [
    { label: "Total Trips",    value: trips.length,      icon: "✈️", color: "#3b82f6" },
    { label: "Approved Trips", value: approvedTrips,     icon: "✅", color: "#22c55e" },
    { label: "Expense Claims", value: expenses.length,   icon: "🧾", color: "#f59e0b" },
    { label: "Total Approved", value: fmt(totalSpend),   icon: "💰", color: "#8b5cf6" },
    { label: "Pending Amount", value: fmt(pendingExpAmt),icon: "⏳", color: "#ef4444" },
  ];

  return (
    <div className={styles.page}>
      <CommonNavbar
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={async () => signOut()}
      />

      <main className={styles.main}>

        {/* ── Profile hero ─────────────────────────────────────────────── */}
        <div className={styles.profileHero}>
          <div className={styles.avatar}>{initials}</div>

          <div className={styles.heroInfo}>
            <h1 className={styles.heroName}>{fullName}</h1>
            <div className={styles.heroBadges}>
              <span className={`${styles.badge} ${styles.badgeRole}`}>{role}</span>
              {department && <span className={`${styles.badge} ${styles.badgeMeta}`}>{department}</span>}
              {empCode    && <span className={`${styles.badge} ${styles.badgeMeta}`}>{empCode}</span>}
            </div>
          </div>

          <button className={styles.backBtn} onClick={() => navigate("/dashboard")}>
            ← Dashboard
          </button>
        </div>

        {/* ── Stats ────────────────────────────────────────────────────── */}
        <div className={styles.statsRow}>
          {STATS.map(s => (
            <div key={s.label} className={styles.statCard}>
              <div className={styles.statIcon}>{s.icon}</div>
              <div className={styles.statValue} style={{ color: s.color }}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className={styles.tabs}>
          {(["overview", "history", "expenses"] as const).map(id => (
            <button
              key={id}
              className={`${styles.tab} ${activeTab === id ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(id)}
            >
              {id === "overview" ? "Profile Info" : id === "history" ? "Approval History" : "My Expenses"}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className={styles.card}>
            <p className={styles.sectionLabel}>Employee Details</p>

            <div className={styles.detailGrid}>
              {[
                { label: "Full Name",         value: fullName        || "—" },
                { label: "Employee Code",     value: empCode         || "—" },
                { label: "Email",             value: email           || "—" },
                { label: "Department",        value: department      || "—" },
                { label: "Designation",       value: designation            },
                { label: "Reporting Manager", value: manager                },
                { label: "Contact Number",    value: contactNumber          },
                { label: "Role",              value: role                   },
              ].map(f => (
                <div key={f.label} className={styles.detailItem}>
                  <div className={styles.detailKey}>{f.label}</div>
                  <div className={styles.detailVal}>{f.value}</div>
                </div>
              ))}
            </div>

            <div className={styles.divider} />

            <p className={styles.sectionLabel}>Recent Travel Requests</p>
            {loading ? (
              <p className={styles.loading}>Loading…</p>
            ) : trips.length === 0 ? (
              <p className={styles.loading}>No travel requests yet.</p>
            ) : trips.slice(0, 5).map(r => (
              <div key={r.requestId} className={styles.tripRow}>
                <div>
                  <div className={styles.tripDest}>{r.destination}</div>
                  <div className={styles.tripMeta}>{r.requestCode} · {fmtDate(r.departureDate)}</div>
                </div>
                <span className={styles.statusBadge} style={STATUS_STYLES[r.status] ?? {}}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── APPROVAL HISTORY ─────────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className={styles.card}>
            <p className={styles.sectionLabel}>Approval history for all your travel requests</p>

            {loading ? (
              <p className={styles.loading}>Loading…</p>
            ) : trips.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>📋</div>
                <p className={styles.emptyTitle}>No travel requests found</p>
                <p className={styles.emptyText}>Submit a travel request to see approval history here.</p>
              </div>
            ) : (
              <div className={styles.historyList}>
                {trips.map(r => (
                  <div key={r.requestId} className={styles.historyBlock}>
                    <button
                      className={styles.historyTrigger}
                      onClick={() => void loadHistory(r.requestId)}
                    >
                      <div>
                        <div className={styles.historyDest}>
                          {r.destination}{" "}
                          <span style={{ color: "#94a3b8", fontWeight: 400 }}>· {r.requestCode}</span>
                        </div>
                        <div className={styles.historyCode}>{r.transportType} · {fmtDate(r.departureDate)}</div>
                      </div>
                      <div className={styles.historyRight}>
                        <span className={styles.statusBadge} style={STATUS_STYLES[r.status] ?? {}}>{r.status}</span>
                        <span className={styles.expandHint}>View history ↓</span>
                      </div>
                    </button>

                    {history[r.requestId] && (
                      <div className={styles.historyRows}>
                        {history[r.requestId].length === 0 ? (
                          <p className={styles.loading}>No approval actions yet.</p>
                        ) : history[r.requestId].map(h => (
                          <div key={h.approvalId} className={styles.historyRow}>
                            <div className={`${styles.historyAvatar} ${h.action === "Approved" ? styles.historyApproved : styles.historyRejected}`}>
                              {h.action === "Approved" ? "✅" : "❌"}
                            </div>
                            <div>
                              <div className={styles.historyAction}>
                                {h.action}{" "}
                                <span className={styles.historyBy}>by {h.approverName}</span>
                              </div>
                              {h.comments && <div className={styles.historyComment}>"{h.comments}"</div>}
                              <div className={styles.historyDate}>{fmtDate(h.actionAt ?? h.createdAt)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MY EXPENSES ──────────────────────────────────────────────── */}
        {activeTab === "expenses" && (
          <div className={styles.card}>
            <div className={styles.toolbar}>
              <p className={styles.sectionLabel} style={{ margin: 0 }}>All Expense Claims</p>
              <button className={styles.addBtn} onClick={() => navigate("/expense/submit")}>
                + New Claim
              </button>
            </div>

            {loading ? (
              <p className={styles.loading}>Loading…</p>
            ) : expenses.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>🧾</div>
                <p className={styles.emptyTitle}>No expense claims yet</p>
                <p className={styles.emptyText}>Submit your first claim to track reimbursements.</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {["Code", "Category", "Amount", "Date", "Status", "Notes"].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(e => (
                      <tr key={e.claimId}>
                        <td className={styles.codeCell}>{e.claimCode}</td>
                        <td>{e.category}</td>
                        <td className={styles.amtCell}>{e.currency} {e.amount.toLocaleString("en-IN")}</td>
                        <td>{fmtDate(e.expenseDate)}</td>
                        <td>
                          <span className={styles.statusBadge} style={STATUS_STYLES[e.status] ?? {}}>
                            {e.status}
                          </span>
                        </td>
                        <td className={styles.noteCell}>{e.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
