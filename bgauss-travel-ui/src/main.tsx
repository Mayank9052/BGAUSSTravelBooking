// src/main.tsx
// CRITICAL ORDER:
//   1. msalInstance.initialize() — ONCE, before anything renders
//   2. MsalProvider receives the already-initialized instance
//   3. useMsalLogin() only calls handleRedirectPromise() — NOT initialize()
//
// DO NOT call msalInstance.initialize() anywhere else (not in useMsalLogin, not in hooks)

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./auth/msalConfig";
import LoginPage          from "./pages/auth/LoginPage";
import DashboardPage      from "./pages/dashboard/DashboardPage";
import TravelRequestOptionsPage from "./pages/travel-requests/TravelRequestOptionsPage";
import TravelRequestFormPage    from "./pages/travel-requests/TravelRequestFormPage";
import ExpenseSubmitPage  from "./pages/expenses/ExpenseSubmitPage";
import ReportsPage        from "./pages/reports/ReportsPage";
import ProfilePage        from "./pages/profile/ProfilePage";
import PrivateRoute       from "./components/PrivateRoute";
import type { MsUser }    from "./auth/useMsalLogin";
import "./index.css";

function handleLoginSuccess(user: MsUser): void {
  console.log("✅ Login succeeded:", user.displayName, "| Role:", user.role);
}

// ── Step 1: Initialize MSAL ONCE before mounting React ────────────────────────
msalInstance
  .initialize()
  .then(() => {
    // ── Step 2: Mount React only after MSAL is ready ─────────────────────────
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        {/* Step 3: Pass the already-initialized instance to MsalProvider */}
        <MsalProvider instance={msalInstance}>
          <BrowserRouter>
            <Routes>

              {/* ── Public routes ── */}
              <Route path="/"      element={<LoginPage onSuccess={handleLoginSuccess} />} />
              <Route path="/login" element={<LoginPage onSuccess={handleLoginSuccess} />} />

              {/* ── Protected routes ── */}
              {/* PrivateRoute only checks localStorage — it does NOT run MSAL */}
              <Route path="/dashboard"   element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
              <Route path="/dashboard/*" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />

              <Route path="/booking/new"
                element={<PrivateRoute><TravelRequestOptionsPage /></PrivateRoute>} />

              <Route path="/booking/new/:requestType"
                element={<PrivateRoute><TravelRequestFormPage /></PrivateRoute>} />

              <Route path="/expense/submit" element={<PrivateRoute><ExpenseSubmitPage /></PrivateRoute>} />
              <Route path="/reports"        element={<PrivateRoute><ReportsPage /></PrivateRoute>} />
              <Route path="/profile"        element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
              {/* ── Fallback ── */}
              <Route path="*" element={<Navigate to="/login" replace />} />
              

            </Routes>
          </BrowserRouter>
        </MsalProvider>
      </React.StrictMode>
    );
  })
  .catch((err: unknown) => {
    // MSAL failed to initialize — show a plain error so the user isn't stuck
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ MSAL initialization failed:", msg);
    document.getElementById("root")!.innerHTML = `
      <div style="font-family:sans-serif;padding:40px;color:#dc2626;max-width:600px;margin:auto">
        <h2>Authentication setup failed</h2>
        <p style="color:#374151">${msg}</p>
        <hr style="margin:20px 0;border-color:#e5e7eb"/>
        <p style="font-size:13px;color:#6b7280">
          Checklist:<br/>
          1. Azure App Registration → Authentication → Platform must be <strong>Single-page application</strong><br/>
          2. Redirect URI must match exactly: <code>${window.location.origin}</code><br/>
          3. Client ID and Tenant ID must be correct in msalConfig.ts
        </p>
      </div>`;
  });