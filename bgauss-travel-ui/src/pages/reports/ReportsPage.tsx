// src/pages/reports/ReportsPage.tsx
// Uses ReportsPage.module.css — no inline styles

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { get } from "../../services/apiClient";
import styles from "./ReportsPage.module.css";

interface DashboardSummary {
  totalRequests:    number; pendingRequests:  number;
  approvedRequests: number; rejectedRequests: number;
  totalExpenses:    number; pendingExpenses:  number;
  approvedExpenses: number; totalEmployees:   number;
}
interface TransportStat { transport: string; count: number; totalAmount: number; }
interface EmployeeStat  { displayName: string; employeeCode: string; totalAmount: number; claimCount: number; approved: number; pending: number; }
interface StatusStat    { requests: { status: string; count: number }[]; expenses: { status: string; count: number; total: number }[]; }

const STATUS_COLORS: Record<string, string> = {
  Approved: "#22c55e", Submitted: "#f59e0b", Rejected: "#ef4444",
  Reimbursed: "#8b5cf6", Draft: "#94a3b8", UnderReview: "#3b82f6",
};

const TRANSPORT_ICONS: Record<string, string> = {
  Flight: "✈️", Train: "🚆", Cab: "🚕", Hotel: "🏨",
};

const fmt = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` :
  n >= 1000   ? `₹${(n / 1000).toFixed(1)}K`   : `₹${n.toFixed(0)}`;

type TabId = "overview" | "transport" | "employees" | "status";

export default function ReportsPage() {
  const navigate    = useNavigate();
  const { signOut } = useMsalLogin();

  const fullName       = localStorage.getItem("full_name") ?? "Employee";
  const role           = localStorage.getItem("role")      ?? "Employee";
  const normalizedRole = role.toLowerCase();
  const isAdminOrHr    = normalizedRole === "admin" || normalizedRole === "hr";
  const initials       = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const [summary,   setSummary]   = useState<DashboardSummary | null>(null);
  const [transport, setTransport] = useState<TransportStat[]>([]);
  const [employees, setEmployees] = useState<EmployeeStat[]>([]);
  const [status,    setStatus]    = useState<StatusStat | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      get<DashboardSummary>("/Report/dashboard"),
      get<TransportStat[]>("/Report/by-transport"),
      isAdminOrHr ? get<EmployeeStat[]>("/Report/by-employee") : Promise.resolve([]),
      get<StatusStat>("/Report/by-status"),
    ]).then(([sumRes, transRes, empRes, statRes]) => {
      if (sumRes.status   === "fulfilled") setSummary(sumRes.value);
      if (transRes.status === "fulfilled") setTransport(transRes.value);
      if (empRes.status   === "fulfilled") setEmployees(empRes.value as EmployeeStat[]);
      if (statRes.status  === "fulfilled") setStatus(statRes.value);
    }).finally(() => setLoading(false));
  }, [isAdminOrHr]);

  const maxTransportCount = Math.max(...transport.map(t => t.count), 1);

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
            <p className={styles.heroEyebrow}>Analytics</p>
            <h1 className={styles.heroTitle}>📊 Travel &amp; Expense Reports</h1>
            <p className={styles.heroSub}>
              {isAdminOrHr ? "Organisation-wide overview of travel requests and expense claims." : "Your travel and expense summary."}
            </p>
          </div>
          <button className={styles.heroBack} onClick={() => navigate("/dashboard")}>← Dashboard</button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {(["overview", "transport", ...(isAdminOrHr ? ["employees"] : []), "status"] as TabId[]).map(id => (
            <button key={id} className={`${styles.tab} ${activeTab === id ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(id)}>
              {id === "overview"   ? "Overview"      :
               id === "transport"  ? "By Transport"  :
               id === "employees"  ? "By Employee"   : "Status Breakdown"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className={styles.loading}>Loading reports…</div>
        ) : (
          <>
            {/* ── OVERVIEW ── */}
            {activeTab === "overview" && summary && (
              <>
                <div className={styles.statGrid}>
                  {[
                    { label: "Total Requests",    value: summary.totalRequests,     icon: "✈️", color: "#3b82f6" },
                    { label: "Pending",           value: summary.pendingRequests,   icon: "⏳", color: "#f59e0b" },
                    { label: "Approved",          value: summary.approvedRequests,  icon: "✅", color: "#22c55e" },
                    { label: "Rejected",          value: summary.rejectedRequests,  icon: "❌", color: "#ef4444" },
                    { label: "Total Expenses",    value: fmt(summary.totalExpenses),   icon: "💰", color: "#8b5cf6" },
                    { label: "Pending Expenses",  value: fmt(summary.pendingExpenses), icon: "⏳", color: "#f59e0b" },
                    { label: "Approved Expenses", value: fmt(summary.approvedExpenses),icon: "✅", color: "#22c55e" },
                    ...(isAdminOrHr ? [{ label: "Active Employees", value: summary.totalEmployees, icon: "👥", color: "#0ea5e9" }] : []),
                  ].map(s => (
                    <div key={s.label} className={styles.statCard}>
                      <div className={styles.statIcon}>{s.icon}</div>
                      <div className={styles.statValue} style={{ color: s.color }}>{s.value}</div>
                      <div className={styles.statLabel}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Approval rate bar */}
                {summary.totalRequests > 0 && (
                  <div className={styles.card}>
                    <p className={styles.cardEyebrow}>Request Approval Rate</p>
                    <div className={styles.rateBar}>
                      {[
                        { label: "Approved", count: summary.approvedRequests, color: "#22c55e" },
                        { label: "Pending",  count: summary.pendingRequests,  color: "#f59e0b" },
                        { label: "Rejected", count: summary.rejectedRequests, color: "#ef4444" },
                      ].filter(s => s.count > 0).map(s => (
                        <div key={s.label} className={styles.rateSegment}
                          style={{ width: `${(s.count / summary.totalRequests) * 100}%`, background: s.color }}>
                          {Math.round((s.count / summary.totalRequests) * 100)}%
                        </div>
                      ))}
                    </div>
                    <div className={styles.rateLegend}>
                      {[{ label: "Approved", color: "#22c55e" }, { label: "Pending", color: "#f59e0b" }, { label: "Rejected", color: "#ef4444" }].map(l => (
                        <div key={l.label} className={styles.rateLegendItem}>
                          <div className={styles.rateDot} style={{ background: l.color }} />
                          {l.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── BY TRANSPORT ── */}
            {activeTab === "transport" && (
              <div className={styles.card}>
                <p className={styles.cardEyebrow}>Travel Requests by Mode</p>
                {transport.length === 0 ? (
                  <div className={styles.empty}>No data yet</div>
                ) : (
                  <div className={styles.transportList}>
                    {transport.map(t => (
                      <div key={t.transport} className={styles.transportRow}>
                        <div className={styles.transportMeta}>
                          <span className={styles.transportName}>
                            {TRANSPORT_ICONS[t.transport] ?? "🚗"} {t.transport}
                          </span>
                          <div className={styles.transportStats}>
                            <span><strong>{t.count}</strong> trips</span>
                            <span><strong>{fmt(t.totalAmount)}</strong></span>
                          </div>
                        </div>
                        <div className={styles.transportTrack}>
                          <div className={styles.transportFill}
                            style={{ width: `${(t.count / maxTransportCount) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── BY EMPLOYEE (Admin/HR) ── */}
            {activeTab === "employees" && isAdminOrHr && (
              <div className={styles.card}>
                <p className={styles.cardEyebrow}>Top Expense Claimants</p>
                {employees.length === 0 ? (
                  <div className={styles.empty}>No expense data yet</div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          {["#", "Employee", "Code", "Claims", "Approved", "Pending", "Total"].map(h => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((emp, i) => (
                          <tr key={emp.employeeCode}>
                            <td><span className={styles.rankNum}>#{i + 1}</span></td>
                            <td><span className={styles.empName}>{emp.displayName}</span></td>
                            <td><span className={styles.empCode}>{emp.employeeCode}</span></td>
                            <td>{emp.claimCount}</td>
                            <td><span className={styles.badgeGreen}>{emp.approved}</span></td>
                            <td><span className={styles.badgeAmber}>{emp.pending}</span></td>
                            <td><span className={styles.totalAmt}>{fmt(emp.totalAmount)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── STATUS BREAKDOWN ── */}
            {activeTab === "status" && status && (
              <div className={styles.statusGrid}>
                <div className={styles.card}>
                  <p className={styles.cardEyebrow}>Travel Requests by Status</p>
                  {status.requests.map(r => (
                    <div key={r.status} className={styles.statusRow}>
                      <div className={styles.statusLeft}>
                        <div className={styles.statusDot} style={{ background: STATUS_COLORS[r.status] ?? "#94a3b8" }} />
                        <span className={styles.statusName}>{r.status}</span>
                      </div>
                      <span className={styles.statusAmt}>{r.count}</span>
                    </div>
                  ))}
                </div>

                <div className={styles.card}>
                  <p className={styles.cardEyebrow}>Expense Claims by Status</p>
                  {status.expenses.map(e => (
                    <div key={e.status} className={styles.statusRow}>
                      <div className={styles.statusLeft}>
                        <div className={styles.statusDot} style={{ background: STATUS_COLORS[e.status] ?? "#94a3b8" }} />
                        <span className={styles.statusName}>{e.status}</span>
                      </div>
                      <div className={styles.statusRight}>
                        <span className={styles.statusCount}>{e.count} claims</span>
                        <span className={styles.statusAmt}>{fmt(e.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}