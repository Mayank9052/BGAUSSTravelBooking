// src/pages/reports/ReportsPage.tsx
//
// ── Controller → UI mapping ────────────────────────────────────────────────────
//
//  GET /api/Report/dashboard?from&to
//    → Summary { totalRequests, pendingRequests, approvedRequests, rejectedRequests,
//                totalExpenses, pendingExpenses, approvedExpenses, totalEmployees }
//
//  GET /api/Report/by-transport?from&to          (admin)
//  GET /api/Report/my-transport?from&to          (employee — JWT-scoped)
//    → TransportStat[] { transport, count, totalAmount }
//      totalAmount = sum of ExpenseClaims linked to those TravelRequests
//
//  GET /api/Report/by-employee?from&to           (admin only)
//    → EmployeeStat[] { employeeId, displayName, employeeCode, department,
//                       totalAmount, claimCount, approved, pending }
//      source: ExpenseClaims grouped by EmployeeId — all-time, not date-filtered
//      (backend currently ignores from/to for this endpoint — display as-is)
//
//  GET /api/Report/by-department?from&to         (admin only)
//    → DepartmentStat[] { department, requestCount, approved, pending, expenseTotal }
//      expenseTotal = sum of ExpenseClaims.Amount for requests in that dept & date range
//      approved/pending = TravelRequest counts, NOT expense counts
//
//  GET /api/Booking/all?transport=X&pageSize=200 (admin drill-down)
//  GET /api/Booking/my                           (employee drill-down)
//    → BookingItem[] { employeeId, employeeName, employeeCode, department,
//                      requestCode, status, destination, departureDate, transportType }
//
// ── Date-range notes ──────────────────────────────────────────────────────────
//  Backend expects DateTime querystring: "2024-01-01" parses fine as DateTime in C#.
//  We send toISO(date) = "YYYY-MM-DD" which C# auto-converts to midnight UTC.
//  For "to" we send end-of-day by appending "T23:59:59" so the upper bound is inclusive.
//
// ── Fix summary ───────────────────────────────────────────────────────────────
//  1. By Employee chart: changed from grouped bar (approved/pending) to horizontal
//     bar showing totalAmount per employee — same compact style as By Travel Mode.
//  2. By Travel Mode totalAmount: was always 0 because backend joins ExpenseClaims
//     via Category LIKE match. We now display what the API returns and note it.
//  3. By Department expenseTotal: display expenseTotal directly from API (no
//     client-side recalculation). Backend already sums correctly.
//  4. Date range: "to" date now sent as "YYYY-MM-DDT23:59:59" for inclusive end.
//     Custom date validation added (from must be ≤ to).
//  5. Drawer total amount: ModeDrawer now shows per-mode totalAmount in the header.

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { signOutUser } from "../../auth/signOut";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { get } from "../../services/apiClient";
import {
  Chart, BarController, BarElement,
  CategoryScale, LinearScale, Tooltip, Legend,
  type ChartConfiguration,
} from "chart.js";
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// ── Types (matching ReportController response shapes exactly) ─────────────────
interface Summary {
  totalRequests:    number;
  pendingRequests:  number;
  approvedRequests: number;
  rejectedRequests: number;
  totalExpenses:    number;   // date-filtered sum (non-rejected)
  pendingExpenses:  number;   // all-time submitted
  approvedExpenses: number;   // all-time approved+reimbursed
  totalEmployees:   number;   // active employees with role=Employee
}

interface TransportStat {
  transport:   string;   // "Flight" | "Train" | "Cab" | "Hotel" | "Bus" | "Unknown"
  count:       number;   // distinct TravelRequest count in date range
  totalAmount: number;   // sum of ExpenseClaims where category LIKE transport
}

// Drill-down: one row per TravelRequest for a given transport mode
interface ModeEmployee {
  employeeId:    number;
  employeeName:  string;
  employeeCode:  string;
  department:    string;
  requestCode:   string;
  status:        string;
  destination:   string;
  departureDate: string;
}

// from /api/Report/by-employee — one row per employee, grouped by employeeId
interface EmployeeStat {
  employeeId:   number;
  displayName:  string;
  employeeCode: string;
  department:   string;
  totalAmount:  number;   // sum of all ExpenseClaims.Amount for that employee
  claimCount:   number;
  approved:     number;   // count of Approved+Reimbursed claims
  pending:      number;   // count of Submitted claims
}

// from /api/Report/by-department — one row per department
interface DepartmentStat {
  department:   string;
  requestCount: number;
  expenseTotal: number;   // sum of ExpenseClaims in date range for that dept
  approved:     number;   // TravelRequest count with status=Approved
  pending:      number;   // TravelRequest count with status=Submitted|UnderReview
}

type PeriodType    = "weekly" | "monthly" | "yearly" | "custom";
type EmployeeTab   = "overview" | "bymode";
type AdminTab      = "overview" | "analytics";
type AnalyticsView = "mode" | "employee" | "department";
type SortDir       = "asc" | "desc";

// ── Constants ─────────────────────────────────────────────────────────────────
const FF  = "'Segoe UI', system-ui, sans-serif";
const G   = "#f1f5f9";
const today = new Date();

// Transport colours — must match what the backend returns as TransportType
const TC: Record<string, string> = {
  Flight:   "#3b82f6",
  Train:    "#10b981",
  Cab:      "#f59e0b",
  Hotel:    "#8b5cf6",
  Bus:      "#f97316",
  Multiple: "#ef4444",
  Unknown:  "#94a3b8",
};

const DC = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"];

const SB: Record<string, React.CSSProperties> = {
  Approved:    { background: "#dcfce7", color: "#15803d" },
  Rejected:    { background: "#fee2e2", color: "#b91c1c" },
  Submitted:   { background: "#fef9c3", color: "#854d0e" },
  UnderReview: { background: "#dbeafe", color: "#1e40af" },
  Reimbursed:  { background: "#ede9fe", color: "#6d28d9" },
};

const ICONS: Record<string, string> = {
  Flight: "✈️", Train: "🚆", Cab: "🚕", Hotel: "🏨", Bus: "🚌",
};
const modeIcon = (t: string) => ICONS[t] ?? "🗺️";

// ── Date helpers ──────────────────────────────────────────────────────────────
const toISO = (d: Date) => d.toISOString().slice(0, 10);   // "YYYY-MM-DD"

// C# DateTime.Parse needs end-of-day to make "to" inclusive
const toEndISO = (dateStr: string) =>
  dateStr ? `${dateStr}T23:59:59` : "";

function getPeriodDates(p: PeriodType): { from: string; to: string } {
  const now   = new Date();
  const toStr = toISO(now);                 // today (start of day — backend uses >= start)

  if (p === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { from: toISO(d), to: toStr };
  }
  if (p === "monthly") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return { from: toISO(d), to: toStr };
  }
  if (p === "yearly") {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1);
    return { from: toISO(d), to: toStr };
  }
  return { from: "", to: "" };
}

/** Build query-string with proper inclusive "to" datetime */
function buildQS(from: string, to: string): URLSearchParams {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to)   qs.set("to",   toEndISO(to));   // ← send T23:59:59 for inclusive upper bound
  return qs;
}

// ── Number formatters ─────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined): string => {
      if (n == null || isNaN(n)) return "₹0";
      return n >= 10_000_000 ? `₹${(n / 10_000_000).toFixed(1)}Cr` :
             n >= 100_000    ? `₹${(n / 100_000).toFixed(1)}L`     :
             n >= 1_000      ? `₹${(n / 1_000).toFixed(1)}K`       :
             `₹${n.toFixed(0)}`;
    };

const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
  } catch { return d; }
};

// ── Type-safe property accessor ───────────────────────────────────────────────
function gp<T extends object>(obj: T, key: string): number | string {
  return (obj as Record<string, number | string>)[key] ?? 0;
}

// ── Chart hook ────────────────────────────────────────────────────────────────
function useChart(
  ref: React.RefObject<HTMLCanvasElement | null>,
  cfg: ChartConfiguration | null,
  onClick?: (i: number) => void,
) {
  useEffect(() => {
    if (!ref.current || !cfg) return;
    const c = new Chart(ref.current, {
      ...cfg,
      options: {
        ...cfg.options,
        onClick: onClick
          ? (_, els) => { if (els[0]) onClick(els[0].index); }
          : cfg.options?.onClick,
      },
    });
    return () => c.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cfg)]);
}

// ── Sort + search hook ────────────────────────────────────────────────────────
function useSortSearch<T extends object>(
  data: T[],
  defaultKey: string,
  defaultDir: SortDir = "desc",
) {
  const [q,  setQ]  = useState("");
  const [sc, setSc] = useState(defaultKey);
  const [sd, setSd] = useState<SortDir>(defaultDir);

  const tog = (col: string) => {
    if (sc === col) setSd(d => d === "asc" ? "desc" : "asc");
    else { setSc(col); setSd("desc"); }
  };

  const arrow = (col: string) =>
    sc === col ? (sd === "asc" ? " ↑" : " ↓") : " ↕";

  const filter = (pred: (row: T, q: string) => boolean): T[] =>
    data
      .filter(row => !q || pred(row, q))
      .sort((a, b) => {
        const va = gp(a, sc), vb = gp(b, sc);
        const cmp = typeof va === "number"
          ? (va as number) - (vb as number)
          : String(va).localeCompare(String(vb));
        return sd === "asc" ? cmp : -cmp;
      });

  return { q, setQ, sc, tog, arrow, filter };
}

// ── Export helpers ────────────────────────────────────────────────────────────
function exportCSV(rows: Record<string, string | number>[], fname: string) {
  if (!rows.length) return;
  const h = Object.keys(rows[0]);
  const lines = [
    h.join(","),
    ...rows.map(r =>
      h.map(k => {
        const v = String(r[k] ?? "");
        return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${fname}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function exportPDF(title: string, contentId: string) {
  const el  = document.getElementById(contentId);
  const win = window.open("", "_blank");
  if (!win) { window.print(); return; }
  win.document.write(`
    <html><head><title>${title}</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; padding: 24px; color: #0f172a; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
      th { background: #f8fafc; padding: 8px 12px; text-align: left; font-weight: 700;
           border-bottom: 2px solid #e2e8f0; font-size: 10px; text-transform: uppercase; }
      td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
      h1 { font-size: 18px; } p.sub { color: #64748b; font-size: 12px; }
      @media print { body { padding: 0; } }
    </style></head>
    <body>
      <h1>${title}</h1>
      <p class="sub">Generated: ${new Date().toLocaleString("en-IN")}</p>
      ${el?.innerHTML ?? "<p>No content.</p>"}
    </body></html>
  `);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ── Reusable components ───────────────────────────────────────────────────────
function ExBtn({ onCSV, onPDF, label }: { onCSV: () => void; onPDF: () => void; label?: string }) {
  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5,
    padding: "5px 11px", borderRadius: 8, border: "1.5px solid #e2e8f0",
    background: "#fff", fontWeight: 700, fontSize: 12,
    cursor: "pointer", fontFamily: FF, transition: "all 0.15s",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {label && <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{label}</span>}
      <button onClick={onCSV} style={{ ...base, color: "#15803d" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#f0fdf4")}
        onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>📊 Excel</button>
      <button onClick={onPDF} style={{ ...base, color: "#dc2626" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")}
        onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>📄 PDF</button>
    </div>
  );
}

function KPI({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", border: `1.5px solid ${color}22`, boxShadow: `0 2px 10px ${color}11`, display: "flex", flexDirection: "column", gap: 5, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -12, right: -12, width: 60, height: 60, borderRadius: "50%", background: `${color}11` }} />
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, letterSpacing: "-0.5px" }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>{label}</div>
    </div>
  );
}

// Sortable table header
function Th({ label, col, arrow, tog }: {
  label: string; col: string;
  arrow: (c: string) => string; tog: (c: string) => void;
}) {
  return (
    <th onClick={() => tog(col)} style={{
      padding: "9px 12px", textAlign: "left", fontWeight: 700, color: "#64748b",
      fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em",
      cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", background: "#f8fafc",
    }}>
      {label}<span style={{ color: "#cbd5e1", marginLeft: 2, fontSize: 10 }}>{arrow(col)}</span>
    </th>
  );
}

// ── Period filter ─────────────────────────────────────────────────────────────
function PeriodFilter({
  period, setPeriod, cf, setCf, ct, setCt, onApply, error,
}: {
  period: PeriodType; setPeriod: (p: PeriodType) => void;
  cf: string; setCf: (s: string) => void;
  ct: string; setCt: (s: string) => void;
  onApply: () => void; error?: string;
}) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "10px 16px", marginBottom: 18, border: "1.5px solid #e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>📅 Period:</span>
        <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 2, gap: 1 }}>
          {(["weekly", "monthly", "yearly", "custom"] as PeriodType[]).map(k => (
            <button key={k} onClick={() => setPeriod(k)} style={{
              padding: "5px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 700,
              cursor: "pointer", background: period === k ? "#0f172a" : "transparent",
              color: period === k ? "#fff" : "#64748b", transition: "all 0.12s",
            }}>
              {k === "weekly" ? "7 Days" : k === "monthly" ? "30 Days" : k === "yearly" ? "1 Year" : "Custom"}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>From:</label>
              <input type="date" value={cf} onChange={e => setCf(e.target.value)}
                max={ct || toISO(today)}
                style={{ padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${error ? "#ef4444" : "#e2e8f0"}`, fontSize: 12, fontFamily: FF }} />
            </div>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>→</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>To:</label>
              <input type="date" value={ct} onChange={e => setCt(e.target.value)}
                min={cf} max={toISO(today)}
                style={{ padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${error ? "#ef4444" : "#e2e8f0"}`, fontSize: 12, fontFamily: FF }} />
            </div>
          </>
        )}

        <button onClick={onApply} style={{
          padding: "5px 14px", background: "#0f172a", color: "#fff",
          border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12,
          cursor: "pointer", marginLeft: "auto",
        }}>
          Apply →
        </button>
      </div>
      {error && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#ef4444", fontWeight: 600 }}>
          ⚠ {error}
        </p>
      )}
      {/* Active range display */}
    </div>
  );
}

// ── Mode Employee Drawer ──────────────────────────────────────────────────────
function ModeDrawer({
  mode, list, totalAmount, onClose,
}: {
  mode: string; list: ModeEmployee[]; totalAmount: number; onClose: () => void;
}) {
  const color = TC[mode] ?? "#64748b";
  const { q, setQ, tog, arrow, filter } = useSortSearch<ModeEmployee>(list, "departureDate", "desc");

  const rows = filter((e, sq) => {
    const s = sq.toLowerCase();
    return (
      e.employeeName.toLowerCase().includes(s)  ||
      e.employeeCode.toLowerCase().includes(s)  ||
      (e.department ?? "").toLowerCase().includes(s) ||
      e.destination.toLowerCase().includes(s)   ||
      e.requestCode.toLowerCase().includes(s)   ||
      e.status.toLowerCase().includes(s)        ||
      fmtDate(e.departureDate).toLowerCase().includes(s)
    );
  });

  const csv = rows.map(r => ({
    Employee:    r.employeeName,
    Code:        r.employeeCode,
    Department:  r.department || "—",
    Request:     r.requestCode,
    Destination: r.destination,
    Departure:   fmtDate(r.departureDate),
    Status:      r.status,
  }));

  return (
    <div id={`md-${mode}`} style={{ background: "#fff", borderRadius: 16, border: `2px solid ${color}44`, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
      {/* Header */}
      <div style={{ padding: "12px 18px", background: `${color}11`, borderBottom: `1.5px solid ${color}22`, borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>
            {modeIcon(mode)} {mode} — {list.length} request{list.length !== 1 ? "s" : ""}
          </span>
          {totalAmount > 0 && (
            <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 700, color, background: color + "18", borderRadius: 6, padding: "2px 8px" }}>
              Total Expenses: {fmt(totalAmount)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ExBtn
            onCSV={() => exportCSV(csv, `${mode}-trips`)}
            onPDF={() => exportPDF(`${mode} Requests`, `md-${mode}`)}
          />
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#94a3b8" }}>✕</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "10px 18px", borderBottom: "1px solid #f1f5f9" }}>
        <input
          type="text" value={q} onChange={e => setQ(e.target.value)}
          placeholder="🔍 Search name, code, dept, destination, status, date…"
          style={{ width: "100%", padding: "7px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
              <Th label="Employee"    col="employeeName"  arrow={arrow} tog={tog} />
              <Th label="Code"        col="employeeCode"  arrow={arrow} tog={tog} />
              <Th label="Department"  col="department"    arrow={arrow} tog={tog} />
              <Th label="Request"     col="requestCode"   arrow={arrow} tog={tog} />
              <Th label="Destination" col="destination"   arrow={arrow} tog={tog} />
              <Th label="Departure"   col="departureDate" arrow={arrow} tog={tog} />
              <Th label="Status"      col="status"        arrow={arrow} tog={tog} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={7} style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>No records match your search.</td></tr>
              : rows.map((e, i) => (
                <tr key={`${e.employeeId}-${i}`}
                  style={{ borderBottom: "1px solid #f8fafc" }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: "#0f172a" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color, flexShrink: 0 }}>
                        {e.employeeName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      {e.employeeName}
                    </div>
                  </td>
                  <td style={{ padding: "9px 12px", color: "#64748b", fontFamily: "monospace" }}>{e.employeeCode || "—"}</td>
                  <td style={{ padding: "9px 12px" }}>
                    {e.department
                      ? <span style={{ background: "#eef2ff", color: "#4f46e5", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>🏢 {e.department}</span>
                      : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontWeight: 600, color: "#0f172a" }}>{e.requestCode}</td>
                  <td style={{ padding: "9px 12px", color: "#334155" }}>{e.destination}</td>
                  <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(e.departureDate)}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, ...(SB[e.status] ?? { background: "#f1f5f9", color: "#64748b" }) }}>
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
      <div style={{ padding: "8px 18px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: "0 0 14px 14px" }}>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{rows.length} of {list.length} records</span>
      </div>
    </div>
  );
}

// ── Fetch drill-down employees for a mode ─────────────────────────────────────
async function fetchModeTrips(mode: string, isAdmin: boolean): Promise<ModeEmployee[]> {
  const ep = isAdmin
    ? `/api/Booking/all?transport=${encodeURIComponent(mode)}&pageSize=200`
    : `/api/Booking/my`;
  const res = await fetch(ep, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("jwt_token") ?? ""}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return [];
  const json = await res.json() as unknown;
  const all = (
    Array.isArray(json) ? json : ((json as { items?: unknown[] }).items ?? [])
  ) as {
    employeeId: number; employeeName: string; employeeCode: string;
    department: string; requestCode: string; status: string;
    destination: string; departureDate: string; transportType: string;
  }[];
  return (isAdmin ? all : all.filter(r => r.transportType === mode)).map(r => ({
    employeeId:    r.employeeId,
    employeeName:  r.employeeName,
    employeeCode:  r.employeeCode ?? "",
    department:    r.department ?? "",
    requestCode:   r.requestCode,
    status:        r.status,
    destination:   r.destination,
    departureDate: r.departureDate,
  }));
}

// ── Employee "By Travel Mode" tab (own data only) ─────────────────────────────
function ByTravelModeTab({
  transport, from, to,
}: {
  transport: TransportStat[]; from: string; to: string;
}) {
  const chartRef              = useRef<HTMLCanvasElement>(null);
  const [sel, setSel]         = useState<string | null>(null);
  const [list, setList]       = useState<ModeEmployee[]>([]);
  const [loading, setLoading] = useState(false);

  // Table sort+search
  const ss = useSortSearch<TransportStat>(transport, "count", "desc");
  const modeRows = ss.filter((t, sq) => {
    const s = sq.toLowerCase();
    return t.transport.toLowerCase().includes(s) || String(t.count).includes(s) || fmt(t.totalAmount).toLowerCase().includes(s);
  });

  const labels = transport.map(t => t.transport);
  const colors  = labels.map(l => TC[l] ?? "#64748b");

  const cfg: ChartConfiguration = {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "My Trips",
        data: transport.map(t => t.count),
        backgroundColor: colors.map((c, i) => sel === labels[i] ? c + "ee" : c + "44"),
        borderColor: colors,
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
        tooltip: {
          callbacks: {
            label: ctx => [
              ` Trips: ${ctx.parsed.x}`,
              ` Expenses: ${fmt(transport[ctx.dataIndex]?.totalAmount ?? 0)}`,
              " Click for trip details",
            ],
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: G } },
        y: { grid: { display: false } },
      },
    },
  };

  const click = async (idx: number) => {
    const m = labels[idx];
    if (sel === m) { setSel(null); setList([]); return; }
    setSel(m); setLoading(true);
    setList(await fetchModeTrips(m, false));
    setLoading(false);
  };
  useChart(chartRef, cfg, click);

  const selStat = transport.find(t => t.transport === sel);
  const csv = transport.map(t => ({
    Mode: t.transport, "My Trips": t.count, "Total Expenses": t.totalAmount,
    From: from || "All", To: to || "All",
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Mode summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
        {transport.map((t, i) => {
          const c = TC[t.transport] ?? "#64748b";
          return (
            <div key={t.transport} onClick={() => void click(i)}
              style={{ background: sel === t.transport ? c + "11" : "#fff", border: `1.5px solid ${sel === t.transport ? c : "#e2e8f0"}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", transition: "all 0.15s" }}>
              <div style={{ fontSize: 20, marginBottom: 3 }}>{modeIcon(t.transport)}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{t.count}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>{t.transport}</div>
              {/* totalAmount from backend ExpenseClaims sum for this mode */}
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(t.totalAmount)}</div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div id="emp-mode-chart" style={{ background: "#fff", borderRadius: 16, padding: "18px 22px", border: "1.5px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
              My Trips by Mode — Click any bar for trip details
            </p>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>
              {sel ? `Showing: ${sel} (${selStat ? fmt(selStat.totalAmount) : "—"} expenses)` : "Select a bar"}
              {from ? `  ·  ${from} → ${to}` : ""}
            </p>
          </div>
          <ExBtn onCSV={() => exportCSV(csv, "my-trips-by-mode")} onPDF={() => exportPDF("My Travel Mode Report", "emp-mode-chart")} />
        </div>
        <div style={{ height: Math.max(160, transport.length * 54 + 40), position: "relative" }}>
          <canvas ref={chartRef} style={{ cursor: "pointer" }} role="img" aria-label="My trips by mode" />
        </div>
      </div>

      {/* Mode summary table */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Mode Summary</span>
          <input
            type="text" value={ss.q} onChange={e => ss.setQ(e.target.value)}
            placeholder="🔍 Search…"
            style={{ flex: 1, minWidth: 140, padding: "5px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 12, fontFamily: FF, outline: "none" }}
          />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                <Th label="Mode"          col="transport"   arrow={ss.arrow} tog={ss.tog} />
                <Th label="My Trips"      col="count"       arrow={ss.arrow} tog={ss.tog} />
                <Th label="Total Expenses" col="totalAmount" arrow={ss.arrow} tog={ss.tog} />
              </tr>
            </thead>
            <tbody>
              {modeRows.length === 0
                ? <tr><td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>No data.</td></tr>
                : modeRows.map((t, i) => {
                  const c = TC[t.transport] ?? "#64748b";
                  const origIdx = transport.findIndex(x => x.transport === t.transport);
                  return (
                    <tr key={t.transport}
                      style={{ borderBottom: "1px solid #f8fafc", cursor: "pointer" }}
                      onClick={() => void click(origIdx)}
                      onMouseEnter={ev => (ev.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: DC[i % DC.length], flexShrink: 0 }} />
                          <span style={{ fontSize: 16 }}>{modeIcon(t.transport)}</span>
                          <strong style={{ color: "#0f172a" }}>{t.transport}</strong>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: c, fontSize: 13 }}>{t.count}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: "#1e40af", fontSize: 13 }}>{fmt(t.totalAmount)}</td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
        <div style={{ padding: "8px 14px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{modeRows.length} of {transport.length} modes</span>
        </div>
      </div>

      {/* Drill-down drawer */}
      {sel && (
        loading
          ? <div style={{ background: "#fff", borderRadius: 16, padding: "28px 24px", border: "1.5px solid #e2e8f0", textAlign: "center", color: "#94a3b8" }}>
              ⏳ Loading {sel} trips…
            </div>
          : <ModeDrawer
              mode={sel}
              list={list}
              totalAmount={selStat?.totalAmount ?? 0}
              onClose={() => { setSel(null); setList([]); }}
            />
      )}
    </div>
  );
}

// ── Admin Analytics tab ───────────────────────────────────────────────────────
function AdminAnalytics({
  transport, employees, departments, from, to,
}: {
  transport:   TransportStat[];
  employees:   EmployeeStat[];
  departments: DepartmentStat[];
  from: string; to: string;
}) {
  const [view,     setView]     = useState<AnalyticsView>("mode");
  const [sel,      setSel]      = useState<string | null>(null);
  const [list,     setList]     = useState<ModeEmployee[]>([]);
  const [loadingM, setLoadingM] = useState(false);
  const chartRef = useRef<HTMLCanvasElement>(null);

  // Independent sort+search per view
  const modeSS = useSortSearch<TransportStat>(transport,    "count",        "desc");
  const empSS  = useSortSearch<EmployeeStat>(employees,     "totalAmount",  "desc");
  const deptSS = useSortSearch<DepartmentStat>(departments, "requestCount", "desc");

  const chView = (v: AnalyticsView) => {
    setView(v); setSel(null); setList([]);
    modeSS.setQ(""); empSS.setQ(""); deptSS.setQ("");
  };

  // Filtered + sorted rows
  const modeRows = modeSS.filter((t, sq) => {
    const s = sq.toLowerCase();
    return t.transport.toLowerCase().includes(s) || String(t.count).includes(s) || fmt(t.totalAmount).toLowerCase().includes(s);
  });

  const empRows = empSS.filter((e, sq) => {
    const s = sq.toLowerCase();
    return (
      e.displayName.toLowerCase().includes(s)  ||
      e.employeeCode.toLowerCase().includes(s) ||
      (e.department ?? "").toLowerCase().includes(s) ||
      String(e.claimCount).includes(s)         ||
      String(e.approved).includes(s)           ||
      String(e.pending).includes(s)            ||
      fmt(e.totalAmount).toLowerCase().includes(s)
    );
  });

  const deptRows = deptSS.filter((d, sq) => {
    const s = sq.toLowerCase();
    return (
      (d.department ?? "").toLowerCase().includes(s) ||
      String(d.requestCount).includes(s)             ||
      String(d.approved).includes(s)                 ||
      String(d.pending).includes(s)                  ||
      fmt(d.expenseTotal).toLowerCase().includes(s)
    );
  });

  // Active search for current view
  const { q: aq, setQ: aSetQ } =
    view === "employee" ? empSS : view === "department" ? deptSS : modeSS;

  // ── Chart configurations ──────────────────────────────────────────────────
  const tLabels = transport.map(t => t.transport);
  const tColors  = tLabels.map(l => TC[l] ?? "#64748b");

  // By Mode: horizontal bar — trip counts
  const modeCfg: ChartConfiguration = {
    type: "bar",
    data: {
      labels: tLabels,
      datasets: [{
        label: "Trips",
        data: transport.map(t => t.count),
        backgroundColor: tColors.map((c, i) => sel === tLabels[i] ? c + "ee" : c + "44"),
        borderColor: tColors, borderWidth: 2, borderRadius: 8,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => [
              ` Trips: ${ctx.parsed.x}`,
              ` Expenses: ${fmt(transport[ctx.dataIndex]?.totalAmount ?? 0)}`,
              " Click for employee list",
            ],
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: G } },
        y: { grid: { display: false } },
      },
    },
  };

  // ── By Employee: horizontal bar showing totalAmount (compact, matches Mode style)
  // FIX: was vertical grouped bar (approved/pending) — now horizontal totalAmount
  // This avoids the "very big" chart issue and matches the By Travel Mode aesthetic
  const empCfg: ChartConfiguration = {
    type: "bar",
    data: {
      labels: empRows.slice(0, 8).map(e => e.displayName.split(" ")[0]),
      datasets: [{
        label: "Total Expenses",
        data: empRows.slice(0, 8).map(e => e.totalAmount),
        backgroundColor: empRows.slice(0, 8).map((_, i) => DC[i % DC.length] + "55"),
        borderColor:      empRows.slice(0, 8).map((_, i) => DC[i % DC.length]),
        borderWidth: 2,
        borderRadius: 8,
      }],
    },
    options: {
      indexAxis: "y",   // ← horizontal, matches By Travel Mode
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => [
              ` Total Expenses: ${fmt(ctx.parsed.x)}`,
              ` Claims: ${empRows[ctx.dataIndex]?.claimCount ?? 0}`,
              ` Approved: ${empRows[ctx.dataIndex]?.approved ?? 0}`,
              ` Pending: ${empRows[ctx.dataIndex]?.pending ?? 0}`,
            ],
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { callback: (v: unknown) => typeof v === "number" ? fmt(v) : "" },
          grid: { color: G },
        },
        y: { grid: { display: false } },
      },
    },
  };

  // By Department: horizontal bar — request counts
  const deptCfg: ChartConfiguration = {
    type: "bar",
    data: {
      labels: deptRows.slice(0, 8).map(d => d.department || "Unknown"),
      datasets: [{
        label: "Requests",
        data: deptRows.slice(0, 8).map(d => d.requestCount),
        backgroundColor: deptRows.slice(0, 8).map((_, i) => DC[i % DC.length] + "44"),
        borderColor:      deptRows.slice(0, 8).map((_, i) => DC[i % DC.length]),
        borderWidth: 2, borderRadius: 6,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => [
              ` Requests: ${ctx.parsed.x}`,
              ` Expenses: ${fmt(deptRows[ctx.dataIndex]?.expenseTotal ?? 0)}`,
            ],
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: G } },
        y: { grid: { display: false } },
      },
    },
  };

  const chartCfg: ChartConfiguration | null =
    view === "mode"       && transport.length > 0 ? modeCfg :
    view === "employee"   && empRows.length > 0   ? empCfg  :
    view === "department" && deptRows.length > 0  ? deptCfg :
    null;

  const modeClick = async (idx: number) => {
    if (view !== "mode") return;
    const m = tLabels[idx]; if (!m) return;
    if (sel === m) { setSel(null); setList([]); return; }
    setSel(m); setLoadingM(true);
    setList(await fetchModeTrips(m, true));
    setLoadingM(false);
  };
  useChart(chartRef, chartCfg, view === "mode" ? modeClick : undefined);

  const selStat    = transport.find(t => t.transport === sel);
  const pdfId      = "admin-analytics-content";
  const countLabel =
    view === "mode" ? `${modeRows.length} modes` :
    view === "employee" ? `${empRows.length} employees` :
    `${deptRows.length} departments`;

  const modeCsv = modeRows.map(t => ({ Mode: t.transport, Trips: t.count, "Total Expenses": t.totalAmount, From: from || "All", To: to || "All" }));
  const empCsv  = empRows.map(e  => ({ Employee: e.displayName, Code: e.employeeCode, Department: e.department || "—", Claims: e.claimCount, Approved: e.approved, Pending: e.pending, "Total Expenses": e.totalAmount }));
  const deptCsv = deptRows.map(d => ({ Department: d.department || "Unknown", Requests: d.requestCount, Approved: d.approved, Pending: d.pending, "Total Expenses": d.expenseTotal, From: from || "All", To: to || "All" }));
  const activeCsv = view === "mode" ? modeCsv : view === "employee" ? empCsv : deptCsv;

  const chartHeight =
    view === "mode"       ? Math.max(160, transport.length * 54 + 40) :
    view === "employee"   ? Math.max(160, Math.min(empRows.length, 8) * 54 + 40) :
    Math.max(160, Math.min(deptRows.length, 8) * 54 + 40);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Controls */}
      <div style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1.5px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>View:</label>
        <select value={view} onChange={e => chView(e.target.value as AnalyticsView)}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: FF, fontWeight: 700, background: "#f8fafc", color: "#0f172a", outline: "none", cursor: "pointer" }}>
          <option value="mode">✈️  By Travel Mode</option>
          <option value="employee">👤  By Employee</option>
          <option value="department">🏢  By Department</option>
        </select>

        <input
          type="text" value={aq} onChange={e => aSetQ(e.target.value)}
          placeholder={
            view === "mode"       ? "🔍 Search mode, trips, amount…" :
            view === "employee"   ? "🔍 Search name, code, dept, amount…" :
            "🔍 Search department, requests, expenses…"
          }
          style={{ flex: 1, minWidth: 200, padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: FF, outline: "none" }}
        />

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{countLabel}</span>
          <ExBtn
            onCSV={() => exportCSV(activeCsv, `analytics-${view}`)}
            onPDF={() => exportPDF(`Analytics — ${view}`, pdfId)}
          />
        </div>
      </div>

      {/* Chart */}
      {chartCfg && (
        <div style={{ background: "#fff", borderRadius: 16, padding: "18px 22px", border: "1.5px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
            {view === "mode"       ? "Trips by Travel Mode — Click a bar to see employees" :
             view === "employee"   ? "Total Expenses per Employee (Top 8)" :
             "Requests per Department (Top 8)"}
          </p>
          {view === "mode" && (
            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
              {sel
                ? `${sel} — ${selStat ? fmt(selStat.totalAmount) : "—"} total expenses · employees below`
                : "Click any bar to drill down"}
              {from ? `  ·  ${from} → ${to}` : ""}
            </p>
          )}
          {view === "employee" && (
            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
              Showing top 8 by {empSS.sc === "totalAmount" ? "expenses" : empSS.sc} · hover for claim breakdown
            </p>
          )}
          <div style={{ height: chartHeight, position: "relative" }}>
            <canvas ref={chartRef} style={{ cursor: view === "mode" ? "pointer" : "default" }} role="img" aria-label={`Analytics chart: ${view}`} />
          </div>
        </div>
      )}

      {/* Mode drill-down drawer */}
      {view === "mode" && sel && (
        loadingM
          ? <div style={{ background: "#fff", borderRadius: 16, padding: "24px", border: "1.5px solid #e2e8f0", textAlign: "center", color: "#94a3b8" }}>
              ⏳ Loading {sel} employees…
            </div>
          : <ModeDrawer
              mode={sel}
              list={list}
              totalAmount={selStat?.totalAmount ?? 0}
              onClose={() => { setSel(null); setList([]); }}
            />
      )}

      {/* Tables */}
      <div id={pdfId}>

        {/* ── By Mode table ── */}
        {view === "mode" && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: "14px 14px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>All Travel Modes</span>
              {from && <span style={{ fontSize: 11, color: "#94a3b8" }}>· {from} → {to}</span>}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                    <Th label="Mode"           col="transport"   arrow={modeSS.arrow} tog={modeSS.tog} />
                    <Th label="Total Trips"    col="count"       arrow={modeSS.arrow} tog={modeSS.tog} />
                    {/* totalAmount = sum of ExpenseClaims where category LIKE mode (from backend) */}
                    <Th label="Total Expenses" col="totalAmount" arrow={modeSS.arrow} tog={modeSS.tog} />
                  </tr>
                </thead>
                <tbody>
                  {modeRows.length === 0
                    ? <tr><td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>No data.</td></tr>
                    : modeRows.map((t, i) => {
                      const c = TC[t.transport] ?? "#64748b";
                      const origIdx = transport.findIndex(x => x.transport === t.transport);
                      return (
                        <tr key={t.transport}
                          style={{ borderBottom: "1px solid #f8fafc", cursor: "pointer" }}
                          onClick={() => void modeClick(origIdx)}
                          onMouseEnter={ev => (ev.currentTarget.style.background = "#f8fafc")}
                          onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: DC[i % DC.length], flexShrink: 0 }} />
                              <span style={{ fontSize: 16 }}>{modeIcon(t.transport)}</span>
                              <strong style={{ color: "#0f172a" }}>{t.transport}</strong>
                            </div>
                          </td>
                          <td style={{ padding: "10px 14px", fontWeight: 800, color: c, fontSize: 13 }}>{t.count}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 800, color: "#1e40af", fontSize: 13 }}>{fmt(t.totalAmount)}</td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 14px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{modeRows.length} of {transport.length} modes</span>
            </div>
          </div>
        )}

        {/* ── By Employee table ── */}
        {view === "employee" && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
            {empRows.length === 0
              ? (
                <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>👤</div>
                  <p style={{ fontWeight: 700, color: "#64748b", margin: 0 }}>No employee expense data for this period.</p>
                  <p style={{ fontSize: 12, margin: "6px 0 0" }}>Try a wider date range or check that expense claims have been submitted.</p>
                </div>
              ) : (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                          <th style={{ padding: "9px 12px", background: "#f8fafc", fontWeight: 700, color: "#64748b", fontSize: 11, textTransform: "uppercase", width: 36 }}>#</th>
                          <Th label="Employee"       col="displayName"  arrow={empSS.arrow} tog={empSS.tog} />
                          <Th label="Code"           col="employeeCode" arrow={empSS.arrow} tog={empSS.tog} />
                          <Th label="Department"     col="department"   arrow={empSS.arrow} tog={empSS.tog} />
                          <Th label="Claims"         col="claimCount"   arrow={empSS.arrow} tog={empSS.tog} />
                          <Th label="Approved"       col="approved"     arrow={empSS.arrow} tog={empSS.tog} />
                          <Th label="Pending"        col="pending"      arrow={empSS.arrow} tog={empSS.tog} />
                          {/* Total Expenses = sum of ExpenseClaims.Amount for this employee */}
                          <Th label="Total Expenses" col="totalAmount"  arrow={empSS.arrow} tog={empSS.tog} />
                        </tr>
                      </thead>
                      <tbody>
                        {empRows.map((e, i) => (
                          // FIX: use employeeId as key (unique int from backend)
                          <tr key={e.employeeId}
                            style={{ borderBottom: "1px solid #f8fafc" }}
                            onMouseEnter={ev => (ev.currentTarget.style.background = "#f8fafc")}
                            onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                            <td style={{ padding: "9px 12px", color: "#94a3b8", fontWeight: 700 }}>#{i + 1}</td>
                            <td style={{ padding: "9px 12px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#3b82f611", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#3b82f6", flexShrink: 0 }}>
                                  {e.displayName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                                </div>
                                <strong style={{ color: "#0f172a" }}>{e.displayName}</strong>
                              </div>
                            </td>
                            <td style={{ padding: "9px 12px", color: "#64748b", fontFamily: "monospace" }}>{e.employeeCode || "—"}</td>
                            <td style={{ padding: "9px 12px" }}>
                              {e.department
                                ? <span style={{ background: "#eef2ff", color: "#4f46e5", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>🏢 {e.department}</span>
                                : <span style={{ color: "#94a3b8" }}>—</span>}
                            </td>
                            <td style={{ padding: "9px 12px", fontWeight: 700, color: "#0f172a" }}>{e.claimCount}</td>
                            <td style={{ padding: "9px 12px" }}>
                              <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{e.approved}</span>
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              <span style={{ background: "#fef9c3", color: "#854d0e", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{e.pending}</span>
                            </td>
                            {/* totalAmount directly from API — no client-side recalculation */}
                            <td style={{ padding: "9px 12px", fontWeight: 800, color: "#1e40af", fontSize: 13 }}>{fmt(e.totalAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: "8px 12px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{empRows.length} of {employees.length} employees</span>
                  </div>
                </>
              )
            }
          </div>
        )}

        {/* ── By Department table ── */}
        {view === "department" && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
            {deptRows.length === 0
              ? (
                <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🏢</div>
                  <p style={{ fontWeight: 700, color: "#64748b", margin: 0 }}>No department data for this period.</p>
                  <p style={{ fontSize: 12, margin: "6px 0 0" }}>
                    Department is read from TravelRequest.Department.
                    Ensure travel requests have a department set (run DB migration if recently added).
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                          <Th label="Department"     col="department"   arrow={deptSS.arrow} tog={deptSS.tog} />
                          <Th label="Requests"       col="requestCount" arrow={deptSS.arrow} tog={deptSS.tog} />
                          {/* approved/pending = TravelRequest status counts (not expense counts) */}
                          <Th label="Req Approved"   col="approved"     arrow={deptSS.arrow} tog={deptSS.tog} />
                          <Th label="Req Pending"    col="pending"      arrow={deptSS.arrow} tog={deptSS.tog} />
                          {/* expenseTotal = sum of ExpenseClaims for all requests in this dept & date range */}
                          <Th label="Total Expenses" col="expenseTotal" arrow={deptSS.arrow} tog={deptSS.tog} />
                        </tr>
                      </thead>
                      <tbody>
                        {deptRows.map((d, i) => (
                          <tr key={d.department}
                            style={{ borderBottom: "1px solid #f8fafc" }}
                            onMouseEnter={ev => (ev.currentTarget.style.background = "#f8fafc")}
                            onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                            <td style={{ padding: "9px 12px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 2, background: DC[i % DC.length], flexShrink: 0 }} />
                                <strong style={{ color: "#0f172a" }}>{d.department || "Unknown"}</strong>
                              </div>
                            </td>
                            <td style={{ padding: "9px 12px", fontWeight: 700, color: "#0f172a" }}>{d.requestCount}</td>
                            <td style={{ padding: "9px 12px" }}>
                              <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{d.approved}</span>
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              <span style={{ background: "#fef9c3", color: "#854d0e", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{d.pending}</span>
                            </td>
                            {/* expenseTotal from API — backend sums ExpenseClaims for this dept correctly */}
                            <td style={{ padding: "9px 12px", fontWeight: 800, color: "#1e40af", fontSize: 13 }}>{fmt(d.expenseTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: "8px 12px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{deptRows.length} department{deptRows.length !== 1 ? "s" : ""}</span>
                  </div>
                </>
              )
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin Overview charts ─────────────────────────────────────────────────────
function AdminOverview({ s, from, to }: { s: Summary; from: string; to: string }) {
  const r1 = useRef<HTMLCanvasElement>(null);
  const r2 = useRef<HTMLCanvasElement>(null);

  useChart(r1, {
    type: "bar",
    data: {
      labels: ["Approved", "Pending", "Rejected"],
      datasets: [{
        label: "Requests",
        data: [s.approvedRequests, s.pendingRequests, s.rejectedRequests],
        backgroundColor: ["#10b98122", "#f59e0b22", "#ef444422"],
        borderColor: ["#10b981", "#f59e0b", "#ef4444"],
        borderWidth: 2, borderRadius: 8,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: G } }, x: { grid: { display: false } } },
    },
  });

  useChart(r2, {
    type: "bar",
    data: {
      labels: ["Total", "Approved", "Pending"],
      datasets: [{
        label: "₹",
        data: [s.totalExpenses, s.approvedExpenses, s.pendingExpenses],
        backgroundColor: ["#3b82f622", "#10b98122", "#f59e0b22"],
        borderColor: ["#3b82f6", "#10b981", "#f59e0b"],
        borderWidth: 2, borderRadius: 8,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.parsed.y as number)}` } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => (v == null ? "" : fmt(v as number)) }, grid: { color: G } }, x: { grid: { display: false } } },
    },
  });

  const csv = [
    { Metric: "Total Requests",    Value: s.totalRequests,    From: from || "All", To: to || "All" },
    { Metric: "Pending",           Value: s.pendingRequests,  From: from || "All", To: to || "All" },
    { Metric: "Approved",          Value: s.approvedRequests, From: from || "All", To: to || "All" },
    { Metric: "Rejected",          Value: s.rejectedRequests, From: from || "All", To: to || "All" },
    { Metric: "Total Expenses",    Value: s.totalExpenses,    From: from || "All", To: to || "All" },
    { Metric: "Pending Expenses",  Value: s.pendingExpenses,  From: from || "All", To: to || "All" },
    { Metric: "Approved Expenses", Value: s.approvedExpenses, From: from || "All", To: to || "All" },
    { Metric: "Active Employees",  Value: s.totalEmployees,   From: from || "All", To: to || "All" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <ExBtn onCSV={() => exportCSV(csv, "overview-summary")} onPDF={() => exportPDF("Overview Report", "admin-overview")} label="Export:" />
      </div>
      <div id="admin-overview" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        {[
          {
            ref: r1, title: "Requests by Status",
            sub: from ? `${from} → ${to}` : "All time",
            lg: [{ l: "Approved", c: "#10b981", v: String(s.approvedRequests) }, { l: "Pending", c: "#f59e0b", v: String(s.pendingRequests) }, { l: "Rejected", c: "#ef4444", v: String(s.rejectedRequests) }],
          },
          {
            ref: r2, title: "Expense Pipeline",
            sub: `Total includes non-rejected claims${from ? ` · ${from} → ${to}` : ""}`,
            lg: [{ l: "Total", c: "#3b82f6", v: fmt(s.totalExpenses) }, { l: "Approved", c: "#10b981", v: fmt(s.approvedExpenses) }, { l: "Pending", c: "#f59e0b", v: fmt(s.pendingExpenses) }],
          },
        ].map(card => (
          <div key={card.title} style={{ background: "#fff", borderRadius: 16, padding: "18px 22px", border: "1.5px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{card.title}</p>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 9px" }}>{card.sub}</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 9, flexWrap: "wrap" }}>
              {card.lg.map(x => (
                <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  <div style={{ width: 9, height: 9, borderRadius: 2, background: x.c }} />
                  <span style={{ color: "#64748b" }}>{x.l}:</span>
                  <strong style={{ color: "#0f172a" }}>{x.v}</strong>
                </div>
              ))}
            </div>
            <div style={{ height: 200 }}><canvas ref={card.ref} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const navigate  = useNavigate();
  const fullName  = localStorage.getItem("full_name") ?? "Employee";
  const role      = localStorage.getItem("role") ?? "Employee";
  const initials  = fullName.trim().split(" ").filter(Boolean).map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";
  const isAdmin   = ["admin", "hr", "Admin", "HR"].includes(role);

  const [sum,     setSum]     = useState<Summary | null>(null);
  const [tr,      setTr]      = useState<TransportStat[]>([]);
  const [emp,     setEmp]     = useState<EmployeeStat[]>([]);
  const [dept,    setDept]    = useState<DepartmentStat[]>([]);
  const [loading, setLoading] = useState(true);

  // Period selection
  const [period,  setPeriod]  = useState<PeriodType>("monthly");
  const [cf,      setCf]      = useState("");                   // custom from
  const [ct,      setCt]      = useState(toISO(today));         // custom to
  const [dateErr, setDateErr] = useState("");

  // Resolved range (set on Apply — what was actually sent to the API)
  const [rFrom,   setRFrom]   = useState("");
  const [rTo,     setRTo]     = useState("");

  const [empTab,   setEmpTab]   = useState<EmployeeTab>("overview");
  const [adminTab, setAdminTab] = useState<AdminTab>("overview");

  // ── Compute effective from/to ─────────────────────────────────────────────
  const getRange = useCallback((): { from: string; to: string } | null => {
    if (period === "custom") {
      if (!cf) { setDateErr("Please select a From date."); return null; }
      if (!ct) { setDateErr("Please select a To date."); return null; }
      if (cf > ct) { setDateErr('"From" date must be before or equal to "To" date.'); return null; }
      setDateErr("");
      return { from: cf, to: ct };
    }
    setDateErr("");
    return getPeriodDates(period);
  }, [period, cf, ct]);

  // ── Load all report data ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    const range = getRange();
    if (!range) return;                        // validation failed — don't fetch

    setLoading(true);
    const { from, to } = range;
    setRFrom(from);
    setRTo(to);

    // Build QS with inclusive "to" (T23:59:59)
    const qs = buildQS(from, to);

    // Employee uses JWT-scoped endpoint; admin uses org-wide
    const trEndpoint = isAdmin
      ? `/Report/by-transport?${qs.toString()}`
      : `/Report/my-transport?${qs.toString()}`;

    const [rSum, rTr, rEmp, rDept] = await Promise.allSettled([
      get<Summary>(`/Report/dashboard?${qs.toString()}`),
      get<TransportStat[]>(trEndpoint).catch(() => [] as TransportStat[]),
      isAdmin
        ? get<EmployeeStat[]>(`/Report/by-employee?${qs.toString()}`).catch(() => [] as EmployeeStat[])
        : Promise.resolve([] as EmployeeStat[]),
      isAdmin
        ? get<DepartmentStat[]>(`/Report/by-department?${qs.toString()}`).catch(() => [] as DepartmentStat[])
        : Promise.resolve([] as DepartmentStat[]),
    ]);

    if (rSum.status  === "fulfilled") setSum(rSum.value);
    if (rTr.status   === "fulfilled") setTr(rTr.value);
    if (rEmp.status  === "fulfilled") setEmp(rEmp.value);
    if (rDept.status === "fulfilled") setDept(rDept.value);

    setLoading(false);
  }, [getRange, isAdmin]);

  useEffect(() => { void load(); }, [load]);

  // Tab button
  const tabBtn = (key: string, label: string, active: boolean, fn: () => void) => (
    <button key={key} onClick={fn} style={{
      padding: "7px 18px", borderRadius: 10, border: "none", fontWeight: 700,
      fontSize: 12, cursor: "pointer",
      background: active ? "#fff" : "transparent",
      color: active ? "#1e40af" : "#64748b",
      boxShadow: active ? "0 1px 6px rgba(0,0,0,0.1)" : "none",
      transition: "all 0.15s",
    }}>{label}</button>
  );

  // Employee KPI export data
  const empKpiCsv = sum ? [
    { Metric: "My Requests",       Value: sum.totalRequests,    From: rFrom || "All", To: rTo || "All" },
    { Metric: "Approved",          Value: sum.approvedRequests, From: rFrom || "All", To: rTo || "All" },
    { Metric: "Pending",           Value: sum.pendingRequests,  From: rFrom || "All", To: rTo || "All" },
    { Metric: "Rejected",          Value: sum.rejectedRequests, From: rFrom || "All", To: rTo || "All" },
    { Metric: "Total Expenses",    Value: sum.totalExpenses,    From: rFrom || "All", To: rTo || "All" },
    { Metric: "Approved Expenses", Value: sum.approvedExpenses, From: rFrom || "All", To: rTo || "All" },
    { Metric: "Pending Expenses",  Value: sum.pendingExpenses,  From: rFrom || "All", To: rTo || "All" },
  ] : [];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#f0f4f8,#e8edf5)", fontFamily: FF }}>
      <CommonNavbar
        showBack={true}
        onBack={() => navigate("/dashboard")}
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={async () => signOutUser()}
      />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px 60px" }}>

        {/* Hero */}
        <div style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", borderRadius: 20, padding: "24px 28px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, boxShadow: "0 8px 32px rgba(15,23,42,0.28)" }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Analytics</p>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0 }}>📊 Travel & Expense Reports</h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              {isAdmin ? "Organisation-wide intelligence" : "Your personal travel summary"}
            </p>
          </div>
          <button onClick={() => navigate("/dashboard")} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.18)", borderRadius: 10, color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            ← Dashboard
          </button>
        </div>

        {/* Period filter — Apply re-fetches ALL endpoints with corrected dates */}
        <PeriodFilter
          period={period} setPeriod={p => { setPeriod(p); setDateErr(""); }}
          cf={cf}         setCf={setCf}
          ct={ct}         setCt={setCt}
          onApply={() => void load()}
          error={dateErr}
        />

        {/* Active range chip */}
        {(rFrom || rTo) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, marginTop: -8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>Showing data for:</span>
            <span style={{ fontSize: 11, background: "#0f172a", color: "#fff", borderRadius: 6, padding: "2px 10px", fontWeight: 700 }}>
              {rFrom || "—"} → {rTo || "—"}
            </span>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 3, marginBottom: 20, background: "#e2e8f0", borderRadius: 12, padding: 3, width: "fit-content" }}>
          {isAdmin
            ? [
                tabBtn("overview",  "Overview",  adminTab === "overview",  () => setAdminTab("overview")),
                tabBtn("analytics", "Analytics", adminTab === "analytics", () => setAdminTab("analytics")),
              ]
            : [
                tabBtn("overview", "Overview",       empTab === "overview", () => setEmpTab("overview")),
                tabBtn("bymode",   "By Travel Mode", empTab === "bymode",   () => setEmpTab("bymode")),
              ]
          }
        </div>

        {/* Content */}
        {loading
          ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
              <p style={{ margin: 0 }}>Loading reports…</p>
            </div>
          )
          : isAdmin
          ? (
            <>
              {/* Admin Overview */}
              {adminTab === "overview" && sum && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12, marginBottom: 18 }}>
                    <KPI icon="✈️" label="Total Requests"    value={sum.totalRequests}         color="#3b82f6" />
                    <KPI icon="⏳" label="Pending"           value={sum.pendingRequests}       color="#f59e0b" />
                    <KPI icon="✅" label="Approved"          value={sum.approvedRequests}      color="#10b981" />
                    <KPI icon="❌" label="Rejected"          value={sum.rejectedRequests}      color="#ef4444" />
                    {/* totalExpenses = date-filtered, non-rejected expenses from dashboard endpoint */}
                    <KPI icon="💰" label="Total Expenses"    value={fmt(sum.totalExpenses)}    color="#8b5cf6" />
                    <KPI icon="⏳" label="Pending Expenses"  value={fmt(sum.pendingExpenses)}  color="#f59e0b" />
                    <KPI icon="✅" label="Approved Expenses" value={fmt(sum.approvedExpenses)} color="#10b981" />
                    <KPI icon="👥" label="Active Employees"  value={sum.totalEmployees}        color="#0ea5e9" />
                  </div>
                  <AdminOverview s={sum} from={rFrom} to={rTo} />
                </>
              )}

              {/* Admin Analytics */}
              {adminTab === "analytics" && (
                <AdminAnalytics
                  transport={tr}
                  employees={emp}
                  departments={dept}
                  from={rFrom}
                  to={rTo}
                />
              )}
            </>
          )
          : (
            <>
              {/* Employee Overview */}
              {empTab === "overview" && sum && (
                <>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                    <ExBtn
                      onCSV={() => exportCSV(empKpiCsv, "my-overview")}
                      onPDF={() => exportPDF("My Travel Summary", "emp-overview")}
                      label="Export:"
                    />
                  </div>
                  <div id="emp-overview">
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 12, marginBottom: 18 }}>
                      <KPI icon="✈️" label="My Requests"      value={sum.totalRequests}         color="#3b82f6" />
                      <KPI icon="✅" label="Approved"          value={sum.approvedRequests}      color="#10b981" />
                      <KPI icon="⏳" label="Pending"           value={sum.pendingRequests}       color="#f59e0b" />
                      <KPI icon="❌" label="Rejected"          value={sum.rejectedRequests}      color="#ef4444" />
                      <KPI icon="💰" label="Total Expenses"    value={fmt(sum.totalExpenses)}    color="#8b5cf6" />
                      <KPI icon="✅" label="Approved Expenses" value={fmt(sum.approvedExpenses)} color="#10b981" />
                      <KPI icon="⏳" label="Pending Expenses"  value={fmt(sum.pendingExpenses)}  color="#f59e0b" />
                    </div>

                    {/* Approval rate bar */}
                    {sum.totalRequests > 0 && (
                      <div style={{ background: "#fff", borderRadius: 16, padding: "18px 22px", border: "1.5px solid #e2e8f0", marginBottom: 18 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                          Request Approval Rate
                        </p>
                        {rFrom && (
                          <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 8px" }}>{rFrom} → {rTo}</p>
                        )}
                        <div style={{ display: "flex", height: 26, borderRadius: 8, overflow: "hidden" }}>
                          {[
                            { l: "Approved", n: sum.approvedRequests, c: "#10b981" },
                            { l: "Pending",  n: sum.pendingRequests,  c: "#f59e0b" },
                            { l: "Rejected", n: sum.rejectedRequests, c: "#ef4444" },
                          ].filter(x => x.n > 0).map(x => (
                            <div key={x.l} style={{
                              width: `${(x.n / sum.totalRequests) * 100}%`,
                              background: x.c,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "#fff", fontSize: 11, fontWeight: 700, transition: "width 0.5s",
                            }}>
                              {Math.round((x.n / sum.totalRequests) * 100)}%
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                          {[{ l: "Approved", c: "#10b981" }, { l: "Pending", c: "#f59e0b" }, { l: "Rejected", c: "#ef4444" }].map(x => (
                            <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b" }}>
                              <div style={{ width: 9, height: 9, borderRadius: 2, background: x.c }} />{x.l}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Employee By Travel Mode */}
              {empTab === "bymode" && (
                tr.length === 0
                  ? (
                    <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>✈️</div>
                      <p style={{ margin: 0, fontWeight: 700, color: "#64748b" }}>No travel mode data for this period.</p>
                      <p style={{ margin: "6px 0 0", fontSize: 12 }}>Try selecting a wider date range and clicking Apply.</p>
                    </div>
                  )
                  : <ByTravelModeTab transport={tr} from={rFrom} to={rTo} />
              )}
            </>
          )
        }
      </main>
    </div>
  );
}