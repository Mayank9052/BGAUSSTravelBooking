// src/pages/ExpensePage.tsx
// BGauss Travel Booking — Employee expense submission + bill upload
// Real-time notifications via SignalR

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import * as signalR from "@microsoft/signalr";

// ── Types ──────────────────────────────────────────────────────
interface TravelRequest {
  requestId:   number;
  requestCode: string;
  destination: string;
  status:      string;
}

interface ExpenseClaim {
  claimId:      number;
  claimCode:    string;
  requestCode:  string;
  category:     string;
  amount:       number;
  currency:     string;
  expenseDate:  string;
  description:  string | null;
  billFileName: string | null;
  status:       string;
}

interface Notification {
  id:        number;
  title:     string;
  message:   string;
  type:      string;
  createdAt: string;
  isRead:    boolean;
}

const CATEGORIES = ["Flight","Train","Cab","Hotel","Meal","Miscellaneous"];

// ── Axios auth header ──────────────────────────────────────────
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("travel_token")}`,
});

// ═══════════════════════════════════════════════════════════════
export default function ExpensePage() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("travel_token");
  const role     = localStorage.getItem("travel_role") ?? "Employee";

  // ── Form state ─────────────────────────────────────────────
  const [requests,    setRequests]    = useState<TravelRequest[]>([]);
  const [myClaims,    setMyClaims]    = useState<ExpenseClaim[]>([]);
  const [allClaims,   setAllClaims]   = useState<ExpenseClaim[]>([]);   // HR view
  const [notifications, setNotifs]   = useState<Notification[]>([]);
  const [unreadCount,   setUnread]    = useState(0);
  const [showNotifs,    setShowNotifs]= useState(false);
  const [loading,       setLoading]   = useState(false);
  const [submitLoading, setSubmit]    = useState(false);
  const [toast,         setToast]     = useState<{msg:string;type:"success"|"error"}|null>(null);

  const [form, setForm] = useState({
    requestId:   "",
    category:    "Flight",
    amount:      "",
    currency:    "INR",
    expenseDate: new Date().toISOString().slice(0,10),
    description: "",
  });
  const [bill, setBill] = useState<File | null>(null);
  const billRef = useRef<HTMLInputElement>(null);

  // ── SignalR connection ─────────────────────────────────────
  const hubRef = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    loadRequests();
    loadClaims();
    if (role === "HR" || role === "Admin") loadAllClaims();
    loadNotifications();
    connectSignalR();
    return () => { hubRef.current?.stop(); };
  }, []); // eslint-disable-line

  const connectSignalR = useCallback(() => {
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${import.meta.env.VITE_API_BASE ?? ""}/hubs/travel?access_token=${token}`)
      .withAutomaticReconnect()
      .build();

    conn.on("ReceiveNotification", (notif) => {
      setNotifs(prev => [{ ...notif, id: Date.now(), isRead: false, createdAt: notif.timestamp }, ...prev]);
      setUnread(n => n + 1);
      showToast(notif.title, "success");
    });

    conn.start().catch(console.error);
    hubRef.current = conn;
  }, [token]);

  // ── Data loaders ───────────────────────────────────────────
  const loadRequests = async () => {
    try {
      const r = await axios.get("/api/Booking/my?status=Approved", { headers: authHeaders() });
      setRequests(r.data);
    } catch { /* silent */ }
  };

  const loadClaims = async () => {
    setLoading(true);
    try {
      const r = await axios.get("/api/Expense/my", { headers: authHeaders() });
      setMyClaims(r.data);
    } catch { showToast("Failed to load claims", "error"); }
    finally { setLoading(false); }
  };

  const loadAllClaims = async () => {
    try {
      const r = await axios.get("/api/Expense/all", { headers: authHeaders() });
      setAllClaims(r.data);
    } catch { /* silent */ }
  };

  const loadNotifications = async () => {
    try {
      const r = await axios.get("/api/Notification/my?limit=20", { headers: authHeaders() });
      setNotifs(r.data);
      setUnread(r.data.filter((n: Notification) => !n.isRead).length);
    } catch { /* silent */ }
  };

  // ── Submit claim ───────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.requestId) return showToast("Select a travel request", "error");
    if (!form.amount || Number(form.amount) <= 0) return showToast("Enter a valid amount", "error");

    setSubmit(true);
    try {
      const fd = new FormData();
      fd.append("requestId",   form.requestId);
      fd.append("category",    form.category);
      fd.append("amount",      form.amount);
      fd.append("currency",    form.currency);
      fd.append("expenseDate", form.expenseDate);
      fd.append("description", form.description);
      if (bill) fd.append("Bill", bill);

      const r = await axios.post("/api/Expense/submit", fd, {
        headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
      });

      showToast(`Claim ${r.data.claimCode} submitted successfully!`, "success");
      setForm({ requestId:"",category:"Flight",amount:"",currency:"INR",
                expenseDate:new Date().toISOString().slice(0,10),description:"" });
      setBill(null);
      if (billRef.current) billRef.current.value = "";
      loadClaims();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : "Submit failed";
      showToast(msg ?? "Submit failed", "error");
    } finally { setSubmit(false); }
  };

  // ── HR approval actions ────────────────────────────────────
  const approve = async (id: number) => {
    try {
      await axios.patch(`/api/Expense/${id}/approve`, {}, { headers: authHeaders() });
      showToast("Claim approved", "success");
      loadAllClaims();
    } catch { showToast("Action failed", "error"); }
  };

  const reimburse = async (id: number) => {
    try {
      await axios.patch(`/api/Expense/${id}/reimburse`, {}, { headers: authHeaders() });
      showToast("Marked as reimbursed", "success");
      loadAllClaims();
    } catch { showToast("Action failed", "error"); }
  };

  const reject = async (id: number) => {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    try {
      await axios.patch(`/api/Expense/${id}/reject`, { reason }, { headers: authHeaders() });
      showToast("Claim rejected", "success");
      loadAllClaims();
    } catch { showToast("Action failed", "error"); }
  };

  // ── Helpers ────────────────────────────────────────────────
  const showToast = (msg: string, type: "success"|"error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const statusColor = (s: string) => ({
    Pending:"bg-amber-100 text-amber-800", Approved:"bg-green-100 text-green-800",
    Rejected:"bg-red-100 text-red-800",   Reimbursed:"bg-blue-100 text-blue-800",
  }[s] ?? "bg-gray-100 text-gray-700");

  const isHR = role === "HR" || role === "Admin";

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold
          ${toast.type === "success" ? "bg-green-50 text-green-800 border border-green-200"
                                     : "bg-red-50 text-red-800 border border-red-200"}`}>
          {toast.msg}
        </div>
      )}

      {/* Navbar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">BG</span>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">BGauss Travel</p>
            <p className="text-base font-bold text-gray-900 leading-tight">Expense Claims</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <button
            className="relative p-2 rounded-lg hover:bg-gray-100"
            onClick={() => { setShowNotifs(!showNotifs); setUnread(0); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => navigate("/dashboard")}
            className="text-sm font-semibold text-gray-600 hover:text-gray-900">
            Dashboard
          </button>
        </div>
      </header>

      {/* Notifications dropdown */}
      {showNotifs && (
        <div className="absolute top-16 right-4 z-40 w-80 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-bold text-gray-800">
            Notifications
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">No notifications</p>
          ) : notifications.slice(0, 8).map(n => (
            <div key={n.id} className={`px-4 py-3 border-b border-gray-50 ${!n.isRead ? "bg-blue-50" : ""}`}>
              <p className="text-sm font-semibold text-gray-900">{n.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
            </div>
          ))}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* ── Submit Expense Form ── */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5">Submit New Expense</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                  Travel Request *
                </label>
                <select value={form.requestId} onChange={e => setForm(p => ({...p,requestId:e.target.value}))}
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-500">
                  <option value="">Select approved request</option>
                  {requests.map(r => (
                    <option key={r.requestId} value={r.requestId}>
                      {r.requestCode} — {r.destination}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                  Category *
                </label>
                <select value={form.category} onChange={e => setForm(p=>({...p,category:e.target.value}))}
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-500">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                  Amount (INR) *
                </label>
                <input type="number" min="1" step="0.01" value={form.amount}
                  onChange={e => setForm(p=>({...p,amount:e.target.value}))}
                  placeholder="0.00"
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-500" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                  Expense Date *
                </label>
                <input type="date" value={form.expenseDate}
                  onChange={e => setForm(p=>({...p,expenseDate:e.target.value}))}
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-500" />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                  Description
                </label>
                <input type="text" value={form.description}
                  onChange={e => setForm(p=>({...p,description:e.target.value}))}
                  placeholder="e.g. Cab from airport to hotel"
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-500" />
              </div>

              {/* Bill upload */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                  Bill / Receipt (PDF, JPG, PNG — max 10 MB)
                </label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center
                  hover:border-red-400 transition-colors cursor-pointer"
                  onClick={() => billRef.current?.click()}>
                  {bill ? (
                    <p className="text-sm font-semibold text-gray-700">{bill.name}
                      <span className="text-xs text-gray-400 ml-2">
                        ({(bill.size/1024).toFixed(0)} KB)
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">Click to upload bill</p>
                  )}
                </div>
                <input ref={billRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display:"none" }} onChange={e => setBill(e.target.files?.[0] ?? null)} />
              </div>
            </div>

            <button type="submit" disabled={submitLoading}
              className="w-full h-11 bg-red-600 text-white font-bold rounded-xl
                disabled:opacity-50 hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
              {submitLoading ? (
                <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83"/></svg>
                  Submitting…</>
              ) : "Submit Expense Claim"}
            </button>
          </form>
        </section>

        {/* ── My Claims ── */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">My Claims</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : myClaims.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No claims submitted yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Claim ID","Request","Category","Amount","Date","Status","Bill"].map(h => (
                      <th key={h} className="pb-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myClaims.map(c => (
                    <tr key={c.claimId} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 pr-4 font-mono text-xs font-bold text-gray-700">{c.claimCode}</td>
                      <td className="py-3 pr-4 text-xs text-gray-500">{c.requestCode}</td>
                      <td className="py-3 pr-4">{c.category}</td>
                      <td className="py-3 pr-4 font-semibold">₹{c.amount.toLocaleString("en-IN")}</td>
                      <td className="py-3 pr-4 text-gray-500">{c.expenseDate}</td>
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusColor(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {c.billFileName ? (
                          <a href={`${import.meta.env.VITE_API_BASE}/TravelBills/${c.billFileName}`}
                            target="_blank" rel="noreferrer"
                            className="text-xs text-red-600 hover:underline font-semibold">
                            View
                          </a>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── HR Panel ── */}
        {isHR && (
          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">All Employee Claims</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Claim","Employee","Dept","Category","Amount","Date","Status","Actions"].map(h => (
                      <th key={h} className="pb-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allClaims.map((c: any) => (
                    <tr key={c.claimId} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 pr-3 font-mono text-xs font-bold text-gray-700">{c.claimCode}</td>
                      <td className="py-3 pr-3 text-sm">{c.displayName}</td>
                      <td className="py-3 pr-3 text-xs text-gray-500">{c.department}</td>
                      <td className="py-3 pr-3">{c.category}</td>
                      <td className="py-3 pr-3 font-semibold">₹{c.amount.toLocaleString("en-IN")}</td>
                      <td className="py-3 pr-3 text-gray-500 text-xs">{c.expenseDate}</td>
                      <td className="py-3 pr-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusColor(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        {c.status === "Pending" && (
                          <div className="flex gap-1">
                            <button onClick={() => approve(c.claimId)}
                              className="px-2 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 font-semibold">
                              Approve
                            </button>
                            <button onClick={() => reject(c.claimId)}
                              className="px-2 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 font-semibold">
                              Reject
                            </button>
                          </div>
                        )}
                        {c.status === "Approved" && (
                          <button onClick={() => reimburse(c.claimId)}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-semibold">
                            Reimburse
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}