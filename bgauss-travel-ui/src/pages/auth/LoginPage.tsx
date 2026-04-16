// src/pages/auth/LoginPage.tsx
// FIX 1: Scooter image — use a static import so Vite bundles it correctly.
//         The path /uploads/bg-img/Bg0-scooty-LOeV6t24.png does not exist
//         at runtime because Vite hashes asset filenames on build.
//         Place your image at: src/assets/bg-scooty.png
//         Then import it here — Vite will resolve the hashed URL automatically.
//
// FIX 2: Removed duplicate msalInstance.initialize() call.
//         main.tsx already initializes MSAL before mounting React.
//         useMsalLogin handles handleRedirectPromise() once.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin, type MsUser } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import styles from "./LoginPage.module.css";

// ── OPTION A: Import the image (recommended) ──────────────────────────────────
// Place your scooter image at: bgauss-travel-ui/src/assets/bg-scooty.png
// Then uncomment the line below:
// import scooterImg from "../../assets/bg-scooty.png";
//
// ── OPTION B: Put image in public folder (easier for production) ──────────────
// Place file at: bgauss-travel-ui/public/bg-scooty.png
// Then use: const scooterImg = "/bg-scooty.png";
// This file will be served at http://your-ip/bg-scooty.png in production.
//
// For now we use Option B (public folder) so it works immediately:
const scooterImg = "/bg-scooty.png";

interface LoginPageProps {
  onSuccess?: (user: MsUser) => void;
}

const MicrosoftLogo = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" fill="none" style={{ flexShrink: 0 }}>
    <rect x="1"  y="1"  width="9" height="9" fill="#f25022" />
    <rect x="11" y="1"  width="9" height="9" fill="#7fba00" />
    <rect x="1"  y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

const FEATURES = [
  { icon: "✈️", label: "Travel Booking",  sub: "Flight, train, cab, hotel"  },
  { icon: "🧾", label: "Expense Claims",  sub: "Upload bills instantly"     },
  { icon: "⚡", label: "Real-time HR",    sub: "Instant notifications"      },
];

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const navigate = useNavigate();

  const handleSuccess = (user: MsUser) => {
    onSuccess?.(user);
    navigate("/dashboard", { replace: true });
  };

  const { signIn, loading, error, msalReady } = useMsalLogin(handleSuccess);

  // If already logged in, skip to dashboard immediately
  useEffect(() => {
    if (localStorage.getItem("jwt_token")) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  return (
    <div className={styles.page}>
      <CommonNavbar />

      <div className={styles.viewport}>
        <div className={styles.shell}>

          {/* ── LEFT — scooter image panel ── */}
          <aside className={styles.left}>
            <img
              src={scooterImg}
              className={styles.scooterImg}
              alt="BGauss scooter"
              // Fallback: if image fails to load, show a dark background
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className={styles.leftOverlay} />

            <div className={styles.brandBadge}>
              <div className={styles.brandIcon}>BG</div>
              <div>
                <div className={styles.brandName}>BGauss Travel</div>
                <div className={styles.brandSub}>Employee Portal</div>
              </div>
            </div>

            <div className={styles.leftBottom}>
              <h1 className={styles.heroH1}>
                Travel smarter,<br />
                <span className={styles.heroAccent}>expense faster.</span>
              </h1>
              <p className={styles.heroSub}>
                Book travel, submit bills, and get reimbursed — all in one place.
              </p>
            </div>
          </aside>

          {/* ── RIGHT — sign-in form ── */}
          <main className={styles.right}>
            <div className={styles.formWrap}>

              <div className={styles.formHeader}>
                <span className={styles.formEyebrow}>Secure sign-in</span>
                <h2 className={styles.formTitle}>Welcome back</h2>
                <p className={styles.formDesc}>
                  Sign in with your BGauss Microsoft 365 account to access travel booking and expense management.
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
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8"  x2="12"   y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span className={styles.errorText}>{error}</span>
                </div>
              )}

              <button
                type="button"
                className={styles.msBtn}
                onClick={signIn}
                disabled={loading || !msalReady}
              >
                {loading ? (
                  <><span className={styles.spinner} />Signing in…</>
                ) : (
                  <><MicrosoftLogo />Sign in with Microsoft 365</>
                )}
              </button>

              <p className={styles.signInHint}>
                You will be asked for your BGauss email and password each time you sign in.
              </p>

              <div className={styles.divider}>
                <span className={styles.dividerLine} />
                <span className={styles.dividerText}>What&apos;s included</span>
                <span className={styles.dividerLine} />
              </div>

              <div className={styles.grid}>
                {FEATURES.map(f => (
                  <div key={f.label} className={styles.gridItem}>
                    <span className={styles.gridEmoji}>{f.icon}</span>
                    <span className={styles.gridLabel}>{f.label}</span>
                  </div>
                ))}
              </div>

              <p className={styles.footerNote}>
                Only <strong>@bgauss.com</strong> Microsoft accounts are permitted.<br />
                Contact <a href="mailto:it@bgauss.com">it@bgauss.com</a> for access.
              </p>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
