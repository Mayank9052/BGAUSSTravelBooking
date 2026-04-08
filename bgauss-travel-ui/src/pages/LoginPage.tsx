// src/pages/LoginPage.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin, type MsUser } from "../auth/useMsalLogin";
import styles from "./LoginPage.module.css";

interface LoginPageProps {
  onSuccess?: (user: MsUser) => void;
}

const MicrosoftLogo = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" fill="none" style={{ flexShrink: 0 }}>
    <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
    <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
    <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
  </svg>
);

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const navigate = useNavigate();

  const handleSuccess = (user: MsUser) => {
    onSuccess?.(user);
    navigate("/dashboard", { replace: true });
  };

  const { signIn, loading, error, msalReady, user } = useMsalLogin(handleSuccess);

  // Already logged in — redirect immediately
  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  const FEATURES = [
    { icon: "✈️", label: "Travel Booking", sub: "Flight, train, cab, hotel" },
    { icon: "🧾", label: "Expense Claims",  sub: "Upload bills instantly"    },
    { icon: "⚡", label: "Real-time HR",    sub: "Instant notifications"     },
  ];

  return (
    <div className={styles.page}>
      <aside className={styles.left}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}><span>BG</span></div>
          <div className={styles.brandText}>
            <span className={styles.brandName}>BGauss</span>
            <span className={styles.brandSub}>Travel Portal</span>
          </div>
        </div>
        <div className={styles.heroBlock}>
          <div className={styles.heroLabel}>
            <span className={styles.heroDot} />
            Employee portal
          </div>
          <h1 className={styles.heroH1}>
            Travel smarter,
            <span>expense faster.</span>
          </h1>
          <p className={styles.heroSub}>
            Book travel, upload bills and get reimbursed — all in one place
            with real-time HR approvals.
          </p>
        </div>
        <div className={styles.features}>
          {FEATURES.map(f => (
            <div key={f.label} className={styles.featurePill}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <div className={styles.featureText}>
                <strong>{f.label}</strong>
                <span>{f.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className={styles.right}>
        <div className={styles.formWrap}>
          <div className={styles.formHeader}>
            <span className={styles.formEyebrow}>Secure sign-in</span>
            <h2 className={styles.formTitle}>Welcome back</h2>
            <p className={styles.formDesc}>
              Sign in with your BGauss Microsoft 365 account to access
              travel booking and expense management.
            </p>
          </div>

          {!msalReady && !error && (
            <div className={styles.initRow}>
              <span className={styles.initSpinner} />
              <span className={styles.initText}>Initializing Microsoft sign-in…</span>
            </div>
          )}

          {error && (
            <div className={styles.errorBanner}>
              <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span className={styles.errorText}>
                {error.includes("9002326")
                  ? "Azure config issue: register http://localhost:5173 under 'Single-Page Application' platform (not Web) in Azure Portal → Authentication."
                  : error}
              </span>
            </div>
          )}

          <button
            className={styles.msBtn}
            onClick={signIn}
            disabled={loading || !msalReady}
          >
            {loading
              ? <><span className={styles.spinner} />Signing in…</>
              : <><MicrosoftLogo />Sign in with Microsoft 365</>
            }
          </button>

          <div className={styles.divider}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerText}>What's included</span>
            <span className={styles.dividerLine} />
          </div>

          <div className={styles.grid}>
            {[
              { emoji: "✈", label: "Travel Booking" },
              { emoji: "🧾", label: "Expense Claims" },
              { emoji: "⚡", label: "Real-time HR"   },
            ].map(item => (
              <div key={item.label} className={styles.gridItem}>
                <span className={styles.gridEmoji}>{item.emoji}</span>
                <span className={styles.gridLabel}>{item.label}</span>
              </div>
            ))}
          </div>

          <p className={styles.footerNote}>
            Only <strong>@bgauss.com</strong> Microsoft accounts are permitted.
            <br />
            Contact <a href="mailto:it@bgauss.com">it@bgauss.com</a> for access.
          </p>
        </div>
      </main>
    </div>
  );
}