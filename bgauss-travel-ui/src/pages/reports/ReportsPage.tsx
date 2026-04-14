// src/pages/reports/ReportsPage.tsx
// Changes:
//  - Real Chart.js bar charts using react-chartjs-2 OR inline canvas via useEffect
//  - We use inline canvas approach (no extra package dependency) via useEffect + Chart.js CDN-style
//  - Grouped bar chart for requests by status
//  - Horizontal bar chart for transport modes
//  - Donut chart for expense status breakdown
//  - Stacked bar for expense amounts by status
//  - All charts rendered via useRef + Chart.js from npm (assumed available via vite/cra)

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { get } from "../../services/apiClient";
import {
  Chart,
  BarController, BarElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale,
  Tooltip, Legend,
  type ChartConfiguration,
} from "chart.js";
import styles from "./ReportsPage.module.css";

// Register Chart.js components (tree-shakeable)
Chart.register(
  BarController, BarElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale,
  Tooltip, Legend,
);

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardSummary {
  totalRequests: number; pendingRequests: number;
  approvedRequests: number; rejectedRequests: number;
  totalExpenses: number; pendingExpenses: number;
  approvedExpenses: number; totalEmployees: number;
}
interface TransportStat { transport: string; count: number; totalAmount: number; }
interface EmployeeStat  { displayName: string; employeeCode: string; totalAmount: number; claimCount: number; approved: number; pending: number; }
interface StatusStat    {
  requests: { status: string; count: number }[];
  expenses: { status: string; count: number; total: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  Approved: "#22c55e", Submitted: "#f59e0b", Rejected: "#ef4444",
  Reimbursed: "#8b5cf6", Draft: "#94a3b8", UnderReview: "#3b82f6",
};

const TRANSPORT_ICONS: Record<string, string> = {
  Flight: "✈️", Train: "🚆", Cab: "🚕", Hotel: "🏨",
};

const CHART_COLORS = {
  approved:   { bg: "#22c55e22", border: "#22c55e" },
  pending:    { bg: "#f59e0b22", border: "#f59e0b" },
  rejected:   { bg: "#ef444422", border: "#ef4444" },
  reimbursed: { bg: "#8b5cf622", border: "#8b5cf6" },
  flight:     { bg: "#3b82f622", border: "#3b82f6" },
  train:      { bg: "#06b6d422", border: "#06b6d4" },
  cab:        { bg: "#f59e0b22", border: "#f59e0b" },
  hotel:      { bg: "#8b5cf622", border: "#8b5cf6" },
};

const fmt = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` :
  n >= 1000   ? `₹${(n / 1000).toFixed(1)}K`   : `₹${n.toFixed(0)}`;

type TabId = "overview" | "transport" | "employees" | "status";

// ── Chart hook — destroy & recreate on data change ────────────────────────────
function useChart(
  ref: React.RefObject<HTMLCanvasElement | null>,
  config: ChartConfiguration | null,
) {
  useEffect(() => {
    if (!ref.current || !config) return;
    const chart = new Chart(ref.current, config);
    return () => { chart.destroy(); };
  }, [config]);   // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabBtn({ id, label, activeTab, onClick }: {
  id: TabId; label: string; activeTab: TabId; onClick: () => void;
}) {
  return (
    <button
      className={`${styles.tab} ${activeTab === id ? styles.tabActive : ""}`}
      onClick={onClick}>
      {label}
    </button>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({ icon, label, value, color }: {
  icon: string; label: string; value: string | number; color: string;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statValue} style={{ color }}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

// ── Overview Charts Component ─────────────────────────────────────────────────
function OverviewCharts({ summary }: { summary: DashboardSummary }) {
  const requestBarRef  = useRef<HTMLCanvasElement>(null);
  const expenseBarRef  = useRef<HTMLCanvasElement>(null);

  const requestBarConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels: ["Approved", "Pending", "Rejected"],
      datasets: [{
        label: "Travel Requests",
        data: [summary.approvedRequests, summary.pendingRequests, summary.rejectedRequests],
        backgroundColor: ["#22c55e33", "#f59e0b33", "#ef444433"],
        borderColor:     ["#22c55e",   "#f59e0b",   "#ef4444"],
        borderWidth: 2,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y} requests`,
          },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: "#f1f5f9" } },
        x: { grid: { display: false } },
      },
    },
  };

  const expenseBarConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels: ["Total Expenses", "Pending", "Approved"],
      datasets: [{
        label: "Amount (₹)",
        data: [summary.totalExpenses, summary.pendingExpenses, summary.approvedExpenses],
        backgroundColor: ["#3b82f633", "#f59e0b33", "#22c55e33"],
        borderColor:     ["#3b82f6",   "#f59e0b",   "#22c55e"],
        borderWidth: 2,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${fmt(ctx.parsed.y as number)}`,
          },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => fmt(v as number) }, grid: { color: "#f1f5f9" } },
        x: { grid: { display: false } },
      },
    },
  };

  useChart(requestBarRef, requestBarConfig);
  useChart(expenseBarRef, expenseBarConfig);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
      {/* Request status bar */}
      <div className={styles.card}>
        <p className={styles.cardEyebrow}>Requests by Status</p>
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          {[{ label: "Approved", color: "#22c55e", val: summary.approvedRequests },
            { label: "Pending",  color: "#f59e0b", val: summary.pendingRequests  },
            { label: "Rejected", color: "#ef4444", val: summary.rejectedRequests }].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
              {l.label}: <strong style={{ color: "#0f172a" }}>{l.val}</strong>
            </div>
          ))}
        </div>
        <div style={{ position: "relative", height: 200 }}>
          <canvas ref={requestBarRef}
            role="img"
            aria-label={`Bar chart: ${summary.approvedRequests} approved, ${summary.pendingRequests} pending, ${summary.rejectedRequests} rejected requests`}>
            Approved: {summary.approvedRequests}, Pending: {summary.pendingRequests}, Rejected: {summary.rejectedRequests}
          </canvas>
        </div>
      </div>

      {/* Expense amount bar */}
      <div className={styles.card}>
        <p className={styles.cardEyebrow}>Expense Pipeline (₹)</p>
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          {[{ label: "Total",    color: "#3b82f6", val: fmt(summary.totalExpenses)    },
            { label: "Pending",  color: "#f59e0b", val: fmt(summary.pendingExpenses)  },
            { label: "Approved", color: "#22c55e", val: fmt(summary.approvedExpenses) }].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
              {l.label}: <strong style={{ color: "#0f172a" }}>{l.val}</strong>
            </div>
          ))}
        </div>
        <div style={{ position: "relative", height: 200 }}>
          <canvas ref={expenseBarRef}
            role="img"
            aria-label={`Bar chart of expense amounts: Total ${fmt(summary.totalExpenses)}, Pending ${fmt(summary.pendingExpenses)}, Approved ${fmt(summary.approvedExpenses)}`}>
            Total: {fmt(summary.totalExpenses)}, Pending: {fmt(summary.pendingExpenses)}, Approved: {fmt(summary.approvedExpenses)}
          </canvas>
        </div>
      </div>
    </div>
  );
}

// ── Transport Charts Component ────────────────────────────────────────────────
function TransportCharts({ transport }: { transport: TransportStat[] }) {
  const countBarRef  = useRef<HTMLCanvasElement>(null);
  const amountBarRef = useRef<HTMLCanvasElement>(null);

  const labels = transport.map(t => t.transport);
  const colors  = [
    CHART_COLORS.flight, CHART_COLORS.train, CHART_COLORS.cab, CHART_COLORS.hotel,
    { bg: "#84cc1622", border: "#84cc16" },
  ];

  const countConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Trips",
        data: transport.map(t => t.count),
        backgroundColor: labels.map((_, i) => colors[i % colors.length].bg),
        borderColor:     labels.map((_, i) => colors[i % colors.length].border),
        borderWidth: 2,
        borderRadius: 8,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} trips` } },
      },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: "#f1f5f9" } },
        y: { grid: { display: false } },
      },
    },
  };

  const amountConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Amount (₹)",
        data: transport.map(t => t.totalAmount),
        backgroundColor: labels.map((_, i) => colors[i % colors.length].bg),
        borderColor:     labels.map((_, i) => colors[i % colors.length].border),
        borderWidth: 2,
        borderRadius: 8,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.parsed.x as number)}` } },
      },
      scales: {
        x: { beginAtZero: true, ticks: { callback: v => fmt(v as number) }, grid: { color: "#f1f5f9" } },
        y: { grid: { display: false } },
      },
    },
  };

  useChart(countBarRef, countConfig);
  useChart(amountBarRef, amountConfig);

  const barHeight = Math.max(160, transport.length * 48 + 40);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div className={styles.card}>
        <p className={styles.cardEyebrow}>Trip Count by Mode</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          {transport.map((t, i) => (
            <div key={t.transport} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: colors[i % colors.length].border }} />
              {TRANSPORT_ICONS[t.transport] ?? "🚗"} {t.transport}: <strong style={{ color: "#0f172a" }}>{t.count}</strong>
            </div>
          ))}
        </div>
        <div style={{ position: "relative", height: barHeight }}>
          <canvas ref={countBarRef}
            role="img"
            aria-label={`Horizontal bar chart of trip counts by transport mode`}>
            {transport.map(t => `${t.transport}: ${t.count} trips`).join(", ")}
          </canvas>
        </div>
      </div>

      <div className={styles.card}>
        <p className={styles.cardEyebrow}>Spend by Mode (₹)</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          {transport.map((t, i) => (
            <div key={t.transport} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: colors[i % colors.length].border }} />
              {t.transport}: <strong style={{ color: "#0f172a" }}>{fmt(t.totalAmount)}</strong>
            </div>
          ))}
        </div>
        <div style={{ position: "relative", height: barHeight }}>
          <canvas ref={amountBarRef}
            role="img"
            aria-label={`Horizontal bar chart of spend by transport mode`}>
            {transport.map(t => `${t.transport}: ${fmt(t.totalAmount)}`).join(", ")}
          </canvas>
        </div>
      </div>
    </div>
  );
}

// ── Status breakdown charts ───────────────────────────────────────────────────
function StatusCharts({ status }: { status: StatusStat }) {
  const reqDonutRef = useRef<HTMLCanvasElement>(null);
  const expDonutRef = useRef<HTMLCanvasElement>(null);
  const expBarRef   = useRef<HTMLCanvasElement>(null);

  const reqColors  = status.requests.map(r => STATUS_COLORS[r.status] ?? "#94a3b8");
  const expColors  = status.expenses.map(e => STATUS_COLORS[e.status] ?? "#94a3b8");

  const reqDonutConfig: ChartConfiguration = {
    type: "doughnut",
    data: {
      labels: status.requests.map(r => r.status),
      datasets: [{
        data: status.requests.map(r => r.count),
        backgroundColor: reqColors.map(c => c + "bb"),
        borderColor:     reqColors,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} requests` } },
      },
    },
  };

  const expDonutConfig: ChartConfiguration = {
    type: "doughnut",
    data: {
      labels: status.expenses.map(e => e.status),
      datasets: [{
        data: status.expenses.map(e => e.count),
        backgroundColor: expColors.map(c => c + "bb"),
        borderColor:     expColors,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} claims` } },
      },
    },
  };

  const expBarConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels: status.expenses.map(e => e.status),
      datasets: [{
        label: "Total (₹)",
        data: status.expenses.map(e => e.total),
        backgroundColor: expColors.map(c => c + "33"),
        borderColor:     expColors,
        borderWidth: 2,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.parsed.y as number)}` } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => fmt(v as number) }, grid: { color: "#f1f5f9" } },
        x: { grid: { display: false } },
      },
    },
  };

  useChart(reqDonutRef, reqDonutConfig);
  useChart(expDonutRef, expDonutConfig);
  useChart(expBarRef,   expBarConfig);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Donut row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Request donut */}
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Travel Request Status</p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
            {status.requests.map(r => (
              <div key={r.status} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_COLORS[r.status] ?? "#94a3b8" }} />
                {r.status}: <strong style={{ color: "#0f172a" }}>{r.count}</strong>
              </div>
            ))}
          </div>
          <div style={{ position: "relative", height: 200 }}>
            <canvas ref={reqDonutRef}
              role="img"
              aria-label="Donut chart of travel requests by status">
              {status.requests.map(r => `${r.status}: ${r.count}`).join(", ")}
            </canvas>
          </div>
        </div>

        {/* Expense count donut */}
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Expense Claims Status</p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
            {status.expenses.map(e => (
              <div key={e.status} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_COLORS[e.status] ?? "#94a3b8" }} />
                {e.status}: <strong style={{ color: "#0f172a" }}>{e.count}</strong>
              </div>
            ))}
          </div>
          <div style={{ position: "relative", height: 200 }}>
            <canvas ref={expDonutRef}
              role="img"
              aria-label="Donut chart of expense claims by status">
              {status.expenses.map(e => `${e.status}: ${e.count} claims`).join(", ")}
            </canvas>
          </div>
        </div>
      </div>

      {/* Expense amount bar */}
      <div className={styles.card}>
        <p className={styles.cardEyebrow}>Expense Amount by Status (₹)</p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
          {status.expenses.map(e => (
            <div key={e.status} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_COLORS[e.status] ?? "#94a3b8" }} />
              {e.status}: <strong style={{ color: "#0f172a" }}>{fmt(e.total)}</strong>
            </div>
          ))}
        </div>
        <div style={{ position: "relative", height: 220 }}>
          <canvas ref={expBarRef}
            role="img"
            aria-label="Bar chart of expense amounts by status">
            {status.expenses.map(e => `${e.status}: ${fmt(e.total)}`).join(", ")}
          </canvas>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const navigate    = useNavigate();
  const { signOut } = useMsalLogin();

  const fullName = localStorage.getItem("full_name") ?? "Employee";
  const role     = localStorage.getItem("role")      ?? "Employee";
  const initials = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";
  const isAdminOrHr = role.toLowerCase() === "admin" || role.toLowerCase() === "hr";

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
      isAdminOrHr
        ? get<EmployeeStat[]>("/Report/by-employee")
        : Promise.resolve([] as EmployeeStat[]),
      get<StatusStat>("/Report/by-status"),
    ]).then(([sumRes, transRes, empRes, statRes]) => {
      if (sumRes.status   === "fulfilled") setSummary(sumRes.value);
      if (transRes.status === "fulfilled") setTransport(transRes.value);
      if (empRes.status   === "fulfilled") setEmployees(empRes.value);
      if (statRes.status  === "fulfilled") setStatus(statRes.value);
    }).finally(() => setLoading(false));
  }, [isAdminOrHr]);

  return (
    <div className={styles.page}>
      <CommonNavbar
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={async () => signOut()}
        // No notificationBell prop here — bell only on dashboard
      />

      <main className={styles.main}>
        {/* Hero */}
        <div className={styles.hero}>
          <div>
            <p className={styles.heroEyebrow}>Analytics</p>
            <h1 className={styles.heroTitle}>📊 Travel &amp; Expense Reports</h1>
            <p className={styles.heroSub}>
              {isAdminOrHr
                ? "Organisation-wide overview of travel requests and expense claims."
                : "Your personal travel and expense summary."}
            </p>
          </div>
          <button className={styles.heroBack} onClick={() => navigate("/dashboard")}>← Dashboard</button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <TabBtn id="overview"  label="Overview"          activeTab={activeTab} onClick={() => setActiveTab("overview")}  />
          <TabBtn id="transport" label="By Transport"      activeTab={activeTab} onClick={() => setActiveTab("transport")} />
          {isAdminOrHr && <TabBtn id="employees" label="By Employee" activeTab={activeTab} onClick={() => setActiveTab("employees")} />}
          <TabBtn id="status"    label="Status Breakdown"  activeTab={activeTab} onClick={() => setActiveTab("status")}   />
        </div>

        {loading ? (
          <div className={styles.loading}>Loading reports…</div>
        ) : (
          <>
            {/* ── OVERVIEW ── */}
            {activeTab === "overview" && summary && (
              <>
                {/* Metric cards */}
                <div className={styles.statGrid}>
                  {([
                    { label: "Total Requests",    value: summary.totalRequests,         icon: "✈️", color: "#3b82f6" },
                    { label: "Pending",           value: summary.pendingRequests,        icon: "⏳", color: "#f59e0b" },
                    { label: "Approved",          value: summary.approvedRequests,       icon: "✅", color: "#22c55e" },
                    { label: "Rejected",          value: summary.rejectedRequests,       icon: "❌", color: "#ef4444" },
                    { label: "Total Expenses",    value: fmt(summary.totalExpenses),     icon: "💰", color: "#8b5cf6" },
                    { label: "Pending Expenses",  value: fmt(summary.pendingExpenses),   icon: "⏳", color: "#f59e0b" },
                    { label: "Approved Expenses", value: fmt(summary.approvedExpenses),  icon: "✅", color: "#22c55e" },
                    ...(isAdminOrHr ? [{ label: "Active Employees", value: summary.totalEmployees, icon: "👥", color: "#0ea5e9" }] : []),
                  ] as { label: string; value: string | number; icon: string; color: string }[]).map(s => (
                    <MetricCard key={s.label} {...s} />
                  ))}
                </div>

                {/* Approval rate stacked bar */}
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

                {/* Chart.js bar charts */}
                <OverviewCharts summary={summary} />
              </>
            )}

            {/* ── BY TRANSPORT ── */}
            {activeTab === "transport" && (
              transport.length === 0 ? (
                <div className={styles.card}><div className={styles.empty}>No transport data yet</div></div>
              ) : (
                <TransportCharts transport={transport} />
              )
            )}

            {/* ── BY EMPLOYEE ── */}
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

                {/* Employee bar chart */}
                {employees.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <p className={styles.cardEyebrow}>Employee Spend Comparison</p>
                    <EmployeeBarChart employees={employees} />
                  </div>
                )}
              </div>
            )}

            {/* ── STATUS BREAKDOWN ── */}
            {activeTab === "status" && status && (
              <StatusCharts status={status} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Employee bar chart ────────────────────────────────────────────────────────
function EmployeeBarChart({ employees }: { employees: EmployeeStat[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const top10 = employees.slice(0, 10);
  const config: ChartConfiguration = {
    type: "bar",
    data: {
      labels: top10.map(e => e.displayName.split(" ")[0]),
      datasets: [
        {
          label: "Approved",
          data: top10.map(e => e.approved),
          backgroundColor: "#22c55e33",
          borderColor: "#22c55e",
          borderWidth: 2,
          borderRadius: 4,
        },
        {
          label: "Pending",
          data: top10.map(e => e.pending),
          backgroundColor: "#f59e0b33",
          borderColor: "#f59e0b",
          borderWidth: 2,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: "#f1f5f9" } },
        x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 30 } },
      },
    },
  };
  useChart(canvasRef, config);
  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
        {[{ label: "Approved", color: "#22c55e" }, { label: "Pending", color: "#f59e0b" }].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
      <div style={{ position: "relative", height: Math.max(220, top10.length * 32 + 60) }}>
        <canvas ref={canvasRef}
          role="img"
          aria-label="Grouped bar chart of expense claims per employee">
          {top10.map(e => `${e.displayName}: ${e.approved} approved, ${e.pending} pending`).join(". ")}
        </canvas>
      </div>
    </div>
  );
}