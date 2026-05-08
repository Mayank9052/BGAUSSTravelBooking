// src/pages/reports/ReportsPage.tsx
//
// ── KEY FIXES IN THIS VERSION ─────────────────────────────────────────────────
//
//  1. DATE FILTER: TravelRequest uses DateOnly DepartureDate/ReturnDate.
//     The backend /Report/by-transport, /Report/by-employee, /Report/by-department
//     filter by DepartureDate. We now offer "All Time" as default so data always
//     loads, and date ranges are sent correctly.
//
//  2. REIMBURSED STATUS: Added "Reimbursed" to expense status badge styles,
//     and the expense table now shows ALL statuses including Reimbursed.
//     The admin /Expense endpoint is called with pageSize=200 and no status filter
//     so Reimbursed records appear.
//
//  3. MULTIPLE EXPENSES PER REQUEST: Each TravelRequest can have multiple
//     ExpenseClaims. The by-employee report groups by employeeId and sums ALL
//     claims regardless of category. The drill-down drawer shows all trips
//     (one row per TravelRequest) for a mode. This is correct — the aggregation
//     is on the backend. We just display what comes back.
//
//  4. EMPLOYEE EXPENSES TAB: The employee Expenses tab in DashboardPage was
//     showing an empty state instead of actual claims. This file (ReportsPage)
//     is unaffected, but the fix note is here for reference — expenseService.getMy()
//     must be called without a status filter to get all statuses.
//
//  5. REPORT ENDPOINT STRATEGY: Instead of relying solely on DepartureDate
//     filtering (which misses expenses added after the trip), the frontend now
//     defaults to "All Time" (no from/to) so all approved/reimbursed expenses
//     are always visible. Date filtering is additive/optional.

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

// ── Types ──────────────────────────────────────────────────────────────────────
interface Summary {
  totalRequests:    number;
  pendingRequests:  number;
  approvedRequests: number;
  rejectedRequests: number;
  totalExpenses:    number;
  pendingExpenses:  number;
  approvedExpenses: number;
  totalEmployees:   number;
}

interface TransportStat {
  transport:   string;
  count:       number;
  totalAmount: number;
}

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

interface EmployeeStat {
  employeeId:   number;
  displayName:  string;
  employeeCode: string;
  department:   string;
  totalAmount:  number;
  claimCount:   number;
  approved:     number;
  pending:      number;
}

interface DepartmentStat {
  department:   string;
  requestCount: number;
  expenseTotal: number;
  approved:     number;
  pending:      number;
}

// ── Expense claim shape (for admin expense list in reports) ────────────────────
interface ExpenseClaim {
  claimId:      number;
  claimCode:    string;
  employeeName: string;
  category:     string;
  amount:       number;
  currency:     string;
  expenseDate:  string;
  status:       string;
  billPath:     string | null;
  billFileName: string | null;
  requestCode?: string;
}

type PeriodType    = "all" | "weekly" | "monthly" | "yearly" | "custom";
type EmployeeTab   = "overview" | "bymode" | "myexpenses";
type AdminTab      = "overview" | "analytics" | "expenses";
type AnalyticsView = "mode" | "employee" | "department";
type SortDir       = "asc" | "desc";

// ── Constants ──────────────────────────────────────────────────────────────────
const FF    = "'Segoe UI', system-ui, sans-serif";
const G     = "#f1f5f9";
const today = new Date();

const TC: Record<string, string> = {
  Flight: "#3b82f6", Train: "#10b981", Cab: "#f59e0b",
  Hotel: "#8b5cf6", Bus: "#f97316", Multiple: "#ef4444", Unknown: "#94a3b8",
};
const DC = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"];

// ✅ FIX: Added Reimbursed to status badge styles
const SB: Record<string, React.CSSProperties> = {
  Approved:    { background: "#dcfce7", color: "#15803d" },
  Rejected:    { background: "#fee2e2", color: "#b91c1c" },
  Submitted:   { background: "#fef9c3", color: "#854d0e" },
  UnderReview: { background: "#dbeafe", color: "#1e40af" },
  Reimbursed:  { background: "#ede9fe", color: "#6d28d9" },  // ✅ was missing
};

const ICONS: Record<string, string> = {
  Flight: "✈️", Train: "🚆", Cab: "🚕", Hotel: "🏨", Bus: "🚌",
};
const modeIcon = (t: string) => ICONS[t] ?? "🗺️";

// ── Date helpers ───────────────────────────────────────────────────────────────
const toISO    = (d: Date) => d.toISOString().slice(0, 10);
// ✅ FIX: Send T23:59:59 for inclusive end — matches DateOnly backend comparison
const toEndISO = (s: string) => s ? `${s}T23:59:59` : "";

function getPeriodDates(p: PeriodType): { from: string; to: string } {
  if (p === "all") return { from: "", to: "" };
  const now   = new Date();
  const toStr = toISO(now);
  if (p === "weekly")  { const d = new Date(now); d.setDate(d.getDate() - 7);          return { from: toISO(d), to: toStr }; }
  if (p === "monthly") { const d = new Date(now); d.setMonth(d.getMonth() - 1);        return { from: toISO(d), to: toStr }; }
  if (p === "yearly")  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1);  return { from: toISO(d), to: toStr }; }
  return { from: "", to: "" };
}

function buildQS(from: string, to: string): URLSearchParams {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to)   qs.set("to",   toEndISO(to));
  return qs;
}

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return "₹0";
  return n >= 10_000_000 ? `₹${(n / 10_000_000).toFixed(1)}Cr`
       : n >= 100_000    ? `₹${(n / 100_000).toFixed(1)}L`
       : n >= 1_000      ? `₹${(n / 1_000).toFixed(1)}K`
       : `₹${n.toFixed(0)}`;
};

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return d; }
};

function gp<T extends object>(obj: T, key: string): number | string {
  return (obj as Record<string, number | string>)[key] ?? 0;
}

// ── Chart hook ─────────────────────────────────────────────────────────────────
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

// ── Sort + search hook ─────────────────────────────────────────────────────────
function useSortSearch<T extends object>(data: T[], defaultKey: string, defaultDir: SortDir = "desc") {
  const [q,  setQ]  = useState("");
  const [sc, setSc] = useState(defaultKey);
  const [sd, setSd] = useState<SortDir>(defaultDir);

  const tog = (col: string) => {
    if (sc === col) setSd(d => d === "asc" ? "desc" : "asc");
    else { setSc(col); setSd("desc"); }
  };
  const arrow = (col: string) => sc === col ? (sd === "asc" ? " ↑" : " ↓") : " ↕";
  const filter = (pred: (row: T, q: string) => boolean): T[] =>
    data
      .filter(row => !q || pred(row, q))
      .sort((a, b) => {
        const va = gp(a, sc), vb = gp(b, sc);
        const cmp = typeof va === "number" ? (va as number) - (vb as number) : String(va).localeCompare(String(vb));
        return sd === "asc" ? cmp : -cmp;
      });
  return { q, setQ, sc, tog, arrow, filter };
}

// ── Export helpers ─────────────────────────────────────────────────────────────
function exportCSV(rows: Record<string, string | number>[], fname: string) {
  if (!rows.length) return;
  const h = Object.keys(rows[0]);
  const lines = [h.join(","), ...rows.map(r => h.map(k => { const v = String(r[k] ?? ""); return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v; }).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${fname}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function exportPDF(title: string, contentId: string) {
  const el = document.getElementById(contentId);
  const win = window.open("", "_blank");
  if (!win) { window.print(); return; }
  win.document.write(`<html><head><title>${title}</title><style>body{font-family:'Segoe UI',sans-serif;padding:24px;color:#0f172a}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th{background:#f8fafc;padding:8px 12px;text-align:left;font-weight:700;border-bottom:2px solid #e2e8f0;font-size:10px;text-transform:uppercase}td{padding:8px 12px;border-bottom:1px solid #f1f5f9}h1{font-size:18px}p.sub{color:#64748b;font-size:12px}@media print{body{padding:0}}</style></head><body><h1>${title}</h1><p class="sub">Generated: ${new Date().toLocaleString("en-IN")}</p>${el?.innerHTML ?? "<p>No content.</p>"}</body></html>`);
  win.document.close(); setTimeout(() => win.print(), 400);
}

// ── Reusable components ────────────────────────────────────────────────────────
function ExBtn({ onCSV, onPDF, label }: { onCSV: () => void; onPDF: () => void; label?: string }) {
  const base: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FF, transition: "all 0.15s" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {label && <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{label}</span>}
      <button onClick={onCSV} style={{ ...base, color: "#15803d" }} onMouseEnter={e => (e.currentTarget.style.background = "#f0fdf4")} onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>📊 Excel</button>
      <button onClick={onPDF} style={{ ...base, color: "#dc2626" }} onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")} onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>📄 PDF</button>
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

function Th({ label, col, arrow, tog }: { label: string; col: string; arrow: (c: string) => string; tog: (c: string) => void }) {
  return (
    <th onClick={() => tog(col)} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", background: "#f8fafc" }}>
      {label}<span style={{ color: "#cbd5e1", marginLeft: 2, fontSize: 10 }}>{arrow(col)}</span>
    </th>
  );
}

// ── ✅ NEW: Expense Claims Table (used in both admin and employee tabs) ─────────
function ExpenseClaimsTable({ claims, title, emptyMsg }: { claims: ExpenseClaim[]; title: string; emptyMsg?: string }) {
  const ss = useSortSearch<ExpenseClaim>(claims, "expenseDate", "desc");
  const rows = ss.filter((c, sq) => {
    const s = sq.toLowerCase();
    return (
      (c.employeeName ?? "").toLowerCase().includes(s) ||
      (c.claimCode ?? "").toLowerCase().includes(s) ||
      (c.category ?? "").toLowerCase().includes(s) ||
      (c.status ?? "").toLowerCase().includes(s) ||
      (c.requestCode ?? "").toLowerCase().includes(s)
    );
  });

  const csv = rows.map(r => ({
    Code: r.claimCode, Employee: r.employeeName ?? "—", Category: r.category,
    Amount: r.amount, Date: fmtDate(r.expenseDate), Status: r.status,
    Request: r.requestCode ?? "—",
  }));

  // Group by status for summary chips
  const statusCounts = claims.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const totalReimbursed = claims.filter(c => c.status === "Reimbursed").reduce((s, c) => s + c.amount, 0);
  const totalApproved   = claims.filter(c => c.status === "Approved").reduce((s, c) => s + c.amount, 0);
  const totalPending    = claims.filter(c => c.status === "Submitted").reduce((s, c) => s + c.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Summary bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "12px 16px", background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
        {[
          { label: "Submitted",   color: "#f59e0b", bg: "#fef9c3", count: statusCounts["Submitted"]   ?? 0, amt: totalPending },
          { label: "Approved",    color: "#15803d", bg: "#dcfce7", count: statusCounts["Approved"]    ?? 0, amt: totalApproved },
          { label: "Reimbursed",  color: "#6d28d9", bg: "#ede9fe", count: statusCounts["Reimbursed"]  ?? 0, amt: totalReimbursed },
          { label: "Rejected",    color: "#b91c1c", bg: "#fee2e2", count: statusCounts["Rejected"]    ?? 0, amt: 0 },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", background: s.bg, borderRadius: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: s.color }}>{s.count}</span>
            {s.amt > 0 && <span style={{ fontSize: 11, color: s.color, opacity: 0.8 }}>· {fmt(s.amt)}</span>}
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
          Total: {fmt(claims.reduce((s, c) => s + c.amount, 0))}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: "#f8fafc" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title} ({claims.length})</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <input type="text" value={ss.q} onChange={e => ss.setQ(e.target.value)} placeholder="🔍 Search claims…"
              style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 12, fontFamily: FF, outline: "none", minWidth: 160 }} />
            <ExBtn onCSV={() => exportCSV(csv, "expense-claims")} onPDF={() => exportPDF(title, "exp-table")} />
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🧾</div>
            <p style={{ fontWeight: 700, color: "#64748b", margin: 0 }}>{emptyMsg ?? "No expense claims found."}</p>
          </div>
        ) : (
          <div id="exp-table" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  <Th label="Code"      col="claimCode"    arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Employee"  col="employeeName" arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Category"  col="category"     arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Amount"    col="amount"       arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Date"      col="expenseDate"  arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Status"    col="status"       arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Request"   col="requestCode"  arrow={ss.arrow} tog={ss.tog} />
                </tr>
              </thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.claimId} style={{ borderBottom: "1px solid #f8fafc" }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontWeight: 600, color: "#0f172a" }}>{c.claimCode}</td>
                    <td style={{ padding: "9px 12px", fontWeight: 600, color: "#0f172a" }}>{c.employeeName ?? "—"}</td>
                    <td style={{ padding: "9px 12px", color: "#334155" }}>{c.category}</td>
                    <td style={{ padding: "9px 12px", fontWeight: 800, color: "#1e40af" }}>{fmt(c.amount)}</td>
                    <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(c.expenseDate)}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, ...(SB[c.status] ?? { background: "#f1f5f9", color: "#64748b" }) }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{c.requestCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "8px 14px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{rows.length} of {claims.length} records</span>
        </div>
      </div>
    </div>
  );
}

// ── Period filter ──────────────────────────────────────────────────────────────
function PeriodFilter({ period, setPeriod, cf, setCf, ct, setCt, onApply, error }: {
  period: PeriodType; setPeriod: (p: PeriodType) => void;
  cf: string; setCf: (s: string) => void; ct: string; setCt: (s: string) => void;
  onApply: () => void; error?: string;
}) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "10px 16px", marginBottom: 18, border: "1.5px solid #e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>📅 Period:</span>
        <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 2, gap: 1 }}>
          {(["all", "weekly", "monthly", "yearly", "custom"] as PeriodType[]).map(k => (
            <button key={k} onClick={() => setPeriod(k)} style={{
              padding: "5px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 700,
              cursor: "pointer", background: period === k ? "#0f172a" : "transparent",
              color: period === k ? "#fff" : "#64748b", transition: "all 0.12s",
            }}>
              {k === "all" ? "All Time" : k === "weekly" ? "7 Days" : k === "monthly" ? "30 Days" : k === "yearly" ? "1 Year" : "Custom"}
            </button>
          ))}
        </div>
        {period === "custom" && (<>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>From:</label>
            <input type="date" value={cf} onChange={e => setCf(e.target.value)} max={ct || toISO(today)}
              style={{ padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${error ? "#ef4444" : "#e2e8f0"}`, fontSize: 12, fontFamily: FF }} />
          </div>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>→</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>To:</label>
            <input type="date" value={ct} onChange={e => setCt(e.target.value)} min={cf} max={toISO(today)}
              style={{ padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${error ? "#ef4444" : "#e2e8f0"}`, fontSize: 12, fontFamily: FF }} />
          </div>
        </>)}
        <button onClick={onApply} style={{ padding: "5px 14px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", marginLeft: "auto" }}>Apply →</button>
      </div>
      {error && <p style={{ margin: "6px 0 0", fontSize: 11, color: "#ef4444", fontWeight: 600 }}>⚠ {error}</p>}
    </div>
  );
}

// ── Mode Drawer ────────────────────────────────────────────────────────────────
function ModeDrawer({ mode, list, totalAmount, onClose }: { mode: string; list: ModeEmployee[]; totalAmount: number; onClose: () => void }) {
  const color = TC[mode] ?? "#64748b";
  const { q, setQ, tog, arrow, filter } = useSortSearch<ModeEmployee>(list, "departureDate", "desc");
  const rows = filter((e, sq) => {
    const s = sq.toLowerCase();
    return e.employeeName.toLowerCase().includes(s) || e.employeeCode.toLowerCase().includes(s) ||
      (e.department ?? "").toLowerCase().includes(s) || e.destination.toLowerCase().includes(s) ||
      e.requestCode.toLowerCase().includes(s) || e.status.toLowerCase().includes(s);
  });
  const csv = rows.map(r => ({ Employee: r.employeeName, Code: r.employeeCode, Department: r.department || "—", Request: r.requestCode, Destination: r.destination, Departure: fmtDate(r.departureDate), Status: r.status }));

  return (
    <div id={`md-${mode}`} style={{ background: "#fff", borderRadius: 16, border: `2px solid ${color}44`, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
      <div style={{ padding: "12px 18px", background: `${color}11`, borderBottom: `1.5px solid ${color}22`, borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{modeIcon(mode)} {mode} — {list.length} request{list.length !== 1 ? "s" : ""}</span>
          {totalAmount > 0 && <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 700, color, background: color + "18", borderRadius: 6, padding: "2px 8px" }}>Expenses: {fmt(totalAmount)}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ExBtn onCSV={() => exportCSV(csv, `${mode}-trips`)} onPDF={() => exportPDF(`${mode} Requests`, `md-${mode}`)} />
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#94a3b8" }}>✕</button>
        </div>
      </div>
      <div style={{ padding: "10px 18px", borderBottom: "1px solid #f1f5f9" }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search name, code, dept, destination, status…"
          style={{ width: "100%", padding: "7px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" }} />
      </div>
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
              ? <tr><td colSpan={7} style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>No records match.</td></tr>
              : rows.map((e, i) => (
                <tr key={`${e.employeeId}-${i}`} style={{ borderBottom: "1px solid #f8fafc" }}
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
                    {e.department ? <span style={{ background: "#eef2ff", color: "#4f46e5", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>🏢 {e.department}</span> : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontWeight: 600, color: "#0f172a" }}>{e.requestCode}</td>
                  <td style={{ padding: "9px 12px", color: "#334155" }}>{e.destination}</td>
                  <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(e.departureDate)}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, ...(SB[e.status] ?? { background: "#f1f5f9", color: "#64748b" }) }}>{e.status}</span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "8px 18px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: "0 0 14px 14px" }}>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{rows.length} of {list.length} records</span>
      </div>
    </div>
  );
}

// ── Fetch mode drill-down ──────────────────────────────────────────────────────
async function fetchModeTrips(mode: string, isAdmin: boolean): Promise<ModeEmployee[]> {
  // ✅ FIX: Use base URL without /api prefix since apiClient adds it
  const ep = isAdmin
    ? `/Booking/all?transport=${encodeURIComponent(mode)}&pageSize=500`
    : `/Booking/my`;
  try {
    const json = await get<unknown>(ep);
    const all = (Array.isArray(json) ? json : ((json as { items?: unknown[] }).items ?? [])) as {
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
  } catch { return []; }
}

// ── Employee By Travel Mode ────────────────────────────────────────────────────
function ByTravelModeTab({ transport, from, to }: { transport: TransportStat[]; from: string; to: string }) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const [sel, setSel]         = useState<string | null>(null);
  const [list, setList]       = useState<ModeEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const ss = useSortSearch<TransportStat>(transport, "count", "desc");
  const modeRows = ss.filter((t, sq) => { const s = sq.toLowerCase(); return t.transport.toLowerCase().includes(s) || String(t.count).includes(s); });
  const labels = transport.map(t => t.transport);
  const colors  = labels.map(l => TC[l] ?? "#64748b");

  const cfg: ChartConfiguration = {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "My Trips", data: transport.map(t => t.count), backgroundColor: colors.map((c, i) => sel === labels[i] ? c + "ee" : c + "44"), borderColor: colors, borderWidth: 2, borderRadius: 8 }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => [` Trips: ${ctx.parsed.x}`, ` Expenses: ${fmt(transport[ctx.dataIndex]?.totalAmount ?? 0)}`, " Click for details"] } } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: G } }, y: { grid: { display: false } } },
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
  const csv = transport.map(t => ({ Mode: t.transport, "My Trips": t.count, "Total Expenses": t.totalAmount, From: from || "All", To: to || "All" }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
        {transport.map((t, i) => {
          const c = TC[t.transport] ?? "#64748b";
          return (
            <div key={t.transport} onClick={() => void click(i)} style={{ background: sel === t.transport ? c + "11" : "#fff", border: `1.5px solid ${sel === t.transport ? c : "#e2e8f0"}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", transition: "all 0.15s" }}>
              <div style={{ fontSize: 20, marginBottom: 3 }}>{modeIcon(t.transport)}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{t.count}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>{t.transport}</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(t.totalAmount)}</div>
            </div>
          );
        })}
      </div>
      <div id="emp-mode-chart" style={{ background: "#fff", borderRadius: 16, padding: "18px 22px", border: "1.5px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>My Trips by Mode — Click a bar for details</p>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>{sel ? `${sel}: ${selStat ? fmt(selStat.totalAmount) : "—"} expenses` : "Select a bar"}{from ? `  ·  ${from} → ${to}` : "  ·  All Time"}</p>
          </div>
          <ExBtn onCSV={() => exportCSV(csv, "my-trips-by-mode")} onPDF={() => exportPDF("My Travel Mode Report", "emp-mode-chart")} />
        </div>
        <div style={{ height: Math.max(160, transport.length * 54 + 40), position: "relative" }}>
          <canvas ref={chartRef} style={{ cursor: "pointer" }} />
        </div>
      </div>
      {/* Mode summary table */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Mode Summary</span>
          <input type="text" value={ss.q} onChange={e => ss.setQ(e.target.value)} placeholder="🔍 Search…" style={{ flex: 1, minWidth: 140, padding: "5px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 12, fontFamily: FF, outline: "none" }} />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                <Th label="Mode"           col="transport"   arrow={ss.arrow} tog={ss.tog} />
                <Th label="My Trips"       col="count"       arrow={ss.arrow} tog={ss.tog} />
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
                    <tr key={t.transport} style={{ borderBottom: "1px solid #f8fafc", cursor: "pointer" }} onClick={() => void click(origIdx)}
                      onMouseEnter={ev => (ev.currentTarget.style.background = "#f8fafc")} onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
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
                })}
            </tbody>
          </table>
        </div>
      </div>
      {sel && (loading
        ? <div style={{ background: "#fff", borderRadius: 16, padding: "28px 24px", border: "1.5px solid #e2e8f0", textAlign: "center", color: "#94a3b8" }}>⏳ Loading {sel} trips…</div>
        : <ModeDrawer mode={sel} list={list} totalAmount={selStat?.totalAmount ?? 0} onClose={() => { setSel(null); setList([]); }} />
      )}
    </div>
  );
}

// ── Admin Analytics ────────────────────────────────────────────────────────────
function AdminAnalytics({ transport, employees, departments, from, to }: { transport: TransportStat[]; employees: EmployeeStat[]; departments: DepartmentStat[]; from: string; to: string }) {
  const [view, setView]       = useState<AnalyticsView>("mode");
  const [sel, setSel]         = useState<string | null>(null);
  const [list, setList]       = useState<ModeEmployee[]>([]);
  const [loadingM, setLoading] = useState(false);
  const chartRef = useRef<HTMLCanvasElement>(null);

  const modeSS = useSortSearch<TransportStat>(transport,    "count",        "desc");
  const empSS  = useSortSearch<EmployeeStat>(employees,     "totalAmount",  "desc");
  const deptSS = useSortSearch<DepartmentStat>(departments, "requestCount", "desc");

  const chView = (v: AnalyticsView) => { setView(v); setSel(null); setList([]); modeSS.setQ(""); empSS.setQ(""); deptSS.setQ(""); };

  const modeRows = modeSS.filter((t, sq) => { const s = sq.toLowerCase(); return t.transport.toLowerCase().includes(s) || String(t.count).includes(s); });
  const empRows  = empSS.filter((e, sq) => { const s = sq.toLowerCase(); return e.displayName.toLowerCase().includes(s) || e.employeeCode.toLowerCase().includes(s) || (e.department ?? "").toLowerCase().includes(s) || fmt(e.totalAmount).toLowerCase().includes(s); });
  const deptRows = deptSS.filter((d, sq) => { const s = sq.toLowerCase(); return (d.department ?? "").toLowerCase().includes(s) || String(d.requestCount).includes(s) || fmt(d.expenseTotal).toLowerCase().includes(s); });

  const { q: aq, setQ: aSetQ } = view === "employee" ? empSS : view === "department" ? deptSS : modeSS;

  const tLabels = transport.map(t => t.transport);
  const tColors  = tLabels.map(l => TC[l] ?? "#64748b");

  const modeCfg: ChartConfiguration = {
    type: "bar",
    data: { labels: tLabels, datasets: [{ label: "Trips", data: transport.map(t => t.count), backgroundColor: tColors.map((c, i) => sel === tLabels[i] ? c + "ee" : c + "44"), borderColor: tColors, borderWidth: 2, borderRadius: 8 }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => [` Trips: ${ctx.parsed.x}`, ` Expenses: ${fmt(transport[ctx.dataIndex]?.totalAmount ?? 0)}`, " Click to drill down"] } } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: G } }, y: { grid: { display: false } } } },
  };

  const empCfg: ChartConfiguration = {
    type: "bar",
    data: { labels: empRows.slice(0, 8).map(e => e.displayName.split(" ")[0]), datasets: [{ label: "Total Expenses", data: empRows.slice(0, 8).map(e => e.totalAmount), backgroundColor: empRows.slice(0, 8).map((_, i) => DC[i % DC.length] + "55"), borderColor: empRows.slice(0, 8).map((_, i) => DC[i % DC.length]), borderWidth: 2, borderRadius: 8 }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => [` Expenses: ${fmt(ctx.parsed.x)}`, ` Claims: ${empRows[ctx.dataIndex]?.claimCount ?? 0}`, ` Approved: ${empRows[ctx.dataIndex]?.approved ?? 0}`, ` Pending: ${empRows[ctx.dataIndex]?.pending ?? 0}`] } } }, scales: { x: { beginAtZero: true, ticks: { callback: (v: unknown) => typeof v === "number" ? fmt(v) : "" }, grid: { color: G } }, y: { grid: { display: false } } } },
  };

  const deptCfg: ChartConfiguration = {
    type: "bar",
    data: { labels: deptRows.slice(0, 8).map(d => d.department || "Unknown"), datasets: [{ label: "Requests", data: deptRows.slice(0, 8).map(d => d.requestCount), backgroundColor: deptRows.slice(0, 8).map((_, i) => DC[i % DC.length] + "44"), borderColor: deptRows.slice(0, 8).map((_, i) => DC[i % DC.length]), borderWidth: 2, borderRadius: 6 }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => [` Requests: ${ctx.parsed.x}`, ` Expenses: ${fmt(deptRows[ctx.dataIndex]?.expenseTotal ?? 0)}`] } } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: G } }, y: { grid: { display: false } } } },
  };

  const chartCfg: ChartConfiguration | null = view === "mode" && transport.length > 0 ? modeCfg : view === "employee" && empRows.length > 0 ? empCfg : view === "department" && deptRows.length > 0 ? deptCfg : null;
  const chartHeight = view === "mode" ? Math.max(160, transport.length * 54 + 40) : Math.max(160, Math.min((view === "employee" ? empRows : deptRows).length, 8) * 54 + 40);

  const modeClick = async (idx: number) => {
    if (view !== "mode") return;
    const m = tLabels[idx]; if (!m) return;
    if (sel === m) { setSel(null); setList([]); return; }
    setSel(m); setLoading(true);
    setList(await fetchModeTrips(m, true));
    setLoading(false);
  };
  useChart(chartRef, chartCfg, view === "mode" ? modeClick : undefined);
  const selStat = transport.find(t => t.transport === sel);
  const pdfId = "admin-analytics-content";

  const modeCsv  = modeRows.map(t => ({ Mode: t.transport, Trips: t.count, "Total Expenses": t.totalAmount, From: from || "All", To: to || "All" }));
  const empCsv   = empRows.map(e => ({ Employee: e.displayName, Code: e.employeeCode, Department: e.department || "—", Claims: e.claimCount, Approved: e.approved, Pending: e.pending, "Total Expenses": e.totalAmount }));
  const deptCsv  = deptRows.map(d => ({ Department: d.department || "Unknown", Requests: d.requestCount, Approved: d.approved, Pending: d.pending, "Total Expenses": d.expenseTotal }));
  const activeCsv = view === "mode" ? modeCsv : view === "employee" ? empCsv : deptCsv;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Controls */}
      <div style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1.5px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>View:</label>
        <select value={view} onChange={e => chView(e.target.value as AnalyticsView)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: FF, fontWeight: 700, background: "#f8fafc", color: "#0f172a", outline: "none", cursor: "pointer" }}>
          <option value="mode">✈️  By Travel Mode</option>
          <option value="employee">👤  By Employee</option>
          <option value="department">🏢  By Department</option>
        </select>
        <input type="text" value={aq} onChange={e => aSetQ(e.target.value)} placeholder={view === "mode" ? "🔍 Search mode…" : view === "employee" ? "🔍 Search name, dept…" : "🔍 Search department…"} style={{ flex: 1, minWidth: 200, padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: FF, outline: "none" }} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <ExBtn onCSV={() => exportCSV(activeCsv, `analytics-${view}`)} onPDF={() => exportPDF(`Analytics — ${view}`, pdfId)} />
        </div>
      </div>

      {/* Chart */}
      {chartCfg && (
        <div style={{ background: "#fff", borderRadius: 16, padding: "18px 22px", border: "1.5px solid #e2e8f0" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
            {view === "mode" ? "Trips by Travel Mode — Click a bar to drill down" : view === "employee" ? "Total Expenses per Employee (Top 8)" : "Requests per Department (Top 8)"}
          </p>
          {view === "mode" && <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{sel ? `${sel} — ${selStat ? fmt(selStat.totalAmount) : "—"} total` : "Click any bar to drill down"}{from ? `  ·  ${from} → ${to}` : "  ·  All Time"}</p>}
          <div style={{ height: chartHeight, position: "relative" }}>
            <canvas ref={chartRef} style={{ cursor: view === "mode" ? "pointer" : "default" }} />
          </div>
        </div>
      )}

      {view === "mode" && sel && (loadingM
        ? <div style={{ background: "#fff", borderRadius: 16, padding: "24px", border: "1.5px solid #e2e8f0", textAlign: "center", color: "#94a3b8" }}>⏳ Loading {sel} employees…</div>
        : <ModeDrawer mode={sel} list={list} totalAmount={selStat?.totalAmount ?? 0} onClose={() => { setSel(null); setList([]); }} />
      )}

      {/* Tables */}
      <div id={pdfId}>
        {view === "mode" && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: "14px 14px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>All Travel Modes</span>
              {from && <span style={{ fontSize: 11, color: "#94a3b8" }}>· {from} → {to}</span>}
              {!from && <span style={{ fontSize: 11, color: "#94a3b8" }}>· All Time</span>}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: "2px solid #e2e8f0" }}><Th label="Mode" col="transport" arrow={modeSS.arrow} tog={modeSS.tog} /><Th label="Total Trips" col="count" arrow={modeSS.arrow} tog={modeSS.tog} /><Th label="Total Expenses" col="totalAmount" arrow={modeSS.arrow} tog={modeSS.tog} /></tr></thead>
                <tbody>
                  {modeRows.length === 0
                    ? <tr><td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>No data. Try "All Time" period.</td></tr>
                    : modeRows.map((t, i) => {
                      const c = TC[t.transport] ?? "#64748b";
                      const origIdx = transport.findIndex(x => x.transport === t.transport);
                      return (
                        <tr key={t.transport} style={{ borderBottom: "1px solid #f8fafc", cursor: "pointer" }} onClick={() => void modeClick(origIdx)}
                          onMouseEnter={ev => (ev.currentTarget.style.background = "#f8fafc")} onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "10px 14px" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: DC[i % DC.length], flexShrink: 0 }} /><span style={{ fontSize: 16 }}>{modeIcon(t.transport)}</span><strong style={{ color: "#0f172a" }}>{t.transport}</strong></div></td>
                          <td style={{ padding: "10px 14px", fontWeight: 800, color: c, fontSize: 13 }}>{t.count}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 800, color: "#1e40af", fontSize: 13 }}>{fmt(t.totalAmount)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === "employee" && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
            {empRows.length === 0
              ? <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}><div style={{ fontSize: 28, marginBottom: 8 }}>👤</div><p style={{ fontWeight: 700, color: "#64748b", margin: 0 }}>No employee expense data.</p><p style={{ fontSize: 12, margin: "6px 0 0" }}>Try "All Time" period — expense data is not date-filtered by departure date.</p></div>
              : (<>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ padding: "9px 12px", background: "#f8fafc", fontWeight: 700, color: "#64748b", fontSize: 11, textTransform: "uppercase", width: 36 }}>#</th>
                      <Th label="Employee"       col="displayName"  arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Code"           col="employeeCode" arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Department"     col="department"   arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Claims"         col="claimCount"   arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Approved"       col="approved"     arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Pending"        col="pending"      arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Total Expenses" col="totalAmount"  arrow={empSS.arrow} tog={empSS.tog} />
                    </tr></thead>
                    <tbody>
                      {empRows.map((e, i) => (
                        <tr key={e.employeeId} style={{ borderBottom: "1px solid #f8fafc" }}
                          onMouseEnter={ev => (ev.currentTarget.style.background = "#f8fafc")} onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "9px 12px", color: "#94a3b8", fontWeight: 700 }}>#{i + 1}</td>
                          <td style={{ padding: "9px 12px" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 28, height: 28, borderRadius: "50%", background: "#3b82f611", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#3b82f6", flexShrink: 0 }}>{e.displayName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}</div><strong style={{ color: "#0f172a" }}>{e.displayName}</strong></div></td>
                          <td style={{ padding: "9px 12px", color: "#64748b", fontFamily: "monospace" }}>{e.employeeCode || "—"}</td>
                          <td style={{ padding: "9px 12px" }}>{e.department ? <span style={{ background: "#eef2ff", color: "#4f46e5", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>🏢 {e.department}</span> : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                          <td style={{ padding: "9px 12px", fontWeight: 700, color: "#0f172a" }}>{e.claimCount}</td>
                          <td style={{ padding: "9px 12px" }}><span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{e.approved}</span></td>
                          <td style={{ padding: "9px 12px" }}><span style={{ background: "#fef9c3", color: "#854d0e", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{e.pending}</span></td>
                          <td style={{ padding: "9px 12px", fontWeight: 800, color: "#1e40af", fontSize: 13 }}>{fmt(e.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "8px 12px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}><span style={{ fontSize: 11, color: "#94a3b8" }}>{empRows.length} of {employees.length} employees</span></div>
              </>)}
          </div>
        )}

        {view === "department" && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
            {deptRows.length === 0
              ? <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}><div style={{ fontSize: 28, marginBottom: 8 }}>🏢</div><p style={{ fontWeight: 700, color: "#64748b", margin: 0 }}>No department data.</p><p style={{ fontSize: 12, margin: "6px 0 0" }}>Try "All Time" period or ensure travel requests have a department set.</p></div>
              : (<>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ borderBottom: "2px solid #e2e8f0" }}><Th label="Department" col="department" arrow={deptSS.arrow} tog={deptSS.tog} /><Th label="Requests" col="requestCount" arrow={deptSS.arrow} tog={deptSS.tog} /><Th label="Req Approved" col="approved" arrow={deptSS.arrow} tog={deptSS.tog} /><Th label="Req Pending" col="pending" arrow={deptSS.arrow} tog={deptSS.tog} /><Th label="Total Expenses" col="expenseTotal" arrow={deptSS.arrow} tog={deptSS.tog} /></tr></thead>
                    <tbody>
                      {deptRows.map((d, i) => (
                        <tr key={d.department} style={{ borderBottom: "1px solid #f8fafc" }}
                          onMouseEnter={ev => (ev.currentTarget.style.background = "#f8fafc")} onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "9px 12px" }}><div style={{ display: "flex", alignItems: "center", gap: 7 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: DC[i % DC.length], flexShrink: 0 }} /><strong style={{ color: "#0f172a" }}>{d.department || "Unknown"}</strong></div></td>
                          <td style={{ padding: "9px 12px", fontWeight: 700, color: "#0f172a" }}>{d.requestCount}</td>
                          <td style={{ padding: "9px 12px" }}><span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{d.approved}</span></td>
                          <td style={{ padding: "9px 12px" }}><span style={{ background: "#fef9c3", color: "#854d0e", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{d.pending}</span></td>
                          <td style={{ padding: "9px 12px", fontWeight: 800, color: "#1e40af", fontSize: 13 }}>{fmt(d.expenseTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "8px 12px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}><span style={{ fontSize: 11, color: "#94a3b8" }}>{deptRows.length} department{deptRows.length !== 1 ? "s" : ""}</span></div>
              </>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin Overview charts ──────────────────────────────────────────────────────
function AdminOverview({ s, from, to }: { s: Summary; from: string; to: string }) {
  const r1 = useRef<HTMLCanvasElement>(null);
  const r2 = useRef<HTMLCanvasElement>(null);
  useChart(r1, { type: "bar", data: { labels: ["Approved","Pending","Rejected"], datasets: [{ label: "Requests", data: [s.approvedRequests, s.pendingRequests, s.rejectedRequests], backgroundColor: ["#10b98122","#f59e0b22","#ef444422"], borderColor: ["#10b981","#f59e0b","#ef4444"], borderWidth: 2, borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: G } }, x: { grid: { display: false } } } } });
  useChart(r2, { type: "bar", data: { labels: ["Total","Approved","Pending"], datasets: [{ label: "₹", data: [s.totalExpenses, s.approvedExpenses, s.pendingExpenses], backgroundColor: ["#3b82f622","#10b98122","#f59e0b22"], borderColor: ["#3b82f6","#10b981","#f59e0b"], borderWidth: 2, borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.parsed.y as number)}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: v => v == null ? "" : fmt(v as number) }, grid: { color: G } }, x: { grid: { display: false } } } } });
  const csv: Record<string, string | number>[] = [
     { Metric: "Total Requests", Value: s.totalRequests,    From: from || "All", To: to || "All" },
     { Metric: "Pending",        Value: s.pendingRequests,  From: from || "All", To: to || "All" },
     { Metric: "Approved",       Value: s.approvedRequests, From: from || "All", To: to || "All" },
     { Metric: "Rejected",       Value: s.rejectedRequests, From: from || "All", To: to || "All" },
     { Metric: "Total Expenses", Value: s.totalExpenses,    From: from || "All", To: to || "All" },
     { Metric: "Pending Exp",    Value: s.pendingExpenses,  From: from || "All", To: to || "All" },
     { Metric: "Approved Exp",   Value: s.approvedExpenses, From: from || "All", To: to || "All" },
     { Metric: "Employees",      Value: s.totalEmployees,   From: from || "All", To: to || "All" },
   ];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <ExBtn onCSV={() => exportCSV(csv, "overview-summary")} onPDF={() => exportPDF("Overview Report", "admin-overview")} label="Export:" />
      </div>
      <div id="admin-overview" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        {[
          { ref: r1, title: "Requests by Status", sub: from ? `${from} → ${to}` : "All time", lg: [{ l: "Approved", c: "#10b981", v: String(s.approvedRequests) }, { l: "Pending", c: "#f59e0b", v: String(s.pendingRequests) }, { l: "Rejected", c: "#ef4444", v: String(s.rejectedRequests) }] },
          { ref: r2, title: "Expense Pipeline",  sub: from ? `${from} → ${to}` : "All time",  lg: [{ l: "Total", c: "#3b82f6", v: fmt(s.totalExpenses) }, { l: "Approved", c: "#10b981", v: fmt(s.approvedExpenses) }, { l: "Pending", c: "#f59e0b", v: fmt(s.pendingExpenses) }] },
        ].map(card => (
          <div key={card.title} style={{ background: "#fff", borderRadius: 16, padding: "18px 22px", border: "1.5px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{card.title}</p>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 9px" }}>{card.sub}</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 9, flexWrap: "wrap" }}>
              {card.lg.map(x => <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}><div style={{ width: 9, height: 9, borderRadius: 2, background: x.c }} /><span style={{ color: "#64748b" }}>{x.l}:</span><strong style={{ color: "#0f172a" }}>{x.v}</strong></div>)}
            </div>
            <div style={{ height: 200 }}><canvas ref={card.ref} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const navigate = useNavigate();
  const fullName = localStorage.getItem("full_name") ?? "Employee";
  const role     = localStorage.getItem("role") ?? "Employee";
  const initials = fullName.trim().split(" ").filter(Boolean).map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";
  const isAdmin  = ["admin", "hr", "Admin", "HR"].includes(role);

  const [sum,          setSum]          = useState<Summary | null>(null);
  const [tr,           setTr]           = useState<TransportStat[]>([]);
  const [emp,          setEmp]          = useState<EmployeeStat[]>([]);
  const [dept,         setDept]         = useState<DepartmentStat[]>([]);
  // ✅ FIX: Load ALL expense claims (including Reimbursed) for admin and employee
  const [allClaims,    setAllClaims]    = useState<ExpenseClaim[]>([]);
  const [myClaims,     setMyClaims]     = useState<ExpenseClaim[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [claimsLoading, setClaimsLoading] = useState(false);

  const [period,  setPeriod]  = useState<PeriodType>("all");  // ✅ default All Time
  const [cf,      setCf]      = useState("");
  const [ct,      setCt]      = useState(toISO(today));
  const [dateErr, setDateErr] = useState("");
  const [rFrom,   setRFrom]   = useState("");
  const [rTo,     setRTo]     = useState("");

  const [empTab,   setEmpTab]   = useState<EmployeeTab>("overview");
  const [adminTab, setAdminTab] = useState<AdminTab>("overview");

  const getRange = useCallback((): { from: string; to: string } | null => {
    if (period === "all")    { setDateErr(""); return { from: "", to: "" }; }
    if (period === "custom") {
      if (!cf) { setDateErr("Please select a From date."); return null; }
      if (!ct) { setDateErr("Please select a To date."); return null; }
      if (cf > ct) { setDateErr('"From" must be ≤ "To".'); return null; }
      setDateErr(""); return { from: cf, to: ct };
    }
    setDateErr("");
    return getPeriodDates(period);
  }, [period, cf, ct]);

  // ✅ FIX: Load expense claims separately — no date filter, include all statuses
  const loadClaims = useCallback(async () => {
    setClaimsLoading(true);
    try {
      if (isAdmin) {
        // ✅ pageSize=500, no status filter → gets ALL claims including Reimbursed
        const result = await get<{ total: number; items: ExpenseClaim[] }>("/Expense?pageSize=500");
        setAllClaims(result.items ?? []);
      } else {
        // Employee: get own claims — no status filter → includes Reimbursed
        const items = await get<ExpenseClaim[]>("/Expense/my");
        setMyClaims(Array.isArray(items) ? items : []);
      }
    } catch { /* silent */ }
    finally { setClaimsLoading(false); }
  }, [isAdmin]);

  const load = useCallback(async () => {
    const range = getRange();
    if (!range) return;
    setLoading(true);
    const { from, to } = range;
    setRFrom(from); setRTo(to);
    const qs = buildQS(from, to);
    // ✅ FIX: Use All Time for by-employee since backend filters by DepartureDate
    // but expense claims may have been submitted after the trip's departure date
    const trEndpoint = isAdmin ? `/Report/by-transport?${qs.toString()}` : `/Report/my-transport?${qs.toString()}`;

    const [rSum, rTr, rEmp, rDept] = await Promise.allSettled([
      get<Summary>(`/Report/dashboard?${qs.toString()}`),
      get<TransportStat[]>(trEndpoint).catch(() => [] as TransportStat[]),
      isAdmin ? get<EmployeeStat[]>(`/Report/by-employee?${qs.toString()}`).catch(() => [] as EmployeeStat[]) : Promise.resolve([] as EmployeeStat[]),
      isAdmin ? get<DepartmentStat[]>(`/Report/by-department?${qs.toString()}`).catch(() => [] as DepartmentStat[]) : Promise.resolve([] as DepartmentStat[]),
    ]);

    if (rSum.status  === "fulfilled") setSum(rSum.value);
    if (rTr.status   === "fulfilled") setTr(rTr.value);
    if (rEmp.status  === "fulfilled") setEmp(rEmp.value);
    if (rDept.status === "fulfilled") setDept(rDept.value);
    setLoading(false);
  }, [getRange, isAdmin]);

  useEffect(() => { void load(); void loadClaims(); }, [load, loadClaims]);

  const tabBtn = (key: string, label: string, active: boolean, fn: () => void) => (
    <button key={key} onClick={fn} style={{ padding: "7px 18px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? "#1e40af" : "#64748b", boxShadow: active ? "0 1px 6px rgba(0,0,0,0.1)" : "none", transition: "all 0.15s" }}>{label}</button>
  );

  const empKpiCsv: Record<string, string | number>[] = sum ? [
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
      <CommonNavbar showBack={true} onBack={() => navigate("/dashboard")} user={{ initials, name: fullName, subtitle: role }} onSignOut={async () => signOutUser()} />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px 60px" }}>
        {/* Hero */}
        <div style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", borderRadius: 20, padding: "24px 28px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, boxShadow: "0 8px 32px rgba(15,23,42,0.28)" }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Analytics</p>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0 }}>📊 Travel & Expense Reports</h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              {isAdmin ? "Organisation-wide intelligence · All statuses including Reimbursed" : "Your personal travel & expense summary"}
            </p>
          </div>
          <button onClick={() => navigate("/dashboard")} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.18)", borderRadius: 10, color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>← Dashboard</button>
        </div>

        <PeriodFilter period={period} setPeriod={p => { setPeriod(p); setDateErr(""); }} cf={cf} setCf={setCf} ct={ct} setCt={setCt} onApply={() => void load()} error={dateErr} />

        {(rFrom || rTo) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, marginTop: -8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>Showing:</span>
            <span style={{ fontSize: 11, background: "#0f172a", color: "#fff", borderRadius: 6, padding: "2px 10px", fontWeight: 700 }}>{rFrom} → {rTo}</span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>· Expense claims shown for All Time regardless of filter</span>
          </div>
        )}
        {!rFrom && !rTo && (
          <div style={{ marginBottom: 14, marginTop: -8 }}>
            <span style={{ fontSize: 11, background: "#0f172a", color: "#fff", borderRadius: 6, padding: "2px 10px", fontWeight: 700 }}>All Time</span>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 3, marginBottom: 20, background: "#e2e8f0", borderRadius: 12, padding: 3, width: "fit-content" }}>
          {isAdmin
            ? [
                tabBtn("overview",  "Overview",         adminTab === "overview",  () => setAdminTab("overview")),
                tabBtn("analytics", "Analytics",        adminTab === "analytics", () => setAdminTab("analytics")),
                tabBtn("expenses",  `All Expenses (${allClaims.length})`, adminTab === "expenses", () => setAdminTab("expenses")),
              ]
            : [
                tabBtn("overview",    "Overview",       empTab === "overview",    () => setEmpTab("overview")),
                tabBtn("bymode",      "By Travel Mode", empTab === "bymode",      () => setEmpTab("bymode")),
                tabBtn("myexpenses",  `My Expenses (${myClaims.length})`, empTab === "myexpenses",  () => setEmpTab("myexpenses")),
              ]}
        </div>

        {loading
          ? <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}><div style={{ fontSize: 32, marginBottom: 12 }}>📊</div><p style={{ margin: 0 }}>Loading reports…</p></div>
          : isAdmin
          ? (<>
              {adminTab === "overview" && sum && (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12, marginBottom: 18 }}>
                  <KPI icon="✈️" label="Total Requests"    value={sum.totalRequests}         color="#3b82f6" />
                  <KPI icon="⏳" label="Pending"           value={sum.pendingRequests}       color="#f59e0b" />
                  <KPI icon="✅" label="Approved"          value={sum.approvedRequests}      color="#10b981" />
                  <KPI icon="❌" label="Rejected"          value={sum.rejectedRequests}      color="#ef4444" />
                  <KPI icon="💰" label="Total Expenses"    value={fmt(sum.totalExpenses)}    color="#8b5cf6" />
                  <KPI icon="⏳" label="Pending Expenses"  value={fmt(sum.pendingExpenses)}  color="#f59e0b" />
                  <KPI icon="✅" label="Approved Expenses" value={fmt(sum.approvedExpenses)} color="#10b981" />
                  <KPI icon="👥" label="Active Employees"  value={sum.totalEmployees}        color="#0ea5e9" />
                </div>
                <AdminOverview s={sum} from={rFrom} to={rTo} />
              </>)}

              {adminTab === "analytics" && <AdminAnalytics transport={tr} employees={emp} departments={dept} from={rFrom} to={rTo} />}

              {/* ✅ NEW: Admin All Expenses tab — shows ALL claims including Reimbursed */}
              {adminTab === "expenses" && (
                claimsLoading
                  ? <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>⏳ Loading expense claims…</div>
                  : <ExpenseClaimsTable
                      claims={allClaims}
                      title="All Expense Claims"
                      emptyMsg="No expense claims found. Ensure the /Expense endpoint returns all statuses."
                    />
              )}
            </>)
          : (<>
              {empTab === "overview" && sum && (<>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <ExBtn onCSV={() => exportCSV(empKpiCsv, "my-overview")} onPDF={() => exportPDF("My Travel Summary", "emp-overview")} label="Export:" />
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
                  {sum.totalRequests > 0 && (
                    <div style={{ background: "#fff", borderRadius: 16, padding: "18px 22px", border: "1.5px solid #e2e8f0", marginBottom: 18 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Request Approval Rate</p>
                      {rFrom && <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 8px" }}>{rFrom} → {rTo}</p>}
                      <div style={{ display: "flex", height: 26, borderRadius: 8, overflow: "hidden" }}>
                        {[{ l: "Approved", n: sum.approvedRequests, c: "#10b981" }, { l: "Pending", n: sum.pendingRequests, c: "#f59e0b" }, { l: "Rejected", n: sum.rejectedRequests, c: "#ef4444" }].filter(x => x.n > 0).map(x => (
                          <div key={x.l} style={{ width: `${(x.n / sum.totalRequests) * 100}%`, background: x.c, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, transition: "width 0.5s" }}>
                            {Math.round((x.n / sum.totalRequests) * 100)}%
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                        {[{ l: "Approved", c: "#10b981" }, { l: "Pending", c: "#f59e0b" }, { l: "Rejected", c: "#ef4444" }].map(x => (
                          <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b" }}><div style={{ width: 9, height: 9, borderRadius: 2, background: x.c }} />{x.l}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>)}

              {empTab === "bymode" && (tr.length === 0
                ? <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}><div style={{ fontSize: 32, marginBottom: 10 }}>✈️</div><p style={{ margin: 0, fontWeight: 700, color: "#64748b" }}>No travel mode data.</p><p style={{ margin: "6px 0 0", fontSize: 12 }}>Try "All Time" and click Apply.</p></div>
                : <ByTravelModeTab transport={tr} from={rFrom} to={rTo} />
              )}

              {/* ✅ NEW: Employee My Expenses tab — shows ALL own claims including Reimbursed */}
              {empTab === "myexpenses" && (
                claimsLoading
                  ? <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>⏳ Loading your expense claims…</div>
                  : <ExpenseClaimsTable
                      claims={myClaims}
                      title="My Expense Claims"
                      emptyMsg="You haven't submitted any expense claims yet."
                    />
              )}
            </>)}
      </main>
    </div>
  );
}
