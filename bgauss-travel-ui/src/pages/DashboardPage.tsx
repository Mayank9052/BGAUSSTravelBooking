// src/pages/DashboardPage.tsx
// BGauss Travel Booking — Employee Dashboard
// Shows: My Trips | Expense Summary | Pending Approvals | Quick Actions

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../auth/useMsalLogin";
import styles from "./DashboardPage.module.css";

// ── Types ──────────────────────────────────────────────────────
interface TravelRequest {
  requestId:      number;
  requestCode:    string;
  destination:    string;
  travelPurpose:  string;
  transportType:  string;
  status:         string;
  departureDate:  string;
  returnDate:     string;
  estimatedAmount?: number;
}

interface ExpenseSummary {
  totalPending:    number;
  totalApproved:   number;
  totalReimbursed: number;
  pendingCount:    number;
  approvedCount:   number;
}

// ── Helpers ────────────────────────────────────────────────────
const authHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("jwt_token")}`,
});

const STATUS_COLORS: Record<string, string> = {
  Draft:       styles.statusDraft,
  Submitted:   styles.statusSubmitted,
  UnderReview: styles.statusReview,
  Approved:    styles.statusApproved,
  Rejected:    styles.statusRejected,
  Reimbursed:  styles.statusReimbursed,
  Pending:     styles.statusSubmitted,
};

const TRANSPORT_ICONS: Record<string, string> = {
  Flight: "✈️", Train: "🚂", Cab: "🚕", Hotel: "🏨", Multiple: "🔀",
};

// ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { signOut } = useMsalLogin();

  const fullName    = localStorage.getItem("full_name")     ?? "Employee";
  const role        = localStorage.getItem("role")          ?? "Employee";
  const email       = localStorage.getItem("email")         ?? "";
  const department  = localStorage.getItem("department")    ?? "";
  const empCode     = localStorage.getItem("employee_code") ?? "";

  const initials = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const [requests, setRequests]         = useState<TravelRequest[]>([]);
  const [summary,  setSummary]          = useState<ExpenseSummary | null>(null);
  const [loading,  setLoading]          = useState(true);
  const [activeTab,setActiveTab]        = useState<"trips"|"expenses"|"approvals">("trips");

  useEffect(() => {
    // Redirect to login if no token
    if (!localStorage.getItem("jwt_token")) {
      navigate("/login", { replace: true });
      return;
    }
    loadData();
  }, []); // eslint-disable-line

  const loadData = async () => {
    setLoading(true);
    try {
      // Load travel requests
      const trRes = await fetch("/api/Booking/my", { headers: authHeader() });
      if (trRes.status === 401) { navigate("/login", { replace: true }); return; }
      if (trRes.ok) setRequests(await trRes.json() as TravelRequest[]);

      // Load expense summary
      const expRes = await fetch("/api/Expense/summary", { headers: authHeader() });
      if (expRes.ok) setSummary(await expRes.json() as ExpenseSummary);
    } catch {
      // API may not be running yet — show empty state gracefully
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className={styles.page}>

      {/* ── NAVBAR ── */}
      <header className={styles.navbar}>
        <div className={styles.navLeft}>
          <div className={styles.navLogo}>
            <div className={styles.navLogoIcon}><span>BG</span></div>
            <div className={styles.navLogoText}>
              <span className={styles.navBrand}>BGauss Travel</span>
              <span className={styles.navSub}>Employee Portal</span>
            </div>
          </div>
        </div>
        <nav className={styles.navLinks}>
          <button
            className={`${styles.navLink} ${activeTab === "trips" ? styles.navLinkActive : ""}`}
            onClick={() => setActiveTab("trips")}>
            My Trips
          </button>
          <button
            className={`${styles.navLink} ${activeTab === "expenses" ? styles.navLinkActive : ""}`}
            onClick={() => setActiveTab("expenses")}>
            Expenses
          </button>
          {(role === "HR" || role === "Admin") && (
            <button
              className={`${styles.navLink} ${activeTab === "approvals" ? styles.navLinkActive : ""}`}
              onClick={() => setActiveTab("approvals")}>
              Approvals
            </button>
          )}
        </nav>
        <div className={styles.navRight}>
          <div className={styles.userPill}>
            <div className={styles.avatar}>{initials}</div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{fullName}</span>
              <span className={styles.userRole}>{role}</span>
            </div>
          </div>
          <button className={styles.signOutBtn} onClick={handleSignOut}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      </header>

      <main className={styles.main}>

        {/* ── WELCOME BANNER ── */}
        <div className={styles.welcomeBanner}>
          <div className={styles.welcomeText}>
            <h1 className={styles.welcomeH1}>Good day, {fullName.split(" ")[0]} 👋</h1>
            <p className={styles.welcomeSub}>
              {email} · {department} · {empCode}
            </p>
          </div>
          <div className={styles.welcomeActions}>
            <button className={styles.btnPrimary}
              onClick={() => navigate("/booking/new")}>
              + New Travel Request
            </button>
            <button className={styles.btnSecondary}
              onClick={() => navigate("/expense/submit")}>
              Submit Expense
            </button>
          </div>
        </div>

        {/* ── SUMMARY CARDS ── */}
        <div className={styles.statsRow}>
          {[
            {
              label: "Total Trips",
              value: loading ? "—" : String(requests.length),
              icon: "✈️",
              color: styles.statBlue,
            },
            {
              label: "Pending Claims",
              value: loading ? "—" : String(summary?.pendingCount ?? 0),
              icon: "⏳",
              color: styles.statAmber,
            },
            {
              label: "Approved",
              value: loading ? "—" : `₹${((summary?.totalApproved ?? 0) / 1000).toFixed(1)}K`,
              icon: "✅",
              color: styles.statGreen,
            },
            {
              label: "Reimbursed",
              value: loading ? "—" : `₹${((summary?.totalReimbursed ?? 0) / 1000).toFixed(1)}K`,
              icon: "💰",
              color: styles.statPurple,
            },
          ].map(s => (
            <div key={s.label} className={`${styles.statCard} ${s.color}`}>
              <div className={styles.statIcon}>{s.icon}</div>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── TABS CONTENT ── */}

        {/* MY TRIPS */}
        {activeTab === "trips" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>My Travel Requests</h2>
              <button className={styles.btnOutline}
                onClick={() => navigate("/booking/new")}>
                + New Request
              </button>
            </div>

            {loading ? (
              <div className={styles.loadingRow}>
                {[1,2,3].map(i => <div key={i} className={styles.skeleton} />)}
              </div>
            ) : requests.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>✈️</div>
                <p className={styles.emptyTitle}>No travel requests yet</p>
                <p className={styles.emptySub}>Create your first travel request to get started</p>
                <button className={styles.btnPrimary}
                  onClick={() => navigate("/booking/new")}>
                  + New Travel Request
                </button>
              </div>
            ) : (
              <div className={styles.tripsList}>
                {requests.map(r => (
                  <div key={r.requestId} className={styles.tripCard}>
                    <div className={styles.tripIcon}>
                      {TRANSPORT_ICONS[r.transportType] ?? "🚗"}
                    </div>
                    <div className={styles.tripInfo}>
                      <div className={styles.tripCode}>{r.requestCode}</div>
                      <div className={styles.tripDest}>{r.destination}</div>
                      <div className={styles.tripDates}>
                        {r.departureDate} → {r.returnDate}
                      </div>
                      <div className={styles.tripPurpose}>{r.travelPurpose}</div>
                    </div>
                    <div className={styles.tripRight}>
                      <span className={`${styles.statusBadge} ${STATUS_COLORS[r.status] ?? ""}`}>
                        {r.status}
                      </span>
                      {r.estimatedAmount != null && (
                        <div className={styles.tripAmount}>
                          ₹{r.estimatedAmount.toLocaleString("en-IN")}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* EXPENSES */}
        {activeTab === "expenses" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Expense Claims</h2>
              <button className={styles.btnOutline}
                onClick={() => navigate("/expense/submit")}>
                + Submit Expense
              </button>
            </div>
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🧾</div>
              <p className={styles.emptyTitle}>Expense module</p>
              <p className={styles.emptySub}>
                Upload bills and track reimbursements for your travel expenses.
              </p>
              <button className={styles.btnPrimary}
                onClick={() => navigate("/expense/submit")}>
                Submit New Expense
              </button>
            </div>
          </div>
        )}

        {/* APPROVALS (HR/Admin only) */}
        {activeTab === "approvals" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Pending Approvals</h2>
            </div>
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📋</div>
              <p className={styles.emptyTitle}>Approval queue</p>
              <p className={styles.emptySub}>
                All pending travel requests and expense claims awaiting your review.
              </p>
            </div>
          </div>
        )}

        {/* ── QUICK ACTIONS ── */}
        <div className={styles.quickActions}>
          <h2 className={styles.sectionTitle}>Quick Actions</h2>
          <div className={styles.quickGrid}>
            {[
              { icon: "✈️", label: "Book Travel",       sub: "New travel request",     path: "/booking/new"    },
              { icon: "🧾", label: "Submit Expense",    sub: "Upload a bill",           path: "/expense/submit" },
              { icon: "📊", label: "View Reports",      sub: "Download expense report", path: "/reports"        },
              { icon: "👤", label: "My Profile",        sub: "Account details",         path: "/profile"        },
            ].map(q => (
              <div key={q.label} className={styles.quickCard}
                onClick={() => navigate(q.path)} role="button" tabIndex={0}
                onKeyDown={e => e.key === "Enter" && navigate(q.path)}>
                <span className={styles.quickIcon}>{q.icon}</span>
                <span className={styles.quickLabel}>{q.label}</span>
                <span className={styles.quickSub}>{q.sub}</span>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}
