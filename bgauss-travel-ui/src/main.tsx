import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./auth/msalConfig";
import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import TravelRequestOptionsPage from "./pages/travel-requests/TravelRequestOptionsPage";
import TravelRequestFormPage from "./pages/travel-requests/TravelRequestFormPage";
import ExpenseSubmitPage from "./pages/expenses/ExpenseSubmitPage";
import ReportsPage from "./pages/reports/ReportsPage";
import ProfilePage from "./pages/profile/ProfilePage";
import PrivateRoute from "./components/PrivateRoute";
import "./index.css";

msalInstance
  .initialize()
  .then(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <MsalProvider instance={msalInstance}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
              <Route path="/dashboard/*" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
              <Route
                path="/booking/new"
                element={<PrivateRoute><TravelRequestOptionsPage /></PrivateRoute>}
              />
              <Route
                path="/booking/new/:requestType"
                element={<PrivateRoute><TravelRequestFormPage /></PrivateRoute>}
              />
              <Route
                path="/expense/submit"
                element={<PrivateRoute><ExpenseSubmitPage /></PrivateRoute>}
              />
              <Route path="/reports" element={<PrivateRoute><ReportsPage /></PrivateRoute>} />
              <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </MsalProvider>
      </React.StrictMode>
    );
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("MSAL initialization failed:", msg);
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
