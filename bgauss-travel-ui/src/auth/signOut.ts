// src/auth/signOut.ts
// Simple sign-out function that does NOT trigger useMsalLogin or handleRedirectPromise.
// Use this in all protected pages (Dashboard, Booking, Expense, etc.)
// ONLY LoginPage should use the full useMsalLogin() hook.

import { msalInstance } from "./msalConfig";

const APP_SESSION_KEYS = [
  "jwt_token", "employee_id", "full_name", "email", "role",
  "employee_code", "department", "designation", "reporting_manager", "contact_number","user_city", "login_time",
] as const;

export function signOutUser(): void {
  APP_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem("user_city"); // added
  msalInstance.setActiveAccount(null);
  window.location.replace("/login");
}