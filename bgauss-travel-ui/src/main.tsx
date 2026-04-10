// src/main.tsx
// FIXED: msalInstance.initialize() must complete BEFORE MsalProvider renders.
// We await it here so the provider never receives an uninitialized instance.

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./auth/msalConfig";
import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import TravelRequestOptionsPage from "./pages/travel-requests/TravelRequestOptionsPage";
import TravelRequestFormPage from "./pages/travel-requests/TravelRequestFormPage";
import type { MsUser } from "./auth/useMsalLogin";
import "./index.css";
import PrivateRoute from "./components/PrivateRoute";
import ExpenseSubmitPage from "./pages/expenses/ExpenseSubmitPage";
import ReportsPage       from "./pages/reports/ReportsPage";
import ProfilePage       from "./pages/profile/ProfilePage";

// Guard: redirect to /login if no JWT token in localStorage
// function PrivateRoute({ children }: { children: React.ReactNode }) {
//   const token = localStorage.getItem("jwt_token");
//   return token ? <>{children}</> : <Navigate to="/login" replace />;
// }

function handleLoginSuccess(user: MsUser): void {
  console.log("Login succeeded:", user.displayName, user.role);
  // React Router navigation happens inside LoginPage via onSuccess prop
}

// ── Initialize MSAL before mounting React ─────────────────────
// This is the correct order: initialize → then render MsalProvider
msalInstance.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route
              path="/"
              element={<LoginPage onSuccess={handleLoginSuccess} />}
            />
            <Route
              path="/login"
              element={<LoginPage onSuccess={handleLoginSuccess} />}
            />

            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <DashboardPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/dashboard/*"
              element={
                <PrivateRoute>
                  <DashboardPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/booking/new"
              element={
                <PrivateRoute>
                  <TravelRequestOptionsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/booking/new/:requestType"
              element={
                <PrivateRoute>
                  <TravelRequestFormPage />
                </PrivateRoute>
              }
            />

            <Route path="/expense/submit" element={<ExpenseSubmitPage />} />
            <Route path="/reports"        element={<ReportsPage />} />
            <Route path="/profile"        element={<ProfilePage />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </MsalProvider>
    </React.StrictMode>
  );
}).catch((err) => {
  // If MSAL fails to initialize, show a plain error page
  document.getElementById("root")!.innerHTML = `
    <div style="font-family:sans-serif;padding:40px;color:#dc2626">
      <h2>Auth initialization failed</h2>
      <p>${String(err)}</p>
      <p>Check your Azure app registration and ensure the redirect URI 
         <code>http://localhost:5173</code> is registered under the 
         <strong>Single-Page Application</strong> platform.</p>
    </div>`;
});
