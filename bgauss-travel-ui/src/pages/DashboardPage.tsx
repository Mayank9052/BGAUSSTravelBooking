import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../auth/useMsalLogin";
import CommonNavbar from "../components/layout/CommonNavbar";
import styles from "./DashboardPage.module.css";

interface TravelRequest {
  requestId: number;
  requestCode: string;
  destination: string;
  transportType: string;
  status: string;
  departureDate: string;
  returnDate: string;
  estimatedAmount?: number;
}

interface ExpenseSummary {
  totalPending: number;
  totalApproved: number;
  totalReimbursed: number;
  pendingCount: number;
  approvedCount: number;
}

const authHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("jwt_token")}`,
});

const STATUS_COLORS: Record<string, string> = {
  Draft: styles.statusDraft,
  Submitted: styles.statusSubmitted,
  UnderReview: styles.statusReview,
  Approved: styles.statusApproved,
  Rejected: styles.statusRejected,
  Reimbursed: styles.statusReimbursed,
  Pending: styles.statusSubmitted,
};

const TRANSPORT_ICONS: Record<string, string> = {
  Flight: "✈️",
  Train: "🚂",
  Cab: "🚕",
  Hotel: "🏨",
  Multiple: "🔀",
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { signOut } = useMsalLogin();

  const fullName = localStorage.getItem("full_name") ?? "Employee";
  const role = localStorage.getItem("role") ?? "Employee";
  const email = localStorage.getItem("email") ?? "";
  const department = localStorage.getItem("department") ?? "";
  const empCode = localStorage.getItem("employee_code") ?? "";

  const initials =
    fullName
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "ME";

  const [requests, setRequests] = useState<TravelRequest[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"trips" | "expenses" | "approvals">("trips");

  useEffect(() => {
    if (!localStorage.getItem("jwt_token")) {
      navigate("/login", { replace: true });
      return;
    }
    void loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setLoading(true);
    try {
      const trRes = await fetch("/api/Booking/my", { headers: authHeader() });
      if (trRes.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      if (trRes.ok) setRequests((await trRes.json()) as TravelRequest[]);

      const expRes = await fetch("/api/Expense/summary", { headers: authHeader() });
      if (expRes.ok) setSummary((await expRes.json()) as ExpenseSummary);
    } catch {
      // Keep the dashboard usable with empty states if the API is unavailable.
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const navItems = [
    {
      id: "trips",
      label: "My Trips",
      active: activeTab === "trips",
      onClick: () => setActiveTab("trips"),
    },
    {
      id: "expenses",
      label: "Expenses",
      active: activeTab === "expenses",
      onClick: () => setActiveTab("expenses"),
    },
    ...(role === "HR" || role === "Admin"
      ? [
          {
            id: "approvals",
            label: "Approvals",
            active: activeTab === "approvals",
            onClick: () => setActiveTab("approvals"),
          },
        ]
      : []),
  ];

  return (
    <div className={styles.page}>
      <CommonNavbar
        navItems={navItems}
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={handleSignOut}
      />

      <main className={styles.main}>
        <div className={styles.welcomeBanner}>
          <div className={styles.welcomeText}>
            <h1 className={styles.welcomeH1}>Good day, {fullName.split(" ")[0]} 👋</h1>
            <p className={styles.welcomeSub}>
              {email} · {department} · {empCode}
            </p>
          </div>
          <div className={styles.welcomeActions}>
            <button className={styles.btnPrimary} onClick={() => navigate("/booking/new")}>
              + New Travel Request
            </button>
            <button className={styles.btnSecondary} onClick={() => navigate("/expense/submit")}>
              Submit Expense
            </button>
          </div>
        </div>

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
          ].map((stat) => (
            <div key={stat.label} className={`${styles.statCard} ${stat.color}`}>
              <div className={styles.statIcon}>{stat.icon}</div>
              <div className={styles.statValue}>{stat.value}</div>
              <div className={styles.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Travel Request List</h2>
          </div>

          {loading ? (
            <div className={styles.loadingRow}>
              {[1, 2, 3].map((item) => (
                <div key={item} className={styles.skeleton} />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>✈️</div>
              <p className={styles.emptyTitle}>No travel requests yet</p>
              <p className={styles.emptySub}>Create your first travel request to get started</p>
            </div>
          ) : (
            <div className={styles.tripsList}>
              {requests.map((request) => (
                <div key={request.requestId} className={styles.tripCard}>
                  <div className={styles.tripIcon}>
                    {TRANSPORT_ICONS[request.transportType] ?? "🚗"}
                  </div>
                  <div className={styles.tripInfo}>
                    <div className={styles.tripCode}>{request.requestCode}</div>
                    <div className={styles.tripDest}>{request.destination}</div>
                    <div className={styles.tripDates}>
                      {request.departureDate} → {request.returnDate}
                    </div>
                  </div>
                  <div className={styles.tripRight}>
                    <span className={`${styles.statusBadge} ${STATUS_COLORS[request.status] ?? ""}`}>
                      {request.status}
                    </span>
                    {request.estimatedAmount != null && (
                      <div className={styles.tripAmount}>
                        ₹{request.estimatedAmount.toLocaleString("en-IN")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeTab === "expenses" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Expense Claims</h2>
              <button className={styles.btnOutline} onClick={() => navigate("/expense/submit")}>
                + Submit Expense
              </button>
            </div>
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🧾</div>
              <p className={styles.emptyTitle}>Expense module</p>
              <p className={styles.emptySub}>
                Upload bills and track reimbursements for your travel expenses.
              </p>
              <button className={styles.btnPrimary} onClick={() => navigate("/expense/submit")}>
                Submit New Expense
              </button>
            </div>
          </div>
        )}

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

        <div className={styles.quickActions}>
          <h2 className={styles.sectionTitle}>Quick Actions</h2>
          <div className={styles.quickGrid}>
            {[
              { icon: "✈️", label: "Book Travel", sub: "New travel request", path: "/booking/new" },
              { icon: "🧾", label: "Submit Expense", sub: "Upload a bill", path: "/expense/submit" },
              { icon: "📊", label: "View Reports", sub: "Download expense report", path: "/reports" },
              { icon: "👤", label: "My Profile", sub: "Account details", path: "/profile" },
            ].map((quickAction) => (
              <div
                key={quickAction.label}
                className={styles.quickCard}
                onClick={() => navigate(quickAction.path)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => event.key === "Enter" && navigate(quickAction.path)}
              >
                <span className={styles.quickIcon}>{quickAction.icon}</span>
                <span className={styles.quickLabel}>{quickAction.label}</span>
                <span className={styles.quickSub}>{quickAction.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
