// src/pages/reports/ReportsPage.tsx
// FIXES:
//  1. By Department: fetchDepartmentRequests now fetches ALL trips and filters
//     client-side by department — backend /Booking/all?department= may not be supported.
//     This guarantees only that department's records appear in the detail panel.
//  2. DepartmentDetailPanel: every request row is clickable → nested RequestDetailPanel
//  3. TransportDetailPanel: every trip card is clickable → nested detail cards
//  4. EmployeeDetailPanel: every claim is clickable → nested ExpenseDetailPanel
//  5. KpiDetailPanel: every row clickable → nested detail
//  6. All detail panels: stat summary cards shown at top
//  7. AuthController fix: MsLogin never wipes existing Department from DB

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
import styles from "./ReportsPage.module.css";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Summary {
  totalRequests: number; pendingRequests: number;
  approvedRequests: number; rejectedRequests: number;
  totalExpenses: number; pendingExpenses: number;
  approvedExpenses: number; totalEmployees: number;
}
interface TransportStat  { transport: string; count: number; totalAmount: number; }
interface ModeEmployee   { employeeId: number; employeeName: string; employeeCode: string; department: string; requestCode: string; status: string; destination: string; departureDate: string; }
interface EmployeeStat   { employeeId: number; displayName: string; employeeCode: string; department: string; totalAmount: number; claimCount: number; approved: number; pending: number; }
interface DepartmentStat { department: string; requestCount: number; expenseTotal: number; approved: number; pending: number; }
interface ExpenseClaim   { claimId: number; claimCode: string; employeeId: number; employeeName: string; category: string; amount: number; currency: string; expenseDate: string; status: string; billPath: string | null; billFileName: string | null; requestCode?: string; description?: string; remarks?: string; }
interface TravelRequest  { requestId: number; requestCode: string; employeeName: string; employeeCode: string; department: string; destination: string; transportType: string; departureDate: string; returnDate: string; status: string; purpose?: string; remarks?: string; }
interface ActiveEmployee { employeeId: number; displayName: string; employeeCode: string; department: string; designation: string; email: string; role: string; contactNumber?: string; }

type PeriodType    = "all" | "weekly" | "monthly" | "yearly" | "custom";
type EmployeeTab   = "overview" | "bymode" | "myexpenses";
type AdminTab      = "overview" | "analytics" | "expenses";
type AnalyticsView = "mode" | "employee" | "department";
type SortDir       = "asc" | "desc";

type DetailType =
  | { kind: "kpi";        label: string; icon: string; color: string; data: TravelRequest[] | ExpenseClaim[] | null; dataType: "requests" | "expenses" | "employees" }
  | { kind: "employees";  employees: ActiveEmployee[] | null }
  | { kind: "expense";    claim: ExpenseClaim }
  | { kind: "request";    request: TravelRequest }
  | { kind: "employee";   stat: EmployeeStat;   claims: ExpenseClaim[]   }
  | { kind: "department"; stat: DepartmentStat; requests: TravelRequest[] }
  | { kind: "transport";  stat: TransportStat;  trips: ModeEmployee[]    };

// ── Constants ──────────────────────────────────────────────────────────────────
const FF    = "'Segoe UI', system-ui, sans-serif";
const G     = "#f1f5f9";
const today = new Date();

const TC: Record<string, string> = {
  Flight: "#3b82f6", Train: "#10b981", Cab: "#f59e0b",
  Hotel: "#8b5cf6", Bus: "#f97316", Multiple: "#ef4444", Unknown: "#94a3b8",
};
const DC = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"];
const SB: Record<string, React.CSSProperties> = {
  Approved:    { background: "#dcfce7", color: "#15803d" },
  Rejected:    { background: "#fee2e2", color: "#b91c1c" },
  Submitted:   { background: "#fef9c3", color: "#854d0e" },
  UnderReview: { background: "#dbeafe", color: "#1e40af" },
  Reimbursed:  { background: "#ede9fe", color: "#6d28d9" },
};
const ICONS: Record<string, string> = { Flight:"✈️", Train:"🚆", Cab:"🚕", Hotel:"🏨", Bus:"🚌" };
const modeIcon = (t: string) => ICONS[t] ?? "🗺️";

// ── Date helpers ───────────────────────────────────────────────────────────────
const toISO    = (d: Date) => d.toISOString().slice(0, 10);
const toEndISO = (s: string) => s ? `${s}T23:59:59` : "";
function getPeriodDates(p: PeriodType): { from: string; to: string } {
  if (p === "all") return { from: "", to: "" };
  const now = new Date(); const toStr = toISO(now);
  if (p === "weekly")  { const d = new Date(now); d.setDate(d.getDate() - 7);         return { from: toISO(d), to: toStr }; }
  if (p === "monthly") { const d = new Date(now); d.setMonth(d.getMonth() - 1);       return { from: toISO(d), to: toStr }; }
  if (p === "yearly")  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return { from: toISO(d), to: toStr }; }
  return { from: "", to: "" };
}
function buildQS(from: string, to: string) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to)   qs.set("to",   toEndISO(to));
  return qs;
}

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return "₹0";
  return n >= 10_000_000 ? `₹${(n/10_000_000).toFixed(1)}Cr`
       : n >= 100_000    ? `₹${(n/100_000).toFixed(1)}L`
       : n >= 1_000      ? `₹${(n/1_000).toFixed(1)}K`
       : `₹${n.toFixed(0)}`;
};
const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"2-digit" }); }
  catch { return d; }
};
function gp<T extends object>(obj: T, key: string): number | string {
  return (obj as Record<string, number | string>)[key] ?? 0;
}

// ── Chart hook ─────────────────────────────────────────────────────────────────
function useChart(ref: React.RefObject<HTMLCanvasElement | null>, cfg: ChartConfiguration | null, onClick?: (i: number) => void) {
  useEffect(() => {
    if (!ref.current || !cfg) return;
    const c = new Chart(ref.current, { ...cfg, options: { ...cfg.options, onClick: onClick ? (_, els) => { if (els[0]) onClick(els[0].index); } : cfg.options?.onClick }});
    return () => c.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cfg)]);
}

// ── Sort + search ──────────────────────────────────────────────────────────────
function useSortSearch<T extends object>(data: T[], defaultKey: string, defaultDir: SortDir = "desc") {
  const [q, setQ] = useState(""); const [sc, setSc] = useState(defaultKey); const [sd, setSd] = useState<SortDir>(defaultDir);
  const tog = (col: string) => { if (sc === col) setSd(d => d === "asc" ? "desc" : "asc"); else { setSc(col); setSd("desc"); } };
  const arrow = (col: string) => sc === col ? (sd === "asc" ? " ↑" : " ↓") : " ↕";
  const filter = (pred: (row: T, q: string) => boolean): T[] =>
    data.filter(row => !q || pred(row, q)).sort((a, b) => {
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

// ── Fetch helpers ──────────────────────────────────────────────────────────────
async function fetchModeTrips(mode: string, isAdmin: boolean): Promise<ModeEmployee[]> {
  const ep = isAdmin ? `/Booking/all?transport=${encodeURIComponent(mode)}&pageSize=500` : `/Booking/my`;
  try {
    const json = await get<unknown>(ep);
    const all = (Array.isArray(json) ? json : ((json as { items?: unknown[] }).items ?? [])) as { employeeId: number; employeeName: string; employeeCode: string; department: string; requestCode: string; status: string; destination: string; departureDate: string; transportType: string; }[];
    return (isAdmin ? all : all.filter(r => r.transportType === mode)).map(r => ({ employeeId: r.employeeId, employeeName: r.employeeName, employeeCode: r.employeeCode ?? "", department: r.department ?? "", requestCode: r.requestCode, status: r.status, destination: r.destination, departureDate: r.departureDate }));
  } catch { return []; }
}

async function fetchRequestsByStatus(status: string, isAdmin: boolean): Promise<TravelRequest[]> {
  try {
    const ep = isAdmin ? `/Booking/all?${status ? `status=${encodeURIComponent(status)}&` : ""}pageSize=500` : `/Booking/my?${status ? `status=${encodeURIComponent(status)}&` : ""}pageSize=500`;
    const json = await get<unknown>(ep);
    return (Array.isArray(json) ? json : ((json as { items?: unknown[] }).items ?? [])) as TravelRequest[];
  } catch { return []; }
}

async function fetchExpensesByStatus(status: string, isAdmin: boolean): Promise<ExpenseClaim[]> {
  try {
    const ep = isAdmin ? `/Expense?${status ? `status=${encodeURIComponent(status)}&` : ""}pageSize=500` : `/Expense/my?${status ? `status=${encodeURIComponent(status)}` : ""}`;
    const json = await get<unknown>(ep);
    return (Array.isArray(json) ? json : ((json as { items?: unknown[] }).items ?? [])) as ExpenseClaim[];
  } catch { return []; }
}

async function fetchEmployeeClaims(employeeId: number): Promise<ExpenseClaim[]> {
  try {
    const json = await get<unknown>(`/Expense?pageSize=500`);
    const all = (Array.isArray(json) ? json : ((json as { items?: unknown[] }).items ?? [])) as ExpenseClaim[];
    // ── FIX: filter strictly by employeeId client-side ──────────────────────
    // Backend /Expense?employeeId= may not be supported; filtering here
    // guarantees only that specific employee's claims appear in the detail panel.
    return all.filter(c => (c as { employeeId?: number }).employeeId === employeeId);
  } catch { return []; }
}

// ── FIX: fetchDepartmentRequests — fetch ALL trips and filter client-side ──────
// Backend /Booking/all?department=X may not be supported. To guarantee we only
// show the specific department, we fetch all and filter by the department field.
async function fetchDepartmentRequests(department: string): Promise<TravelRequest[]> {
  try {
    const json = await get<unknown>(`/Booking/all?pageSize=500`);
    const all = (Array.isArray(json) ? json : ((json as { items?: unknown[] }).items ?? [])) as TravelRequest[];
    // ── FIX: filter strictly by department name (case-insensitive) ──────────
    const deptLower = (department || "").toLowerCase().trim();
    if (!deptLower || deptLower === "unknown") {
      // For "Unknown" dept, return trips where dept is null/empty
      return all.filter(r => !r.department || r.department.trim() === "");
    }
    return all.filter(r => (r.department ?? "").toLowerCase().trim() === deptLower);
  } catch { return []; }
}

async function fetchActiveEmployees(): Promise<ActiveEmployee[]> {
  try {
    const json = await get<unknown>(`/TravelEmployee?isActive=true&pageSize=500`);
    const items = (Array.isArray(json) ? json : ((json as { items?: unknown[] }).items ?? [])) as ActiveEmployee[];
    return items;
  } catch {
    try {
      const json = await get<unknown>(`/TravelEmployee/all?pageSize=500`);
      const items = (Array.isArray(json) ? json : ((json as { items?: unknown[] }).items ?? [])) as ActiveEmployee[];
      return items.filter((e: ActiveEmployee) => e.role === "Employee" || !e.role);
    } catch { return []; }
  }
}

// ── Shared small components ────────────────────────────────────────────────────
function ExBtn({ onCSV, onPDF, label }: { onCSV: () => void; onPDF: () => void; label?: string }) {
  return (
    <div className={styles.exportRow}>
      {label && <span className={styles.exportLabel}>{label}</span>}
      <button onClick={onCSV} className={styles.btnExportCsv}>📊 Excel</button>
      <button onClick={onPDF} className={styles.btnExportPdf}>📄 PDF</button>
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
function StatusBadge({ status }: { status: string }) {
  return <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, display: "inline-block", ...(SB[status] ?? { background: "#f1f5f9", color: "#64748b" }) }}>{status}</span>;
}

// ── Stat summary cards (shown at top of every detail panel) ───────────────────
function StatCards({ stats }: { stats: { label: string; value: string | number; color: string; icon: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)`, gap: 10, marginBottom: 18 }}>
      {stats.map(s => (
        <div key={s.label} style={{ background: `${s.color}0d`, border: `1.5px solid ${s.color}22`, borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{s.icon} {s.label}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Panel chrome ───────────────────────────────────────────────────────────────
function PanelHeader({ icon, title, subtitle, color, onClose }: { icon: string; title: string; subtitle?: string; color: string; onClose: () => void }) {
  return (
    <div className={styles.panelHeader} style={{ background: `linear-gradient(135deg, ${color}0d 0%, #fff 100%)` }}>
      <div className={styles.panelHeaderLeft}>
        <div className={styles.panelIcon} style={{ background: `${color}18` }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <h2 className={styles.panelTitle}>{title}</h2>
          {subtitle && <p className={styles.panelSubtitle}>{subtitle}</p>}
        </div>
      </div>
      <button className={styles.panelClose} onClick={onClose}>✕</button>
    </div>
  );
}
function FieldRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className={styles.panelFieldRow}>
      <span className={styles.panelFieldLabel}>{label}</span>
      <span className={styles.panelFieldValue} style={{ fontFamily: mono ? "monospace" : undefined }}>{value ?? "—"}</span>
    </div>
  );
}

// ── Clickable list item ────────────────────────────────────────────────────────
function ClickableItem({ onClick, left, right }: { onClick: () => void; left: React.ReactNode; right?: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", background: hov ? "#eff6ff" : "#f8fafc", borderRadius: 10, marginBottom: 8, border: `1.5px solid ${hov ? "#bfdbfe" : "#e2e8f0"}`, cursor: "pointer", transition: "all 0.12s" }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>{left}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {right}
        <span style={{ color: "#94a3b8", fontSize: 16 }}>›</span>
      </div>
    </div>
  );
}

// ── DETAIL OVERLAY ─────────────────────────────────────────────────────────────
function DetailOverlay({ detail, onClose }: { detail: DetailType; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <>
      <style>{`@keyframes rp-slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
      <div className={styles.detailOverlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={styles.detailPanel}>
          {detail.kind === "expense"    && <ExpenseDetailPanel    claim={detail.claim}                                 onClose={onClose} />}
          {detail.kind === "request"    && <RequestDetailPanel    request={detail.request}                             onClose={onClose} />}
          {detail.kind === "employee"   && <EmployeeDetailPanel   stat={detail.stat}     claims={detail.claims}       onClose={onClose} />}
          {detail.kind === "department" && <DepartmentDetailPanel stat={detail.stat}     requests={detail.requests}   onClose={onClose} />}
          {detail.kind === "transport"  && <TransportDetailPanel  stat={detail.stat}     trips={detail.trips}         onClose={onClose} />}
          {detail.kind === "kpi"        && <KpiDetailPanel        label={detail.label}   icon={detail.icon} color={detail.color} data={detail.data} dataType={detail.dataType} onClose={onClose} />}
          {detail.kind === "employees"  && <ActiveEmployeesPanel  employees={detail.employees}                         onClose={onClose} />}
        </div>
      </div>
    </>
  );
}

// ── Expense Detail Panel ───────────────────────────────────────────────────────
function ExpenseDetailPanel({ claim, onClose }: { claim: ExpenseClaim; onClose: () => void }) {
  return (
    <>
      <PanelHeader icon="🧾" title={`Expense — ${claim.claimCode}`} subtitle={`${claim.category} · ${fmtDate(claim.expenseDate)}`} color="#8b5cf6" onClose={onClose} />
      <div className={styles.panelBody}>
        <StatCards stats={[
          { label: "Amount",   value: fmt(claim.amount),  color: "#8b5cf6", icon: "💰" },
          { label: "Status",   value: claim.status,       color: SB[claim.status]?.color as string ?? "#64748b", icon: "📋" },
          { label: "Category", value: claim.category,     color: "#3b82f6", icon: "🏷️" },
          { label: "Currency", value: claim.currency,     color: "#06b6d4", icon: "💱" },
        ]} />
        <div className={styles.panelFields}>
          <FieldRow label="Claim Code"   value={claim.claimCode}             mono />
          <FieldRow label="Employee"     value={claim.employeeName ?? "—"} />
          <FieldRow label="Category"     value={claim.category} />
          <FieldRow label="Expense Date" value={fmtDate(claim.expenseDate)} />
          <FieldRow label="Status"       value={<StatusBadge status={claim.status} />} />
          <FieldRow label="Request Code" value={claim.requestCode ?? "—"}    mono />
          {claim.description && <FieldRow label="Description" value={claim.description} />}
          {claim.remarks     && <FieldRow label="Remarks"     value={claim.remarks} />}
        </div>
        {claim.billPath && (
          <div className={styles.billBox}>
            <p className={styles.billBoxTitle}>📎 Attached Bill</p>
            <p className={styles.billBoxFile}>{claim.billFileName ?? claim.billPath}</p>
            <a href={claim.billPath} target="_blank" rel="noreferrer" className={styles.billBoxLink}>View Document →</a>
            {/\.(jpg|jpeg|png|webp)$/i.test(claim.billPath) && (
              <img src={claim.billPath} alt="Bill preview" style={{ marginTop: 10, width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Request Detail Panel ───────────────────────────────────────────────────────
function RequestDetailPanel({ request, onClose }: { request: TravelRequest; onClose: () => void }) {
  const color = TC[request.transportType] ?? "#3b82f6";
  return (
    <>
      <PanelHeader icon={modeIcon(request.transportType)} title={`${request.requestCode}`} subtitle={`${request.destination} · ${fmtDate(request.departureDate)}`} color={color} onClose={onClose} />
      <div className={styles.panelBody}>
        <StatCards stats={[
          { label: "Destination", value: request.destination,  color,       icon: "📍" },
          { label: "Transport",   value: request.transportType, color,       icon: modeIcon(request.transportType) },
          { label: "Status",      value: request.status,        color: SB[request.status]?.color as string ?? "#64748b", icon: "📋" },
          { label: "Departure",   value: fmtDate(request.departureDate), color: "#06b6d4", icon: "📅" },
        ]} />
        <div className={styles.panelFields}>
          <FieldRow label="Request Code"  value={request.requestCode}        mono />
          <FieldRow label="Employee"      value={request.employeeName ?? "—"} />
          <FieldRow label="Employee Code" value={request.employeeCode ?? "—"} mono />
          <FieldRow label="Department"    value={request.department ?? "—"} />
          <FieldRow label="Transport"     value={`${modeIcon(request.transportType)} ${request.transportType}`} />
          <FieldRow label="Departure"     value={fmtDate(request.departureDate)} />
          <FieldRow label="Return"        value={fmtDate(request.returnDate)} />
          <FieldRow label="Status"        value={<StatusBadge status={request.status} />} />
          {request.purpose && <FieldRow label="Purpose" value={request.purpose} />}
          {request.remarks && <FieldRow label="Remarks" value={request.remarks} />}
        </div>
      </div>
    </>
  );
}

// ── Employee Detail Panel ─────────────────────────────────────────────────────
function EmployeeDetailPanel({ stat, claims, onClose }: { stat: EmployeeStat; claims: ExpenseClaim[]; onClose: () => void }) {
  const [inner, setInner] = useState<ExpenseClaim | null>(null);
  const ss = useSortSearch<ExpenseClaim>(claims, "expenseDate", "desc");
  const rows = ss.filter((c, sq) => {
    const s = sq.toLowerCase();
    return (c.claimCode ?? "").toLowerCase().includes(s) || (c.category ?? "").toLowerCase().includes(s) || (c.status ?? "").toLowerCase().includes(s);
  });
  const csv = rows.map(c => ({ Code: c.claimCode, Category: c.category, Amount: c.amount, Date: fmtDate(c.expenseDate), Status: c.status }));
  return (
    <>
      {inner && <DetailOverlay detail={{ kind: "expense", claim: inner }} onClose={() => setInner(null)} />}
      <PanelHeader icon="👤" title={stat.displayName} subtitle={`${stat.employeeCode} · ${stat.department || "—"}`} color="#3b82f6" onClose={onClose} />
      <div className={styles.panelBody}>
        <StatCards stats={[
          { label: "Total Expenses", value: fmt(stat.totalAmount), color: "#3b82f6", icon: "💰" },
          { label: "Claims",         value: stat.claimCount,       color: "#8b5cf6", icon: "🧾" },
          { label: "Approved",       value: stat.approved,         color: "#10b981", icon: "✅" },
          { label: "Pending",        value: stat.pending,          color: "#f59e0b", icon: "⏳" },
        ]} />
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="text" value={ss.q} onChange={e => ss.setQ(e.target.value)} placeholder="🔍 Search claims…" className={styles.panelSearchInput} style={{ flex: 1 }} />
          <ExBtn onCSV={() => exportCSV(csv, `claims-${stat.employeeCode}`)} onPDF={() => exportPDF(`${stat.displayName} Claims`, "emp-claims-list")} />
        </div>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Expense Claims ({rows.length})</p>
        <div id="emp-claims-list">
          {rows.length === 0
            ? <div style={{ textAlign: "center", padding: 28, color: "#94a3b8", background: "#f8fafc", borderRadius: 10 }}>No expense claims found.</div>
            : rows.map(c => (
              <ClickableItem key={c.claimId} onClick={() => setInner(c)}
                left={<>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{c.category}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{c.claimCode} · {fmtDate(c.expenseDate)}</p>
                </>}
                right={<>
                  <span style={{ fontWeight: 800, fontSize: 14, color: "#1e40af" }}>{fmt(c.amount)}</span>
                  <StatusBadge status={c.status} />
                </>}
              />
            ))}
        </div>
      </div>
    </>
  );
}

// ── Department Detail Panel ───────────────────────────────────────────────────
// FIX: requests are already filtered to this department by fetchDepartmentRequests.
// Each row is clickable → nested RequestDetailPanel
function DepartmentDetailPanel({ stat, requests, onClose }: { stat: DepartmentStat; requests: TravelRequest[]; onClose: () => void }) {
  const [inner, setInner] = useState<TravelRequest | null>(null);
  const ss = useSortSearch<TravelRequest>(requests, "departureDate", "desc");
  const rows = ss.filter((r, sq) => {
    const s = sq.toLowerCase();
    return (r.employeeName ?? "").toLowerCase().includes(s) || (r.requestCode ?? "").toLowerCase().includes(s)
      || (r.destination ?? "").toLowerCase().includes(s) || (r.status ?? "").toLowerCase().includes(s)
      || (r.transportType ?? "").toLowerCase().includes(s);
  });
  const csv = rows.map(r => ({ Code: r.requestCode, Employee: r.employeeName ?? "—", Destination: r.destination, Transport: r.transportType, Departure: fmtDate(r.departureDate), Status: r.status }));
  return (
    <>
      {inner && <DetailOverlay detail={{ kind: "request", request: inner }} onClose={() => setInner(null)} />}
      <PanelHeader icon="🏢" title={stat.department || "Unknown Department"} subtitle={`${requests.length} requests · ${fmt(stat.expenseTotal)} expenses`} color="#06b6d4" onClose={onClose} />
      <div className={styles.panelBody}>
        <StatCards stats={[
          { label: "Requests",       value: requests.length,       color: "#3b82f6", icon: "✈️" },
          { label: "Approved",       value: stat.approved,         color: "#10b981", icon: "✅" },
          { label: "Pending",        value: stat.pending,          color: "#f59e0b", icon: "⏳" },
          { label: "Total Expenses", value: fmt(stat.expenseTotal), color: "#8b5cf6", icon: "💰" },
        ]} />
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="text" value={ss.q} onChange={e => ss.setQ(e.target.value)} placeholder="🔍 Search requests…" className={styles.panelSearchInput} style={{ flex: 1 }} />
          <ExBtn onCSV={() => exportCSV(csv, `dept-${stat.department}`)} onPDF={() => exportPDF(`${stat.department} Requests`, "dept-req-list")} />
        </div>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Travel Requests for {stat.department} ({rows.length})
        </p>
        <div id="dept-req-list">
          {rows.length === 0
            ? <div style={{ textAlign: "center", padding: 28, color: "#94a3b8", background: "#f8fafc", borderRadius: 10 }}>No requests found for this department.</div>
            : rows.map(r => (
              <ClickableItem key={r.requestId} onClick={() => setInner(r)}
                left={<>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 14 }}>{modeIcon(r.transportType)}</span>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{r.employeeName ?? "—"} → {r.destination}</p>
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                    {r.requestCode} · {fmtDate(r.departureDate)} · {r.transportType}
                  </p>
                </>}
                right={<StatusBadge status={r.status} />}
              />
            ))}
        </div>
      </div>
    </>
  );
}

// ── Transport Detail Panel ────────────────────────────────────────────────────
// FIX: every trip row is now clickable — shows trip info cards inline
function TransportDetailPanel({ stat, trips, onClose }: { stat: TransportStat; trips: ModeEmployee[]; onClose: () => void }) {
  const color = TC[stat.transport] ?? "#64748b";
  const [selected, setSelected] = useState<ModeEmployee | null>(null);
  const ss = useSortSearch<ModeEmployee>(trips, "departureDate", "desc");
  const rows = ss.filter((e, sq) => {
    const s = sq.toLowerCase();
    return e.employeeName.toLowerCase().includes(s) || e.requestCode.toLowerCase().includes(s)
      || (e.department ?? "").toLowerCase().includes(s) || e.destination.toLowerCase().includes(s)
      || e.status.toLowerCase().includes(s);
  });
  const csv = rows.map(e => ({ Employee: e.employeeName, Code: e.employeeCode || "—", Department: e.department || "—", Destination: e.destination, Departure: fmtDate(e.departureDate), Request: e.requestCode, Status: e.status }));
  return (
    <>
      <PanelHeader icon={modeIcon(stat.transport)} title={`${stat.transport} Travel`} subtitle={`${stat.count} trips · ${fmt(stat.totalAmount)} expenses`} color={color} onClose={onClose} />
      <div className={styles.panelBody}>
        <StatCards stats={[
          { label: "Total Trips",    value: stat.count,            color,       icon: modeIcon(stat.transport) },
          { label: "Total Expenses", value: fmt(stat.totalAmount), color: "#1e40af", icon: "💰" },
          { label: "Approved",       value: trips.filter(t => t.status === "Approved").length,  color: "#10b981", icon: "✅" },
          { label: "Pending",        value: trips.filter(t => t.status === "Submitted" || t.status === "UnderReview").length, color: "#f59e0b", icon: "⏳" },
        ]} />

        {/* Inline trip card when a row is clicked */}
        {selected && (
          <div style={{ marginBottom: 16, padding: "14px 16px", background: `${color}0d`, borderRadius: 12, border: `2px solid ${color}33`, position: "relative" }}>
            <button onClick={() => setSelected(null)} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#94a3b8" }}>✕</button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color, flexShrink: 0 }}>
                {selected.employeeName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{selected.employeeName}</p>
                <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{selected.employeeCode || "—"} · {selected.department || "—"}</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { l: "Destination",  v: selected.destination },
                { l: "Departure",    v: fmtDate(selected.departureDate) },
                { l: "Request Code", v: selected.requestCode },
                { l: "Status",       v: <StatusBadge status={selected.status} /> },
              ].map(x => (
                <div key={x.l} style={{ background: "#fff", borderRadius: 8, padding: "8px 12px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 3 }}>{x.l}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{x.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="text" value={ss.q} onChange={e => ss.setQ(e.target.value)} placeholder="🔍 Search trips…" className={styles.panelSearchInput} style={{ flex: 1 }} />
          <ExBtn onCSV={() => exportCSV(csv, `trips-${stat.transport}`)} onPDF={() => exportPDF(`${stat.transport} Trips`, "transport-trip-list")} />
        </div>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Trips ({rows.length}) — Click any row to expand details
        </p>
        <div id="transport-trip-list">
          {rows.length === 0
            ? <div style={{ textAlign: "center", padding: 28, color: "#94a3b8", background: "#f8fafc", borderRadius: 10 }}>No trips found.</div>
            : rows.map((e, i) => (
              <ClickableItem key={`${e.employeeId}-${i}`}
                onClick={() => setSelected(selected?.requestCode === e.requestCode ? null : e)}
                left={<>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color, flexShrink: 0 }}>
                      {e.employeeName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{e.employeeName}</p>
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>📍 {e.destination} · 📅 {fmtDate(e.departureDate)}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{e.requestCode} · {e.department || "—"}</p>
                </>}
                right={<StatusBadge status={e.status} />}
              />
            ))}
        </div>
      </div>
    </>
  );
}

// ── KPI Detail Panel ──────────────────────────────────────────────────────────
function KpiDetailPanel({ label, icon, color, data, dataType, onClose }: { label: string; icon: string; color: string; data: TravelRequest[] | ExpenseClaim[] | null; dataType: "requests" | "expenses" | "employees"; onClose: () => void }) {
  const [inner, setInner] = useState<TravelRequest | ExpenseClaim | null>(null);
  const ss = useSortSearch<TravelRequest | ExpenseClaim>(data ?? [], dataType === "expenses" ? "expenseDate" : "departureDate", "desc");
  const rows = ss.filter((row, sq) => {
    const s = sq.toLowerCase();
    if (dataType === "expenses") {
      const c = row as ExpenseClaim;
      return (c.employeeName ?? "").toLowerCase().includes(s) || (c.claimCode ?? "").toLowerCase().includes(s) || (c.category ?? "").toLowerCase().includes(s) || (c.status ?? "").toLowerCase().includes(s);
    } else {
      const r = row as TravelRequest;
      return (r.employeeName ?? "").toLowerCase().includes(s) || (r.requestCode ?? "").toLowerCase().includes(s) || (r.destination ?? "").toLowerCase().includes(s) || (r.status ?? "").toLowerCase().includes(s);
    }
  });
  const csv = dataType === "expenses"
    ? (rows as ExpenseClaim[]).map(c => ({ Code: c.claimCode, Employee: c.employeeName ?? "—", Category: c.category, Amount: c.amount, Date: fmtDate(c.expenseDate), Status: c.status }))
    : (rows as TravelRequest[]).map(r => ({ Code: r.requestCode, Employee: r.employeeName ?? "—", Destination: r.destination, Transport: r.transportType, Departure: fmtDate(r.departureDate), Status: r.status }));

  const total = data ?? [];
  const statCards = dataType === "expenses"
    ? [
        { label: "Total",      value: total.length,  color, icon },
        { label: "Total Amt",  value: fmt((total as ExpenseClaim[]).reduce((s, c) => s + (c as ExpenseClaim).amount, 0)), color: "#1e40af", icon: "💰" },
        { label: "Approved",   value: (total as ExpenseClaim[]).filter(c => (c as ExpenseClaim).status === "Approved" || (c as ExpenseClaim).status === "Reimbursed").length, color: "#10b981", icon: "✅" },
        { label: "Pending",    value: (total as ExpenseClaim[]).filter(c => (c as ExpenseClaim).status === "Submitted").length, color: "#f59e0b", icon: "⏳" },
      ]
    : [
        { label: "Total",     value: total.length,  color, icon },
        { label: "Approved",  value: (total as TravelRequest[]).filter(r => r.status === "Approved").length,  color: "#10b981", icon: "✅" },
        { label: "Pending",   value: (total as TravelRequest[]).filter(r => r.status === "Submitted" || r.status === "UnderReview").length, color: "#f59e0b", icon: "⏳" },
        { label: "Rejected",  value: (total as TravelRequest[]).filter(r => r.status === "Rejected").length, color: "#ef4444", icon: "❌" },
      ];

  return (
    <>
      {inner && "claimId"   in inner && <DetailOverlay detail={{ kind: "expense",  claim: inner as ExpenseClaim }}   onClose={() => setInner(null)} />}
      {inner && "requestId" in inner && <DetailOverlay detail={{ kind: "request",  request: inner as TravelRequest }} onClose={() => setInner(null)} />}
      <PanelHeader icon={icon} title={label} subtitle={data ? `${data.length} records` : "Loading…"} color={color} onClose={onClose} />
      <div className={styles.panelBody}>
        {!data
          ? <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>⏳ Loading…</div>
          : (<>
            <StatCards stats={statCards} />
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input type="text" value={ss.q} onChange={e => ss.setQ(e.target.value)} placeholder={`🔍 Search ${label.toLowerCase()}…`} className={styles.panelSearchInput} style={{ flex: 1 }} />
              <ExBtn onCSV={() => exportCSV(csv as Record<string, string | number>[], label.replace(/\s+/g, "-").toLowerCase())} onPDF={() => exportPDF(label, "kpi-list")} />
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              {rows.length} of {data.length} records — Click any row to view full details
            </p>
            <div id="kpi-list">
              {rows.length === 0
                ? <div style={{ textAlign: "center", padding: 40, color: "#94a3b8", background: "#f8fafc", borderRadius: 12 }}>No records found.</div>
                : dataType === "expenses"
                ? (rows as ExpenseClaim[]).map(c => (
                  <ClickableItem key={c.claimId} onClick={() => setInner(c)}
                    left={<>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{c.category} — {c.employeeName ?? "—"}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{c.claimCode} · {fmtDate(c.expenseDate)}</p>
                    </>}
                    right={<>
                      <span style={{ fontWeight: 800, fontSize: 14, color: "#1e40af" }}>{fmt(c.amount)}</span>
                      <StatusBadge status={c.status} />
                    </>}
                  />
                ))
                : (rows as TravelRequest[]).map(r => (
                  <ClickableItem key={r.requestId} onClick={() => setInner(r)}
                    left={<>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 14 }}>{modeIcon(r.transportType)}</span>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{r.employeeName ?? "—"} → {r.destination}</p>
                      </div>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{r.requestCode} · {fmtDate(r.departureDate)} · {r.transportType}</p>
                    </>}
                    right={<StatusBadge status={r.status} />}
                  />
                ))
              }
            </div>
          </>)
        }
      </div>
    </>
  );
}

// ── Active Employees Panel ────────────────────────────────────────────────────
function ActiveEmployeesPanel({ employees, onClose }: { employees: ActiveEmployee[] | null; onClose: () => void }) {
  const ss = useSortSearch<ActiveEmployee>(employees ?? [], "displayName", "asc");
  const rows = ss.filter((e, sq) => {
    const s = sq.toLowerCase();
    return e.displayName.toLowerCase().includes(s) || (e.employeeCode ?? "").toLowerCase().includes(s) || (e.department ?? "").toLowerCase().includes(s) || (e.email ?? "").toLowerCase().includes(s);
  });
  const deptGroups = (employees ?? []).reduce<Record<string, number>>((acc, e) => { const d = e.department || "Unknown"; acc[d] = (acc[d] ?? 0) + 1; return acc; }, {});
  const topDepts = Object.entries(deptGroups).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const csv = rows.map(e => ({ Name: e.displayName, Code: e.employeeCode ?? "—", Department: e.department ?? "—", Designation: e.designation ?? "—", Email: e.email, Role: e.role }));
  return (
    <>
      <PanelHeader icon="👥" title="Active Employees" subtitle={employees ? `${employees.length} active employees` : "Loading…"} color="#0ea5e9" onClose={onClose} />
      <div className={styles.panelBody}>
        {!employees
          ? <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>⏳ Loading employees…</div>
          : (<>
            <StatCards stats={[
              { label: "Total",       value: employees.length,                   color: "#0ea5e9", icon: "👥" },
              { label: "Departments", value: Object.keys(deptGroups).length,     color: "#06b6d4", icon: "🏢" },
              { label: "Showing",     value: rows.length,                        color: "#3b82f6", icon: "🔍" },
            ]} />
            {topDepts.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {topDepts.map(([dept, count], i) => (
                  <div key={dept} style={{ background: `${DC[i % DC.length]}11`, border: `1.5px solid ${DC[i % DC.length]}33`, borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: DC[i % DC.length] }}>🏢 {dept} · {count}</div>
                ))}
                {Object.keys(deptGroups).length > 4 && <div style={{ background: "#f1f5f9", borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>+{Object.keys(deptGroups).length - 4} more</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
              <input type="text" value={ss.q} onChange={e => ss.setQ(e.target.value)} placeholder="🔍 Search by name, code, dept…" className={styles.panelSearchInput} style={{ flex: 1, minWidth: 180 }} />
              <ExBtn onCSV={() => exportCSV(csv, "active-employees")} onPDF={() => exportPDF("Active Employees", "active-emp-list")} />
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Employees ({rows.length})</p>
            <div id="active-emp-list">
              {rows.length === 0
                ? <div style={{ textAlign: "center", padding: 28, color: "#94a3b8", background: "#f8fafc", borderRadius: 12 }}>No employees match.</div>
                : rows.map(emp => (
                  <div key={emp.employeeId} style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1.5px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#0ea5e911", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#0ea5e9", flexShrink: 0 }}>
                      {emp.displayName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{emp.displayName}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{emp.employeeCode || "—"} · {emp.email}</p>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {emp.department && <span style={{ background: "#eef2ff", color: "#4f46e5", borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700, display: "block", marginBottom: 3 }}>🏢 {emp.department}</span>}
                      {emp.designation && <span style={{ fontSize: 11, color: "#94a3b8" }}>{emp.designation}</span>}
                    </div>
                  </div>
                ))}
            </div>
          </>)
        }
      </div>
    </>
  );
}

// ── Period Filter ─────────────────────────────────────────────────────────────
function PeriodFilter({ period, setPeriod, cf, setCf, ct, setCt, onApply, error }: { period: PeriodType; setPeriod: (p: PeriodType) => void; cf: string; setCf: (s: string) => void; ct: string; setCt: (s: string) => void; onApply: () => void; error?: string }) {
  return (
    <div className={styles.periodFilter}>
      <div className={styles.periodRow}>
        <span className={styles.periodLabel}>📅 Period:</span>
        <div className={styles.periodBtnGroup}>
          {(["all","weekly","monthly","yearly","custom"] as PeriodType[]).map(k => (
            <button key={k} onClick={() => setPeriod(k)} className={`${styles.periodBtn} ${period === k ? styles.periodBtnActive : ""}`}>
              {k==="all"?"All Time":k==="weekly"?"7 Days":k==="monthly"?"30 Days":k==="yearly"?"1 Year":"Custom"}
            </button>
          ))}
        </div>
        {period === "custom" && (<>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <label style={{ fontSize:11, color:"#64748b", fontWeight:600, whiteSpace:"nowrap" }}>From:</label>
            <input type="date" value={cf} onChange={e=>setCf(e.target.value)} max={ct||toISO(today)} style={{ padding:"5px 10px", borderRadius:8, border:`1.5px solid ${error?"#ef4444":"#e2e8f0"}`, fontSize:12, fontFamily:FF }} />
          </div>
          <span style={{ fontSize:12, color:"#94a3b8" }}>→</span>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <label style={{ fontSize:11, color:"#64748b", fontWeight:600, whiteSpace:"nowrap" }}>To:</label>
            <input type="date" value={ct} onChange={e=>setCt(e.target.value)} min={cf} max={toISO(today)} style={{ padding:"5px 10px", borderRadius:8, border:`1.5px solid ${error?"#ef4444":"#e2e8f0"}`, fontSize:12, fontFamily:FF }} />
          </div>
        </>)}
        <button onClick={onApply} className={styles.periodApply}>Apply →</button>
      </div>
      {error && <p className={styles.periodError}>⚠ {error}</p>}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPI({ icon, label, value, color, onClick, loading }: { icon: string; label: string; value: string | number; color: string; onClick?: () => void; loading?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:"#fff", borderRadius:14, padding:"16px 18px", border:`1.5px solid ${hov&&onClick?color:color+"22"}`, boxShadow:hov&&onClick?`0 8px 28px ${color}22`:`0 2px 10px ${color}11`, display:"flex", flexDirection:"column", gap:5, position:"relative", overflow:"hidden", cursor:onClick?"pointer":"default", transform:hov&&onClick?"translateY(-2px)":"none", transition:"all 0.18s" }}>
      <div style={{ position:"absolute", top:-12, right:-12, width:60, height:60, borderRadius:"50%", background:`${color}11` }} />
      <div style={{ fontSize:18 }}>{icon}</div>
      <div style={{ fontSize:24, fontWeight:900, color, letterSpacing:"-0.5px" }}>{value}</div>
      <div style={{ fontSize:11, fontWeight:700, color:"#64748b" }}>{label}</div>
      {onClick && <div style={{ fontSize:10, color, fontWeight:600, opacity:hov?1:0.4, transition:"opacity 0.15s", marginTop:2 }}>Click to view →</div>}
      {loading && <div style={{ position:"absolute", inset:0, background:"rgba(255,255,255,0.75)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#94a3b8" }}>Loading…</div>}
    </div>
  );
}

// ── Expense Claims Table ──────────────────────────────────────────────────────
function ExpenseClaimsTable({ claims, title, emptyMsg, onRowClick }: { claims: ExpenseClaim[]; title: string; emptyMsg?: string; onRowClick?: (c: ExpenseClaim) => void }) {
  const ss = useSortSearch<ExpenseClaim>(claims, "expenseDate", "desc");
  const rows = ss.filter((c, sq) => {
    const s = sq.toLowerCase();
    return (c.employeeName ?? "").toLowerCase().includes(s) || (c.claimCode ?? "").toLowerCase().includes(s) || (c.category ?? "").toLowerCase().includes(s) || (c.status ?? "").toLowerCase().includes(s) || (c.requestCode ?? "").toLowerCase().includes(s);
  });
  const csv = rows.map(r => ({ Code: r.claimCode, Employee: r.employeeName ?? "—", Category: r.category, Amount: r.amount, Date: fmtDate(r.expenseDate), Status: r.status, Request: r.requestCode ?? "—" }));
  const statusCounts = claims.reduce<Record<string, number>>((acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; }, {});
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div className={styles.expenseSummaryBar}>
        {[
          { label:"Submitted",  color:"#f59e0b", bg:"#fef9c3", count:statusCounts["Submitted"]??0,  amt:claims.filter(c=>c.status==="Submitted").reduce((s,c)=>s+c.amount,0) },
          { label:"Approved",   color:"#15803d", bg:"#dcfce7", count:statusCounts["Approved"]??0,   amt:claims.filter(c=>c.status==="Approved").reduce((s,c)=>s+c.amount,0) },
          { label:"Reimbursed", color:"#6d28d9", bg:"#ede9fe", count:statusCounts["Reimbursed"]??0, amt:claims.filter(c=>c.status==="Reimbursed").reduce((s,c)=>s+c.amount,0) },
          { label:"Rejected",   color:"#b91c1c", bg:"#fee2e2", count:statusCounts["Rejected"]??0,   amt:0 },
        ].map(s => (
          <div key={s.label} className={styles.expenseSummaryChip} style={{ background:s.bg }}>
            <span style={{ fontSize:11, fontWeight:700, color:s.color }}>{s.label}</span>
            <span style={{ fontSize:14, fontWeight:900, color:s.color }}>{s.count}</span>
            {s.amt > 0 && <span style={{ fontSize:11, color:s.color, opacity:0.8 }}>· {fmt(s.amt)}</span>}
          </div>
        ))}
        <div className={styles.expenseSummaryTotal}>Total: {fmt(claims.reduce((s,c)=>s+c.amount,0))}</div>
      </div>
      <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e2e8f0", overflow:"hidden" }}>
        <div className={styles.tableHeader}>
          <span className={styles.tableHeaderTitle}>{title} ({claims.length})</span>
          <div style={{ display:"flex", gap:8, alignItems:"center", flex:1, justifyContent:"flex-end", flexWrap:"wrap" }}>
            <input type="text" value={ss.q} onChange={e=>ss.setQ(e.target.value)} placeholder="🔍 Search claims…" className={styles.tableSearchInput} />
            <ExBtn onCSV={()=>exportCSV(csv,"expense-claims")} onPDF={()=>exportPDF(title,"exp-table")} />
          </div>
        </div>
        {onRowClick && <div className={styles.tableClickHint}>💡 Click any row to view full expense details</div>}
        {rows.length === 0
          ? <div style={{ padding:32, textAlign:"center", color:"#94a3b8" }}><div style={{ fontSize:28, marginBottom:8 }}>🧾</div><p style={{ fontWeight:700, color:"#64748b", margin:0 }}>{emptyMsg ?? "No expense claims found."}</p></div>
          : <div id="exp-table" className={`${styles.tableWrap} ${styles.scrollX}`}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:560 }}>
              <thead>
                <tr style={{ borderBottom:"2px solid #e2e8f0" }}>
                  <Th label="Code"     col="claimCode"    arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Employee" col="employeeName" arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Category" col="category"     arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Amount"   col="amount"       arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Date"     col="expenseDate"  arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Status"   col="status"       arrow={ss.arrow} tog={ss.tog} />
                  <Th label="Request"  col="requestCode"  arrow={ss.arrow} tog={ss.tog} />
                  {onRowClick && <th style={{ padding:"9px 12px", background:"#f8fafc", width:40 }} />}
                </tr>
              </thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.claimId} onClick={() => onRowClick?.(c)}
                    style={{ borderBottom:"1px solid #f8fafc", cursor:onRowClick?"pointer":"default", transition:"background 0.1s" }}
                    onMouseEnter={ev => { if(onRowClick)(ev.currentTarget as HTMLTableRowElement).style.background="#f0f9ff"; }}
                    onMouseLeave={ev => { (ev.currentTarget as HTMLTableRowElement).style.background="transparent"; }}>
                    <td style={{ padding:"9px 12px", fontFamily:"monospace", fontWeight:600, color:"#0f172a" }}>{c.claimCode}</td>
                    <td style={{ padding:"9px 12px", fontWeight:600, color:"#0f172a" }}>{c.employeeName ?? "—"}</td>
                    <td style={{ padding:"9px 12px", color:"#334155" }}>{c.category}</td>
                    <td style={{ padding:"9px 12px", fontWeight:800, color:"#1e40af" }}>{fmt(c.amount)}</td>
                    <td style={{ padding:"9px 12px", color:"#64748b", whiteSpace:"nowrap" }}>{fmtDate(c.expenseDate)}</td>
                    <td style={{ padding:"9px 12px" }}><StatusBadge status={c.status} /></td>
                    <td style={{ padding:"9px 12px", fontFamily:"monospace", fontSize:11, color:"#64748b" }}>{c.requestCode ?? "—"}</td>
                    {onRowClick && <td style={{ padding:"9px 12px", color:"#94a3b8", fontSize:16 }}>›</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
        <div className={styles.tableFooter}><span className={styles.tableFooterText}>{rows.length} of {claims.length} records</span></div>
      </div>
    </div>
  );
}

// ── By Travel Mode Tab ────────────────────────────────────────────────────────
function ByTravelModeTab({ transport, from, to, onDetailOpen }: { transport: TransportStat[]; from: string; to: string; onDetailOpen: (d: DetailType) => void }) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ss = useSortSearch<TransportStat>(transport, "count", "desc");
  const modeRows = ss.filter((t, sq) => { const s = sq.toLowerCase(); return t.transport.toLowerCase().includes(s) || String(t.count).includes(s); });
  const labels = transport.map(t => t.transport);
  const colors = labels.map(l => TC[l] ?? "#64748b");
  const cfg: ChartConfiguration = {
    type:"bar", data:{ labels, datasets:[{ label:"My Trips", data:transport.map(t=>t.count), backgroundColor:colors.map((c,i)=>sel===labels[i]?c+"ee":c+"44"), borderColor:colors, borderWidth:2, borderRadius:8 }] },
    options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>[` Trips: ${ctx.parsed.x}`,` Expenses: ${fmt(transport[ctx.dataIndex]?.totalAmount??0)}`," Click for details"]}} }, scales:{ x:{beginAtZero:true,ticks:{stepSize:1},grid:{color:G}}, y:{grid:{display:false}} } },
  };
  const click = async (idx: number) => {
    const m = labels[idx]; setSel(m); setLoading(true);
    const trips = await fetchModeTrips(m, false);
    setLoading(false);
    onDetailOpen({ kind:"transport", stat:transport.find(t=>t.transport===m)!, trips });
  };
  useChart(chartRef, cfg, click);
  const csv = transport.map(t => ({ Mode:t.transport, "My Trips":t.count, "Total Expenses":t.totalAmount, From:from||"All", To:to||"All" }));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div className={styles.modeCardGrid}>
        {transport.map((t, i) => {
          const c = TC[t.transport] ?? "#64748b";
          return (
            <div key={t.transport} onClick={() => void click(i)}
              style={{ background:sel===t.transport?c+"11":"#fff", border:`1.5px solid ${sel===t.transport?c:"#e2e8f0"}`, borderRadius:12, padding:"12px 14px", cursor:"pointer", transition:"all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow=`0 6px 20px ${c}22`; }}
              onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
              <div style={{ fontSize:20, marginBottom:3 }}>{modeIcon(t.transport)}</div>
              <div style={{ fontSize:22, fontWeight:900, color:c }}>{t.count}</div>
              <div style={{ fontSize:12, fontWeight:700, color:"#64748b" }}>{t.transport}</div>
              <div style={{ fontSize:11, color:"#94a3b8" }}>{fmt(t.totalAmount)}</div>
              <div style={{ fontSize:10, color:c, marginTop:4, fontWeight:600 }}>Click for details →</div>
            </div>
          );
        })}
      </div>
      <div id="emp-mode-chart" className={styles.chartCard}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8, flexWrap:"wrap", gap:8 }}>
          <div>
            <p className={styles.chartTitle}>My Trips by Mode — Click a bar to open details</p>
            <p className={styles.chartSub}>{from ? `${from} → ${to}` : "All Time"}</p>
          </div>
          <ExBtn onCSV={() => exportCSV(csv,"my-trips-by-mode")} onPDF={() => exportPDF("My Travel Mode Report","emp-mode-chart")} />
        </div>
        {loading && <div style={{ textAlign:"center", padding:10, fontSize:12, color:"#94a3b8" }}>⏳ Loading details…</div>}
        <div style={{ height:Math.max(160,transport.length*54+40), position:"relative" }}>
          <canvas ref={chartRef} style={{ cursor:"pointer" }} />
        </div>
      </div>
      <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e2e8f0", overflow:"hidden" }}>
        <div className={styles.tableHeader}>
          <span className={styles.tableHeaderTitle}>Mode Summary</span>
          <span style={{ fontSize:11, color:"#3b82f6", fontWeight:600, whiteSpace:"nowrap" }}>· Click row to see trips</span>
          <input type="text" value={ss.q} onChange={e=>ss.setQ(e.target.value)} placeholder="🔍 Search…" className={styles.tableSearchInput} />
        </div>
        <div className={`${styles.tableWrap} ${styles.scrollX}`}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:320 }}>
            <thead><tr style={{ borderBottom:"2px solid #e2e8f0" }}>
              <Th label="Mode"           col="transport"   arrow={ss.arrow} tog={ss.tog} />
              <Th label="My Trips"       col="count"       arrow={ss.arrow} tog={ss.tog} />
              <Th label="Total Expenses" col="totalAmount" arrow={ss.arrow} tog={ss.tog} />
              <th style={{ padding:"9px 12px", background:"#f8fafc", width:40 }} />
            </tr></thead>
            <tbody>
              {modeRows.length === 0
                ? <tr><td colSpan={4} style={{ padding:20, textAlign:"center", color:"#94a3b8" }}>No data.</td></tr>
                : modeRows.map((t, i) => {
                  const c = TC[t.transport] ?? "#64748b";
                  return (
                    <tr key={t.transport} onClick={() => void click(transport.findIndex(x=>x.transport===t.transport))}
                      style={{ borderBottom:"1px solid #f8fafc", cursor:"pointer" }}
                      onMouseEnter={ev => (ev.currentTarget as HTMLTableRowElement).style.background="#f0f9ff"}
                      onMouseLeave={ev => (ev.currentTarget as HTMLTableRowElement).style.background="transparent"}>
                      <td style={{ padding:"10px 14px" }}><div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:10, height:10, borderRadius:2, background:DC[i%DC.length], flexShrink:0 }} /><span style={{ fontSize:16 }}>{modeIcon(t.transport)}</span><strong style={{ color:"#0f172a" }}>{t.transport}</strong></div></td>
                      <td style={{ padding:"10px 14px", fontWeight:800, color:c, fontSize:13 }}>{t.count}</td>
                      <td style={{ padding:"10px 14px", fontWeight:800, color:"#1e40af", fontSize:13 }}>{fmt(t.totalAmount)}</td>
                      <td style={{ padding:"10px 14px", color:"#94a3b8", fontSize:16 }}>›</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Admin Analytics ───────────────────────────────────────────────────────────
function AdminAnalytics({ transport, employees, departments, from, to, onDetailOpen }: { transport: TransportStat[]; employees: EmployeeStat[]; departments: DepartmentStat[]; from: string; to: string; onDetailOpen: (d: DetailType) => void }) {
  const [view, setView] = useState<AnalyticsView>("mode");
  const [loadingDrill, setLoadingDrill] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);

  const modeSS = useSortSearch<TransportStat>(transport,    "count",        "desc");
  const empSS  = useSortSearch<EmployeeStat>(employees,     "totalAmount",  "desc");
  const deptSS = useSortSearch<DepartmentStat>(departments, "requestCount", "desc");
  const chView = (v: AnalyticsView) => { setView(v); modeSS.setQ(""); empSS.setQ(""); deptSS.setQ(""); };

  const modeRows = modeSS.filter((t,sq) => { const s=sq.toLowerCase(); return t.transport.toLowerCase().includes(s)||String(t.count).includes(s); });
  const empRows  = empSS.filter((e,sq)  => { const s=sq.toLowerCase(); return e.displayName.toLowerCase().includes(s)||e.employeeCode.toLowerCase().includes(s)||(e.department??"").toLowerCase().includes(s)||fmt(e.totalAmount).toLowerCase().includes(s); });
  const deptRows = deptSS.filter((d,sq) => { const s=sq.toLowerCase(); return (d.department??"").toLowerCase().includes(s)||String(d.requestCount).includes(s)||fmt(d.expenseTotal).toLowerCase().includes(s); });
  const {q:aq, setQ:aSetQ} = view==="employee" ? empSS : view==="department" ? deptSS : modeSS;

  const tLabels = transport.map(t=>t.transport), tColors=tLabels.map(l=>TC[l]??"#64748b");

  // Chart click handlers
  const modeChartClick = useCallback(async (idx: number) => {
    if (view !== "mode") return;
    const m = tLabels[idx]; if (!m) return;
    const stat = transport.find(t => t.transport === m); if (!stat) return;
    setLoadingDrill(true); setLoadingLabel(m);
    const trips = await fetchModeTrips(m, true);
    setLoadingDrill(false); setLoadingLabel(null);
    onDetailOpen({ kind:"transport", stat, trips });
  }, [view, tLabels, transport, onDetailOpen]);

  const empChartClick = useCallback(async (idx: number) => {
    if (view !== "employee") return;
    const stat = empRows[idx]; if (!stat) return;
    setLoadingDrill(true); setLoadingLabel(stat.displayName);
    const claims = await fetchEmployeeClaims(stat.employeeId);
    setLoadingDrill(false); setLoadingLabel(null);
    onDetailOpen({ kind:"employee", stat, claims });
  }, [view, empRows, onDetailOpen]);

  const deptChartClick = useCallback(async (idx: number) => {
    if (view !== "department") return;
    const stat = deptRows[idx]; if (!stat) return;
    setLoadingDrill(true); setLoadingLabel(stat.department);
    // ── FIX: fetch ALL trips and filter by this specific department ─────────
    const requests = await fetchDepartmentRequests(stat.department);
    setLoadingDrill(false); setLoadingLabel(null);
    onDetailOpen({ kind:"department", stat, requests });
  }, [view, deptRows, onDetailOpen]);

  const activeChartClick = view==="mode" ? modeChartClick : view==="employee" ? empChartClick : deptChartClick;

  const modeCfg: ChartConfiguration = { type:"bar", data:{ labels:tLabels, datasets:[{ label:"Trips", data:transport.map(t=>t.count), backgroundColor:tColors.map(c=>c+"55"), borderColor:tColors, borderWidth:2, borderRadius:8 }] }, options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>[` Trips: ${ctx.parsed.x}`,` Expenses: ${fmt(transport[ctx.dataIndex]?.totalAmount??0)}`," Click to open details"]}} }, scales:{ x:{beginAtZero:true,ticks:{stepSize:1},grid:{color:G}}, y:{grid:{display:false}} } } };
  const empCfg: ChartConfiguration  = { type:"bar", data:{ labels:empRows.slice(0,8).map(e=>e.displayName.split(" ")[0]), datasets:[{ label:"Total Expenses", data:empRows.slice(0,8).map(e=>e.totalAmount), backgroundColor:empRows.slice(0,8).map((_,i)=>DC[i%DC.length]+"55"), borderColor:empRows.slice(0,8).map((_,i)=>DC[i%DC.length]), borderWidth:2, borderRadius:8 }] }, options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>[` Expenses: ${fmt(ctx.parsed.x)}`," Click to open details"]}} }, scales:{ x:{beginAtZero:true,ticks:{callback:(v:unknown)=>typeof v==="number"?fmt(v):""},grid:{color:G}}, y:{grid:{display:false}} } } };
  const deptCfg: ChartConfiguration = { type:"bar", data:{ labels:deptRows.slice(0,8).map(d=>d.department||"Unknown"), datasets:[{ label:"Requests", data:deptRows.slice(0,8).map(d=>d.requestCount), backgroundColor:deptRows.slice(0,8).map((_,i)=>DC[i%DC.length]+"44"), borderColor:deptRows.slice(0,8).map((_,i)=>DC[i%DC.length]), borderWidth:2, borderRadius:6 }] }, options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>[` Requests: ${ctx.parsed.x}`,` Expenses: ${fmt(deptRows[ctx.dataIndex]?.expenseTotal??0)}`," Click to open details"]}} }, scales:{ x:{beginAtZero:true,ticks:{stepSize:1},grid:{color:G}}, y:{grid:{display:false}} } } };

  const chartCfg: ChartConfiguration|null = view==="mode"&&transport.length>0 ? modeCfg : view==="employee"&&empRows.length>0 ? empCfg : view==="department"&&deptRows.length>0 ? deptCfg : null;
  const chartHeight = view==="mode" ? Math.max(160,transport.length*54+40) : Math.max(160,Math.min((view==="employee"?empRows:deptRows).length,8)*54+40);
  useChart(chartRef, chartCfg, activeChartClick);

  const pdfId = "admin-analytics-content";
  const modeCsv  = modeRows.map(t=>({Mode:t.transport,Trips:t.count,"Total Expenses":t.totalAmount}));
  const empCsv   = empRows.map(e=>({Employee:e.displayName,Code:e.employeeCode,Department:e.department||"—",Claims:e.claimCount,Approved:e.approved,Pending:e.pending,"Total Expenses":e.totalAmount}));
  const deptCsv  = deptRows.map(d=>({Department:d.department||"Unknown",Requests:d.requestCount,Approved:d.approved,Pending:d.pending,"Total Expenses":d.expenseTotal}));
  const activeCsv = view==="mode"?modeCsv:view==="employee"?empCsv:deptCsv;

  const hintText = view==="mode" ? "Click any bar or row to see all trips for that mode" : view==="employee" ? "Click any bar or row to see that employee's expense claims" : "Click any bar or row to see only that department's travel requests";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      {/* Controls */}
      <div className={styles.analyticsControls}>
        <label style={{ fontSize:12, fontWeight:700, color:"#64748b", flexShrink:0 }}>View:</label>
        <select value={view} onChange={e=>chView(e.target.value as AnalyticsView)} className={styles.analyticsSelect}>
          <option value="mode">✈️  By Travel Mode</option>
          <option value="employee">👤  By Employee</option>
          <option value="department">🏢  By Department</option>
        </select>
        <input type="text" value={aq} onChange={e=>aSetQ(e.target.value)} placeholder={view==="mode"?"🔍 Search mode…":view==="employee"?"🔍 Search name, dept…":"🔍 Search department…"} className={styles.analyticsSearch} />
        {loadingDrill && <span style={{ fontSize:12, color:"#94a3b8", whiteSpace:"nowrap" }}>⏳ Loading {loadingLabel ? `"${loadingLabel}"` : ""}…</span>}
        <div style={{ marginLeft:"auto", flexShrink:0 }}>
          <ExBtn onCSV={()=>exportCSV(activeCsv,`analytics-${view}`)} onPDF={()=>exportPDF(`Analytics — ${view}`,pdfId)} />
        </div>
      </div>

      <div className={styles.hintBanner}><span>💡</span><span className={styles.hintText}>{hintText}</span></div>

      {/* Chart */}
      {chartCfg && (
        <div className={styles.chartCard}>
          <p className={styles.chartTitle}>
            {view==="mode"?"Trips by Travel Mode — Click bar to see all trips for that mode":view==="employee"?"Total Expenses per Employee (Top 8) — Click to see claims":"Requests per Department — Click to see only that department's requests"}
          </p>
          <div style={{ height:chartHeight, position:"relative" }}>
            <canvas ref={chartRef} style={{ cursor:"pointer" }} />
          </div>
        </div>
      )}

      {/* Tables */}
      <div id={pdfId}>
        {view === "mode" && (
          <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e2e8f0", overflow:"hidden" }}>
            <div className={styles.tableHeader}>
              <span className={styles.tableHeaderTitle}>All Travel Modes</span>
              <span style={{ fontSize:11, color:"#3b82f6", fontWeight:600, whiteSpace:"nowrap" }}>· Click row to see trips for that mode</span>
              {from && <span style={{ fontSize:11, color:"#94a3b8" }}>· {from} → {to}</span>}
            </div>
            <div className={`${styles.tableWrap} ${styles.scrollX}`}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:320 }}>
                <thead><tr style={{ borderBottom:"2px solid #e2e8f0" }}>
                  <Th label="Mode"           col="transport"   arrow={modeSS.arrow} tog={modeSS.tog} />
                  <Th label="Total Trips"    col="count"       arrow={modeSS.arrow} tog={modeSS.tog} />
                  <Th label="Total Expenses" col="totalAmount" arrow={modeSS.arrow} tog={modeSS.tog} />
                  <th style={{ padding:"9px 12px", background:"#f8fafc", width:40 }} />
                </tr></thead>
                <tbody>
                  {modeRows.length===0
                    ? <tr><td colSpan={4} style={{ padding:20, textAlign:"center", color:"#94a3b8" }}>No data. Try "All Time".</td></tr>
                    : modeRows.map((t,i) => {
                      const c=TC[t.transport]??"#64748b";
                      return (
                        <tr key={t.transport}
                          style={{ borderBottom:"1px solid #f8fafc", cursor:"pointer" }}
                          onClick={async()=>{
                            setLoadingDrill(true); setLoadingLabel(t.transport);
                            const trips = await fetchModeTrips(t.transport, true);
                            setLoadingDrill(false); setLoadingLabel(null);
                            onDetailOpen({ kind:"transport", stat:t, trips });
                          }}
                          onMouseEnter={ev=>(ev.currentTarget as HTMLTableRowElement).style.background="#f0f9ff"}
                          onMouseLeave={ev=>(ev.currentTarget as HTMLTableRowElement).style.background="transparent"}>
                          <td style={{ padding:"10px 14px" }}><div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:10, height:10, borderRadius:2, background:DC[i%DC.length], flexShrink:0 }} /><span style={{ fontSize:16 }}>{modeIcon(t.transport)}</span><strong style={{ color:"#0f172a" }}>{t.transport}</strong></div></td>
                          <td style={{ padding:"10px 14px", fontWeight:800, color:c, fontSize:13 }}>{t.count}</td>
                          <td style={{ padding:"10px 14px", fontWeight:800, color:"#1e40af", fontSize:13 }}>{fmt(t.totalAmount)}</td>
                          <td style={{ padding:"10px 14px", color:"#94a3b8", fontSize:16 }}>›</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === "employee" && (
          <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e2e8f0", overflow:"hidden" }}>
            {empRows.length===0
              ? <div style={{ padding:32, textAlign:"center", color:"#94a3b8" }}><div style={{ fontSize:28, marginBottom:8 }}>👤</div><p style={{ fontWeight:700, color:"#64748b", margin:0 }}>No employee expense data.</p><p style={{ fontSize:12, margin:"6px 0 0" }}>Try "All Time".</p></div>
              : (<>
                <div className={styles.tableHeader}>
                  <span className={styles.tableHeaderTitle}>Employees by Expense</span>
                  <span style={{ fontSize:11, color:"#3b82f6", fontWeight:600, whiteSpace:"nowrap" }}>· Click row to see that employee's expense claims</span>
                </div>
                <div className={`${styles.tableWrap} ${styles.scrollX}`}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:560 }}>
                    <thead><tr style={{ borderBottom:"2px solid #e2e8f0" }}>
                      <th style={{ padding:"9px 12px", background:"#f8fafc", fontWeight:700, color:"#64748b", fontSize:11, textTransform:"uppercase", width:36 }}>#</th>
                      <Th label="Employee"       col="displayName"  arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Code"           col="employeeCode" arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Department"     col="department"   arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Claims"         col="claimCount"   arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Approved"       col="approved"     arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Pending"        col="pending"      arrow={empSS.arrow} tog={empSS.tog} />
                      <Th label="Total Expenses" col="totalAmount"  arrow={empSS.arrow} tog={empSS.tog} />
                      <th style={{ padding:"9px 12px", background:"#f8fafc", width:40 }} />
                    </tr></thead>
                    <tbody>
                      {empRows.map((e,i) => (
                        <tr key={e.employeeId}
                          style={{ borderBottom:"1px solid #f8fafc", cursor:"pointer" }}
                          onClick={async()=>{
                            setLoadingDrill(true); setLoadingLabel(e.displayName);
                            const claims = await fetchEmployeeClaims(e.employeeId);
                            setLoadingDrill(false); setLoadingLabel(null);
                            onDetailOpen({ kind:"employee", stat:e, claims });
                          }}
                          onMouseEnter={ev=>(ev.currentTarget as HTMLTableRowElement).style.background="#f0f9ff"}
                          onMouseLeave={ev=>(ev.currentTarget as HTMLTableRowElement).style.background="transparent"}>
                          <td style={{ padding:"9px 12px", color:"#94a3b8", fontWeight:700 }}>#{i+1}</td>
                          <td style={{ padding:"9px 12px" }}><div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:28, height:28, borderRadius:"50%", background:"#3b82f611", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#3b82f6", flexShrink:0 }}>{e.displayName.split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase()}</div><strong style={{ color:"#0f172a" }}>{e.displayName}</strong></div></td>
                          <td style={{ padding:"9px 12px", color:"#64748b", fontFamily:"monospace" }}>{e.employeeCode||"—"}</td>
                          <td style={{ padding:"9px 12px" }}>{e.department?<span style={{ background:"#eef2ff", color:"#4f46e5", borderRadius:20, padding:"1px 8px", fontSize:11, fontWeight:700 }}>🏢 {e.department}</span>:<span style={{ color:"#94a3b8" }}>—</span>}</td>
                          <td style={{ padding:"9px 12px", fontWeight:700, color:"#0f172a" }}>{e.claimCount}</td>
                          <td style={{ padding:"9px 12px" }}><span style={{ background:"#dcfce7", color:"#15803d", borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{e.approved}</span></td>
                          <td style={{ padding:"9px 12px" }}><span style={{ background:"#fef9c3", color:"#854d0e", borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{e.pending}</span></td>
                          <td style={{ padding:"9px 12px", fontWeight:800, color:"#1e40af", fontSize:13 }}>{fmt(e.totalAmount)}</td>
                          <td style={{ padding:"9px 12px", color:"#94a3b8", fontSize:16 }}>›</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.tableFooter}><span className={styles.tableFooterText}>{empRows.length} of {employees.length} employees</span></div>
              </>)}
          </div>
        )}

        {view === "department" && (
          <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e2e8f0", overflow:"hidden" }}>
            {deptRows.length===0
              ? <div style={{ padding:32, textAlign:"center", color:"#94a3b8" }}><div style={{ fontSize:28, marginBottom:8 }}>🏢</div><p style={{ fontWeight:700, color:"#64748b", margin:0 }}>No department data.</p><p style={{ fontSize:12, margin:"6px 0 0" }}>Try "All Time" or ensure requests have departments set.</p></div>
              : (<>
                <div className={styles.tableHeader}>
                  <span className={styles.tableHeaderTitle}>Departments</span>
                  <span style={{ fontSize:11, color:"#3b82f6", fontWeight:600, whiteSpace:"nowrap" }}>· Click row to see ONLY that department's requests</span>
                </div>
                <div className={`${styles.tableWrap} ${styles.scrollX}`}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:400 }}>
                    <thead><tr style={{ borderBottom:"2px solid #e2e8f0" }}>
                      <Th label="Department"     col="department"   arrow={deptSS.arrow} tog={deptSS.tog} />
                      <Th label="Requests"       col="requestCount" arrow={deptSS.arrow} tog={deptSS.tog} />
                      <Th label="Req Approved"   col="approved"     arrow={deptSS.arrow} tog={deptSS.tog} />
                      <Th label="Req Pending"    col="pending"      arrow={deptSS.arrow} tog={deptSS.tog} />
                      <Th label="Total Expenses" col="expenseTotal" arrow={deptSS.arrow} tog={deptSS.tog} />
                      <th style={{ padding:"9px 12px", background:"#f8fafc", width:40 }} />
                    </tr></thead>
                    <tbody>
                      {deptRows.map((d,i) => (
                        <tr key={d.department}
                          style={{ borderBottom:"1px solid #f8fafc", cursor:"pointer" }}
                          onClick={async()=>{
                            setLoadingDrill(true); setLoadingLabel(d.department);
                            // ── FIX: fetch all and filter by this department ─────────────
                            const requests = await fetchDepartmentRequests(d.department);
                            setLoadingDrill(false); setLoadingLabel(null);
                            onDetailOpen({ kind:"department", stat:d, requests });
                          }}
                          onMouseEnter={ev=>(ev.currentTarget as HTMLTableRowElement).style.background="#f0f9ff"}
                          onMouseLeave={ev=>(ev.currentTarget as HTMLTableRowElement).style.background="transparent"}>
                          <td style={{ padding:"9px 12px" }}><div style={{ display:"flex", alignItems:"center", gap:7 }}><div style={{ width:10, height:10, borderRadius:2, background:DC[i%DC.length], flexShrink:0 }} /><strong style={{ color:"#0f172a" }}>{d.department||"Unknown"}</strong></div></td>
                          <td style={{ padding:"9px 12px", fontWeight:700, color:"#0f172a" }}>{d.requestCount}</td>
                          <td style={{ padding:"9px 12px" }}><span style={{ background:"#dcfce7", color:"#15803d", borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{d.approved}</span></td>
                          <td style={{ padding:"9px 12px" }}><span style={{ background:"#fef9c3", color:"#854d0e", borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{d.pending}</span></td>
                          <td style={{ padding:"9px 12px", fontWeight:800, color:"#1e40af", fontSize:13 }}>{fmt(d.expenseTotal)}</td>
                          <td style={{ padding:"9px 12px", color:"#94a3b8", fontSize:16 }}>›</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.tableFooter}><span className={styles.tableFooterText}>{deptRows.length} department{deptRows.length!==1?"s":""}</span></div>
              </>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin Overview ────────────────────────────────────────────────────────────
function AdminOverview({ s, from, to }: { s: Summary; from: string; to: string }) {
  const r1 = useRef<HTMLCanvasElement>(null); const r2 = useRef<HTMLCanvasElement>(null);
  useChart(r1, { type:"bar", data:{ labels:["Approved","Pending","Rejected"], datasets:[{ label:"Requests", data:[s.approvedRequests,s.pendingRequests,s.rejectedRequests], backgroundColor:["#10b98122","#f59e0b22","#ef444422"], borderColor:["#10b981","#f59e0b","#ef4444"], borderWidth:2, borderRadius:8 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:G}}, x:{grid:{display:false}} } } });
  useChart(r2, { type:"bar", data:{ labels:["Total","Approved","Pending"], datasets:[{ label:"₹", data:[s.totalExpenses,s.approvedExpenses,s.pendingExpenses], backgroundColor:["#3b82f622","#10b98122","#f59e0b22"], borderColor:["#3b82f6","#10b981","#f59e0b"], borderWidth:2, borderRadius:8 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>` ${fmt(ctx.parsed.y as number)}`}} }, scales:{ y:{beginAtZero:true,ticks:{callback:v=>v==null?"":fmt(v as number)},grid:{color:G}}, x:{grid:{display:false}} } } });
  const csv: Record<string,string|number>[] = [ { Metric:"Total Requests",Value:s.totalRequests,From:from||"All",To:to||"All" }, { Metric:"Pending",Value:s.pendingRequests }, { Metric:"Approved",Value:s.approvedRequests }, { Metric:"Rejected",Value:s.rejectedRequests }, { Metric:"Total Expenses",Value:s.totalExpenses }, { Metric:"Pending Exp",Value:s.pendingExpenses }, { Metric:"Approved Exp",Value:s.approvedExpenses }, { Metric:"Employees",Value:s.totalEmployees } ];
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:10 }}>
        <ExBtn onCSV={()=>exportCSV(csv,"overview-summary")} onPDF={()=>exportPDF("Overview Report","admin-overview")} label="Export:" />
      </div>
      <div id="admin-overview" className={styles.overviewChartGrid} style={{ marginBottom:18 }}>
        {[
          { ref:r1, title:"Requests by Status", sub:from?`${from} → ${to}`:"All time", lg:[{l:"Approved",c:"#10b981",v:String(s.approvedRequests)},{l:"Pending",c:"#f59e0b",v:String(s.pendingRequests)},{l:"Rejected",c:"#ef4444",v:String(s.rejectedRequests)}] },
          { ref:r2, title:"Expense Pipeline",   sub:from?`${from} → ${to}`:"All time", lg:[{l:"Total",c:"#3b82f6",v:fmt(s.totalExpenses)},{l:"Approved",c:"#10b981",v:fmt(s.approvedExpenses)},{l:"Pending",c:"#f59e0b",v:fmt(s.pendingExpenses)}] },
        ].map(card => (
          <div key={card.title} className={styles.chartCard}>
            <p className={styles.chartTitle}>{card.title}</p>
            <p className={styles.chartSub}>{card.sub}</p>
            <div style={{ display:"flex", gap:10, marginBottom:9, flexWrap:"wrap" }}>
              {card.lg.map(x => <div key={x.l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12 }}><div style={{ width:9, height:9, borderRadius:2, background:x.c }} /><span style={{ color:"#64748b" }}>{x.l}:</span><strong style={{ color:"#0f172a" }}>{x.v}</strong></div>)}
            </div>
            <div style={{ height:200 }}><canvas ref={card.ref} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const navigate = useNavigate();
  const fullName = localStorage.getItem("full_name") ?? "Employee";
  const role     = localStorage.getItem("role") ?? "Employee";
  const initials = fullName.trim().split(" ").filter(Boolean).map(p=>p[0]).slice(0,2).join("").toUpperCase()||"ME";
  const isAdmin  = ["admin","hr","Admin","HR"].includes(role);

  const [sum,           setSum]           = useState<Summary | null>(null);
  const [tr,            setTr]            = useState<TransportStat[]>([]);
  const [emp,           setEmp]           = useState<EmployeeStat[]>([]);
  const [dept,          setDept]          = useState<DepartmentStat[]>([]);
  const [allClaims,     setAllClaims]     = useState<ExpenseClaim[]>([]);
  const [myClaims,      setMyClaims]      = useState<ExpenseClaim[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [kpiLoading,    setKpiLoading]    = useState<string | null>(null);

  const [period, setPeriod] = useState<PeriodType>("all");
  const [cf, setCf] = useState(""); const [ct, setCt] = useState(toISO(today));
  const [dateErr, setDateErr] = useState("");
  const [rFrom, setRFrom] = useState(""); const [rTo, setRTo] = useState("");
  const [empTab,   setEmpTab]   = useState<EmployeeTab>("overview");
  const [adminTab, setAdminTab] = useState<AdminTab>("overview");
  const [detail,   setDetail]   = useState<DetailType | null>(null);

  const getRange = useCallback((): { from: string; to: string } | null => {
    if (period === "all")    { setDateErr(""); return { from:"", to:"" }; }
    if (period === "custom") {
      if (!cf) { setDateErr("Please select a From date."); return null; }
      if (!ct) { setDateErr("Please select a To date.");   return null; }
      if (cf > ct) { setDateErr('"From" must be ≤ "To".'); return null; }
      setDateErr(""); return { from:cf, to:ct };
    }
    setDateErr(""); return getPeriodDates(period);
  }, [period, cf, ct]);

  const loadClaims = useCallback(async () => {
    setClaimsLoading(true);
    try {
      if (isAdmin) { const result = await get<{ total: number; items: ExpenseClaim[] }>("/Expense?pageSize=500"); setAllClaims(result.items ?? []); }
      else { const items = await get<ExpenseClaim[]>("/Expense/my"); setMyClaims(Array.isArray(items) ? items : []); }
    } catch { /**/ } finally { setClaimsLoading(false); }
  }, [isAdmin]);

  const load = useCallback(async () => {
    const range = getRange(); if (!range) return;
    setLoading(true);
    const { from, to } = range; setRFrom(from); setRTo(to);
    const qs = buildQS(from, to);
    const trEp = isAdmin ? `/Report/by-transport?${qs}` : `/Report/my-transport?${qs}`;
    const [rSum, rTr, rEmp, rDept] = await Promise.allSettled([
      get<Summary>(`/Report/dashboard?${qs}`),
      get<TransportStat[]>(trEp).catch(()=>[] as TransportStat[]),
      isAdmin ? get<EmployeeStat[]>(`/Report/by-employee?${qs}`).catch(()=>[] as EmployeeStat[]) : Promise.resolve([] as EmployeeStat[]),
      isAdmin ? get<DepartmentStat[]>(`/Report/by-department?${qs}`).catch(()=>[] as DepartmentStat[]) : Promise.resolve([] as DepartmentStat[]),
    ]);
    if (rSum.status ==="fulfilled") setSum(rSum.value);
    if (rTr.status  ==="fulfilled") setTr(rTr.value);
    if (rEmp.status ==="fulfilled") setEmp(rEmp.value);
    if (rDept.status==="fulfilled") setDept(rDept.value);
    setLoading(false);
  }, [getRange, isAdmin]);

  useEffect(() => { void load(); void loadClaims(); }, [load, loadClaims]);

  const handleKpiClick = useCallback(async (label: string, icon: string, color: string, dataType: "requests" | "expenses", fetchFn: () => Promise<TravelRequest[] | ExpenseClaim[]>) => {
    setKpiLoading(label);
    setDetail({ kind:"kpi", label, icon, color, data:null, dataType });
    try { const data = await fetchFn(); setDetail({ kind:"kpi", label, icon, color, data: data as TravelRequest[] | ExpenseClaim[], dataType }); }
    catch { setDetail({ kind:"kpi", label, icon, color, data:[], dataType }); }
    setKpiLoading(null);
  }, []);

  const handleEmployeesClick = useCallback(async () => {
    setKpiLoading("Active Employees");
    setDetail({ kind:"employees", employees:null });
    try { const employees = await fetchActiveEmployees(); setDetail({ kind:"employees", employees }); }
    catch { setDetail({ kind:"employees", employees:[] }); }
    setKpiLoading(null);
  }, []);

  const adminKpis = sum ? [
    { icon:"✈️", label:"Total Requests",   value:sum.totalRequests,         color:"#3b82f6", onClick:()=>handleKpiClick("Total Requests",  "✈️","#3b82f6","requests",()=>fetchRequestsByStatus("",true)) },
    { icon:"⏳", label:"Pending",           value:sum.pendingRequests,       color:"#f59e0b", onClick:()=>handleKpiClick("Pending Requests","⏳","#f59e0b","requests",()=>fetchRequestsByStatus("Submitted",true)) },
    { icon:"✅", label:"Approved",          value:sum.approvedRequests,      color:"#10b981", onClick:()=>handleKpiClick("Approved Requests","✅","#10b981","requests",()=>fetchRequestsByStatus("Approved",true)) },
    { icon:"❌", label:"Rejected",          value:sum.rejectedRequests,      color:"#ef4444", onClick:()=>handleKpiClick("Rejected Requests","❌","#ef4444","requests",()=>fetchRequestsByStatus("Rejected",true)) },
    { icon:"💰", label:"Total Expenses",    value:fmt(sum.totalExpenses),    color:"#8b5cf6", onClick:()=>handleKpiClick("All Expenses",    "💰","#8b5cf6","expenses",()=>fetchExpensesByStatus("",true)) },
    { icon:"⏳", label:"Pending Expenses",  value:fmt(sum.pendingExpenses),  color:"#f59e0b", onClick:()=>handleKpiClick("Pending Expenses","⏳","#f59e0b","expenses",()=>fetchExpensesByStatus("Submitted",true)) },
    { icon:"✅", label:"Approved Expenses", value:fmt(sum.approvedExpenses), color:"#10b981", onClick:()=>handleKpiClick("Approved Expenses","✅","#10b981","expenses",()=>fetchExpensesByStatus("Approved",true)) },
    { icon:"👥", label:"Active Employees",  value:sum.totalEmployees,        color:"#0ea5e9", onClick:handleEmployeesClick },
  ] : [];

  const empKpis = sum ? [
    { icon:"✈️", label:"My Requests",      value:sum.totalRequests,         color:"#3b82f6", onClick:()=>handleKpiClick("My Requests",         "✈️","#3b82f6","requests",()=>fetchRequestsByStatus("",false)) },
    { icon:"✅", label:"Approved",          value:sum.approvedRequests,      color:"#10b981", onClick:()=>handleKpiClick("My Approved Requests","✅","#10b981","requests",()=>fetchRequestsByStatus("Approved",false)) },
    { icon:"⏳", label:"Pending",           value:sum.pendingRequests,       color:"#f59e0b", onClick:()=>handleKpiClick("My Pending Requests","⏳","#f59e0b","requests",()=>fetchRequestsByStatus("Submitted",false)) },
    { icon:"❌", label:"Rejected",          value:sum.rejectedRequests,      color:"#ef4444", onClick:()=>handleKpiClick("My Rejected Requests","❌","#ef4444","requests",()=>fetchRequestsByStatus("Rejected",false)) },
    { icon:"💰", label:"Total Expenses",    value:fmt(sum.totalExpenses),    color:"#8b5cf6", onClick:()=>handleKpiClick("My Total Expenses",   "💰","#8b5cf6","expenses",()=>fetchExpensesByStatus("",false)) },
    { icon:"✅", label:"Approved Expenses", value:fmt(sum.approvedExpenses), color:"#10b981", onClick:()=>handleKpiClick("My Approved Expenses","✅","#10b981","expenses",()=>fetchExpensesByStatus("Approved",false)) },
    { icon:"⏳", label:"Pending Expenses",  value:fmt(sum.pendingExpenses),  color:"#f59e0b", onClick:()=>handleKpiClick("My Pending Expenses","⏳","#f59e0b","expenses",()=>fetchExpensesByStatus("Submitted",false)) },
  ] : [];

  const empKpiCsv: Record<string,string|number>[] = sum ? [ { Metric:"My Requests",Value:sum.totalRequests,From:rFrom||"All",To:rTo||"All" }, { Metric:"Approved",Value:sum.approvedRequests }, { Metric:"Pending",Value:sum.pendingRequests }, { Metric:"Rejected",Value:sum.rejectedRequests }, { Metric:"Total Expenses",Value:sum.totalExpenses }, { Metric:"Approved Expenses",Value:sum.approvedExpenses }, { Metric:"Pending Expenses",Value:sum.pendingExpenses } ] : [];

  const tabBtn = (key: string, label: string, active: boolean, fn: () => void) => (
    <button key={key} onClick={fn} className={`${styles.tab} ${active ? styles.tabActive : ""}`}>{label}</button>
  );

  return (
    <div className={styles.page}>
      {detail && <DetailOverlay detail={detail} onClose={() => setDetail(null)} />}
      <CommonNavbar showBack={true} onBack={() => navigate("/dashboard")} user={{ initials, name:fullName, subtitle:role }} onSignOut={async () => signOutUser()} />
      <main className={styles.main}>
        {/* Hero */}
        <div className={styles.hero}>
          <div>
            <p className={styles.heroEyebrow}>Analytics</p>
            <h1 className={styles.heroTitle}>📊 Travel & Expense Reports</h1>
            <p className={styles.heroSub}>{isAdmin ? "Organisation-wide · Click any card, bar, or row for details" : "Your personal summary · Click any card for details"}</p>
          </div>
          <button className={styles.heroBack} onClick={() => navigate("/dashboard")}>← Dashboard</button>
        </div>

        <PeriodFilter period={period} setPeriod={p=>{setPeriod(p);setDateErr("");}} cf={cf} setCf={setCf} ct={ct} setCt={setCt} onApply={()=>void load()} error={dateErr} />

        <div style={{ marginBottom:14, marginTop:-6 }}>
          {(rFrom||rTo)
            ? <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                <span style={{ fontSize:11, fontWeight:700, color:"#64748b" }}>Showing:</span>
                <span style={{ fontSize:11, background:"#0f172a", color:"#fff", borderRadius:6, padding:"2px 10px", fontWeight:700 }}>{rFrom} → {rTo}</span>
                <span style={{ fontSize:11, color:"#94a3b8" }}>· Expense claims shown for All Time</span>
              </div>
            : <span style={{ fontSize:11, background:"#0f172a", color:"#fff", borderRadius:6, padding:"2px 10px", fontWeight:700 }}>All Time</span>
          }
        </div>

        <div className={styles.tabs}>
          {isAdmin
            ? [ tabBtn("overview","Overview",adminTab==="overview",()=>setAdminTab("overview")), tabBtn("analytics","Analytics",adminTab==="analytics",()=>setAdminTab("analytics")), tabBtn("expenses",`All Expenses (${allClaims.length})`,adminTab==="expenses",()=>setAdminTab("expenses")) ]
            : [ tabBtn("overview","Overview",empTab==="overview",()=>setEmpTab("overview")), tabBtn("bymode","By Travel Mode",empTab==="bymode",()=>setEmpTab("bymode")), tabBtn("myexpenses",`My Expenses (${myClaims.length})`,empTab==="myexpenses",()=>setEmpTab("myexpenses")) ]}
        </div>

        {loading
          ? <div className={styles.loading}><div style={{ fontSize:32, marginBottom:12 }}>📊</div><p style={{ margin:0 }}>Loading reports…</p></div>
          : isAdmin
          ? (<>
              {adminTab==="overview" && sum && (<>
                <div className={styles.hintBanner}><span>💡</span><span className={styles.hintText}>Click any card below to view the underlying records</span></div>
                <div className={styles.statGrid} style={{ marginBottom:18 }}>
                  {adminKpis.map(k => <KPI key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} onClick={k.onClick} loading={kpiLoading===k.label} />)}
                </div>
                <AdminOverview s={sum} from={rFrom} to={rTo} />
              </>)}
              {adminTab==="analytics" && <AdminAnalytics transport={tr} employees={emp} departments={dept} from={rFrom} to={rTo} onDetailOpen={setDetail} />}
              {adminTab==="expenses" && (claimsLoading
                ? <div className={styles.loading}>⏳ Loading expense claims…</div>
                : <ExpenseClaimsTable claims={allClaims} title="All Expense Claims" emptyMsg="No expense claims found." onRowClick={c=>setDetail({ kind:"expense", claim:c })} />
              )}
            </>)
          : (<>
              {empTab==="overview" && sum && (<>
                <div className={styles.hintBanner}><span>💡</span><span className={styles.hintText}>Click any card to view your related records</span></div>
                <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:10 }}>
                  <ExBtn onCSV={()=>exportCSV(empKpiCsv,"my-overview")} onPDF={()=>exportPDF("My Travel Summary","emp-overview")} label="Export:" />
                </div>
                <div id="emp-overview">
                  <div className={styles.statGrid} style={{ marginBottom:18 }}>
                    {empKpis.map(k => <KPI key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} onClick={k.onClick} loading={kpiLoading===k.label} />)}
                  </div>
                  {sum.totalRequests > 0 && (
                    <div className={styles.chartCard} style={{ marginBottom:18 }}>
                      <p className={styles.chartTitle}>Request Approval Rate</p>
                      {rFrom && <p className={styles.chartSub}>{rFrom} → {rTo}</p>}
                      <div style={{ display:"flex", height:26, borderRadius:8, overflow:"hidden", marginBottom:8 }}>
                        {[{l:"Approved",n:sum.approvedRequests,c:"#10b981"},{l:"Pending",n:sum.pendingRequests,c:"#f59e0b"},{l:"Rejected",n:sum.rejectedRequests,c:"#ef4444"}].filter(x=>x.n>0).map(x => (
                          <div key={x.l} style={{ width:`${(x.n/sum.totalRequests)*100}%`, background:x.c, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:11, fontWeight:700, transition:"width 0.5s", minWidth:0, overflow:"hidden" }}>
                            {Math.round((x.n/sum.totalRequests)*100)}%
                          </div>
                        ))}
                      </div>
                      <div className={styles.rateLegend}>
                        {[{l:"Approved",c:"#10b981"},{l:"Pending",c:"#f59e0b"},{l:"Rejected",c:"#ef4444"}].map(x => (
                          <div key={x.l} className={styles.rateLegendItem}><div className={styles.rateDot} style={{ background:x.c }} />{x.l}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>)}
              {empTab==="bymode" && (tr.length===0
                ? <div className={styles.loading}><div style={{ fontSize:32, marginBottom:10 }}>✈️</div><p style={{ margin:0, fontWeight:700, color:"#64748b" }}>No travel mode data.</p><p style={{ margin:"6px 0 0", fontSize:12 }}>Try "All Time" and click Apply.</p></div>
                : <ByTravelModeTab transport={tr} from={rFrom} to={rTo} onDetailOpen={setDetail} />
              )}
              {empTab==="myexpenses" && (claimsLoading
                ? <div className={styles.loading}>⏳ Loading your expense claims…</div>
                : <ExpenseClaimsTable claims={myClaims} title="My Expense Claims" emptyMsg="No expense claims submitted yet." onRowClick={c=>setDetail({ kind:"expense", claim:c })} />
              )}
            </>)}
      </main>
    </div>
  );
}